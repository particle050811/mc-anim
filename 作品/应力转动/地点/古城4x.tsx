// 古城4x（放大 4 倍的远古城市）：第 6 章第 4 场、第 7 章的场景（镜头换场景时照这里，老的 古城.tsx 逐步淘汰）。
// 用户 10-13 要求古城改 4x（原来太小发展不开，还要把人拉到城外射箭）：建筑是原版尺寸、原版模板，城的布局铺大到约 4 倍宽（拼图多拼几层、半径放大），不是把方块放大。
// 和老五块一样由取材 mod 的 mesh 动作导出（游戏渲染器实际画的面，含箱子等方块实体），1 = 一格。古城4x-*.网格.* 都不要手改。
// 城底下铺成深暗之域（取材mod 的 FillBiome，用户要有幽匿地形），片场里补了 4 格剧情用的感测体/尖啸体（../../镜头/古城4x布局.ts 的 `storyPatchBlocks`）。无幽匿的第一版网格在 归档/参考模型库/古城4x-无幽匿-1013/。
//
// 取的是新世界 古城放大幽匿-20260930（game/取材服务端/，种子 20260930 同老片场，只多挂数据包 取材mod/数据包/古城放大4倍），/locate 仍是 (-720, ~, 240)，起点、城心件（传送门）、中心大院和老城一样，城心没挪。
//   拼图参数：size 40（原版 7）、max_distance_from_center 440（原版 116）；mod 的 `mcai.BigJigsaw` 放开原版 8 区块上限（四处，见 取材mod/手册.md「古城放大 4 倍」），引用半径 34 区块。
//   结构 1311 件（老城 74 件，其中 56 件原样还在：城心、中心大院、6-4-1 箱子屋 B、6-4-3 石屋 C），范围 x -1162～-294、z -200～676，地面仍是 y -51 层（顶面 y -50）。离线拼城核对见 取材mod/测试/古城测试.sh。
//   新世界多了夸克的世界生成：结构里的箱子被换成 quark:ancient_chest（401 个），城外天然洞里有夸克的萤光蘑菇、刚玉、石灰岩、碧玉。城上面的地表和老片场一样（竖井那列地表在 y 134）。
//
// 分块：游戏 x、z 按 128 格切成 7×7 格，中间那格「中」的中心是城心 (-720, 240)：x 边界 -1168 + 128k、z 边界 -208 + 128k。
//   块名按离「中」几格写：「西2北1」= 往西两格、往北一格。有城的 42 格各导一块，一件都碰不到的 7 格不导，只有西3北1 例外（导出网格.py 的 无件也导：6-4-2、6-4-3a/b/c、6-4-5 往西北看得到它南沿那堵洞壁，没导会露出平的底色）。
//   高度 y -60 到这格「从城地面往上连着的空气」最高处 + 2（至少 4）；大多数块到 y 4，有天然高洞厅的十来块到 y 5～42。各块范围见 工具/游戏取材/古城4x/分块.json。
//   另有两块补洞的（导出网格.py 的 补块）：中顶（中 那格洞顶上的一个高洞）、西4（城的洞在 西3 西边伸出格外的一截），镜头看得到、没导会露底。
//   画哪些块：画布按视锥挑（`tilesInView`，视距 512 格），没画的块不取 .bin。
// 导出命令（要先开游戏：取材mod 下 ./mcai game copyworld name=片场-古城4x幽匿 from=古城放大幽匿-20260930，./mcai game start world=片场-古城4x幽匿）：
//   python3 工具/游戏取材/古城4x/导出网格.py [块名 ...]（参考模型库 下）—— 每块一条
//   ./mcai batch "cam pos=<格心x>,<顶+6>,<格心z> pitch=90 yaw=180 dim=minecraft:overworld" \
//     "mesh from=<x0>,-60,<z0> to=<x1>,<顶>,<z1> origin=-720,-50,240 out=../参考模型库/src/模型/场景/古城4x-<块名>.网格 mark=minecraft:chest,quark:ancient_chest,minecraft:sculk_shrieker,minecraft:sculk_sensor,minecraft:reinforced_deepslate"
//   俯视总览、选址量测的脚本在 工具/游戏取材/古城4x/。
//
// 坐标：原点和老五块一样 = 游戏 (-720, -50, 240)，和 古城.tsx 的 `G`、`toGame` 同一套：场景 (x, y, z) = (游戏 x + 720, 240 - 游戏 z, 游戏 y + 50)，Z 朝上、北 = +Y；方块边界落在整数上，中心 .5。
// 夜视光照同老城（古城.tsx 的 `GuchengLight`）；雾照游戏最大视距，见 `FOG_4X`。
import React from 'react';
import * as THREE from 'three';
import { BlockMesh, type BlockMeshInfo, fromGame } from '@engine/voxel/方块网格.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { VIEW_DISTANCE, VIEW_FOG } from '@engine/voxel/视距.ts';
import { 资产目录 } from '@engine/core/资产目录.ts';
import 资_0 from 'asset:网格/古城4x/东1/头';
import 资_1 from 'asset:网格/古城4x/东1北1/头';
import 资_2 from 'asset:网格/古城4x/东1北2/头';
import 资_3 from 'asset:网格/古城4x/东1北3/头';
import 资_4 from 'asset:网格/古城4x/东1南1/头';
import 资_5 from 'asset:网格/古城4x/东1南2/头';
import 资_6 from 'asset:网格/古城4x/东2/头';
import 资_7 from 'asset:网格/古城4x/东2北1/头';
import 资_8 from 'asset:网格/古城4x/东2北2/头';
import 资_9 from 'asset:网格/古城4x/东2北3/头';
import 资_10 from 'asset:网格/古城4x/东2南1/头';
import 资_11 from 'asset:网格/古城4x/东2南2/头';
import 资_12 from 'asset:网格/古城4x/东3/头';
import 资_13 from 'asset:网格/古城4x/东3北1/头';
import 资_14 from 'asset:网格/古城4x/东3北2/头';
import 资_15 from 'asset:网格/古城4x/东3南1/头';
import 资_16 from 'asset:网格/古城4x/中/头';
import 资_17 from 'asset:网格/古城4x/中顶/头';
import 资_18 from 'asset:网格/古城4x/北1/头';
import 资_19 from 'asset:网格/古城4x/北2/头';
import 资_20 from 'asset:网格/古城4x/北3/头';
import 资_21 from 'asset:网格/古城4x/南1/头';
import 资_22 from 'asset:网格/古城4x/南2/头';
import 资_23 from 'asset:网格/古城4x/南3/头';
import 资_24 from 'asset:网格/古城4x/西1/头';
import 资_25 from 'asset:网格/古城4x/西1北1/头';
import 资_26 from 'asset:网格/古城4x/西1北2/头';
import 资_27 from 'asset:网格/古城4x/西1北3/头';
import 资_28 from 'asset:网格/古城4x/西1南1/头';
import 资_29 from 'asset:网格/古城4x/西1南2/头';
import 资_30 from 'asset:网格/古城4x/西1南3/头';
import 资_31 from 'asset:网格/古城4x/西2/头';
import 资_32 from 'asset:网格/古城4x/西2北1/头';
import 资_33 from 'asset:网格/古城4x/西2北2/头';
import 资_34 from 'asset:网格/古城4x/西2北3/头';
import 资_35 from 'asset:网格/古城4x/西2南1/头';
import 资_36 from 'asset:网格/古城4x/西2南2/头';
import 资_37 from 'asset:网格/古城4x/西2南3/头';
import 资_38 from 'asset:网格/古城4x/西3/头';
import 资_39 from 'asset:网格/古城4x/西3北1/头';
import 资_40 from 'asset:网格/古城4x/西3北2/头';
import 资_41 from 'asset:网格/古城4x/西3北3/头';
import 资_42 from 'asset:网格/古城4x/西3南1/头';
import 资_43 from 'asset:网格/古城4x/西3南2/头';
import 资_44 from 'asset:网格/古城4x/西4/头';
import 资_45 from 'asset:网格/古城4x/东1/顶点';
import 资_46 from 'asset:网格/古城4x/东1北1/顶点';
import 资_47 from 'asset:网格/古城4x/东1北2/顶点';
import 资_48 from 'asset:网格/古城4x/东1北3/顶点';
import 资_49 from 'asset:网格/古城4x/东1南1/顶点';
import 资_50 from 'asset:网格/古城4x/东1南2/顶点';
import 资_51 from 'asset:网格/古城4x/东2/顶点';
import 资_52 from 'asset:网格/古城4x/东2北1/顶点';
import 资_53 from 'asset:网格/古城4x/东2北2/顶点';
import 资_54 from 'asset:网格/古城4x/东2北3/顶点';
import 资_55 from 'asset:网格/古城4x/东2南1/顶点';
import 资_56 from 'asset:网格/古城4x/东2南2/顶点';
import 资_57 from 'asset:网格/古城4x/东3/顶点';
import 资_58 from 'asset:网格/古城4x/东3北1/顶点';
import 资_59 from 'asset:网格/古城4x/东3北2/顶点';
import 资_60 from 'asset:网格/古城4x/东3南1/顶点';
import 资_61 from 'asset:网格/古城4x/中/顶点';
import 资_62 from 'asset:网格/古城4x/中顶/顶点';
import 资_63 from 'asset:网格/古城4x/北1/顶点';
import 资_64 from 'asset:网格/古城4x/北2/顶点';
import 资_65 from 'asset:网格/古城4x/北3/顶点';
import 资_66 from 'asset:网格/古城4x/南1/顶点';
import 资_67 from 'asset:网格/古城4x/南2/顶点';
import 资_68 from 'asset:网格/古城4x/南3/顶点';
import 资_69 from 'asset:网格/古城4x/西1/顶点';
import 资_70 from 'asset:网格/古城4x/西1北1/顶点';
import 资_71 from 'asset:网格/古城4x/西1北2/顶点';
import 资_72 from 'asset:网格/古城4x/西1北3/顶点';
import 资_73 from 'asset:网格/古城4x/西1南1/顶点';
import 资_74 from 'asset:网格/古城4x/西1南2/顶点';
import 资_75 from 'asset:网格/古城4x/西1南3/顶点';
import 资_76 from 'asset:网格/古城4x/西2/顶点';
import 资_77 from 'asset:网格/古城4x/西2北1/顶点';
import 资_78 from 'asset:网格/古城4x/西2北2/顶点';
import 资_79 from 'asset:网格/古城4x/西2北3/顶点';
import 资_80 from 'asset:网格/古城4x/西2南1/顶点';
import 资_81 from 'asset:网格/古城4x/西2南2/顶点';
import 资_82 from 'asset:网格/古城4x/西2南3/顶点';
import 资_83 from 'asset:网格/古城4x/西3/顶点';
import 资_84 from 'asset:网格/古城4x/西3北1/顶点';
import 资_85 from 'asset:网格/古城4x/西3北2/顶点';
import 资_86 from 'asset:网格/古城4x/西3北3/顶点';
import 资_87 from 'asset:网格/古城4x/西3南1/顶点';
import 资_88 from 'asset:网格/古城4x/西3南2/顶点';
import 资_89 from 'asset:网格/古城4x/西4/顶点';
import 资_90 from 'asset:网格/古城4x/东1/图集';
import 资_91 from 'asset:网格/古城4x/东1北1/图集';
import 资_92 from 'asset:网格/古城4x/东1北2/图集';
import 资_93 from 'asset:网格/古城4x/东1北3/图集';
import 资_94 from 'asset:网格/古城4x/东1南1/图集';
import 资_95 from 'asset:网格/古城4x/东1南2/图集';
import 资_96 from 'asset:网格/古城4x/东2/图集';
import 资_97 from 'asset:网格/古城4x/东2北1/图集';
import 资_98 from 'asset:网格/古城4x/东2北2/图集';
import 资_99 from 'asset:网格/古城4x/东2北3/图集';
import 资_100 from 'asset:网格/古城4x/东2南1/图集';
import 资_101 from 'asset:网格/古城4x/东2南2/图集';
import 资_102 from 'asset:网格/古城4x/东3/图集';
import 资_103 from 'asset:网格/古城4x/东3北1/图集';
import 资_104 from 'asset:网格/古城4x/东3北2/图集';
import 资_105 from 'asset:网格/古城4x/东3南1/图集';
import 资_106 from 'asset:网格/古城4x/中/图集';
import 资_107 from 'asset:网格/古城4x/中顶/图集';
import 资_108 from 'asset:网格/古城4x/北1/图集';
import 资_109 from 'asset:网格/古城4x/北2/图集';
import 资_110 from 'asset:网格/古城4x/北3/图集';
import 资_111 from 'asset:网格/古城4x/南1/图集';
import 资_112 from 'asset:网格/古城4x/南2/图集';
import 资_113 from 'asset:网格/古城4x/南3/图集';
import 资_114 from 'asset:网格/古城4x/西1/图集';
import 资_115 from 'asset:网格/古城4x/西1北1/图集';
import 资_116 from 'asset:网格/古城4x/西1北2/图集';
import 资_117 from 'asset:网格/古城4x/西1北3/图集';
import 资_118 from 'asset:网格/古城4x/西1南1/图集';
import 资_119 from 'asset:网格/古城4x/西1南2/图集';
import 资_120 from 'asset:网格/古城4x/西1南3/图集';
import 资_121 from 'asset:网格/古城4x/西2/图集';
import 资_122 from 'asset:网格/古城4x/西2北1/图集';
import 资_123 from 'asset:网格/古城4x/西2北2/图集';
import 资_124 from 'asset:网格/古城4x/西2北3/图集';
import 资_125 from 'asset:网格/古城4x/西2南1/图集';
import 资_126 from 'asset:网格/古城4x/西2南2/图集';
import 资_127 from 'asset:网格/古城4x/西2南3/图集';
import 资_128 from 'asset:网格/古城4x/西3/图集';
import 资_129 from 'asset:网格/古城4x/西3北1/图集';
import 资_130 from 'asset:网格/古城4x/西3北2/图集';
import 资_131 from 'asset:网格/古城4x/西3北3/图集';
import 资_132 from 'asset:网格/古城4x/西3南1/图集';
import 资_133 from 'asset:网格/古城4x/西3南2/图集';
import 资_134 from 'asset:网格/古城4x/西4/图集';

