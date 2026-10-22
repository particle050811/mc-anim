// 基地工坊的窗户（东墙、南墙三排大窗和南山墙的小窗）：游戏画好、mcai mesh 导出的网格，不在参考模型库里自己摆玻璃方块。
// 导出：node 工具/一镜到底/跑.mjs 工具/游戏取材/基地窗户.ts（为什么这么做、几种玻璃的出处和许可写在那个文件头）。
// 网格的原点就是房间本地坐标的原点（导出时 origin 取本地 (0,0,0) 对应的游戏坐标），直接放进 基地工坊.tsx 房间的 group 里，不用再挪。
// 几个 基地窗户-*.网格.* 文件不要手改，窗户位置改了（基地工坊.布局.ts）要重导。
//
// 用哪种玻璃：
//   默认 镶框玻璃（机械动力的 framed glass）：每扇窗连成一整片，只在外沿一圈浅蓝框，里面没有格子；本片的主角模组，窗户还认得出是玻璃。
//   通透玻璃（匠魂的 clear glass）最透，只剩外沿一道细白线，远看像没装玻璃；原版玻璃 每格一圈框（改之前的样子）；云杉窗户 云杉木框的拱窗，只上下连。
// 命令行 --props='{"baseGlass":"通透玻璃"}' 临时换一种出对比，不改默认。
import React from 'react';
import { BlockMesh, type BlockMeshInfo } from '@engine/voxel/方块网格.tsx';
import vanillaGlassJson from 'asset:网格/基地窗户/原版玻璃/头';
import vanillaGlassBin from 'asset:网格/基地窗户/原版玻璃/顶点';
import vanillaGlassPng from 'asset:网格/基地窗户/原版玻璃/图集';
import clearGlassJson from 'asset:网格/基地窗户/通透玻璃/头';
import clearGlassBin from 'asset:网格/基地窗户/通透玻璃/顶点';
import clearGlassPng from 'asset:网格/基地窗户/通透玻璃/图集';
import framedGlassJson from 'asset:网格/基地窗户/镶框玻璃/头';
import framedGlassBin from 'asset:网格/基地窗户/镶框玻璃/顶点';
import framedGlassPng from 'asset:网格/基地窗户/镶框玻璃/图集';
import spruceWindowJson from 'asset:网格/基地窗户/云杉窗户/头';
import spruceWindowBin from 'asset:网格/基地窗户/云杉窗户/顶点';
import spruceWindowPng from 'asset:网格/基地窗户/云杉窗户/图集';
import { 渲染输入 } from '@engine/core/渲染设置.ts';

const glassMeshes = {
  原版玻璃: { info: vanillaGlassJson as unknown as BlockMeshInfo, bin: vanillaGlassBin, atlas: vanillaGlassPng },
  通透玻璃: { info: clearGlassJson as unknown as BlockMeshInfo, bin: clearGlassBin, atlas: clearGlassPng },
  镶框玻璃: { info: framedGlassJson as unknown as BlockMeshInfo, bin: framedGlassBin, atlas: framedGlassPng },
  云杉窗户: { info: spruceWindowJson as unknown as BlockMeshInfo, bin: spruceWindowBin, atlas: spruceWindowPng },
};
export type WindowGlass = keyof typeof glassMeshes;
export const defaultWindowGlass: WindowGlass = '镶框玻璃';
const glassOverride = (渲染输入() as { baseGlass?: string }).baseGlass;
if (glassOverride && !(glassOverride in glassMeshes)) throw new Error(`没有叫「${glassOverride}」的窗户玻璃，可选：${Object.keys(glassMeshes).join('、')}`);
export const currentWindowGlass: WindowGlass = (glassOverride as WindowGlass | undefined) ?? defaultWindowGlass;

export const BaseWindows: React.FC<{ glass?: WindowGlass }> = ({ glass: glass = currentWindowGlass }) => {
  const mesh = glassMeshes[glass];
  return <BlockMesh info={mesh.info} bin={mesh.bin} atlas={mesh.atlas} />;
};
