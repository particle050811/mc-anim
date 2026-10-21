// 古城4x 全场布局（第 6 章第 3 场竖井、第 4 场 6-4-1～6-4-9，第 7 章 7-1-1～7-4-2 共用的坐标和参数）。纯数据 + 少量纯函数。
// 古城放大 4 倍的原因（用户 10-13）：原古城太小发展不开、凑距离把人拉出城射箭不合理、坑太浅、强者跳太短、缠斗看不出高机动。
// 场景、坐标换算、分块见 ../模型/场景/古城4x.tsx（`G4` / `toGame4` / `partsAround` / `partsAlong` / `GUCHENG4X`）。
// 方块坐标全写游戏坐标：「格」= 整数坐标 [x, y, z]；「脚底格」= 人站的那一格（y − 1 是方块）；羊毛条目照 ../镜头/6-4-1/古城戏.ts 写 [方块 x, 站立面 y, 方块 z]，人踩在 y + 1。
// 场景坐标（V3）一律用 `G4` 换：场景 (x, y, z) = (游戏 x + 720, 240 − 游戏 z, 游戏 y + 50)，和老 古城.tsx 同一套。
// 所有点位由 工具/古城4x布局/核对.py 对着新世界方块数据核过（站得住、净空、箭路视线、每一跳碰撞箱不撞、振动链、羊毛遮挡）。
// 改了点要重跑：node 工具/一镜到底/跑.mjs 工具/古城4x布局/导出.ts && uv run -q --with numpy --with scipy python 工具/古城4x布局/核对.py
//
// ======== 全场的地理（一条东西轴） ========
// 城心传送门（黄叛射箭处）往西 370 米是 #210 战利品箱（李樱被射处），中间是东西大道（两侧双层羊毛墙，墙头 y −45，z 207～213），箭顺大道飞；
// 大道南边离城心 150 米有一块四面羊毛墙围着的幽匿空场「场子」（x −907～−842、z 214～246，地面脚底 y −51，净空 18～27 格），是 6-4-6～6-4-9 和第 7 章打监守者的地方；
// 它是城西北天然大洞厅的南端，北边洞厅当跑位纵深（洞厅北边平地离城心 280 米，周围没有能连起前后戏的箱子和尖啸体）。

// ======== 各段在哪 ========
// 6-3-6 李樱落在 `GUCHENG4X.落点` → 6-4-1 往西跳搭（踩自己垫的羊毛，路上在场子幽匿地面垫一块 F1），开 #212（8 格内无感测体，不响）→ 6-4-2 往西五跳进兵营开 #210（第一次警告 + 黑暗）。人跑跳 30 米/秒、一跳约 40 米（用户 10-18 定，`baseSpeed`）
// → 6-4-3 黄叛传送门上射，挡箭（第二次）→ 6-4-5 李樱从 #210 往南跳出兵营、出画（绕到场子西边屋顶 V，7-2-1 在那）→ 6-4-6 二人等他跳走才从传送门强者跳过来（5 跳、7.1 秒），跳过东墙落进场子，落地振动 → 第三次尖啸
// → 6-4-7 刘心忠往西一踩 → 第四次 → 6-4-8 监守者在二人西边 7 米钻出 → 第 7 章场子里打，马跳上场子北墙墙头 → 7-3 马沿墙头往东、上塔、下到墙外大道，监守者绕城门洞和台阶追
// → 7-4-1 硬切到城心大院环道上兜圈风筝（马回城心不演）→ 7-4-2 北墙外石龛 #213 又一只。
// 各部分在 古城4x布局/ 下：换算、强者（参数和弹道）、竖井、射箭（含剧情补块）、羊毛、场子（6-4-6～6-4-8）、第7章、衔接、箱子（哪段开过哪只）；本文件只转出。
export { type BlockPos, type PlanePoint, footOf, blockBottomCenter, cellCenter, woolBlockAt, feetOnWool } from './布局/换算.ts';
export { baseSpeed, gravity, elite, vanilla, type 跳, eliteLeap, eliteLeapAtSpeed, leapFeetAt, flightWarp, withHang } from './布局/强者.ts';
export { shaftLayout } from './布局/竖井.ts';
export { storyPatchBlocks, archery, chestArchery, liYingDeflectFeet, huangPanArcheryFeet, liuXinzhongArcheryFeet } from './布局/射箭.ts';
export { liYingStart, wool641, chestB, wool642, lastFrame642, wool645, wool722, allWool, type WoolName, woolOrder, woolLeapApex } from './布局/羊毛.ts';
export {
  arena, pursuerPath, shrieks, liuXinzhongStompPoint, wardenEmerge, liuXinzhongSpot, huangPanSpot, pursuerApexHeights, liuXinzhongPursuitPath,
  liuXinzhongApexHeights, liuXinzhongStartDelaySec, pursuerStops, liuXinzhongStompApex, huangPanLanding647,
} from './布局/场子.ts';
export {
  escapeLoop, huangPanPerch, shieldPoint, wallJumpTakeoff, wallTopLanding, scene71, lookoutFeet, wideShotCenter, chest722, sensors722,
  shriekers722, chest742, backToCityCenter, scene73, huangPanPortal741,
} from './布局/第7章.ts';
export { handoffs } from './布局/衔接.ts';
export { 古城段序, type 古城段, 开箱表, openedBefore, checkChestEvent } from './布局/箱子.ts';
