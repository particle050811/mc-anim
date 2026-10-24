// 门口画布带上身后的地（用户 10-24 问「怎么超平坦背景 合理吗？」）：同 门口.tsx 的 门口画布（天 → 三维的屋子、角色 → 叠层），
//   在天和屋子之间叠远景、中景两层（地点/林间背景.tsx）。门口.tsx 不是本路的，这里另包一层，不改它。
import type React from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 侧机位 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import { 林间背景 } from '../../地点/林间背景.tsx';
import { 门口小木屋 } from '../../地点/门口小木屋.tsx';
import { 描边 as 描边默认 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 取景 as 默认取景, 天色, 正交顶面, 白天刻, 默认天弧, 群系 } from './参数.ts';
import type { 门口画布属性 } from './门口.tsx';

const 乘色 = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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
  const 铺满: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: 宽, height: 高 };
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden' }}>
      <侧剖面天空 取景={取景} 宽={宽} 高={高} 色={天色} 刻={刻} 弧={天体弧} 明暗幅度={明暗幅度} 残影={残影} />
      <林间背景 宽={宽} 高={高} 取景={取景} 顶面={顶面} 色调={色调} 雾色={天色.地平} 生长={生长} 群系={群} />
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
