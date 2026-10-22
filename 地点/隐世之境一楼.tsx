// 隐世之境主楼一楼：车万女仆附属 maidspell 1.9.3（MIT）的结构 hidden_retreat_1。取材客户端存档「隐世片场」里用数据包带进结构文件，
// 主世界 (0,200,0) 手放，再用 mcai mesh 导出（游戏渲染器实际画出的面）。步骤、机位、重建办法见外层 sourcing/extract.toml「隐世之境一楼网格」。
// 没装 maidspell：铁魔法、农夫乐事的方块读成了空气（都不在一楼机位截图的画面里），南墙 3 个荧光展示框是空的，屋外草色是主世界的。
// 生物不导：女仆用我们自己的魔法酒狐摆在 一楼.女仆，狐狸不要。TLM 的女仆椅、神龛照常导出来了。
// 网格本地坐标（同 BlockMesh）：原点是模板 (0,1,0)，主楼西北角的地板顶面（世界 y 201）；x = 模板 x（往东），y = −模板 z（往北为正，屋子在 y ≤ 0），z = 模板 y − 1。
// 灯光还没放（另做）：这里只给灯位，点光源的颜色、强度、离方块底多高由放灯的地方定。
import React from 'react';
import { BlockMesh, fromGame, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import houseRaw from 'asset:网格/隐世之境一楼/头';
import houseBin from 'asset:网格/隐世之境一楼/顶点';
import houseAtlas from 'asset:网格/隐世之境一楼/图集';

const houseInfo = houseRaw as unknown as BlockMeshInfo;

export const 一楼 = {
  地毯顶面: 1 / 16,
  /** 模板里那只女仆坐的位置（地毯顶面），面朝南（−y） */
  女仆: [11.5, -10.5, 1 / 16] as V3,
  /** TLM 女仆椅 class_chair 的位置（yaw −90） */
  女仆椅: [15.5, -9.5, 0] as V3,
  /** 主厅地面 [x0, y0, x1, y1]：模板 x 8～16、z 7～17 这几格 */
  主厅: [8, -18, 17, -7] as [number, number, number, number],
};

export type 灯位 = { 种: '灯笼' | '蜡烛'; 位: V3; 点着: boolean };

// markers 是方块底面中心（游戏坐标减 origin）。结构 NBT 里主厅的灯笼全是挂着的；蜡烛 3 根一组，模板 (16,5,8) 那组 lit=false
const 没点着 = [[16.5, 4, 8.5]];
const 同点 = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
const [x0, y0, x1, y1] = 一楼.主厅;
const 在主厅 = (m: number[]) => m[0]! > x0 && m[0]! < x1 && -m[2]! > y0 && -m[2]! < y1;
const 取灯 = (方块: string, 种: 灯位['种']): 灯位[] =>
  (houseInfo.markers[方块] ?? []).filter(在主厅).map((m) => ({ 种, 位: fromGame(m), 点着: !没点着.some((n) => 同点(m, n)) }));

/** 主厅的灯：灯笼 9 盏、蜡烛 3 组（西墙门洞那盏和别的屋子的不算），位置是方块底面中心 */
export const 主厅灯: readonly 灯位[] = [...取灯('minecraft:lantern', '灯笼'), ...取灯('minecraft:candle', '蜡烛')];

// hide 之类的数组要各帧同一个（换了会重建网格），由调用的地方放在模块级
export const 隐世之境一楼: React.FC<{ hide?: number[][] }> = ({ hide }) => <BlockMesh info={houseInfo} bin={houseBin} atlas={houseAtlas} hide={hide} />;
