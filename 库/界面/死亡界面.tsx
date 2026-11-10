// 原版死亡界面（1.20.1 DeathScreen）。几何、颜色照 client jar（先例：把回忆拼好给你 3e31b8b4 的 场/2-第一晚/死亡画面.tsx，10-24 删了，这里改成共用件）：
// - 底：fillGradient(0, 0, 宽, 高, 0x60500000, 0xA0803030)，从上往下逐行插；
// - 「你死了！」：pose 放大 2 倍后 drawCenteredString(宽/2/2, 30)（整数除法）；死因 (宽/2, 85)；「分数: 」+ 黄字分数 (宽/2, 100)；字都是白的、带原版阴影；
// - 两个按钮 200 × 20 在 (宽/2 − 100, 高/4 + 72 + 24i)：底图 gui/widgets.png 的 (0, 46 + 20i)（i 0 不能按、1 平常、2 指着），字在按钮中线、y + 6，不能按时 #A0A0A0；
// - 打开后头 20 刻两个按钮不能按（tick 里 delayTicker 到 20 才 setButtonsActive(true)），点下去那个按钮又变成不能按（button.active = false）。
// 字用系统中文字体（基础.tsx 的 UiText，同 聊天栏.tsx），不是游戏点阵。光标是系统的（Windows 经典箭头 12 × 19），游戏里没有，录屏里才有。
// widgets.png 由作品传进来（作品资产表里的 id 不一样：贴图/法术/minecraft/gui/widgets、贴图/界面/原版按钮，字节都是 client jar 那一张）。
import React, { useLayoutEffect, useRef } from 'react';
import type { Png } from '../../engine/model/贴图.ts';
import { UiText } from './基础.tsx';

/** 原版 zh_cn（1.20.1，资源索引 5）：deathScreen.title、deathScreen.score、deathScreen.respawn、deathScreen.titleScreen */
export const 死亡界面字 = { 标题: '你死了！', 分数: '分数', 重生: '重生', 标题屏幕: '标题屏幕' } as const;
/** 打开后几刻按钮才能按 */
export const 死亡界面按钮延迟刻 = 20;

export type 死亡界面按钮态 = '不能按' | '平常' | '指着';
const 按钮v: Record<死亡界面按钮态, number> = { 不能按: 46, 平常: 66, 指着: 86 };

/** 界面尺寸（GUI 像素）：窗口 ÷ 缩放，向上取整（Window.calculateScale 之后的 guiScaledWidth） */
export const 界面尺寸 = (宽: number, 高: number, s: number) => ({ 宽: Math.ceil(宽 / s), 高: Math.ceil(高 / s) });

/** 第 i 个按钮（0 重生、1 标题屏幕）的框，GUI 像素 */
export const 死亡界面按钮框 = (i: 0 | 1, 界宽: number, 界高: number) => ({ x: Math.trunc(界宽 / 2) - 100, y: Math.trunc(界高 / 4) + 72 + 24 * i, w: 200, h: 20 });
/** 光标（GUI 像素）在不在第 i 个按钮上（AbstractWidget.isMouseOver：[x, x + 宽) × [y, y + 高)） */
export const 在死亡界面按钮上 = (i: 0 | 1, x: number, y: number, 界宽: number, 界高: number) => {
  const b = 死亡界面按钮框(i, 界宽, 界高);
  return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
};

// Windows 经典箭头：B 黑边、W 白芯（同 3e31b8b4 的死亡画面）
const 箭头 = ['B', 'BB', 'BWB', 'BWWB', 'BWWWB', 'BWWWWB', 'BWWWWWB', 'BWWWWWWB', 'BWWWWWWWB', 'BWWWWWWWWB', 'BWWWWWWWWWB', 'BWWWWWWBBBBB', 'BWWWBWWB', 'BWWBBWWB', 'BWB  BWWB', 'BB   BWWB', 'B     BWWB', '      BWWB', '       BB'];

/** widgets.png 里第 v 行起的 200 × 20 一条，逐像素放大 */
const 按钮底: React.FC<{ 图: Png; v: number; 左: number; 上: number; s: number }> = ({ 图, v, 左, 上, s }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(200, 20);
    for (let y = 0; y < 20; y++) img.data.set(图.px.subarray((v + y) * 图.w * 4, ((v + y) * 图.w + 200) * 4), y * 200 * 4);
    ctx.putImageData(img, 0, 0);
  }, [图, v]);
  return <canvas ref={ref} width={200} height={20} style={{ position: 'absolute', left: 左 * s, top: 上 * s, width: 200 * s, height: 20 * s, imageRendering: 'pixelated' }} />;
};

