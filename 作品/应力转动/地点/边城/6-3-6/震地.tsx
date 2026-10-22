// 6-3-6 李樱落进古城、锤砸在古城地面上：灾变炎魔砸地的震波（模型/特效/灾变震地.tsx），古城4x 的场景坐标（和 `Gucheng4x` 同一套，落点那格地面的顶面 z = 0）。
// 用户 10-18 定：震起来的方块不加高、加密度，而且是真的挪走——原位变成坑、落到哪格就留在哪格，砸点周围的地面盖原版挖掘裂纹（紧挨砸点 9 级、往外一格低一级）。
// 所以 6-3-6 以后凡是画到古城4x「中」块的镜头，网格都要藏掉 `slamHideBlocks`、再画 `<SlamGround />`（6-3-6 给砸地后的秒数，之后的段用默认的落定状态）：
// 6-3-6/6-3-8 在 6-3-下坠/竖井.tsx 的 `AncientCity` 里，6-4、第 7 章在 6-4-1/古城画面.tsx 的 `AncientCity4xCanvas` 里。
// 方块数据：npm run 取材 -- 6-3-6震地方块（从 古城4x-中 网格取落点四周地面几层），贴图用同一块的图集；裂纹贴图和 6-3-2 思索的同一套（原版 destroy_stage_0～9）。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { png, pngDir } from '@engine/model/贴图.ts';
import { G4, GUCHENG4X } from '../../古城4x.tsx';
import ancientCity4xMidAtlas from 'asset:网格/古城4x/中/图集';
import type { DebrisData } from '@库/特效/方块飞溅.tsx';
import { CataclysmQuake, quakeHideBlocks, type QuakeBoost } from '@库/特效/灾变震地.tsx';
import groundSlamRaw from 'asset:碎块/镜头/6-3-6/震地方块';
import { 资产目录 } from '@engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/镜头/6-3-2/方块/裂纹0';
import 资_1 from 'asset:贴图/镜头/6-3-2/方块/裂纹1';
import 资_2 from 'asset:贴图/镜头/6-3-2/方块/裂纹2';
import 资_3 from 'asset:贴图/镜头/6-3-2/方块/裂纹3';
import 资_4 from 'asset:贴图/镜头/6-3-2/方块/裂纹4';
import 资_5 from 'asset:贴图/镜头/6-3-2/方块/裂纹5';
import 资_6 from 'asset:贴图/镜头/6-3-2/方块/裂纹6';
import 资_7 from 'asset:贴图/镜头/6-3-2/方块/裂纹7';
import 资_8 from 'asset:贴图/镜头/6-3-2/方块/裂纹8';
import 资_9 from 'asset:贴图/镜头/6-3-2/方块/裂纹9';

// 加强一档（用户 10-18：「震起来的方块有点小了 特效也有点小了」）：方块是整格、大小不变；用户 10-18 定：不加高，加密度——起跳照游戏，
// 从 2 格到 11 格十圈、每圈环带里能蹦的格子七成都蹦（游戏只蹦圆上那几个点，稀稀拉拉；全蹦就没有留下来带裂纹的地面了）、往外飞一点好落到别的格；
// 白圈放大到 2.4 倍，方块粒子多一倍、飞得快 2.5 倍、大三成（再大在古城的暗光里是一片黑方块）
// 留空：6-4-1 镜头 1a 在落点北边 8 格、离地 2 米低机位看他（6-4-1/编排.ts 的 `cam1a`），他再迎着镜头跳起来：机位周围和这条视线上可以有坑、不落方块，不然落块挡在镜头前
const cam641a = G4(-708.6, -47.8, 232.0);
const slamBoost: QuakeBoost = {
  起跳: 1, 圈: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 密度: 0.7, 外飞: 0.15, 真挪: true, 裂纹: 10, 环: 2.4, 粒子: 2, 粒子速: 2.5, 粒子大: 1.3,
  留空: [[GUCHENG4X.landingPos[0], GUCHENG4X.landingPos[1], cam641a[0], cam641a[1], 1.5], [cam641a[0], cam641a[1], cam641a[0], cam641a[1], 2.5]],
};
const slamData = groundSlamRaw as unknown as DebrisData;
const atlas = png(ancientCity4xMidAtlas);
const crackTex = pngDir(资产目录({ './裂纹0.png': 资_0, './裂纹1.png': 资_1, './裂纹2.png': 资_2, './裂纹3.png': 资_3, './裂纹4.png': 资_4, './裂纹5.png': 资_5, './裂纹6.png': 资_6, './裂纹7.png': 资_7, './裂纹8.png': 资_8, './裂纹9.png': 资_9 }));
const crackPngs = Array.from({ length: 10 }, (_, i) => crackTex[`裂纹${i}`]);
const slamCenter: V3 = [GUCHENG4X.landingPos[0], GUCHENG4X.landingPos[1], 0]; // 落点那一格、地面的顶面

export const slamHideBlocks = quakeHideBlocks(slamData, slamCenter, slamBoost);
// 砸地后的物理秒数；不给 = 早就落定了（6-3-6 以后的段）
export const SlamGround: React.FC<{ sec?: number }> = ({ sec = 1e4 }) => (
  <CataclysmQuake data={slamData} atlas={atlas} center={slamCenter} sec={sec} boost={slamBoost} cracks={crackPngs} />
);
