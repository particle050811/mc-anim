// 娘化亚波伦核对的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），
// 角色站在原点、面朝南（yaw 180），正面机位在南边。
import type { V3 } from '@engine/model/parts.tsx';

export const aspect = { width: 1280, height: 720 } as const;

/** 表演：画面.tsx 里按名字取；秒：表演的时钟；变体：不写就是本片默认（default 贴图，面纱、漩涡光环照贴图原样） */
export type View = {
  name: string;
  clean?: true;
  sourcePack?: boolean;
  眼: V3;
  看: V3;
  fov: number;
  act: '站立' | '悬停' | '受击' | '前飞';
  sec: number;
  variant?: { 贴图?: 'default' | '2default' | '3default' | '4default' | '5default'; veil?: '加'; vortexHalo?: '加' };
  /** 右手拿下界魔杖，右臂用持杖的默认摆法（斜举，角色/娘化亚波伦.tsx 的 斜举） */
  holdWand?: true;
  /** 不画角色，只画一根下界魔杖（放大 2 倍），套 json 的 gui 显示变换，和游戏里的图标比外形 */
  onlyWand?: '图标角度';
  /** 角色脚底离地几格（机位跟着抬）：fly 里身子前倾、身后放大出一个八边环，贴地会插进地面 */
  lift?: number;
  /** 手部特写：机位跟着右手手心走（角色/娘化亚波伦.tsx 的 右手心），眼 = 手心 + 这个偏移、看手心；眼、看 两项不用 */
  lookRightHand?: V3;
  note?: string;
};

// 全身连头后的大光环、两边的蜘蛛腿都收进来；光环顶在 3 格上下
const front = { 眼: [0, -9, 1.7] as V3, 看: [0, 0, 1.45] as V3, fov: 30 };
const diagSide = { 眼: [-5.6, -7, 2.4] as V3, 看: [0, 0, 1.45] as V3, fov: 30 };
const backView = { 眼: [0, 9, 1.7] as V3, 看: [0, 0, 1.45] as V3, fov: 30 };
const face = { 眼: [0, -2.6, 1.5] as V3, 看: [0, 0, 1.5] as V3, fov: 22 };
const halfBody = { 眼: [-1.6, -4.2, 1.7] as V3, 看: [0, 0, 1.45] as V3, fov: 28 };
// fly 里上身拧向一边，从身后斜着看头发
// 她的右手在西边（−x）：从右前方看握杖的手（斜举时手在肩外侧、齐胸高）
const rightHandView = { 眼: [-2.8, -2.4, 1.5] as V3, 看: [-0.6, -0.1, 1.2] as V3, fov: 30 };
const behindDiag = { 眼: [4.5, 6.5, 2.2] as V3, 看: [0, 0, 1.3] as V3, fov: 30 };

