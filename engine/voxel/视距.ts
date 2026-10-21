// 全片通用的视距和地形雾（CLAUDE.md「全片通用规矩」第一条，用户 10-18、10-19）：照游戏最大视距 32 区块 = 512 格，看得到的都画、远处不露底，雾只在视距边上淡出。
// 各场景（古城4x、暮色林内等）的雾都从这里取，不各写近雾；高空镜头看得比 512 远，另按高度放远（如 lib/暮色光照.tsx 的 `twilightFogFar`）。
// 雾照 1.20.1 FogRenderer.setupFog 地形雾（game/缓存/client-1.20.1-srg.jar 里 javap 对过）：起点 = 视距 − clamp(视距/10, 4, 64)，终点 = 视距（512 → 460.8～512）。
// 游戏是柱形距离，three 是视深，只在画面边上差一点。
export const VIEW_DISTANCE = 512;
export const terrainFogStart = (viewDistance: number) => viewDistance - Math.min(64, Math.max(4, viewDistance / 10));
export const VIEW_FOG = { near: terrainFogStart(VIEW_DISTANCE), far: VIEW_DISTANCE };
