// 门口画布带上身后的地（用户 10-24 问「怎么超平坦背景 合理吗？」）：同 门口.tsx 的 门口画布（天 → 三维的屋子、角色 → 叠层），
//   在天和屋子之间叠两层背景（地点/樱花林.ts）：远景（第 1 句那座樱花林山和平原，淡进原版的雾）、中景（她种下的那片樱花林，第 13 句跟着日历长）。
// 每层是一块自己的三渲二画布，N 比近景小（像素小一号、看着远）；横着钉在近景上（近景 x 的那一点和中景、远景的 x × 近景N ÷ 层N 对齐），
//   所以半屏画布和整屏画布的同一半画出来一样（第 14 句合屏那一下接得上）；竖着中景最前一排藏在近景草地后沿底下，远景的地脚藏在中景最后一排底下。
// 雾：整层的颜色往天的地平色插（SVG feColorMatrix，按 sRGB 数值插，透明的地方不动），远景插得多。门口.tsx 不是本路的，这里另包一层，不改它。
import React, { useId } from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 侧机位, 侧投影, type 侧取景 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import { 中景, 中景方块, 远景, 远景方块 } from '../../地点/樱花林.ts';
import { 门口小木屋 } from '../../地点/门口小木屋.tsx';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import { 描边 as 描边默认 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 取景 as 默认取景, 天色, 正交顶面, 白天刻, 默认天弧, 群系 } from './参数.ts';
import type { 门口画布属性 } from './门口.tsx';

/** 两层的雾（往天的地平色插几成）：中景（门口几十格外）原版没有雾，只淡一点好让近景的人、牌子跳出来；远景（第 1 句那座山，一百多格外）淡进雾里大半。Agent 暂定 */
export const 林雾 = { 中: 0.22, 远: 0.5 } as const;

/** 中景最前一排的地面线比近景草地后沿（近景第 4 排后边）低几个页面像素（藏在近景草地底下，不露缝）；远景的地脚比中景最后一排后沿低几个页面像素 */
const 中景藏 = 8;
const 远景藏 = 12;
/** 近景草地往里铺几排（地点/门口小木屋.tsx 的 j 0～3） */
const 近景排 = 4;

const 乘色 = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** 取景中心落在成片偶数像素上（同 地点/侧剖面.tsx 的约定） */
const 吸 = (v: number, 每格: number) => (Math.round((v * 每格) / 2) * 2) / 每格;

/** 近景取景 → 中景、远景的取景（页面尺寸同近景画布） */
export const 背景取景 = (近: 侧取景, 宽: number, 高: number, 近顶面: number) => {
  const Nn = 近.每格 / 16;
  const 近后沿 = 侧投影(近, 宽, 高, 近顶面)(0, 0, 近景排).y;
  const 层 = (N: number, 地线页y: number): 侧取景 => {
    const 每格 = 16 * N;
    // 地线页y = 高/2 + 中心z × 每格 / 2（z = 0、y = 0 那条线）
    return { 中心: [吸((近.中心[0] * Nn) / N, 每格), 吸(((地线页y - 高 / 2) * 2) / 每格, 每格)], 每格 };
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

export type 林间门口画布属性 = 门口画布属性 & {
  /** 中景樱花林长到哪（第 13 句的生长进度 0～1，见 地点/樱花林.ts 的 中景方块）；第 14、15 句默认 1 */
  生长?: number;
};

/** 一块 宽 × 高 的定位容器：天、远景、中景、近景三维、叠层 */
export const 林间门口画布: React.FC<林间门口画布属性> = ({
  宽 = 1280,
  高 = 720,
  取景 = 默认取景,
  顶面 = 正交顶面,
  刻 = 白天刻,
  弧,
  明暗幅度,
  残影,
  调子: 调 = '夏日白天',
  亮度 = 1,
  描边宽 = 描边默认.宽,
  叠层,
  children,
  生长 = 1,
  群系: 群 = 群系,
  ...屋
}) => {
  if (宽 % 2 || 高 % 2) throw new Error(`林间门口画布的宽高要是偶数：${宽}×${高}`);
  const 天体弧 = 弧 === null ? undefined : (弧 ?? 默认天弧(取景, 宽, 高));
  const t = typeof 调 === 'string' ? 色板[调] : 调;
  const 色调 = 乘色(t.色调, 亮度);
  const 层取景 = 背景取景(取景, 宽, 高, 顶面);
  const id = `linwu${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const 铺满: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: 宽, height: 高 };
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden' }}>
      <侧剖面天空 取景={取景} 宽={宽} 高={高} 色={天色} 刻={刻} 弧={天体弧} 明暗幅度={明暗幅度} 残影={残影} />
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <雾滤镜 id={`${id}y`} 色={天色.地平} f={林雾.远} />
        <雾滤镜 id={`${id}z`} 色={天色.地平} f={林雾.中} />
      </svg>
      <div style={{ ...铺满, filter: `url(#${id}y)` }}>
        <三渲二画布 宽={宽} 高={高} 机位={侧机位(层取景.远, 远景.顶面)} 色调={色调} 描边={false}>
          <方块拼搭 方块们={远景方块()} 原点={[-0.5, 0, 0]} 群系={群} 正面花草 />
        </三渲二画布>
      </div>
      <div style={{ ...铺满, filter: `url(#${id}z)` }}>
        <三渲二画布 宽={宽} 高={高} 机位={侧机位(层取景.中, 中景.顶面)} 色调={色调} 描边={false}>
          <方块拼搭 方块们={中景方块(生长)} 原点={[-0.5, 0, 0]} 群系={群} 正面花草 />
        </三渲二画布>
      </div>
      <三渲二画布
        宽={宽}
        高={高}
        机位={侧机位(取景, 顶面)}
        色调={色调}
        描边={描边默认.开 ? { 宽: 描边宽, 色: t.描边 } : false}
        style={铺满}
      >
        <门口小木屋 {...屋} 群系={群} />
        {children}
      </三渲二画布>
      {叠层}
    </div>
  );
};
