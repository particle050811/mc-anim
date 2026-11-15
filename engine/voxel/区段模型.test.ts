import { describe, expect, it } from 'vitest';
import { defaultModel, modelBytes, readModel } from './区段模型.ts';
import { learnModel } from '../../pipeline/世界/烘焙/模型.ts';

describe('包内模型文件', () => {
  it('16 字节中性表；训练表小端往返、不要求输入对齐', () => {
    expect(modelBytes(defaultModel()).length).toBe(16);
    for (const m of [defaultModel(), learnModel(() => [])]) {
      const b = modelBytes(m), off = new Uint8Array(b.length + 1);
      off.set(b, 1);
      expect(readModel(off.subarray(1))).toEqual(m);
      expect(modelBytes(readModel(b))).toEqual(b);
    }
  });
  it('截断、尾随字节、错误版本/类号/概率/权重都拒绝，不回退默认表', () => {
    const b = modelBytes(learnModel(() => []));
    expect(() => readModel(b.subarray(0, 15))).toThrow(/模型表/);
    expect(() => readModel(b.subarray(0, b.length - 1))).toThrow(/模型表/);
    expect(() => readModel(new Uint8Array([...b, 0]))).toThrow(/模型表/);
    for (const [off, value] of [[0, 0], [4, 9], [8, 0], [16, 32], [17, 0], [b.length - 2, 0]]) {
      const x = b.slice();
      x[off!] = value!;
      if (off === 17 || off === b.length - 2) x[off + 1] = 0;
      expect(() => readModel(x), `偏移 ${off}`).toThrow(/模型表/);
    }
  });
});
