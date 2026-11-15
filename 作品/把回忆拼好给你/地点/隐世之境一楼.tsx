// 隐世之境主楼一楼：车万女仆附属 maidspell 1.9.3（MIT）的结构 hidden_retreat_1。取材客户端存档「隐世片场」里用数据包带进结构文件，
// 主世界 (0,200,0) 手放，再用 mcai mesh 导出（游戏渲染器实际画出的面）。步骤、机位、重建办法见外层 sourcing/extract.toml「隐世之境一楼网格」。
// 没装 maidspell：铁魔法、农夫乐事的方块读成了空气（都不在一楼机位截图的画面里），南墙 3 个荧光展示框是空的，屋外草色是主世界的。
// 生物不导：女仆用我们自己的魔法酒狐摆在 一楼.女仆，狐狸不要。TLM 的女仆椅、神龛照常导出来了。
// 网格本地坐标（同 BlockMesh）：原点是模板 (0,1,0)，主楼西北角的地板顶面（世界 y 201）；x = 模板 x（往东），y = −模板 z（往北为正，屋子在 y ≤ 0），z = 模板 y − 1。
// 灯光是 `一楼灯光`，和网格放进同一个 Z 朝上的 group；数在 `一楼灯`。
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useSelfLight } from '@engine/light/光照配比.ts';
import { BlockMesh, fromGame, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import houseRaw from 'asset:网格/隐世之境一楼/头';
import houseBin from 'asset:网格/隐世之境一楼/顶点';
import houseAtlas from 'asset:网格/隐世之境一楼/图集';

const houseInfo = houseRaw as unknown as BlockMeshInfo;

export const firstFloor = {
  carpetTop: 1 / 16,
  /** 模板里那只女仆坐的位置（地毯顶面），面朝南（−y） */
  maid: [11.5, -10.5, 1 / 16] as V3,
  /** TLM 女仆椅 class_chair 的位置（yaw −90） */
  maidChair: [15.5, -9.5, 0] as V3,
  /** 主厅地面 [x0, y0, x1, y1]：模板 x 8～16、z 7～17 这几格 */
  mainHall: [8, -18, 17, -7] as [number, number, number, number],
};

export type LampPos = { 种: '灯笼' | '蜡烛'; 位: V3; lit: boolean };

// markers 是方块底面中心（游戏坐标减 origin）。结构 NBT 里主厅的灯笼全是挂着的；蜡烛 3 根一组，模板 (16,5,8) 那组 lit=false
const unlitSpots = [[16.5, 4, 8.5]];
const samePoint = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
const [x0, y0, x1, y1] = firstFloor.mainHall;
const inMainHall = (m: number[]) => m[0]! > x0 && m[0]! < x1 && -m[2]! > y0 && -m[2]! < y1;
const fetchLamps = (blockId: string, kind: LampPos['种']): LampPos[] =>
  (houseInfo.markers[blockId] ?? []).filter(inMainHall).map((m) => ({ 种: kind, 位: fromGame(m), lit: !unlitSpots.some((n) => samePoint(m, n)) }));

/** 主厅的灯：灯笼 9 盏、蜡烛 3 组（西墙门洞那盏和别的屋子的不算），位置是方块底面中心 */
export const hallLamps: readonly LampPos[] = [...fetchLamps('minecraft:lantern', '灯笼'), ...fetchLamps('minecraft:candle', '蜡烛')];

// hide 之类的数组要各帧同一个（换了会重建网格），由调用的地方放在模块级
export const HiddenWorldFloor: React.FC<{ hide?: number[][] }> = ({ hide }) => <BlockMesh info={houseInfo} bin={houseBin} atlas={houseAtlas} hide={hide} />;

// 一楼的灯：数都是 Agent 暂定的，用户没定过；节点给用户看时列出来，用户改了只改这里。照 一楼机位 游戏截图调到亮度、色温差不多，不追逐像素。
// 游戏里屋里差不多是均匀的天光加方块光（顶面最亮、南北面 0.8、东西面 0.6），整体偏暖，灯笼旁边并不更亮，所以主光是天光，灯只添一点暖色。
// 坑：机位的 NeutralToneMapping 会把暗色里最小的那个通道压下去（深色木头的蓝几乎归零，比游戏饱和），这不是灯能补的。
export const firstFloorLight = {
  /** 每盏点光源的强度（three 的物理单位）；灯心：离方块底面多高（挂着的灯笼身子中间、蜡烛火苗） */
  灯笼: 0.8,
  蜡烛: 1.0,
  灯心: { 灯笼: 0.3, 蜡烛: 0.5 },
  /** 从窗、门缝进来的天光：从上来的是略暖的白，从地上反上来的是木地板的暖色（侧面吃两者的平均，比顶面暗一些） */
  天光: { 天: '#fff4e6', ground: '#e2cca6', 强: 1.8 },
  环境光: { 色: '#fff0dc', 强: 0.3 },
  /** 东窗晨光：隐世之境锁在 2000 刻，原版这时太阳在正东、仰角约 42°（DimensionType.timeOfDay） */
  晨光: { 色: '#fff1d6', 强: 3.0, elevationDeg: 42 },
  /** 东窗透进来的天光：窗里面一格放一盏冷白的点光源，屋子东半边亮一些（游戏截图里也是东边亮） */
  窗光: { 色: '#e8efff', 强: 2.5, 位: [16, -12.5, 2.5] as V3, 距离: 12, decay: 1.2 },
};

// 晨光的阴影只要罩住主厅：中心、半边宽（格）
const dawnLightVolume = { 中: [12.5, -12.5, 2] as V3, 半宽: 10 };

/** 东窗进来的太阳：要投影，墙挡住、只从窗口落到地上，所以画布没开阴影时这里打开（不开的话整片地板都被照亮） */
const MorningLight: React.FC = () => {
  const gl = useThree((s) => s.gl);
  if (!gl.shadowMap.enabled) {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
  }
  const { 色: color, 强: strength, elevationDeg } = firstFloorLight.晨光;
  const light = useMemo(() => {
    const a = (elevationDeg * Math.PI) / 180;
    const sunDir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)); // 指向太阳：正东（+x）往上
    const [cx, cy, cz] = dawnLightVolume.中;
    const sun = new THREE.DirectionalLight(color, strength);
    sun.position.set(cx + sunDir.x * 40, cy + sunDir.y * 40, cz + sunDir.z * 40);
    sun.target.position.set(cx, cy, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const r = dawnLightVolume.半宽;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 80 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 2;
    return sun;
  }, [color, strength, elevationDeg]);
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
};

