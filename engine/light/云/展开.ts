// 一份云配置 → 着色器要的层（高度换成云空间、步数按质量档）和每帧的 uniform 值。纯模块（测试直接引）。
// 层号按云底从低到高排（叠的时候低的在前）。默认三层、质量档 精确 时，每个数和 engine/light/大气/云.ts 算出来的一样（逐字节不变的前提）。
import { cloudSpaceMult, cloudAlgorithms, defaultThickness, defaultLayers, weatherParams, defaultWeather, dampen, smoothstep, getQuality, isShadingLayerAlgorithm, type CloudLayer, type CloudConfig, type CloudQuality, type ShadingLayerCloudAlgorithm } from './配置.ts';

export type CloudSteps = { mainHeight: number; mainDepth: number; 最多: number; 光: number; ambient: number; scatterSteps: number; growth: number };

export type ExpandedLayer = {
  算法: ShadingLayerCloudAlgorithm;
  layerIndex: number;
  /** 云底离海平面（云空间米） */
  R: number;
  /** 厚（云空间米） */
  T: number;
  /** 积云：各团云底高低差（云空间米，uniform）、壳顶按多少算（define） */
  BH: number;
  shellHeight: number;
  /** 积云：高度图线性过滤（高低差改过时，同 大气/云.ts 的 pcCuBase 注释） */
  smooth: boolean;
  acceptsHoles: boolean;
  receivesLight: boolean;
  覆盖: readonly [number, number] | null;
  coverMult: number;
  density: number;
  尺寸: number;
  detail: number;
  shape: number | null;
  transmittanceThreshold: number;
  hasOffset: boolean;
  offset: readonly [number, number];
  wind: readonly [number, number];
  步: CloudSteps;
};

/** Photon 积云的高低差（格）：大气/云.ts 的 CU_BH 2400 ÷ 云空间倍 */
const baseHeightDiff = 2400 / cloudSpaceMult;

export const expandLayers = (layers: readonly CloudLayer[], seaLevel: number, q: CloudQuality): ExpandedLayer[] => {
  const S = cloudSpaceMult;
  for (const l of layers) if (cloudAlgorithms[l.算法].画法 === '没做') throw new Error(`云的算法「${l.算法}」（${cloudAlgorithms[l.算法].说明}）还没做`);
  const sortedLayers = layers.filter((l): l is CloudLayer & { 算法: ShadingLayerCloudAlgorithm } => isShadingLayerAlgorithm(l.算法)).sort((a, b) => a.bottomHeight - b.bottomHeight);
  return sortedLayers.map((l, layerIndex) => {
    const thickness = l.thickness ?? defaultThickness[l.算法];
    const heightDiff = l.heightDiff ?? baseHeightDiff;
    const offset = l.offset ?? [0, 0];
    const wind = l.wind ?? [0, 0];
    const stepScale = q.stepMult;
    const mainSteps = l.mainSteps;
    const baseStep: CloudSteps =
      l.算法 === 'Photon积云'
        ? { mainHeight: 40 * stepScale, mainDepth: 20 * stepScale, 最多: 120 * stepScale, 光: q.lightStep, ambient: 2, scatterSteps: q.scatterCount, growth: q.farStepGrowth }
        : l.算法 === 'Photon高积云'
          ? { mainHeight: 12 * stepScale, mainDepth: 6 * stepScale, 最多: 12 * stepScale, 光: Math.round((q.lightStep * 2) / 3), ambient: 2, scatterSteps: q.scatterCount, growth: 1 }
          : { mainHeight: 0, mainDepth: 0, 最多: 0, 光: 0, ambient: 0, scatterSteps: 4, growth: 1 };
    const steps: CloudSteps = { ...baseStep, ...(mainSteps ? { mainHeight: mainSteps[0], mainDepth: mainSteps[1], 最多: mainSteps[2] } : {}), ...(l.lightSteps !== undefined ? { 光: l.lightSteps } : {}) };
    return {
      算法: l.算法,
      layerIndex,
      // 取到 1e-6：底高按「海平面 + 3200 / 3」写时乘回来是 3200.0000000000005，日光（atmoLightAt）按高度算、尾数会进 uniform
      R: Math.round(S * (l.bottomHeight - seaLevel) * 1e6) / 1e6,
      T: S * thickness,
      BH: S * heightDiff,
      shellHeight: S * (q.tightShell ? heightDiff : Math.max(heightDiff, baseHeightDiff)),
      smooth: heightDiff !== baseHeightDiff,
      acceptsHoles: l.acceptsHoles ?? l.算法 !== 'Photon卷云',
      receivesLight: l.receivesLight ?? true,
      覆盖: l.覆盖 ?? null,
      coverMult: l.coverMult ?? 1,
      density: l.density ?? 1,
      尺寸: l.尺寸 ?? 1,
      detail: l.detail ?? 1,
      shape: l.shape ?? null,
      transmittanceThreshold: l.transmittanceThreshold ?? 0.075,
      hasOffset: offset[0] !== 0 || offset[1] !== 0 || wind[0] !== 0 || wind[1] !== 0,
      offset,
      wind,
      步: steps,
    };
  });
};

