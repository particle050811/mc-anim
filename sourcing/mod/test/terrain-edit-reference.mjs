// terrain-edit-test.sh 的离线一半：用离线版（选种工具的 生成修整.mjs，跑在 deepslate 上；目录由环境变量 MCAI_SEED_TOOLS 给，现在是旧项目 参考模型库/工具/选种/）算一批随机点上的值，
// 写给 TerrainEditTest.java 拿游戏里的实现（取材 mod 的 mcai.terrain）逐位比。由 terrain-edit-test.sh 调，不单独用。
//   node terrain-edit-reference.mjs <用例目录> <真包目录> <输出目录>
// 输出两个文件，一行一个点「函数 x y z 值的 64 位十六进制」：
//   用例.txt：<用例目录>（test/terrain-edit-cases/）里每个密度函数在 points.json 的框里取点；
//   真包.txt：<真包目录>（sourcing/datapacks/主世界修整/）叠在史诗地形上（地形.mjs 的 MCAI_PACKS），每个密度函数在每个区域附近取点，种子 116；
//     也核对离线预览（地形.mjs）算的大陆度和游戏一致（只到 1e-5，原因见 TerrainEditTest 第 5 项）。
// bad-cases.json 里的每一条离线版都必须报错，有一条读进来了就退出码 1。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

if (!process.env.MCAI_SEED_TOOLS) { console.error('要设 MCAI_SEED_TOOLS：选种工具目录（里面有 生成修整.mjs、地形.mjs，npm install 过 deepslate）'); process.exit(2) }
const seedTools = path.resolve(process.env.MCAI_SEED_TOOLS)
const [caseDir, realPack, outPath] = process.argv.slice(2)
if (!outPath) { console.error('用法：node terrain-edit-reference.mjs <用例目录> <真包目录> <输出目录>'); process.exit(2) }

// 和 生成修整.mjs 里的裸名 'deepslate' 是同一个文件，才是同一份 DensityFunction（registerEditTypes() 改的是它的 fromJson）
const { DensityFunction, Identifier, NoiseGeneratorSettings, NoiseParameters, RandomState, WorldgenRegistries } =
  await import(pathToFileURL(path.join(seedTools, 'node_modules/deepslate/lib/index.js')))
const { registerEditTypes } = await import(pathToFileURL(path.join(seedTools, '生成修整.mjs')))
process.env.MCAI_PACKS = path.resolve(realPack)
const { loadTerrain } = await import(pathToFileURL(path.join(seedTools, '地形.mjs')))

// 和 Java 那边的 java.util.Random 无关：点由这里定，Java 读同一个文件
function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const float64View = new DataView(new ArrayBuffer(8))
const float64Hex = v => { float64View.setFloat64(0, v); return float64View.getBigUint64(0).toString(16).padStart(16, '0') }

function filesOfKind(d, resourceKind) {
  const o = []
  const dataRoot = path.join(d, 'data')
  for (const ns of fs.readdirSync(dataRoot)) {
    const b = path.join(dataRoot, ns, 'worldgen', resourceKind)
    const walk = p => { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); fs.statSync(q).isDirectory() ? walk(q) : f.endsWith('.json') && o.push([ns + ':' + path.relative(b, q).replace(/\.json$/, ''), JSON.parse(fs.readFileSync(q, 'utf8'))]) } }
    if (fs.existsSync(b)) walk(b)
  }
  return o.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
}

// 真包：地形.mjs 把 原版 + 史诗地形 + 真包 注册进 deepslate 的注册表（同时核对覆盖文件和原文件一致）
const terrain = loadTerrain()
registerEditTypes()
// 用例：噪声和密度函数也注册进同一张表（命名空间 mcai_test，和真包的不重）
for (const [id, j] of filesOfKind(caseDir, 'noise')) WorldgenRegistries.NOISE.register(Identifier.parse(id), NoiseParameters.fromJson(j))
for (const [id, j] of filesOfKind(caseDir, 'density_function')) WorldgenRegistries.DENSITY_FUNCTION.register(Identifier.parse(id), () => DensityFunction.fromJson(j))

