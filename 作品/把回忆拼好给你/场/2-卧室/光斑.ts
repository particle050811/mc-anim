// 窗光：南墙（剖掉的那面，看不见）上那扇窗、天亮时卧室门照进屋里的光斑。纯模块，按贴图像素格（1/16 格）一格一格算，光斑的边是台阶状的像素边，不出渐变（05-画风 原则 2）。
// 做法：受光面（后墙、地板、两张床的被面和床脚那面）切成贴图像素格，每格中心顺着光的反方向找回开口所在的那面墙，落在开口里就亮；
//   路上被床挡住的不亮（床在光斑前面投下的影子）。她不算挡光的（她的轮廓是斜的，方盒子影子反倒假；影子落在她身后，剖面里多半被她自己挡着）。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。输出每个受光面一组矩形（同一行相邻的亮格并成一条），给 窗光.tsx 画成叠在面上的薄片。
import { bedroom, bedroomWalls } from '../../地点/小木屋卧室布局.ts';
import { maidBedHeadboardHeight, maidBedSurfaceHeight, bedSurfaceHeight } from '../../物品/床尺寸.ts';

const texelSize = 1 / 16;

export type Box = { x: readonly [number, number]; y: readonly [number, number]; z: readonly [number, number] };
/** 受光面：竖 = 朝南的竖面（y 固定，铺 x、z）；平 = 朝上的水平面（z 固定，铺 x、y）。挖 = 面上不受光的洞（后墙上的窗） */
export type LitSurface =
  | { 名: string; 种: '竖'; y: number; x: readonly [number, number]; z: readonly [number, number]; holes?: readonly { x: readonly [number, number]; z: readonly [number, number] }[] }
  | { 名: string; 种: '平'; z: number; x: readonly [number, number]; y: readonly [number, number] };
/** 光进来的开口：竖在 面 = 位 那个平面上（'y'：南墙，铺 x；'x'：西墙，铺 y），横向 a0～a1、高 z0～z1；
 *  框 = 中间窗框几格宽（0 = 没有窗框，一整片玻璃） */
export type Opening = { 面: 'x' | 'y'; 位: number; a0: number; a1: number; z0: number; z1: number; 框: number };
/** 一条亮的矩形，在受光面自己的两个轴上（竖面：a = x、b = z；平面：a = x、b = y） */
export type LightStrip = { a0: number; a1: number; b0: number; b1: number };

const { backWall, eastWall, westWall } = bedroomWalls;
const indoorX: readonly [number, number] = [westWall + 0.5, eastWall - 0.5];
const [backWindowX, backWindowZ] = bedroom.backWindow;
const yourBedX = bedroom.yourBed.位[0], maidBedX = bedroom.maidBed.位[0];

/** 南墙上的窗、卧室门（门洞在西墙内面 x = 0.5，y 0～1） */
export const bedroomOpenings: Readonly<Record<'南窗' | '门', Opening>> = {
  南窗: { 面: 'y', 位: 0, a0: bedroom.southWindow.x0, a1: bedroom.southWindow.x1, z0: bedroom.southWindow.z0, z1: bedroom.southWindow.z1, 框: bedroom.southWindow.框 },
  门: { 面: 'x', 位: bedroom.门.doorOpening.x1, a0: 0, a1: 1, z0: bedroom.门.doorOpening.z0, z1: bedroom.门.doorOpening.z1, 框: 0 },
};

/** 卧室里受光的面。床的被面、床脚那面按模型量的（物品/床.tsx、物品/女仆床.tsx）：红床床垫 3/16～9/16 高、两格长；女仆床被子顶 7.53/16、床头板那截不铺 */
export const bedroomLitSurfaces: readonly LitSurface[] = [
  { 名: '后墙', 种: '竖', y: backWall, x: indoorX, z: [0, 3], holes: [{ x: [backWindowX - 0.5, backWindowX + 0.5], z: [backWindowZ, backWindowZ + 1] }] },
  { 名: '地板', 种: '平', z: 0, x: indoorX, y: [0, backWall] },
  { 名: '你床面', 种: '平', z: bedSurfaceHeight, x: [yourBedX - 0.5, yourBedX + 0.5], y: [1, 3] },
  { 名: '你床脚', 种: '竖', y: 1, x: [yourBedX - 0.5, yourBedX + 0.5], z: [3 / 16, bedSurfaceHeight] },
  { 名: '女仆床面', 种: '平', z: maidBedSurfaceHeight, x: [maidBedX - 0.5, maidBedX + 0.5], y: [1, 2.4] },
  { 名: '女仆床脚', 种: '竖', y: 1, x: [maidBedX - 0.5, maidBedX + 0.5], z: [0, maidBedSurfaceHeight] },
];

