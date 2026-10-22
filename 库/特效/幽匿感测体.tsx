// 幽匿感测体（原版 minecraft:sculk_sensor），照 1.20.1：
// - 模型：blockstates 的 sculk_sensor_phase=inactive → block/sculk_sensor_inactive，active / cooldown → block/sculk_sensor_active，只差触须贴图（父模型 block/sculk_sensor：底座 16×8×16，四根触须是绕 Y 转 ±45° 的零厚度面片，南北两面）。用 导出模型.py 导出（npm run 取材 -- 幽匿感测体），底座照 方块模型.tsx 画。
// - 触须贴图 sculk_sensor_tendril_active/_inactive.png 是 16 帧竖条动画（.mcmeta：active frametime 1，inactive 2，无 frames 列表、不插值）：跟全局时间走，第 floor(刻 / frametime) mod 16 帧。导出的图集只有第一帧，整条动画另导到 幽匿感测体.贴图/。
// - 时序（SculkSensorBlock）：振动到达 → activate：相位 ACTIVE、30 刻（getActiveTicks）后 tick；ACTIVE → COOLDOWN（再 10 刻）→ INACTIVE。ACTIVE 和 COOLDOWN 都用 active 模型，触须快抖共 40 刻 = 2 秒。激活时在自己位置发 SCULK_SENSOR_TENDRILS_CLICKING 游戏事件（附近尖啸体听的就是这个）。
// - 发光不加：lightLevel 恒为 1，emissiveRendering 在 ACTIVE 时为真，但古城按夜视满亮度画，看不出区别。
// - 粒子：SculkSensorBlock.animateTick 在 ACTIVE 时每次被调到随机取一个方向，水平四向之一才放一个 DustColorTransitionOptions.SCULK_TO_REDSTONE 粒子（#39D6E0 渐变到 #FF0000，大小 1）：
//   位置在那个侧面外 0.1 格、离底 0.25 格、沿面随机；速度 (0, random×0.04, 0)。animateTick 不是每刻都调（ClientLevel.animateTick 随机抽方块），离玩家几格的单个方块每刻被抽中约 0.1~0.18，所以一次激活一般只冒 1~4 个。
//   粒子本身照 DustParticleBase / DustColorTransitionParticle：摩擦 0.96，速度先按 Particle 默认随机再 ×0.1，半边长 0.1×(0.5~1)×2×0.75 在前 1/32 寿命内从 0 长满，寿命 (int)(8/(random×0.8+0.2)) = 8~40 刻，
//   贴图 generic_7 → generic_0 随寿命换，颜色按 (age+pt)/(lifetime+1) 从起色插到终色，每通道再乘 (0.8~1)×(0.6~1) 随机。
// 坐标：p 是方块底面中心，场景坐标 Z 朝上；秒 是全局时间（决定触须动画帧）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '../../engine/model/parts.tsx';
import { BlockModel, type BlockModelData } from '../../engine/model/方块模型.tsx';
import { png, pngDir } from '../../engine/model/贴图.ts';
import data from 'asset:模型/特效/幽匿感测体';
import atlasPng from 'asset:贴图/特效/幽匿感测体';
import { interpPathPos, type Particle, particleInitVel, particlePath, particleTexture, ParticleQuads } from './粒子面片.tsx';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/特效/幽匿感测体/sculk_sensor_tendril_active';
import 资_1 from 'asset:贴图/特效/幽匿感测体/sculk_sensor_tendril_inactive';
import 资_2 from 'asset:贴图/特效/粒子/generic_0';
import 资_3 from 'asset:贴图/特效/粒子/generic_1';
import 资_4 from 'asset:贴图/特效/粒子/generic_2';
import 资_5 from 'asset:贴图/特效/粒子/generic_3';
import 资_6 from 'asset:贴图/特效/粒子/generic_4';
import 资_7 from 'asset:贴图/特效/粒子/generic_5';
import 资_8 from 'asset:贴图/特效/粒子/generic_6';
import 资_9 from 'asset:贴图/特效/粒子/generic_7';

