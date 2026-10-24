// 第 6 句的画布：门口那个剖面（朝北、正交、斜投影，同 场/2-门口/门口.tsx 的画法），屋子炸成了坑（弹坑.ts），雷雨夜。
// 三层：后面一张 2D 的天（地点/天空.tsx，雷雨的颜色、不画太阳月亮），中间三渲二画布（坑的方块、掉落物、雨、children 里的角色），上面 叠层（气泡）。
// 不用 门口画布：它总带着完好的小木屋。地面、地下、花草照抄 门口小木屋 的布局，坑沿和门那个机位是同一个地方（测试对过）。
// 从坑口看进去的坑壁只压侧面（参.坑壁亮），不然坑壁和剖面切口一样是泥土侧面，看不出是个洞；朝天的顶面照原版满光（核查 10-24：坑沿那圈草顶面压暗成一圈暗带）。
// 坑壁那些方块单拼一份，套一层面明暗不同的平涂（嵌套平涂：里层先换材质，外层跳过）。
import React, { useMemo } from 'react';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { MC面明暗, 平涂 } from '@engine/三渲二/平涂.tsx';
import { 侧机位, type 侧取景 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import { 格原点 } from '../../地点/门口小木屋.tsx';
import { 正交顶面 } from '../../画风.ts';
import { 坑, 坑壁, 剖面里 } from './弹坑.ts';
import { 坑壁亮, 群系 } from './参数.ts';

/** 坑壁的面明暗：侧面、底面乘 坑壁亮，顶面照原版 */
const 坑壁面明暗 = { 顶: MC面明暗.顶, 南北: MC面明暗.南北 * 坑壁亮, 东西: MC面明暗.东西 * 坑壁亮, 底: MC面明暗.底 * 坑壁亮 };

export type 坑画布属性 = {
  宽?: number;
  高?: number;
  取景: 侧取景;
  /** 天：地平到顶的渐变（sRGB） */
  天色: { 地平: string; 顶: string; 渐变高: number };
  /** 平涂色调（雷雨压暗；闪电那两刻满亮） */
  色调: string;
  /** 描边：本作品全片不描（画风.ts 的 描边、画布调子 给 false），留着参数照 三渲二画布 */
  描边: { 宽: number; 色: string } | false;
  叠层?: React.ReactNode;
  children?: React.ReactNode;
};

export const 坑画布: React.FC<坑画布属性> = ({ 宽 = 1280, 高 = 720, 取景, 天色, 色调, 描边, 叠层, children }) => {
  const [别的, 壁] = useMemo(() => {
    const { 留下, 炸掉 } = 坑();
    const 里 = 留下.filter(剖面里);
    return [里.filter((b) => !坑壁(炸掉, b)), 里.filter((b) => 坑壁(炸掉, b))] as const;
  }, []);
  const 色 = { ...天色, 夜地平: 天色.地平, 夜顶: 天色.顶 };
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden' }}>
      <侧剖面天空 取景={取景} 宽={宽} 高={高} 色={色} 明暗幅度={0} />
      <三渲二画布 宽={宽} 高={高} 机位={侧机位(取景, 正交顶面)} 色调={色调} 描边={描边} style={{ position: 'absolute', left: 0, top: 0 }}>
        <方块拼搭 方块们={别的} 原点={格原点} 群系={群系} 正面花草 />
        <平涂 色调={色调} 面明暗={坑壁面明暗}>
          <方块拼搭 方块们={壁} 原点={格原点} 群系={群系} 正面花草 />
        </平涂>
        {children}
      </三渲二画布>
      {叠层}
    </div>
  );
};