export type ExpandedConfig = { layers: ExpandedLayer[]; quality: CloudQuality; 海平面: number; weather: Required<NonNullable<CloudConfig['weather']>>; exposure: number };

export const expandCloud = (c: CloudConfig, sceneSeaLevel: number): ExpandedConfig => {
  const seaLevel = c.海平面 ?? sceneSeaLevel;
  const quality = getQuality(c.quality);
  const layers = c.层 ?? defaultLayers(seaLevel);
  return {
    layers: expandLayers(layers, seaLevel, quality),
    quality,
    海平面: seaLevel,
    weather: { ...defaultWeather, ...c.weather },
    exposure: c.exposure ?? 1,
  };
};

/** 各层每帧的 uniform 值（数组按 uniform 名给）。光 = 某高度（云空间米，离海平面）上的日光（大气.ts 的 atmoLightAt） */
export const layerValues = (e: ExpandedConfig, sunY: number, sec: number, lightAt: (h: number) => readonly number[]) => {
  const S = cloudSpaceMult;
  const out: Record<string, number | readonly number[]> = {};
  for (const l of e.layers) {
    const p = weatherParams(e.weather, sunY, l.算法 === 'Photon积云' ? l.T : 1200);
    // 覆盖、形态给了就顶掉天气算的（积云 l0、高积云和贴图层 l1 各用各的）
    const coverFirst = l.覆盖 ?? p.l0Cov, coverSecond = l.覆盖 ?? p.l1Cov;
    const blendFirst = l.shape ?? p.l0Blend, blendSecond = l.shape ?? p.l1Blend;
    const offset = l.hasOffset ? [S * (l.offset[0] + l.wind[0] * sec), -S * (l.offset[1] + l.wind[1] * sec)] : null;
    const scaleNum = (x: number, k: number) => (k === 1 ? x : x * k);
    if (l.算法 === 'Photon积云') {
      const n = `pcCu${l.layerIndex}`;
      out[`${n}A`] = [scaleNum(coverFirst[0], l.coverMult), scaleNum(coverFirst[1], l.coverMult), scaleNum(p.l0Detail[0], l.detail), scaleNum(p.l0Detail[1], l.detail)];
      out[`${n}B`] = [p.l0Edge[0], p.l0Edge[1], p.l0AltScale, blendFirst];
      out[`${n}C`] = [p.l0Ext, p.l0Shadow, 1, p.dayFactor];
      out[`${n}BH`] = l.BH;
      // 积云那层的日光取云底往上四分之一层厚（大气/云.ts 写的 1200 = 900 + 300）
      out[`${n}L`] = lightAt(l.R + l.T / 4);
      if (offset) out[`${n}Off`] = offset;
    } else if (l.算法 === 'Photon高积云') {
      const n = `pcAc${l.layerIndex}`;
      // 高积云的量减半（用户 10-14，同 大气/云.ts）；正午系数同 Photon 的 time_noon
      out[`${n}P`] = [scaleNum(0.5 * coverSecond[0], l.coverMult), scaleNum(0.5 * coverSecond[1], l.coverMult), blendSecond, dampen(smoothstep(0.05, 0.3, sunY))];
      out[`${n}L`] = lightAt(l.R);
      if (offset) out[`${n}Off`] = offset;
    } else if (l.算法 === 'Photon卷云') {
      const n = `pcCi${l.layerIndex}`;
      out[`${n}P`] = [scaleNum(l.覆盖?.[0] ?? p.cirrus, l.coverMult), scaleNum(l.覆盖?.[1] ?? p.cirrocumulus, l.coverMult)];
      out[`${n}L`] = lightAt(l.R);
      if (offset) out[`${n}Off`] = offset;
    } else {
      const n = `pcTx${l.layerIndex}`;
      // 覆盖照高积云（同一套噪声），消光照高积云的式子（Photon 的 altocumulus 消光）
      const ext = (0.08 + 0.08 * p.dayFactor) * 0.1 * (2 - blendSecond) * l.density;
      out[`${n}P`] = [0.5 * coverSecond[0] * l.coverMult, 0.5 * coverSecond[1] * l.coverMult, l.detail, ext];
      out[`${n}L`] = lightAt(l.R + l.T / 2);
      if (offset) out[`${n}Off`] = offset;
    }
  }
  return out;
};

/** 白天系数（Photon 的 day_factor，各层共用） */
export const dayFactor = (sunY: number) => smoothstep(0, 1, Math.abs(sunY) / 0.3);
