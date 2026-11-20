// 头像核对的视图表（纯数据，段.ts 也读）：一秒一个方案，第 i 个在第 60i 帧。方形，给粉丝当头像用的大头照（用户 11-20 要的，评论区有人要娘化亚波伦的大头照）。
// 机位写在她自己的坐标里：她站在原点、面朝 −Y（南），x 往她的左手边（画面右边），z 朝上，单位格；画面.tsx 按 场地 的位置和朝向搬过去。
import type { V3 } from '@engine/model/parts.tsx';

export const aspect = { width: 1080, height: 1080 } as const;

export type Venue = '下界' | '教堂' | '纯底';

export type AvatarPlan = {
  name: string;
  venue: Venue;
  /** 她在场地里朝哪（yaw，度；180 = 面朝南）。下界里转她来挑身后的背景 */
  yaw?: number;
  眼: V3;
  看: V3;
  fov: number;
  act: '站立' | '悬停';
  sec: number;
  holdWand?: true;
  /** 只给她提亮暗部（角色/防暗.tsx 的 抬） */
  brighten?: number;
  /** 头的转角（度，盖在动画上）：y 正 = 往她右边转，z = 歪头 */
  head?: V3;
  /** 下界里从镜头那边给她补一盏白主光（真下界的地形是自写着色器，不吃场景灯） */
  keyLight?: number;
  note?: string;
};

// 头大约在 z 1.57（核对-娘化亚波伦 的 定妆-脸），帽顶约 2 格，头后眼形大光环顶约 3 格。头像多半被裁成圆：脸放画面正中
// 近 = 脸连帽子，头后眼形大光环只露下沿；仰 = 镜头低一点往上看
const near = (dx: number, dy: number, eyeZ = 1.74) => ({ 眼: [dx, dy, eyeZ] as V3, 看: [0, 0, 1.74] as V3, fov: 13 });
const [front, quarter] = [[0, -4.2], [-2.4, -3.45]] as const;
// 四分之三机位在她右前方约 35 度：头往她右边转 30 度回看镜头
const lookBack: V3 = [0, 30, 0];

export const plans: readonly AvatarPlan[] = [
  { name: '纯底-正脸', venue: '纯底', ...near(...front), act: '站立', sec: 0.5 },
  { name: '纯底-四分之三-回头', venue: '纯底', ...near(...quarter), head: lookBack, act: '站立', sec: 0.5 },
  { name: '纯底-正脸-歪头', venue: '纯底', ...near(...front), head: [0, 0, 10], act: '站立', sec: 0.5 },
  { name: '纯底-正脸-仰', venue: '纯底', ...near(front[0], front[1], 1.2), act: '站立', sec: 0.5 },
  { name: '教堂-正脸', venue: '教堂', ...near(...front), act: '站立', sec: 0.5 },
  { name: '教堂-四分之三-回头', venue: '教堂', ...near(...quarter), head: lookBack, act: '站立', sec: 0.5 },
  { name: '下界-正脸-主光', venue: '下界', ...near(...front), act: '站立', sec: 0.5, keyLight: 1.2 },
  { name: '下界-四分之三-回头-主光', venue: '下界', ...near(...quarter), head: lookBack, act: '站立', sec: 0.5, keyLight: 1.2 },
];
