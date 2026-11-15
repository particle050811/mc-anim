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
export const deathScreenText = { 标题: '你死了！', score: '分数', respawn: '重生', titleScreen: '标题屏幕' } as const;
/** 打开后几刻按钮才能按 */
export const deathButtonDelayTicks = 20;

export type DeathButtonState = '不能按' | '平常' | '指着';
const buttonV: Record<DeathButtonState, number> = { 不能按: 46, 平常: 66, 指着: 86 };

/** 界面尺寸（GUI 像素）：窗口 ÷ 缩放，向上取整（Window.calculateScale 之后的 guiScaledWidth） */
export const uiSize = (width: number, height: number, s: number) => ({ 宽: Math.ceil(width / s), 高: Math.ceil(height / s) });

/** 第 i 个按钮（0 重生、1 标题屏幕）的框，GUI 像素 */
export const deathButtonRect = (i: 0 | 1, panelWidth: number, uiHeight: number) => ({ x: Math.trunc(panelWidth / 2) - 100, y: Math.trunc(uiHeight / 4) + 72 + 24 * i, w: 200, h: 20 });
/** 光标（GUI 像素）在不在第 i 个按钮上（AbstractWidget.isMouseOver：[x, x + 宽) × [y, y + 高)） */
export const deathButtonAt = (i: 0 | 1, x: number, y: number, panelWidth: number, uiHeight: number) => {
  const b = deathButtonRect(i, panelWidth, uiHeight);
  return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
};

// Windows 经典箭头：B 黑边、W 白芯（同 3e31b8b4 的死亡画面）
const arrowRows = ['B', 'BB', 'BWB', 'BWWB', 'BWWWB', 'BWWWWB', 'BWWWWWB', 'BWWWWWWB', 'BWWWWWWWB', 'BWWWWWWWWB', 'BWWWWWWWWWB', 'BWWWWWWBBBBB', 'BWWWBWWB', 'BWWBBWWB', 'BWB  BWWB', 'BB   BWWB', 'B     BWWB', '      BWWB', '       BB'];

/** widgets.png 里第 v 行起的 200 × 20 一条，逐像素放大 */
const ButtonBase: React.FC<{ 图: Png; v: number; left: number; 上: number; s: number }> = ({ 图: image, v, left, 上: top, s }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(200, 20);
    for (let y = 0; y < 20; y++) img.data.set(image.px.subarray((v + y) * image.w * 4, ((v + y) * image.w + 200) * 4), y * 200 * 4);
    ctx.putImageData(img, 0, 0);
  }, [image, v]);
  return <canvas ref={ref} width={200} height={20} style={{ position: 'absolute', left: left * s, top: top * s, width: 200 * s, height: 20 * s, imageRendering: 'pixelated' }} />;
};

/** 一行居中的字：x 是中线、y 是字顶（GUI 像素）；倍 = pose 放大（标题 2） */
const CenteredText: React.FC<{ x: number; y: number; s: number; heightScale?: number; children: React.ReactNode }> = ({ x, y, s, heightScale = 1, children }) => (
  <div style={{ position: 'absolute', left: x * s - 2000, width: 4000, top: y * s, height: 8 * s * heightScale, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{children}</div>
);

const CursorDraw: React.FC<{ x: number; y: number; pixel: number }> = ({ x, y, pixel }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 12, 19);
    arrowRows.forEach((row, r) => {
      for (let q = 0; q < row.length; q++) {
        const c = row[q];
        if (c !== 'B' && c !== 'W') continue;
        ctx.fillStyle = c === 'B' ? '#000000' : '#FFFFFF';
        ctx.fillRect(q, r, 1, 1);
      }
    });
  }, []);
  return <canvas ref={ref} width={12} height={19} style={{ position: 'absolute', left: Math.round(x), top: Math.round(y), width: 12 * pixel, height: 19 * pixel, imageRendering: 'pixelated' }} />;
};

export type DeathScreenProps = {
  /** 画面宽高（像素）和 GUI 缩放 */
  宽: number;
  高: number;
  s: number;
  /** widgets.png（256 × 256） */
  buttonImg: Png;
  /** 死亡消息（同聊天栏那一条）；不给不画 */
  deathCause?: string;
  score?: number;
  respawnButtonState: DeathButtonState;
  titleButtonState?: DeathButtonState;
  /** 光标尖在哪（GUI 像素）；不给不画 */
  cursor?: readonly [number, number];
  /** 一个光标像素是几个画面像素 */
  cursorPixel?: number;
};

/** 放在和画面一样大的容器里，盖在游戏画面和 HUD 上 */
export const DeathScreen: React.FC<DeathScreenProps> = ({ 宽: width, 高: height, s, buttonImg, deathCause, score = 0, respawnButtonState, titleButtonState = respawnButtonState === '不能按' ? '不能按' : '平常', cursor, cursorPixel = 1.5 }) => {
  const uiDims = uiSize(width, height, s);
  const centerX = Math.trunc(uiDims.宽 / 2);
  const fs = 8.6 * s;
  const buttons = [
    { i: 0 as const, 字: deathScreenText.respawn, buttonState: respawnButtonState },
    { i: 1 as const, 字: deathScreenText.titleScreen, buttonState: titleButtonState },
  ];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(80,0,0,0.376), rgba(128,48,48,0.627))' }} />
      <CenteredText x={Math.trunc(centerX / 2) * 2} y={30 * 2} s={s} heightScale={2}>
        <UiText fontSize={fs * 2} style={{ lineHeight: 1 }}>
          {deathScreenText.标题}
        </UiText>
      </CenteredText>
      {deathCause !== undefined && (
        <CenteredText x={centerX} y={85} s={s}>
          <UiText fontSize={fs} style={{ lineHeight: 1 }}>
            {deathCause}
          </UiText>
        </CenteredText>
      )}
      <CenteredText x={centerX} y={100} s={s}>
        <UiText fontSize={fs} style={{ lineHeight: 1 }}>{`${deathScreenText.score}: `}</UiText>
        <UiText fontSize={fs} color="#FFFF55" style={{ lineHeight: 1 }}>
          {String(score)}
        </UiText>
      </CenteredText>
      {buttons.map(({ i, 字: label, buttonState }) => {
        const b = deathButtonRect(i, uiDims.宽, uiDims.高);
        return (
          <React.Fragment key={i}>
            <ButtonBase 图={buttonImg} v={buttonV[buttonState]} left={b.x} 上={b.y} s={s} />
            <CenteredText x={b.x + b.w / 2} y={b.y + 6} s={s}>
              <UiText fontSize={fs} color={buttonState === '不能按' ? '#A0A0A0' : '#FFFFFF'} style={{ lineHeight: 1 }}>
                {label}
              </UiText>
            </CenteredText>
          </React.Fragment>
        );
      })}
      {cursor && <CursorDraw x={cursor[0] * s} y={cursor[1] * s} pixel={cursorPixel} />}
    </div>
  );
};
