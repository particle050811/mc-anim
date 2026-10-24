// 车万女仆 1.5.3 的女仆背包界面（MaidMainContainerGui 主页、空背包 EmptyBackpackContainerScreen），照 javap 读出来的 renderBg、render 一层层画：
//   全屏暗渐变（renderBackground，0xC0101010 → 0xD0101010）→ 主底板 → 立绘（renderEntityInInventoryFollowsMouse，剪在 [6, 73]×[12, 107]）→ 左下四条数值、页签条、WORK 框
//   → 右边侧页签 → 背包页（盔甲、主副手、6 格背包、上锁的三排）→ 按钮（回家、拾取、骑乘、下载、皮肤、说明、声音、任务切换、作息、页签、侧页签、饰品箱）
//   → 格子里的东西、鼠标停的那格的高亮 → 任务图标和名字 → 鼠标上拿着的东西。版本号「1.20.1-1.5.3」画在底板上沿外。
// 坐标都是界面像素、相对界面左上角（leftPos, topPos）；一个界面像素 = 成片 参.界面缩放 个像素。字是原版字体（作品的 女仆界面字 字形表），数值那几个数半大。
// 不画系统鼠标指针（录屏一般不带）；鼠标的位置看得出来：拿着的书、停着那格的高亮、立绘转头看它。
// 立绘里的她照世界里这一帧（坐着、戴着帽子、副手拿书），身子、头照原版跟着鼠标转。没装 YSM、Curios、IPN 这些联动模组：那几个按钮不画。
import React, { useLayoutEffect, useRef } from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { png, type Png } from '@engine/model/贴图.ts';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { 做像素字 } from '@库/界面/像素字表.ts';
import { 学徒法术书, 学徒法术书图 } from '../../物品/学徒法术书.tsx';
import type { 她态, 界面态 } from '../../段/2-雷雨/编排.ts';
import * as 参 from './参数.ts';
import 字表 from 'asset:字体/把回忆拼好给你/女仆界面字';
import 主图 from 'asset:贴图/界面/女仆界面/主';
import 侧图 from 'asset:贴图/界面/女仆界面/侧';
import 按钮图 from 'asset:贴图/界面/女仆界面/按钮';
import 背包图 from 'asset:贴图/界面/女仆界面/背包';
import 背饰槽图 from 'asset:贴图/界面/女仆界面/背饰槽';
import 饰品按钮图 from 'asset:贴图/界面/女仆界面/饰品按钮';
import 剑图 from 'asset:贴图/界面/空槽/剑';
import 头盔图 from 'asset:贴图/界面/空槽/头盔';
import 胸甲图 from 'asset:贴图/界面/空槽/胸甲';
import 护腿图 from 'asset:贴图/界面/空槽/护腿';
import 靴子图 from 'asset:贴图/界面/空槽/靴子';
import 盾牌图 from 'asset:贴图/界面/空槽/盾牌';
import 面包图 from 'asset:贴图/物品/面包';
import 橡木门图 from 'asset:贴图/物品/橡木门';
import 樱花树苗图 from 'asset:贴图/物品/樱花树苗';
import 羽毛图 from 'asset:贴图/物品/书/羽毛';

const 字 = 做像素字(字表, '字体/把回忆拼好给你/女仆界面字');
const s = 参.界面缩放;
/** 画布比界面多留的边（界面像素）：上面画版本号，右边画侧页签（到 x 277） */
const 边 = { 左: 8, 上: 8, 右: 32, 下: 8 } as const;
const 画布宽 = 256 + 边.左 + 边.右;
const 画布高 = 256 + 边.上 + 边.下;

// ---------- 贴图 → 画布 ----------
const 画布们 = new Map<Png, HTMLCanvasElement>();
const 成画布 = (p: Png) => {
  let c = 画布们.get(p);
  if (!c) {
    c = document.createElement('canvas');
    c.width = p.w;
    c.height = p.h;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.px), p.w, p.h), 0, 0);
    画布们.set(p, c);
  }
  return c;
};
const 图 = {
  主: png(主图),
  侧: png(侧图),
  按钮: png(按钮图),
  背包: png(背包图),
  背饰槽: png(背饰槽图),
  饰品按钮: png(饰品按钮图),
  剑: png(剑图),
  头盔: png(头盔图),
  胸甲: png(胸甲图),
  护腿: png(护腿图),
  靴子: png(靴子图),
  盾牌: png(盾牌图),
  羽毛: png(羽毛图),
};
const 物品图: Record<(typeof 参.快捷栏)[number]['物品'], Png> = {
  面包: png(面包图),
  橡木门: png(橡木门图),
  樱花树苗: png(樱花树苗图),
  学徒法术书: 学徒法术书图,
};

