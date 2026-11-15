// 第 11 句「绽」以后（按歌曲帧画）：最大那发炸开、咔哒一声闪白，画面定格，缩成一张拍立得（F2 截图，不画按键）；37.61 照片后面的世界碎成方块往下掉，
// 同一拍照片裁成正中的正方形、褪色蒙灰，分辨率一路降到 64×64，缩成画面中间的方形图标（第 0 镜「选择世界」里「新的世界」那个存档的图标），
// 同一帧聊天栏冒出黄字「Steve退出了游戏」；37.94 缩好，图标和聊天行一起定到第 12 句。F2 截图当存档图标、缩的过程都是演绎（见 门口之夜参数.ts 的 照片帧、下线图标）。
// 画法：定格帧起世界停在 照片帧（比定格帧晚 5/24 秒，白闪盖着看不出，见 门口之夜参数.ts），门口之夜画布 照常画（同一帧画出来逐像素一样），
// 每帧画完由 捕获 把各层拼进一张离屏画布，再画到上面两张合成画布上：底下那张是压暗、碎成方块的世界，上面那张是相纸、照片、闪白。
// 聊天栏夹在两张中间：它是游戏画面里的东西，照片盖在它上面，照片缩走时字从照片后面露出来，不横穿照片里的你和树苗（核查 10-24）。
// 版式数在 门口之夜参数.ts 的 照片版式、碎裂、下线图标、卡片。
// 拍立得的样子（相纸、白边比例、斜放、闪白）以这里为准，投影和相纸边那圈细暗线同 特效/拍立得.tsx；15 尾的合照照这个对齐。
// 干净的照片（没有歌词、聊天栏、相纸）是 核对-门口之夜照片 第 0 帧，64×64 的图标是第 2 帧（门口之夜图标）。
import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { fps } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLines9To11Events } from '../../分镜/正片第9至11句.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { line15ChatWidth } from '../../界面/聊天栏宽.ts';
import { polaroidShadow } from '../../特效/拍立得.tsx';
import { logoutIcon, photoCard, shatter, freezeFrame, photoFrame, photoLayout, chatScale } from './门口之夜参数.ts';
import { shadingBySeg } from '../../默认.ts';
import { DoorNightCanvas, type CaptureLayer } from './门口之夜画布.tsx';

const mainCutEvents = { ...lyricEvents, ...mainCutLines9To11Events };

const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
/** 照片是第 11 句（段 2-截图下线）截下的，2-空床 开头接着缩的也是这一张：光影跟着 2-截图下线 开不开走 */
const shading = shadingBySeg['2-截图下线'];
const holdFrame = freezeFrame;
const shatterFrame = mainCutEvents.worldShatters.帧;
const logOffFrame = mainCutEvents.logOff.帧;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 把 门口之夜画布 交出来的各层按位置拼进 W×H 的离屏画布（远景那块比画面高、不从顶边起） */
const composeLayers = (offscreen: HTMLCanvasElement, layers: readonly CaptureLayer[], W: number, H: number) => {
  if (offscreen.width !== W || offscreen.height !== H) Object.assign(offscreen, { width: W, height: H });
  const o = offscreen.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.clearRect(0, 0, W, H);
  for (const { 图: canvasImg, left, 上: top, 宽: width, 高: height } of layers) o.drawImage(canvasImg, Math.round(left * W), Math.round(top * H), Math.round(width * W), Math.round(height * H));
};
// 碎块晚多久掉：确定性的小抖动
const jitter = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** 定格以后这一帧的底（W×H 画布像素）：定住的世界压暗，碎裂起碎成方块往下掉；世界是离屏画布里那张 */
const drawBase = (ctx: CanvasRenderingContext2D, world: HTMLCanvasElement, frame: number, W: number, H: number) => {
  const layout = photoLayout;
  const u = W / (1280 * filmScale); // 一个成片像素几个画布像素
  const enterProgress = photoCard(frame, W, H).入;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // 底：定格的世界压暗；碎裂起碎成方块往下掉（下面的先掉，上面的晚到 最晚秒；晚多少连续取，原来取整到 1/24 秒，用户 11-03「统统改成 60 帧」）
  ctx.imageSmoothingEnabled = false;
  if (frame < shatterFrame) ctx.drawImage(world, 0, 0, W, H);
  else {
    const tileSize = shatter.块 * u;
    const cols = Math.ceil(W / tileSize), rows = Math.ceil(H / tileSize);
    const t0 = (frame - shatterFrame) / fps;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const lateSec = shatter.latestSec * (1 - j / rows) * 0.7 + shatter.latestSec * 0.3 * jitter(i, j);
        const t = Math.max(0, t0 - lateSec);
        const dy = 0.5 * shatter.重力 * u * t * t;
        const y = j * tileSize + dy;
        if (y >= H) continue;
        ctx.drawImage(world, i * tileSize, j * tileSize, tileSize, tileSize, i * tileSize, Math.round(y), tileSize, tileSize);
      }
  }
  ctx.fillStyle = `rgba(0, 0, 0, ${((1 - layout.baseDim) * enterProgress).toFixed(4)})`;
  ctx.fillRect(0, 0, W, H);
};