const modelData = data as unknown as BlockModelData;
const ATLAS = png(atlasPng);
const STRIPS = pngDir(资产目录({ './sculk_sensor_tendril_active.png': 资_0, './sculk_sensor_tendril_inactive.png': 资_1 }));
const GENERIC = pngDir(资产目录({ './generic_0.png': 资_2, './generic_1.png': 资_3, './generic_2.png': 资_4, './generic_3.png': 资_5, './generic_4.png': 资_6, './generic_5.png': 资_7, './generic_6.png': 资_8, './generic_7.png': 资_9 }));

export const sensorParams = {
  activeTicks: 30, // ACTIVE
  cooldownTicks: 10, // COOLDOWN（仍是 active 模型）
  frameCount: 16,
  frameTicks: { active: 1, inactive: 2 }, // .mcmeta 的 frametime（刻）
  dustFromColor: [0x39 / 255, 0xd6 / 255, 0xe0 / 255],
  dustToColor: [1, 0, 0],
};

// 底座：去掉触须那几张面片（触须要按帧换贴图，单独画）
const TENDRIL_TEX = new Set(modelData.textures.map((t, i) => (t.key.includes('tendril') ? i : -1)).filter((i) => i >= 0));
const D_BODY: BlockModelData = {
  ...modelData,
  parts: { 底座: { color: modelData.parts.不活跃.color, quads: modelData.parts.不活跃.quads.filter((q) => !TENDRIL_TEX.has(q[0])) } },
};
const TENDRIL_QUADS = modelData.parts.不活跃.quads.filter((q) => TENDRIL_TEX.has(q[0]));

// 触须的几何：照 方块模型.tsx 的面片格式（原点在方块中心），贴图坐标就是一帧 16×16 里的位置
const CENTER = [0.5, -0.5, 0.5];
const tendrilGeo = (() => {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const quad of TENDRIL_QUADS) {
    const base = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      pos.push(quad[1 + k * 3] - CENTER[0], quad[2 + k * 3] - CENTER[1], quad[3 + k * 3] - CENTER[2]);
      uv.push(quad[13 + k * 2], quad[14 + k * 2]);
      nor.push(quad[21], quad[22], quad[23]);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  return geometry;
})();

// 每帧一个材质（和方块网格一样：贴图 × 场景光照 + 0.4 倍贴图的自发光打底；触须是镂空贴图，按方块的剔除只画正面）
const mats = new Map<string, THREE.MeshStandardMaterial>();
const tendrilMat = (state: 'active' | 'inactive', frame: number) => {
  const key = `${state}|${frame}`;
  let material = mats.get(key);
  if (!material) {
    const strip = STRIPS[`sculk_sensor_tendril_${state}`];
    const frameSize = strip.w;
    const tex = new THREE.DataTexture(strip.px.slice(frame * frameSize * frameSize * 4, (frame + 1) * frameSize * frameSize * 4), frameSize, frameSize, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    material = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.95, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.4 });
    mats.set(key, material);
  }
  return material;
};

export const tendrilFrame = (sec: number, active: boolean) => {
  const ft = active ? sensorParams.frameTicks.active : sensorParams.frameTicks.inactive;
  return Math.floor(Math.floor(sec * 20) / ft) % sensorParams.frameCount;
};

export const sensorPhase = (secSinceActive: number): 'active' | 'cooldown' | 'inactive' => {
  const k = secSinceActive * 20;
  if (k < 0) return 'inactive';
  if (k < sensorParams.activeTicks) return 'active';
  if (k < sensorParams.activeTicks + sensorParams.cooldownTicks) return 'cooldown';
  return 'inactive';
};

const GEN_N = 8;
const genAtlas = (() => {
  const texSize = GENERIC.generic_0.w;
  const px = new Uint8Array(texSize * texSize * GEN_N * 4);
  for (let i = 0; i < GEN_N; i++) px.set(GENERIC[`generic_${i}`].px, i * texSize * texSize * 4);
  return particleTexture(px, texSize, texSize * GEN_N);
})();

type Dust = { born: number; life: number; half: number; path: V3[]; from: number[]; to: number[] };

