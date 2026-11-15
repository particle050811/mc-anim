// 区段网格的顶点容器（WebGLBuffer）回收（用户 10-31 定做）。createBuffer 一次约 30 微秒，穿塔每帧建约 1700 个，是这一帧 CPU 上最贵的一项（docs/渲染性能.md）；
// 镜头前进时每帧挤掉和新进的区段差不多多，挤掉的容器就留给新进的用。
// 走 three 公开的 GLBufferAttribute 自己管容器，不在 WebGL 接口外面包一层：只有区段网格走这里，别的模型、共用索引碰不到，不用猜 createBuffer 之后绑成什么类型（索引容器和顶点容器不能互换）。
// 容器的存储只涨不缩（ANGLE 的 Vulkan、D3D11 后端，Windows 上就是这两个）：bufferData 传 0 字节是空操作，传比现有存储小的数据沿用旧存储，只有传更大的或 deleteBuffer 才重新分配。
// 所以不能拿到哪个空壳就用哪个：装过大数组的壳拿去装小数组，大存储一直占着，壳在各区段之间轮转，每个都涨到它装过的最大一次，整段渲下来显存越攒越多
// （11-14 Windows 笔记本 8 GB 显存渲 6-穿塔斩首领 约第 2400 帧丢上下文，docs/渲染性能.md「从头渲到后面显存越攒越多」）。
// 做法：记每个容器装到过的最大字节数（`撑到`），取壳只取「撑到过的不超过这次要装的」，这样后端要么原样复用、要么按这次的大小重新分配，在用的容器不多占；
// 池里的空壳在这两个后端上仍占着旧存储，所以除了个数再按撑到过的字节合计设上限，超了从最大的删起。Metal（Mac）上传 0 字节就放存储，空壳不占显存，这些记账只影响取哪个壳。
// 上下文恢复后旧容器全部作废：`清空容器池` 由 世界.tsx 在恢复时调（只有 Studio 走得到，渲染时丢上下文直接报错）。池按上下文分，上下文没了池跟着回收。
import * as THREE from 'three';

// 一次挤掉 20% 的缓存（世界.tsx），一批的容器要放得下，不然省不到
export const maxEmptyShells = 20000;
// 空壳撑到过的字节合计的上限：一次挤掉的 20% 缓存约 120 万面 × 88 字节 ≈ 106 MB，要放得下。
// 开超远景的段一帧画的就超过缓存上限，每帧挤掉的比这多，超出的真删（穿塔 0～1500 帧约七成），出帧时间没变
export const maxKeptBytes = 128 * 1024 * 1024;
export type VertexArray = Int16Array | Uint16Array | Uint8Array;
// 档：按撑到过的字节数的 2 的幂分，第 k 档是 [2^k, 2^(k+1))
type Pool = { 档: WebGLBuffer[][]; count: number; 字节: number };
const poolTable = new WeakMap<WebGL2RenderingContext, Pool>();
const allocatedBytes = new WeakMap<WebGLBuffer, number>();
const sizeTier = (bytesCount: number) => 31 - Math.clz32(bytesCount | 1);

const getPool = (ctx: WebGL2RenderingContext) => {
  let pool = poolTable.get(ctx);
  if (!pool) poolTable.set(ctx, (pool = { 档: [], count: 0, 字节: 0 }));
  return pool;
};
const popBucket = (pool: Pool, k: number) => {
  const shell = pool.档[k]!.pop()!;
  pool.count--;
  pool.字节 -= allocatedBytes.get(shell) ?? 0;
  return shell;
};
// 撑到过的不超过 `字节` 的空壳：同档只看栈顶，不够小就往下一档找（下面各档的都比这次小），从大的档找起，小壳留给小数组
const takeShell = (pool: Pool, bytesCount: number) => {
  const k = sizeTier(bytesCount);
  const sameTier = pool.档[k];
  if (sameTier?.length && (allocatedBytes.get(sameTier[sameTier.length - 1]!) ?? 0) <= bytesCount) return popBucket(pool, k);
  for (let j = k - 1; j >= 0; j--) if (pool.档[j]?.length) return popBucket(pool, j);
  return null;
};

const glType = (ctx: WebGL2RenderingContext, vertexArray: VertexArray) => (vertexArray instanceof Int16Array ? ctx.SHORT : vertexArray instanceof Uint16Array ? ctx.UNSIGNED_SHORT : ctx.UNSIGNED_BYTE);

/** 一个顶点数组对应的属性。容器先空着：哪个视锥都碰不到的网格不传（材质.ts 的 `uploadWhenHit`），和 three 自己管 BufferAttribute 时一样，不多占显存 */
export const vertexAttribute = (ctx: WebGL2RenderingContext, vertexArray: VertexArray, componentsPerVertex: number, normalized = false) =>
  new THREE.GLBufferAttribute(null as unknown as WebGLBuffer, glType(ctx, vertexArray), componentsPerVertex, vertexArray.BYTES_PER_ELEMENT as 1 | 2, vertexArray.length / componentsPerVertex, normalized);

/** 取一个容器（优先用池里撑到过的不超过这次大小的）给属性，把数组传进显存 */
export const uploadVertices = (ctx: WebGL2RenderingContext, attribute: THREE.GLBufferAttribute, vertexArray: VertexArray) => {
  const buffer = takeShell(getPool(ctx), vertexArray.byteLength) ?? ctx.createBuffer();
  attribute.buffer = buffer;
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, vertexArray, ctx.STATIC_DRAW);
  if (vertexArray.byteLength > (allocatedBytes.get(buffer) ?? 0)) allocatedBytes.set(buffer, vertexArray.byteLength);
};

/** 还回一个容器。调用方要保证这之后没有东西还会画它（指着它的 VAO 同一轮就释放） */
export const returnBuffer = (ctx: WebGL2RenderingContext, buffer: WebGLBuffer | null) => {
  if (!buffer) return; // 没画过的网格没有容器
  const pool = getPool(ctx);
  const bytesCount = allocatedBytes.get(buffer) ?? 0;
  // 清成 0 字节：Metal 上存储马上放掉；Vulkan、D3D11 上是空操作，存储要等这个壳被更大的数组复用或删掉
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, 0, ctx.STATIC_DRAW);
  (pool.档[sizeTier(bytesCount)] ??= []).push(buffer);
  pool.count++;
  pool.字节 += bytesCount;
  // 超了从撑得最大的删起：大壳占得多，又只有更大的数组才用得上
  for (let k = pool.档.length - 1; k >= 0 && (pool.count > maxEmptyShells || pool.字节 > maxKeptBytes); k--) {
    const thisBucket = pool.档[k];
    while (thisBucket?.length && (pool.count > maxEmptyShells || pool.字节 > maxKeptBytes)) ctx.deleteBuffer(popBucket(pool, k));
  }
};

export const clearBufferPool = (ctx: WebGL2RenderingContext) => void poolTable.delete(ctx);