type 笔 = {
  /** blit：贴图 t 的 (u, v) 起 w×h 画到界面 (x, y) */
  贴: (t: Png, x: number, y: number, u: number, v: number, w: number, h: number) => void;
  /** 一整张 16×16 的物品、空槽图标 */
  图标: (t: Png, x: number, y: number) => void;
  /** fill：ARGB */
  填: (x0: number, y0: number, x1: number, y1: number, argb: number) => void;
  字: (text: string, x: number, y: number, rgb: number, 阴影: boolean, 半大?: boolean) => void;
};

const 做笔 = (ctx: CanvasRenderingContext2D): 笔 => {
  const X = (x: number) => (x + 边.左) * s;
  const Y = (y: number) => (y + 边.上) * s;
  return {
    贴: (t, x, y, u, v, w, h) => ctx.drawImage(成画布(t), u, v, w, h, X(x), Y(y), w * s, h * s),
    图标: (t, x, y) => ctx.drawImage(成画布(t), 0, 0, t.w, t.h, X(x), Y(y), 16 * s, 16 * s),
    填: (x0, y0, x1, y1, argb) => {
      ctx.fillStyle = `rgba(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255},${((argb >>> 24) & 255) / 255})`;
      ctx.fillRect(X(x0), Y(y0), (x1 - x0) * s, (y1 - y0) * s);
    },
    字: (text, x, y, rgb, 阴影, 半大 = false) => {
      const 色 = '#' + rgb.toString(16).padStart(6, '0');
      // 半大：drawNumberScale 先 scale(0.5) 再在 (x·2, y·2 + 4) 画，一个字的点 = 半个界面像素
      if (半大) 字.画(ctx, text, { x: X(0), y: Y(0) }, x * 2, y * 2 + 4, 色, s / 2, { 阴影 });
      else 字.画(ctx, text, { x: X(0), y: Y(0) }, x, y, 色, s, { 阴影 });
    },
  };
};

/** 鼠标在不在格子上（AbstractContainerScreen.isHovering：格子四周各多算 1 像素） */
const 停在格 = (鼠标: readonly [number, number], [x, y]: readonly [number, number]) => 鼠标[0] >= x - 1 && 鼠标[0] < x + 17 && 鼠标[1] >= y - 1 && 鼠标[1] < y + 17;
const 停在 = (鼠标: readonly [number, number], x: number, y: number, w: number, h: number) => 鼠标[0] >= x && 鼠标[0] < x + w && 鼠标[1] >= y && 鼠标[1] < y + h;

/** 立绘下面那层：版本号、主底板 */
const 画底 = (p: 笔) => {
  const 版本 = '1.20.1-1.5.3';
  p.字(版本, 40 - Math.floor(字.字宽(版本) / 2), -4, 0xaaaaaa, true);
  p.贴(图.主, 0, 0, 0, 0, 256, 256);
};

