// 原版方块云（云组件的 F 算法，用户 11-04 定把作品里的两份合成一份）：原版 1.20.1 fancy 云（LevelRenderer.buildClouds），clouds.png（256×256）每个不透明像素是一格
// 12×12 格见方、4 格厚的云，铺满整片天，跟着世界坐标平铺。这里只算哪几格云在哪、云洞散了多少，画法在 ./原版方块云.tsx。纯计算（测试直接引）。
// 云洞是演绎（原版云不会散）：一格云中心离洞心比洞半径近就散掉（洞半径按格子哈希抖一点，洞口参差）。
// 出处：作品/把回忆拼好给你 的 场/2-雷雨/云.ts 和 地点/原版云.ts（两份只差默认参数），engine/light/大气/ 那份旧的原版云应力转动在用、不动。

/** 一格云多大、多厚（格） */
export const 云格 = 12;
export const 云厚 = 4;

/** 一格云：格号 (a, b)（世界里 x 从 a·12 起、y 从 b·12 起，再加飘的偏移） */
export type 云格子 = { a: number; b: number };
export type 云铺 = { 西: number; 东: number; 南: number; 北: number };

/** clouds.png 的不透明像素表（有(u, v) = 那个像素有云）→ 铺得到的云格。贴图第 v 行往游戏南（+Z）走，场景北是 +y，所以 v = −b。
 *  偏 = 贴图在世界里平移几格，铺 = 以原点为心铺多大 */
export const 云格们 = (有: (u: number, v: number) => boolean, 偏: readonly [number, number], 铺: 云铺): 云格子[] => {
  const out: 云格子[] = [];
  const 取 = (n: number) => ((n % 256) + 256) % 256;
  for (let a = Math.floor(铺.西 / 云格) - 1; a <= Math.ceil(铺.东 / 云格); a++)
    for (let b = Math.floor(铺.南 / 云格) - 1; b <= Math.ceil(铺.北 / 云格); b++)
      if (有(取(a + Math.floor(偏[0] / 云格)), 取(-b + Math.floor(偏[1] / 云格)))) out.push({ a, b });
  return out;
};

/** 0～1 的格子哈希 */
const 哈希 = (a: number, b: number, 盐: number) => (((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(盐, 83492791)) >>> 0) % 1000) / 1000;

/** 这一格云的中心（水平，格）：飘 = 往东挪了多少（原版云往西飘，给负数） */
export const 云心 = (c: 云格子, 飘: number): [number, number] => [c.a * 云格 + 云格 / 2 + 飘, c.b * 云格 + 云格 / 2];

/** 这一格云从哪个洞半径起开始散（离洞心的距离 + 哈希抖动，毛边 = 洞口参差多少格） */
export const 散起半径 = (c: 云格子, 心: readonly [number, number], 飘: number, 毛边: number) => {
  const [x, y] = 云心(c, 飘);
  return Math.hypot(x - 心[0], y - 心[1]) + (哈希(c.a, c.b, 0) - 0.5) * 毛边;
};
