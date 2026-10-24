// 第 14 句楼上（分屏右半，46.13～48.26）：走廊栏杆、对面教学楼、史蒂夫的两只手和一摞书。布局、动作分寸在 楼上布局.ts。
// 纯按 props 画（楼上态，场按歌曲帧算好传进来）；纸雨是 2D 叠层，另在 纸雨层.tsx。放进 现实画布（顶面 = 楼上顶面、天 = 楼上天色）。
import type React from 'react';
import type * as THREE from 'three';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 现实色 } from './色板.ts';
import { 新像素画, 成贴图, type 像素画 } from './像素图.ts';
import { 像素空间, 像素盒 } from './像素块.tsx';
import { 撕页手 } from './撕页手.tsx';
import { 书们, 书摞位, 化樱抖, 卷子摞, 对面楼, 托手, 撒手, 撕书, 栏杆, 楼上手摆, type 楼上态 } from './楼上布局.ts';

// ---------- 方块 ----------
/** 定死的散列，[0, 1) */
const 散 = (i: number, k: number) => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
/** 对面楼 (i, k) 那一块在化樱进度到几成时换成樱花树叶：按列从左往右，再抖一点；最右一列最晚、正好 1 */
const 化樱阈 = (i: number, k: number) => ((i - 对面楼.左 + 1) / (对面楼.右 - 对面楼.左)) * (1 - 化樱抖) + 散(i, k) * 化樱抖;

const 楼上方块 = (化樱: number): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number) => out.push({ 状态, 位: [i, j, k] });
  for (let i = 栏杆.左; i < 栏杆.右; i++) {
    放('minecraft:white_concrete', i, 0, 0);
    放('minecraft:smooth_stone_slab[type=bottom]', i, 0, 1);
    放('minecraft:smooth_stone', i, 0, -1);
    for (let k = -4; k <= -2; k++) 放('minecraft:white_concrete', i, 0, k);
  }
  const { j, 底, 顶, 层高, 窗距, 左, 右 } = 对面楼;
  for (let i = 左; i < 右; i++)
    for (let k = 底; k < 顶; k++) {
      if (化樱 > 0 && 化樱 >= 化樱阈(i, k)) {
        放('minecraft:cherry_leaves', i, j, k);
        continue;
      }
      const 层内 = (((k - 底) % 层高) + 层高) % 层高;
      const 窗 = (层内 === 1 || 层内 === 2) && ((i % 窗距) + 窗距) % 窗距 !== 0;
      放(层内 === 0 ? 'minecraft:light_gray_concrete' : 窗 ? 对面楼.窗 : 'minecraft:white_concrete', i, j, k);
    }
  // 楼顶一圈女儿墙
  for (let i = 左; i < 右; i++) 放(化樱 > 0 && 化樱 >= 化樱阈(i, 顶) ? 'minecraft:cherry_leaves' : 'minecraft:smooth_stone_slab[type=bottom]', i, j, 顶);
  return out;
};
const 方块缓存 = new Map<number, 方块[]>();
const 取方块 = (化樱: number) => {
  let b = 方块缓存.get(化樱);
  if (!b) 方块缓存.set(化樱, (b = 楼上方块(化樱)));
  return b;
};

// ---------- 书、卷子的贴图 ----------
const 缓存 = new Map<string, THREE.Texture>();
const 取 = (键: string, 画: () => 像素画) => {
  let t = 缓存.get(键);
  if (!t) 缓存.set(键, (t = 成贴图(画())));
  return t;
};

/** 书的正面（朝镜头那头的书口）：上下各一行封皮，中间一行行书页 */
const 书前 = (宽: number, 高: number, 封暗: string) => () => {
  const p = 新像素画(宽, 高);
  p.噪(0, 0, 宽, 高, ['#ece8dc', '#ded8c6'], 41 + 宽 * 7 + 高, [3, 1]);
  p.方(0, 0, 宽, 1, 封暗);
  p.方(0, 高 - 1, 宽, 1, 封暗);
  p.方(0, 0, 1, 高, 封暗);
  return p;
};
/** 书的封面（朝上）：封皮色、一圈暗边、中间一块浅色的签（不写字） */
const 书顶 = (宽: number, 深: number, 封: string, 封暗: string) => () => {
  const p = 新像素画(宽, 深);
  p.方(0, 0, 宽, 深, 封);
  p.方(0, 0, 宽, 1, 封暗);
  p.方(0, 深 - 1, 宽, 1, 封暗);
  p.方(0, 0, 2, 深, 封暗);
  p.方(Math.floor(宽 / 2) - 4, Math.floor(深 / 2) - 2, 8, 4, '#e9e1c8');
  return p;
};
/** 撕口露出来的白页 */
const 白页 = (宽: number, 高: number) => () => {
  const p = 新像素画(宽, 高);
  p.噪(0, 0, 宽, 高, ['#f3f4f4', '#e4e7e9'], 77, [2, 1]);
  return p;
};
/** 卷子：正面一层层纸边，顶上一张卷子（红的卷头、几行字样的灰点） */
const 卷子前 = () => {
  const p = 新像素画(卷子摞.宽, 卷子摞.高);
  p.噪(0, 0, 卷子摞.宽, 卷子摞.高, [...现实色.纸], 93);
  return p;
};
const 卷子顶 = () => {
  const p = 新像素画(卷子摞.宽, 卷子摞.深);
  p.噪(0, 0, 卷子摞.宽, 卷子摞.深, [...现实色.纸], 97, [5, 3, 2]);
  p.方(2, 1, 卷子摞.宽 - 4, 1, 现实色.卷子印);
  for (let 行 = 0; 行 < 4; 行++) for (let x = 2; x < 卷子摞.宽 - 3; x++) if ((x * 5 + 行 * 3) % 4 < 2) p.点(x, 4 + 行 * 2, 现实色.卷子字);
  return p;
};

