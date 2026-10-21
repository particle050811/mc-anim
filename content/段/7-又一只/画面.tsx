// 7-4-2 又一只的画面：编排.ts 的人、马、四只监守者、感测体振动链和机位按帧画出来。场景同 7-4-1（古城4x画布，块按镜头取，见 编排.ts 的 块于；
// 城心这一块和北墙外的石龛 #213 和老城一模一样），夜视光照。
// 镜 1 从 7-4-1 硬切过来、剧情时刻接着它末帧往下走（白烟、马身上的附魔字母照 7-4-1 那一份）；镜 2～4 是再硬切到北墙外石龛的那一场。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { rad } from '../../../engine/anim/anim.ts';
import { HuangPan, LiuXinzhong } from '../../../world/角色/追兵.tsx';
import { SpectralSteed, steedParticles } from '../../../world/生物/幽灵马.tsx';
import { Warden } from '../../../world/生物/监守者.tsx';
import { BlockCrumbs } from '../../../world/特效/方块碎屑.tsx';
import { ShriekRings } from '../../../world/特效/尖啸声波.tsx';
import { SculkSensor } from '../../../world/特效/幽匿感测体.tsx';
import { VibrationSignal } from '../../../world/特效/振动粒子.tsx';
import { VanillaParticles, deathPoof } from '../../../world/特效/原版粒子.tsx';
import { AncientCity4xCanvas, placedWoolThrough, type Cam } from '../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { toScene } from '../../../world/地点/古城4x/6-4-1/古城戏.ts';
import * as X741 from '../../场/7-收场/7-4-1/戏.ts';
import * as choreo from './编排.ts';
import { AnotherOneSound } from './声音.tsx';

// 7-4-1 的白烟、马身上的附魔字母（同一份出生表：同样的位置、死刻、种子）
const islandParticles = [...deathPoof(X741.deathPos(), 0.9, 2.9, X741.deathT * 20, 742), ...steedParticles((k) => X741.horseState(k / 20).p, 0, choreo.T12(choreo.shot1End), 741)];
// 网格里画死的感测体藏掉、换成会抖的（同 6-4-2 规矩.tsx 的 HIDE）
const HIDE: number[][] = choreo.sensors.flatMap(([x, y, z]) => {
  const lo = toScene(x, y, z + 1);
  const hi = toScene(x + 1, y + 1, z);
  return [
    [lo[0] - 0.005, lo[1] - 0.005, lo[2] + 0.1, hi[0] + 0.005, hi[1] + 0.005, lo[2] + 0.4],
    [lo[0] + 0.01, lo[1] + 0.01, lo[2] + 0.4, hi[0] - 0.01, hi[1] - 0.01, hi[2] - 0.001],
  ];
});
const woolBlocks = placedWoolThrough('V');
// 马身上的附魔字母：镜 2～4 用本段秒数另起一份（位置跟着马走）
const horseParticles = steedParticles((k) => choreo.horseState(Math.round((k / 20) * choreo.FPS)).p, 0, choreo.END / choreo.FPS, 7421);

export const AnotherOnePicture: React.FC<{ f: number; cam?: Cam }> = ({ f: frame, cam }) => {
  const { width, height } = useVideoConfig();
  const shot = choreo.shotIndex(frame);
  const horse = choreo.horseState(frame);
  const t = frame / choreo.FPS;
  return (
    <AncientCity4xCanvas 段="7-4-2" cam={cam ?? choreo.camera(frame)} width={width} height={height} hide={HIDE} 开箱={choreo.chestOpenAt(frame)} 羊毛={woolBlocks}>
      <group position={horse.p} rotation={[0, 0, rad(horse.entityYaw)]}>
        <SpectralSteed 秒={shot === 1 ? choreo.T12(frame) : t} 行走={horse.行走} 头偏={horse.头偏} headPitch={horse.headPitch} 人立={horse.人立?.马} 有人骑 />
      </group>
      <LiuXinzhong pose={choreo.liuXinzhongPose(frame)} />
      <HuangPan pose={choreo.huangPanPose(frame)} />
      {shot === 1 ? (
        <VanillaParticles spawns={islandParticles} 秒={choreo.T12(frame)} />
      ) : (
        <>
          <VanillaParticles spawns={horseParticles} 秒={t} />
          {choreo.sensors.map((b, i) => (
            <SculkSensor key={i} p={choreo.blockBottomCenter(b)} 秒={choreo.sensorClock(frame)} 激活秒={t - choreo.activateSecs[i]} seed={i + 1} />
          ))}
          {choreo.vibrations.map((v, i) => (
            <VibrationSignal key={i} from={v.from} to={v.to} sec={t - v.t} 帧={i * 3} />
          ))}
          {choreo.wardens.map((w, i) => {
            const emergeSec = choreo.emergeSecAt(w, frame);
            return (
              <React.Fragment key={i}>
                <ShriekRings p={w.shriekP} sec={t - w.shriekSec} />
                {emergeSec >= 0 && (
                  <>
                    <group position={w.p} rotation={[0, 0, rad(w.yaw)]}>
                      <Warden {...choreo.wardenState(w, frame)} />
                    </group>
                    <BlockCrumbs center={w.p} sec={emergeSec} perTick={15} durationSec={choreo.debrisSec} seed={7 + i} />
                  </>
                )}
              </React.Fragment>
            );
          })}
        </>
      )}
    </AncientCity4xCanvas>
  );
};

export const anotherOneFrameCount = choreo.END;
export const AnotherOne: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <AnotherOnePicture f={frame} />
      <AnotherOneSound />
    </>
  );
};
