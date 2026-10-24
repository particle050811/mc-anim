// 第 11 句「绽」以后（按歌曲帧画）：最大那发炸开、咔哒一声闪白，画面定格，缩成一张拍立得（F2 截图，不画按键）；37.61 照片完好、后面的世界碎成方块往下掉；
// 37.61 照片裁成正中的正方形、褪色蒙灰，分辨率一路降到 64×64，缩成画面中间的方形图标（第 0 镜「选择世界」里「新的世界」那个存档的图标），
// 同一帧聊天栏冒出黄字「Steve退出了游戏」；37.94 缩好，图标和聊天行一起定到第 12 句。
// 画法：定格帧起世界停在 照片帧（比定格帧晚 5 帧，白闪盖着看不出，见 门口之夜参数.ts），门口之夜画布 照常画（同一帧画出来逐像素一样），
// 每帧画完由 捕获 把各层拼进一张离屏画布，再画到上面两张合成画布上：底下那张是压暗、碎成方块的世界，上面那张是相纸、照片、闪白。
// 聊天栏夹在两张中间：它是游戏画面里的东西，照片盖在它上面，照片缩走时字从照片后面露出来，不横穿照片里的你和树苗（核查 10-24）。
// 版式数在 门口之夜参数.ts 的 照片版式、碎裂、下线图标、卡片。
// 拍立得的样子（相纸、白边比例、斜放、闪白）以这里为准，投影和相纸边那圈细暗线同 特效/拍立得.tsx；15 尾的合照照这个对齐。
// 干净的照片（没有歌词、聊天栏、相纸）是 核对-门口之夜照片 第 0 帧，64×64 的图标是第 2 帧（门口之夜图标）。
import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { fps, 正片事件 } from '../../分镜.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 第15句聊天宽 } from '../../界面/聊天栏宽.ts';
import { 投影 } from '../../特效/拍立得.tsx';
import { 下线图标, 卡片, 碎裂, 定格帧, 照片帧, 照片版式, 聊天缩放 } from './门口之夜参数.ts';
import { 门口之夜画布 } from './门口之夜画布.tsx';

const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
const 定帧 = 定格帧;
const 碎帧 = 正片事件.第11句碎裂.帧;
const 下帧 = 正片事件.第11句下线.帧;

const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
// 碎块晚几帧掉：确定性的小抖动
const 抖 = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** 定格以后这一帧的底（W×H 画布像素）：定住的世界压暗，碎裂起碎成方块往下掉；世界是离屏画布里那张 */
const 画底 = (ctx: CanvasRenderingContext2D, 世界: HTMLCanvasElement, 帧: number, W: number, H: number) => {
  const 版 = 照片版式;
  const u = W / (1280 * 成片倍数); // 一个成片像素几个画布像素
  const 入 = 卡片(帧, W, H).入;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // 底：定格的世界压暗；碎裂起碎成方块往下掉（下面的先掉，上面的晚到 最晚帧）
  ctx.imageSmoothingEnabled = false;
  if (帧 < 碎帧) ctx.drawImage(世界, 0, 0, W, H);
  else {
    const 块 = 碎裂.块 * u;
    const 列 = Math.ceil(W / 块), 行 = Math.ceil(H / 块);
    const t0 = 帧 - 碎帧;
    for (let j = 0; j < 行; j++)
      for (let i = 0; i < 列; i++) {
        const 晚 = Math.round(碎裂.最晚帧 * (1 - j / 行) * 0.7 + 碎裂.最晚帧 * 0.3 * 抖(i, j));
        const t = Math.max(0, t0 - 晚);
        const dy = 0.5 * 碎裂.重力 * u * t * t;
        const y = j * 块 + dy;
        if (y >= H) continue;
        ctx.drawImage(世界, i * 块, j * 块, 块, 块, i * 块, Math.round(y), 块, 块);
      }
  }
  ctx.fillStyle = `rgba(0, 0, 0, ${((1 - 版.底暗) * 入).toFixed(4)})`;
  ctx.fillRect(0, 0, W, H);
};

