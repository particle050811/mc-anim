// 水鞭。出处 goety 2.5.60.6：GulfTentacleSpell、GulfTentacle、GulfTentacleRenderer（MobRenderer）、GulfTentacleModel（ATTACK 关键帧写在模型类里）。
// - 触手出在施法者眼睛往前 1 格、往持杖手一侧 0.5 格、往下 0.45 格，朝向跟施法者的 yRot、xRot；这里把「起点」当那个位置，朝目标甩。
// - 渲染器：LivingEntityRenderer 那套 mulPose(Y 180° − yRot)、scale(−1, −1, 1)、scale(1, 1, range ÷ 4)、translate(0, −1.501, 0)；
//   模型 setupAnim：tentacle.xRot = headPitch，再播 ATTACK（1 秒 = 整个寿命 20 刻）：三节先卷起、0.25～0.45 秒甩直、0.7 秒后缩没。
// - 只有 4 格长（RANGE 默认 4），离得远够不着目标。
// 没做：打中时的 WHIP_HIT 声和伤害；life ≤ 1 那一刻不画的细节（那时缩放本来就是 0）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 游戏偏航度 } from '../零件/地面.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 关键帧姿态, type AnimDef } from '../零件/关键帧.ts';
import 元, { 鞭射程, 鞭寿命刻 } from './水鞭.元.ts';
import 模型数据 from 'asset:模型/法术/goety/GulfTentacleModel';
import 图数据 from 'asset:贴图/法术/goety/entity/projectiles/gulf_tentacle';

const 模型 = 取模型(模型数据, 'GulfTentacleModel');
const 图 = png(图数据);
const 弧 = (x: number) => [(x * Math.PI) / 180, 0, 0];
const 转 = (帧: readonly (readonly [number, number])[]) => ({ target: 'rotation' as const, keyframes: 帧.map(([t, x]) => ({ t, v: 弧(x), interp: 'catmullrom' as const })) });
const 甩: AnimDef = {
  length: 1,
  looping: false,
  bones: {
    tentacle: [
      转([[0, 0], [0.25, -125], [0.45, 0], [1, 0]]),
      { target: 'scale', keyframes: ([[0, 0], [0.25, 0.5], [0.45, 1], [0.7, 1], [1, 0]] as const).map(([t, k]) => ({ t, v: [k - 1, k - 1, k - 1], interp: 'catmullrom' as const })) },
    ],
    tentacle_mid: [转([[0, 0], [0.25, 152.5], [0.35, 45], [0.45, 0], [1, 0]])],
    tentacle_tip: [转([[0, 0], [0.25, -157.5], [0.35, 45], [0.45, 0], [1, 0]])],
  },
};

const 水鞭: React.FC<法术演出属性> = ({ 秒, 起点, 目标 }) => {
  const 刻 = 秒 * 20;
  if (刻 >= 鞭寿命刻) return null;
  // 瞄史蒂夫胸口；游戏的 xRot 往下看为正
  const 平距 = Math.hypot(目标[0] - 起点[0], 目标[1] - 起点[1]);
  const 俯仰 = -Math.atan2(目标[2] + 0.9 - 起点[2], 平距);
  const 姿 = 关键帧姿态(模型, [[甩, 秒]]);
  const 根 = 姿.tentacle ?? {};
  const 根转 = 根.rot ?? [0, 0, 0];
  return (
    <MC空间 位={起点}>
      <group rotation={[0, 度(180 - 游戏偏航度(起点, 目标)), 0]}>
        <group scale={[-1, -1, 1]}>
          <group scale={[1, 1, 鞭射程 / 4]}>
            <group position={[0, -1.501, 0]}>
              <模型件 模型={模型} 图={图} 姿态={{ ...姿, tentacle: { ...根, rot: [根转[0] + 俯仰, 根转[1], 根转[2]] } }} />
            </group>
          </group>
        </group>
      </group>
    </MC空间>
  );
};

export default 定义法术演出(元, 水鞭);
