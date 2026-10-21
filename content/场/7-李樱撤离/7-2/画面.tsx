// 第 7 章第 2 场两段共用的画面：按场内帧 sf 把 戏.ts 的东西画出来，机位由各段给。
// 场景：放大 4 倍的新城（../6-4-1/古城画面.tsx 的 古城4x画布），城里的箱子都是 Lootr 战利品箱（开过的画已开贴图，见 ../古城4x布局/箱子.ts）。
// 东西：李樱（第 6 章的模型，左腰挂拔刀剑入鞘）、手里的传送石（古卷、护腿在 7-2-2至3 的箱子界面里进物品栏，不拿在手上），第 6 章一路垫的羊毛（到 V）加本场的 X，
//   箱子周围三个会抖的感测体、振动粒子、尖啸声波环，传送石的粒子；远景（只在 7-2-1 拍得到）是第 1 场同一刻的人、怪、护盾、箭、马，直接用 ../7-1/画面.tsx 的 `SceneActors`。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import type { Mouth } from '../../../../world/角色/口型.ts';
import { WornSheath } from '../../../../world/物品/拔刀剑.tsx';
import { HeldWarpStone } from '../../../../world/物品/传送石.tsx';
import { SculkSensor } from '../../../../world/特效/幽匿感测体.tsx';
import { VibrationSignal } from '../../../../world/特效/振动粒子.tsx';
import { ShriekRings } from '../../../../world/特效/尖啸声波.tsx';
import { VanillaParticles } from '../../../../world/特效/原版粒子.tsx';
import { AncientCity4xCanvas, type Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import { SceneActors } from '../../../../world/地点/古城4x/7-1/画面.tsx';
import * as geom from './几何.ts';
import * as play from './戏.ts';

// 网格里画死的感测体藏掉、换成会抖的（同 6-4-2/规矩.tsx 的 HIDE）
export const HIDE: number[][] = geom.sensors.flatMap(([x, y, z]) => {
  const lo = G4(x, y, z + 1);
  const hi = G4(x + 1, y + 1, z);
  return [
    [lo[0] - 0.005, lo[1] - 0.005, lo[2] + 0.1, hi[0] + 0.005, hi[1] + 0.005, lo[2] + 0.4],
    [lo[0] + 0.01, lo[1] + 0.01, lo[2] + 0.4, hi[0] - 0.01, hi[1] - 0.01, hi[2] - 0.001],
  ];
});

// 嘴：李樱说话时的口型（各段用 src/lib/口型.ts 的 mouthAt 按本段台词算）；主观镜头（镜头在他眼睛上）不画他
export const ScenePicture: React.FC<{ sf: number; cam: Cam; wideShot?: boolean; 嘴?: Mouth; pov?: boolean }> = ({ sf, cam, wideShot: wideShot = false, 嘴: mouth, pov = false }) => {
  const { width, height } = useVideoConfig();
  const sec = play.秒(sf);
  const ly = play.李樱(sf);
  const wool = play.羊毛(sf);
  const sensorClock = play.感测体钟(sf);
  return (
    <AncientCity4xCanvas 段="7-2" cam={cam} width={width} height={height} hide={HIDE} 羊毛={wool.已有} growingWool={wool.长} 开箱={play.开箱(sf)}>
      {ly.在 && !pov && (
        <LiYing
          pose={ly.pose}
          hipL={<WornSheath />}
          handR={ly.teleportStone ? <HeldWarpStone sec={sec} /> : undefined}
          嘴={mouth}
        />
      )}
      {geom.sensors.map((b, i) => (
        <SculkSensor key={i} p={geom.方块底心(b)} 秒={sensorClock} 激活秒={sec - play.最近激活秒(i, sec)} seed={i + 1} />
      ))}
      {play.振动们.map((v, i) => (
        <VibrationSignal key={i} from={v.from} to={v.to} sec={sec - v.t} 帧={i * 3} />
      ))}
      <ShriekRings p={play.尖啸.p} sec={sec - play.尖啸.t} />
      <VanillaParticles spawns={play.使用粒子} 秒={sec} />
      <VanillaParticles spawns={play.传走粒子} 秒={sec} />
      {wideShot && <SceneActors t={play.远景t(sf)} />}
    </AncientCity4xCanvas>
  );
};
