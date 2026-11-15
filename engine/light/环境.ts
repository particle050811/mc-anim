// 光照环境的描述：维度、时刻、天气、灯光档位、雾、云放在一个对象里，<环境>（环境组件.tsx）照它摆灯、天、云、雾。
// 纯数据和纯函数（不引 react、three、remotion）：段可以在 段.ts 之外的 环境.ts 里声明（定义环境、定义环境轨），测试直接跑。
// MC 的量照 1.20.1 client（srg jar 里 javap 对过）：DimensionType.timeOfDay、moonPhase，ClientLevel.getSkyDarken、getStarBrightness、getSkyColor，
//   DimensionSpecialEffects.getSunriseColor；日月星的透明度 = 1 − 雨（LevelRenderer.renderSky）。Mth.cos 是查表近似，这里用 Math.cos，差在 1e-4 以内。
// 场景坐标：x 东、y 北、z 上（同 engine/light/ 各模块）。原版太阳绕南北轴转：东升、正午在头顶、西落。
import { clamp01, smoothstep } from '../core/数学.ts';
import type { DimensionInfo } from './维度.ts';

export type V3 = [number, number, number];

/** 天空、灯、云的画法：engine/light/画法/<名>.tsx 那个模块的名字，段自己引那个模块传给 <环境 画法>（环境组件.tsx）。现有：
 *  主世界 = Photon 物理天空和空气雾 + Photon 云 + 方形太阳，按时刻时加原版月亮星星（作品/应力转动/地点/飞行镜头.tsx 的 FlightSky 那套）；
 *  暮色 = 暮色森林实拍取色的穹顶和星星 + 线性雾、高度雾、余晖方向雾 + Photon 云配暮色光照（暮色光照.tsx 的 TwilightLighting 那套）。
 *  这里不列全集：加画法只加模块，不改这个文件（改了用到 <环境> 的段全部过期）；名字对不对 anim check 照目录查 */
export type RendererName = string;

/** 一套灯的强度（同 光照配比.ts 的 LightMix） */
export type LightMix = { direct: number; skylight: number; ambient: number; selfLight: number };

/** 灯光档位（数在 灯光档位.ts）：前六个是 光照配比.ts 的档；暮色 = 暮色森林现用的（黄昏档 × 光倍 2），主世界 = 主世界现用的 */
export const tierNames = ['柔档', '柔档提亮', '中档', '强档', '硬档', '黄昏', '暮色', '主世界'] as const;
export type TierName = (typeof tierNames)[number];

/** 天气：雨、雷各 0～1（游戏里 rainLevel、thunderLevel）。雷只在下雨时起作用（getThunderLevel 乘了雨） */
export type Weather = { 雨: number; 雷: number };
export const clearWeather: Weather = { 雨: 0, 雷: 0 };
export const rainWeather: Weather = { 雨: 1, 雷: 0 };
export const thunderWeather: Weather = { 雨: 1, 雷: 1 };

/** 场景的雾（three 的 fog）：线性同 TwilightLighting，指数平方同 FlightFog（能见度 = 雾浓到一半的距离，米）。色不给按画法的默认色 */
export type Fog = { 种类: '线性'; near: number; far: number; 色?: string } | { 种类: '指数平方'; visibility: number; 色?: string } | { 种类: '无' };

/** 高度雾（高度雾.ts）：密度 = 浓度 × 2^(−(h − 起点) / 半衰)，h 是场景 z */
export type HeightFog = { start: number; halfLife: number; density: number };

/** 云：photon = 大气/云.ts 的 PhotonClouds（场景坐标；加 [x, y, 半径] 最多 4 朵，让开 [x, y, 半径, 软边]，镜头周围 [半径, 软边]，天气 0～1）；
 *  原版 = 天空.tsx 的方块云 Clouds（高 = 云底的场景 z，半径 = 铺多远，色 = 云顶色，偏移 = 贴图平移格数） */
export type Cloud =
  | {
      种类: 'photon';
      海平面: number;
      weather?: { temperature: number; humidity: number; wind: number };
      加?: readonly (readonly [number, number, number])[];
      clearRect?: readonly [number, number, number, number];
      aroundCamera?: readonly [number, number];
      exposure?: number;
    }
  | { 种类: '原版'; 高: number; radius?: number; 色?: string; offset?: readonly [number, number] }
  | { 种类: '无' };

/** 美术光向（指向光源）：向量，或方位（度，0 = 北、顺时针）+ 仰角（度） */
export type LightDir = V3 | { azimuthDeg: number; elevationDeg: number };

