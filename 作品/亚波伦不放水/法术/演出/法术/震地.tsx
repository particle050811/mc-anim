// 震地。出处 goety 2.5.60.6：QuakingSpell（useSpell → tremor）、ModFallingBlock（POPUP_ANIM）、ModFallingBlockRenderer。
// - 持续施法：过了蓄力时间后第 i 刻（i = 0～12），在施法者面前第 i 格、正中和左右各偏 1.5 格三处，把脚下那格方块弹起来一下。
//   位置取整到方块格；方块实体出在地面那格的上一格正中。
// - ModFallingBlock POPUP_ANIM：每刻 animY += popUp、popUp −= 0.1，popUp 初值 0.2 + 高斯 × 0.15；animY < −0.5 时消失（五六刻）。
//   渲染器：translate(0, 0.5 + animY − 1, 0) 再画整块方块，也就是方块从和地面齐平处往上顶 animY 格再落回去、沉到地下半格时没。
// - 游戏里取施法者脚下 0.5 格处那一层的方块，施法者悬空时什么都弹不起来；片里施法者在空中，按「起点正下方的地面」算（这一条是自己定的）。
// - 方块用下界岩（片子的场地；游戏里是脚下那格是什么就是什么）。
// 没做：方块各面的明暗（游戏里方块受光照，这里满亮度）；目标被顶飞；潜行时的环形震（surroundTremor）、配法杖时的弧形震（arcTremor）。
import React from 'react';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 面材质 } from '../零件/材质.ts';
import { 默认地面方块图 } from '../零件/方块屑.tsx';
import 元, { 震侧偏, 震射程 } from './震地.元.ts';

/** 第 n 刻末的 animY（n 可带小数，刻间线性插值）；消失了给 null */
const 弹高 = (初速: number, 龄: number): number | null => {
  let y = 0;
  let 前 = 0;
  let v = 初速;
  for (let n = 0; n < Math.floor(龄) + 1; n++) {
    if (y < -0.5) return null;
    前 = y;
    y += v;
    v -= 0.1;
  }
  return 前 + (y - 前) * (龄 - Math.floor(龄));
};

const 震地: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 平距 = Math.hypot(目标[0] - 起点[0], 目标[1] - 起点[1]) || 1;
  const 前 = [(目标[0] - 起点[0]) / 平距, (目标[1] - 起点[1]) / 平距];
  // tremor 的侧向是 (cos yHeadRot, sin yHeadRot)：面朝方向的左手边
  const 侧 = [-前[1], 前[0]];
  const 材 = 面材质(默认地面方块图, { 混合: '镂空' });
  const 块: React.ReactNode[] = [];
  for (let i = 0; i <= 震射程; i++) {
    震侧偏.forEach((偏, 列) => {
      const 龄 = 刻 - i;
      if (龄 < 0) return;
      const r = rng(种子 * 977 + i * 3 + 列);
      const 高斯 = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
      const 高 = 弹高(0.2 + 高斯 * 0.15, 龄);
      if (高 === null) return;
      const x = Math.floor(起点[0] + 前[0] * i + 侧[0] * 偏) + 0.5;
      const y = Math.floor(起点[1] + 前[1] * i + 侧[1] * 偏) + 0.5;
      块.push(
        <mesh key={`${i}-${列}`} position={[x, y, 目标[2] - 0.5 + 高]} material={材}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>,
      );
    });
  }
  return <>{块}</>;
};

export default 定义法术演出(元, 震地);
