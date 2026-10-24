// 原版死亡画面（1.20.1 DeathScreen），画在成片分辨率的 2D 画布上，界面尺寸 6（界面 427 × 240），叠在游戏画面和聊天栏上：
// - 底：fillGradient 从上 0x60500000 到下 0xA0803030，逐行插（GPU 顶点色插值）；
// - 「你死了！」：pose 放大 2 倍后 drawCenteredString(宽/2/2, 30)（整数除法）；死因 (宽/2, 85)、「分数: 」+ 黄字分数 (宽/2, 100)；
// - 两个按钮（位置见 界面布局.ts）：底图 gui/widgets.png 的 (0, 46 + 20i)（i 0 不能按、1 平常、2 指着），字在按钮中线、y + 6，白字，不能按时 #A0A0A0；字都带原版阴影。
// 原版打开后头 20 刻两个按钮是灰的，这里一开就能按（演绎：三稿 5.65 打开、6.07 就点重生，只隔 10 帧）。点下去那一刻重生按钮变成不能按（原版 button.active = false）。
// 光标是系统的（Windows 经典箭头），一个光标像素 = 参数.ts 的 光标.像素 个成片像素，尖在光标位置。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { png } from '@engine/model/贴图.ts';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import type { 字段 } from '@库/界面/像素字表.ts';
import 按钮图 from 'asset:贴图/界面/原版按钮';
import { 光标 as 光标参数, 死亡画面字, 界面缩放 } from './参数.ts';
import { 按钮框, 界面宽 } from './界面布局.ts';
import { 第一晚像素字 } from './像素字.ts';

export type 按钮态 = '不能按' | '平常' | '指着';
/** 光标：界面坐标（可带小数，画的时候对到成片像素）；null 不画 */
export type 死亡画面态 = { 光标: readonly [number, number] | null; 重生: 按钮态 };

// Windows 经典箭头 12 × 19：B 黑边、W 白芯
const 箭头 = [
  'B',
  'BB',
  'BWB',
  'BWWB',
  'BWWWB',
  'BWWWWB',
  'BWWWWWB',
  'BWWWWWWB',
  'BWWWWWWWB',
  'BWWWWWWWWB',
  'BWWWWWWWWWB',
  'BWWWWWWBBBBB',
  'BWWWBWWB',
  'BWWBBWWB',
  'BWB  BWWB',
  'BB   BWWB',
  'B     BWWB',
  '      BWWB',
  '       BB',
];

const 底图色 = { 上: [0x50, 0x00, 0x00, 0x60], 下: [0x80, 0x30, 0x30, 0xa0] } as const;

const 按钮切片们 = new Map<number, HTMLCanvasElement>();
/** widgets.png 里第 v 行起的 200 × 20 一条，切成小画布（只切一次） */
const 按钮切片 = (v: number) => {
  let c = 按钮切片们.get(v);
  if (!c) {
    const t = png(按钮图);
    c = document.createElement('canvas');
    c.width = 200;
    c.height = 20;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(200, 20);
    for (let y = 0; y < 20; y++) img.data.set(t.px.subarray(((v + y) * t.w) * 4, ((v + y) * t.w + 200) * 4), y * 200 * 4);
    ctx.putImageData(img, 0, 0);
    按钮切片们.set(v, c);
  }
  return c;
};

const 按钮v = { 不能按: 46, 平常: 66, 指着: 86 } as const;

export const 死亡画面: React.FC<{ 态: 死亡画面态; 死因: string; 宽?: number; 高?: number }> = ({ 态, 死因, 宽 = 1280, 高 = 720 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 宽 * 成片倍数, H = 高 * 成片倍数;
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const t = (y + 0.5) / H;
      const c = 底图色.上.map((a, i) => Math.round(a + (底图色.下[i]! - a) * t));
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${c[3]! / 255})`;
      ctx.fillRect(0, y, W, 1);
    }
    const s = 界面缩放;
    const 字 = 第一晚像素字;
    const 原点 = { x: 0, y: 0 };
    const 中 = Math.trunc(界面宽(宽) / 2);
    const 居中 = (text: string | readonly 字段[], cx: number, y: number, 色: string, 尺 = s) =>
      字.画(ctx, text, 原点, cx - Math.trunc(字.字宽(text) / 2), y, 色, 尺, { 阴影: true });
    居中(死亡画面字.标题, Math.trunc(中 / 2), 30, '#FFFFFF', s * 2);
    居中(死因, 中, 85, '#FFFFFF');
    居中([{ text: 死亡画面字.分数前 }, { text: 死亡画面字.分数, color: '#FFFF55' }], 中, 100, '#FFFFFF');
    for (const i of [0, 1] as const) {
      const b = 按钮框(i, 宽, 高);
      const 态i: 按钮态 = i === 0 ? 态.重生 : '平常';
      ctx.drawImage(按钮切片(按钮v[态i]), b.x * s, b.y * s, b.w * s, b.h * s);
      居中(i === 0 ? 死亡画面字.重生 : 死亡画面字.标题屏幕, b.x + b.w / 2, b.y + 6, 态i === '不能按' ? '#A0A0A0' : '#FFFFFF');
    }
    if (态.光标) {
      const n = 光标参数.像素;
      const x0 = Math.round(态.光标[0] * s), y0 = Math.round(态.光标[1] * s);
      箭头.forEach((行, r) => {
        for (let q = 0; q < 行.length; q++) {
          const c = 行[q];
          if (c !== 'B' && c !== 'W') continue;
          ctx.fillStyle = c === 'B' ? '#000000' : '#FFFFFF';
          ctx.fillRect(x0 + q * n, y0 + r * n, n, n);
        }
      });
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
