import { describe, expect, it } from 'vitest';
import { 默认模型, 模型字节, 读模型 } from './区段模型.ts';
import { 学模型 } from '../../pipeline/世界/烘焙/模型.ts';

describe('包内模型文件', () => {
  it('16 字节中性表；训练表小端往返、不要求输入对齐', () => {
    expect(模型字节(默认模型()).length).toBe(16);
    for (const m of [默认模型(), 学模型(() => [])]) {
      const b = 模型字节(m), off = new Uint8Array(b.length + 1);
      off.set(b, 1);
      expect(读模型(off.subarray(1))).toEqual(m);
      expect(模型字节(读模型(b))).toEqual(b);
    }
  });
  it('截断、尾随字节、错误版本/类号/概率/权重都拒绝，不回退默认表', () => {
    const b = 模型字节(学模型(() => []));
    expect(() => 读模型(b.subarray(0, 15))).toThrow(/模型表/);
    expect(() => 读模型(b.subarray(0, b.length - 1))).toThrow(/模型表/);
    expect(() => 读模型(new Uint8Array([...b, 0]))).toThrow(/模型表/);
    for (const [off, value] of [[0, 0], [4, 9], [8, 0], [16, 32], [17, 0], [b.length - 2, 0]]) {
      const x = b.slice();
      x[off!] = value!;
      if (off === 17 || off === b.length - 2) x[off + 1] = 0;
      expect(() => 读模型(x), `偏移 ${off}`).toThrow(/模型表/);
    }
  });
});
