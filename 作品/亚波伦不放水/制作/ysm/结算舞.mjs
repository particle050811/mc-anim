import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { esbuildAliasPlugin } from 'mc-anim/接入/esbuild';
import { readWorkAssetLock, resolveAsset } from 'mc-anim/接入/资产锁';
import { bindMotion } from './项目动作.ts';
import { partition, outlineSvg } from './拓扑.mjs';
import { decode as decodePng, encode as encodePng } from 'fast-png';

const work = path.resolve(import.meta.dirname, '../..');
const root = path.resolve(work, '../..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const encode = value => JSON.stringify(value, (key, item) => {
  if (typeof item === 'number' && !Number.isFinite(item)) throw Error(`${key} 非有限数字`);
  return item;
});

async function runtime() {
  const lock = readWorkAssetLock(work);
  const assets = { name: 'locked-input', setup(builder) {
    builder.onResolve({ filter: /^asset:/ }, args => ({ path: args.path.slice(6), namespace: 'locked' }));
    builder.onLoad({ filter: /.*/, namespace: 'locked' }, args => {
      const { file, entry } = resolveAsset(args.path, lock);
      if (entry.suffix === '.json') return { contents: fs.readFileSync(file), loader: 'json' };
      if (entry.suffix === '.png') return { contents: `export default ${JSON.stringify('data:image/png;base64,' + fs.readFileSync(file).toString('base64'))}` };
      throw Error(`不能读取 ${args.path} (${entry.suffix})`);
    });
  } };
  const result = await build({ entryPoints: [path.join(import.meta.dirname, '制作入口.ts')], absWorkingDir: root,
    write: false, bundle: true, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [esbuildAliasPlugin(root), assets] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  return mod.exports;
}

const channels = { rot: 'rotation', pos: 'position', scale: 'scale' };
function newTarget(input, output) {
  const target = path.join(fs.realpathSync(path.dirname(path.resolve(output))), path.basename(output));
  const source = fs.realpathSync(input);
  assert(target !== source && !target.startsWith(source + path.sep), '新产物不可嵌入输入目录');
  assert(!fs.existsSync(target), `目标已存在：${target}`);
}
const same = (left, right) => left.length === right.length && left.every((value, axis) => value === right[axis]);
function vector(pose, key) {
  const value = pose?.[key] ?? (key === 'scale' ? 1 : 0);
  const axes = Array.isArray(value) ? value : [value, value, value];
  assert(axes.length === 3 && axes.every(Number.isFinite), `非法姿势 ${key}`);
  return axes;
}

function compareSource(actual, expected, where) {
  if (typeof actual === 'number') assert(typeof expected === 'number' && Math.abs(actual - expected) < 0.00000501, `与锁定原模型不符：${where}`);
  else if (actual && typeof actual === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), where);
    for (const [key, value] of Object.entries(actual)) compareSource(value, expected[key], `${where}.${key}`);
  } else assert.equal(actual, expected, where);
}

function geometry(api, base, profile) {
  const model = structuredClone(base);
  compareSource(model, { texW: api.original.texW, texH: api.original.texH, bones: api.original.bones }, '原包');
  const live = api.GirlYaBoLunCreature.definition.model;
  assert.equal(profile, 'back-cubes', '此入口只做背肢，整模请用正片出包.py');
  const byName = new Map(live.bones.map(bone => [bone.name, bone]));
  for (const bone of model.bones) {
    const target = byName.get(bone.name);
    assert(target && target.parent === bone.parent, `骨架不匹配 ${bone.name}`);
    let current = target;
    while (current && !['c1', 'c2'].includes(current.name)) current = byName.get(current.parent);
    if (!current) continue;
    assert(!target.quads?.length, `${bone.name} 含 quad`);
    bone.pivot = target.pivot;
    if (target.rotation || bone.rotation) bone.rotation = target.rotation ?? [0, 0, 0];
    assert.equal(target.cubes?.length ?? 0, bone.cubes?.length ?? 0, `${bone.name} 方盒数变化，不能沿用逐盒原皮 UV`);
    if (bone.cubes) bone.cubes = target.cubes.map((cube, index) => ({ ...cube, uv: bone.cubes[index].uv }));
  }
  return model;
}

