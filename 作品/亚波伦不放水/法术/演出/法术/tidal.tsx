// 潮涌。出处 goety 2.5.60.6：TidalSpell、TidalSurge（AbstractWave）、TidalSurgeRenderer、TidalSurgeModel；原版 SplashParticle。
// - 一道贴着地往前推的浪。PoseStack：translate(0, 1.5, 0) · YN(yaw + 180°) · translate(0, −0.1 − (1 − f × 0.5), −0.5) · scale((0.2 + f) × 0.9, −1, 1)，f = min(年龄 ÷ 10, 1)（刚出来又窄又矮，10 刻长足）。
// - TidalSurgeModel（浪身 26×6×12 加一片往前卷的浪头 26×8×17）：浪头 xRot += f2、y += f2 × 8、z += f2 × 2，f2 = (sin(年龄 × 0.1) + 1) × 0.2；
//   浪身浪头 z 向拉长 stretch = min(40, 年龄) ÷ 40，浪头再 y、z 各 + stretch × 2；停下后整体按 waveScale 缩。
// - 贴图 surge_0～3（每 3 刻换）乘水色，再叠一层 overlay_0～3 乘 (水色 + 0.5)；半透明。水色游戏里取所在群系的，这里用原版默认水色 0x3F76E4。
// - 每 5 刻一片 splash。
// 没做：每 5 刻的 spell_cloud 粒子；停下拍的那 10 刻浪头往下砸的位移（slamPos）；被浪推着走的人。没核：f 是否封顶在 1、yaw 的正负（照画面调到浪头朝前）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减, 朝向角, 单位, 弹道位置 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { serverSendParticles, VanillaParticles } from '../零件/粒子.tsx';
import { 各刻, 十六色 } from '../零件/甲/共用.ts';
import 元, { 潮涌起, 潮涌道 } from './tidal.元.ts';
import 模型数据 from 'asset:模型/法术/goety/TidalSurgeModel';
import 浪0 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_0';
import 浪1 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_1';
import 浪2 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_2';
import 浪3 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/surge_3';
import 叠0 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_0';
import 叠1 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_1';
import 叠2 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_2';
import 叠3 from 'asset:贴图/法术/goety/entity/projectiles/tidal_surge/overlay_3';

const 模型 = 取模型(模型数据, 'TidalSurgeModel');
const 浪图 = [浪0, 浪1, 浪2, 浪3].map(png);
const 叠图 = [叠0, 叠1, 叠2, 叠3].map(png);
const 水色 = 十六色(0x3f76e4);
const 亮水色 = 水色.map((c) => Math.min(1, c + 0.5)) as unknown as readonly [number, number, number];

const 潮涌: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 道, 停刻 } = 潮涌道(起点, 目标);
  const { yaw } = 朝向角(单位(减(目标, 潮涌起(起点, 目标))));
  const f = Math.min(刻 / 10, 1);
  const f2 = (Math.sin(刻 * 0.1) + 1) * 0.2;
  const stretch = Math.min(40, 刻) / 40;
  const ws = Math.max(0, 1 - Math.max(0, 刻 - 停刻 - 10) * 0.1);
  const 帧 = Math.floor((Math.floor(刻) % 12) / 3);
  const 姿态 = {
    wave: { scale: [ws, ws, ws + stretch] },
    top: { rot: [0.3927 + f2, 0, 0], offset: [0, 0.25 + f2 * 8 + stretch * 2, 1 + f2 * 2 + stretch * 2], scale: [ws, ws, ws + stretch] },
  };
  const 溅 = 各刻(1, Math.min(刻, 停刻))
    .filter((n) => n % 5 === 0)
    .flatMap((n) => {
      const p = 道(n);
      return serverSendParticles('splash', n, [p[0], p[1], p[2] + 0.5], 8, [1, 1, 0.3], 0.1, 种子 * 71 + n);
    });
  return (
    <>
      {ws > 0 && (
        <MC空间 位={弹道位置(道, Math.min(刻, 停刻))}>
          <group position={[0, 1.5, 0]} rotation={[0, -度(yaw + 180), 0]}>
            <group position={[0, -0.1 - (1 - f * 0.5), -0.5]} scale={[(0.2 + f) * 0.9, -1, 1]}>
              <模型件 模型={模型} 图={浪图[帧]!} 画法="半透明" 色={水色} 姿态={姿态} />
              <模型件 模型={模型} 图={叠图[帧]!} 画法="半透明" 色={亮水色} 姿态={姿态} />
            </group>
          </group>
        </MC空间>
      )}
      <VanillaParticles spawns={溅} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 潮涌);
