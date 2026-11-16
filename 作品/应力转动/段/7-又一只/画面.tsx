// 7-4-2 又一只的画面：编排.ts 的人、马、四只监守者、感测体振动链和机位按段内秒画出来。场景同 7-4-1（古城4x画布，块按镜头取，见 编排.ts 的 块于；
// 城心这一块和北墙外的石龛 #213 和老城一模一样），夜视光照。
// 镜 1 从 7-4-1 硬切过来、剧情时刻接着它末帧往下走（白烟、马身上的附魔字母照 7-4-1 那一份）；镜 2～4 是再硬切到北墙外石龛的那一场。
// 声音照本段 段.ts 的 cue 放（definePicture 自动挂），不再挂 声音.tsx。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { definePicture } from '@engine/段/段画面.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { HuangPan, LiuXinzhong } from '../../角色/追兵.tsx';
import { SpectralSteed, steedParticles } from '@库/生物/幽灵马.tsx';
import { Warden } from '@库/生物/监守者.tsx';
import { BlockCrumbs } from '@库/特效/方块碎屑.tsx';
import { ShriekRings } from '@库/特效/尖啸声波.tsx';
import { SculkSensor } from '@库/特效/幽匿感测体.tsx';
import { VibrationSignal } from '@库/特效/振动粒子.tsx';
import { VanillaParticles, deathPoof } from '@库/特效/原版粒子.tsx';
import { AncientCity4xCanvas, placedWoolThrough } from '../../地点/古城4x/6-4-1/古城画面.tsx';
import { toScene } from '../../地点/古城4x/6-4-1/古城戏.ts';
import * as X741 from '../../场/7-收场/7-4-1/戏.ts';
import * as choreo from './编排.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { rad } from '@engine/core/数学.ts';
import type { Cam } from '@engine/core/机位.ts';

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
// 马身上的附魔字母：镜 2～4 用本段秒数另起一份（位置跟着马走）；第 k 刻出生在那一刻马的位置（不取整到格）
const horseParticles = steedParticles((k) => choreo.horseState(k / 20).p, 0, choreo.durSec, 7421);

export const AnotherOnePicture: React.FC<{ sec: number; cam?: Cam }> = ({ sec, cam }) => {
  const { width, height } = useVideoConfig();
  const shot = choreo.shotIndex(sec);
  const horse = choreo.horseState(sec);
  return (
    <AncientCity4xCanvas segment="7-4-2" cam={cam ?? choreo.camera(sec)} width={width} height={height} hide={HIDE} chestOpening={choreo.chestOpenAt(sec)} wool={woolBlocks}>
      <group position={horse.p} rotation={[0, 0, rad(horse.entityYaw)]}>
        <SpectralSteed sec={shot === 1 ? choreo.T12(sec) : sec} walkCycle={horse.walkCycle} headYaw={horse.headYaw} headPitch={horse.headPitch} rearAmount={horse.rear?.horse} hasRider />
      </group>
      <LiuXinzhong pose={choreo.liuXinzhongPose(sec)} />
      <HuangPan pose={choreo.huangPanPose(sec)} />
      {shot === 1 ? (
        <VanillaParticles spawns={islandParticles} sec={choreo.T12(sec)} />
      ) : (
        <>
          <VanillaParticles spawns={horseParticles} sec={sec} />
          {choreo.sensors.map((b, i) => (
            <SculkSensor key={i} p={choreo.blockBottomCenter(b)} sec={choreo.sensorClock(sec)} secSinceActive={sec - choreo.activateSecs[i]} seed={i + 1} />
          ))}
          {choreo.vibrations.map((v, i) => (
            <VibrationSignal key={i} from={v.from} to={v.to} sec={sec - v.t} frame={i * 3} />
          ))}
          {choreo.wardens.map((w, i) => {
            const emergeSec = choreo.emergeSecAt(w, sec);
            return (
              <React.Fragment key={i}>
                <ShriekRings p={w.shriekP} sec={sec - w.shriekSec} />
                {emergeSec >= 0 && (
                  <>
                    <group position={w.p} rotation={[0, 0, rad(w.yaw)]}>
                      <Warden {...choreo.wardenState(w, sec)} />
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

export const AnotherOne: React.FC = () => <AnotherOnePicture sec={useCurrentSec()} />;
export default definePicture(seg, soundUrl, AnotherOne);
