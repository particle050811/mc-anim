// 第 14 句考场（分屏右半，45.06～46.13）：考场里一张课桌的桌面特写，墙上挂钟、桌上摊着答题卡、史蒂夫的手握着笔在涂卡，收卷铃一响撒手、笔倒在答题卡上。
// 按 MC 方块和像素物件搭（同 课桌.tsx）：墙白色混凝土粉末、桌面白桦木上半砖；钟、答题卡是自画的像素贴图（不写科目、钟点、任何字）。布局在 考场布局.ts。
// 纯按 props 画，不读帧号：写字到第几步、撒手以后第几帧由场（场/2-门口/归隐.tsx）按歌曲帧算好传进来。放进 现实画布（顶面 = 考场顶面）。
import type React from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 现实色 } from './色板.ts';
import { 新像素画, 成贴图, type 像素画 } from './像素图.ts';
import { 像素空间, 正面, 顶面 } from './像素块.tsx';
import { 撕页手 } from './撕页手.tsx';
import { 课桌亮度 } from './课桌.tsx';
import { 写字步们, 握笔向, 握笔处, 手高, 笔尖, 笔形, 考场手摆, 考场摆放, 考场桌, 落笔 } from './考场布局.ts';

const 考场方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number, 亮?: number) => out.push({ 状态, 位: [i, j, k], 亮 });
  const { 深, 左, 右, 桌肚深, 桌肚底, 墙顶 } = 考场桌;
  for (let i = 左; i < 右; i++) {
    for (let k = 0; k < 墙顶; k++) 放('minecraft:white_concrete_powder', i, 深, k);
    for (let j = 0; j < 深; j++) 放('minecraft:birch_slab[type=top]', i, j, -1);
    for (let k = 桌肚底 + 1; k < -1; k++) 放('minecraft:birch_planks', i, 桌肚深, k, 课桌亮度.桌肚背);
    for (let j = 0; j < 桌肚深; j++) 放('minecraft:birch_slab[type=top]', i, j, 桌肚底, 课桌亮度.桌肚底);
  }
  return out;
};
const 方块们 = 考场方块();

// ---------- 贴图 ----------
const 缓存 = new Map<string, THREE.Texture>();
const 取 = (键: string, 画: () => 像素画) => {
  let t = 缓存.get(键);
  if (!t) 缓存.set(键, (t = 成贴图(画())));
  return t;
};

/** 挂钟的指针：从钟面中心量的角（圈，0 = 指向 12、顺时针）。时针 时 + 分/60 走一圈 12 小时 */
export type 钟点 = { 时: number; 分: number; 秒: number };

const 画钟 = (钟: 钟点): 像素画 => {
  const d = 考场摆放.钟.径;
  const p = 新像素画(d, d);
  const c = (d - 1) / 2;
  for (let y = 0; y < d; y++)
    for (let x = 0; x < d; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r > c + 0.5) continue;
      p.点(x, y, r > c - 1.5 ? 现实色.钟圈[(x + y) % 2]! : 现实色.钟面[r < c / 2 ? 0 : (x * 7 + y * 3) % 5 === 0 ? 1 : 0]!);
    }
  // 十二个刻度（12、3、6、9 两个像素长），不写数字
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    const 长 = h % 3 === 0 ? 2 : 1;
    for (let t = 0; t < 长; t++) {
      const r = c - 2.5 - t;
      p.点(Math.round(c + r * Math.sin(a)), Math.round(c - r * Math.cos(a)), 现实色.钟针);
    }
  }
  const 针 = (圈: number, 长: number, 色: string) => {
    const a = 圈 * Math.PI * 2;
    for (let t = 0; t <= 长; t += 0.5) p.点(Math.round(c + t * Math.sin(a)), Math.round(c - t * Math.cos(a)), 色);
  };
  针((钟.时 % 12) / 12 + 钟.分 / 720, c * 0.5, 现实色.钟针);
  针(钟.分 / 60 + 钟.秒 / 3600, c * 0.78, 现实色.钟针);
  针(钟.秒 / 60, c * 0.85, 现实色.秒针);
  p.方(Math.floor(c), Math.floor(c), 2, 2, 现实色.钟针);
  return p;
};

