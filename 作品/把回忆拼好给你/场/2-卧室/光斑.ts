// 窗光：南墙（剖掉的那面，看不见）上那扇窗、天亮时卧室门照进屋里的光斑。纯模块，按贴图像素格（1/16 格）一格一格算，光斑的边是台阶状的像素边，不出渐变（05-画风 原则 2）。
// 做法：受光面（后墙、地板、两张床的被面和床脚那面）切成贴图像素格，每格中心顺着光的反方向找回开口所在的那面墙，落在开口里就亮；
//   路上被床挡住的不亮（床在光斑前面投下的影子）。她不算挡光的（她的轮廓是斜的，方盒子影子反倒假；影子落在她身后，剖面里多半被她自己挡着）。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。输出每个受光面一组矩形（同一行相邻的亮格并成一条），给 窗光.tsx 画成叠在面上的薄片。
import { 卧室, 卧室墙 } from '../../地点/小木屋卧室布局.ts';
import { 女仆床头板高, 女仆床面高, 床面高 } from '../../物品/床尺寸.ts';

const 像 = 1 / 16;

export type 盒 = { x: readonly [number, number]; y: readonly [number, number]; z: readonly [number, number] };
/** 受光面：竖 = 朝南的竖面（y 固定，铺 x、z）；平 = 朝上的水平面（z 固定，铺 x、y）。挖 = 面上不受光的洞（后墙上的窗） */
export type 受光面 =
  | { 名: string; 种: '竖'; y: number; x: readonly [number, number]; z: readonly [number, number]; 挖?: readonly { x: readonly [number, number]; z: readonly [number, number] }[] }
  | { 名: string; 种: '平'; z: number; x: readonly [number, number]; y: readonly [number, number] };
/** 光进来的开口：竖在 面 = 位 那个平面上（'y'：南墙，铺 x；'x'：西墙，铺 y），横向 a0～a1、高 z0～z1；
 *  框 = 中间窗框几格宽（0 = 没有窗框，一整片玻璃） */
export type 开口 = { 面: 'x' | 'y'; 位: number; a0: number; a1: number; z0: number; z1: number; 框: number };
/** 一条亮的矩形，在受光面自己的两个轴上（竖面：a = x、b = z；平面：a = x、b = y） */
export type 光条 = { a0: number; a1: number; b0: number; b1: number };

const { 后墙, 东墙, 西墙 } = 卧室墙;
const 屋内x: readonly [number, number] = [西墙 + 0.5, 东墙 - 0.5];
const [后窗i, 后窗k] = 卧室.后窗;
const 你床x = 卧室.你的床.位[0], 女仆床x = 卧室.女仆床.位[0];

/** 南墙上的窗、卧室门（门洞在西墙内面 x = 0.5，y 0～1） */
export const 卧室开口: Readonly<Record<'南窗' | '门', 开口>> = {
  南窗: { 面: 'y', 位: 0, a0: 卧室.南窗.x0, a1: 卧室.南窗.x1, z0: 卧室.南窗.z0, z1: 卧室.南窗.z1, 框: 卧室.南窗.框 },
  门: { 面: 'x', 位: 卧室.门.门洞.x1, a0: 0, a1: 1, z0: 卧室.门.门洞.z0, z1: 卧室.门.门洞.z1, 框: 0 },
};

/** 卧室里受光的面。床的被面、床脚那面按模型量的（物品/床.tsx、物品/女仆床.tsx）：红床床垫 3/16～9/16 高、两格长；女仆床被子顶 7.53/16、床头板那截不铺 */
export const 卧室受光面: readonly 受光面[] = [
  { 名: '后墙', 种: '竖', y: 后墙, x: 屋内x, z: [0, 3], 挖: [{ x: [后窗i - 0.5, 后窗i + 0.5], z: [后窗k, 后窗k + 1] }] },
  { 名: '地板', 种: '平', z: 0, x: 屋内x, y: [0, 后墙] },
  { 名: '你床面', 种: '平', z: 床面高, x: [你床x - 0.5, 你床x + 0.5], y: [1, 3] },
  { 名: '你床脚', 种: '竖', y: 1, x: [你床x - 0.5, 你床x + 0.5], z: [3 / 16, 床面高] },
  { 名: '女仆床面', 种: '平', z: 女仆床面高, x: [女仆床x - 0.5, 女仆床x + 0.5], y: [1, 2.4] },
  { 名: '女仆床脚', 种: '竖', y: 1, x: [女仆床x - 0.5, 女仆床x + 0.5], z: [0, 女仆床面高] },
];