const meshJsonFiles = 资产目录({ './古城4x-东1.网格.json': 资_0, './古城4x-东1北1.网格.json': 资_1, './古城4x-东1北2.网格.json': 资_2, './古城4x-东1北3.网格.json': 资_3, './古城4x-东1南1.网格.json': 资_4, './古城4x-东1南2.网格.json': 资_5, './古城4x-东2.网格.json': 资_6, './古城4x-东2北1.网格.json': 资_7, './古城4x-东2北2.网格.json': 资_8, './古城4x-东2北3.网格.json': 资_9, './古城4x-东2南1.网格.json': 资_10, './古城4x-东2南2.网格.json': 资_11, './古城4x-东3.网格.json': 资_12, './古城4x-东3北1.网格.json': 资_13, './古城4x-东3北2.网格.json': 资_14, './古城4x-东3南1.网格.json': 资_15, './古城4x-中.网格.json': 资_16, './古城4x-中顶.网格.json': 资_17, './古城4x-北1.网格.json': 资_18, './古城4x-北2.网格.json': 资_19, './古城4x-北3.网格.json': 资_20, './古城4x-南1.网格.json': 资_21, './古城4x-南2.网格.json': 资_22, './古城4x-南3.网格.json': 资_23, './古城4x-西1.网格.json': 资_24, './古城4x-西1北1.网格.json': 资_25, './古城4x-西1北2.网格.json': 资_26, './古城4x-西1北3.网格.json': 资_27, './古城4x-西1南1.网格.json': 资_28, './古城4x-西1南2.网格.json': 资_29, './古城4x-西1南3.网格.json': 资_30, './古城4x-西2.网格.json': 资_31, './古城4x-西2北1.网格.json': 资_32, './古城4x-西2北2.网格.json': 资_33, './古城4x-西2北3.网格.json': 资_34, './古城4x-西2南1.网格.json': 资_35, './古城4x-西2南2.网格.json': 资_36, './古城4x-西2南3.网格.json': 资_37, './古城4x-西3.网格.json': 资_38, './古城4x-西3北1.网格.json': 资_39, './古城4x-西3北2.网格.json': 资_40, './古城4x-西3北3.网格.json': 资_41, './古城4x-西3南1.网格.json': 资_42, './古城4x-西3南2.网格.json': 资_43, './古城4x-西4.网格.json': 资_44 });
const meshBinFiles = 资产目录({ './古城4x-东1.网格.bin': 资_45, './古城4x-东1北1.网格.bin': 资_46, './古城4x-东1北2.网格.bin': 资_47, './古城4x-东1北3.网格.bin': 资_48, './古城4x-东1南1.网格.bin': 资_49, './古城4x-东1南2.网格.bin': 资_50, './古城4x-东2.网格.bin': 资_51, './古城4x-东2北1.网格.bin': 资_52, './古城4x-东2北2.网格.bin': 资_53, './古城4x-东2北3.网格.bin': 资_54, './古城4x-东2南1.网格.bin': 资_55, './古城4x-东2南2.网格.bin': 资_56, './古城4x-东3.网格.bin': 资_57, './古城4x-东3北1.网格.bin': 资_58, './古城4x-东3北2.网格.bin': 资_59, './古城4x-东3南1.网格.bin': 资_60, './古城4x-中.网格.bin': 资_61, './古城4x-中顶.网格.bin': 资_62, './古城4x-北1.网格.bin': 资_63, './古城4x-北2.网格.bin': 资_64, './古城4x-北3.网格.bin': 资_65, './古城4x-南1.网格.bin': 资_66, './古城4x-南2.网格.bin': 资_67, './古城4x-南3.网格.bin': 资_68, './古城4x-西1.网格.bin': 资_69, './古城4x-西1北1.网格.bin': 资_70, './古城4x-西1北2.网格.bin': 资_71, './古城4x-西1北3.网格.bin': 资_72, './古城4x-西1南1.网格.bin': 资_73, './古城4x-西1南2.网格.bin': 资_74, './古城4x-西1南3.网格.bin': 资_75, './古城4x-西2.网格.bin': 资_76, './古城4x-西2北1.网格.bin': 资_77, './古城4x-西2北2.网格.bin': 资_78, './古城4x-西2北3.网格.bin': 资_79, './古城4x-西2南1.网格.bin': 资_80, './古城4x-西2南2.网格.bin': 资_81, './古城4x-西2南3.网格.bin': 资_82, './古城4x-西3.网格.bin': 资_83, './古城4x-西3北1.网格.bin': 资_84, './古城4x-西3北2.网格.bin': 资_85, './古城4x-西3北3.网格.bin': 资_86, './古城4x-西3南1.网格.bin': 资_87, './古城4x-西3南2.网格.bin': 资_88, './古城4x-西4.网格.bin': 资_89 });
const atlasFiles = 资产目录({ './古城4x-东1.网格.png': 资_90, './古城4x-东1北1.网格.png': 资_91, './古城4x-东1北2.网格.png': 资_92, './古城4x-东1北3.网格.png': 资_93, './古城4x-东1南1.网格.png': 资_94, './古城4x-东1南2.网格.png': 资_95, './古城4x-东2.网格.png': 资_96, './古城4x-东2北1.网格.png': 资_97, './古城4x-东2北2.网格.png': 资_98, './古城4x-东2北3.网格.png': 资_99, './古城4x-东2南1.网格.png': 资_100, './古城4x-东2南2.网格.png': 资_101, './古城4x-东3.网格.png': 资_102, './古城4x-东3北1.网格.png': 资_103, './古城4x-东3北2.网格.png': 资_104, './古城4x-东3南1.网格.png': 资_105, './古城4x-中.网格.png': 资_106, './古城4x-中顶.网格.png': 资_107, './古城4x-北1.网格.png': 资_108, './古城4x-北2.网格.png': 资_109, './古城4x-北3.网格.png': 资_110, './古城4x-南1.网格.png': 资_111, './古城4x-南2.网格.png': 资_112, './古城4x-南3.网格.png': 资_113, './古城4x-西1.网格.png': 资_114, './古城4x-西1北1.网格.png': 资_115, './古城4x-西1北2.网格.png': 资_116, './古城4x-西1北3.网格.png': 资_117, './古城4x-西1南1.网格.png': 资_118, './古城4x-西1南2.网格.png': 资_119, './古城4x-西1南3.网格.png': 资_120, './古城4x-西2.网格.png': 资_121, './古城4x-西2北1.网格.png': 资_122, './古城4x-西2北2.网格.png': 资_123, './古城4x-西2北3.网格.png': 资_124, './古城4x-西2南1.网格.png': 资_125, './古城4x-西2南2.网格.png': 资_126, './古城4x-西2南3.网格.png': 资_127, './古城4x-西3.网格.png': 资_128, './古城4x-西3北1.网格.png': 资_129, './古城4x-西3北2.网格.png': 资_130, './古城4x-西3北3.网格.png': 资_131, './古城4x-西3南1.网格.png': 资_132, './古城4x-西3南2.网格.png': 资_133, './古城4x-西4.网格.png': 资_134 });
const url = (m: string | { default: string }) => (typeof m === 'string' ? m : m.default);

