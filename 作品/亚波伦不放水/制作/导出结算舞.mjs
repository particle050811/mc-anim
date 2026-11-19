import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { encode } from 'fast-png';
import { build } from 'esbuild';
import { esbuildAliasPlugin } from 'mc-anim/接入/esbuild';
import { resolveAsset, readWorkAssetLock } from 'mc-anim/接入/资产锁';
import { parseDanceRevision } from '../角色/动作/Blender舞轨.ts';

const work = path.resolve(import.meta.dirname, '..');
const root = path.resolve(work, '../..');
const revisionFile = path.join(work, '角色/动作/Blender修订.json');
const usage = `node 作品/亚波伦不放水/制作/导出结算舞.mjs <bundle.json>
  --check <修订.json>   只校验
  --import <修订.json>  校验通过后替换正片的 Blender修订.json
  局部 Bedrock 绝对通道，帧号 0..845；首尾外保持最近键，旋转按各轴最短弧。`;

const atomicWrite = (file, bytes) => {
  const temp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, bytes, { flag: 'wx' }); fs.renameSync(temp, file); }
  finally { fs.rmSync(temp, { force: true }); }
};

const run = async args => {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(usage); return; }
  const [mode, input] = args;
  const importing = mode === '--import' || mode === '--check';
  if (importing ? args.length !== 2 : args.length !== 1 || mode.startsWith('-')) throw new Error(usage);
  const lock = readWorkAssetLock(work);
  if (importing) {
    const { file } = resolveAsset('模型/角色/娘化亚波伦', lock);
    const names = new Set(JSON.parse(fs.readFileSync(file, 'utf8')).bones.map(bone => bone.name));
    const revision = parseDanceRevision(JSON.parse(fs.readFileSync(input, 'utf8')), names);
    if (mode === '--import') atomicWrite(revisionFile, JSON.stringify(revision, null, 2) + '\n');
    console.log(`校验通过，${Object.keys(revision.bones).length} 根修订骨骼。${mode === '--import' ? `已写入 ${revisionFile}` : '未写入。'}`);
    return;
  }
  const target = path.resolve(mode);
  if (path.extname(target) !== '.json' || target === revisionFile) throw new Error('导出目标须为独立的 bundle.json，不可覆盖修订文件');
  const assetPlugin = { name: 'locked-dance-assets', setup(build) {
    build.onResolve({ filter: /^asset:/ }, args => ({ path: args.path.slice(6), namespace: 'dance-asset' }));
    build.onLoad({ filter: /.*/, namespace: 'dance-asset' }, args => {
      const { file, entry } = resolveAsset(args.path, lock);
      if (entry.suffix === '.json') return { contents: fs.readFileSync(file), loader: 'json' };
      if (entry.suffix === '.png') return { contents: `export default "data:image/png;base64,${fs.readFileSync(file).toString('base64')}"` };
      throw new Error(`舞包不支持的资产：${args.path} (${entry.suffix})`);
    });
  } };
  const bundled = await build({ entryPoints: [path.join(import.meta.dirname, '结算舞数据.ts')], absWorkingDir: root,
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, jsx: 'automatic',
    plugins: [esbuildAliasPlugin(root), assetPlugin], logLevel: 'silent' });
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(loaded, loaded.exports, createRequire(import.meta.url));
  const { w: width, h: height, px: data } = loaded.exports.danceTexture();
  const atlas = encode({ width, height, data, channels: 4, depth: 8 });
  const stamp = createHash('sha256').update(atlas).digest('hex').slice(0, 12);
  const texturePath = path.join(path.dirname(target), `娘化亚波伦-${stamp}.png`);
  const bundle = loaded.exports.makeDanceBundle(texturePath);
  const bytes = JSON.stringify(bundle, (key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`舞包 ${key} 不是有限数值`);
    return value;
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  atomicWrite(texturePath, atlas);
  atomicWrite(target, bytes);
  console.log(`${target}：${bundle.bones.length} 根骨骼，${bundle.frameCount} 帧 @ ${bundle.fps} fps；贴图 ${texturePath}`);
};

try { await run(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
