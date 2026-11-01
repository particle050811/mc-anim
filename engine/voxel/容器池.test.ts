import { describe, expect, it } from 'vitest';
import { 传顶点, 最多空壳, 清空容器池, 还容器, 顶点属性, type 顶点数组 } from './容器池.ts';

// 假上下文：记容器的 create、delete、每个容器现在装了多少字节
const 假上下文 = () => {
  const 字节 = new Map<object, number>();
  let 绑着: object | null = null;
  const 数 = { 建: 0, 删: 0 };
  const ctx = {
    ARRAY_BUFFER: 1,
    STATIC_DRAW: 2,
    SHORT: 3,
    UNSIGNED_SHORT: 4,
    UNSIGNED_BYTE: 5,
    createBuffer: () => {
      数.建++;
      return {};
    },
    deleteBuffer: (b: object) => {
      数.删++;
      字节.delete(b);
    },
    bindBuffer: (_: number, b: object) => void (绑着 = b),
    bufferData: (_: number, 内容: number | ArrayBufferView) => void 字节.set(绑着!, typeof 内容 === 'number' ? 内容 : 内容.byteLength),
  };
  return { ctx: ctx as unknown as WebGL2RenderingContext, 字节, 数 };
};

const 传 = (ctx: WebGL2RenderingContext, 数组: 顶点数组, 每点几个 = 4) => {
  const 属性 = 顶点属性(ctx, 数组, 每点几个);
  传顶点(ctx, 属性, 数组);
  return 属性;
};

describe('容器池', () => {
  it('属性的类型、大小照数组，传之前没有容器', () => {
    const { ctx, 数 } = 假上下文();
    const a = 顶点属性(ctx, new Int16Array(12), 3);
    expect([a.type, a.itemSize, a.elementSize, a.count, a.normalized, a.buffer]).toEqual([ctx.SHORT, 3, 2, 4, false, null]);
    expect(数.建).toBe(0);
    const b = 顶点属性(ctx, new Uint16Array(16), 4);
    expect([b.type, b.elementSize, b.count]).toEqual([ctx.UNSIGNED_SHORT, 2, 4]);
    const c = 顶点属性(ctx, new Uint8Array(16), 4, true);
    expect([c.type, c.elementSize, c.count, c.normalized]).toEqual([ctx.UNSIGNED_BYTE, 1, 4, true]);
  });

  it('还回来的容器清成 0 字节，下一次复用，大小照新数组', () => {
    const { ctx, 字节, 数 } = 假上下文();
    const a = 传(ctx, new Uint8Array(1000));
    expect(字节.get(a.buffer)).toBe(1000);
    还容器(ctx, a.buffer);
    expect(字节.get(a.buffer)).toBe(0);
    const b = 传(ctx, new Uint8Array(4000));
    expect(b.buffer).toBe(a.buffer);
    expect(字节.get(b.buffer)).toBe(4000);
    expect(数).toEqual({ 建: 1, 删: 0 });
  });

  it('空壳有上限，超了真删', () => {
    const { ctx, 数 } = 假上下文();
    const 容器们 = Array.from({ length: 最多空壳 + 5 }, () => ctx.createBuffer());
    for (const x of 容器们) 还容器(ctx, x);
    expect(数.删).toBe(5);
  });

  it('没传过的网格还回来是空的，不进池；清空后不再给旧容器；各上下文各一个池', () => {
    const 甲 = 假上下文();
    const 乙 = 假上下文();
    还容器(甲.ctx, null);
    const a = 传(甲.ctx, new Uint8Array(4));
    还容器(甲.ctx, a.buffer);
    expect(传(乙.ctx, new Uint8Array(4)).buffer).not.toBe(a.buffer);
    清空容器池(甲.ctx);
    expect(传(甲.ctx, new Uint8Array(4)).buffer).not.toBe(a.buffer);
  });
});