const 画答题卡 = (): 像素画 => {
  const { 宽, 深 } = 考场摆放.答题卡;
  const p = 新像素画(宽, 深);
  const [印, 淡, 黑] = [现实色.卡印, 现实色.卡印淡, 现实色.涂黑];
  p.噪(0, 0, 宽, 深, 现实色.纸, 211, [5, 3, 2]);
  // 一圈红框
  p.方(1, 1, 宽 - 2, 1, 印);
  p.方(1, 深 - 2, 宽 - 2, 1, 印);
  p.方(1, 1, 1, 深 - 2, 印);
  p.方(宽 - 2, 1, 1, 深 - 2, 印);
  // 左上：考号填涂区，8 列 × 5 行小格，每列涂黑一格
  p.方(3, 3, 19, 13, 淡);
  p.方(4, 4, 17, 11, 现实色.纸[0]);
  for (let 列 = 0; 列 < 8; 列++)
    for (let 行 = 0; 行 < 5; 行++) {
      const 涂 = (列 * 3 + 1) % 5 === 行;
      p.点(5 + 列 * 2, 5 + 行 * 2, 涂 ? 黑 : 印);
    }
  // 右上：条形码（粘贴处一圈虚线框，里面一道道竖条）
  for (let x = 30; x < 60; x += 2) {
    p.点(x, 3, 印);
    p.点(x, 15, 印);
  }
  for (let y = 3; y < 16; y += 2) {
    p.点(29, y, 印);
    p.点(60, y, 印);
  }
  const 条 = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1];
  条.forEach((v, n) => v && p.方(32 + n, 6, 1, 7, 黑));
  p.方(2, 18, 宽 - 4, 1, 印);
  // 中间：选择题，三组、每组五行，每行四个选项框（两个像素一格），涂黑一个
  for (let 组 = 0; 组 < 3; 组++)
    for (let 行 = 0; 行 < 5; 行++) {
      const x0 = 4 + 组 * 20;
      const y = 21 + 行 * 2;
      p.点(x0, y, 淡);
      const 选 = (组 * 5 + 行 * 7 + 2) % 4;
      for (let o = 0; o < 4; o++) p.方(x0 + 3 + o * 3, y, 2, 1, o === 选 ? 黑 : 印);
    }
  p.方(2, 32, 宽 - 4, 1, 印);
  // 下面：作答区几道淡红横线，上面写着一行行蓝黑的字（只是笔画样的点，不写成字）
  for (let 行 = 0; 行 < 4; 行++) {
    const y = 35 + 行 * 2.5;
    p.方(3, Math.round(y), 宽 - 6, 1, 淡);
    for (let x = 4; x < 宽 - 5 - (行 === 3 ? 30 : 0); x++) if ((x * 13 + 行 * 7) % 5 < 2) p.点(x, Math.round(y) - 1, 现实色.手写);
  }
  return p;
};

// ---------- 笔 ----------
const 笔材质 = (色: string) => new THREE.MeshStandardMaterial({ color: new THREE.Color(色), roughness: 1 });
const 笔材质们 = { 身: 笔材质(现实色.考笔), 夹: 笔材质(现实色.考笔夹), 头: 笔材质(现实色.考笔头) };
const 单位盒 = new THREE.BoxGeometry(1, 1, 1);

/** 一支笔：笔尖在 尖（贴图像素），笔杆沿 向（单位向量）伸出去；笔杆是方的（粗 × 粗），头一截金属、尾一截笔夹 */
const 笔: React.FC<{ 尖: readonly [number, number, number]; 向: THREE.Vector3 }> = ({ 尖, 向 }) => {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), 向), [向]);
  const { 长, 粗 } = 笔形;
  const 段 = (z0: number, z1: number, m: THREE.Material, 加粗 = 0) => (
    <mesh geometry={单位盒} material={m} position={[0, 0, (z0 + z1) / 2]} scale={[粗 + 加粗, 粗 + 加粗, z1 - z0]} />
  );
  return (
    <group position={尖 as [number, number, number]} quaternion={q}>
      {段(0, 3, 笔材质们.头)}
      {段(3, 长 - 8, 笔材质们.身)}
      {段(长 - 8, 长, 笔材质们.夹)}
    </group>
  );
};