/** 一楼的灯：放进和 隐世之境一楼 同一个 Z 朝上的 group（坐标同网格本地）。没点着的那组蜡烛不发光 */
export const FirstFloorLighting: React.FC = () => {
  // 方块材质的自发光打底关掉：屋里和她（实体材质没有这一项）只吃同一套灯
  useSelfLight(0);
  const { 天光: skylight, 环境光: ambient, 窗光: windowLight } = firstFloorLight;
  return (
    <>
      {/* 天光的「上」是灯的位置方向（Z 朝上） */}
      <hemisphereLight args={[skylight.天, skylight.ground, skylight.强]} position={[0, 0, 1]} />
      <ambientLight color={ambient.色} intensity={ambient.强} />
      {/* 照 7-4-3 的室内灯：颜色 #ffb565、distance 9、decay 1.6 */}
      {hallLamps
        .filter((l) => l.lit)
        .map((l, i) => (
          <pointLight
            key={i}
            position={[l.位[0], l.位[1], l.位[2] + firstFloorLight.灯心[l.种]]}
            color="#ffb565"
            intensity={firstFloorLight[l.种]}
            distance={9}
            decay={1.6}
          />
        ))}
      <MorningLight />
      <pointLight position={windowLight.位} color={windowLight.色} intensity={windowLight.强} distance={windowLight.距离} decay={windowLight.decay} />
    </>
  );
};
