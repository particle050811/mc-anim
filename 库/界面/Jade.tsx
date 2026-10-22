// Jade（Jade-1.20.1-Forge-11.13.3，game/缓存/mods/，只解包读、没装进游戏）准星对着实体时屏幕顶上的信息框，加一根思索式引线从实体身上连到框上。
// 用户 10-18 定：7-2-1 李樱望见监守者的血量用 Jade 看出来，引线照 6-2 匠魂、古卷的说明框（思索.tsx 的 PonderCallout），不让主角干讲。6-1-2 娜迦的血量框也用它（用户 10-20）。
// 出处（javap）：
// - 位置 WailaConfig$ConfigOverlay 默认 posX 0.5、posY 1、anchor (0.5, 0)：屏幕顶边正中；TooltipRenderer.recalculateRealRect 非方角时宽高各 +2、往下挪 1。
// - 框 OverlayRenderer.drawTooltipBox，默认主题 jade:dark（Theme.DARK、jade_themes/dark.json）：底色 #131313、四边外伸 1 像素切角；1 像素边框上 #383838、下 #242424；
//   底和边都乘界面透明度 0.7。内边距 Theme.padding 上 4 右 3 下 1 左 4；每行高 10（TextElement 字高 9 + 1）。出现时透明度每刻 +0.6（约 2 帧淡入）。
// - 行：实体名（titleColor 白）；生命值 HealthElement：最大生命 > 40（max_for_render 默认）时只画一颗心 + 「  当前/最大」（DecimalFormat "0.##"，
//   默认不显示小数先取整；normalColor #A0A0A0）；心是原版 gui/icons.png 空心底 (16,0) 叠满心 (52,0)，9×9 画成 8×8。末行模组名「§9§o%s」蓝色斜体。
// 画法同 基础.tsx（矢量面板、系统中文字，心保留像素）。心的贴图：
//   uv run --with pillow 工具/游戏取材/导出模型.py ../game/缓存/client-1.20.1.jar src/模型/界面/贴图 原版图标=assets/minecraft/textures/gui/icons.png
import React from 'react';
import { crop, png, type Png } from '../../engine/model/贴图.ts';
import { PixelSprite, UiText, chatColors, stackLayers } from './基础.tsx';
import iconsPng from 'asset:贴图/界面/原版图标';

const theme = { background: '19,19,19', borderTop: '56,56,56', borderBottom: '36,36,36', title: chatColors.white, normal: '#A0A0A0' };
const overlayAlpha = 0.7;
const pad = { top: 4, right: 3, bottom: 1, left: 4 };
const rowHeight = 10;

let heartCache: Png | null = null;
const heartIcon = (): Png =>
  (heartCache ??= (() => {
    const atlas = png(iconsPng);
    return stackLayers([16, 52].map((u) => ({ w: 9, h: 9, px: crop(atlas, u, 0, 9) })));
  })());

export type JadeEntity = { name: string; health: number; maxHealth: number; mod: string };

// 框连外伸的 1 像素一共多高（GUI 像素）：三行。内边距从边框外沿量起，边框外面再外伸 1 像素
export const jadeBoxHeight = 1 + pad.top + 3 * rowHeight + pad.bottom + 1;
// 每画面像素宽的 GUI 缩放：1280 宽时框用 3.5 倍（游戏界面「大」约 2.5，再开 Jade 的界面缩放 1.4），引线同 6-2 的标注用 2.3；各镜头乘画面宽用
export const jadeScalePerWidth = 3.5 / 1280;
export const jadeLineScalePerWidth = 2.3 / 1280;

// cx：屏幕水平正中（画面像素）；s：GUI 缩放；visibility 0～1
export const JadeTooltip: React.FC<{ entity: JadeEntity; s: number; cx: number; visibility: number }> = ({ entity, s, cx, visibility }) => {
  if (visibility <= 0) return null;
  const fs = 8.6 * s;
  const cut = `${s}px`;
  const row = (children: React.ReactNode) => <div style={{ height: rowHeight * s, display: 'flex', alignItems: 'center', whiteSpace: 'pre' }}>{children}</div>;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: cx,
        transform: 'translateX(-50%)',
        opacity: visibility,
        background: `rgba(${theme.background},${overlayAlpha})`,
        clipPath: `polygon(${cut} 0, calc(100% - ${cut}) 0, 100% ${cut}, 100% calc(100% - ${cut}), calc(100% - ${cut}) 100%, ${cut} 100%, 0 calc(100% - ${cut}), 0 ${cut})`,
        padding: `${(1 + pad.top) * s}px ${(1 + pad.right) * s}px ${(1 + pad.bottom) * s}px ${(1 + pad.left) * s}px`,
      }}
    >
      <div style={{ position: 'absolute', inset: s, border: `${s}px solid`, borderImage: `linear-gradient(rgba(${theme.borderTop},${overlayAlpha}), rgba(${theme.borderBottom},${overlayAlpha})) 1` }} />
      {row(
        <UiText fontSize={fs} color={theme.title}>
          {entity.name}
        </UiText>,
      )}
      {row(
        <>
          <PixelSprite tex={heartIcon()} size={8 * s} />
          {/* 「  当前/最大」开头两个空格：游戏字体空格宽 4，即 8 像素 */}
          <UiText fontSize={fs} color={theme.normal} style={{ marginLeft: 8 * s }}>
            {`${Math.ceil(entity.health)}/${Math.ceil(entity.maxHealth)}`}
          </UiText>
        </>,
      )}
      {row(
        <UiText fontSize={fs} color={chatColors.blue} italic>
          {entity.mod}
        </UiText>,
      )}
    </div>
  );
};

// 引线：样式照 思索.tsx 的 PonderCallout（2 像素灰线、浅色芯、外圈淡黑边，起点一个白点），从实体身上竖直往上连到框的下沿。
// from：实体身上的点（画面像素）；toY：框下沿（画面像素）；s：引线的缩放（6-2 的标注用 2～2.3）；progress 0～1：先出白点再长线
export const JadeLeaderLine: React.FC<{ from: [number, number]; toY: number; s: number; progress: number }> = ({ from, toY, s, progress }) => {
  if (progress <= 0) return null;
  const dotK = Math.min(1, progress / 0.25);
  const lineK = Math.max(0, Math.min(1, (progress - 0.15) / 0.85));
  const total = Math.max(0, from[1] - toY);
  const d = `M${from[0]},${from[1]} L${from[0]},${toY}`;
  const dash = `${total * lineK} ${total}`;
  return (
    <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
      <path d={d} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={3.4 * s} strokeDasharray={dash} />
      <path d={d} fill="none" stroke="#494949" strokeWidth={2 * s} strokeDasharray={dash} />
      <path d={d} fill="none" stroke="#C9C9C9" strokeWidth={0.8 * s} strokeDasharray={dash} transform={`translate(${-0.3 * s},0)`} />
      <circle cx={from[0]} cy={from[1]} r={1.6 * s * dotK} fill="#FFFFFF" stroke="#393939" strokeWidth={0.6 * s} />
    </svg>
  );
};
