// 黑暗效果（MobEffects.DARKNESS），照 1.20.1（6-4-2 规矩用 javap 逐条对过，jar 是 game/缓存/client-1.20.1-srg.jar，方法名是 SRG：FogRenderer$DarknessFogFunction.setupFog = m_213725_、getModifiedVoidDarkness = m_213936_；
// LightTexture.calculateDarknessScale = m_234312_（0.45f、0.025f）；Warden.applyDarknessAround = m_219375_；SculkShriekerBlockEntity.tryRespond = m_222839_）：
// - 谁给、给多久：尖啸体 shriek 先放声波并计划 90 刻（4.5 秒）后 tick → tryRespond：能回应（can_summon、非和平、doWardenSpawning）且警告等级 > 0 时 Warden.applyDarknessAround(level, 方块中心, null, 40)：
//   给 40 格内玩家 DARKNESS 260 刻（13 秒），身上已有的黑暗剩不到 200 刻才加。监守者自己每 120 刻也会给 20 格内玩家 260 刻，古城这场用不到。
// - factor（MobEffectInstance$FactorData，paddingDuration = 22 刻）：效果剩余 > 22 刻时目标 1，否则目标 0；目标一变就从当前值起线性走 22 刻：开头 1.1 秒渐入、结尾最后 1.1 秒渐出。渲染时在上一刻和这一刻之间插值。
// - 雾（FogRenderer$DarknessFogFunction.setupFog）：f = lerp(factor, 渲染距离, 15)；雾起点 = 0.75·f，终点 = f（球形）。有黑暗时不管 factor 多少都用这个（平时是 渲染距离 − clamp(渲染距离/10, 4, 64)）。
// - 雾色（FogRenderer.setupColor）：getModifiedVoidDarkness 返回 1 − factor，雾色 ×(1 − factor)²；身上有黑暗时夜视不再提亮雾色。
// - 亮度（LightTexture.updateLightTexture）：darknessGamma = factor × 黑暗效果强度（选项，默认 1）；darknessScale = max(0, cos((玩家 tickCount − pt)·π·0.025) × 0.45 × darknessGamma) × 强度——
//   80 刻一个周期，只有余弦为正的半周期（2 秒）压暗，相位取决于玩家活了多少刻，和效果何时开始无关。
//   亮度图每格：（夜视把颜色放大到最大分量 = 1）→ 减 darknessScale → 夹 0~1 → 向 notGamma（1−(1−x)⁴）插值 max(0, 亮度选项 − darknessGamma) → 向 0.75 灰插 0.04 → 夹 0~1。
//   亮度图乘在所有方块、实体、粒子（含全亮的）颜色上（sRGB 数值上乘）。夜视、亮度选项 0.5 时没黑暗是 0.99，最暗约 0.558。
// 这里的做法：纯函数 `darkness()` 按上面算出每一刻的数值；组件 `<DarknessEffect>` 放进 `<ThreeCanvas>`：
//   1. 设 scene.fog（three 的 Fog 也是 smoothstep(近, 远, 深度)，同游戏 linear_fog；只是 three 按视深、游戏按到镜头的直线距离）；
//   2. 亮度用一张盖满画面的黑色半透明片：混合在 sRGB 输出上，画面 × 亮度系数，等于游戏在 sRGB 数值上乘亮度图。和游戏不同：这张片把背景和雾也压暗了（游戏不压天空和雾色）；古城在地下，影响很小。
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';

export const darknessParams = {
  durationTicks: 260,
  fadeTicks: 22,
  shriekToDarknessTicks: 90,
  minFogDist: 15,
  fogStartRatio: 0.75,
  pulseAmp: 0.45,
  pulseRadPerTick: Math.PI * 0.025, // 每刻，周期 80 刻
  defaultPhaseTick: 58, // 让第一次最暗正好落在渐入结束（22 刻）时：cos(π·0.025·(58+22)) = 1
};

export type DarknessOptions = {
  normalFogNear?: number; // 平时的雾起点（默认按渲染距离照游戏算：远 − clamp(远/10, 4, 64)）
  normalFogFar?: number; // 平时的雾终点 = 渲染距离（默认 192 = 12 区块）
  phaseTick?: number; // 效果开始时玩家的 tickCount（决定脉动相位），默认 58
  brightnessOpt?: number; // 游戏的「亮度」选项 0~1，默认 0.5
  intensity?: number; // 「黑暗效果」选项 0~1，默认 1
  nightVision?: boolean; // 默认 true（古城按夜视画）
  minFogDist?: number; // 雾压到多近（格），默认 15 照游戏；镜头不是吃了黑暗的玩家、要拍大景别时可放远
};

// factor：照 FactorData，t 是效果开始后的刻数（连续），D 是总时长（刻）
const factorAt = (t: number, durTicks: number) => {
  const fadeLen = darknessParams.fadeTicks;
  if (t < 0 || t >= durTicks) return 0;
  const up = Math.min(1, t / fadeLen);
  // 剩余时长 ≤ P 时开始往 0 走（从当时的 factor 出发）
  const downStart = durTicks - fadeLen;
  if (t < downStart) return up;
  const from = Math.min(1, downStart / fadeLen);
  return Math.max(0, from * (1 - (t - downStart) / fadeLen));
};

