// 一份云配置 → 着色器要的层（高度换成云空间、步数按质量档）和每帧的 uniform 值。纯模块（测试直接引）。
// 层号按云底从低到高排（叠的时候低的在前）。默认三层、质量档 精确 时，每个数和 engine/light/大气/云.ts 算出来的一样（逐字节不变的前提）。
import { 云空间倍, 云算法表, 默认厚度, 默认层们, 天气参数, 默认天气, dampen, 平滑阶, 取质量, 是光影层算法, type 云层, type 云配置, type 云质量, type 光影层云算法 } from './配置.ts';

export type 步数 = { 主H: number; 主Z: number; 最多: number; 光: number; 环: number; 散射: number; 增: number };

export type 展开层 = {
  算法: 光影层云算法;
  号: number;
  /** 云底离海平面（云空间米） */
  R: number;
  /** 厚（云空间米） */
  T: number;
  /** 积云：各团云底高低差（云空间米，uniform）、壳顶按多少算（define） */
  BH: number;
  壳BH: number;
  /** 积云：高度图线性过滤（高低差改过时，同 大气/云.ts 的 pcCuBase 注释） */
  平滑: boolean;
  受洞: boolean;
  受亮: boolean;
  覆盖: readonly [number, number] | null;
  覆盖倍: number;
  密度: number;
  尺寸: number;
  细节: number;
  形态: number | null;
  透射率阈值: number;
  有偏: boolean;
  偏: readonly [number, number];
  风: readonly [number, number];
  步: 步数;
};

/** Photon 积云的高低差（格）：大气/云.ts 的 CU_BH 2400 ÷ 云空间倍 */
const 原高低差 = 2400 / 云空间倍;

export const 展开层们 = (层们: readonly 云层[], 海平面: number, q: 云质量): 展开层[] => {
  const S = 云空间倍;
  for (const l of 层们) if (云算法表[l.算法].画法 === '没做') throw new Error(`云的算法「${l.算法}」（${云算法表[l.算法].说明}）还没做`);
  const 排 = 层们.filter((l): l is 云层 & { 算法: 光影层云算法 } => 是光影层算法(l.算法)).sort((a, b) => a.底高 - b.底高);
  return 排.map((l, 号) => {
    const 厚 = l.厚度 ?? 默认厚度[l.算法];
    const 高低差 = l.高低差 ?? 原高低差;
    const 偏 = l.偏移 ?? [0, 0];
    const 风 = l.风 ?? [0, 0];
    const 倍 = q.步数倍;
    const 主 = l.主步数;
    const 步0: 步数 =
      l.算法 === 'Photon积云'
        ? { 主H: 40 * 倍, 主Z: 20 * 倍, 最多: 120 * 倍, 光: q.光步, 环: 2, 散射: q.散射次, 增: q.远步增 }
        : l.算法 === 'Photon高积云'
          ? { 主H: 12 * 倍, 主Z: 6 * 倍, 最多: 12 * 倍, 光: Math.round((q.光步 * 2) / 3), 环: 2, 散射: q.散射次, 增: 1 }
          : { 主H: 0, 主Z: 0, 最多: 0, 光: 0, 环: 0, 散射: 4, 增: 1 };
    const 步: 步数 = { ...步0, ...(主 ? { 主H: 主[0], 主Z: 主[1], 最多: 主[2] } : {}), ...(l.光步数 !== undefined ? { 光: l.光步数 } : {}) };
    return {
      算法: l.算法,
      号,
      // 取到 1e-6：底高按「海平面 + 3200 / 3」写时乘回来是 3200.0000000000005，日光（atmoLightAt）按高度算、尾数会进 uniform
      R: Math.round(S * (l.底高 - 海平面) * 1e6) / 1e6,
      T: S * 厚,
      BH: S * 高低差,
      壳BH: S * (q.紧壳 ? 高低差 : Math.max(高低差, 原高低差)),
      平滑: 高低差 !== 原高低差,
      受洞: l.受洞 ?? l.算法 !== 'Photon卷云',
      受亮: l.受亮 ?? true,
      覆盖: l.覆盖 ?? null,
      覆盖倍: l.覆盖倍 ?? 1,
      密度: l.密度 ?? 1,
      尺寸: l.尺寸 ?? 1,
      细节: l.细节 ?? 1,
      形态: l.形态 ?? null,
      透射率阈值: l.透射率阈值 ?? 0.075,
      有偏: 偏[0] !== 0 || 偏[1] !== 0 || 风[0] !== 0 || 风[1] !== 0,
      偏,
      风,
      步,
    };
  });
};

