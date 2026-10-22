// 第 7 章第 3 场三段共用的画面：戏.ts 里场时刻 T 的状态按给定机位画出来。场景是放大 4 倍的新城（../6-4-1/古城画面.tsx 的 古城4x画布）：
// 场子北墙、墙上的塔、墙外大道，李樱一路垫的羊毛（到 V，场景里本来就有），第 1 场黄叛射下的火把。二人身上的黑暗不画（镜头是旁观者，用户 10-18：不然看都看不清），雾是古城4x画布平时的。
// 特效全用现成的：苦力怕迫击炮（头、尾烟、爆炸粒子、冲击波环；爆炸照原版 TNT 放大）、护盾术、监守者音波粒子、幽灵马的附魔字母；7-3-3 黄叛射来的风矢和他弓前的鼓风机（../7-1/弓前风扇.tsx）。
import React from 'react';
import { rad } from '@engine/anim/anim.ts';
import { HuangPan, LiuXinzhong } from '../../../角色/追兵.tsx';
import { Warden } from '@库/生物/监守者.tsx';
import { SpectralSteed, steedParticles } from '@库/生物/幽灵马.tsx';
import { Arrow } from '@库/物品/箭.tsx';
import { TorchBlock, torchFlamePos, torchParticles } from '@库/物品/火把箭.tsx';
import { MagicShield } from '@库/特效/护盾术.tsx';
import { Blastwave, CreeperHead, mortarTrailSmoke, mortarBlastParticles } from '@库/特效/苦力怕迫击炮.tsx';
import { sonicBoomParticles } from '@库/特效/监守者音波.tsx';
import { VanillaParticles, serverSendParticles, type ParticleSpawn } from '@库/特效/原版粒子.tsx';
import { AncientCity4xCanvas, placedWoolThrough, type Cam } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import { BowFans } from '../../../地点/古城4x/7-1/弓前风扇.tsx';
import * as play from '../../../地点/古城4x/7-3/戏.ts';
import * as timeline from '../../../地点/古城4x/7-3/时间线.ts';

const woolBlocks = placedWoolThrough('V');
const blastwaveSize = 12; // 冲击波环放大一倍（用户 10-18：威力特效大一点）
// 粒子（整场预先算好，刻 = T × 20）
const particles: ParticleSpawn[] = (() => {
  const out: ParticleSpawn[] = [];
  play.mortars.forEach((mortar, i) => {
    out.push(...mortarTrailSmoke(mortar.trajectory, mortar.出T * 20, mortar.中T * 20, 7301 + 10 * i));
    out.push(...mortarBlastParticles(mortar.blastPos, mortar.中T * 20, 7302 + 10 * i));
    // 爆炸做大（用户 10-18）：照原版 TNT 的 explosion_emitter，8 刻里每刻撒一把 explosion，再炸开一圈 poof
    for (let j = 0; j < 8; j++) out.push(...serverSendParticles('explosion', mortar.中T * 20 + j, mortar.blastPos, 5, [1.6, 1.6, 1.0], 0, 7306 + 10 * i + 1000 * j));
    out.push(...serverSendParticles('poof', mortar.中T * 20, mortar.blastPos, 30, [0.6, 0.6, 0.4], 0.5, 7307 + 10 * i));
  });
  out.push(...sonicBoomParticles(play.sonicBoomOrigin(), play.sonicBoomTarget(), timeline.sonicBoomFireT * 20, 7303));
  out.push(...steedParticles((k) => play.horseState(k / 20).p, 0, play.endT * 20 + 20, 7304));
  // 火把一直冒烟（第 1 场插下的）
  play.torches.forEach((c, i) => out.push(...torchParticles(torchFlamePos(c.cell), 0.25, 0, play.endT * 20 + 20, 7310 + i)));
  return out;
})();

export const ScenePicture: React.FC<{ T: number; cam: Cam; width: number; height: number }> = ({ T: sceneT, cam, width, height }) => {
  const warden = play.wardenState(sceneT);
  const horse = play.horseState(sceneT);
  const liu = play.liuXinzhongPose(sceneT);
  const huangPan = play.huangPanState(sceneT);
  const shield = play.shieldState(sceneT);
  return (
    <AncientCity4xCanvas 段="7-3" cam={cam} width={width} height={height} 羊毛={woolBlocks}>
      <group position={warden.p} rotation={[0, 0, rad(warden.entityYaw)]}>
        {/* 冲刺往前扑（模型本地的前方是 −Y，绕 X 转正角就是往前倒） */}
        <group rotation={[rad(warden.前倾), 0, 0]}>
          <Warden 秒={warden.秒} 行走={warden.行走} 受伤={warden.受伤} 头偏={warden.头偏} headPitch={warden.头仰} 音爆={warden.音爆} />
        </group>
      </group>
      {play.stuckArrows(sceneT).map((a, i) => (
        <Arrow key={`插${i}`} p={a.p} dir={a.dir} />
      ))}
      {play.flyingHuangArrows(sceneT).map((a, i) => (
        <Arrow key={`飞${i}`} p={a.p} dir={a.dir} />
      ))}
      <group position={horse.p} rotation={[0, 0, rad(horse.entityYaw)]}>
        <SpectralSteed 秒={play.horseSec(sceneT)} 行走={horse.行走} 人立={horse.人立.马} 有人骑 />
      </group>
      <LiuXinzhong pose={liu.pose} 受伤={liu.hurt} />
      <HuangPan pose={huangPan.pose} 弓={huangPan.弓} />
      <BowFans t={sceneT} fans={play.fansAt(sceneT)} />
      {shield && <MagicShield at={shield.at} dir={shield.dir} sec={shield.sec} />}
      {play.mortarShells(sceneT).map((b, i) => (
        <CreeperHead key={`弹${i}`} at={b.at} vel={b.vel} />
      ))}
      {play.mortars.map((c, i) => (
        <Blastwave key={`波${i}`} at={c.blastPos} tick={(sceneT - c.中T) * 20} seed={7305 + i} size={blastwaveSize} />
      ))}
      {play.torches.map((c, i) => (
        <TorchBlock key={i} cell={c.cell} 光={2} />
      ))}
      <VanillaParticles spawns={particles} 秒={sceneT} />
    </AncientCity4xCanvas>
  );
};