function capture(api, names, visit) {
  const { fps, frameCount } = api.danceFormat;
  const unbound = new Set();
  for (let frame = 0; frame < frameCount; frame++) {
    const rig = api.settlementRig(frame / fps);
    const pose = api.composeDanceLayers(rig.animation, rig.bonePose);
    for (const name of Object.keys(pose)) {
      if (!names.has(name) && Object.keys(pose[name]).length) unbound.add(name);
    }
    visit(frame, pose);
  }
  if (unbound.delete('Ribbon')) console.log('原动画的 Ribbon 没有同名模型骨；未烘入可见骨架，原 clip 留在源包');
  if (unbound.size) throw Error(`项目姿势引用未识别的模型外骨骼：${[...unbound].join('、')}`);
}

function tracks(names, produce) {
  const bones = Object.fromEntries([...names].map(name => [name, { rot: [], pos: [], scale: [] }]));
  produce((frame, pose) => {
    for (const name of names) for (const key of Object.keys(channels)) {
      const rows = bones[name][key];
      const values = vector(pose[name], key);
      if (!rows.length || !same(rows.at(-1).slice(1), values)) {
        if (rows.length && rows.at(-1)[0] < frame - 1) rows.push([frame - 1, ...rows.at(-1).slice(1)]);
        rows.push([frame, ...values]);
      }
    }
  });
  return bones;
}

function makeMotion(api, model) {
  const names = new Set(model.bones.map(bone => bone.name));
  const bones = tracks(names, visit => capture(api, names, visit));
  const { frameCount, fps } = api.danceFormat;
  for (const bone of Object.values(bones)) for (const rows of Object.values(bone)) for (const row of rows) row[0] /= fps;
  return { slot: 'extra', name: 'mc_anim_settlement', label: '结算舞', track: { lengthSec: frameCount / fps, loop: false, bones } };
}

function bake(api, base, out, profile) {
  newTarget(base, out);
  assert.deepEqual(fs.readdirSync(base).sort(), ['basis.json', 'model.json'], '需要无动作的全新导入目录');
  const model = geometry(api, read(path.join(base, 'model.json')), profile);
  const modelText = encode(model), motionText = encode(makeMotion(api, model));
  fs.mkdirSync(out);
  try {
    fs.copyFileSync(path.join(base, 'basis.json'), path.join(out, 'basis.json'));
    fs.writeFileSync(path.join(out, 'model.json'), modelText);
    fs.writeFileSync(path.join(out, 'motion.json'), motionText);
  } catch (error) { fs.rmSync(out, { recursive: true }); throw error; }
  console.log(`${profile}：保留原贴图，仅接两支背肢的方盒形状；${model.bones.length} 骨`);
}