// 和游戏一样按种子接上噪声（RandomState 的 visitor），再在点上求值
function evaluate(rs, settings, id, samples, out) {
  const fn = DensityFunction.fromJson(id).mapAll(rs.createVisitor(settings.noise, settings.legacyRandomSource))
  for (const [x, y, z] of samples) out.push(`${id} ${x} ${y} ${z} ${float64Hex(fn.compute(DensityFunction.context(x, y, z)))}`)
}
// 对齐 4 格（真包用）：游戏生成区块时 flat_cache 只在 4 格一个的格点上算，deepslate 照这个做，Java 那边不经区块缓存，对齐了才是同一个值
function samplePoint(boxes, n, random, alignToGrid = false) {
  const samples = [], m = alignToGrid ? ~3 : ~0
  for (let k = 0; k < n; k++) {
    const [x0, z0, x1, z1] = boxes[k % boxes.length]
    samples.push([Math.floor(x0 + random() * (x1 - x0)) & m, Math.floor(-64 + random() * 384), Math.floor(z0 + random() * (z1 - z0)) & m])
  }
  return samples
}
fs.mkdirSync(outPath, { recursive: true })

const points = JSON.parse(fs.readFileSync(path.join(caseDir, 'points.json'), 'utf8'))
{
  const settings = NoiseGeneratorSettings.create({})
  const rs = new RandomState(settings, BigInt(points.种子))
  const out = [], random = rng(20261005)
  for (const [id] of filesOfKind(caseDir, 'density_function')) {
    const boxes = points.框[id.replace(/^mcai_test:/, '')]
    if (!boxes) throw new Error('points.json 里没有 ' + id + ' 的框')
    evaluate(rs, settings, id, samplePoint(boxes, points.每个函数点数, random), out)
  }
  fs.writeFileSync(path.join(outPath, '用例.txt'), out.join('\n') + '\n')
  console.log(`离线版：用例 ${out.length} 个点`)
}

{
  // 每个区域附近一个框（形状的包围盒外扩 falloff 和 2 km），包里每个密度函数在所有框里取点
  const bounds = s => s.type === 'circle' || s.type === 'sector' ? [s.center[0] - s.radius, s.center[1] - s.radius, s.center[0] + s.radius, s.center[1] + s.radius]
    : [Math.min(...s.points.map(p => p[0])) - (s.width ?? 0) / 2, Math.min(...s.points.map(p => p[1])) - (s.width ?? 0) / 2,
       Math.max(...s.points.map(p => p[0])) + (s.width ?? 0) / 2, Math.max(...s.points.map(p => p[1])) + (s.width ?? 0) / 2]
  const densityFunctions = filesOfKind(realPack, 'density_function')
  const boxes = densityFunctions.filter(([, j]) => j.type === 'mcai:region').map(([, j]) => { const [a, b, c, d] = bounds(j.shape), m = j.falloff + 2000; return [a - m, b - m, c + m, d + m] })
  if (!boxes.length) throw new Error(realPack + ' 里没有 mcai:region')
  const rs = new RandomState(terrain.settings, 116n)
  const out = [], random = rng(116)
  const samples = samplePoint(boxes, 4000 * boxes.length, random, true)
  for (const [id] of densityFunctions) evaluate(rs, terrain.settings, id, samples, out)
  fs.writeFileSync(path.join(outPath, '真包.txt'), out.join('\n') + '\n')
  console.log(`离线版：真包 ${densityFunctions.length} 个密度函数 × ${samples.length} 个点`)
}

{
  const { badCases } = JSON.parse(fs.readFileSync(path.join(caseDir, 'bad-cases.json'), 'utf8'))
  let missed = 0
  for (const [caseName, j] of badCases) {
    try {
      // 引用要到接噪声、求范围时才去查，所以连 mapAll 一起做
      const settings = NoiseGeneratorSettings.create({}), rs = new RandomState(settings, 1n)
      DensityFunction.fromJson(j).mapAll(rs.createVisitor(settings.noise, false))
      console.log('不对：离线版读进了错例「' + caseName + '」'); missed++
    } catch { }
  }
  console.log(`离线版：错例 ${badCases.length} 条，${missed ? missed + ' 条没报错' : '都报错'}`)
  if (missed) process.exit(1)
}