/** 收卷铃那一帧撒手以后第 f 帧（f < 0 = 还在写）笔的样子：尖的位置、笔杆方向 */
export const 笔于 = (f: number, 写步: number): { 尖: [number, number, number]; 向: THREE.Vector3 } => {
  const d = new THREE.Vector3(...握笔向).normalize();
  const 平 = new THREE.Vector3(d.x, d.y, 0).normalize();
  const 仰0 = Math.asin(d.z);
  const 步 = 写字步们[((写步 % 写字步们.length) + 写字步们.length) % 写字步们.length]!;
  if (f < 0) return { 尖: [笔尖.x + 步[0], 笔尖.y + 步[1], 笔形.粗 / 2], 向: d };
  // 倒：绕笔尖往平放的方向倒下，越倒越快（仰角按 1 − t² 落到 0）；倒平以后整支弹起 弹高 再落回
  const t = Math.min(1, f / 落笔.倒帧);
  const 仰 = 仰0 * (1 - t * t);
  const 向 = 平.clone().multiplyScalar(Math.cos(仰)).setZ(Math.sin(仰));
  const 弹t = (f - 落笔.倒帧) / 落笔.弹帧;
  const 弹 = 弹t > 0 && 弹t < 1 ? 落笔.弹高 * Math.sin(Math.PI * 弹t) : 0;
  return { 尖: [笔尖.x + 步[0], 笔尖.y + 步[1], 笔形.粗 / 2 + Math.round(弹)], 向 };
};

export type 考场参数 = {
  /** 收卷铃（撒手）以后第几帧；负的 = 还在写 */
  撒手帧: number;
  /** 写到第几步（写字步们 按帧循环；撒手以后停在那一步） */
  写步: number;
  /** 挂钟的指针 */
  钟: 钟点;
};

export const 考场: React.FC<考场参数> = ({ 撒手帧, 写步, 钟 }) => {
  const 钟图 = 取(`钟${钟.时},${钟.分},${钟.秒}`, () => 画钟(钟));
  const 卡图 = 取('答题卡', 画答题卡);
  const 停步 = 撒手帧 < 0 ? 写步 : 写步 - 撒手帧 - 1;
  const 笔态 = 笔于(撒手帧, 停步);
  const 卡 = 考场摆放.答题卡;
  const 钟位 = 考场摆放.钟;
  // 手：写字时手那头压在笔杆 握笔处 往上 手高；撒手以后往右上抬走（缓出）
  const d = new THREE.Vector3(...握笔向).normalize();
  const 握 = new THREE.Vector3(...笔于(-1, 停步).尖).addScaledVector(d, 笔形.长 * 握笔处);
  const 抬 = 撒手帧 < 0 ? 0 : 1 - (1 - Math.min(1, (撒手帧 + 1) / 落笔.抬帧)) ** 2;
  const 到: [number, number, number] = [
    Math.round(握.x + 落笔.手抬[0] * 抬),
    Math.round(握.y + 落笔.手抬[1] * 抬),
    Math.round(握.z + 手高 + 落笔.手抬[2] * 抬),
  ];
  return (
    <>
      <方块拼搭 方块们={方块们} />
      <像素空间 位={[0, 0, 0]}>
        <顶面 x={卡.x} y={卡.y} z={0.05} 宽={卡.宽} 深={卡.深} 图={卡图} />
        <正面 x={钟位.x - 钟位.径 / 2} y={考场桌.深 * 16 - 1} z={钟位.z - 钟位.径 / 2} 宽={钟位.径} 高={钟位.径} 图={钟图} />
        <笔 尖={笔态.尖} 向={笔态.向} />
        <撕页手 到={到} 摆={考场手摆} />
      </像素空间>
    </>
  );
};
