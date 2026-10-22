// 原版箱子界面（ContainerScreen，3 行箱子）的箱子部分：6-4-2至3a、7-2-2至3 开 Lootr 战利品箱时弹出，窗口贴在翻开的箱盖上方（`chestWindowOverLid`）。
// 只画箱子、不画下面的玩家物品栏（用户 10-19 定：不然还得交代他身上有什么），窗口照 generic_54.png 在箱子格下沿收边。
// 出处（client-1.20.1，javap）：Lootr 箱用的是原版 ChestMenu（SpecialChestInventory.createMenu，27 格 → generic_9x3），界面是 ContainerScreen + generic_54.png；
// - 尺寸、格子位置见 箱子格子.ts。标题在 (8, 6)，颜色 #404040、不带阴影；标题是箱子方块实体的名字：Lootr 的 LootrChestBlockEntity 没改默认名，取原版 container.chest「箱子」。
// - 鼠标停着的格子盖一层 #80FFFFFF（renderSlotHighlight）。指针是系统画的，不画（用户 10-20：「鼠标指针有点出戏 建议删掉」）：点哪格只用悬停高亮和东西从格子里消失交代。
// 画法同 JEI.tsx：自制高清版，面板、格子用矢量，物品图标 16×16 逐像素放大（见 基础.tsx 开头）。坐标是 GUI 像素，乘 s 得画面像素。
import React from 'react';
import * as THREE from 'three';
import { png, type Png } from '../../engine/model/贴图.ts';
import { makePerspectiveCamera } from './伤害数字.tsx';
import { PixelSprite, UiText } from './基础.tsx';
import { InsetSlot, ItemSlot, RaisedPanel } from './JEI.tsx';
import { allSlots, chestScreenSize, slotPos } from './箱子格子.ts';
import glintPng from 'asset:贴图/界面/附魔光效';
import tomePng from 'asset:贴图/界面/古卷';
import coalPng from 'asset:贴图/界面/煤炭';
import bonePng from 'asset:贴图/界面/骨头';
import soulTorchPng from 'asset:贴图/界面/灵魂火把';
import echoShardPng from 'asset:贴图/界面/回响碎片';
import discFragmentPng from 'asset:贴图/界面/唱片残片';
import amethystShardPng from 'asset:贴图/界面/紫水晶碎片';
import enchantedBookPng from 'asset:贴图/界面/附魔书';
import candlePng from 'asset:贴图/界面/蜡烛';
import xpBottlePng from 'asset:贴图/界面/附魔之瓶';
import leggingsPng from 'asset:贴图/物品/杂项物品/钻石护腿';

const labelColor = '#404040';

// ---------- 物品 ----------
// 光效：古卷、附魔书、附魔之瓶 isFoil 恒为真（javap）；附魔过的护腿。光效时间错开，几件不同步流动。
type ItemKind = { tex: Png; glint?: number };
const itemKinds = {
  古卷: { tex: png(tomePng), glint: 3.1 },
  钻石护腿: { tex: png(leggingsPng), glint: 1.3 },
  煤炭: { tex: png(coalPng) },
  骨头: { tex: png(bonePng) },
  灵魂火把: { tex: png(soulTorchPng) },
  回响碎片: { tex: png(echoShardPng) },
  唱片残片: { tex: png(discFragmentPng) },
  紫水晶碎片: { tex: png(amethystShardPng) },
  附魔书: { tex: png(enchantedBookPng), glint: 0.4 },
  蜡烛: { tex: png(candlePng) },
  附魔之瓶: { tex: png(xpBottlePng), glint: 2.2 },
} satisfies Record<string, ItemKind>;
export type ItemName = keyof typeof itemKinds;
export type Stack = { item: ItemName; count?: number };

export const ItemIcon: React.FC<{ item: ItemName; size: number; t: number }> = ({ item, size, t }) => {
  const kind: ItemKind = itemKinds[item];
  return <PixelSprite tex={kind.tex} size={size} glint={kind.glint === undefined ? null : { tex: png(glintPng), time: t + kind.glint }} />;
};

export type ChestScreenProps = {
  s: number;
  x: number; // 窗口左上角（画面像素）
  y: number;
  title: string;
  visibility: number; // 0～1：弹出 / 关掉（淡入、轻微放大，同 JEI 窗口）
  chest: (Stack | null)[]; // 27 格
  hovered?: number; // 鼠标停着的箱子格（盖悬停高亮）；不给就是没停在格子上
  t: number; // 秒，驱动附魔光效
};

export const ChestScreen: React.FC<ChestScreenProps> = ({ s, x, y, title, visibility, chest, hovered, t }) => {
  if (visibility <= 0) return null;
  const k = 0.96 + 0.04 * visibility;
  const fs = 8.6 * s;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: visibility }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: chestScreenSize.width * s,
          height: chestScreenSize.height * s,
          transform: `scale(${k})`,
          transformOrigin: '50% 50%',
          filter: `drop-shadow(0 ${3 * s}px ${6 * s}px rgba(0,0,0,0.45))`,
        }}
      >
        <RaisedPanel x={0} y={0} w={chestScreenSize.width} h={chestScreenSize.height} s={s} cornerRadius={4} />
        <div style={{ position: 'absolute', left: 8 * s, top: 5.5 * s }}>
          <UiText fontSize={fs} color={labelColor} shadow={false}>
            {title}
          </UiText>
        </div>
        {allSlots.map((slot) => {
          const [sx, sy] = slotPos(slot);
          const stack = chest[slot];
          return (
            <React.Fragment key={slot}>
              <InsetSlot x={sx - 1} y={sy - 1} s={s} />
              {stack && (
                <ItemSlot x={sx} y={sy} s={s} withSlot={false} count={stack.count}>
                  <ItemIcon item={stack.item} size={16 * s} t={t} />
                </ItemSlot>
              )}
            </React.Fragment>
          );
        })}
        {hovered !== undefined && (
          <div style={{ position: 'absolute', left: slotPos(hovered)[0] * s, top: slotPos(hovered)[1] * s, width: 16 * s, height: 16 * s, background: 'rgba(255,255,255,0.5)' }} />
        )}
      </div>
    </div>
  );
};

// ---------- 贴在箱盖上方 ----------
// 1280 宽时界面 2.4 倍（用户 10-20：放大让观众看清）
export const CHEST_UI_SCALE = 2.4 / 1280;
type Cam = { pos: number[]; tgt: number[]; lens: number };
// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
// 窗口下沿贴着翻开的箱盖上沿（`lidTop`：场景坐标，取 模型/物品/箱子.tsx 的 CHEST.开满盖沿高），像从箱子里弹出来（用户 10-19 定），跟着箱子投到画面上的位置走；
// 箱盖中点落在窗口宽度的 `anchorX` 处（0.5 是正中），按镜头里人在哪边让开他。出了画面就往里收。返回窗口左上角（画面像素）
export const chestWindowOverLid = (lidTop: number[], cam: Cam, anchorX: number, width: number, height: number) => {
  const s = CHEST_UI_SCALE * width;
  const ndc = toThree(lidTop).project(makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height));
  const [ax, ay] = [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
  const margin = 8 * s;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    s,
    x: clamp(ax - chestScreenSize.width * anchorX * s, margin, width - chestScreenSize.width * s - margin),
    y: clamp(ay - (chestScreenSize.height + 4) * s, margin, height - chestScreenSize.height * s - margin),
  };
};
