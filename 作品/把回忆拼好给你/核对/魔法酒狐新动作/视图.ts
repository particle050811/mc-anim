// 魔法酒狐新动作核对的视图表（纯数据，段.ts 也读）：一帧一个视图，看 库/角色/魔法酒狐新动作.ts 的新表情、新姿势、手里的月铃兰。
// 她在原点、面朝南（yaw 180），坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。机位按她身体算：正面、四分之三（她右前方，拿花那只手这边）、侧面（她右边）、左侧面；
// 全身 = 整个人入画，脸 = 对着头的特写（机位高度、对准点由画面按姿势表算出头在哪）。
// 帧号只往后加（前面的帧和以前的静帧一一对得上）。
import type { MagicalWineFoxAllExpression, MagicalWineFoxExPose } from '@库/角色/魔法酒狐新动作.ts';

export type CameraRig = '正面' | '四分之三' | '侧面' | '左侧面' | '封面';
export type View = {
  名: string;
  cameraRig: CameraRig;
  distance: '全身' | '脸' | '手';
  stancePose: MagicalWineFoxExPose;
  expression?: MagicalWineFoxAllExpression;
  看?: [number, number] | '镜头';
  blink?: number;
  holdFlower?: '立着' | '原样';
  /** 花拿在左手（试叠加模型上的左手挂点）；不给 = 右手 */
  leftHand?: boolean;
  /** 花按原版 item/handheld 的第三人称显示变换拿（带转角，试 朝向 在显示有转角时也立得住）；不给 = item/generated */
  handheldDisplay?: boolean;
  秒?: number;
  /** 正交相机（第 8 句门这个机位是正交侧剖面），不开抗锯齿；不给 = 透视 */
  ortho?: boolean;
  /** 成片画法：三渲二画布（平涂、描边、不抗锯齿）、本作品的正交像素机位（一个方块贴图像素 6 个成片像素），最近邻放大 4 倍看 */
  toon?: boolean;
  /** 画 魔法酒狐.tsx 的旧组件 MagicalWineFox（只认 姿势 站/坐、眨眼），和新组件同一帧对比 */
  legacyComponent?: boolean;
};

const threeFaces = ['正面', '四分之三', '侧面'] as const;
const eachFace = (name: string, v: Omit<View, '名' | 'cameraRig'>): View[] => threeFaces.map((cameraRig) => ({ 名: `${name}-${cameraRig}`, cameraRig, ...v }));

export const views: readonly View[] = [
  // 新表情：站着、头不转，脸部特写；旧的微笑、惊讶放一张正面作对照（嘴有多大）
  ...eachFace('表情-认出你', { distance: '脸', stancePose: '站', expression: '认出你', blink: 0 }),
  { 名: '表情-认出你-眨眼一半-正面', cameraRig: '正面', distance: '脸', stancePose: '站', expression: '认出你', blink: 0.5 },
  ...eachFace('表情-哈气', { distance: '脸', stancePose: '站', expression: '哈气', blink: 0 }),
  { 名: '对照-微笑-正面', cameraRig: '正面', distance: '脸', stancePose: '站', expression: '微笑', blink: 0 },
  { 名: '对照-惊讶-正面', cameraRig: '正面', distance: '脸', stancePose: '站', expression: '惊讶', blink: 0 },
  // 新姿势：全身，右手拿月铃兰（哈气两手是爪子，不拿）
  ...eachFace('站-拿花', { distance: '全身', stancePose: '站', holdFlower: '立着', blink: 0 }),
  ...eachFace('坐门口-拿花', { distance: '全身', stancePose: '坐', holdFlower: '立着', 看: [0, 30], blink: 0 }),
  { 名: '坐门口-拿花照TLM原样-四分之三', cameraRig: '四分之三', distance: '全身', stancePose: '坐', holdFlower: '原样', blink: 0 },
  ...eachFace('蹲-拿花', { distance: '全身', stancePose: '蹲', holdFlower: '立着', 看: [-15, 0], blink: 0 }),
  ...eachFace('抱膝坐-拿花', { distance: '全身', stancePose: '抱膝坐', holdFlower: '立着', blink: 0 }),
  ...eachFace('张望-拿花', { distance: '全身', stancePose: '张望', holdFlower: '立着', 看: [8, 35], blink: 0 }),
  ...eachFace('哈气', { distance: '全身', stancePose: '哈气', expression: '哈气', blink: 0, 秒: 0 }),
  // 封面构图：你站在门口（眼高 1.62）往屋里看，她身子侧着、头转 50° 看你，认出你，手里拿花
  { 名: '封面-侧身转头看镜头', cameraRig: '封面', distance: '全身', stancePose: '站', expression: '认出你', 看: '镜头', holdFlower: '立着', blink: 0 },
  // 手里的花特写
  { 名: '手-站-拿花-正面', cameraRig: '正面', distance: '手', stancePose: '站', holdFlower: '立着', blink: 0 },
  { 名: '手-站-拿花-四分之三', cameraRig: '四分之三', distance: '手', stancePose: '站', holdFlower: '立着', blink: 0 },
  { 名: '手-张望-左手拿花-正面', cameraRig: '正面', distance: '手', stancePose: '张望', holdFlower: '立着', leftHand: true, blink: 0 },
  // 转头上限：要转 90° 也只转到 75°
  { 名: '转头上限-要90度', cameraRig: '正面', distance: '全身', stancePose: '站', 看: [0, 90], blink: 0 },
  // 静站和旧组件的站：除了左上角的字应当逐像素相同
  { 名: '静站-正面', cameraRig: '正面', distance: '全身', stancePose: '静站', blink: 0 },
  { 名: '对照-旧组件站-正面', cameraRig: '正面', distance: '全身', stancePose: '静站', blink: 0, legacyComponent: true },
  // 显示变换带转角（item/handheld：[0, −90, 55]）时花照样立着、正面朝镜头
  { 名: '手-站-拿花-handheld显示-正面', cameraRig: '正面', distance: '手', stancePose: '站', holdFlower: '立着', handheldDisplay: true, blink: 0 },
  { 名: '手-站-拿花-handheld显示-四分之三', cameraRig: '四分之三', distance: '手', stancePose: '站', holdFlower: '立着', handheldDisplay: true, blink: 0 },
  // 第 8 句门这个机位：正交侧剖面，两边都看（炸毛的尾巴和背后法杖）
  { 名: '哈气-正交-她右边', cameraRig: '侧面', distance: '全身', stancePose: '哈气', expression: '哈气', blink: 0, 秒: 0, ortho: true },
  { 名: '哈气-正交-她左边', cameraRig: '左侧面', distance: '全身', stancePose: '哈气', expression: '哈气', blink: 0, 秒: 0, ortho: true },
  { 名: '站-正交-她右边', cameraRig: '侧面', distance: '全身', stancePose: '站', blink: 0, 秒: 0, ortho: true },
  // 成片像素密度下的新表情、哈气（她一个贴图像素约 3.5 个成片像素）
  { 名: '三渲二-哈气-她右边', cameraRig: '侧面', distance: '全身', stancePose: '哈气', expression: '哈气', blink: 0, 秒: 0, toon: true },
  { 名: '三渲二-哈气-正面', cameraRig: '正面', distance: '全身', stancePose: '哈气', expression: '哈气', blink: 0, 秒: 0, toon: true },
  { 名: '三渲二-认出你拿花-正面', cameraRig: '正面', distance: '全身', stancePose: '站', expression: '认出你', holdFlower: '立着', blink: 0, toon: true },
];
