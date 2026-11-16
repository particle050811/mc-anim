// 安息仪式核对的视图表（纯数据，段.ts 也读）：一秒一个视图。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），祭坛那一列在 (0, 0)。
// 画：结构 = 只有结构和祭品（仪式没开始）；陈列 = 12 件祭品放大排成两排；演出 = 整段召唤在某个方案的第几秒。
import type { V3 } from '@engine/model/parts.tsx';
import { summonPlans, type SummonPlan } from '../../特效/安息仪式时序.ts';

export const aspect = { width: 1280, height: 720 } as const;

type CameraRig = { 眼: V3; 看: V3; fov: number };
export type View = CameraRig & {
  name: string;
  note?: string;
  pictureMode: { type: '结构' } | { type: '陈列' } | { type: '演出'; plan: SummonPlan; sec: number };
};

const diagTop: CameraRig = { 眼: [6.5, -8.5, 6.8], 看: [0, 0, 1.3], fov: 40 };
const levelLook: CameraRig = { 眼: [0, -11, 2.2], 看: [0, 0, 1.8], fov: 40 };
const topView: CameraRig = { 眼: [0, -0.01, 13], 看: [0, 0, 0], fov: 40 };
const transitionWide: CameraRig = { 眼: [10, -14, 6.5], 看: [0, 0, 3.6], fov: 45 };
const altarClose: CameraRig = { 眼: [3.2, -4.6, 4.2], 看: [0, 0, 2.3], fov: 40 };
const appearWide: CameraRig = { 眼: [14, -20, 7], 看: [0, 0, 3.5], fov: 50 };
/** 一边的三个基座近看：站在外面往里看 */
const dirCam = (dx: number, dy: number): CameraRig => ({ 眼: [dx * 6.6, dy * 6.6, 2.3], 看: [dx * 3, dy * 3, 1.25], fov: 34 });

// 游戏实拍（取材客户端，对照报告 1110-1330）的近景机位：站在 (4.5, 103.8, 4.5)、偏航 135、俯 15.8 度、视野 65；祭坛那格是 (0, 102, 0)，地面 100
const gameClose: CameraRig = { 眼: [4, -4, 3.8], 看: [0, 0, 2.2], fov: 65 };

const { 短: short, 长: lengthScheme } = summonPlans;
const makeView = (name: string, rig: CameraRig, plan: SummonPlan, sec: number, note?: string): View => ({ name: `${plan.name}方案-${name}`, ...rig, pictureMode: { type: '演出', plan, sec: sec }, note: note });

export const views: readonly View[] = [
  { name: '结构-斜俯全景', ...diagTop, pictureMode: { type: '结构' }, note: '黑曜石底 7×7、哭泣黑曜石 3×3 台、诅咒笼上摞祭坛、四个斜角灵魂火、外圈 12 个基座各一件祭品' },
  { name: '结构-平视', ...levelLook, pictureMode: { type: '结构' }, note: '从南往北看' },
  { name: '结构-俯视', ...topView, pictureMode: { type: '结构' }, note: '上北' },
  { name: '祭品-陈列', 眼: [0, -9, 1.6], 看: [0, 0, 1.6], fov: 40, pictureMode: { type: '陈列' }, note: '12 件祭品照配方顺序，放大 2 倍（基座上是半格大）' },
  { name: '祭品特写-北边', ...dirCam(0, 1), pictureMode: { type: '结构' }, note: '暗夜之心、龙息、禁忌卷轴（从左到右是镜头里的顺序，不一定是配方顺序）' },
  { name: '祭品特写-东边', ...dirCam(1, 0), pictureMode: { type: '结构' }, note: '附魔金苹果、下界之星、不洁之血' },
  { name: '祭品特写-南边', ...dirCam(0, -1), pictureMode: { type: '结构' }, note: '暗影精华、灵魂红宝石、炼狱魔典' },
  { name: '祭品特写-西边', ...dirCam(-1, 0), pictureMode: { type: '结构' }, note: '邪恶头盔、老巫婆帽、术士腰带' },
  makeView('过程1-开始0.6秒', diagTop, lengthScheme, 0.6, '破碎之环在祭坛上转，12 个基座往祭坛喷祭品碎屑'),
  makeView('过程2-祭品消失前', diagTop, lengthScheme, lengthScheme.offeringVanishSec - 0.05, '碎屑喷满'),
  makeView('过程3-祭品消失后0.3秒', diagTop, lengthScheme, lengthScheme.offeringVanishSec + 0.3, '12 件同时没了（用户 11-10 定），最后一批碎屑还在飞'),
  makeView('过程4-完成0.5秒', altarClose, lengthScheme, lengthScheme.completed + 0.5, '暗红光柱最亮（活 20 刻的第 10 刻），环没了，法阵开始长'),
  makeView('过渡1-完成后1秒', transitionWide, lengthScheme, lengthScheme.completed + 1, '法阵半边 2 格（1.5 秒长到 3），两道环已升到 2、4 格'),
  makeView('过渡2-提示后0.5秒', transitionWide, lengthScheme, lengthScheme.提示 + 0.5, '相当于游戏第 150 刻之后：聚风带变密'),
  makeView('过渡3-低语后1秒', transitionWide, lengthScheme, lengthScheme.whisperSec + 1, '相当于第 300 刻之后：每刻一颗大烟'),
  makeView('过渡4-现身前0.25秒', transitionWide, lengthScheme, lengthScheme.appear - 0.25, '法阵最后 0.5 秒缩回去'),
  makeView('现身-0.15秒', appearWide, lengthScheme, lengthScheme.appear + 0.15, '200 颗火焰炸开，亚波伦生在过渡实体的位置（祭坛那格的中心）'),
  makeView('现身-0.6秒', appearWide, lengthScheme, lengthScheme.appear + 0.6),
  makeView('过程-开始0.6秒', diagTop, short, 0.6),
  makeView('过程-完成0.5秒', altarClose, short, short.completed + 0.5),
  makeView('过渡-提示后0.5秒', transitionWide, short, short.提示 + 0.5),
  makeView('过渡-低语后0.6秒', transitionWide, short, short.whisperSec + 0.6),
  makeView('现身-0.15秒', appearWide, short, short.appear + 0.15),
  // ---- 照游戏实拍的近景机位（长方案）：秒按游戏刻对到方案里（完成 = 游戏第 586 刻，过渡三段线性）----
  makeView('游戏近景-仪式前', gameClose, lengthScheme, -0.5, '对 乙近景-005：仪式还没开始，祭坛有眼睛，灵魂火冒烟'),
  makeView('游戏近景-光柱', gameClose, lengthScheme, lengthScheme.completed + 0.5, '对 乙近景-039：红柱又细又直'),
  makeView('游戏近景-聚风带早', gameClose, lengthScheme, 5.8, '对 乙近景-048：游戏过渡约第 135 刻'),
  makeView('游戏近景-聚风带中', gameClose, lengthScheme, 7.4, '对 乙近景-056：约第 255 刻'),
  makeView('游戏近景-聚风带晚', gameClose, lengthScheme, 8.6, '对 乙近景-060：约第 330 刻'),
];
