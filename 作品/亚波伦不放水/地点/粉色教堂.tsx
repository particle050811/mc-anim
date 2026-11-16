// 粉色婚礼教堂：整合包《诡厄：使徒》1.3.1 的结构 graemod:0721（飞升后独立空间里那座，群友做的）地上部分。地下室 y 0～5 和实体裁掉了（用户 11-09 定地下室不入镜）。
// 实例「取材客户端-诡厄」的存档「教堂片场」里用数据包带进裁好的结构，主世界 (0,200,0) 手放，mcai mesh 导出（游戏渲染器实际画出的面，含方块实体）。
// 步骤、装了哪些模组、重建办法见 sourcing/extract.toml「粉色教堂结构」「粉色教堂网格」。整合包保留所有权益：网格是私有资产，字节不进 Git、不进公开包。
// 坐标：网格的游戏坐标 = 原结构 0721.nbt 的坐标（导出 origin 取在原结构 (0,0,0)）。网格本地（同 BlockMesh，Z 朝上）：x = 结构 x（往东），y = −结构 z（往北为正），z = 结构 y。
// 正门朝南（−y）。草地顶面 z 7，教堂地板顶面 z 9。灯是 `教堂灯光`，和网格放进同一个 Z 朝上的 group。
import React from 'react';
import { useSelfLight } from '@engine/light/光照配比.ts';
import { BlockMesh, fromGame, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import type { V3 } from '@engine/model/parts.tsx';
// 待迁移（私有资产）：整合包保留所有权益，网格只能私有；公开版怎么办（缺了报错、换占位，还是另搭一座）等用户定
import pinkChurchHeadMesh from 'asset:网格/粉色教堂/头';
import pinkChurchVertexBin from 'asset:网格/粉色教堂/顶点';
import pinkChurchAtlas from 'asset:网格/粉色教堂/图集';

const meshInfo = pinkChurchHeadMesh as unknown as BlockMeshInfo;

/** 结构坐标里一格方块的底面中心 → 网格本地 */
const cellScenePos = (x: number, y: number, z: number): V3 => fromGame([x + 0.5, y, z + 0.5]);

const carpetThickness = 1 / 16;

export const church = {
  /** 整块地（含院子）的范围，结构坐标 [x0, y0, z0, x1, y1, z1]：87×77×97。尖顶（北塔，结构 (43,80,24)）到 y 80；y 82 那一格是东北角 (86,82,0) 悬空的一根去皮樱花原木。
   * 原结构自带、会入镜的：院子四周一圈基岩边（y 6～7）、三个悬空的 goety:lofty_chest（结构 (27,13,15)、(78,17,71)、(12,27,7)），要不要留等用户定，藏掉用 粉色教堂 的 hide */
  bounds: [0, 6, 0, 87, 83, 97] as const,
  grassTopY: 7,
  floorTopY: 9,
  /** 跳舞位（调研定的推荐位置）：祭坛前十字交叉处的空地，结构 x 34～52、z 26～33，19×8 格；头顶最低的是 y 27 的梁（净高 18 格），吊灯垂在 x 42～44、z 31～33、最低到 y 20（净高 11 格），东西两边 x 34、52 的墙饰从 y 16 起；地上是粉色心形地毯。人站结构 (43,9,30)，面朝南 */
  dancePos: [cellScenePos(43, 9, 30)[0], cellScenePos(43, 9, 30)[1], 9 + carpetThickness] as V3,
  /** 跳舞空地 [x0, y0, x1, y1]（网格本地） */
  danceClearing: [34, -34, 53, -26] as [number, number, number, number],
  /** 讲台：结构 (43,12,22)，在高出地板 3 格的祭坛台子上 */
  lectern: cellScenePos(43, 12, 22),
  /** 南门外门廊的南沿（台阶顶），地板顶面高度。门板是单扇，在结构 (43,9～10,74)，两边 x 42、44 是竖半砖；门洞 x 42～44 在 z 75；门廊 z 75～77 和屋里地板齐平，z 78～79 是往下的台阶 */
  southDoor: [43.5, -78, 9] as V3,
  /** 中殿过道：结构 x 42～44（3 格宽），z 34～66，两边是长椅 */
  aisle: [42, -67, 45, -34] as [number, number, number, number],
};
// hide 之类的数组要各帧同一个（换了会重建网格），由调用的地方放在模块级
export const PinkChurch: React.FC<{ hide?: number[][]; clearPlants?: number[][] }> = ({ hide, clearPlants }) => (
  <BlockMesh info={meshInfo} bin={pinkChurchVertexBin} atlas={pinkChurchAtlas} hide={hide} clearPlants={clearPlants} />
);

// 教堂的灯：数都是 Agent 暂定的，用户没看过；用户改了只改这里。照游戏截图调到亮度差不多：游戏里屋里屋外都是均匀的天光加方块光，
// 不同朝向的面亮度不同（顶 1、南北 0.8、东西 0.6）。这里用天光（上亮下暗）加一盏不投影的平行光分出朝向，没打点光源、没开阴影。
export const churchLight = {
  skylight: { 天: '#ffffff', ground: '#d9c7cf', strength: 1.9 },
  ambient: { 色: '#fff4f6', strength: 0.45 },
  /** 平行光从东南上方来：南立面（正门）是受光面 */
  directional: { 色: '#fff6ea', strength: 1.1, dir: [0.35, -0.6, 0.72] as V3 },
};

/** 教堂的灯：放进和 粉色教堂 同一个 Z 朝上的 group。屋里屋外同一套 */
export const ChurchLighting: React.FC = () => {
  // 方块材质的自发光打底关掉：建筑和角色（实体材质没有这一项）只吃同一套灯
  useSelfLight(0);
  const { skylight, ambient, directional } = churchLight;
  return (
    <>
      {/* 天光的「上」是灯的位置方向（Z 朝上） */}
      <hemisphereLight args={[skylight.天, skylight.ground, skylight.strength]} position={[0, 0, 1]} />
      <ambientLight color={ambient.色} intensity={ambient.strength} />
      <directionalLight color={directional.色} intensity={directional.strength} position={directional.dir} />
    </>
  );
};