/** 挡光的：两张床（床身、女仆床的床头板） */
export const 卧室挡光: readonly 盒[] = [
  { x: [你床x - 0.5, 你床x + 0.5], y: [1, 3], z: [0, 床面高] },
  { x: [女仆床x - 0.5, 女仆床x + 0.5], y: [1, 3], z: [0, 女仆床面高] },
  { x: [女仆床x - 0.5, 女仆床x + 0.5], y: [2.75, 3], z: [0, 女仆床头板高] },
];

/** 从点 p 沿方向 d 走（t > 小量）有没有穿过盒子（slab 法）；t 的上限 t止 */
const 穿过 = (p: readonly number[], d: readonly number[], b: 盒, t止: number) => {
  let t0 = 1e-6, t1 = t止;
  const 范围 = [b.x, b.y, b.z];
  for (let i = 0; i < 3; i++) {
    const [lo, hi] = 范围[i]!;
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
const 照得到 = (p: readonly [number, number, number], 方向: readonly number[], w: 开口, 挡: readonly 盒[]) => {
  const 轴 = w.面 === 'y' ? 1 : 0;
  const 横 = w.面 === 'y' ? 0 : 1;
  const d = 方向[轴]!;
  if (d <= 0) return false;
  const t = (p[轴] - w.位) / d;
  if (t <= 0) return false;
  const a = p[横] - t * 方向[横]!, z = p[2] - t * 方向[2]!;
  const 中 = (w.a0 + w.a1) / 2;
  const 在 = z > w.z0 && z < w.z1 && a > w.a0 && a < w.a1 && !(w.框 > 0 && Math.abs(a - 中) < w.框 / 2);
  if (!在) return false;
  const 回 = 方向.map((v) => -v);
  return !挡.some((b) => 穿过(p, 回, b, t));
};

/** 一个受光面上被这一束光照亮的格，同一行相邻的并成一条 */
export const 光斑 = (面: 受光面, 方向: readonly number[], w: 开口 = 卧室开口.南窗, 挡: readonly 盒[] = 卧室挡光): 光条[] => {
  const [a0, a1] = 面.x;
  const [b0, b1] = 面.种 === '竖' ? 面.z : 面.y;
  const na = Math.round((a1 - a0) / 像), nb = Math.round((b1 - b0) / 像);
  const out: 光条[] = [];
  for (let j = 0; j < nb; j++) {
    const b = b0 + (j + 0.5) * 像;
    let 起: number | null = null;
    for (let i = 0; i <= na; i++) {
      let 亮 = false;
      if (i < na) {
        const a = a0 + (i + 0.5) * 像;
        const p: [number, number, number] = 面.种 === '竖' ? [a, 面.y, b] : [a, b, 面.z];
        const 挖了 = 面.种 === '竖' && (面.挖 ?? []).some((h) => a > h.x[0] && a < h.x[1] && b > h.z[0] && b < h.z[1]);
        亮 = !挖了 && 照得到(p, 方向, w, 挡);
      }
      if (亮 && 起 === null) 起 = i;
      if (!亮 && 起 !== null) {
        out.push({ a0: a0 + 起 * 像, a1: a0 + i * 像, b0: b0 + j * 像, b1: b0 + (j + 1) * 像 });
        起 = null;
      }
    }
  }
  return out;
};

/** 这一束光（从哪个开口、往哪走）在卧室里所有受光面上的光斑 */
export const 卧室光斑 = (方向: readonly number[], 从: keyof typeof 卧室开口 = '南窗') =>
  卧室受光面.map((面) => ({ 面, 条: 光斑(面, 方向, 卧室开口[从]) }));