const DustParticles: React.FC<{ p: V3; secSinceActive: number; chance: number; seed: number }> = ({ p: blockPos, secSinceActive: secSinceActive, chance, seed }) => {
  const dusts = useMemo(() => {
    const rand = rng(seed * 4513 + 29);
    const out: Dust[] = [];
    const bx = blockPos[0] - 0.5;
    const by = blockPos[1] + 0.5; // 游戏坐标的方块北边（z 小）在场景里是 +Y 一侧
    for (let k = 0; k < sensorParams.activeTicks; k++) {
      if (rand() >= chance) continue;
      // Direction.getRandom：六个方向等概率，上下就不放
      const dir = Math.floor(rand() * 6);
      if (dir < 2) continue;
      const [sx, sz] = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ][dir - 2]; // 北、南、西、东（游戏坐标的 x、z 步长）
      const gx = 0.5 + (sx === 0 ? 0.5 - rand() : sx * 0.6);
      const gz = 0.5 + (sz === 0 ? 0.5 - rand() : sz * 0.6);
      const pos: V3 = [bx + gx, by - gz, blockPos[2] + 0.25];
      const [vx, vy, vz] = particleInitVel(rand, 0, rand() * 0.04, 0).map((v) => v * 0.1);
      const shade = rand() * 0.4 + 0.6;
      const rc = (c: number) => (rand() * 0.2 + 0.8) * c * shade;
      const from = sensorParams.dustFromColor.map(rc);
      const to = sensorParams.dustToColor.map(rc);
      const half = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75;
      const life = Math.max(1, Math.floor(8 / (rand() * 0.8 + 0.2)));
      out.push({ born: k, life, half, path: particlePath(pos, [vx, -vz, vy], life + 1, { gravity: 0, friction: 0.96 }), from, to });
    }
    return out;
  }, [blockPos[0], blockPos[1], blockPos[2], chance, seed]);
  const t = secSinceActive * 20;
  const items: Particle[] = [];
  for (const dust of dusts) {
    const tau = t - dust.born;
    if (tau < 0 || tau >= dust.life + 1) continue;
    const age = Math.floor(tau);
    // SpriteSet.get(age, lifetime)：第 age×7/lifetime 张，贴图列表是 generic_7 → generic_0
    const gi = GEN_N - 1 - Math.min(GEN_N - 1, Math.floor((age * (GEN_N - 1)) / dust.life));
    const lifeFrac = Math.min(1, tau / (dust.life + 1));
    items.push({
      p: interpPathPos(dust.path, tau),
      half: dust.half * Math.min(1, Math.max(0, (tau / dust.life) * 32)),
      uv: [0, gi / GEN_N, 1, (gi + 1) / GEN_N],
      color: [0, 1, 2].map((i) => dust.from[i] + (dust.to[i] - dust.from[i]) * lifeFrac) as [number, number, number],
    });
  }
  return <ParticleQuads tex={genAtlas} items={items} />;
};

// p：方块底面中心；秒：全局时间（触须动画帧）；激活：用 active 模型（触须快抖）；
// 激活秒：从激活起算的秒数。给了它就按游戏时序自动定相位（2 秒内 active 模型，前 1.5 秒冒粉尘），不用再给 激活；
// 粉尘概率：每刻这个方块被 animateTick 抽中的概率（离玩家越近越大，默认 0.15）；seed：粉尘随机种子
export const SculkSensor: React.FC<{ p: V3; 秒: number; 激活?: boolean; 激活秒?: number; dustChance?: number; seed?: number }> = ({
  p: blockPos,
  秒: sec,
  激活: active = false,
  激活秒: secSinceActive,
  dustChance = 0.15,
  seed = 1,
}) => {
  const phase = secSinceActive !== undefined ? sensorPhase(secSinceActive) : active ? 'active' : 'inactive';
  const on = phase !== 'inactive';
  const frame = tendrilFrame(sec, on);
  return (
    <>
      <group position={[blockPos[0], blockPos[1], blockPos[2] + 0.5]}>
        <BlockModel data={D_BODY} atlas={ATLAS} part="底座" />
        <mesh geometry={tendrilGeo} material={tendrilMat(on ? 'active' : 'inactive', frame)} castShadow receiveShadow />
      </group>
      {secSinceActive !== undefined && secSinceActive >= 0 && secSinceActive * 20 < sensorParams.activeTicks + 45 && <DustParticles p={blockPos} secSinceActive={secSinceActive} chance={dustChance} seed={seed} />}
    </>
  );
};
