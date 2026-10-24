// 门口身后的地（用户 10-24 问「怎么超平坦背景 合理吗？」）：天和近景之间叠两层（地点/樱花林.ts）：远景（第 1 句那座樱花林山和平原，淡进原版的雾）、
//   中景（她种下的那片樱花林，第 13 句跟着日历长）。门口（场/2-门口/林间门口.tsx）和第 12 句末横移出卧室的屋外（场/2-卧室/卧室.tsx）共用。
// 每层是一块自己的三渲二画布，N 比近景小（像素小一号、看着远）；横着钉在近景上（近景 x 的那一点和中景、远景的 x × 近景N ÷ 层N 对齐），
//   所以半屏画布和整屏画布的同一半画出来一样（第 14 句合屏那一下接得上）；竖着中景最前一排藏在近景草地后沿底下，远景的地脚藏在中景最后一排底下。
// 雾：整层的颜色往天的地平色插（SVG feColorMatrix，按 sRGB 数值插，透明的地方不动），远景插得多。
import React, { useId } from 'react';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 侧机位, 侧投影, type 侧取景 } from './侧剖面.tsx';
import { 中景, 中景方块, 远景, 远景方块 } from './樱花林.ts';

/** 两层的雾（往天的地平色插几成）：中景（门口几十格外）原版没有雾，只淡一点好让近景的人、牌子跳出来；远景（第 1 句那座山，一百多格外）淡进雾里大半。Agent 暂定 */
export const 林雾 = { 中: 0.22, 远: 0.5 } as const;

/** 中景最前一排的地面线比近景草地后沿低几个页面像素（藏在近景草地底下，不露缝）；远景的地脚比中景最后一排后沿低几个页面像素 */
const 中景藏 = 8;
const 远景藏 = 12;
/** 门口近景草地往里铺几排（地点/门口小木屋.tsx 的 j 0～3） */
const 门口近景排 = 4;

/** 取景中心落在成片偶数像素上（同 地点/侧剖面.tsx 的约定） */
const 吸 = (v: number, 每格: number) => (Math.round((v * 每格) / 2) * 2) / 每格;

/** 近景的对齐：草地往里铺几排（中景藏在它后沿底下）；林偏 = 近景 x 林偏 那一点对林子的 x 0（门口 0；卧室是另一套坐标） */
export type 林间对齐 = { 近景排: number; 林偏: number };

/** 近景取景 → 中景、远景的取景（页面尺寸同近景画布） */
export const 背景取景 = (近: 侧取景, 宽: number, 高: number, 近顶面: number, 齐: 林间对齐 = { 近景排: 门口近景排, 林偏: 0 }) => {
  const Nn = 近.每格 / 16;
  const 近后沿 = 侧投影(近, 宽, 高, 近顶面)(0, 0, 齐.近景排).y;
  const 层 = (N: number, 地线页y: number): 侧取景 => {
    const 每格 = 16 * N;
    // 地线页y = 高/2 + 中心z × 每格 / 2（z = 0、y = 0 那条线）
    return { 中心: [吸(((近.中心[0] - 齐.林偏) * Nn) / N, 每格), 吸(((地线页y - 高 / 2) * 2) / 每格, 每格)], 每格 };
  };
  const 中 = 层(中景.N, 近后沿 + 中景藏);
  const 中后沿 = 侧投影(中, 宽, 高, 中景.顶面)(0, 0, 中景.行).y;
  const 远 = 层(远景.N, 中后沿 + 远景藏);
  return { 中, 远 };
};

/** 往 色 插 f 成的 SVG 滤镜（feColorMatrix 在 sRGB 上算；alpha 不动） */
const 雾滤镜: React.FC<{ id: string; 色: string; f: number }> = ({ id, 色, f }) => {
  const n = parseInt(色.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ((v / 255) * f).toFixed(4));
  const a = (1 - f).toFixed(4);
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={`${a} 0 0 0 ${r}  0 ${a} 0 0 ${g}  0 0 ${a} 0 ${b}  0 0 0 1 0`} />
    </filter>
  );
};

export type 林间背景属性 = {
  宽: number;
  高: number;
  /** 近景的取景、顶面（两层照它对齐） */
  取景: 侧取景;
  顶面: number;
  /** 两层的平涂色调（同近景） */
  色调: string;
  /** 雾往哪个色插：天的地平色 */
  雾色: string;
  生长: number;
  群系?: string;
  对齐?: 林间对齐;
};

/** 远景、中景两层（不带天）：一块 宽 × 高、铺满定位容器 */
export const 林间背景: React.FC<林间背景属性> = ({ 宽, 高, 取景, 顶面, 色调, 雾色, 生长, 群系, 对齐 }) => {
  const 层取景 = 背景取景(取景, 宽, 高, 顶面, 对齐);
  const id = `linwu${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const 铺满: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: 宽, height: 高 };
  return (
    <>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <雾滤镜 id={`${id}y`} 色={雾色} f={林雾.远} />
        <雾滤镜 id={`${id}z`} 色={雾色} f={林雾.中} />
      </svg>
      <div style={{ ...铺满, filter: `url(#${id}y)` }}>
        <三渲二画布 宽={宽} 高={高} 机位={侧机位(层取景.远, 远景.顶面)} 色调={色调} 描边={false}>
          <方块拼搭 方块们={远景方块()} 原点={[-0.5, 0, 0]} 群系={群系} 正面花草 />
        </三渲二画布>
      </div>
      <div style={{ ...铺满, filter: `url(#${id}z)` }}>
        <三渲二画布 宽={宽} 高={高} 机位={侧机位(层取景.中, 中景.顶面)} 色调={色调} 描边={false}>
          <方块拼搭 方块们={中景方块(生长)} 原点={[-0.5, 0, 0]} 群系={群系} 正面花草 />
        </三渲二画布>
      </div>
    </>
  );
};