const 书盒: React.FC<{ x: number; y: number; z: number; 宽: number; 深: number; 高: number; 封: string; 封暗: string }> = ({ x, y, z, 宽, 深, 高, 封, 封暗 }) => (
  <像素盒
    x={x}
    y={y}
    z={z}
    宽={宽}
    深={深}
    高={高}
    前={取(`书前${宽},${高},${封暗}`, 书前(宽, 高, 封暗))}
    顶={取(`书顶${宽},${深},${封}`, 书顶(宽, 深, 封, 封暗))}
  />
);

export const 楼上: React.FC<{ 态: 楼上态 }> = ({ 态 }) => {
  const { y0, z0 } = 书摞位;
  // 整摞跟着手走：举起来往上、往北；撒手以后往下掉
  const 举 = 态.举;
  const dy = Math.round(撕书.举远 * 举);
  const 落 = 态.撒手秒 > 0 ? Math.round(0.5 * 撒手.重力 * 态.撒手秒 ** 2) : 0;
  const dz = Math.round(撕书.举高 * 举) - 落;
  let z = z0 + dz;
  const 摞: React.ReactNode[] = [];
  const 撕开 = 态.撕 > 0;
  书们.forEach((b, n) => {
    const 顶本 = n === 书们.length - 1;
    // 卷子夹在最上面那本底下（撕的那本在最上面露得出来）；撒手那一帧就散成纸雨（纸雨层.tsx），不跟着书掉
    if (顶本) {
      if (态.撒手秒 <= 0)
        摞.push(<像素盒 key="卷子" x={卷子摞.x0} y={y0 + dy + 1} z={z} 宽={卷子摞.宽} 深={卷子摞.深} 高={卷子摞.高} 前={取('卷子前', 卷子前)} 顶={取('卷子顶', 卷子顶)} />);
      z += 卷子摞.高;
    }
    if (顶本 && 撕开) {
      // 撕成两半，往两边掰开、各往上翘；撕口露白页
      const 半 = Math.floor(b.宽 / 2);
      const 掰 = Math.round(撕书.掰开 * 态.撕);
      const zz = z + Math.round(撕书.翘 * 态.撕);
      摞.push(
        <书盒 key="左半" x={b.x0 - 掰} y={y0 + dy} z={zz} 宽={半} 深={b.深} 高={b.高} 封={b.封} 封暗={b.封暗} />,
        <书盒 key="右半" x={b.x0 + 半 + 掰} y={y0 + dy} z={zz} 宽={b.宽 - 半} 深={b.深} 高={b.高} 封={b.封} 封暗={b.封暗} />,
        <像素盒 key="左口" x={b.x0 - 掰 + 半} y={y0 + dy + 1} z={zz} 宽={撕书.撕口} 深={b.深 - 2} 高={b.高 + 1} 前={取('白页', 白页(撕书.撕口, b.高 + 1))} 顶={取('白页顶', 白页(撕书.撕口, b.深 - 2))} />,
        <像素盒 key="右口" x={b.x0 + 半 + 掰 - 撕书.撕口} y={y0 + dy + 1} z={zz} 宽={撕书.撕口} 深={b.深 - 2} 高={b.高 + 1} 前={取('白页', 白页(撕书.撕口, b.高 + 1))} 顶={取('白页顶', 白页(撕书.撕口, b.深 - 2))} />,
      );
    } else 摞.push(<书盒 key={b.名} x={b.x0} y={y0 + dy} z={z} 宽={b.宽} 深={b.深} 高={b.高} 封={b.封} 封暗={b.封暗} />);
    z += b.高;
  });
  // 手：托在书摞两头靠下（托手.高）；撕的时候升到最上面那本两头、跟着往外掰；撒手以后张开，再往镜头这边、往下缩出画面
  const 左沿 = Math.min(...书们.map((b) => b.x0));
  const 右沿 = Math.max(...书们.map((b) => b.x0 + b.宽));
  const 红 = 书们[书们.length - 1]!;
  const 红半高 = 书们.reduce((s, b) => s + b.高, 0) - 红.高 + 卷子摞.高 + Math.round(红.高 / 2) + 撕书.翘;
  const 托高 = Math.round(托手.高 + (红半高 - 托手.高) * 举);
  const 张 = 态.撒手秒 > 0 ? 撒手.张 * Math.min(1, 态.撒手帧 / 撒手.张帧) : 0;
  const 收t = 态.撒手帧 > 撒手.收起 ? Math.min(1, (态.撒手帧 - 撒手.收起) / 撒手.收帧) ** 2 : 0;
  const 外 = 托手.外 + Math.round(撕书.掰开 * 态.撕) + Math.round(张) + Math.round(撒手.收走[0] * 收t);
  const 手z = z0 + 托高 + Math.round(撕书.举高 * 举) - Math.round(撒手.收走[2] * 收t);
  const 手y = y0 + Math.round((dy + 托手.前) * (1 - 收t)) - Math.round(撒手.收走[1] * 收t);
  return (
    <>
      <方块拼搭 方块们={取方块(态.化樱)} 原点={[-0.5, 0, 0]} />
      <像素空间 位={[0, 0, 0]}>
        {摞}
        <撕页手 到={[右沿 + 外, 手y, 手z]} 摆={楼上手摆} />
        <group scale={[-1, 1, 1]}>
          <撕页手 到={[-(左沿 - 外), 手y, 手z]} 摆={楼上手摆} />
        </group>
      </像素空间>
    </>
  );
};
