// 门口身后的地（用户 10-24 问「怎么超平坦背景 合理吗？」）：天和近景之间叠两层（地点/樱花林.ts）：远景（再往后的山和平原，淡进原版的雾）、
//   中景（屋子西边的缓坡）。两层上的樱花林是她种的，第 13 句跟着日历一棵棵冒出来（生长）。门口（场/2-门口/林间门口.tsx）和第 12 句末横移出卧室的屋外（场/2-卧室/卧室.tsx）共用。
// 每层是一块自己的三渲二画布，N 比近景小（像素小一号、看着远）；横着钉在近景上（近景 x 的那一点和中景、远景的 x × 近景N ÷ 层N 对齐），
//   所以半屏画布和整屏画布的同一半画出来一样（第 14 句合屏那一下接得上）；竖着中景最前一排藏在近景草地后沿底下，远景的地脚藏在中景最后一排底下。
// 雾：整层的颜色往天的地平色插（SVG feColorMatrix，按 sRGB 数值插，透明的地方不动），远景插得多。
import React, { useId } from 'react';
import { BlockAssembly } from '@engine/model/方块拼搭.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { sideRig, sideProjection, type SideFraming } from './侧剖面.tsx';
import { midGrove, midBlocks, farLayer, farBlocks } from './樱花林.ts';

/** 两层的雾（往天的地平色插几成）：中景（门口几十格外）原版没有雾，只淡一点好让近景的人、牌子跳出来；远景（第 1 句那座山，一百多格外）也还在原版 12 区块的雾起点（172.8 格）以内，只淡两成。Agent 暂定。
 *  核查 10-24「2-时差 末尾看着是一棵树，要看得出是林子」：中景 0.22 淡得树干都发灰、藏进门口那棵大树的树冠里，减到 0.12，后面一棵棵树干看得出来。
 *  核查 10-24「雾带」：远景原来淡五成，泥土侧面的棕和地平色的浅蓝对半混成一整片灰，压在蓝天前面像一条灰带（2-空床 末尾、2-时差 左屏），减到 0.2，山还是草和土的颜色 */
export const groveFog = { 中: 0.12, far: 0.2 } as const;

/** 中景最前一排的地面线比近景草地后沿低几个页面像素（藏在近景草地底下，不露缝）；远景的地脚比中景最后一排后沿低几个页面像素 */
const midHide = 8;
const farHide = 12;
/** 门口近景草地往里铺几排（地点/门口小木屋.tsx 的 j 0～3） */
const doorNearRow = 4;

/** 取景中心落在成片偶数像素上（同 地点/侧剖面.tsx 的约定） */
const snap = (v: number, pxPerCell: number) => (Math.round((v * pxPerCell) / 2) * 2) / pxPerCell;

/** 近景的对齐：草地往里铺几排（中景藏在它后沿底下）；林偏 = 近景 x 林偏 那一点对林子的 x 0（门口 0；卧室是另一套坐标） */
export type GroveAlign = { nearRow: number; forestOffset: number };

/** 近景取景 → 中景、远景的取景（页面尺寸同近景画布） */
export const backdropFraming = (near: SideFraming, width: number, height: number, nearTop: number, alignment: GroveAlign = { nearRow: doorNearRow, forestOffset: 0 }) => {
  const Nn = near.pxPerCell / 16;
  const nearBackEdge = sideProjection(near, width, height, nearTop)(0, 0, alignment.nearRow).y;
  const bgLayer = (N: number, groundLineY: number): SideFraming => {
    const pxPerCell = 16 * N;
    // 地线页y = 高/2 + 中心z × 每格 / 2（z = 0、y = 0 那条线）
    return { 中心: [snap(((near.中心[0] - alignment.forestOffset) * Nn) / N, pxPerCell), snap(((groundLineY - height / 2) * 2) / pxPerCell, pxPerCell)], pxPerCell };
  };
  const midLayer = bgLayer(midGrove.N, nearBackEdge + midHide);
  const midBackEdge = sideProjection(midLayer, width, height, midGrove.topDepth)(0, 0, midGrove.行).y;
  const far = bgLayer(farLayer.N, midBackEdge + farHide);
  return { 中: midLayer, far };
};

/** 往 色 插 f 成的 SVG 滤镜（feColorMatrix 在 sRGB 上算；alpha 不动） */
const FogFilter: React.FC<{ id: string; 色: string; f: number }> = ({ id, 色: color, f }) => {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ((v / 255) * f).toFixed(4));
  const a = (1 - f).toFixed(4);
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={`${a} 0 0 0 ${r}  0 ${a} 0 0 ${g}  0 0 ${a} 0 ${b}  0 0 0 1 0`} />
    </filter>
  );
};

export type ForestBackdropProps = {
  宽: number;
  高: number;
  /** 近景的取景、顶面（两层照它对齐） */
  framing: SideFraming;
  topDepth: number;
  /** 两层的平涂色调（同近景） */
  tint: string;
  /** 雾往哪个色插：天的地平色 */
  fogColor: string;
  growth: number;
  群系?: string;
  alignment?: GroveAlign;
};

/** 远景、中景两层（不带天）：一块 宽 × 高、铺满定位容器 */
export const ForestBackdrop: React.FC<ForestBackdropProps> = ({ 宽: width, 高: height, framing, topDepth, tint, fogColor, growth, 群系: biome, alignment }) => {
  const layerFraming = backdropFraming(framing, width, height, topDepth, alignment);
  const id = `linwu${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fullCoverStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: width, height: height };
  return (
    <>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <FogFilter id={`${id}y`} 色={fogColor} f={groveFog.far} />
        <FogFilter id={`${id}z`} 色={fogColor} f={groveFog.中} />
      </svg>
      <div style={{ ...fullCoverStyle, filter: `url(#${id}y)` }}>
        <ToonCanvas 宽={width} 高={height} cameraRig={sideRig(layerFraming.far, farLayer.topDepth)} tint={tint} outline={false}>
          <BlockAssembly blocks={farBlocks(growth)} 原点={[-0.5, 0, 0]} 群系={biome} frontPlants />
        </ToonCanvas>
      </div>
      <div style={{ ...fullCoverStyle, filter: `url(#${id}z)` }}>
        <ToonCanvas 宽={width} 高={height} cameraRig={sideRig(layerFraming.中, midGrove.topDepth)} tint={tint} outline={false}>
          <BlockAssembly blocks={midBlocks(growth)} 原点={[-0.5, 0, 0]} 群系={biome} frontPlants />
        </ToonCanvas>
      </div>
    </>
  );
};
