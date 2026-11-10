// 绽放。出处 goety 2.5.60.6：BlossomSpell、BlossomBall（SpellThrowableProjectile）、AbstractFungusRenderer、BlastFungusModel、BlossomThorn、BlossomThornRenderer；原版 DragonBreathParticle。
// - 花球：PoseStack translate(0, 半高 0.625, 0) · scale(1.5) · YP(−(atan2(vz, vx)° + 90)) · XP(−(atan2(水平, vy)° − 90))，BlastFungusModel 换 blossom_ball 贴图，镂空、满亮度；每刻一颗 dragon_breath。
// - 落地：落点一根、周围半径 3 格的圈上一圈花刺（BlossomThorn），预警 30 刻后钻出来。
// - 花刺：高 4 ± 0.5 格，两片交叉的竖片，每片半宽 = 0.34375 × 高 × 0.5；贴图 blossom_thorn 横排 8 帧（一帧 44×64），一片贴左半帧、另一片贴右半帧，活 20 刻：
//   头 8 刻按 sin 从地下升到全高，后 10 刻贴图从第 0 帧走到第 7 帧（碎掉）。
// 粗做在哪：圈上的根数（游戏是 buildBlockCircle 取方块格，这里按 16 根等分）；每根朝一个随机方向歪（randVec），这里都竖直；
//   两片绕轴的起始角没逐顶点对。没做：预警时每根脚下的 blossom_thorn_indicator 粒子（GeometricParticle，没读）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 束 } from '../零件/束.tsx';
import { 贴图粒子 } from '../零件/粒子.tsx';
import { 各刻 } from '../零件/甲/共用.ts';
import { 龙息, 龙息类 } from '../零件/甲/原版粒子.ts';
import 元, { 绽放道, 花刺寿命刻, 花刺预警刻 } from './blossoming.元.ts';
import 模型数据 from 'asset:模型/法术/goety/BlastFungusModel';
import 球图 from 'asset:贴图/法术/goety/entity/projectiles/blossom_ball';
import 刺图 from 'asset:贴图/法术/goety/entity/projectiles/blossom_thorn';

const 模型 = 取模型(模型数据, 'BlastFungusModel');

const 绽放: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 道, 到刻 } = 绽放道(起点, 目标);
  const r = rng(种子 * 47 + 1);
  const 息 = 各刻(1, Math.min(刻, 到刻)).map((n) => 龙息(r, n, 道(n)));
  const 向 = 弹道方向(道, Math.min(刻, 到刻 - 0.01));
  const [vx, vy, vz] = [向[0], 向[2], -向[1]];
  const 落 = 道(到刻);
  const 刺位: 点[] = [落, ...Array.from({ length: 16 }, (_, i): 点 => [落[0] + Math.cos((i * Math.PI) / 8) * 3, 落[1] + Math.sin((i * Math.PI) / 8) * 3, 落[2]])];
  const 刺龄 = 刻 - 到刻 - 花刺预警刻;
  const 帧 = Math.floor(Math.max(0, (刺龄 * 2) / 花刺寿命刻 - 1) * 8);
  return (
    <>
      {刻 < 到刻 && (
        <MC空间 位={弹道位置(道, 刻)}>
          <group position={[0, 0.625, 0]} scale={[1.5, 1.5, 1.5]}>
            <group rotation={[0, -度((Math.atan2(vz, vx) * 180) / Math.PI + 90), 0]}>
              <group rotation={[-度((Math.atan2(Math.hypot(vx, vz), vy) * 180) / Math.PI - 90), 0, 0]}>
                <模型件 模型={模型} 图={png(球图)} 画法="镂空" />
              </group>
            </group>
          </group>
        </MC空间>
      )}
      <贴图粒子 类={龙息类} 出生们={息} 秒={秒} />
      {刺龄 >= 0 &&
        帧 < 8 &&
        刺位.map((p, i) => {
          const 高 = 4 + (rng(种子 * 59 + i)() - 0.5);
          const 升 = (Math.sin(Math.min(刺龄 / (花刺寿命刻 * 0.4), 1) * Math.PI * 0.5) - 1) * 高;
          const 共 = { 起: [p[0], p[1], p[2] + 升] as 点, 终: [p[0], p[1], p[2] + 升 + 高] as 点, 图: png(刺图), 半宽: 0.34375 * 高 * 0.5, 片数: 1, v起: 1, v终: 0, 混合: '镂空' as const };
          return (
            <React.Fragment key={i}>
              <束 {...共} u={[(帧 + 0.5) / 8, 帧 / 8]} />
              <束 {...共} 转角={Math.PI / 2} u={[(帧 + 1) / 8, (帧 + 0.5) / 8]} />
            </React.Fragment>
          );
        })}
    </>
  );
};

export default 定义法术演出(元, 绽放);