export type EnvDescription = {
  维度: DimensionInfo;
  画法: RendererName;
  /** 游戏时间（刻）：0 日出、6000 正午、12000 日落、18000 午夜，可以超过 24000（月相按第几天走）。维度时间固定的不给 */
  gameTime?: number;
  /** 美术光向，代替时刻算出来的太阳（现有暮色、主世界两套都是美术光向）；给了就不按时刻调灯，和 时刻 只写一个 */
  sun?: LightDir;
  /** 太阳轨道往南倾几度（光影包 sunPathRotation 那类，正 = 正午太阳偏南；原版 0）。只在按时刻算太阳时用 */
  orbitTilt?: number;
  weather?: Weather;
  /** 档位 × 倍（直射、天光、环境光、自发光一起乘）。表里没有的配比写 配比（新作品、新光影自定的灯，不用往 灯光档位.ts 里加档：加档会让用到 <环境> 的段全部过期） */
  lightSpec: { tier: TierName; intensity?: number } | { lightMix: LightMix; intensity?: number };
  fog: Fog;
  heightFog?: HeightFog;
  /** 主世界画法的 Photon 大气：地形远端（米，边界雾在这里融进天色）；null = 不开大气（钻到地下时）。不给 = 40000 */
  atmosphereFar?: number | null;
  cloud: Cloud;
  /** 主光投影（级联软阴影）：远 = 投影远端（米）。不给：暮色画法按雾远取（暮色光照.tsx 的 shadowFarFor），主世界画法不投影；false = 不投影 */
  shadow?: { far?: number } | false;
};

// ---------- 时刻 → 天体 ----------
export const dayTicks = 24000;
/** 游戏每秒 20 刻 */
export const ticksPerSec = 20;
const twoPi = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);

/** DimensionType.timeOfDay：游戏时间 → 天角（0～1；0 = 太阳在头顶，0.25 = 西边地平线，0.75 = 东边地平线）。日出日落比匀速快一点（余弦修正） */
export const skyAngle = (gameTime: number) => {
  const d0 = frac(gameTime / dayTicks - 0.25);
  const d1 = 0.5 - Math.cos(d0 * Math.PI) / 2;
  return Math.fround(Math.fround(d0 * 2 + d1) / 3);
};

/** 天角 → 一天里的时刻（0～24000，天角 的反函数，二分）。用来说美术光向大约相当于几点 */
export const skyAngleToGameTime = (skyAngle: number) => {
  // 天角随 d0 单调增：d0 = 0 是正午（6000 刻）
  const targetFrac = frac(skyAngle);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if ((mid * 2 + 0.5 - Math.cos(mid * Math.PI) / 2) / 3 < targetFrac) lo = mid;
    else hi = mid;
  }
  return (((lo + 0.25) * dayTicks) % dayTicks + dayTicks) % dayTicks;
};

/** DimensionType.moonPhase：0 满月 … 4 新月（按第几天，整除向零取） */
export const moonPhase = (gameTime: number) => ((Math.trunc(Math.floor(gameTime) / dayTicks) % 8) + 8) % 8;
/** DimensionType.MOON_BRIGHTNESS_PER_PHASE */
export const moonPhaseBright = [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75] as const;

/** 天角 → 指向太阳的单位向量（场景坐标）。倾角：轨道往南倾（度） */
export const sunDirection = (skyAngle: number, tiltDeg = 0): V3 => {
  const θ = skyAngle * twoPi;
  const φ = (tiltDeg * Math.PI) / 180;
  return [-Math.sin(θ), -Math.cos(θ) * Math.sin(φ), Math.cos(θ) * Math.cos(φ)];
};

/** 方位（度，0 = 北、顺时针）、仰角（度）→ 指向光源的单位向量（同 光照配比.ts 的 sunDirFromAngles） */
export const azimuthToVec = (azimuthDeg: number, elevationDeg: number): V3 => {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
};
export const lightDirToVec = (d: LightDir): V3 => (Array.isArray(d) ? d : azimuthToVec(d.azimuthDeg, d.elevationDeg));

/** 有效雷：getThunderLevel = 雷 × 雨 */
const effectiveThunder = (w: Weather) => w.雷 * w.雨;