/** 画布 c 缩到 pw×ph：每次最多缩一半（一步缩太多，浏览器的插值会丢细节、出摩尔纹），最后一步正好到目标。
 *  演绎：原版 resizeSubRectTo 是一步缩到 64×64（STB），这里为了缩的过程和落定的图标不花才分几步 */
const stepDownScale = (c: CanvasImageSource & { width: number; height: number }, sx: number, sy: number, sw: number, sh: number, pw: number, ph: number, filter = 'none') => {
  let imageSource: CanvasImageSource = c, [x, y, w, h] = [sx, sy, sw, sh];
  for (;;) {
    const nw = Math.max(pw, Math.round(w / 2)), nh = Math.max(ph, Math.round(h / 2));
    const sameSize = nw === pw && nh === ph;
    const t = document.createElement('canvas');
    Object.assign(t, { width: nw, height: nh });
    const o = t.getContext('2d')!;
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    if (sameSize) o.filter = filter;
    o.drawImage(imageSource, x, y, w, h, 0, 0, nw, nh);
    if (sameSize) return t;
    [imageSource, x, y, w, h] = [t, 0, 0, nw, nh];
  }
};

/** 照片降到 点 那一档分辨率、褪了 下 那么多的小图（点 × 宽高比 个点）：下 = 1 时就是 64×64 的存档图标 */
const makeDotIcon = (world: HTMLCanvasElement, srcRect: readonly [number, number, number, number], dotCount: number, dropT: number) => {
  const [sx, sy, sw, sh] = srcRect;
  const ph = dotCount, pw = Math.max(1, Math.round((dotCount * sw) / sh));
  const t = stepDownScale(world, sx, sy, sw, sh, pw, ph, `saturate(${lerp(1, logoutIcon.saturation, dropT).toFixed(3)})`);
  const o = t.getContext('2d')!;
  o.filter = 'none';
  o.globalAlpha = dropT;
  o.fillStyle = logoutIcon.灰;
  o.fillRect(0, 0, pw, ph);
  return t;
};

/** 存档图标：定住的世界（W×H）裁正中的正方形、缩成 64×64、褪色蒙灰（原版 1.20.1 takeAutoScreenshot 的取法，见 门口之夜参数.ts 的 下线图标） */
const makeLogOffIcon = (world: HTMLCanvasElement) => {
  const W = world.width, H = world.height;
  return makeDotIcon(world, [(W - H) / 2, 0, H, H], logoutIcon.pointCount, 1);
};