/** 画布 c 缩到 pw×ph：每次最多缩一半（一步缩太多，浏览器的插值会丢细节、出摩尔纹），最后一步正好到目标 */
const 逐级缩 = (c: CanvasImageSource & { width: number; height: number }, sx: number, sy: number, sw: number, sh: number, pw: number, ph: number, filter = 'none') => {
  let 源: CanvasImageSource = c, [x, y, w, h] = [sx, sy, sw, sh];
  for (;;) {
    const nw = Math.max(pw, Math.round(w / 2)), nh = Math.max(ph, Math.round(h / 2));
    const 末 = nw === pw && nh === ph;
    const t = document.createElement('canvas');
    Object.assign(t, { width: nw, height: nh });
    const o = t.getContext('2d')!;
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    if (末) o.filter = filter;
    o.drawImage(源, x, y, w, h, 0, 0, nw, nh);
    if (末) return t;
    [源, x, y, w, h] = [t, 0, 0, nw, nh];
  }
};

/** 照片降到 点 那一档分辨率、褪了 下 那么多的小图（点 × 宽高比 个点）：下 = 1 时就是 64×64 的存档图标 */
const 降点图 = (世界: HTMLCanvasElement, 源: readonly [number, number, number, number], 点: number, 下: number) => {
  const [sx, sy, sw, sh] = 源;
  const ph = 点, pw = Math.max(1, Math.round((点 * sw) / sh));
  const t = 逐级缩(世界, sx, sy, sw, sh, pw, ph, `saturate(${插(1, 下线图标.饱和, 下).toFixed(3)})`);
  const o = t.getContext('2d')!;
  o.filter = 'none';
  o.globalAlpha = 下;
  o.fillStyle = 下线图标.灰;
  o.fillRect(0, 0, pw, ph);
  return t;
};

/** 存档图标：定住的世界（W×H）裁正中的正方形、缩成 64×64、褪色蒙灰（原版 1.20.1 takeAutoScreenshot 的取法，见 门口之夜参数.ts 的 下线图标） */
const 下线图标图 = (世界: HTMLCanvasElement) => {
  const W = 世界.width, H = 世界.height;
  return 降点图(世界, [(W - H) / 2, 0, H, H], 下线图标.点数, 1);
};

