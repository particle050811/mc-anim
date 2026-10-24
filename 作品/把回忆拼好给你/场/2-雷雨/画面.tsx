// 第 6、7 句这一个镜头的成片画法（段 2-雷雨、2-拨开阴霾、核对-光柱破云 共用）：透视三渲二（平涂、不抗锯齿、不描边），后面一张 2D 画布画天（天.tsx），
// 画里是炸掉一角的门口小木屋和浅坑（弹坑.ts，屋里照原版的光暗下去，光照.ts）、四周起伏的平原和樱花林（地形.ts）、坐在坑沿的她和你、浮在坑里的掉落物、头顶一层原版 fancy 云（云层.tsx）、原版的雨；
// 第 7 句她脚下的魔法阵、往天上冲的光柱、云撕开的洞、从洞里照下来的阳光（平涂的发光区）。整片后期包住天和 3D；歌词浮在最上面、不过后期（同前后两句）。
// 谁在哪、什么颜色全在 编排.ts，这里只按歌曲帧画。干净 = 不画歌词（第 8 句收的照片用）。
import React, { useCallback, useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sRGB转线性, 拼搭缓冲, 拼搭网格, type 方块 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { MAGICAL_WINE_FOX } from '@库/角色/魔法酒狐.tsx';
import { 画幅 } from '../../分镜.ts';
import { 格原点 } from '../../地点/门口小木屋.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 光柱件, 地光 } from './光柱.tsx';
import * as 参 from './参数.ts';
import { 坑 } from './弹坑.ts';
import { 四周方块 } from './地形.ts';
import { 掉落物们 as 掉落物组 } from './掉落物.tsx';
import type { 云格子 } from './云.ts';
import { 云层 } from './云层.tsx';
import { 雨量 } from './声音.ts';
import { 算光, 面亮 } from './光照.ts';
import { 设雾色, 补雾, 透视天 } from './天.tsx';
import type { RGB } from './天气.ts';
import { 她, 你 } from './角色.tsx';
import { 魔法阵 } from './酒狐件.tsx';
import { 雨 } from './雨.tsx';
import {
  事,
  云剩,
  云飘,
  光柱透,
  光柱顶,
  刻,
  发光区,
  天晴在,
  天气色,
  她态,
  你态,
  掉落刻,
  掉落物们,
  撞亮,
  机位,
  歌秒,
  洞心,
  这帧调子,
  透视雨片们,
  闪,
  阵大小,
  阵转,
} from './编排.ts';

const 宽 = 画幅.宽, 高 = 画幅.高;
const 拆 = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as unknown as RGB;

// ---------- 四周的地：自己建网格（补原版柱形雾）；屋子和坑离镜头不到五十格、雾够不着，不补 ----------
type 类 = '实心' | '镂空';
let 地材质们: Record<类, THREE.Material> | null = null;
const 地材质 = (c: 类) => {
  if (!地材质们) {
    const common = { map: blockAtlas().original, vertexColors: true, roughness: 1, metalness: 0 };
    地材质们 = {
      实心: 补雾(new THREE.MeshStandardMaterial(common)),
      镂空: 补雾(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide })),
    };
  }
  return 地材质们[c];
};
const 建网格 = (方块们: readonly 方块[], 群系: string, 名: string): THREE.Mesh[] => {
  const 缓冲们 = 拼搭缓冲(方块们, { 原点: 格原点, 群系 });
  if (缓冲们.半透明.idx.length || 缓冲们.发光.idx.length) throw new Error('四周的地里不该有半透明、发光的方块');
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空'] as const) {
    const b = 缓冲们[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, 地材质(c));
    mesh.name = `雷雨四周-${名}-${c}`;
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  return out;
};
// 一个渲染页面只建一次
let 四周网格缓存: THREE.Mesh[] | null = null;
const 四周网格 = () => {
  if (!四周网格缓存) {
    const m = 四周方块();
    四周网格缓存 = [...建网格(m.平原, 参.群系, '平原'), ...建网格(m.樱花林, 'minecraft:cherry_grove', '樱花林')];
  }
  return 四周网格缓存;
};
const 四周: React.FC = () => {
  const meshes = useMemo(四周网格, []);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

// ---------- 屋子和坑：方块拼搭的网格，每个面再乘原版的光（光照.ts：屋里比屋外暗，缺口看得出是个洞） ----------
let 屋子网格缓存: THREE.Mesh[] | null = null;
const 屋子网格 = () => {
  if (!屋子网格缓存) {
    const 留下 = 坑().留下;
    const 表 = 算光(留下);
    屋子网格缓存 = 拼搭网格(留下, { 原点: 格原点, 群系: 参.群系 });
    for (const m of 屋子网格缓存) {
      const g = m.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const nor = g.getAttribute('normal') as THREE.BufferAttribute;
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      // 拼搭网格 每个面四个顶点连着放
      for (let q = 0; q < pos.count; q += 4) {
        const 心 = [0, 1, 2].map((c) => (pos.getComponent(q, c) + pos.getComponent(q + 1, c) + pos.getComponent(q + 2, c) + pos.getComponent(q + 3, c)) / 4);
        const 亮 = sRGB转线性(面亮(表, 心, [nor.getX(q), nor.getY(q), nor.getZ(q)]));
        for (let v = q; v < q + 4; v++) col.setXYZ(v, col.getX(v) * 亮, col.getY(v) * 亮, col.getZ(v) * 亮);
      }
      m.name = `雷雨屋子-${m.name}`;
    }
  }
  return 屋子网格缓存;
};
const 屋子: React.FC = () => {
  const meshes = useMemo(屋子网格, []);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

// ---------- 场景内容（Z 朝上） ----------
const 撞色 = 拆(参.光柱.色);
/** 光柱底：她举着的两只手上面（头顶往上 离头 格） */
const 光柱底: V3 = [参.站位.她[0], 参.站位.她[1], 参.站位.她[2] + MAGICAL_WINE_FOX.headTop + 参.光柱.离头];

const 场景: React.FC<{ 帧: number; 眼: V3; 云色: RGB }> = ({ 帧, 眼, 云色 }) => {
  const 秒 = 歌秒(帧);
  const 心 = 洞心();
  const 剩 = useCallback((c: 云格子) => 云剩(c, 帧), [帧]);
  const 撞 = useMemo(() => ({ 心, 亮: 撞亮(帧), 色: 撞色 }), [帧, 心[0], 心[1]]);
  const 阵 = 阵大小(帧);
  const 落 = useMemo(掉落物们, []);
  const 雨片们 = useMemo(() => 透视雨片们(眼), [眼[0], 眼[1], 眼[2]]);
  return (
    <>
      <四周 />
      <屋子 />
      <掉落物组 们={落} 刻={掉落刻(帧)} />
      <她 态={她态(帧)} 秒={秒} />
      <你 态={你态(帧)} 秒={秒} />
      <魔法阵 心={[心[0], 心[1], 0]} 转={阵转(帧)} 大小={阵} />
      <地光 心={[心[0], 心[1], 0.01]} 大小={阵} />
      <光柱件 底={光柱底} 顶={光柱顶(帧, 光柱底[2])} 刻={刻(帧)} 透={光柱透(帧)} />
      <云层 剩={剩} 飘={云飘(帧)} 色={云色} 撞={撞} />
      <雨 片们={雨片们} 刻={刻(帧)} 色={闪(帧) ? 参.雨色.闪 : 参.雨色.平时} 雨量={雨量(帧)} />
    </>
  );
};

// ---------- 整个镜头 ----------
/** 全片 15 句的符文歌词行（歌曲帧） */
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 0));