/** 一行居中的字：x 是中线、y 是字顶（GUI 像素）；倍 = pose 放大（标题 2） */
const 居中字: React.FC<{ x: number; y: number; s: number; 倍?: number; children: React.ReactNode }> = ({ x, y, s, 倍 = 1, children }) => (
  <div style={{ position: 'absolute', left: x * s - 2000, width: 4000, top: y * s, height: 8 * s * 倍, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{children}</div>
);

const 光标画: React.FC<{ x: number; y: number; 像素: number }> = ({ x, y, 像素 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 12, 19);
    箭头.forEach((行, r) => {
      for (let q = 0; q < 行.length; q++) {
        const c = 行[q];
        if (c !== 'B' && c !== 'W') continue;
        ctx.fillStyle = c === 'B' ? '#000000' : '#FFFFFF';
        ctx.fillRect(q, r, 1, 1);
      }
    });
  }, []);
  return <canvas ref={ref} width={12} height={19} style={{ position: 'absolute', left: Math.round(x), top: Math.round(y), width: 12 * 像素, height: 19 * 像素, imageRendering: 'pixelated' }} />;
};

export type 死亡界面属性 = {
  /** 画面宽高（像素）和 GUI 缩放 */
  宽: number;
  高: number;
  s: number;
  /** widgets.png（256 × 256） */
  按钮图: Png;
  /** 死亡消息（同聊天栏那一条）；不给不画 */
  死因?: string;
  分数?: number;
  重生: 死亡界面按钮态;
  标题屏幕?: 死亡界面按钮态;
  /** 光标尖在哪（GUI 像素）；不给不画 */
  光标?: readonly [number, number];
  /** 一个光标像素是几个画面像素 */
  光标像素?: number;
};

/** 放在和画面一样大的容器里，盖在游戏画面和 HUD 上 */
export const 死亡界面: React.FC<死亡界面属性> = ({ 宽, 高, s, 按钮图, 死因, 分数 = 0, 重生, 标题屏幕 = 重生 === '不能按' ? '不能按' : '平常', 光标, 光标像素 = 1.5 }) => {
  const 界 = 界面尺寸(宽, 高, s);
  const 中 = Math.trunc(界.宽 / 2);
  const fs = 8.6 * s;
  const 按钮们 = [
    { i: 0 as const, 字: 死亡界面字.重生, 态: 重生 },
    { i: 1 as const, 字: 死亡界面字.标题屏幕, 态: 标题屏幕 },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(80,0,0,0.376), rgba(128,48,48,0.627))' }} />
      <居中字 x={Math.trunc(中 / 2) * 2} y={30 * 2} s={s} 倍={2}>
        <UiText fontSize={fs * 2} style={{ lineHeight: 1 }}>
          {死亡界面字.标题}
        </UiText>
      </居中字>
      {死因 !== undefined && (
        <居中字 x={中} y={85} s={s}>
          <UiText fontSize={fs} style={{ lineHeight: 1 }}>
            {死因}
          </UiText>
        </居中字>
      )}
      <居中字 x={中} y={100} s={s}>
        <UiText fontSize={fs} style={{ lineHeight: 1 }}>{`${死亡界面字.分数}: `}</UiText>
        <UiText fontSize={fs} color="#FFFF55" style={{ lineHeight: 1 }}>
          {String(分数)}
        </UiText>
      </居中字>
      {按钮们.map(({ i, 字, 态 }) => {
        const b = 死亡界面按钮框(i, 界.宽, 界.高);
        return (
          <React.Fragment key={i}>
            <按钮底 图={按钮图} v={按钮v[态]} 左={b.x} 上={b.y} s={s} />
            <居中字 x={b.x + b.w / 2} y={b.y + 6} s={s}>
              <UiText fontSize={fs} color={态 === '不能按' ? '#A0A0A0' : '#FFFFFF'} style={{ lineHeight: 1 }}>
                {字}
              </UiText>
            </居中字>
          </React.Fragment>
        );
      })}
      {光标 && <光标画 x={光标[0] * s} y={光标[1] * s} 像素={光标像素} />}
    </div>
  );
};