/** 定格以后这一帧的上层（透明底）：拍立得和闪白。g = 歌曲帧 − 定格帧 */
const 画卡 = (ctx: CanvasRenderingContext2D, 世界: HTMLCanvasElement, 帧: number, W: number, H: number) => {
  const 版 = 照片版式;
  const g = 帧 - 定帧;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  // 拍立得：照片从整屏缩到 缩放、斜过去；下线起裁成正方形、褪色蒙灰、缩成图标（几何在 门口之夜参数.ts 的 卡片）
  const { 入, 下, s, w, h, 边, 下边, cx, cy, 角, 源, 点 } = 卡片(帧, W, H);
  const [sx, sy, sw, sh] = 源;
  ctx.translate(cx, cy);
  ctx.rotate(角);
  if (边 > 0.01) {
    // 相纸带投影（特效/拍立得.tsx 的 投影：页面像素，跟着卡片缩；画布的阴影不吃变换，自己乘）
    const 页 = (W / 1280) * s;
    ctx.shadowColor = `rgba(0, 0, 0, ${(投影.浓度 * 入 * (1 - 下)).toFixed(4)})`;
    ctx.shadowBlur = 投影.模糊 * 页;
    ctx.shadowOffsetY = 投影.下错 * 页;
    ctx.fillStyle = 版.相纸;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - 边, -h / 2 - 边, w + 2 * 边, h + 边 + 下边, 边 * 0.12);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  if (下 > 0) {
    // 下线：先在小图上降分辨率、褪色，再按最近邻放大（一个点一块方，落定时 8 个成片像素）
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(降点图(世界, 源, 点, 下), -w / 2, -h / 2, w, h);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(世界, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  }
  if (边 > 0.01) {
    // 照片和相纸交界一圈很细的暗线（同 特效/拍立得.tsx）
    const 线 = Math.max(1, W / 1280) * s;
    ctx.strokeStyle = `rgba(0, 0, 0, ${(0.12 * 入 * (1 - 下)).toFixed(4)})`;
    ctx.lineWidth = 线;
    ctx.strokeRect(-w / 2 + 线 / 2, -h / 2 + 线 / 2, w - 线, h - 线);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 咔哒闪白
  if (g < 版.闪白帧) {
    ctx.fillStyle = `rgba(255, 255, 255, ${((1 - g / 版.闪白帧) ** 2).toFixed(4)})`;
    ctx.fillRect(0, 0, W, H);
  }
};

export const 门口之夜照片: React.FC<{ 帧: number; 宽?: number; 高?: number }> = ({ 帧, 宽 = 1280, 高 = 720 }) => {
  const ref底 = useRef<HTMLCanvasElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  const W = Math.round(宽 * dpr), H = Math.round(高 * dpr);
  const 离屏 = useMemo(() => document.createElement('canvas'), []);
  const 定了 = 帧 >= 定帧;
  const 合成 = useCallback(
    (层们: readonly CanvasImageSource[]) => {
      const 底 = ref底.current, c = ref.current;
      if (!底 || !c) return;
      if (离屏.width !== W || 离屏.height !== H) Object.assign(离屏, { width: W, height: H });
      const o = 离屏.getContext('2d')!;
      o.imageSmoothingEnabled = false;
      o.clearRect(0, 0, W, H);
      for (const 层 of 层们) o.drawImage(层, 0, 0, W, H);
      画底(底.getContext('2d')!, 离屏, 帧, W, H);
      画卡(c.getContext('2d')!, 离屏, 帧, W, H);
    },
    [帧, W, H, 离屏],
  );
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden', background: '#000' }}>
      <门口之夜画布 帧={定了 ? 照片帧 : 帧} 宽={宽} 高={高} 捕获={定了 ? 合成 : undefined} style={定了 ? { visibility: 'hidden' } : undefined} />
      {定了 && <canvas ref={ref底} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />}
      {帧 >= 下帧 && (
        <像素聊天栏
          lines={[{ text: 'Steve退出了游戏', color: 黄, 起刻: 0 }]}
          刻={((帧 - 下帧) / fps) * 20}
          缩放={聊天缩放}
          字体={像素字}
          宽={宽}
          高={高}
          聊天宽={第15句聊天宽}
        />
      )}
      {定了 && <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />}
    </div>
  );
};

/** 核对用：照片帧的世界缩成的 64×64 存档图标，最近邻放大到 边 个成片像素见方、放在画面正中（黑底） */
export const 门口之夜图标: React.FC<{ 边: number; 宽?: number; 高?: number }> = ({ 边, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  const W = Math.round(宽 * dpr), H = Math.round(高 * dpr);
  const 离屏 = useMemo(() => document.createElement('canvas'), []);
  const 合成 = useCallback(
    (层们: readonly CanvasImageSource[]) => {
      const c = ref.current;
      if (!c) return;
      Object.assign(离屏, { width: W, height: H });
      const o = 离屏.getContext('2d')!;
      o.imageSmoothingEnabled = false;
      for (const 层 of 层们) o.drawImage(层, 0, 0, W, H);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      const e = (边 * W) / (1280 * 成片倍数);
      ctx.drawImage(下线图标图(离屏), (W - e) / 2, (H - e) / 2, e, e);
    },
    [W, H, 边, 离屏],
  );
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden', background: '#000' }}>
      <门口之夜画布 帧={照片帧} 宽={宽} 高={高} 捕获={合成} style={{ visibility: 'hidden' }} />
      <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />
    </div>
  );
};
