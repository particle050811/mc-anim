// 临时插桩（渲染归因实验，不合并）：ANIM_Z=4 开。按 GL buffer 身份给每帧上传字节分类，并按帧缓冲分段量 GPU 时间（EXT_disjoint_timer_query_webgl2，有才量）。
// 分类：首次上传（数组和内容都没见过）、kept 重传（同一个数组对象再传，前一个 buffer 已删=淘汰后重建；没删=换上下文或同时持有）、内容相同新数组（工人重算出一样的）、同 buffer 重传、动态修改（bufferSubData）、只分配（只给大小）；索引单独算。
import { 桩, 桩级别, 环境 } from './桩.ts';

// 按遍标段：ANIM_Z=4 的定时查询、ANIM_Z=5 的同步都按这个名字分。名字为 null 结束这一帧的段（不把帧间空闲算进最后一段）
let 标段实现: ((gl: WebGL2RenderingContext, 名: string | null) => void) | null = null;
export const 标段 = (gl: WebGL2RenderingContext, 名: string | null) => 标段实现?.(gl, 名);

const 体素标 = new WeakMap<object, string>();
export const 标体素 = (a: object, 名: string) => {
  if (桩级别 === 4) 体素标.set(a, 名);
};

type 信 = { id: number; 删: boolean; 传次: number; 字节: number };
let 栈样 = 0;
const 指纹 = (d: ArrayBufferView) => {
  const u = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
  let h = 2166136261 ^ u.length;
  const 步 = Math.max(1, Math.floor(u.length / 256));
  for (let i = 0; i < u.length; i += 步) h = Math.imul(h ^ u[i]!, 16777619);
  return `${u.length}:${h >>> 0}`;
};

