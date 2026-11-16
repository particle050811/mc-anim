// 魔法酒狐核对的视图表：一帧一个视图。纯数据（段.ts 要读帧数和页面尺寸）。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），原点是她脚底；她照隐世之境那只女仆面朝南（yaw 180），坐在地毯顶面上。
// 游戏截图（数据根 run/extract/隐世之境/坐标.md）的机位换算：游戏 (x, y, z) 减去女仆脚底 (11.5, 201.0625, 10.5)，再换成 (x, −z, y)。
import type { V3 } from '@engine/model/parts.tsx';

export type View = {
  name: string;
  width: number;
  height: number;
  眼: V3;
  看: V3; // 机位对准的点
  fov: number; // 竖直视角（度）
  stancePose: '坐' | '站';
  头?: [number, number] | '看玩家'; // 她的 看 [俯仰, 左右]；'看玩家' 按 眼 算
  ground: boolean; // 画木地板和地毯；核贴图的几张不画，免得挡住底面
  gameShot?: string; // 对应的游戏截图
  sec?: number; // 法杖浮动、三个环、耳朵抖取第几秒，默认 0
  hat?: boolean; // 默认戴
  glow?: boolean; // 默认开
  暗?: boolean; // 关掉平行光、环境光压到很暗，看哪些面是满亮度
};

const widthPx = 1280;
const height = 720;
const farView = { width: widthPx, height: height, fov: 20, stancePose: '站' as const, ground: false };
const sitView = { width: widthPx, height: height, fov: 22, stancePose: '坐' as const, ground: true };
// 第一人称：玩家站在她南边 2 格的地毯上、眼高 1.62（离木地板 1.68），对准她身子中间，同游戏截图 01
const firstPersonView = { width: widthPx, height: height, 眼: [0, -2, 1.62] as V3, 看: [0, 0, 0.7375] as V3, fov: 70, stancePose: '坐' as const, ground: true };

export const views: readonly View[] = [
  { name: '贴图-正', ...farView, 眼: [0, -6, 0.9], 看: [0, 0, 0.9] },
  { name: '贴图-背', ...farView, 眼: [0, 6, 0.9], 看: [0, 0, 0.9] },
  { name: '贴图-仰视', ...farView, fov: 40, 眼: [0, -2.2, -1.6], 看: [0, 0, 0.7] },
  { name: '坐-正', ...sitView, 眼: [0, -4, 0.6], 看: [0, 0, 0.55] },
  { name: '坐-侧', ...sitView, 眼: [4, 0, 0.6], 看: [0, 0, 0.55] },
  { name: '坐-背', ...sitView, 眼: [0, 4, 0.6], 看: [0, 0, 0.55] },
  { name: '第一人称-俯仰0', ...firstPersonView, 头: [0, 0], gameShot: '01-一楼机位.png' },
  { name: '第一人称-俯仰15', ...firstPersonView, 头: [15, 0] },
  { name: '第一人称-俯仰30', ...firstPersonView, 头: [30, 0] },
  { name: '第一人称-看玩家', ...firstPersonView, 头: '看玩家' },
  { name: '游戏03-右前方', ...sitView, 眼: [1.6, -1.9, 1.0875], 看: [0, 0, 0.5575], fov: 50, gameShot: '03-女仆参考.png' },
  { name: '游戏04-东侧', ...sitView, 眼: [3.4, 0, 0.6875], 看: [0, 0, 0.5375], fov: 40, gameShot: '04-女仆侧面.png' },
  { name: '坐-正-往左看30', ...sitView, 眼: [0, -4, 0.6], 看: [0, 0, 0.55], 头: [0, 30] }, // 她面朝南，往她自己的左边看 = 往东（画面右边）
  { name: '游戏05-无帽', ...sitView, 眼: [1.6, -1.9, 1.0875], 看: [0, 0, 0.5575], fov: 50, hat: false, gameShot: '05-女仆无帽参考.png' },
  ...([true, false] as const).map((glow) => ({ name: `暗-右前方-发光${glow ? '开' : '关'}`, ...sitView, 眼: [2.4, -1.6, 1.0] as V3, 看: [0, 0.15, 0.55] as V3, fov: 45, glow, 暗: true })),
  ...([true, false] as const).map((glow) => ({ name: `暗-脸-发光${glow ? '开' : '关'}`, ...sitView, 眼: [0.25, -1.5, 0.78] as V3, 看: [0, 0, 0.72] as V3, fov: 24, glow, 暗: true })),
  // 站着法杖才上下浮（坐着被 sit 盖掉），三个时刻看浮动和三个环转
  ...[0, 0.6, 1].map((sec) => ({ name: `站-法杖-${sec}秒`, ...farView, 眼: [2.6, 1.6, 1.1] as V3, 看: [0, 0.5, 0.85] as V3, fov: 36, sec: sec })),
  { name: '游戏04-东侧-0.5秒', ...sitView, 眼: [3.4, 0, 0.6875], 看: [0, 0, 0.5375], fov: 40, sec: 0.5 }, // 坐着环也转，和 游戏04-东侧（0 秒）比
];

export const pageWidth = Math.max(...views.map((v) => v.width));
export const pageHeight = Math.max(...views.map((v) => v.height));
