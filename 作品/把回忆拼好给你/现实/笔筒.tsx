// 玻璃笔筒，按原版的样子搭（放在 <像素空间> 里，单位贴图像素）：筒身照原版玻璃方块、玻璃瓶的画法，只有边框和几道高光是实的，中间透明（镂空），里面的东西看得见。
// 里面立着一支在用的笔，底下攒着用空的笔芯：笔芯是照原版木棍画的物品（16×16，一道斜的两像素宽），挤出成薄片（物品贴图.tsx），满度 0～1 越堆越高（撕页.ts 的 笔筒满度）。
// 笔芯的摆放按序号哈希取固定值：满度涨的时候只往上加新的，已经在里面的不动；根数的小数部分是正在落进去的那一根，从筒口上方掉下来。
import type React from 'react';
import type * as THREE from 'three';
import { hash2 } from '@engine/core/噪声.ts';
import type { Png } from '@engine/model/贴图.ts';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { 现实色 } from './色板.ts';
import { 新像素画, 成贴图, type 像素画 } from './像素图.ts';
import { 正面, 顶面 } from './像素块.tsx';
import { 笔芯满根 } from './撕页.ts';

/** 尺寸（贴图像素）：筒宽 30、高 34、深 14（顶面在斜投影里只有 28 个成片像素高，筒口不至于压住里面）；筒底厚 2。Agent 暂定 */
export const 笔筒尺寸 = { 宽: 30, 高: 34, 深: 14, 底厚: 2 } as const;
const S = 笔筒尺寸;

const 拆 = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 空笔芯的物品贴图（16×16）：照原版 stick.png 那样一道 45° 两像素宽的斜条，靠下一端是金属笔头、接着一截剩下的墨，往上是空管；反 = 左右翻过来 */
const 笔芯图 = (反: boolean): Png => {
  const px = new Uint8Array(16 * 16 * 4);
  const 点 = (x: number, y: number, 色: string) => {
    const xx = 反 ? 15 - x : x;
    px.set([...拆(色), 255], (y * 16 + xx) * 4);
  };
  for (let t = 0; t <= 12; t++) {
    const [x, y] = [2 + t, 13 - t];
    const 芯 = t < 2 ? 现实色.笔头 : t < 5 ? 现实色.余墨 : 现实色.笔芯;
    点(x, y, 芯);
    点(x + 1, y, t < 2 ? 现实色.笔头 : 现实色.笔芯边);
  }
  点(1, 14, 现实色.笔头);
  return { w: 16, h: 16, px };
};
const 笔芯层 = [[{ tex: 笔芯图(false) }], [{ tex: 笔芯图(true) }]];

// 筒身正面：一圈亮边，左上两道斜高光（原版玻璃的那两道），筒底两像素厚；中间透明
const 画筒前 = (): 像素画 => {
  const p = 新像素画(S.宽, S.高);
  const { 宽: w, 高: h } = S;
  p.方(0, 0, w, 1, 现实色.玻璃边);
  p.方(0, 0, 1, h, 现实色.玻璃边);
  p.方(w - 1, 0, 1, h, 现实色.玻璃暗边);
  p.方(0, h - S.底厚, w, S.底厚, 现实色.玻璃暗边);
  p.方(1, h - S.底厚, w - 2, 1, 现实色.玻璃边);
  for (let i = 0; i < 5; i++) p.点(3 + i, 8 - i, 现实色.玻璃光);
  for (let i = 0; i < 3; i++) p.点(3 + i, 12 - i, 现实色.玻璃光);
  p.方(2, 14, 1, h - 18, 现实色.玻璃边);
  return p;
};
// 筒口（顶面）：一圈边，里面透明
const 画筒口 = (): 像素画 => {
  const p = 新像素画(S.宽, S.深);
  p.方(0, 0, S.宽, 1, 现实色.玻璃暗边);
  p.方(0, S.深 - 1, S.宽, 1, 现实色.玻璃边);
  p.方(0, 0, 1, S.深, 现实色.玻璃边);
  p.方(S.宽 - 1, 0, 1, S.深, 现实色.玻璃暗边);
  return p;
};
// 立着的笔：三像素宽，略往右斜（每 8 行挪一列），笔夹一条
const 笔长 = 46;
const 画笔 = (): 像素画 => {
  const 宽 = 3 + Math.ceil(笔长 / 8);
  const p = 新像素画(宽, 笔长);
  for (let y = 0; y < 笔长; y++) {
    const x = Math.floor((笔长 - 1 - y) / 8);
    p.点(x, y, 现实色.笔身);
    p.点(x + 1, y, y < 4 ? 现实色.笔光 : 现实色.笔身);
    p.点(x + 2, y, 现实色.笔光);
    if (y >= 3 && y < 14) p.点(x + 2, y, 现实色.笔夹);
  }
  return p;
};

let 图: { 前: THREE.Texture; 口: THREE.Texture; 笔: THREE.Texture; 笔宽: number } | null = null;
const 取图 = () => (图 ??= { 前: 成贴图(画筒前()), 口: 成贴图(画筒口()), 笔: 成贴图(画笔()), 笔宽: 3 + Math.ceil(笔长 / 8) });

type 芯 = { x: number; y: number; z: number; 反: number };
/** 第 i 根笔芯的中心（筒内坐标，贴图像素，原点在筒的左下前角）。层 = 第几根 / 满根，越后放的越高 */
const 摆 = (i: number): 芯 => {
  const 内高 = S.高 - S.底厚 - 4;
  const 层 = i / 笔芯满根;
  return {
    x: 9 + Math.floor(hash2(i, 13, 1) * (S.宽 - 18)),
    y: 3 + Math.floor(hash2(i, 13, 2) * (S.深 - 6)),
    z: S.底厚 + 7 + Math.round(层 * (内高 - 14) + (hash2(i, 13, 3) - 0.5) * 3),
    反: hash2(i, 13, 4) < 0.5 ? 0 : 1,
  };
};

export const 笔筒: React.FC<{ x: number; y: number; z: number; 满度: number }> = ({ x, y, z, 满度 }) => {
  const g = 取图();
  const n = Math.max(0, Math.min(笔芯满根, Math.round(满度 * 笔芯满根 * 1e6) / 1e6)); // 去掉浮点尾数，整数根时没有落着的
  const 满根 = Math.floor(n);
  const 落 = n - 满根;
  const 芯们: (芯 & { 落差: number })[] = [];
  for (let i = 0; i < 满根; i++) 芯们.push({ ...摆(i), 落差: 0 });
  if (落 > 0 && 满根 < 笔芯满根) 芯们.push({ ...摆(满根), 落差: Math.round((1 - 落) ** 2 * S.高) });
  return (
    <group position={[x, y, z]}>
      {/* 笔：立在筒底靠右，探出筒口 */}
      <正面 x={S.宽 - g.笔宽 - 6} y={S.深 - 3} z={S.底厚} 宽={g.笔宽} 高={笔长} 图={g.笔} />
      {芯们.map((c, i) => (
        // 物品空间的正面朝 +Z、上是 +Y：绕 x 转 90° 让正面朝南、上朝上
        <group key={i} position={[c.x, c.y, c.z + c.落差]} rotation={[Math.PI / 2, 0, 0]} scale={16}>
          <ItemSprite layers={笔芯层[c.反]!} emissive={0} shadow={false} />
        </group>
      ))}
      <正面 x={0} y={0} z={0} 宽={S.宽} 高={S.高} 图={g.前} />
      <顶面 x={0} y={0} z={S.高} 宽={S.宽} 深={S.深} 图={g.口} />
    </group>
  );
};
