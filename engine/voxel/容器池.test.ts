import { describe, expect, it } from 'vitest';
import { uploadVertices, maxKeptBytes, maxEmptyShells, clearBufferPool, returnBuffer, vertexAttribute, type VertexArray } from './容器池.ts';

// 假上下文：记容器的 create、delete、每个容器现在装了多少字节
const fakeContext = () => {
  const bytesCounts = new Map<object, number>();
  let boundBuffer: object | null = null;
  const counts = { created: 0, removed: 0 };
  const ctx = {
    ARRAY_BUFFER: 1,
    STATIC_DRAW: 2,
    SHORT: 3,
    UNSIGNED_SHORT: 4,
    UNSIGNED_BYTE: 5,
    createBuffer: () => {
      counts.created++;
      return {};
    },
    deleteBuffer: (b: object) => {
      counts.removed++;
      bytesCounts.delete(b);
    },
    bindBuffer: (_: number, b: object) => void (boundBuffer = b),
    bufferData: (_: number, content: number | ArrayBufferView) => void bytesCounts.set(boundBuffer!, typeof content === 'number' ? content : content.byteLength),
  };
  return { ctx: ctx as unknown as WebGL2RenderingContext, bytes: bytesCounts, 数: counts };
};

const upload = (ctx: WebGL2RenderingContext, vertexArray: VertexArray, componentsPerVertex = 4) => {
  const attribute = vertexAttribute(ctx, vertexArray, componentsPerVertex);
  uploadVertices(ctx, attribute, vertexArray);
  return attribute;
};

describe('容器池', () => {
  it('属性的类型、大小照数组，传之前没有容器', () => {
    const { ctx, 数: counts } = fakeContext();
    const a = vertexAttribute(ctx, new Int16Array(12), 3);
    expect([a.type, a.itemSize, a.elementSize, a.count, a.normalized, a.buffer]).toEqual([ctx.SHORT, 3, 2, 4, false, null]);
    expect(counts.created).toBe(0);
    const b = vertexAttribute(ctx, new Uint16Array(16), 4);
    expect([b.type, b.elementSize, b.count]).toEqual([ctx.UNSIGNED_SHORT, 2, 4]);
    const c = vertexAttribute(ctx, new Uint8Array(16), 4, true);
    expect([c.type, c.elementSize, c.count, c.normalized]).toEqual([ctx.UNSIGNED_BYTE, 1, 4, true]);
  });

  it('还回来的容器清成 0 字节，下一次复用，大小照新数组', () => {
    const { ctx, bytes: bytesCounts, 数: counts } = fakeContext();
    const a = upload(ctx, new Uint8Array(1000));
    expect(bytesCounts.get(a.buffer)).toBe(1000);
    returnBuffer(ctx, a.buffer);
    expect(bytesCounts.get(a.buffer)).toBe(0);
    const b = upload(ctx, new Uint8Array(4000));
    expect(b.buffer).toBe(a.buffer);
    expect(bytesCounts.get(b.buffer)).toBe(4000);
    expect(counts).toEqual({ created: 1, removed: 0 });
  });

  it('只复用装到过的不超过这次大小的空壳：大壳不拿去装小数组', () => {
    const { ctx, 数: counts } = fakeContext();
    const pooledBuffer = upload(ctx, new Uint8Array(4000)).buffer;
    const small = upload(ctx, new Uint8Array(1000)).buffer;
    returnBuffer(ctx, pooledBuffer);
    returnBuffer(ctx, small);
    // 2000 字节：4000 的壳不能用（存储缩不回来），用 1000 的
    const midBuffer = upload(ctx, new Uint8Array(2000)).buffer;
    expect(midBuffer).toBe(small);
    // 再来一个 2000 的：只剩 4000 的壳，新建
    expect(upload(ctx, new Uint8Array(2000)).buffer).not.toBe(pooledBuffer);
    expect(counts).toEqual({ created: 3, removed: 0 });
    // 一样大的可以用；同一档里比这次大的不用（4000 和 3000 都在 2048～4095 这一档）
    expect(upload(ctx, new Uint8Array(4000)).buffer).toBe(pooledBuffer);
    returnBuffer(ctx, pooledBuffer);
    expect(upload(ctx, new Uint8Array(3000)).buffer).not.toBe(pooledBuffer);
    // 装到过的最大一次算数：1000 的壳装过 2000 之后，不再给 1500 的用
    returnBuffer(ctx, midBuffer);
    expect(upload(ctx, new Uint8Array(1500)).buffer).not.toBe(midBuffer);
    expect(upload(ctx, new Uint8Array(2000)).buffer).toBe(midBuffer);
  });

  it('空壳个数有上限，超了真删', () => {
    const { ctx, 数: counts } = fakeContext();
    const buffers = Array.from({ length: maxEmptyShells + 5 }, () => ctx.createBuffer());
    for (const x of buffers) returnBuffer(ctx, x);
    expect(counts.removed).toBe(5);
  });

  it('空壳装到过的字节合计有上限，超了从最大的删起', () => {
    const { ctx, bytes: bytesCounts, 数: counts } = fakeContext();
    const shareBytes = maxKeptBytes / 4;
    const small = upload(ctx, new Uint8Array(1000)).buffer;
    const bigBuffers = Array.from({ length: 4 }, () => upload(ctx, new Uint8Array(shareBytes)).buffer);
    for (const x of bigBuffers) returnBuffer(ctx, x);
    expect(counts.removed).toBe(0); // 四个大的正好到上限
    returnBuffer(ctx, small);
    // 小的进来超了：删掉一个大的，小的留着
    expect(counts.removed).toBe(1);
    expect(bytesCounts.has(small)).toBe(true);
    expect(upload(ctx, new Uint8Array(1000)).buffer).toBe(small);
  });

  it('没传过的网格还回来是空的，不进池；清空后不再给旧容器；各上下文各一个池', () => {
    const fakeCtx = fakeContext();
    const secondCtx = fakeContext();
    returnBuffer(fakeCtx.ctx, null);
    const a = upload(fakeCtx.ctx, new Uint8Array(4));
    returnBuffer(fakeCtx.ctx, a.buffer);
    expect(upload(secondCtx.ctx, new Uint8Array(4)).buffer).not.toBe(a.buffer);
    clearBufferPool(fakeCtx.ctx);
    expect(upload(fakeCtx.ctx, new Uint8Array(4)).buffer).not.toBe(a.buffer);
  });
});