type MeshPart = { 名: string; info: BlockMeshInfo; bin: string; atlas: string; x: [number, number]; z: [number, number]; y: [number, number] };
const BLOCKS: Record<string, MeshPart> = Object.fromEntries(
  meshJsonFiles.keys().map((k) => {
    const partName = k.slice('./古城4x-'.length, -'.网格.json'.length);
    const info = meshJsonFiles(k) as unknown as BlockMeshInfo;
    return [
      partName,
      { 名: partName, info, bin: url(meshBinFiles(`./古城4x-${partName}.网格.bin`)), atlas: url(atlasFiles(`./古城4x-${partName}.网格.png`)),
        x: [info.from[0], info.to[0]], z: [info.from[2], info.to[2]], y: [info.from[1], info.to[1]] },
    ];
  }),
);
export const allParts4x = Object.keys(BLOCKS);
// 各块的游戏范围（两端都含）
export const parts4x = Object.values(BLOCKS).map(({ 名: partName, x, y, z, info }) => ({ name: partName, x, y, z, 面数: info.layers.reduce((s, l) => s + l.quads, 0) }));

const ORIGIN: V3 = [-720, -50, 240];
// 游戏坐标 → 场景坐标（和 古城.tsx 的 G 一样）
export const G4 = (x: number, y: number, z: number): V3 => fromGame([x - ORIGIN[0], y - ORIGIN[1], z - ORIGIN[2]]);
// 场景坐标 → 游戏坐标
export const toGame4 = ([x, y, z]: number[]): V3 => [x + ORIGIN[0], z + ORIGIN[1], ORIGIN[2] - y];

