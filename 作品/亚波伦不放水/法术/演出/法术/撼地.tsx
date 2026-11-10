// 撼地。出处 goety 2.5.60.6：EarthFistSpell、EarthFist、EarthFistRenderer、EarthFistModel（ATTACK、REMOVE 两段关键帧写在模型类里）、DustCloudParticle。
// - 拳头出在目标脚下，yRot = 施法者指向目标的水平角。warmup 10 刻里每刻 circularParticles(BLOCK, 半径 1.5) = 8 颗碎屑（方块取脚下那格）。
// - 破土那一刻：8 次 circularParticles(BLOCK, 速度 (0, 1, 0) × 0.5, 半径 1.5) = 64 颗往上蹿的碎屑；一圈 8 颗尘云（颜色 0x7F7D7D、大小 1）。
// - 渲染器：只在破土后画；mulPose(Y 90° − yRot)，scale(−1, −1, 1)，translate(0, −1, 0)。
//   ATTACK（0.4 秒）：fist 位置从 posVec(0, −40, 0) 到 0、缩放从 0 到 1；REMOVE（0.4 秒）：位置回到 posVec(0, −40, 0)，缩放后一半时间里缩到 0。
// 没做：史蒂夫被顶飞（那是史蒂夫的事）。配占卜法杖时范围内每个敌人各一拳不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 游戏水平角 } from '../零件/地面.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 关键帧姿态, type AnimDef } from '../零件/关键帧.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 圆里撒, 方块屑, type 屑出生 } from '../零件/方块屑.tsx';
import { 尘云, 尘云出生 } from '../零件/乙尘云.tsx';
import 元, { 拳消失刻, 拳破土刻, 拳缩回刻 } from './撼地.元.ts';
import 模型数据 from 'asset:模型/法术/goety/EarthFistModel';
import 图数据 from 'asset:贴图/法术/goety/entity/projectiles/earth_fist';

const 模型 = 取模型(模型数据, 'EarthFistModel');
const 图 = png(图数据);
const 出拳: AnimDef = {
  length: 0.4,
  looping: false,
  bones: {
    fist: [
      { target: 'position', keyframes: [{ t: 0, v: [0, 40, 0], interp: 'catmullrom' }, { t: 0.4, v: [0, 0, 0], interp: 'linear' }] },
      { target: 'scale', keyframes: [{ t: 0, v: [-1, -1, -1], interp: 'catmullrom' }, { t: 0.4, v: [0, 0, 0], interp: 'catmullrom' }] },
    ],
  },
};
const 收拳: AnimDef = {
  length: 0.4,
  looping: false,
  bones: {
    fist: [
      { target: 'position', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 0.4, v: [0, 40, 0], interp: 'catmullrom' }] },
      { target: 'scale', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 0.2, v: [0, 0, 0], interp: 'linear' }, { t: 0.4, v: [-1, -1, -1], interp: 'linear' }] },
    ],
  },
};
const 尘色 = 十六进制色(0x7f7d7d);

const 圆上点 = (中心: 点, 半径: number, 种子: number): 点[] => 圆里撒(中心, 半径, 0, 种子).map((生) => 生.位);

const 撼地: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 屑: 屑出生[] = [];
  for (let t = 0; t < Math.min(拳破土刻 - 1, 刻); t++) 屑.push(...圆里撒(目标, 1.5, t, 种子 * 211 + t));
  for (let k = 0; k < 8; k++) 屑.push(...圆里撒(目标, 1.5, 拳破土刻, 种子 * 211 + 100 + k).map((生) => ({ ...生, 速: [0, 0, 0.5] as const })));
  // 收拳的 AnimationState 开始时出拳的被 stop
  const 姿态 = 刻 >= 拳缩回刻 ? 关键帧姿态(模型, [[收拳, (刻 - 拳缩回刻) / 20]]) : 关键帧姿态(模型, [[出拳, (刻 - 拳破土刻) / 20]]);
  return (
    <>
      {刻 >= 拳破土刻 && 刻 < 拳消失刻 && (
        <MC空间 位={目标}>
          <group rotation={[0, 度(90 - (游戏水平角(起点, 目标) * 180) / Math.PI), 0]}>
            <group scale={[-1, -1, 1]}>
              <group position={[0, -1, 0]}>
                <模型件 模型={模型} 图={图} 姿态={姿态} />
              </group>
            </group>
          </group>
        </MC空间>
      )}
      <方块屑 出生们={屑} 秒={秒} 地面={目标[2]} />
      <尘云 出生们={尘云出生(圆上点(目标, 1.5, 种子 * 3 + 1), 拳破土刻, 1, 尘色, 种子)} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 撼地);