/** 立绘上面的全部 */
const 画面板 = (p: 笔, 态: 界面态) => {
  const 鼠 = 态.鼠标;
  const v = 参.女仆数值;
  // drawBaseInfoGui：四条（血、护甲、经验、好感）
  const 条们 = [
    { 图u: 0, 条v: 18, 比: v.血 / v.血上限, 数: v.血 },
    { 图u: 9, 条v: 23, 比: Math.min(v.护甲 / 20, 1), 数: v.护甲 },
    { 图u: 18, 条v: 28, 比: v.经验比, 数: v.经验级 },
    { 图u: 27, 条v: 33, 比: v.好感比, 数: v.好感级 },
  ];
  条们.forEach((c, i) => {
    const y = 113 + 11 * i;
    p.贴(图.侧, 53, y, c.图u, 0, 9, 9);
    p.贴(图.侧, 5, y, 0, 9, 47, 9);
    p.贴(图.侧, 7, y + 2, 2, c.条v, Math.floor(c.比 * 43), 5);
    p.字(String(c.数), 63, y + 1, 0x555555, false, true);
  });
  p.贴(图.侧, 94, 7, 107, 0, 149, 21);
  p.贴(图.侧, 6, 178, 0, 47, 67, 25);
  // drawSideTabGui
  p.贴(图.侧, 256, 37, 235, 107, 21, 50);
  // 空背包页
  p.贴(图.背包, 85, 36, 0, 0, 165, 128);
  for (const [y0, y1] of [[58, 76], [81, 117], [122, 158]] as const) p.填(142, y0, 250, y1, 0xaa222222);
  for (const y of [62, 92, 133]) p.贴(图.背包, 190, y, 165, 0, 11, 11);
  // 按钮
  ([[9, 0, 参.女仆开关.回家], [30, 42, 参.女仆开关.拾取], [51, 84, 参.女仆开关.骑乘]] as const).forEach(([x, u, 开]) => {
    p.贴(图.按钮, x, 206, u + (开 ? 21 : 0), 停在(鼠, x, 206, 20, 20) ? 21 : 0, 20, 20);
  });
  p.贴(图.按钮, 20, 230, 0, 86, 41, 20);
  p.贴(图.按钮, 62, 14, 72, 43, 9, 9);
  p.贴(图.按钮, 8, 14, 72, 65, 9, 9);
  p.贴(图.按钮, 52, 14, 144, 43, 9, 9);
  p.贴(图.按钮, 4, 159, 0, 42, 71, 21);
  p.贴(图.按钮, 9, 187, 82, 43, 61, 13);
  // 页签：主页选中（亮的那张盖在条上），三个图标
  p.贴(图.侧, 94, 5, 107, 21, 24, 26);
  for (const [x, u] of [[94, 107], [119, 132], [144, 157]] as const) p.贴(图.侧, x + 4, 11, u, 47, 16, 16);
  // 侧页签：帕秋莉手册、模组设置
  for (let i = 0; i < 2; i++) p.贴(图.侧, 251 + 6, 37 + 25 * i + 4, 193, 107 + 25 * i + 4, 16, 16);
  // 饰品箱按钮（没装 Curios 时的样子），鼠标停在上面换开盖那张
  p.贴(图.饰品按钮, 85, 97, 0, 停在(鼠, 85, 97, 54, 63) ? 63 : 0, 54, 63);

  // 格子：空槽图标、东西、个数、高亮
  type 格 = { 位: readonly [number, number]; 空?: Png; 物?: Png; 个数?: number };
  const 书 = 态.书在 === '副手' ? 学徒法术书图 : undefined;
  const 格们: 格[] = [
    { 位: [87, 77], 空: 图.剑 },
    { 位: 参.副手格, 空: 图.盾牌, 物: 书 },
    { 位: [94, 37], 空: 图.头盔 },
    { 位: [114, 37], 空: 图.胸甲 },
    { 位: [94, 57], 空: 图.护腿 },
    { 位: [114, 57], 空: 图.靴子 },
    ...Array.from({ length: 6 }, (_, i): 格 => ({ 位: [143 + 18 * i, 37], ...(i === 5 ? { 空: 图.背饰槽 } : {}) })),
    ...Array.from({ length: 27 }, (_, k): 格 => ({ 位: [88 + 18 * (k % 9), 174 + 18 * Math.floor(k / 9)] })),
    ...Array.from({ length: 9 }, (_, k): 格 => {
      const 有 = 参.快捷栏.find((x) => x.格 === k);
      const 拿走了 = 有?.物品 === '学徒法术书' && 态.书在 !== '快捷栏';
      return { 位: 参.快捷栏格(k), ...(有 && !拿走了 ? { 物: 物品图[有.物品], 个数: 有.个数 } : {}) };
    }),
  ];
  for (const g of 格们) {
    const [x, y] = g.位;
    if (g.物) {
      p.图标(g.物, x, y);
      if (g.个数 && g.个数 > 1) {
        const t = String(g.个数);
        p.字(t, x + 17 - 字.字宽(t), y + 9, 0xffffff, true);
      }
    } else if (g.空) p.图标(g.空, x, y);
    if (停在格(鼠, g.位)) p.填(x, y, x + 16, y + 16, 0x80ffffff);
  }
  // 任务：空闲（羽毛）
  p.图标(图.羽毛, 6, 161);
  p.字('空闲', 28, 165, 0x333333, false);
  // 鼠标上拿着的书
  if (态.拿着书) p.图标(学徒法术书图, 鼠[0] - 8, 鼠[1] - 8);
};