export type 展开配置 = { 层们: 展开层[]; 质量: 云质量; 海平面: number; 天气: Required<NonNullable<云配置['天气']>>; 曝光: number };

export const 展开 = (c: 云配置, 场海平面: number): 展开配置 => {
  const 海平面 = c.海平面 ?? 场海平面;
  const 质量 = 取质量(c.质量);
  const 层们 = c.层 ?? 默认层们(海平面);
  return {
    层们: 展开层们(层们, 海平面, 质量),
    质量,
    海平面,
    天气: { ...默认天气, ...c.天气 },
    曝光: c.曝光 ?? 1,
  };
};

/** 各层每帧的 uniform 值（数组按 uniform 名给）。光 = 某高度（云空间米，离海平面）上的日光（大气.ts 的 atmoLightAt） */
export const 层值 = (e: 展开配置, sunY: number, 秒: number, 光: (h: number) => readonly number[]) => {
  const S = 云空间倍;
  const out: Record<string, number | readonly number[]> = {};
  for (const l of e.层们) {
    const p = 天气参数(e.天气, sunY, l.算法 === 'Photon积云' ? l.T : 1200);
    // 覆盖、形态给了就顶掉天气算的（积云 l0、高积云和贴图层 l1 各用各的）
    const 覆0 = l.覆盖 ?? p.l0Cov, 覆1 = l.覆盖 ?? p.l1Cov;
    const 混0 = l.形态 ?? p.l0Blend, 混1 = l.形态 ?? p.l1Blend;
    const 偏 = l.有偏 ? [S * (l.偏[0] + l.风[0] * 秒), -S * (l.偏[1] + l.风[1] * 秒)] : null;
    const 乘 = (x: number, k: number) => (k === 1 ? x : x * k);
    if (l.算法 === 'Photon积云') {
      const n = `pcCu${l.号}`;
      out[`${n}A`] = [乘(覆0[0], l.覆盖倍), 乘(覆0[1], l.覆盖倍), 乘(p.l0Detail[0], l.细节), 乘(p.l0Detail[1], l.细节)];
      out[`${n}B`] = [p.l0Edge[0], p.l0Edge[1], p.l0AltScale, 混0];
      out[`${n}C`] = [p.l0Ext, p.l0Shadow, 1, p.dayFactor];
      out[`${n}BH`] = l.BH;
      // 积云那层的日光取云底往上四分之一层厚（大气/云.ts 写的 1200 = 900 + 300）
      out[`${n}L`] = 光(l.R + l.T / 4);
      if (偏) out[`${n}Off`] = 偏;
    } else if (l.算法 === 'Photon高积云') {
      const n = `pcAc${l.号}`;
      // 高积云的量减半（用户 10-14，同 大气/云.ts）；正午系数同 Photon 的 time_noon
      out[`${n}P`] = [乘(0.5 * 覆1[0], l.覆盖倍), 乘(0.5 * 覆1[1], l.覆盖倍), 混1, dampen(平滑阶(0.05, 0.3, sunY))];
      out[`${n}L`] = 光(l.R);
      if (偏) out[`${n}Off`] = 偏;
    } else if (l.算法 === 'Photon卷云') {
      const n = `pcCi${l.号}`;
      out[`${n}P`] = [乘(l.覆盖?.[0] ?? p.cirrus, l.覆盖倍), 乘(l.覆盖?.[1] ?? p.cirrocumulus, l.覆盖倍)];
      out[`${n}L`] = 光(l.R);
      if (偏) out[`${n}Off`] = 偏;
    } else {
      const n = `pcTx${l.号}`;
      // 覆盖照高积云（同一套噪声），消光照高积云的式子（Photon 的 altocumulus 消光）
      const ext = (0.08 + 0.08 * p.dayFactor) * 0.1 * (2 - 混1) * l.密度;
      out[`${n}P`] = [0.5 * 覆1[0] * l.覆盖倍, 0.5 * 覆1[1] * l.覆盖倍, l.细节, ext];
      out[`${n}L`] = 光(l.R + l.T / 2);
      if (偏) out[`${n}Off`] = 偏;
    }
  }
  return out;
};

/** 白天系数（Photon 的 day_factor，各层共用） */
export const 白天系数 = (sunY: number) => 平滑阶(0, 1, Math.abs(sunY) / 0.3);
