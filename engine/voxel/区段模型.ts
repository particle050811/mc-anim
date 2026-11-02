// 每包一张模型，和块文件一起进入目录指纹，不把训练结果编进解码器（改表只让使用该包的段过期）。
// 模型.bin：小端 u32[魔数 MCQM, 表格式 1, 类数, 状态跨度]，然后 u8 类[跨度]、u16 初值[类数×1371]、u16 权重[类数×跨度]。
// 类数 1、跨度 0 是 16 字节的中性表：初值 1024、未见状态权重 1。小包不必承担完整训练表的固定成本。
export type 区段模型 = { classes: number; stride: number; map: Uint8Array; init: Uint16Array; weights: Uint16Array };
export const 区段格式版本 = 3;
export const 模型文件名 = '模型.bin';
const 魔数 = 0x4d51434d;
export const 默认模型 = (): 区段模型 => ({ classes: 1, stride: 0, map: new Uint8Array(65536), init: new Uint16Array(1371).fill(1024), weights: new Uint16Array(0) });

export const 读模型 = (b: Uint8Array): 区段模型 => {
  const 错 = () => new Error('地形模型表损坏或格式不对：anim assets pull，或 anim check --深 核对地形包');
  if (b.length < 16) throw 错();
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const classes = v.getUint32(8, true), stride = v.getUint32(12, true);
  if (v.getUint32(0, true) !== 魔数 || v.getUint32(4, true) !== 1) throw 错();
  if (classes === 1 && stride === 0 && b.length === 16) return 默认模型();
  if (classes !== 32 || stride < 1 || stride > 65536 || b.length !== 16 + stride + 2 * classes * (1371 + stride)) throw 错();
  const map = new Uint8Array(65536).fill(classes - 1);
  map.set(b.subarray(16, 16 + stride));
  if (map.some((c) => c >= classes)) throw 错();
  let off = 16 + stride;
  const u16 = (n: number) => {
    const a = new Uint16Array(n);
    for (let i = 0; i < n; i++) a[i] = v.getUint16(off + 2 * i, true);
    off += 2 * n;
    return a;
  };
  const init = u16(classes * 1371), weights = u16(classes * stride);
  if (init.some((p) => p < 15 || p > 2033) || weights.some((p) => !p)) throw 错();
  return { classes, stride, map, init, weights };
};

export const 模型字节 = (m: 区段模型): Uint8Array => {
  const 中性 = m.classes === 1 && m.stride === 0;
  const b = new Uint8Array(中性 ? 16 : 16 + m.stride + m.init.byteLength + m.weights.byteLength), v = new DataView(b.buffer);
  [魔数, 1, m.classes, m.stride].forEach((n, i) => v.setUint32(i * 4, n, true));
  if (!中性) {
    b.set(m.map.subarray(0, m.stride), 16);
    let off = 16 + m.stride;
    for (const a of [m.init, m.weights]) for (const n of a) { v.setUint16(off, n, true); off += 2; }
  }
  return b;
};
