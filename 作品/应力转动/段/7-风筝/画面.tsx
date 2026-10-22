// 7-4-1 风筝的画面：戏.ts 里剧情时刻 T 的状态按 编排.ts 的机位画出来（T = 编排.ts 的 剧情T(f)）。场景是放大 4 倍的新城（6-4-1/古城画面.tsx 的 古城4x画布），李樱一路垫的羊毛（到 V）。
// 特效全用现成的，画法同 ../7-3/画面.tsx：苦力怕迫击炮（头、尾烟、爆炸粒子、放大的冲击波环）、监守者音波粒子、幽灵马的附魔字母；
//   风矢同 6-4-3（每一支都有弓前鼓风机虚影和风道，../7-1/弓前风扇.tsx；1000 米/秒的箭），身上插的箭跟着身子走、倒下时跟着倒；死后 1 秒白烟。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { rad } from '@engine/anim/anim.ts';
import { HuangPan, LiuXinzhong } from '../../角色/追兵.tsx';
import { SpectralSteed, steedParticles } from '@库/生物/幽灵马.tsx';
import { Warden } from '@库/生物/监守者.tsx';
import { Arrow } from '@库/物品/箭.tsx';
import { Blastwave, CreeperHead, mortarTrailSmoke, mortarBlastParticles } from '@库/特效/苦力怕迫击炮.tsx';
import { sonicBoomParticles } from '@库/特效/监守者音波.tsx';
import { VanillaParticles, deathPoof, serverSendParticles, type ParticleSpawn } from '@库/特效/原版粒子.tsx';
import { AncientCity4xCanvas, placedWoolThrough, type Cam } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import { BowFans } from '../../地点/古城4x/7-1/弓前风扇.tsx';
import * as play from '../../场/7-收场/7-4-1/戏.ts';
import * as choreo from '../../场/7-收场/7-4-1/编排.ts';
import { withTalkNod } from '../../配音/口型.ts';
import { KiteSound } from './声音.tsx';

const woolBlocks = placedWoolThrough('V');
const blastwaveSize = 12; // 同 7-3（用户 10-18：威力特效大一点）
// 粒子（整段剧情时间轴预先算好，刻 = T × 20）；炸开照 7-3 放大成原版 TNT 那样
const particles: ParticleSpawn[] = (() => {
  const out: ParticleSpawn[] = [];
  play.mortars.forEach((mortar, i) => {
    out.push(...mortarTrailSmoke(mortar.trajectory, mortar.出T * 20, mortar.中T * 20, 7411 + 10 * i));
    out.push(...mortarBlastParticles(mortar.blastPos, mortar.中T * 20, 7412 + 10 * i));
    for (let j = 0; j < 8; j++) out.push(...serverSendParticles('explosion', mortar.中T * 20 + j, mortar.blastPos, 5, [1.6, 1.6, 1.0], 0, 7416 + 10 * i + 1000 * j));
    out.push(...serverSendParticles('poof', mortar.中T * 20, mortar.blastPos, 30, [0.6, 0.6, 0.4], 0.5, 7417 + 10 * i));
  });
  play.booms.forEach((boom, i) => out.push(...sonicBoomParticles(boom.origin, boom.target, boom.fireT * 20, 7413 + 10 * i)));
  out.push(...steedParticles((k) => play.horseState(k / 20).p, 0, play.endStoryT, 741));
  out.push(...deathPoof(play.deathPos(), 0.9, 2.9, play.deathT * 20, 742));
  return out;
})();

export const KitePicture: React.FC<{ f: number; cam?: Cam }> = ({ f: frame, cam }) => {
  const { width, height } = useVideoConfig();
  const T = choreo.storyT(frame);
  const horse = play.horseState(T);
  const warden = play.wardenState(T);
  const huangPan = play.huangPanState(T);
  return (
    <AncientCity4xCanvas 段="7-4-1" cam={cam ?? choreo.camera(frame)} width={width} height={height} 羊毛={woolBlocks}>
      <group position={horse.p} rotation={[0, 0, rad(horse.entityYaw)]}>
        <SpectralSteed 秒={T} 行走={horse.行走} 人立={horse.人立.马} 有人骑 />
      </group>
      <LiuXinzhong pose={withTalkNod(choreo.liuXinzhongPose(frame), choreo.lines.map(({ id, 开口帧 }) => ({ id, 帧: 开口帧 })), '刘心忠', frame)} />
      <group position={warden.p} rotation={[0, 0, rad(warden.entityYaw)]}>
        {/* 跑起来往前扑（同 7-3） */}
        <group rotation={[rad(warden.前倾), 0, 0]}>
          <Warden 秒={warden.秒} 行走={warden.行走} 受伤={warden.受伤} headPitch={warden.头仰} 音爆={warden.音爆} secSinceDeath={warden.secSinceDeath} />
        </group>
      </group>
      {play.stuckArrows(T).map((a, i) => (
        <Arrow key={`插${i}`} p={a.p} dir={a.dir} />
      ))}
      {play.flyingArrows(T).map((a, i) => (
        <Arrow key={`飞${i}`} p={a.p} dir={a.dir} />
      ))}
      <HuangPan pose={huangPan.pose} 弓={huangPan.bow} />
      <BowFans t={T} fans={play.fansAt(T)} />
      {play.mortarShells(T).map((b, i) => (
        <CreeperHead key={`弹${i}`} at={b.at} vel={b.vel} />
      ))}
      {play.mortars.map((c, i) => (
        <Blastwave key={`波${i}`} at={c.blastPos} tick={(T - c.中T) * 20} seed={7415 + i} size={blastwaveSize} />
      ))}
      <VanillaParticles spawns={particles} 秒={T} />
    </AncientCity4xCanvas>
  );
};

export const kiteFrameCount = choreo.END;
export const Kite: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <KitePicture f={frame} />
      <KiteSound />
    </>
  );
};
export default Kite;