// 游戏 (x, z) 在哪一块（不在任何一块里返回 undefined）；补洞的块（中顶）和 中 平面上重叠，只认含城地面 y -50 的块
export const partAt = (x: number, z: number) => Object.values(BLOCKS).find((b) => x >= b.x[0] && x <= b.x[1] + 1 && z >= b.z[0] && z <= b.z[1] + 1 && b.y[0] <= -50 && b.y[1] >= -50)?.名;
// 游戏 (x, z) 周围 r 格（正方形）碰到的块
export const partsAround = (x: number, z: number, r: number) =>
  Object.values(BLOCKS).filter((b) => b.x[0] <= x + r && b.x[1] + 1 >= x - r && b.z[0] <= z + r && b.z[1] + 1 >= z - r).map((b) => b.名);
// 一段箭路、跑位：从 a 到 b（游戏 [x, z]）两边各 r 格碰到的块
export const partsAlong = (start: number[], end: number[], radius: number) => {
  const steps = Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 32) + 1;
  const found = new Set<string>();
  for (let i = 0; i <= steps; i++) for (const k of partsAround(start[0] + ((end[0] - start[0]) * i) / steps, start[1] + ((end[1] - start[1]) * i) / steps, radius)) found.add(k);
  return [...found];
};

// 视距、雾：全片通用的满视距（lib/视距.ts）。雾色照 1.20.1 FogRenderer：
// - setupColor 雾色（清屏色同它）：群系雾色 deep_dark 0xC0D8FF × 白天亮度系数（白天 1）；32 区块时不混天色；地下按镜头高度压暗（(y+64)/32 再平方）；
//   夜视再把最大分量拉回 1（项目按夜视画，见 古城.tsx），压暗就被抵掉，结果就是 #C0D8FF。身上有黑暗时不提亮，见 模型/特效/黑暗效果.tsx。
export const VIEW_DISTANCE_4X = VIEW_DISTANCE;
export const FOG_4X = { color: '#c0d8ff', ...VIEW_FOG };

