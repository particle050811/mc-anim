// 气旋。出处 goety 2.5.60.6：CycloneSpell、Cyclone（AbstractCyclone）、CycloneRenderer、CycloneModel；原版 PlayerCloudParticle。
// - 弹：惯性 0.68 朝目标飘；卷到人后停在那转，spun 数到 80 刻散掉，散的时候放 50 颗 cloud。飞的时候每刻一颗 cloud。
// - 模型 CycloneModel（四节越往上越粗的方筒叠起来，外面套一层 16×24×16 的风）：PoseStack translate(0, 1.5 × size, 0) · ZP(180°) · scale(size)，size = 1；entityTranslucent alpha 0.45。
//   setupAnim：base.yRot = 年龄，往上每节在父节的转动上再叠（换算下来 bottom −0.5 × 年龄、mid −0.2 × 年龄、top 0.3 × 年龄），wind.yRot = 年龄 × 0.25（弧度）。
// 自己定的：游戏里从施法者脚边贴地出发，片里从 起点（空中）直着飘到史蒂夫脚下。
// 没做：setupAnim 里的 chainFlap（四节左右摆动，没读）；卷到人之后把人往上带。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import { 各刻, 高斯 } from '../零件/甲/共用.ts';
import { 云, 云类 } from '../零件/甲/原版粒子.ts';
import 元, { 气旋到刻, 气旋卷刻, 气旋道 } from './cyclone.元.ts';
import 模型数据 from 'asset:模型/法术/goety/CycloneModel';
import 旋图 from 'asset:贴图/法术/goety/entity/projectiles/cyclone';

const 模型 = 取模型(模型数据, 'CycloneModel');

const 气旋: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 道 = 气旋道(起点, 目标);
  const 到 = 气旋到刻(起点, 目标);
  const 散 = 到 + 气旋卷刻;
  const r = rng(种子 * 37 + 3);
  const 云们: 粒子出生[] = 各刻(1, Math.min(刻, 到)).map((n) => 云(r, n, 道(n)));
  if (刻 >= 散) {
    const p = 道(到);
    for (let i = 0; i < 50; i++) 云们.push(云(r, 散, [p[0] + 高斯(r) * 0.5, p[1] + 高斯(r) * 0.5, p[2] + 0.75 + 高斯(r) * 0.75], [高斯(r) * 0.05, 高斯(r) * 0.05, 高斯(r) * 0.05]));
  }
  const 转 = (k: number) => ({ rot: [0, 刻 * k, 0] });
  return (
    <>
      {刻 < 散 && (
        <MC空间 位={弹道位置(道, Math.min(刻, 到))}>
          <group position={[0, 1.5, 0]} rotation={[0, 0, 度(180)]}>
            <模型件 模型={模型} 图={png(旋图)} 画法="半透明" 透明度={0.45} 姿态={{ base: 转(1), bottom: 转(-0.5), mid: 转(-0.2), top: 转(0.3), wind: 转(0.25) }} />
          </group>
        </MC空间>
      )}
      <贴图粒子 类={云类} 出生们={云们} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 气旋);