// 1 − (1 − x)⁴
const notGamma = (x: number) => 1 - (1 - x) ** 4;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// 一个满亮度格子（夜视下，或者光照本来就是满的）在亮度图里的值
const lightmapValue = (darkScale: number, darkGamma: number, gammaOpt: number, nightVision: boolean, base = 1) => {
  let lightLevel = nightVision ? 1 : base;
  lightLevel = clamp01(lightLevel - darkScale);
  lightLevel = lightLevel + (notGamma(lightLevel) - lightLevel) * Math.max(0, gammaOpt - darkGamma);
  lightLevel = lightLevel + (0.75 - lightLevel) * 0.04;
  return clamp01(lightLevel);
};

// 秒自效果开始：效果加上以后的秒数（< 0 或 ≥ 时长 = 没有黑暗）；时长秒：默认 13（260 刻）。
// 返回：factor 0~1；fogNear / fogFar：雾的起止距离（格）；亮度系数：画面亮度相对平时（夜视下 0.99）的倍数，sRGB 数值上乘；
// 灯光系数：亮度系数^2.2（想改场景灯光强度而不用遮罩时用，线性空间）；雾色系数：雾色乘的数 (1−factor)²；生效：此刻身上有没有黑暗
export const darkness = (secSinceStart: number, durationSec = darknessParams.durationTicks / 20, opt: DarknessOptions = {}) => {
  const far0 = opt.normalFogFar ?? 192;
  const near0 = opt.normalFogNear ?? far0 - Math.min(64, Math.max(4, far0 / 10));
  const phase = opt.phaseTick ?? darknessParams.defaultPhaseTick;
  const gammaOpt = opt.brightnessOpt ?? 0.5;
  const scale = opt.intensity ?? 1;
  const nv = opt.nightVision ?? true;
  const t = secSinceStart * 20;
  const durTicks = durationSec * 20;
  const normal = lightmapValue(0, 0, gammaOpt, nv);
  if (t < 0 || t >= durTicks) return { factor: 0, fogNear: near0, fogFar: far0, 亮度系数: 1, lightFactor: 1, fogColorFactor: 1, active: false };
  const factor = factorAt(t, durTicks);
  const fogDist = far0 + ((opt.minFogDist ?? darknessParams.minFogDist) - far0) * factor;
  const darkGamma = factor * scale;
  const darkScale = Math.max(0, Math.cos((phase + t) * darknessParams.pulseRadPerTick) * darknessParams.pulseAmp * darkGamma) * scale;
  const lightValue = lightmapValue(darkScale, darkGamma, gammaOpt, nv);
  const brightnessFactor = lightValue / normal;
  return {
    factor,
    fogNear: fogDist * darknessParams.fogStartRatio,
    fogFar: fogDist,
    亮度系数: brightnessFactor,
    lightFactor: brightnessFactor ** 2.2,
    fogColorFactor: (1 - factor) ** 2,
    active: true,
  };
};

export const shriekToDarknessSec = darknessParams.shriekToDarknessTicks / 20;

const OVERLAY_VERT = 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
const OVERLAY_FRAG = 'uniform float dim; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, dim); }';

// 放进 <ThreeCanvas> 里：按 darkness() 设雾、压暗画面。秒：效果开始后的秒数；雾色：平时的雾色（场景原来的雾 / 背景色）；
// 没有黑暗时（秒 < 0 或 ≥ 时长）用平时的雾（正常雾近、正常雾远、雾色）。
// 背景：把 scene.background 也设成当前雾色（游戏的清屏色就是雾色；画面里看得到背景时打开，否则远处的雾和背景之间会有一道线）。
// 卸载时把 scene.fog、scene.background 还原
export const DarknessEffect: React.FC<{ sec: number; durationSec?: number; fogColor?: string; fogBackground?: boolean } & DarknessOptions> = ({
  sec: sec,
  durationSec,
  fogColor: fogColor = '#000000',
  fogBackground = false,
  ...opt
}) => {
  const scene = useThree((s) => s.scene);
  const d = darkness(sec, durationSec, opt);
  const fog = useMemo(() => new THREE.Fog(fogColor, 1, 1000), []);
  // 游戏在 sRGB 数值上乘雾色：先取 sRGB 值再乘
  const baseRgb = new THREE.Color(fogColor).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  fog.color.setRGB(baseRgb.r * d.fogColorFactor, baseRgb.g * d.fogColorFactor, baseRgb.b * d.fogColorFactor, THREE.SRGBColorSpace);
  fog.near = d.fogNear;
  fog.far = d.fogFar;
  // 改 scene 放在提交之后（useLayoutEffect）：这时 <color attach="background"> 之类已经挂上，原来的值才取得到、也不会被它们盖掉；
  // Remotion 的画布在这之后的 useEffect 里才画这一帧
  const orig = useRef<{ fog: THREE.Scene['fog']; background: THREE.Scene['background'] } | null>(null);
  useLayoutEffect(() => {
    if (!orig.current) orig.current = { fog: scene.fog, background: scene.background };
    scene.fog = fog;
    if (fogBackground) scene.background = fog.color.clone();
  });
  useEffect(
    () => () => {
      if (!orig.current) return;
      scene.fog = orig.current.fog;
      scene.background = orig.current.background;
    },
    [scene],
  );
  const overlay = useMemo(() => {
    const overlayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: { dim: { value: 0 } }, vertexShader: OVERLAY_VERT, fragmentShader: OVERLAY_FRAG, transparent: true, depthTest: false, depthWrite: false }),
    );
    overlayMesh.frustumCulled = false;
    overlayMesh.renderOrder = 1e9;
    return overlayMesh;
  }, []);
  (overlay.material as THREE.ShaderMaterial).uniforms.dim.value = 1 - Math.min(1, d.亮度系数);
  return d.亮度系数 < 0.999 ? <primitive object={overlay} /> : null;
};