const 面板画布: React.FC<{ 画: (p: 笔) => void }> = ({ 画 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    画(做笔(ctx));
  });
  return (
    <canvas
      ref={ref}
      width={画布宽 * s}
      height={画布高 * s}
      style={{ position: 'absolute', left: 0, top: 0, width: (画布宽 * s) / 成片倍数, height: (画布高 * s) / 成片倍数, imageRendering: 'pixelated' }}
    />
  );
};

// ---------- 立绘 ----------
/** 剪裁框（界面像素）：drawMaidCharacter 的 enableScissor */
const 剪 = { x0: 6, y0: 12, x1: 73, y1: 107 } as const;
/** 她的脚底在界面 (40, 100)，一格 40 界面像素 */
const 脚 = [40, 100] as const;
const 每格 = 40;

const 立绘: React.FC<{ 她: 她态; 鼠标: readonly [number, number] }> = ({ 她, 鼠标 }) => {
  // InventoryScreen.renderEntityInInventoryFollowsMouse：f、g 是弧度，身子转 f·20°、头再转 f·20°、低头 g·20°，整个人绕脚底俯仰 g·20°
  const f = Math.atan((脚[0] - 鼠标[0]) / 40);
  const g = Math.atan((50 - 鼠标[1]) / 40);
  const 宽 = ((剪.x1 - 剪.x0) * s) / 成片倍数;
  const 高 = ((剪.y1 - 剪.y0) * s) / 成片倍数;
  // 剪裁框中心到脚底（格）：机位看点 = 脚底往左上挪这么多
  const 看: [number, number, number] = [((剪.x0 + 剪.x1) / 2 - 脚[0]) / 每格, 0, (脚[1] - (剪.y0 + 剪.y1) / 2) / 每格];
  return (
    <三渲二画布
      宽={宽}
      高={高}
      机位={{ 种: '正交', N: 参.立绘N, 顶面: 0, 看, 朝: '北' }}
      style={{ position: 'absolute', left: ((剪.x0 + 边.左) * s) / 成片倍数, top: ((剪.y0 + 边.上) * s) / 成片倍数 }}
    >
      <MagicalWineFoxEx
        pose={{ ...standPose([0, 0, 0]), yaw: 180 - f * 20, pitch: -g * 20 }}
        姿势="坐"
        表情={她.表情}
        看={[g * 20, -f * 20]}
        秒={她.秒}
        眨眼="auto"
        {...(她.拿书 ? { 左手: { 物品: <学徒法术书 /> } } : {})}
      />
    </三渲二画布>
  );
};

/** 铺满画面，放在 position 不是 static 的容器里 */
export const 女仆界面: React.FC<{ 态: 界面态; 她: 她态 }> = ({ 态, 她 }) => {
  const 下沉 = Math.round((1 - 态.浮) * 参.界面浮起);
  const left = ((参.界面位.左 - 边.左 * s) / 成片倍数) | 0;
  const top = ((参.界面位.上 + (下沉 - 边.上) * s) / 成片倍数) | 0;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 态.透, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 态.浮, background: 'linear-gradient(rgba(16,16,16,0.7529), rgba(16,16,16,0.8157))' }} />
      <div style={{ position: 'absolute', left, top, width: (画布宽 * s) / 成片倍数, height: (画布高 * s) / 成片倍数, opacity: 态.浮 }}>
        <面板画布 画={画底} />
        <立绘 她={她} 鼠标={态.鼠标} />
        <面板画布 画={(p) => 画面板(p, 态)} />
      </div>
    </div>
  );
};