/** ClientLevel.getSkyDarken：天光亮度 0.2～1（正午晴天 1，夜里 0.2；雨、雷各压 5/16） */
export const skyDarken = (skyAngle: number, w: Weather = clearWeather) => {
  let f = 1 - clamp01(1 - (Math.cos(skyAngle * twoPi) * 2 + 0.2));
  f *= 1 - (w.雨 * 5) / 16;
  f *= 1 - (effectiveThunder(w) * 5) / 16;
  return f * 0.8 + 0.2;
};

/** ClientLevel.getStarBrightness × (1 − 雨)：星星不透明度 0～0.5 */
export const starBrightness = (skyAngle: number, w: Weather = clearWeather) => {
  const f = clamp01(1 - (Math.cos(skyAngle * twoPi) * 2 + 0.25));
  return f * f * 0.5 * (1 - w.雨);
};

/** getSkyColor 里群系天色乘的系数（正午 1，夜里 0） */
export const skyDaylightMult = (skyAngle: number) => clamp01(Math.cos(skyAngle * twoPi) * 2 + 0.5);

/** getSkyColor 的雨、雷去饱和：rgb（0～1）往亮度灰里拉 */
export const rainSkyColor = (rgb: readonly [number, number, number], w: Weather): [number, number, number] => {
  let [r, g, b] = rgb;
  if (w.雨 > 0) {
    const grayValue = (r * 0.3 + g * 0.59 + b * 0.11) * 0.6;
    const k = 1 - w.雨 * 0.75;
    [r, g, b] = [r * k + grayValue * (1 - k), g * k + grayValue * (1 - k), b * k + grayValue * (1 - k)];
  }
  const thunder = effectiveThunder(w);
  if (thunder > 0) {
    const grayValue = (r * 0.3 + g * 0.59 + b * 0.11) * 0.2;
    const k = 1 - thunder * 0.75;
    [r, g, b] = [r * k + grayValue * (1 - k), g * k + grayValue * (1 - k), b * k + grayValue * (1 - k)];
  }
  return [r, g, b];
};

/** DimensionSpecialEffects.getSunriseColor：日出日落时太阳那边地平线的晚霞色 [r, g, b, 浓]，不在早晚过渡里是 null（暮色森林的效果不画，恒 null） */
export const dawnDuskColor = (skyAngle: number): [number, number, number, number] | null => {
  const c = Math.cos(skyAngle * twoPi);
  if (c < -0.4 || c > 0.4) return null;
  const f3 = (c / 0.4) * 0.5 + 0.5;
  let f4 = 1 - (1 - Math.sin(f3 * Math.PI)) * 0.99;
  f4 *= f4;
  return [f3 * 0.3 + 0.7, f3 * f3 * 0.7 + 0.2, 0.2, f4];
};

// ---------- 描述 → 灯 ----------
/** 实际用的游戏时间：维度固定的取固定时刻 */
export const effectiveGameTime = (e: EnvDescription): number | null => e.维度.fixedGameTime ?? e.gameTime ?? null;

// 按时刻算灯时太阳贴着地平线淡出、换成月光的那一段（仰角正弦），和月光对日光的比例：暂定，没对过游戏
const horizonFade: [number, number] = [-0.03, 0.1];
export const moonRatio = 0.1;

export type LightCoeffs = {
  /** 主光指向哪（美术光向原样，不归一；按时刻算的是单位向量） */
  lightDir: V3;
  /** 天上的太阳往哪（穹顶的太阳、Photon 大气用）；美术光向时同 光向 */
  sun: V3;
  /** 主光现在是月亮 */
  isMoonLight: boolean;
  /** 直射（主光）乘多少 */
  directMult: number;
  /** 天光、环境光乘多少 */
  skyLightMult: number;
};

/** 环境 → 主光朝向和直射、天光的倍数。美术光向：晴天两个倍数正好是 1（预设和现有组件逐像素一样）；按时刻：天光照 getSkyDarken，太阳落下换月光 */
export const LightCoeffs = (e: EnvDescription): LightCoeffs => {
  const w = e.weather ?? clearWeather;
  if (e.sun !== undefined) {
    const d = lightDirToVec(e.sun);
    const isClear = w.雨 === 0 && w.雷 === 0;
    return { lightDir: d, sun: d, isMoonLight: false, directMult: isClear ? 1 : 1 - w.雨, skyLightMult: isClear ? 1 : skyDarken(0, w) };
  }
  const t = effectiveGameTime(e);
  if (t === null) throw new Error(`环境（${e.维度.id}）没给 时刻，也没给 太阳`);
  const angle = skyAngle(t);
  const sunDir = sunDirection(angle, e.orbitTilt ?? 0);
  const moonDir: V3 = [-sunDir[0], -sunDir[1], -sunDir[2]];
  const sunStrength = smoothstep(horizonFade[0], horizonFade[1], sunDir[2]);
  const moonStrength = moonRatio * moonPhaseBright[moonPhase(t)]! * smoothstep(horizonFade[0], horizonFade[1], moonDir[2]);
  const isMoonLight = moonStrength > sunStrength;
  return { lightDir: isMoonLight ? moonDir : sunDir, sun: sunDir, isMoonLight, directMult: (isMoonLight ? moonStrength : sunStrength) * (1 - w.雨), skyLightMult: skyDarken(angle, w) };
};

