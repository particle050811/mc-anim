// 临时插桩（渲染优化实验，不合并）：把体素等待拆开量。renderMedia 的 envVariables 给 ANIM_Z=1 才开；开了每帧 console.log 一行「@桩 {json}」，测速.ts 收进文件。
// 一行是自上一行以来的增量，同一帧可能几行，分析时按 f 相加。ms 结尾的是累计毫秒，n 结尾的是个数；工人里量的（*工人）是各工人 CPU 时间相加，不是墙钟。
const env: Record<string, string> = (() => {
  try {
    return JSON.parse((globalThis as unknown as { remotion_envVariables?: string }).remotion_envVariables ?? '{}');
  } catch {
    return {};
  }
})();
export const 桩级别 = Number(env.ANIM_Z ?? 0);
export const 桩开 = 桩级别 > 0;
export const 环境 = env;

let 帧号 = -1;
let 记录: Record<string, number> = {};
const 记段 = new Map<string, number>(); // 区段键 → 建过几次（不分帧，整次渲染）
export const 桩 = {
  帧(f: number) {
    if (!桩开 || f === 帧号) return;
    桩.写();
    帧号 = f;
  },
  加(k: string, v: number) {
    if (桩开) 记录[k] = (记录[k] ?? 0) + v;
  },
  取最大(k: string, v: number) {
    if (桩开) 记录[k] = Math.max(记录[k] ?? 0, v);
  },
  建过(k: string) {
    if (!桩开) return;
    const n = (记段.get(k) ?? 0) + 1;
    记段.set(k, n);
    桩.加('建网格n', 1);
    if (n > 1) 桩.加('重建n', 1);
  },
  写() {
    if (!桩开 || !Object.keys(记录).length) return;
    console.log('@桩 ' + JSON.stringify({ f: 帧号, t: Math.round(performance.now()), ...记录 }));
    记录 = {};
  },
  事件(类: string, 数据: unknown) {
    if (桩开) console.log('@桩事件 ' + JSON.stringify({ 类, f: 帧号, 数据 }));
  },
};

// WebGL 调用按绑定的帧缓冲分组计数：draw 次数、三角形数、CPU 上的调用时间；bufferData 的字节和时间（上传）
if (桩开 && typeof WebGL2RenderingContext !== 'undefined') {
  const p = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const fbNames = new WeakMap<object, string>();
  let nextFb = 0;
  let cur = 'fb屏';
  const bind = p.bindFramebuffer;
  p.bindFramebuffer = function (this: WebGL2RenderingContext, target: unknown, fb: unknown) {
    if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) {
      if (!fb) cur = 'fb屏';
      else {
        let n = fbNames.get(fb as object);
        if (!n) fbNames.set(fb as object, (n = `fb${nextFb++}`));
        cur = n;
      }
    }
    return bind.call(this, target, fb);
  };
  const wrapDraw = (name: string, countArg: number, instArg: number | null) => {
    const orig = p[name];
    p[name] = function (this: unknown, ...a: unknown[]) {
      const t = performance.now();
      const r = orig.apply(this, a);
      桩.加('draw调用ms', performance.now() - t);
      桩.加(`${cur}draw`, 1);
      桩.加(`${cur}三角`, ((a[countArg] as number) / 3) * (instArg === null ? 1 : (a[instArg] as number)));
      return r;
    };
  };
  wrapDraw('drawElements', 1, null);
  wrapDraw('drawArrays', 2, null);
  wrapDraw('drawElementsInstanced', 1, 4);
  wrapDraw('drawArraysInstanced', 2, 3);
  for (const name of ['bufferData', 'bufferSubData']) {
    const orig = p[name];
    p[name] = function (this: unknown, ...a: unknown[]) {
      const t = performance.now();
      const r = orig.apply(this, a);
      桩.加('上传ms', performance.now() - t);
      const d = a[name === 'bufferData' ? 1 : 2] as { byteLength?: number } | number;
      桩.加('上传字节', typeof d === 'number' ? d : (d?.byteLength ?? 0));
      桩.加('上传n', 1);
      return r;
    };
  }
  for (const name of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'compileShader', 'linkProgram']) {
    const orig = p[name];
    p[name] = function (this: unknown, ...a: unknown[]) {
      const t = performance.now();
      const r = orig.apply(this, a);
      桩.加(name.startsWith('tex') ? '贴图上传ms' : '着色器ms', performance.now() - t);
      return r;
    };
  }
}
