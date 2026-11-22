// 飞行镜头摆相机、登记航线（FlightRig、按航线往后看的相机、Node 里的加载计划共用）：纯模块，不碰 React。
// roll 是 rotateZ(−roll)，和正本 engine/core/three换算.ts 的 placeCamera 相反；现有镜头 roll 只填过 0 和 180，两种写法画出来一样（engine/core/机位.ts 文件头）
import type * as THREE from 'three';
import { rad } from '@engine/core/数学.ts';
import { sceneToThree } from '@engine/core/three换算.ts';
import { lensToFov } from '@engine/core/机位.ts';
import type { SeqClock } from '@engine/core/拼段时序.ts';
import type { Lookahead, Route } from '@engine/voxel/选区段.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { FLIGHT_ROUTE_LOD } from '../默认.ts';
export type CamPose = { pos: number[]; tgt: number[]; lens: number; roll?: number };
export const placeFlightCamera = (cam: THREE.PerspectiveCamera, camPose: CamPose, aspect: number, near: number, far: number) => {
  cam.fov = lensToFov(camPose.lens, aspect);
  cam.near = near;
  cam.far = far;
  cam.position.copy(sceneToThree(camPose.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(camPose.tgt));
  if (camPose.roll) cam.rotateZ(-rad(camPose.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
};

/** FlightRig 不给 near、far 时的 */
export const flightNear = 0.05;
export const flightFar = 150000;

// 给了体素世界就按航线提前备区段、地形按航线定级（engine/voxel/世界.tsx 的 `useLookahead`；定级参数是全片默认 FLIGHT_ROUTE_LOD，各镜头不另给）。
// range = 这条航线连着飞的起止秒，一条航线拆成几截拼时给（见 世界.tsx 的 `Route`）
export type FlightRoute = { sec: number; at: (sec: number) => CamPose; range?: readonly [number, number] };
export const flightLookRoute = (ahead: FlightRoute, aspect: number, near: number, far: number): Route => ({
  sec: ahead.sec,
  range: ahead.range,
  lod: FLIGHT_ROUTE_LOD,
  at: (sec, target) => {
    const pose = ahead.at(sec);
    target.aspect = aspect; // R3F 只替它自己的相机设
    placeFlightCamera(target, pose, aspect, near, far);
    return pose.pos;
  },
});

/** 飞行镜头的地形视图（engine/voxel/地形视图.ts）：机位、航线同 FlightRig，镜头位置当 VoxelWorld 的 center */
export const flightTerrainView = (o: Omit<TerrainCanvasView, 'place' | 'look'> & { cam: CamPose; near?: number; far?: number; ahead?: FlightRoute; aspect: number; clock: SeqClock }): TerrainCanvasView => {
  const { cam, near = flightNear, far = flightFar, ahead, aspect, clock, ...rest } = o;
  const look: Lookahead | undefined = ahead && { route: flightLookRoute(ahead, aspect, near, far), frameSec: 1 / clock.fps, secLeft: clock.secLeft, secSinceStart: clock.secSinceStart };
  return {
    ...rest,
    place: (camera, a) => {
      placeFlightCamera(camera, cam, a, near, far);
      return cam.pos;
    },
    ...(look ? { look } : {}),
  };
};
