// 绽放。出处 goety 2.5.60.6：BlossomSpell、BlossomBall（SpellThrowableProjectile）、AbstractFungusRenderer、BlastFungusModel、BlossomThorn、BlossomThornRenderer；原版 DragonBreathParticle。
// - 花球：PoseStack translate(0, 半高 0.625, 0) · scale(1.5) · YP(−(atan2(vz, vx)° + 90)) · XP(−(atan2(水平, vy)° − 90))，BlastFungusModel 换 blossom_ball 贴图，镂空、满亮度；每刻一颗 dragon_breath。
// - 落地：落点一根、周围半径 3 格的圈上一圈花刺（BlossomThorn），预警 30 刻后钻出来。
// - 花刺：高 4 ± 0.5 格，两片交叉的竖片，每片半宽 = 0.34375 × 高 × 0.5；贴图 blossom_thorn 横排 8 帧（一帧 44×64），一片贴左半帧、另一片贴右半帧，活 20 刻：
//   头 8 刻按 sin 从地下升到全高，后 10 刻贴图从第 0 帧走到第 7 帧（碎掉）。
// 粗做在哪：圈上的根数（游戏是 buildBlockCircle 取方块格，这里按 16 根等分）；每根朝一个随机方向歪（randVec），这里都竖直；
//   两片绕轴的起始角没逐顶点对。没做：预警时每根脚下的 blossom_thorn_indicator 粒子（GeometricParticle，没读）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { Beam } from '../零件/束.tsx';
import { TexturedParticles } from '../零件/粒子.tsx';
import { eachTick } from '../零件/甲/共用.ts';
import { dragonBreath, dragonBreathClass } from '../零件/甲/原版粒子.ts';
import meta, { blossomPath, thornLifeTicks, thornWarnTicks } from './blossoming.元.ts';
import blastFungusModelData from 'asset:模型/法术/goety/BlastFungusModel';
import blossomBallPng from 'asset:贴图/法术/goety/entity/projectiles/blossom_ball';
import blossomThornPng from 'asset:贴图/法术/goety/entity/projectiles/blossom_thorn';
import { mulberry32 } from '@engine/core/数学.ts';

const blastFungusModel = getModel(blastFungusModelData, 'BlastFungusModel');

const Blossom: React.FC<SpellPerformanceProps> = ({ 秒: sec, from, 目标: target, 种子: seed, options }) => {
  const tick = sec * 20;
  const { trajectory, arriveTick } = blossomPath(from, target, options?.highSpeed);
  const r = mulberry32(seed * 47 + 1);
  const breath = eachTick(1, Math.min(tick, arriveTick)).map((n) => dragonBreath(r, n, trajectory(n)));
  const dir = trajectoryDir(trajectory, Math.min(tick, arriveTick - 0.01));
  const [vx, vy, vz] = [dir[0], dir[2], -dir[1]];
  const landing = trajectory(arriveTick);
  const thornPositions: Vec3[] = [landing, ...Array.from({ length: 16 }, (_, i): Vec3 => [landing[0] + Math.cos((i * Math.PI) / 8) * 3, landing[1] + Math.sin((i * Math.PI) / 8) * 3, landing[2]])];
  const thornAge = tick - arriveTick - thornWarnTicks;
  const frame = Math.floor(Math.max(0, (thornAge * 2) / thornLifeTicks - 1) * 8);
  return (
    <>
      {tick < arriveTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, tick)}>
          <group position={[0, 0.625, 0]} scale={[1.5, 1.5, 1.5]}>
            <group rotation={[0, -degToRad((Math.atan2(vz, vx) * 180) / Math.PI + 90), 0]}>
              <group rotation={[-degToRad((Math.atan2(Math.hypot(vx, vz), vy) * 180) / Math.PI - 90), 0, 0]}>
                <ModelPart 模型={blastFungusModel} 图={png(blossomBallPng)} 画法="镂空" />
              </group>
            </group>
          </group>
        </MinecraftSpace>
      )}
      <TexturedParticles 类={dragonBreathClass} spawns={breath} 秒={sec} />
      {thornAge >= 0 &&
        frame < 8 &&
        thornPositions.map((p, i) => {
          const height = 4 + (mulberry32(seed * 59 + i)() - 0.5);
          const riseOffset = (Math.sin(Math.min(thornAge / (thornLifeTicks * 0.4), 1) * Math.PI * 0.5) - 1) * height;
          const beamProps = { 起: [p[0], p[1], p[2] + riseOffset] as Vec3, end: [p[0], p[1], p[2] + riseOffset + height] as Vec3, 图: png(blossomThornPng), 半宽: 0.34375 * height * 0.5, planeCount: 1, vStart: 1, vEnd: 0, 混合: '镂空' as const };
          return (
            <React.Fragment key={i}>
              <Beam {...beamProps} u={[(frame + 0.5) / 8, frame / 8]} />
              <Beam {...beamProps} angleRad={Math.PI / 2} u={[(frame + 1) / 8, (frame + 0.5) / 8]} />
            </React.Fragment>
          );
        })}
    </>
  );
};

export default defineSpellPerformance(meta, Blossom);