// ---------- 校验 ----------
const checkWeather = (w: Weather, displayName: string) => {
  for (const k of ['雨', '雷'] as const) if (!(w[k] >= 0 && w[k] <= 1)) throw new Error(`${displayName}：天气.${k} = ${w[k]}，要在 0～1`);
};

/** 查一份环境描述，有问题直接抛（模块加载时就报，不等渲到那一帧） */
export const defineEnvironment = (e: EnvDescription, displayName = '环境'): EnvDescription => {
  const fixedTick = e.维度.fixedGameTime;
  if (e.gameTime !== undefined) {
    if (!Number.isFinite(e.gameTime)) throw new Error(`${displayName}：时刻 ${e.gameTime} 不是数`);
    if (fixedTick !== undefined) throw new Error(`${displayName}：${e.维度.id} 的时间固定在 ${fixedTick}，时刻 不起作用；要换光向写 太阳`);
    if (e.sun !== undefined) throw new Error(`${displayName}：时刻 和 太阳 只写一个（太阳 是美术光向，代替时刻算出的太阳）`);
  }
  if (e.sun !== undefined) {
    const d = lightDirToVec(e.sun);
    if (!d.every(Number.isFinite) || Math.hypot(...d) === 0) throw new Error(`${displayName}：太阳 ${JSON.stringify(e.sun)} 不是有效方向`);
  } else if (e.gameTime === undefined && fixedTick === undefined) throw new Error(`${displayName}：${e.维度.id} 要写 时刻 或 太阳`);
  if (e.weather) checkWeather(e.weather, displayName);
  if (typeof e.画法 !== 'string' || !/^[^/\\.\s]+$/.test(e.画法)) throw new Error(`${displayName}：画法 ${JSON.stringify(e.画法)} 要是 engine/light/画法/ 下的模块名`);
  if ('tier' in e.lightSpec && !(tierNames as readonly string[]).includes(e.lightSpec.tier)) throw new Error(`${displayName}：没有灯光档位「${e.lightSpec.tier}」（有：${tierNames.join('、')}；表里没有的写 配比）`);
  if (e.lightSpec.intensity !== undefined && !(e.lightSpec.intensity > 0)) throw new Error(`${displayName}：灯光.倍 ${e.lightSpec.intensity} 要大于 0`);
  if ('lightMix' in e.lightSpec) for (const [k, v] of Object.entries(e.lightSpec.lightMix)) if (!(v >= 0)) throw new Error(`${displayName}：灯光.配比.${k} = ${v}，不能是负的`);
  const f = e.fog;
  if (f.种类 === '线性' && !(f.near >= 0 && f.far > f.near)) throw new Error(`${displayName}：线性雾 近 ${f.near}、远 ${f.far} 要 0 ≤ 近 < 远`);
  if (f.种类 === '指数平方' && !(f.visibility > 0)) throw new Error(`${displayName}：能见度 ${f.visibility} 要大于 0`);
  if (e.heightFog && !(e.heightFog.halfLife > 0 && e.heightFog.density >= 0)) throw new Error(`${displayName}：高度雾 半衰要大于 0、浓度不能是负的`);
  if (e.cloud.种类 === 'photon' && (e.cloud.加?.length ?? 0) > 4) throw new Error(`${displayName}：Photon 云最多加 4 朵`);
  if (e.shadow && e.shadow.far !== undefined && !(e.shadow.far > 0)) throw new Error(`${displayName}：投影.远 ${e.shadow.far} 要大于 0`);
  return e;
};