if (桩级别 === 4 && typeof WebGL2RenderingContext !== 'undefined') {
  const p = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const 信表 = new WeakMap<object, 信>();
  let 下号 = 0;
  const 绑 = new Map<number, 信 | null>();
  const 数组主 = new WeakMap<object, 信[]>(); // 这个 CPU 数组传过哪些 buffer
  const 内容 = new Set<string>();
  const 原create = p.createBuffer;
  p.createBuffer = function (this: unknown) {
    const t = performance.now();
    const b = 原create.call(this) as object;
    const 花 = performance.now() - t;
    桩.加('buf建ms', 花);
    if (花 >= 0.5) {
      桩.加('buf建慢n', 1);
      桩.加('buf建慢ms', 花);
    }
    信表.set(b, { id: 下号++, 删: false, 传次: 0, 字节: 0 });
    桩.加('buf建n', 1);
    return b;
  };
  const 原vao = p.createVertexArray;
  p.createVertexArray = function (this: unknown) {
    const t = performance.now();
    const r = 原vao.call(this);
    桩.加('vao建ms', performance.now() - t);
    桩.加('vao建n', 1);
    return r;
  };
  const 原delete = p.deleteBuffer;
  p.deleteBuffer = function (this: unknown, b: unknown) {
    const x = b ? 信表.get(b as object) : null;
    if (x) {
      x.删 = true;
      桩.加('buf删n', 1);
      桩.加('buf删字节', x.字节);
    }
    return 原delete.call(this, b);
  };
  const 原bind = p.bindBuffer;
  p.bindBuffer = function (this: unknown, target: unknown, b: unknown) {
    绑.set(target as number, b ? (信表.get(b as object) ?? null) : null);
    return 原bind.call(this, target, b);
  };
  const 记 = (类: string, 字节: number, ms: number) => {
    桩.加(`传字节:${类}`, 字节);
    桩.加(`传n:${类}`, 1);
    桩.加(`传ms:${类}`, ms);
  };
  const 原data = p.bufferData;
  p.bufferData = function (this: WebGL2RenderingContext, target: unknown, d: unknown, usage: unknown, ...r: unknown[]) {
    const t = performance.now();
    const 返 = 原data.call(this, target, d, usage, ...r);
    const ms = performance.now() - t;
    const 索引 = target === this.ELEMENT_ARRAY_BUFFER;
    const b = 绑.get(target as number) ?? null;
    if (typeof d === 'number') {
      记(`只分配${索引 ? '索引' : ''}`, d, ms);
      if (b) b.字节 = d;
      return 返;
    }
    const v = d as ArrayBufferView;
    const 名 = 索引 ? '索引' : (体素标.get(v) ?? '其它');
    const 字节 = v.byteLength;
    const 主 = 数组主.get(v);
    const 印 = 指纹(v);
    let 类: string;
    if (b && b.传次 > 0) 类 = '同buffer重传';
    else if (主?.length) 类 = 主.some((m) => !m.删) ? '同数组再传-旧buffer还在' : '同数组再传-淘汰后重建';
    else if (内容.has(印)) 类 = '内容相同新数组';
    else 类 = '首次上传';
    内容.add(印);
    if (b) {
      b.传次++;
      b.字节 = 字节;
      if (主) 主.push(b);
      else 数组主.set(v, [b]);
    }
    记(`${名}:${类}`, 字节, ms);
    if (类 === '内容相同新数组' && 名 !== '体素pos' && !名.startsWith('体素') && 栈样 < 12 && 桩.当前帧() % 7 === 0) {
      栈样++;
      桩.事件('重复上传栈', { 名, 字节, 栈: new Error().stack?.split('\n').slice(2, 30).map((x) => x.trim().replace(/http:\/\/[^ ]*\//, '')) });
    }
    if (名 === '索引') 桩.事件('索引上传', { 字节, 类, buf: b?.id });
    return 返;
  };
  const 原sub = p.bufferSubData;
  p.bufferSubData = function (this: WebGL2RenderingContext, target: unknown, off: unknown, d: unknown, ...r: unknown[]) {
    const t = performance.now();
    const 返 = 原sub.call(this, target, off, d, ...r);
    const ms = performance.now() - t;
    const v = d as ArrayBufferView & { BYTES_PER_ELEMENT?: number };
    const 字节 = r.length >= 2 && r[1] ? (r[1] as number) * (v.BYTES_PER_ELEMENT ?? 1) : v.byteLength;
    记(`动态修改:${target === this.ELEMENT_ARRAY_BUFFER ? '索引' : (体素标.get(v) ?? '其它')}`, 字节, ms);
    return 返;
  };

  // GPU 时间：绑定的绘制帧缓冲一换就结束上一段、开下一段（WebGL 不许嵌套）。结果异步，事件里按当时的帧号记
  const 帧缓冲名 = new WeakMap<object, string>();
  let 下帧缓冲 = 0;
  type 段 = { q: WebGLQuery; 名: string; f: number };
  const 待 = new Map<object, { 段们: 段[]; 开: 段 | null; ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null | undefined }>();
  const 态 = (gl: WebGL2RenderingContext) => {
    let s = 待.get(gl);
    if (!s) {
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
      桩.事件('定时查询', { 有: !!ext, 渲染器: gl.getParameter(gl.VERSION) });
      s = { 段们: [], 开: null, ext };
      待.set(gl, s);
    }
    return s;
  };
  const 收 = (gl: WebGL2RenderingContext, s: NonNullable<ReturnType<typeof 待.get>>) => {
    const 断 = s.ext ? gl.getParameter(s.ext.GPU_DISJOINT_EXT) : false;
    while (s.段们.length) {
      const x = s.段们[0]!;
      if (!gl.getQueryParameter(x.q, gl.QUERY_RESULT_AVAILABLE)) break;
      s.段们.shift();
      const ns = gl.getQueryParameter(x.q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(x.q);
      桩.事件('gpu', { f: x.f, 名: x.名, ms: ns / 1e6, 断 });
    }
  };
  const 换段 = (gl: WebGL2RenderingContext, 名: string | null) => {
    const s = 态(gl);
    if (!s.ext) return;
    if (s.开) {
      gl.endQuery(s.ext.TIME_ELAPSED_EXT);
      s.段们.push(s.开);
      s.开 = null;
    }
    收(gl, s);
    if (名 === null) return;
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(s.ext.TIME_ELAPSED_EXT, q);
    s.开 = { q, 名, f: 桩.当前帧() };
  };
  标段实现 = (gl, 名) => {
    前缀 = 名;
    换段(gl, 名);
  };
  let 前缀: string | null = null;
  const 原fb = p.bindFramebuffer;
  p.bindFramebuffer = function (this: WebGL2RenderingContext, target: unknown, fb: unknown) {
    const r = 原fb.call(this, target, fb);
    if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) {
      let n = '屏';
      if (fb) {
        n = 帧缓冲名.get(fb as object) ?? '';
        if (!n) 帧缓冲名.set(fb as object, (n = `fb${下帧缓冲++}`));
      }
      if (前缀 !== null) 换段(this, `${前缀}/${n}`);
      else 换段(this, n);
    }
    return r;
  };
}

// 微测（ANIM_Z=4）：这一帧画完、读回一个像素等 GPU 空了以后，在当前上下文连建 1000 个 buffer、VAO 再删，比一个新上下文。分清慢在当前上下文活着的对象多，还是调用本身
export const 微测建对象 = (gl: WebGL2RenderingContext) => {
  if (桩级别 !== 4 || !环境.ANIM_微测 || 桩.当前帧() % 13 !== 0) return;
  const px = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const 测 = (g: WebGL2RenderingContext) => {
    const ts: Record<string, number> = {};
    let t = performance.now();
    const bs = Array.from({ length: 1000 }, () => g.createBuffer());
    ts.建buffer = performance.now() - t;
    t = performance.now();
    for (const b of bs) g.deleteBuffer(b);
    ts.删buffer = performance.now() - t;
    t = performance.now();
    const vs = Array.from({ length: 1000 }, () => g.createVertexArray());
    ts.建vao = performance.now() - t;
    t = performance.now();
    for (const v of vs) g.deleteVertexArray(v);
    ts.删vao = performance.now() - t;
    return ts;
  };
  const 当前 = 测(gl);
  const c = document.createElement('canvas');
  const g2 = c.getContext('webgl2');
  const 新 = g2 ? 测(g2) : null;
  g2?.getExtension('WEBGL_lose_context')?.loseContext();
  桩.事件('微测', { 当前, 新 });
};

// ANIM_Z=5：串行 GPU。绘制帧缓冲一换，就用一个 1×1 小图 clear + readPixels 等队列排空，量等了多久（等待是下限，两次同步之间的墙钟是上限）。只量分解，不和正式数比
if (桩级别 === 5 && typeof WebGL2RenderingContext !== 'undefined') {
  const p = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const 名表 = new WeakMap<object, string>();
  let 下 = 0;
  const 原fb = p.bindFramebuffer;
  const 小 = new WeakMap<object, WebGLFramebuffer>();
  let 当前 = '屏';
  let 上同步 = 0;
  const px = new Uint8Array(4);
  const 同步 = (gl: WebGL2RenderingContext) => {
    let f = 小.get(gl);
    if (!f) {
      const tex = gl.createTexture();
      const 旧纹 = gl.getParameter(gl.TEXTURE_BINDING_2D);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
      gl.bindTexture(gl.TEXTURE_2D, 旧纹);
      f = gl.createFramebuffer()!;
      const 旧 = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      原fb.call(gl, gl.DRAW_FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      原fb.call(gl, gl.DRAW_FRAMEBUFFER, 旧);
      小.set(gl, f);
    }
    const 读 = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    const 画 = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    const 剪 = gl.isEnabled(gl.SCISSOR_TEST);
    const 掩 = gl.getParameter(gl.COLOR_WRITEMASK) as boolean[];
    if (剪) gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    原fb.call(gl, gl.DRAW_FRAMEBUFFER, f);
    原fb.call(gl, gl.READ_FRAMEBUFFER, f);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    const t = performance.now();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const 后 = performance.now();
    原fb.call(gl, gl.READ_FRAMEBUFFER, 读);
    原fb.call(gl, gl.DRAW_FRAMEBUFFER, 画);
    if (剪) gl.enable(gl.SCISSOR_TEST);
    gl.colorMask(掩[0]!, 掩[1]!, 掩[2]!, 掩[3]!);
    桩.加(`等GPU:${当前}ms`, 后 - t);
    if (上同步) 桩.加(`段墙钟:${当前}ms`, 后 - 上同步);
    上同步 = performance.now();
  };
  let 前缀: string | null = null;
  标段实现 = (gl, 名) => {
    同步(gl);
    前缀 = 名;
    当前 = 名 ?? '帧间';
  };
  p.bindFramebuffer = function (this: WebGL2RenderingContext, target: unknown, fb: unknown) {
    if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER) {
      const 将 = fb ? (名表.get(fb as object) ?? '') : '屏';
      同步(this);
      let n = 将;
      if (fb && !n) 名表.set(fb as object, (n = `fb${下++}`));
      当前 = 前缀 === null ? n : `${前缀}/${n}`;
    }
    return 原fb.call(this, target, fb);
  };
}