/** 挡光的：两张床（床身、女仆床的床头板） */
export const bedroomBlockers: readonly Box[] = [
  { x: [yourBedX - 0.5, yourBedX + 0.5], y: [1, 3], z: [0, bedSurfaceHeight] },
  { x: [maidBedX - 0.5, maidBedX + 0.5], y: [1, 3], z: [0, maidBedSurfaceHeight] },
  { x: [maidBedX - 0.5, maidBedX + 0.5], y: [2.75, 3], z: [0, maidBedHeadboardHeight] },
];

/** 从点 p 沿方向 d 走（t > 小量）有没有穿过盒子（slab 法）；t 的上限 t止 */
const passThrough = (p: readonly number[], d: readonly number[], b: Box, tEnd: number) => {
  let t0 = 1e-6, t1 = tEnd;
  const extents = [b.x, b.y, b.z];
  for (let i = 0; i < 3; i++) {
    const [lo, hi] = extents[i]!;
    if (Math.abs(d[i]!) < 1e-12) {
      if (p[i]! <= lo || p[i]! >= hi) return false;
      continue;
    }
    let ta = (lo - p[i]!) / d[i]!, tb = (hi - p[i]!) / d[i]!;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return true;
};

/** 点 p 顺着光的反方向能不能照到：落在开口里、路上没被挡。光 方向 要朝屋里走（南窗：往北 +y；门：往东 +x） */
const isLit = (p: readonly [number, number, number], lightDir: readonly number[], w: Opening, occluders: readonly Box[]) => {
  const normalAxis = w.面 === 'y' ? 1 : 0;
  const lateralAxis = w.面 === 'y' ? 0 : 1;
  const d = lightDir[normalAxis]!;
  if (d <= 0) return false;
  const t = (p[normalAxis] - w.位) / d;
  if (t <= 0) return false;
  const a = p[lateralAxis] - t * lightDir[lateralAxis]!, z = p[2] - t * lightDir[2]!;
  const center = (w.a0 + w.a1) / 2;
  const lit = z > w.z0 && z < w.z1 && a > w.a0 && a < w.a1 && !(w.框 > 0 && Math.abs(a - center) < w.框 / 2);
  if (!lit) return false;
  const reverseDir = lightDir.map((v) => -v);
  return !occluders.some((b) => passThrough(p, reverseDir, b, t));
};

/** 一个受光面上被这一束光照亮的格，同一行相邻的并成一条 */
export const lightSpot = (face: LitSurface, lightDir: readonly number[], w: Opening = bedroomOpenings.南窗, occluders: readonly Box[] = bedroomBlockers): LightStrip[] => {
  const [a0, a1] = face.x;
  const [b0, b1] = face.种 === '竖' ? face.z : face.y;
  const na = Math.round((a1 - a0) / texelSize), nb = Math.round((b1 - b0) / texelSize);
  const out: LightStrip[] = [];
  for (let j = 0; j < nb; j++) {
    const b = b0 + (j + 0.5) * texelSize;
    let startIndex: number | null = null;
    for (let i = 0; i <= na; i++) {
      let isBright = false;
      if (i < na) {
        const a = a0 + (i + 0.5) * texelSize;
        const p: [number, number, number] = face.种 === '竖' ? [a, face.y, b] : [a, b, face.z];
        const isCarved = face.种 === '竖' && (face.holes ?? []).some((h) => a > h.x[0] && a < h.x[1] && b > h.z[0] && b < h.z[1]);
        isBright = !isCarved && isLit(p, lightDir, w, occluders);
      }
      if (isBright && startIndex === null) startIndex = i;
      if (!isBright && startIndex !== null) {
        out.push({ a0: a0 + startIndex * texelSize, a1: a0 + i * texelSize, b0: b0 + j * texelSize, b1: b0 + (j + 1) * texelSize });
        startIndex = null;
      }
    }
  }
  return out;
};

/** 这一束光（从哪个开口、往哪走）在卧室里所有受光面上的光斑 */
export const bedroomLightPatch = (lightDir: readonly number[], fromOpening: keyof typeof bedroomOpenings = '南窗') =>
  bedroomLitSurfaces.map((face) => ({ 面: face, 条: lightSpot(face, lightDir, bedroomOpenings[fromOpening]) }));
