// 地形修整测试.sh 的离线一半：用离线版（参考模型库/工具/选种/生成修整.mjs，跑在 deepslate 上）算一批随机点上的值，
// 写给 TerrainEditTest.java 拿游戏里的实现（取材 mod 的 mcai.terrain）逐位比。由 地形修整测试.sh 调，不单独用。
//   node 地形修整对照.mjs <用例目录> <真包目录> <输出目录>
// 输出两个文件，一行一个点「函数 x y z 值的 64 位十六进制」：
//   用例.txt：<用例目录>（测试/地形修整用例/）里每个密度函数在 取点.json 的框里取点；
//   真包.txt：<真包目录>（取材mod/数据包/主世界修整/）叠在史诗地形上（地形.mjs 的 MCAI_PACKS），每个密度函数在每个区域附近取点，种子 116；
//     也核对离线预览（地形.mjs）算的大陆度和游戏一致（只到 1e-5，原因见 TerrainEditTest 第 5 项）。
// 错例.json 里的每一条离线版都必须报错，有一条读进来了就退出码 1。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const 选种 = path.resolve(HERE, '../../参考模型库/工具/选种')
const [用例, 真包, 输出] = process.argv.slice(2)
if (!输出) { console.error('用法：node 地形修整对照.mjs <用例目录> <真包目录> <输出目录>'); process.exit(2) }

// 和 生成修整.mjs 里的裸名 'deepslate' 是同一个文件，才是同一份 DensityFunction（registerEditTypes() 改的是它的 fromJson）
const { DensityFunction, Identifier, NoiseGeneratorSettings, NoiseParameters, RandomState, WorldgenRegistries } =
  await import(pathToFileURL(path.join(选种, 'node_modules/deepslate/lib/index.js')))
const { registerEditTypes } = await import(pathToFileURL(path.join(选种, '生成修整.mjs')))
process.env.MCAI_PACKS = path.resolve(真包)
const { loadTerrain } = await import(pathToFileURL(path.join(选种, '地形.mjs')))

// 和 Java 那边的 java.util.Random 无关：点由这里定，Java 读同一个文件
function 随机(种) {
  let a = 种 >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const 位 = new DataView(new ArrayBuffer(8))
const 十六 = v => { 位.setFloat64(0, v); return 位.getBigUint64(0).toString(16).padStart(16, '0') }

function 文件(d, 种类) {
  const o = []
  const 根 = path.join(d, 'data')
  for (const ns of fs.readdirSync(根)) {
    const b = path.join(根, ns, 'worldgen', 种类)
    const walk = p => { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); fs.statSync(q).isDirectory() ? walk(q) : f.endsWith('.json') && o.push([ns + ':' + path.relative(b, q).replace(/\.json$/, ''), JSON.parse(fs.readFileSync(q, 'utf8'))]) } }
    if (fs.existsSync(b)) walk(b)
  }
  return o.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
}

// 真包：地形.mjs 把 原版 + 史诗地形 + 真包 注册进 deepslate 的注册表（同时核对覆盖文件和原文件一致）
const 地形 = loadTerrain()
registerEditTypes()
// 用例：噪声和密度函数也注册进同一张表（命名空间 mcai_test，和真包的不重）
for (const [id, j] of 文件(用例, 'noise')) WorldgenRegistries.NOISE.register(Identifier.parse(id), NoiseParameters.fromJson(j))
for (const [id, j] of 文件(用例, 'density_function')) WorldgenRegistries.DENSITY_FUNCTION.register(Identifier.parse(id), () => DensityFunction.fromJson(j))