export type 雷雨画面属性 = {
  /** 歌曲帧 */
  帧: number;
  /** 不画歌词 */
  干净?: boolean;
  /** 整片后期（照片底片关：贴进第 8 句以后跟着那一句的后期走） */
  后期?: boolean;
};

export const 雷雨画面: React.FC<雷雨画面属性> = ({ 帧, 干净 = false, 后期 = true }) => {
  const 机 = 机位(帧);
  const 色 = 天气色(帧);
  const 调 = 这帧调子(帧);
  // 雾色是几个材质共用的统一量，画这一帧之前设
  设雾色(色.雾);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <整片后期 调色={后期 ? 调.后期.调色 : null} 种子={帧}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, overflow: 'hidden' }}>
          <透视天 机位={机} 宽={宽} 高={高} 天={色.天} 雾={色.雾} 晴天={色.晴天} 晴雾={色.晴雾} 晴在={天晴在(帧)} />
          <三渲二画布 宽={宽} 高={高} 机位={机} 色调={调.色调} 发光区={发光区(帧)} style={{ position: 'absolute', left: 0, top: 0 }}>
            <场景 帧={帧} 眼={机.眼} 云色={色.云} />
          </三渲二画布>
        </div>
      </整片后期>
      {!干净 && <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 调.后期.描边 }} 帧={帧} />}
    </AbsoluteFill>
  );
};

/** 第 8 句照片墙的第四张照片「光柱破云」的底片：照片-光柱破云 那一帧，不带歌词 */
export const 光柱破云画面: React.FC<{ 后期?: boolean }> = ({ 后期 = false }) => <雷雨画面 帧={事('照片-光柱破云')} 干净 后期={后期} />;
