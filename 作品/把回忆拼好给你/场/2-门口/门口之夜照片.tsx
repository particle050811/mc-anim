// 第 11 句「绽」以后（按歌曲帧画）：咔哒一声闪白，画面定格在最大那发炸开的一帧，缩成一张拍立得（F2 截图，不画按键）；37.61 照片完好、后面的世界碎成方块往下掉；
// 38.03 聊天栏黄字「Steve退出了游戏」，照片裁成正方形、褪色蒙灰，缩成画面正中的方形图标（第 0 镜 PCL 的图标「去年夏天那张合照」）。
// 画法：世界停在 第11句照片 那一帧（门口之夜画布 照常画，同一帧画出来逐像素一样），每帧画完由 捕获 把各层拼进一张离屏画布，
// 再画到上面这张合成画布上（碎块、相纸、闪白都在这里）。版式数在 门口之夜参数.ts 的 照片版式、碎裂、下线图标。
// 干净的照片（没有歌词、聊天栏、相纸）是 核对-门口之夜照片 第 0 帧。
import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { fps, 正片事件 } from '../../分镜.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 第15句聊天宽 } from '../../界面/聊天栏宽.ts';
import { 碎裂, 照片版式, 聊天缩放, 镜头, 下线图标 } from './门口之夜参数.ts';
import { 门口之夜画布 } from './门口之夜画布.tsx';

const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
const 定帧 = 正片事件.第11句照片.帧;
const 碎帧 = 正片事件.第11句碎裂.帧;
const 下帧 = 正片事件.第11句下线.帧;

const 夹 = (x: number) => Math.min(1, Math.max(0, x));
const 插 = (a: number, b: number, t: number) => a + (b - a) * t;
const 缓出 = (t: number) => 1 - (1 - t) ** 3;
const 缓 = (t: number) => t * t * (3 - 2 * t);
// 碎块晚几帧掉：确定性的小抖动
const 抖 = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** 把定格以后的一帧画到 ctx（W×H 画布像素）上；世界是离屏画布里那张。g = 歌曲帧 − 定格帧 */
const 画定格 = (ctx: CanvasRenderingContext2D, 世界: HTMLCanvasElement, 帧: number, W: number, H: number) => {
  const 版 = 照片版式;
  const u = W / (1280 * 成片倍数); // 一个成片像素几个画布像素
  const g = 帧 - 定帧;
  const 入 = 缓出(夹(g / 版.缩入帧));
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
  // 拍立得：照片从整屏缩到 缩放、斜过去；下线起裁成正方形、褪色蒙灰、缩成正中的图标
  const 下 = 帧 >= 下帧 ? 缓(夹((帧 - 下帧 + 1) / 下线图标.缩帧)) : 0;
  const s = 插(1, 版.缩放, 入);
  const 卡宽 = W * 版.缩放, 卡高 = H * 版.缩放;
  const 图标 = 下线图标.高 * H;
  const w = 帧 >= 下帧 ? 插(卡宽, 图标, 下) : W * s;
  const h = 帧 >= 下帧 ? 插(卡高, 图标, 下) : H * s;
  const 边 = 版.边 * W * s * (1 - 下);
  const 下边 = 版.下边 * W * s * (1 - 下);
  const 卡心y = 版.中心高 * H - (版.下边 - 版.边) * W * 版.缩放 * 0.5;
  const cx = W / 2;
  const cy = 插(插(H / 2, 卡心y, 入), H / 2, 下);
  const 角 = ((插(版.斜度 * 入, 0, 下) * Math.PI) / 180);
  // 源：整幅 → 以 中心x 为中的正方形（9 格 = 画面高）
  const 镜 = 镜头(定帧);
  const 方心 = W / 2 + (下线图标.中心x - 镜.中心[0]) * 16 * 镜.N * u;
  const 方边 = 下线图标.边格 * 16 * 镜.N * u;
  const sx = 插(0, 方心 - 方边 / 2, 下), sw = 插(W, 方边, 下);
  const sy = 插(0, (H - 方边) / 2, 下), sh = 插(H, 方边, 下);
  ctx.translate(cx, cy);
  ctx.rotate(角);
  if (边 > 0.01) {
    ctx.fillStyle = 版.相纸;
    ctx.fillRect(-w / 2 - 边, -h / 2 - 边, w + 2 * 边, h + 边 + 下边);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (下 > 0) ctx.filter = `saturate(${插(1, 下线图标.饱和, 下).toFixed(3)})`;
  ctx.drawImage(世界, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  ctx.filter = 'none';
  if (下 > 0) {
    ctx.globalAlpha = 下;
    ctx.fillStyle = 下线图标.灰;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 咔哒闪白
  if (g < 版.闪白帧) {
    ctx.fillStyle = `rgba(255, 255, 255, ${((1 - g / 版.闪白帧) ** 2).toFixed(4)})`;
    ctx.fillRect(0, 0, W, H);
  }
};

export const 门口之夜照片: React.FC<{ 帧: number; 宽?: number; 高?: number }> = ({ 帧, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = canvasDpr(1);
  const W = Math.round(宽 * dpr), H = Math.round(高 * dpr);
  const 离屏 = useMemo(() => document.createElement('canvas'), []);
  const 定了 = 帧 >= 定帧;
  const 合成 = useCallback(
    (层们: readonly CanvasImageSource[]) => {
      const c = ref.current;
      if (!c) return;
      if (离屏.width !== W || 离屏.height !== H) Object.assign(离屏, { width: W, height: H });
      const o = 离屏.getContext('2d')!;
      o.imageSmoothingEnabled = false;
      o.clearRect(0, 0, W, H);
      for (const 层 of 层们) o.drawImage(层, 0, 0, W, H);
      画定格(c.getContext('2d')!, 离屏, 帧, W, H);
    },
    [帧, W, H, 离屏],
  );
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden', background: '#000' }}>
      <门口之夜画布 帧={Math.min(帧, 定帧)} 宽={宽} 高={高} 气泡={false} 捕获={定了 ? 合成 : undefined} style={定了 ? { visibility: 'hidden' } : undefined} />
      {定了 && <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />}
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
    </div>
  );
};