// 和游戏一样按种子接上噪声（RandomState 的 visitor），再在点上求值
function 求值(rs, settings, id, 点, out) {
  const fn = DensityFunction.fromJson(id).mapAll(rs.createVisitor(settings.noise, settings.legacyRandomSource))
  for (const [x, y, z] of 点) out.push(`${id} ${x} ${y} ${z} ${十六(fn.compute(DensityFunction.context(x, y, z)))}`)
}
// 对齐 4 格（真包用）：游戏生成区块时 flat_cache 只在 4 格一个的格点上算，deepslate 照这个做，Java 那边不经区块缓存，对齐了才是同一个值
function 取点(框们, n, 随, 对齐 = false) {
  const 点 = [], m = 对齐 ? ~3 : ~0
  for (let k = 0; k < n; k++) {
    const [x0, z0, x1, z1] = 框们[k % 框们.length]
    点.push([Math.floor(x0 + 随() * (x1 - x0)) & m, Math.floor(-64 + 随() * 384), Math.floor(z0 + 随() * (z1 - z0)) & m])
  }
  return 点
}
fs.mkdirSync(输出, { recursive: true })

const 取 = JSON.parse(fs.readFileSync(path.join(用例, '取点.json'), 'utf8'))
{
  const settings = NoiseGeneratorSettings.create({})
  const rs = new RandomState(settings, BigInt(取.种子))
  const out = [], 随 = 随机(20261005)
  for (const [id] of 文件(用例, 'density_function')) {
    const 框们 = 取.框[id.replace(/^mcai_test:/, '')]
    if (!框们) throw new Error('取点.json 里没有 ' + id + ' 的框')
    求值(rs, settings, id, 取点(框们, 取.每个函数点数, 随), out)
  }
  fs.writeFileSync(path.join(输出, '用例.txt'), out.join('\n') + '\n')
  console.log(`离线版：用例 ${out.length} 个点`)
}

{
  // 每个区域附近一个框（形状的包围盒外扩 falloff 和 2 km），包里每个密度函数在所有框里取点
  const 盒 = s => s.type === 'circle' || s.type === 'sector' ? [s.center[0] - s.radius, s.center[1] - s.radius, s.center[0] + s.radius, s.center[1] + s.radius]
    : [Math.min(...s.points.map(p => p[0])) - (s.width ?? 0) / 2, Math.min(...s.points.map(p => p[1])) - (s.width ?? 0) / 2,
       Math.max(...s.points.map(p => p[0])) + (s.width ?? 0) / 2, Math.max(...s.points.map(p => p[1])) + (s.width ?? 0) / 2]
  const 函数 = 文件(真包, 'density_function')
  const 框们 = 函数.filter(([, j]) => j.type === 'mcai:region').map(([, j]) => { const [a, b, c, d] = 盒(j.shape), m = j.falloff + 2000; return [a - m, b - m, c + m, d + m] })
  if (!框们.length) throw new Error(真包 + ' 里没有 mcai:region')
  const rs = new RandomState(地形.settings, 116n)
  const out = [], 随 = 随机(116)
  const 点 = 取点(框们, 4000 * 框们.length, 随, true)
  for (const [id] of 函数) 求值(rs, 地形.settings, id, 点, out)
  fs.writeFileSync(path.join(输出, '真包.txt'), out.join('\n') + '\n')
  console.log(`离线版：真包 ${函数.length} 个密度函数 × ${点.length} 个点`)
}

{
  const { 错例 } = JSON.parse(fs.readFileSync(path.join(用例, '错例.json'), 'utf8'))
  let 漏 = 0
  for (const [名, j] of 错例) {
    try {
      // 引用要到接噪声、求范围时才去查，所以连 mapAll 一起做
      const settings = NoiseGeneratorSettings.create({}), rs = new RandomState(settings, 1n)
      DensityFunction.fromJson(j).mapAll(rs.createVisitor(settings.noise, false))
      console.log('不对：离线版读进了错例「' + 名 + '」'); 漏++
    } catch { }
  }
  console.log(`离线版：错例 ${错例.length} 条，${漏 ? 漏 + ' 条没报错' : '都报错'}`)
  if (漏) process.exit(1)
}
