// 实验 a（不合并）：GL buffer 回收。createBuffer 一次约 30 微秒（归因量的），穿塔每帧 1700 次；被挤掉的区段网格释放时（世界.tsx 开着门）不真删，留给下一次 createBuffer，three 紧接着 bufferData 换内容。
// 只回收门开着时删的、绑过 ARRAY_BUFFER 的 buffer：这时它所在的 VAO 也被同一个循环删了，没有人还指着它。
// createBuffer 不知道目标：要是接下来绑成 ELEMENT_ARRAY_BUFFER（WebGL 不许一个 buffer 换类型），就给它配一个真 buffer 当替身。
import { 环境 } from './桩.ts';

export const 实验回收门 = { 开: false };
export const 实验池数 = { 复用: 0, 新建: 0, 替身: 0 };

if ((环境.ANIM_X ?? '').includes('a') && typeof WebGL2RenderingContext !== 'undefined') {
  const p = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const 池表 = new WeakMap<object, WebGLBuffer[]>();
  const 池 = (gl: object) => {
    let x = 池表.get(gl);
    if (!x) 池表.set(gl, (x = []));
    return x;
  };
  const 上限 = 8000;
  const 绑过阵列 = new WeakSet<object>();
  const 待定 = new WeakSet<object>();
  const 替 = new WeakMap<object, WebGLBuffer>();
  const 原建 = p.createBuffer;
  const 原绑 = p.bindBuffer;
  const 原删 = p.deleteBuffer;
  p.createBuffer = function (this: object) {
    const b = 池(this).pop();
    if (b) {
      实验池数.复用++;
      待定.add(b);
      return b;
    }
    实验池数.新建++;
    return 原建.call(this);
  };
  p.bindBuffer = function (this: WebGL2RenderingContext, target: unknown, b: unknown) {
    if (b) {
      const o = b as object;
      if (待定.has(o)) {
        待定.delete(o);
        if (target === this.ELEMENT_ARRAY_BUFFER) {
          实验池数.替身++;
          替.set(o, 原建.call(this) as WebGLBuffer);
        }
      }
      const 真 = 替.get(o);
      if (真) return 原绑.call(this, target, 真);
      if (target === this.ARRAY_BUFFER) 绑过阵列.add(o);
    }
    return 原绑.call(this, target, b);
  };
  p.deleteBuffer = function (this: object, b: unknown) {
    const o = b as object | null;
    if (o) {
      const 真 = 替.get(o);
      if (真) {
        替.delete(o);
        原删.call(this, 真);
      } else if (实验回收门.开 && 绑过阵列.has(o) && 池(this).length < 上限) {
        池(this).push(o as WebGLBuffer);
        return;
      }
    }
    return 原删.call(this, b);
  };
}
