// 末影龙死亡光束的几何：照 1.20.1 EnderDragonRenderer.render 的 dragonDeathTime > 0 那段（客户端 jar 反汇编核过）一条条算出来。纯模块，测试能引。
// - 随机数每帧都从 RandomSource.create(432) 重来（Java 的 48 位线性同余，LegacyRandomSource），所以每帧是同一批光束，只是条数和转角跟着死亡进度变；
// - 坐标先平移 (0, −1, −2)，之后每条光束在上一条的姿势上再转六下（不回退，转角一路累加），最后一下 Z 再加 进度×90°，整束光跟着慢慢转；
// - 条数 (进度 + 进度²)/2 × 60，长 随机×20 + 5 + f7×10、宽 随机×2 + 1 + f7×2，f7 = 进度过 0.8 以后的那 0.2 归一；
// - 每条三个顶点：中心白、透明度 255×(1 − f7)，三个尖品红、透明度 0；渲染类型 lightning 是 SRC_ALPHA, ONE 的加色混合。
// 坑：lightning 在 1.20.1 是 QUADS 画法，每条光束却按三角形写了 9 个顶点（9 不是 4 的倍数），四个一组切成两个三角形以后会跨到下一条光束上：
//   有的光束少一面、有的一面画两遍，还有一片片连着前后两条光束尖的扇面。游戏里看到的就是这个样子（1.20.5 才改成三角形），这里照原样切。
//   不含中心顶点的三角形透明度处处是 0，加色混合下看不见，不输出。
import type { V3 } from '@engine/model/parts.tsx';

/** Java Random（LegacyRandomSource）的 nextFloat 序列 */
export const java随机 = (种子: number) => {
  const 乘 = 0x5deece66dn;
  const 模 = (1n << 48n) - 1n;
  let s = (BigInt(种子) ^ 乘) & 模;
  return () => {
    s = (s * 乘 + 0xbn) & 模;
    return Number(s >> 24n) / 16777216;
  };
};

type 矩 = number[]; // 3×3，按行
const 乘矩 = (a: 矩, b: 矩): 矩 => {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r;
};
const 转 = (轴: 'x' | 'y' | 'z', 度: number): 矩 => {
  const a = (度 * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  if (轴 === 'x') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (轴 === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const 作用 = (m: 矩, [x, y, z]: readonly number[]): V3 => [m[0]! * x! + m[1]! * y! + m[2]! * z!, m[3]! * x! + m[4]! * y! + m[5]! * z!, m[6]! * x! + m[7]! * y! + m[8]! * z!];
/** 原版坐标（y 朝上、z 朝南）→ 场景坐标（z 朝上、y 朝北） */
const 换场景 = ([x, y, z]: V3): V3 => [x, -z, y];

const 半根三 = Math.sqrt(3) / 2;

export type 光束 = {
  /** 三角形顶点（场景坐标，相对龙的位置，格），每 9 个数一个三角形 */
  位: Float32Array;
  /** 每个顶点的中心权重：中心顶点 1、尖 0（片元里插值出来就是离中心多近，颜色 (1, 权, 1)、透明度 权 × 中心透明度） */
  权: Float32Array;
  /** 中心顶点的透明度 0～1（255×(1 − f7) / 255） */
  中心透明: number;
  条数: number;
};

/** 死刻：dragonDeathTime + 刻内进度（连续的刻数）。≥ 200 时龙已经消失，返回 null */
export const 死亡光束 = (死刻: number): 光束 | null => {
  if (死刻 <= 0 || 死刻 >= 200) return null;
  const f5 = 死刻 / 200;
  const f7 = Math.min(f5 > 0.8 ? (f5 - 0.8) / 0.2 : 0, 1);
  const j = Math.trunc(255 * (1 - f7));
  const r = java随机(432);
  let m: 矩 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // 顶点流：[位置, 是不是中心]；平移 (0, −1, −2) 最后加
  const 流: [V3, number][] = [];
  let 条数 = 0;
  for (let i = 0; i < ((f5 + f5 * f5) / 2) * 60; i++) {
    m = 乘矩(m, 转('x', r() * 360));
    m = 乘矩(m, 转('y', r() * 360));
    m = 乘矩(m, 转('z', r() * 360));
    m = 乘矩(m, 转('x', r() * 360));
    m = 乘矩(m, 转('y', r() * 360));
    m = 乘矩(m, 转('z', r() * 360 + f5 * 90));
    const 长 = r() * 20 + 5 + f7 * 10;
    const 宽 = r() * 2 + 1 + f7 * 2;
    const 中: [V3, number] = [[0, 0, 0], 1];
    const v2: [V3, number] = [作用(m, [-半根三 * 宽, 长, -0.5 * 宽]), 0];
    const v3: [V3, number] = [作用(m, [半根三 * 宽, 长, -0.5 * 宽]), 0];
    const v4: [V3, number] = [作用(m, [0, 长, 宽]), 0];
    流.push(中, v2, v3, 中, v3, v4, 中, v4, v2);
    条数++;
  }
  // QUADS：每 4 个顶点 (a, b, c, d) 画成 (a, b, c)、(c, d, a)，凑不满 4 个的尾巴不画
  const 位: number[] = [];
  const 权: number[] = [];
  const 推 = (...三: [V3, number][]) => {
    if (!三.some(([, w]) => w)) return;
    const [[p0], [p1], [p2]] = 三;
    // 两个顶点都在中心（同一点）的是退化三角形
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const 叉 = Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!);
    if (叉 < 1e-9) return;
    for (const [p, w] of 三) {
      const [x, y, z] = 换场景([p[0], p[1] - 1, p[2] - 2]);
      位.push(x, y, z);
      权.push(w);
    }
  };
  for (let q = 0; q + 3 < 流.length; q += 4) {
    const [a, b, c, d] = [流[q]!, 流[q + 1]!, 流[q + 2]!, 流[q + 3]!];
    推(a, b, c);
    推(c, d, a);
  }
  return { 位: new Float32Array(位), 权: new Float32Array(权), 中心透明: j / 255, 条数 };
};
