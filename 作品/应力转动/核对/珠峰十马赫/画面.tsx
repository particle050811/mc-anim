// 核对-珠峰十马赫 的画面：照 6-2-5 飞越主世界的搭法（地点/边城/6-2-5/飞越主世界.tsx）——飞行镜头登记航线、主世界那套天和雾、日光投影、屏幕 AO，
// 只把地形换成 珠峰-真实地球-DH。最远画到 80 公里（用户 11-17 定，按 Agent 的建议：40 公里时珠峰后面直接是雾，80 公里出真山脊线、面数只多 30～70 万；包铺到峰顶四周 70～86 公里），
// 试看 {"雾曲线": {"远": 米}} 能换。
// 天空、云、空气雾没为这个高度调过（云底在海平面以上 300～1300 米，都在地面以下），这一段就是拿来看它们在 5000～10000 米对不对的。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { LevelParams, canvasDpr } from '@engine/core/渲染级别.ts';
import { trialFarM } from '@engine/light/高度雾.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { coarseHeightAt } from '@engine/voxel/区段包.ts';
import { useImportedTerrain, type LandmarkCutout } from '@engine/voxel/导入地形.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { FlightFog, FlightRig, FlightSky, overworldShadowFar } from '../../地点/飞行镜头.tsx';
import { SUN_OW_DIR } from '../../地点/主世界光照.tsx';
import { cameraAt, flightSec, packName, packOrigin } from './航线.ts';

const noCutouts: LandmarkCutout[] = [];
const farM = 80000;
const flightSpan = [0, flightSec] as const;

const picture: React.FC = () => {
  const { width, height } = useVideoConfig();
  const sec = useCurrentSec();
  const terrain = useImportedTerrain(packName, noCutouts);
  if (!terrain) return null;
  if (terrain.origin.some((v, i) => v !== packOrigin[i])) throw new Error(`${packName} 的原点是 ${terrain.origin}，航线按 ${packOrigin} 算的`);
  const cam = cameraAt(sec);
  const far = trialFarM(farM);
  const ground = coarseHeightAt(terrain.coarse, cam.pos[0]!, cam.pos[1]!);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(LevelParams.视频.dpr)}>
        <FlightFog visibility={far} far={far} />
        <FlightRig c={cam} near={0.02} ahead={{ sec, at: cameraAt, range: flightSpan }} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <FlightSky camPos={cam.pos} shadow={{ shadowFar: overworldShadowFar(far), aboveGround: cam.pos[2]! - (ground === -Infinity ? 0 : ground) }} />
          <VoxelWorld worldKey={terrain.key} source={terrain.source} center={cam.pos} pixel={LevelParams.视频.pixel} far={far} heightRange={terrain.heightRange} shadowLightDir={SUN_OW_DIR} />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export default picture;
