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
import 头 from 'asset:网格/粉色教堂/头';
import 顶点 from 'asset:网格/粉色教堂/顶点';
import 图集 from 'asset:网格/粉色教堂/图集';

const 信息 = 头 as unknown as BlockMeshInfo;

/** 结构坐标里一格方块的底面中心 → 网格本地 */
const 格 = (x: number, y: number, z: number): V3 => fromGame([x + 0.5, y, z + 0.5]);

const 地毯厚 = 1 / 16;

export const 教堂 = {
  /** 整块地（含院子）的范围，结构坐标 [x0, y0, z0, x1, y1, z1]：87×77×97，尖顶到 y 82 */
  范围: [0, 6, 0, 87, 83, 97] as const,
  草地顶面: 7,
  地板顶面: 9,
  /** 跳舞位（调研定的推荐位置）：祭坛前十字交叉处的空地，结构 x 34～52、z 26～33，19×8 格，净高 20 格以上；地上是粉色心形地毯。人站结构 (43,9,30)，面朝南 */
  跳舞位: [格(43, 9, 30)[0], 格(43, 9, 30)[1], 9 + 地毯厚] as V3,
  /** 跳舞空地 [x0, y0, x1, y1]（网格本地） */
  跳舞空地: [34, -34, 53, -26] as [number, number, number, number],
  /** 讲台：结构 (43,12,22)，在高出地板 3 格的祭坛台子上 */
  讲台: 格(43, 12, 22),
  /** 南门门洞中心（结构 x 42～44、z 77～79 的门廊），地板顶面 */
  南门: [43.5, -78, 9] as V3,
  /** 中殿过道：结构 x 42～44（3 格宽），z 34～66，两边是长椅 */
  过道: [42, -67, 45, -34] as [number, number, number, number],
};

/** 发光方块的位置（方块底面中心，网格本地）。取材时用 mark 记下的 8 种，现在的灯没用到，留给以后按灯位打光 */
export const 教堂灯位 = Object.fromEntries(Object.entries(信息.markers).map(([方块, 位]) => [方块, 位.map(fromGame)])) as Record<string, V3[]>;

// hide 之类的数组要各帧同一个（换了会重建网格），由调用的地方放在模块级
export const 粉色教堂: React.FC<{ hide?: number[][]; clearPlants?: number[][] }> = ({ hide, clearPlants }) => (
  <BlockMesh info={信息} bin={顶点} atlas={图集} hide={hide} clearPlants={clearPlants} />
);

// 教堂的灯：数都是 Agent 暂定的，用户没看过；用户改了只改这里。照游戏截图调到亮度差不多：游戏里屋里屋外都是均匀的天光加方块光，
// 不同朝向的面亮度不同（顶 1、南北 0.8、东西 0.6）。这里用天光（上亮下暗）加一盏不投影的平行光分出朝向，没打点光源、没开阴影。
export const 教堂灯 = {
  天光: { 天: '#ffffff', 地: '#d9c7cf', 强: 1.9 },
  环境光: { 色: '#fff4f6', 强: 0.45 },
  /** 平行光从东南上方来：南立面（正门）是受光面 */
  平行光: { 色: '#fff6ea', 强: 1.1, 向: [0.35, -0.6, 0.72] as V3 },
};

/** 教堂的灯：放进和 粉色教堂 同一个 Z 朝上的 group。屋里屋外同一套 */
export const 教堂灯光: React.FC = () => {
  // 方块材质的自发光打底关掉：建筑和角色（实体材质没有这一项）只吃同一套灯
  useSelfLight(0);
  const { 天光, 环境光, 平行光 } = 教堂灯;
  return (
    <>
      {/* 天光的「上」是灯的位置方向（Z 朝上） */}
      <hemisphereLight args={[天光.天, 天光.地, 天光.强]} position={[0, 0, 1]} />
      <ambientLight color={环境光.色} intensity={环境光.强} />
      <directionalLight color={平行光.色} intensity={平行光.强} position={平行光.向} />
    </>
  );
};