function production(api, base, out, policy) {
  assert(['strict', 'source-bones'].includes(policy));
  newTarget(base, out);
  const original = read(path.join(base, 'model.json'));
  compareSource(original, { texW: api.original.texW, texH: api.original.texH, bones: api.original.bones }, '原模型');
  const creature = api.GirlYaBoLunCreature;
  const current = creature.getModel();
  const { model, findings, added, blocked } = partition(current, original, policy === 'source-bones');
  fs.mkdirSync(out);
  const report = { policy, blocked, bones: model.bones.length, added, atlas: [model.texW, model.texH],
    liveGeometrySha256: createHash('sha256').update(encode({ texW: current.texW, texH: current.texH, bones: current.bones })).digest('hex'),
    defaultSkin: creature.pickVariant().贴图, findings };
  fs.writeFileSync(path.join(out, '拓扑报告.json'), encode(report));
  fs.writeFileSync(path.join(out, '非标准面.svg'), outlineSvg(findings));
  for (const item of findings) console.log(`${item.name}：${item.quadCount} quad，原包 ${item.sourceCubes} 盒；${item.action}`);
  if (blocked) return;
  fs.writeFileSync(path.join(out, 'model.json'), encode(model));
  fs.writeFileSync(path.join(out, 'blink.json'), encode(creature.definition.animation.file.animations.pre_parallel1));
  fs.writeFileSync(path.join(out, 'motion.json'), encode(makeMotion(api, model)));
  fs.mkdirSync(path.join(out, 'skins'));
  for (const id of creature.definition.variant.贴图) {
    assert(/^[\w-]+$/.test(id), '不支持的皮肤 id');
    const { w, h, px } = creature.getModel({ 贴图: id }).texture;
    assert(w === model.texW && h === model.texH && px.length === w * h * 4, `正片图集尺寸不符：${id}`);
    fs.writeFileSync(path.join(out, 'skins', `${id}.png`), encodePng({ width: w, height: h, data: px, channels: 4, depth: 8 }));
  }
}

function motionPlayer(api, motion, names) {
  const { track, name } = motion;
  assert.deepEqual(Object.keys(motion).sort(), ['name', 'slot', 'track']);
  assert.equal(motion.slot, 'extra'); assert.equal(name, 'mc_anim_settlement');
  assert.deepEqual(Object.keys(track).sort(), ['bones', 'lengthSec', 'loop']);
  assert.equal(track.loop, false); assert.equal(track.lengthSec, api.danceFormat.frameCount / api.danceFormat.fps);
  assert.deepEqual(Object.keys(track.bones).sort(), [...names].sort(), '整舞修订须含全骨架');
  for (const [bone, value] of Object.entries(track.bones)) {
    assert.deepEqual(Object.keys(value).sort(), Object.keys(channels).sort(), `${bone} 缺少姿势通道`);
    for (const rows of Object.values(value)) assert(rows.at(-1)[0] < track.lengthSec, `${bone} 有舞长外的键`);
  }
  return bindMotion(motion, names);
}

function points(api, bone, model) {
  const mesh = api.boneGeometry(bone, model.texW, model.texH);
  const vertices = mesh.getAttribute('position');
  const result = Array.from({ length: vertices.count }, (_, index) => [vertices.getX(index), vertices.getY(index), vertices.getZ(index)].join(','));
  mesh.dispose();
  return result.sort();
}

function verify(api, base, back, pack) {
  const expected = geometry(api, read(path.join(base, 'model.json')), 'back-cubes');
  const model = read(path.join(back, 'model.json'));
  assert.deepEqual(model, JSON.parse(encode(expected)));
  const live = api.GirlYaBoLunCreature.definition.model;
  for (const name of ['bone41', 'bone51']) {
    const shape = points(api, model.bones.find(bone => bone.name === name), model);
    assert.deepEqual(shape, points(api, live.bones.find(bone => bone.name === name), live));
    assert.notDeepEqual(shape, points(api, api.original.bones.find(bone => bone.name === name), api.original));
  }
  verifyAnimation(api, model, back, pack);
}

function verifyProduction(api, input, back, pack) {
  const model = read(path.join(back, 'model.json'));
  assert.deepEqual(model, read(path.join(input, 'model.json')));
  const player = read(path.join(pack, 'ysm.json')).files.player;
  assert.deepEqual(read(path.join(pack, player.animation.main)).animations.pre_parallel1, api.GirlYaBoLunCreature.definition.animation.file.animations.pre_parallel1);
  for (const skin of player.texture) {
    const id = path.basename(skin.uv, '.png');
    const tex = api.GirlYaBoLunCreature.getModel({ 贴图: id }).texture;
    const decoded = decodePng(fs.readFileSync(path.join(pack, skin.uv)));
    assert(decoded.width === tex.w && decoded.height === tex.h && decoded.depth === 8 && decoded.channels === 4 && Buffer.from(decoded.data).equals(Buffer.from(tex.px)), `图集像素有别：${id}`);
  }
  verifyAnimation(api, model, back, pack);
  console.log(`重导模型 ${model.bones.length} 骨，${player.texture.length} 套 ${model.texW}×${model.texH} 正片图集逐像素一致`);
}

