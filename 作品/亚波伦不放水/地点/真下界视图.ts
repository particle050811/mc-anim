// 真下界的光照几套参数，和这一帧体素世界怎么挑区段（视距、门槛、高度、光体窗口）：真下界.tsx 照它给 VoxelWorld、LightVolume 传参，
// 各段的 地形视图.ts 拿它给加载计划（engine/voxel/加载计划.ts）在 Node 里算，两边同一份。纯模块，不碰 React。
import type * as THREE from 'three';
import { LevelParams } from '@engine/core/渲染级别.ts';
import { trialFarM } from '@engine/light/高度雾.ts';
import type { LightVolumeParams } from '@engine/light/光体.ts';
import { trialLightVolume } from '@engine/light/光体试看.ts';
import { importedPlanWorld } from '@engine/voxel/加载计划.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { realNetherPack, realNetherOrigin } from './真下界位置.ts';

export type NetherLight = {
  /** 光照图在方块光 0 级的颜色（sRGB 数值上的倍数，原版 [0.393, 0.323, 0.267]）；乘面明暗后折到线性 */
  baseLight: readonly [number, number, number];
  /** 地形（体素地形、方块拼搭）的底光再乘几（sRGB 数值上，同 baseLight）；人物、模型照 baseLight。不给 = 1 */
  terrainBase?: number;
  /** 发光倍：发光方块（含熔岩）的自发光 = 贴图原色 × 发光强度 × 这个数 */
  lavaBright: number;
  /** 雾：色（#rrggbb，也是底色）、从几格起（远雾开着不起作用）、到几格全满（远雾的 D） */
  fog: { 色: string; near: number; far: number };
  /** 地形最远画到多远（格）；不给 = 雾.远 */
  renderFar?: number;
  /** 光体（发光方块照亮周围）；不给 = 不开 */
  lightVolume?: LightVolumeParams;
};

/** 照原版：亮度滑块 50%、视距 32 区块时的下界荒地 */
export const netherVanilla: NetherLight = { baseLight: [0.393, 0.323, 0.267], lavaBright: 1, fog: { 色: '#330808', near: 25.6, far: 96 } };
/** 整体提亮、雾放远（用户 11-10 嫌黑、要看清背景）：底光提到原版方块光约 12 级的亮度，雾推到 32 区块外才满，雾色提亮 */
// 雾远（= 远雾的 D）1000：用户 11-16「地狱 我看 D1000 就够了」；包按镜头范围外扩 1000 烘（sourcing/worlds/下界-无结构-1110.toml）
// 地形底光压到 0.7 倍、光体用「圆洪水」强 2（用户 11-19 看 预览/1119-1452-底光对比 定「0.7 圆洪水」：底光压下去，熔岩、火照亮周围才显得出来）；
// 人物、模型补回原来的底光（用户 11-19 看 预览/1119-1518-下界新光-正片，人跟着变暗，定「人物补回原来的底光」）。软封顶、最小光是 Agent 暂定；圆洪水不用软封顶
export const netherBrighter: NetherLight = {
  baseLight: [0.86, 0.74, 0.64],
  terrainBase: 0.7,
  lavaBright: 1.1,
  fog: { 色: '#5a1a12', near: 96, far: 1000 },
  lightVolume: { strength: 2, knee: 1.5, minLight: 0.004, scheme: { kind: '圆洪水', curve: '原版', metersPerLevel: 1, p: 4 } },
};

/** 远雾的 D（格）= 雾远；试看 {"雾曲线": {"远": 格}} 盖掉，地形最远距离跟着换（用户 11-16 要比下界放大视距）。包烘了 x −512～2047、z −1536～1023 */
export const netherFarM = (light: NetherLight) => trialFarM(light.fog.far);

/** 相机的远裁面：至少 1400；远雾的 D 放大到再往外时跟着放（下界高差不到 128 格，D 外加 200 够） */
export const netherCameraFar = (light: NetherLight) => Math.max(1400, netherFarM(light) + 200);

export const realNetherWorld = importedPlanWorld(realNetherPack);
/** 高度不用地形源的：engine/voxel/导入地形.ts 的维度下界表里没有下界（给出 NaN），这里直接写 y 0～128 */
export const realNetherHeightRange: [number, number] = [0 - realNetherOrigin[1], 128 - realNetherOrigin[1]];
/** 光体参数：试看「光体」盖掉这一套的；undefined = 不开 */
export const netherLightVolume = (light: NetherLight) => trialLightVolume(light.lightVolume) ?? light.lightVolume;

/** 这一帧挂的真下界体素世界：镜头在 cameraPos，place 把画面那台相机摆好（同画面里摆相机的那个函数） */
export const realNetherView = (cameraPos: readonly number[], light: NetherLight, place: (camera: THREE.PerspectiveCamera, aspect: number) => void, canvas = '主'): TerrainCanvasView => ({
  canvas,
  world: realNetherWorld,
  place: (camera, aspect) => {
    place(camera, aspect);
    return [...cameraPos];
  },
  farM: light.renderFar ?? netherFarM(light),
  pixel: LevelParams.视频.pixel,
  heightRange: realNetherHeightRange,
  ...(netherLightVolume(light) ? { light: { center: cameraPos, heightRange: realNetherHeightRange } } : {}),
});
