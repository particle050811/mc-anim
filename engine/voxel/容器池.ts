// 区段网格的顶点容器（WebGLBuffer）回收（用户 10-31 定做）。createBuffer 一次约 30 微秒，穿塔每帧建约 1700 个，是这一帧 CPU 上最贵的一项（docs/渲染性能.md）；
// 镜头前进时每帧挤掉和新进的区段差不多多，挤掉的容器就留给新进的用。
// 走 three 公开的 GLBufferAttribute 自己管容器，不在 WebGL 接口外面包一层：只有区段网格走这里，别的模型、共用索引碰不到，不用猜 createBuffer 之后绑成什么类型（索引容器和顶点容器不能互换）。
// 大小：bufferData 每次整个重新分配，上一次装过多大无所谓。
// 显存上限：还回来时就清成 0 字节，池里只是空壳，显存和直接删除一样马上放掉，长段不会因为池子涨；空壳的 JS 对象和驱动记录也要钱，超过 `最多空壳` 个就真删。
// 上下文恢复后旧容器全部作废：`清空容器池` 由 世界.tsx 在恢复时调（只有 Studio 走得到，渲染时丢上下文直接报错）。池按上下文分，上下文没了池跟着回收。
import * as THREE from 'three';

// 一次挤掉 20% 的缓存（世界.tsx），一批的容器要放得下，不然省不到；穿塔 600～999 帧偶尔超过，约 1% 真删
export const 最多空壳 = 20000;
export type 顶点数组 = Int16Array | Uint16Array | Uint8Array;
const 池表 = new WeakMap<WebGL2RenderingContext, WebGLBuffer[]>();

const 取池 = (ctx: WebGL2RenderingContext) => {
  let 池 = 池表.get(ctx);
  if (!池) 池表.set(ctx, (池 = []));
  return 池;
};

const 类型 = (ctx: WebGL2RenderingContext, 数组: 顶点数组) => (数组 instanceof Int16Array ? ctx.SHORT : 数组 instanceof Uint16Array ? ctx.UNSIGNED_SHORT : ctx.UNSIGNED_BYTE);

/** 一个顶点数组对应的属性。容器先空着：哪个视锥都碰不到的网格不传（材质.ts 的 `uploadWhenHit`），和 three 自己管 BufferAttribute 时一样，不多占显存 */
export const 顶点属性 = (ctx: WebGL2RenderingContext, 数组: 顶点数组, 每点几个: number, 归一 = false) =>
  new THREE.GLBufferAttribute(null as unknown as WebGLBuffer, 类型(ctx, 数组), 每点几个, 数组.BYTES_PER_ELEMENT as 1 | 2, 数组.length / 每点几个, 归一);

/** 取一个容器（优先用池里的）给属性，把数组传进显存 */
export const 传顶点 = (ctx: WebGL2RenderingContext, 属性: THREE.GLBufferAttribute, 数组: 顶点数组) => {
  属性.buffer = 取池(ctx).pop() ?? ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, 属性.buffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, 数组, ctx.STATIC_DRAW);
};

/** 还回一个容器。调用方要保证这之后没有东西还会画它（指着它的 VAO 同一轮就释放） */
export const 还容器 = (ctx: WebGL2RenderingContext, 容器: WebGLBuffer | null) => {
  if (!容器) return; // 没画过的网格没有容器
  const 池 = 取池(ctx);
  if (池.length >= 最多空壳) {
    ctx.deleteBuffer(容器);
    return;
  }
  ctx.bindBuffer(ctx.ARRAY_BUFFER, 容器);
  ctx.bufferData(ctx.ARRAY_BUFFER, 0, ctx.STATIC_DRAW);
  池.push(容器);
};

export const 清空容器池 = (ctx: WebGL2RenderingContext) => void 池表.delete(ctx);