// 各块的包围盒（three.js 坐标：画布里场景组绕 X 转 −90°，场景 (x, y, z) → three (x, z, −y)，即 three = (游戏 x + 720, 游戏 y + 50, 游戏 z − 240)）
const TILE_BOXES = Object.values(BLOCKS).map((b) => ({
  名: b.名,
  box: new THREE.Box3(new THREE.Vector3(b.x[0] - ORIGIN[0], b.y[0] - ORIGIN[1], b.z[0] - ORIGIN[2]), new THREE.Vector3(b.x[1] + 1 - ORIGIN[0], b.y[1] + 1 - ORIGIN[1], b.z[1] + 1 - ORIGIN[2])),
}));
const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
// 相机视锥（远裁剪面 = 视距）碰到的块
export const tilesInView = (camera: THREE.PerspectiveCamera): string[] => {
  const far = camera.far;
  camera.far = VIEW_DISTANCE_4X;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  camera.far = far;
  camera.updateProjectionMatrix();
  return TILE_BOXES.filter((t) => frustum.intersectsBox(t.box)).map((t) => t.名);
};

// 某种方块在各块里的位置（方块底面中心，场景坐标）
const marks = (ids: string[]): V3[] => Object.values(BLOCKS).flatMap((b) => ids.flatMap((id) => (b.info.markers[id] ?? []).map(fromGame)));