function verifyAnimation(api, model, back, pack) {
  const motion = read(path.join(back, 'motion.json'));
  const names = new Set(model.bones.map(bone => bone.name));
  const fromImport = motionPlayer(api, motion, names);
  const manifest = read(path.join(pack, 'ysm.json'));
  assert.equal(manifest.properties.extra_animation[motion.name], '结算舞');
  const raw = read(path.join(pack, manifest.files.player.animation.extra)).animations[motion.name];
  const animation = api.parseAnimationFile({ animations: { dance: raw } }).dance;
  const { fps, frameCount } = api.danceFormat;
  assert.equal(animation.lengthSec, frameCount / fps); assert.equal(animation.循环, 'once');
  let maxError = 0;
  capture(api, names, (frame, pose) => {
    for (const playback of [fromImport(frame / fps), api.sampleSkeleton(animation, frame / fps)]) {
      for (const name of names) for (const key of Object.keys(channels)) {
        const target = vector(pose[name], key), value = vector(playback[name], key);
        const error = Math.max(...target.map((axis, index) => Math.abs(axis - value[index])));
        if (error > 1e-8) throw Error(`重导误差 ${error}：${frame}/${name}/${key}`);
        maxError = Math.max(maxError, error);
      }
    }
  });
  console.log(`真实 rig ↔ 包内动作 ↔ 重导轨：${frameCount} 帧 × ${names.size} 骨 × 3 通道；最大轴误差 ${maxError}`);
}

function revision(api, back, file) {
  newTarget(back, file);
  const model = read(path.join(back, 'model.json')), motion = read(path.join(back, 'motion.json'));
  const { fps, frameCount } = api.danceFormat;
  assert.equal(motion.name, 'mc_anim_settlement'); assert.equal(motion.track.lengthSec, frameCount / fps);
  const names = new Set(model.bones.map(bone => bone.name));
  assert.deepEqual([...names].sort(), api.GirlYaBoLunCreature.getModel().bones.map(bone => bone.name).sort());
  const play = motionPlayer(api, motion, names);
  const bones = tracks(names, visit => { for (let frame = 0; frame < frameCount; frame++) visit(frame, play(frame / fps)); });
  const checked = api.parseDanceRevision({ ...api.danceFormat, bones }, names);
  let maxError = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const sec = frame / fps, imported = play(sec);
    const rig = api.settlementRig(sec, checked);
    const posed = api.composeDanceLayers(rig.animation, rig.bonePose);
    for (const name of names) for (const key of Object.keys(channels)) {
      const axes = vector(posed[name], key);
      const error = Math.max(...vector(imported[name], key).map((value, axis) => Math.abs(value - axes[axis])));
      assert(error <= 1e-8, `角色重导误差 ${error}：${frame}/${name}/${key}`);
      maxError = Math.max(maxError, error);
    }
  }
  fs.writeFileSync(file, encode(checked), { flag: 'wx' });
  console.log(`已写独立逐帧修订 ${file}；回灌 settlementRig 最大轴误差 ${maxError}，未覆写角色`);
}

const [mode, ...args] = process.argv.slice(2);
try {
  const modes = { bake, verify, revision, production, verifyProduction };
  assert(Object.hasOwn(modes, mode) && args.length === modes[mode].length - 1,
    '整模请用正片出包.py；bake <原包导入目录> <新制作目录> back-cubes；verify <原包导入目录> <重导目录> <导出包>；revision <重导目录> <新修订.json>');
  modes[mode](await runtime(), ...args);
} catch (error) { console.error(error.message); process.exitCode = 1; }
