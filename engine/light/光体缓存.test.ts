// 光体缓存的格式：编进去、压、解压、读回来和原来逐字节一样；键文本对不上、长度不对的当没有。
import { describe, expect, it } from 'vitest';
import { decodeLayer, encodeLayer, gzipBytes } from './光体缓存.ts';
import { gunzip } from '../core/数据源.ts';

const layer = () => ({
  occ: Uint8Array.from({ length: 37 }, (_, i) => (i % 3 ? 0 : 255)),
  set: { lights: Float32Array.from([1.5, -0, Number.MIN_VALUE, 3e38, 0.1]), bricks: Float32Array.from([0, 2, 0, 0]), index: Float32Array.from([4, 0]), count: 1 },
});

describe('光体缓存格式', () => {
  it('压了再解，各段逐字节同原来（占用格长度不是 4 的倍数也对齐）', async () => {
    const d = layer();
    const back = decodeLayer(await gunzip((await gzipBytes(encodeLayer('键|甲', d))).buffer as ArrayBuffer), '键|甲')!;
    expect(back.occ).toEqual(d.occ);
    for (const k of ['lights', 'bricks', 'index'] as const) expect(new Uint8Array(back.set[k].buffer, back.set[k].byteOffset, back.set[k].byteLength)).toEqual(new Uint8Array(d.set[k].buffer));
    expect(Object.is(back.set.lights[1], -0)).toBe(true);
    expect(back.set.count).toBe(1);
  });
  it('键文本对不上、截断了都当没有', () => {
    const bytes = encodeLayer('键|甲', layer());
    expect(decodeLayer(bytes.slice().buffer, '键|乙')).toBeNull();
    expect(decodeLayer(bytes.slice(0, bytes.length - 4).buffer, '键|甲')).toBeNull();
    expect(decodeLayer(new ArrayBuffer(2), '键|甲')).toBeNull();
  });
});
