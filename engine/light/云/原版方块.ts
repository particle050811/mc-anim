// 原版方块云（云组件的 F 算法，用户 11-04 定把作品里的两份合成一份）：原版 1.20.1 fancy 云（LevelRenderer.buildClouds），clouds.png（256×256）每个不透明像素是一格
// 12×12 格见方、4 格厚的云，铺满整片天，跟着世界坐标平铺。这里只算哪几格云在哪、云洞散了多少，画法在 ./原版方块云.tsx。纯计算（测试直接引）。
// 云洞是演绎（原版云不会散）：一格云中心离洞心比洞半径近就散掉（洞半径按格子哈希抖一点，洞口参差）。
// 出处：作品/把回忆拼好给你 的 场/2-雷雨/云.ts 和 地点/原版云.ts（两份只差默认参数），engine/light/大气/ 那份旧的原版云应力转动在用、不动。

/** 一格云多大、多厚（格） */
export const cloudCell = 12;
export const cloudThickness = 4;

/** 一格云：格号 (a, b)（世界里 x 从 a·12 起、y 从 b·12 起，再加飘的偏移） */
export type CloudCell = { a: number; b: number };
export type CloudExtent = { west: number; east: number; south: number; north: number };

/** clouds.png 的不透明像素表（有(u, v) = 那个像素有云）→ 铺得到的云格。贴图第 v 行往游戏南（+Z）走，场景北是 +y，所以 v = −b。
 *  偏 = 贴图在世界里平移几格，铺 = 以原点为心铺多大 */
export const cloudCells = (isOccupied: (u: number, v: number) => boolean, offset: readonly [number, number], extent: CloudExtent): CloudCell[] => {
  const out: CloudCell[] = [];
  const wrapCell = (n: number) => ((n % 256) + 256) % 256;
  for (let a = Math.floor(extent.west / cloudCell) - 1; a <= Math.ceil(extent.east / cloudCell); a++)
    for (let b = Math.floor(extent.south / cloudCell) - 1; b <= Math.ceil(extent.north / cloudCell); b++)
      if (isOccupied(wrapCell(a + Math.floor(offset[0] / cloudCell)), wrapCell(-b + Math.floor(offset[1] / cloudCell)))) out.push({ a, b });
  return out;
};

/** 0～1 的格子哈希 */
const hash = (a: number, b: number, salt: number) => (((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(salt, 83492791)) >>> 0) % 1000) / 1000;

/** 这一格云的中心（水平，格）：飘 = 往东挪了多少（原版云往西飘，给负数） */
export const cloudCenter = (c: CloudCell, drift: number): [number, number] => [c.a * cloudCell + cloudCell / 2 + drift, c.b * cloudCell + cloudCell / 2];

/** 这一格云从哪个洞半径起开始散（离洞心的距离 + 哈希抖动，毛边 = 洞口参差多少格） */
export const scatterRadius = (c: CloudCell, center: readonly [number, number], drift: number, edgeFuzz: number) => {
  const [x, y] = cloudCenter(c, drift);
  return Math.hypot(x - center[0], y - center[1]) + (hash(c.a, c.b, 0) - 0.5) * edgeFuzz;
};