// ---------- 随帧变：关键帧 ----------
/** 从这一帧到下一帧怎么过渡：线性、平滑（smoothstep）、阶跃（到下一帧才跳） */
export type Easing = '线性' | '平滑' | '阶跃';
/** 关键帧：帧（整数，段内或场内，看 <环境> 的 帧）上时刻、雨、雷是多少；没写的项不在这一帧定，各项各自插值，头尾之外保持 */
export type EnvKeyframe = { 帧: number; 时刻?: number; 雨?: number; 雷?: number; easing?: Easing };
export type EnvTrack = { base: EnvDescription; keyframes: readonly EnvKeyframe[] };

export const isEnvTrack = (x: EnvDescription | EnvTrack): x is EnvTrack => 'keyframes' in x;

export const defineEnvTrack = (envTrack: EnvTrack, displayName = '环境轨'): EnvTrack => {
  defineEnvironment(envTrack.base, `${displayName}.基础`);
  let prevFrame = -Infinity;
  for (const k of envTrack.keyframes) {
    const keyLabel = `${displayName} 第 ${k.帧} 帧`;
    if (!Number.isInteger(k.帧) || k.帧 < 0) throw new Error(`${keyLabel}：帧要是非负整数`);
    if (k.帧 <= prevFrame) throw new Error(`${keyLabel}：关键帧要按帧从小到大、不重复`);
    prevFrame = k.帧;
    if (k.时刻 === undefined && k.雨 === undefined && k.雷 === undefined) throw new Error(`${keyLabel}：时刻、雨、雷至少写一项`);
    if (k.时刻 !== undefined) {
      if (!Number.isFinite(k.时刻)) throw new Error(`${keyLabel}：时刻 ${k.时刻} 不是数`);
      if (envTrack.base.sun !== undefined) throw new Error(`${keyLabel}：基础 用了美术光向（太阳），时刻 关键帧不起作用`);
      if (envTrack.base.维度.fixedGameTime !== undefined) throw new Error(`${keyLabel}：${envTrack.base.维度.id} 的时间固定在 ${envTrack.base.维度.fixedGameTime}，时刻 关键帧不起作用`);
    }
    for (const f of ['雨', '雷'] as const) if (k[f] !== undefined && !(k[f]! >= 0 && k[f]! <= 1)) throw new Error(`${keyLabel}：${f} = ${k[f]}，要在 0～1`);
  }
  return envTrack;
};

const easeValue = (easeMode: Easing, t: number) => (easeMode === '阶跃' ? 0 : easeMode === '平滑' ? t * t * (3 - 2 * t) : t);

/** 某一项在第 帧 帧的值：只看写了这一项的关键帧；一个都没写返回 undefined */
export const keyframeValue = (keyframes: readonly EnvKeyframe[], trackItem: '时刻' | '雨' | '雷', frame: number): number | undefined => {
  const ks = keyframes.filter((k) => k[trackItem] !== undefined);
  if (!ks.length) return undefined;
  if (frame <= ks[0]!.帧) return ks[0]![trackItem];
  const lastKey = ks[ks.length - 1]!;
  if (frame >= lastKey.帧) return lastKey[trackItem];
  let i = 0;
  while (ks[i + 1]!.帧 <= frame) i++;
  const a = ks[i]!;
  const b = ks[i + 1]!;
  const t = easeValue(a.easing ?? '线性', (frame - a.帧) / (b.帧 - a.帧));
  return a[trackItem]! + (b[trackItem]! - a[trackItem]!) * t;
};

/** 第 帧 帧的环境：基础上换掉关键帧定的时刻、雨、雷。传描述就原样返回 */
export const envAtFrame = (x: EnvDescription | EnvTrack, frame: number): EnvDescription => {
  if (!isEnvTrack(x)) return x;
  const gameTime = keyframeValue(x.keyframes, '时刻', frame);
  const rain = keyframeValue(x.keyframes, '雨', frame);
  const thunder = keyframeValue(x.keyframes, '雷', frame);
  if (gameTime === undefined && rain === undefined && thunder === undefined) return x.base;
  const origWeather = x.base.weather ?? clearWeather;
  return {
    ...x.base,
    ...(gameTime !== undefined ? { gameTime } : {}),
    ...(rain !== undefined || thunder !== undefined ? { weather: { 雨: rain ?? origWeather.雨, 雷: thunder ?? origWeather.雷 } } : {}),
  };
};

/** 照游戏流速走的时刻（每秒 20 刻 × 倍速）：从 起 刻开始，第 帧 帧（fps）时是几刻。做延时摄影给 倍速 */
export const tickByFrame = (startTick: number, frame: number, fps: number, speedMult = 1) => startTick + (frame / fps) * ticksPerSec * speedMult;
