// 第 7 章第 1 场七段共用的画面：戏.ts 里场时刻 t 的状态按给定机位画出来。场景是古城4x 的场子（夜视光照，6-4-1/古城画面.tsx 的 古城4x画布），
// 李樱一路垫的羊毛照旧画（6-4-8 的 羊毛名们，F1 在北墙根），开过的 #212、#210 画已开贴图。黑暗用 特效/黑暗效果.tsx（照原版：雾压到十几格、画面一明一暗地脉动），只画在 7-1-1（见下）。
// 黄叛每一箭弓前都有鼓风机虚影和风道（./弓前风扇.tsx）。
import React from 'react';
import { rad } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { HuangPan, LiuXinzhong } from '../../../角色/追兵.tsx';
import { Warden } from '../../../生物/监守者.tsx';
import { Vex } from '../../../生物/恼鬼.tsx';
import { SpectralSteed, steedParticles } from '../../../生物/幽灵马.tsx';
import { Arrow } from '../../../物品/箭.tsx';
import { TorchArrow, TorchBlock, torchFlamePos, torchParticles, torchArrowFlames } from '../../../物品/火把箭.tsx';
import { MagicShield } from '../../../特效/护盾术.tsx';
import { DarknessEffect } from '../../../特效/黑暗效果.tsx';
import { FOG_4X } from '../../古城4x.tsx';
import { VanillaParticles, deathPoof, type ParticleSpawn } from '../../../特效/原版粒子.tsx';
import { AncientCity4xCanvas, type Cam } from '../6-4-1/古城画面.tsx';
import { BowFans } from './弓前风扇.tsx';
import * as K648 from '../6-4-8/编排.ts';
import * as play from './戏.ts';
import * as timeline from './时间线.ts';
import { withTalkNod } from '../../../配音/口型.ts';

// 粒子（整场预先算好，刻 = t × 20）
const particles: ParticleSpawn[] = (() => {
  const out: ParticleSpawn[] = [];
  // 恼鬼死后 1 秒的白烟
  for (let i = 0; i < play.vexCount; i++) {
    const deathT = play.vexDeathTs[i];
    if (!Number.isFinite(deathT)) continue;
    const vex = play.vexState(i, deathT + 0.99);
    out.push(...deathPoof(vex.p, 0.4, 0.8, deathT * 20, 7110 + i)); // 死亡烟雾 自己在死后 20 刻放
  }
  // 火把箭飞行冒火、插地以后火把冒烟
  play.torchArrows.forEach((arrow, i) => {
    const pathAt = (k: number): V3 => {
      const progress = Math.min(1, Math.max(0, (k / 20 - arrow.放) / (arrow.中 - arrow.放)));
      return [arrow.起[0] + (arrow.落[0] - arrow.起[0]) * progress, arrow.起[1] + (arrow.落[1] - arrow.起[1]) * progress, arrow.起[2] + (arrow.落[2] - arrow.起[2]) * progress];
    };
    out.push(...torchArrowFlames(pathAt, arrow.放 * 20, arrow.中 * 20, 7120 + i));
    if (arrow.火把) out.push(...torchParticles(torchFlamePos(arrow.火把), 0.25, arrow.中 * 20, 60 * 20, 7130 + i));
  });
  // 马身上的附魔字母
  out.push(...steedParticles((k) => play.horseState(Math.max(timeline.horseSpawnT, k / 20))!.p, timeline.horseSpawnT, play.sceneEndT + 3, 7140));
  return out;
})();

// 黑暗只画在 7-1-1（演二人中了黑暗）：镜头是旁观者，7-1-2 起不加黑暗，雾回到古城4x画布平时的（全视距，用户 10-18：不然看都看不清）。
// 7-1-1 里雾压到 48 格（游戏里是 15，镜头要看到 40 米外），脉动照游戏；`DarknessEffect` 带背景，清屏色跟着雾色走，没画到方块的洞不露出平的灰。
export const shotDarknessFog = 48;
const darknessEndT = timeline.segmentStartT('7-1-2');

// 场时刻 t 的人、怪、马、护盾、箭、火把、风扇虚影、粒子（不含场景和黑暗）。7-2-1 李樱远望时也画这一份（用户 10-19 定：看到的必须是第 1 场同一刻）
// 台词开口按场时刻排成帧（t × FPS），说话的人头随字轻点（src/lib/口型.ts 的 withTalkNod）
const sceneLineCues = Object.entries(timeline.dialogue).map(([id, line]) => ({ id, 帧: line.t * timeline.FPS }));
export const SceneActors: React.FC<{ t: number }> = ({ t }) => {
  const warden = play.wardenState(t);
  const huangPan = play.huangPanState(t);
  const horse = play.horseState(t);
  const shield = play.shieldState(t);
  return (
    <>
      <group position={warden.p} rotation={[0, 0, rad(warden.entityYaw)]}>
        <Warden 秒={warden.秒} 行走={warden.行走} 攻击={warden.攻击} 受伤={warden.受伤} 头偏={warden.头偏} headPitch={warden.headPitch} 吼叫={warden.吼叫} />
      </group>
      {Array.from({ length: play.vexCount }, (_, i) => {
        const vex = play.vexState(i, t);
        if (!vex.visible || (vex.secSinceDeath ?? 0) >= 1) return null;
        return (
          <group key={i} position={vex.p} rotation={[0, 0, rad(vex.entityYaw)]}>
            <Vex sec={t} charging={vex.冲锋} secSinceDeath={vex.secSinceDeath} />
          </group>
        );
      })}
      <LiuXinzhong pose={withTalkNod(play.liuXinzhongPose(t), sceneLineCues, '刘心忠', t * timeline.FPS)} />
      <HuangPan pose={withTalkNod(huangPan.pose, sceneLineCues, '黄叛', t * timeline.FPS)} 弓={huangPan.弓} />
      {horse && (
        <group position={horse.p} rotation={[0, 0, rad(horse.entityYaw)]}>
          <SpectralSteed 秒={t} 行走={horse.行走} 人立={horse.人立.马} 有人骑={t >= timeline.mountT} />
        </group>
      )}
      {shield && <MagicShield at={shield.at} dir={shield.dir} sec={shield.秒} fade={shield.opacity} />}
      {play.torches(t).map((c, i) => (
        <TorchBlock key={i} cell={c.cell} 光={2} />
      ))}
      {play.stuckArrows(t).map((a, i) => (
        <Arrow key={`插${i}`} p={a.p} dir={a.dir} />
      ))}
      {play.flyingArrows(t).map((a, i) => (a.火把箭 ? <TorchArrow key={i} p={a.p} dir={a.dir} /> : <Arrow key={i} p={a.p} dir={a.dir} />))}
      <BowFans t={t} fans={play.fansAt(t)} />
      <VanillaParticles spawns={particles} 秒={t} />
    </>
  );
};

export const ScenePicture: React.FC<{ t: number; cam: Cam; width: number; height: number }> = ({ t, cam, width, height }) => (
  <AncientCity4xCanvas 段="7-1" cam={cam} width={width} height={height} 羊毛={K648.woolNames}>
    {t < darknessEndT && <DarknessEffect sec={play.darknessSec(t)} durationSec={play.darknessDuration} minFogDist={shotDarknessFog} fogColor={FOG_4X.color} normalFogNear={FOG_4X.near} normalFogFar={FOG_4X.far} fogBackground />}
    <SceneActors t={t} />
  </AncientCity4xCanvas>
);