export const views: readonly View[] = [
  { name: '站立-正面', ...front, act: '站立', sec: 0.5 },
  { name: '站立-斜侧', ...diagSide, act: '站立', sec: 0.5 },
  { name: '站立-背面', ...backView, act: '站立', sec: 0.5 },
  { name: '飞行-0.4秒', ...diagSide, act: '悬停', lift: 1.5, sec: 0.4, note: 'fly 3 秒一遍' },
  { name: '飞行-1.4秒', ...diagSide, act: '悬停', lift: 1.5, sec: 1.4 },
  { name: '飞行-2.4秒', ...diagSide, act: '悬停', lift: 1.5, sec: 2.4 },
  { name: '眨眼-闭眼', ...face, act: '站立', sec: 0.15, note: 'pre_parallel1：4 秒一遍，0.083～0.208 秒闭着' },
  { name: '眨眼-睁眼', ...face, act: '站立', sec: 1, note: '同一机位睁着眼，对照上一张' },
  { name: '受击-0.17秒', ...diagSide, act: '受击', sec: 0.1667, note: 'attacked 0.458 秒，播一遍；这一刻身子转得最多' },
  { name: '贴图4default-正面', ...front, act: '站立', sec: 0.5, variant: { 贴图: '4default' }, note: '包的默认贴图，作者视频封面那一套：金边、面纱、帽子上方红色漩涡光环' },
  { name: '贴图4default-半身', ...halfBody, act: '站立', sec: 0.5, variant: { 贴图: '4default' }, note: '对照作者视频封面' },
  { name: 'default加面纱和漩涡-正面', ...front, act: '站立', sec: 0.5, variant: { veil: '加', vortexHalo: '加' }, note: '下界二阶段贴图上叠 2default 的面纱和漩涡光环（包里没有这种组合）' },
  { name: 'default加面纱和漩涡-半身', ...halfBody, act: '站立', sec: 0.5, variant: { veil: '加', vortexHalo: '加' } },
  { name: '前飞-起飞前', ...behindDiag, act: '前飞', lift: 1.5, sec: 0.9, note: '第 1 秒起 ground_speed 从 0 跳到 20；这一刻头发垂着' },
  { name: '前飞-起飞后0.2秒', ...behindDiag, act: '前飞', lift: 1.5, sec: 1.2, note: '头发的弹簧（ysm.second_order）正在甩起来' },
  { name: '前飞-起飞后3秒', ...behindDiag, act: '前飞', lift: 1.5, sec: 4, note: '弹簧停稳：头发抬到输入的角度' },
  { name: '持杖-站立-斜侧', ...diagSide, act: '站立', sec: 0.5, holdWand: true, note: '右手拿下界魔杖（挂 RightHandLocator），默认斜举：杖在身体右侧，杖头朝斜上、往外、略往前，和竖直约 31 度' },
  { name: '持杖-站立-右手近看', ...rightHandView, act: '站立', sec: 0.5, holdWand: true, note: '握点在杖身正中（display 平移 [0, -7, 1]）；上臂往外抬、肘微弯、手腕外旋' },
  { name: '持杖-飞行-斜侧', ...diagSide, act: '悬停', lift: 1.5, sec: 1.4, holdWand: true, note: 'fly 里右臂换成斜举（原动作两手合在胸前），杖跟着身子往外倒、和竖直约 56 度；左臂照原样' },
  { name: '持杖-飞行-正面', ...front, act: '悬停', lift: 1.5, sec: 1.4, holdWand: true },
  { name: '魔杖-图标角度', 眼: [0, -6, 1.6], 看: [0, 0, 1.6], fov: 30, act: '站立', sec: 0, onlyWand: '图标角度', note: '套 json 的 gui 显示变换，对照物品栏图标' },
  // 浮块藏掉了（用户 11-10 定不留）：浮块没了、蜘蛛腿和头后光环还在，看 站立-正面、站立-斜侧；fly 里身后的缺口环看 飞行-*
  { name: '持杖-站立-正面', ...front, act: '站立', sec: 0.5, holdWand: true, note: '斜举的正面：整根杖在身体右侧，杖头在帽檐外' },
  // 握杖（用户 11-10：「这法杖都没有拿到手上」）：杖身从露在袖口外的手正中穿过。机位跟着手心，各两个角度
  { name: '握杖-站立-手部-右前', 眼: [0, 0, 0], 看: [0, 0, 0], lookRightHand: [-1.1, -1.5, 0.35], fov: 24, act: '站立', sec: 0.5, holdWand: true, note: '从她右前方看右手：杖身穿过手心' },
  { name: '握杖-站立-手部-外侧', 眼: [0, 0, 0], 看: [0, 0, 0], lookRightHand: [-1.8, 0.3, 0.2], fov: 24, act: '站立', sec: 0.5, holdWand: true, note: '从她右手外侧平着看' },
  { name: '握杖-站立-手部-正下', 眼: [0, 0, 0], 看: [0, 0, 0], lookRightHand: [-0.3, -0.9, -1.5], fov: 24, act: '站立', lift: 1.5, sec: 0.5, holdWand: true, note: '从手的下前方往上看手的端面' },
  { name: '握杖-飞行-手部-右前', 眼: [0, 0, 0], 看: [0, 0, 0], lookRightHand: [-1.1, -1.5, 0.35], fov: 24, act: '悬停', lift: 1.5, sec: 1.4, holdWand: true, note: 'fly 的斜举，从她右前方看右手' },
  { name: '握杖-飞行-手部-外侧上', 眼: [0, 0, 0], 看: [0, 0, 0], lookRightHand: [-1.5, 0.2, 1.1], fov: 24, act: '悬停', lift: 1.5, sec: 1.4, holdWand: true, note: 'fly 的斜举，从右手外侧上方看' },
  { name: '握杖-飞行-手部-正面', 眼: [0, 0, 0], 看: [0, 0, 0], lookRightHand: [0, -1.9, 0.1], fov: 24, act: '悬停', lift: 1.5, sec: 1.4, holdWand: true, note: 'fly 的斜举，从正面平着看右手' },
  { name: '持杖-飞行-正面-0秒', ...front, act: '悬停', lift: 1.5, sec: 0, holdWand: true, note: 'fly 一遍里身子摆到最右的一刻：杖尾离身子最近' },
  ...([['正面', 0, -12], ['正侧', -12, 0], ['背面', 0, 12]] as const).map(([name, east, north]): View => ({
    name: `定妆-${name}`, clean: true, 眼: [east, north, 1.52], 看: [0, 0, 1.52], fov: 16.5, act: '站立', sec: 0.5,
  })),
  { name: '定妆-脸', clean: true, 眼: [0.16, -4.2, 1.58], 看: [0, 0, 1.57], fov: 10.8, act: '站立', sec: 0.5 },
  { name: '定妆-脸四分之三', clean: true, 眼: [-2.40, -3.45, 1.58], 看: [0, 0, 1.57], fov: 10.8, act: '站立', sec: 0.5 },
  { name: '定妆-脸眨眼', clean: true, 眼: [0.16, -4.2, 1.58], 看: [0, 0, 1.57], fov: 10.8, act: '站立', sec: 0.15 },
  ...[true, false].map((sourcePack): View => ({ name: sourcePack ? 'YSM原包-俯视' : '正片-同位俯视', sourcePack, clean: true,
    眼: [-0.32, -3.0, 2.25], 看: [0, 0, 1.55], fov: 16, act: '站立', sec: 0.5 })),
  { name: '同机位半闭眼', clean: true, 眼: [0.16, -4.2, 1.58], 看: [0, 0, 1.57], fov: 10.8, act: '站立', sec: 0.043 },
];