/** 定格以后这一帧的上层（透明底）：拍立得和闪白。g = 离定格帧几秒 */
const drawCard = (ctx: CanvasRenderingContext2D, world: HTMLCanvasElement, frame: number, W: number, H: number) => {
  const layout = photoLayout;
  const g = (frame - holdFrame) / fps;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  // 拍立得：照片从整屏缩到 缩放、斜过去；下线起裁成正方形、褪色蒙灰、缩成图标（几何在 门口之夜参数.ts 的 卡片）
  const { 入: enterProgress, 下: dropT, s, w, h, borderWidth, bottomEdge, cx, cy, 角: angle, 源: srcRect, 点: dotCount } = photoCard(frame, W, H);
  const [sx, sy, sw, sh] = srcRect;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  if (borderWidth > 0.01) {
    // 相纸带投影（特效/拍立得.tsx 的 投影：页面像素，跟着卡片缩；画布的阴影不吃变换，自己乘）
    const scale = (W / 1280) * s;
    ctx.shadowColor = `rgba(0, 0, 0, ${(polaroidShadow.density * enterProgress * (1 - dropT)).toFixed(4)})`;
    ctx.shadowBlur = polaroidShadow.shadowBlur * scale;
    ctx.shadowOffsetY = polaroidShadow.shadowDrop * scale;
    ctx.fillStyle = layout.photoPaper;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - borderWidth, -h / 2 - borderWidth, w + 2 * borderWidth, h + borderWidth + bottomEdge, borderWidth * 0.12);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  if (dropT > 0) {
    // 下线：先在小图上降分辨率、褪色，再按最近邻放大（一个点一块方，落定时 8 个成片像素）
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(makeDotIcon(world, srcRect, dotCount, dropT), -w / 2, -h / 2, w, h);
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(world, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  }
  if (borderWidth > 0.01) {
    // 照片和相纸交界一圈很细的暗线（同 特效/拍立得.tsx）
    const lineWidth = Math.max(1, W / 1280) * s;
    ctx.strokeStyle = `rgba(0, 0, 0, ${(0.12 * enterProgress * (1 - dropT)).toFixed(4)})`;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(-w / 2 + lineWidth / 2, -h / 2 + lineWidth / 2, w - lineWidth, h - lineWidth);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 咔哒闪白
  if (g < layout.whiteFlashSec) {
    ctx.fillStyle = `rgba(255, 255, 255, ${((1 - g / layout.whiteFlashSec) ** 2).toFixed(4)})`;
    ctx.fillRect(0, 0, W, H);
  }
};

export const DoorwayNightPhoto: React.FC<{ 帧: number; prevFrame?: number; 宽?: number; 高?: number }> = ({ 帧: frame, prevFrame, 宽: width = 1280, 高: height = 720 }) => {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  const W = Math.round(width * dpr), H = Math.round(height * dpr);
  const offscreen = useMemo(() => document.createElement('canvas'), []);
  const isSettled = frame >= holdFrame;
  const composite = useCallback(
    (layers: readonly CaptureLayer[]) => {
      const bottomLayer = baseRef.current, c = ref.current;
      if (!bottomLayer || !c) return;
      composeLayers(offscreen, layers, W, H);
      drawBase(bottomLayer.getContext('2d')!, offscreen, frame, W, H);
      drawCard(c.getContext('2d')!, offscreen, frame, W, H);
    },
    [frame, W, H, offscreen],
  );
  return (
    <div style={{ position: 'relative', width: width, height: height, overflow: 'hidden', background: '#000' }}>
      <DoorNightCanvas 帧={isSettled ? photoFrame : frame} prevFrame={isSettled ? undefined : prevFrame} 宽={width} 高={height} capture={isSettled ? composite : undefined} style={isSettled ? { visibility: 'hidden' } : undefined} shading={shading} />
      {isSettled && <canvas ref={baseRef} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />}
      {frame >= logOffFrame && (
        <PixelChatBar
          lines={[{ text: 'Steve退出了游戏', color: yellow, startTick: 0 }]}
          刻={((frame - logOffFrame) / fps) * 20}
          缩放={chatScale}
          字体={pixelFont}
          宽={width}
          高={height}
          chatWidth={line15ChatWidth}
        />
      )}
      {isSettled && <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />}
    </div>
  );
};

/** 核对用：照片帧的世界缩成的 64×64 存档图标，最近邻放大到 边 个成片像素见方、放在画面正中（黑底） */
export const DoorwayNightIcon: React.FC<{ side: number; 宽?: number; 高?: number }> = ({ side, 宽: width = 1280, 高: height = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  const W = Math.round(width * dpr), H = Math.round(height * dpr);
  const offscreen = useMemo(() => document.createElement('canvas'), []);
  const composite = useCallback(
    (layers: readonly CaptureLayer[]) => {
      const c = ref.current;
      if (!c) return;
      composeLayers(offscreen, layers, W, H);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      const e = (side * W) / (1280 * filmScale);
      ctx.drawImage(makeLogOffIcon(offscreen), (W - e) / 2, (H - e) / 2, e, e);
    },
    [W, H, side, offscreen],
  );
  return (
    <div style={{ position: 'relative', width: width, height: height, overflow: 'hidden', background: '#000' }}>
      <DoorNightCanvas 帧={photoFrame} 宽={width} 高={height} capture={composite} style={{ visibility: 'hidden' }} />
      <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />
    </div>
  );
};