export const GUCHENG4X = {
  // 结构的件（不含地形适配外扩的 12 格，游戏坐标）
  structureBox: { from: [-1162, -52, -200], to: [-294, -22, 676] },
  // 传送门、落点、穹顶：城心和老城同一位置（古城.tsx 的 `GUCHENG`）。新世界城心那列洞顶低一格（y -6），落点净空 44 格
  传送门: { x: 0.5, y: [-11.5, 10.5], z: [15, 23] },
  landingPos: G4(-709.5, -50, 240.5),
  dome: G4(-709.5, -6, 240.5),
  // 箱子：城里的是 quark:ancient_chest；minecraft:chest 是城外地牢、矿井里的。镜头里换成战利品箱（朝向另读，见 镜头/6-4-1/古城画面.tsx 的 `chests4x`）
  箱子: marks(['quark:ancient_chest']),
  outerChests: marks(['minecraft:chest']),
  尖啸体: marks(['minecraft:sculk_shrieker']),
  感测体: marks(['minecraft:sculk_sensor']),
};

// 块：画哪几块（默认只画「中」）；范围：游戏 [x0, z0, x1, z1]，画碰到这个矩形的块（和 块 一起给就取并集）；
// hide / hideBlocks 同 BlockMesh（参考模型坐标的盒子），每块都传
export const Gucheng4x: React.FC<{ parts?: string[]; gameRect?: number[]; hide?: number[][]; hideBlocks?: number[][] }> = ({ parts: parts, gameRect: gameRect, hide, hideBlocks }) => {
  const ks = new Set(parts ?? (gameRect ? [] : ['中']));
  if (gameRect) for (const k of partsAround((gameRect[0] + gameRect[2]) / 2, (gameRect[1] + gameRect[3]) / 2, Math.max(gameRect[2] - gameRect[0], gameRect[3] - gameRect[1]) / 2)) ks.add(k);
  return (
    <group>
      {[...ks].filter((k) => BLOCKS[k]).map((k) => (
        <BlockMesh key={k} info={BLOCKS[k].info} bin={BLOCKS[k].bin} atlas={BLOCKS[k].atlas} hide={hide} hideBlocks={hideBlocks} />
      ))}
    </group>
  );
};
