// 封面草稿的方案表（纯数据，段.ts 也读）：三稿四案（甲乙丙丁）、四稿三案（戊己庚）、五稿三案（辛壬癸）、六稿三案（子丑寅）、八稿三案（卯辰巳）：第 i 个方案在第 60i 帧。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），地面 z = 0。
// 三稿：轮盘从下界魔杖的杖尖张开、以杖尖为圆心（用户 11-10 看了二稿说「我的想法是亚波伦拿着法杖，然后法杖尖端展开面板，你怎么是背后展开？」）。
// 盘面怎么朝向试三种（界面/杖尖盘位姿.ts）：甲 和杖身垂直，乙 正对镜头，丙 举过头顶张成天穹；丁 是甲的摆法、杖朝下指着史蒂夫。
// 机位在南边朝北看。史蒂夫的位置是海报式的摆法（要他小、在下方、看得见脸），甲、丁里他在杖指的方向上。
// 四稿：她在左上、杖指右下、盘正对镜头（用户 11-10 定），见下面「四稿」一段。五稿：史蒂夫和结界不出镜、镜头正对盘心（用户 11-10 定），见「五稿」一段。六稿：只用 71 个、盘垂直杖身斜着看、杖握在手里（用户 11-10 定），见「六稿」一段。八稿：仰拍、杖指着镜头、盘的正面朝镜头（用户 11-10 定），见「八稿」一段。
// 一稿四案（11-10 草稿 1110-0639）、二稿三案（轮盘立在身后，预览 1110-0739 的 07～09）在 Git 历史里。
import { ASPECT_HALF_WIDTH, type Cam } from '@engine/core/机位.ts';
import { realNetherScene, realNetherPick } from '../../地点/真下界位置.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { ringRadius } from '../../界面/分圈.ts';
import type { DiscPlacement } from '../../界面/杖尖盘位姿.ts';
import { arrangeWheel } from '../../界面/轮盘法术.ts';
import type { CageGlowAppearance } from '../../特效/炼狱结界辉线.tsx';

export const aspect = { 宽: 1280, 高: 720 } as const;

export type Plan = {
  名: string;
  说明: string;
  cameraRig: Cam;
  /** 镜头朝向照 机位，整个平移到正对盘的圆心：圆心落在画面正中（五稿起，用户 11-10：「镜头应该放中间」） */
  wheelCentered?: boolean;
  /**
   * 六稿起（用户 11-10：「这个聚晶的面应该和法杖垂直」，手画是一个斜的椭圆、杖从左上伸到圆心）：盘垂直杖身，镜头从侧前方斜着看盘，
   * 机位由杖的方向反算（机位 里只用 lens，pos、tgt 不用）：
   * 扁 = 盘在画面里的宽高比（短轴 / 长轴 = 视线和杖身夹角的余弦，不算透视）；斜 = 杖身在画面上从左上指向右下、和水平成几度（椭圆的短轴就在这个方向上）；
   * 距 = 镜头到圆心几格；盘心 = 圆心落在画面的哪（宽、高的比例，左上角起）。镜头不滚转。
   * 带这一项的方案杖按握在手里的挂法画（角色/娘化亚波伦.tsx 的 握杖修正）；不带的是五稿及以前的旧案，照旧握法，画面不动
   */
  obliqueWheel?: { flatten: number; angleDeg: number; 距: number; wheelCenter: readonly [number, number] };
  /**
   * 八稿起（用户 11-10：「为什么亚波伦不能拿着法杖指向镜头？」「被指着的压迫感更强」，又贴大黑塔终结技的截图要仰拍、靠近）：盘心就是杖尖、盘垂直杖身、正面朝杖尖指的那一侧，
   * 镜头在盘的正面一侧、在她下方往上看。机位由杖尖和杖的方向反算（界面/指杖机位.ts；机位 里只用 lens）：
   * θ = 杖的方向和「盘心指向镜头」的夹角（度）；方位 = 镜头偏到杖的哪一侧（绕杖身的方位角，度）；距 = 镜头到盘心几格；盘心 = 圆心落在画面的哪（宽、高的比例，左上角起）；
   * 握偏 = 握点沿杖身往杖尾挪几格（角色/娘化亚波伦.tsx 的 握偏）。杖按握在手里的挂法画
   */
  pointWand?: { θ: number; azimuthDeg: number; 距: number; wheelCenter: readonly [number, number]; gripOffset?: number; /** 扫角度用：镜头对准盘心和她胸口的中点，不管 盘心 */ lookMid?: boolean };
  /** 背景换成导入的真实下界（地点/真下界.tsx，提亮那套光），她悬在熔岩海上空的选点（用户 11-10 定：导真实的、离地至少 30 格、背景看得清） */
  远景?: boolean;
  /** 只给她（连手里的杖）提亮暗部，场景不动（角色/防暗.tsx 的 抬，0～0.5；用户 11-10 定：人物太暗就单独给人物过一条亮度曲线） */
  figureBrighten?: number;
  yaBoLun: { 位: V3; yaw?: number; act: '站立' | '悬停'; /** 手摆的骨骼姿势，盖在动画上 */ bonePose: Record<string, BonePose> };
  wheel: {
    放: '有画面' | '全部';
    /** 盘面怎么朝向（界面/杖尖盘位姿.ts）；圆心总在杖尖。正对镜头 = 和这个方案的机位的画面平行 */
    placement: Omit<DiscPlacement, 'facing'> & { facing: DiscPlacement['facing'] | '正对镜头' };
    /** 一个 GUI 像素几格 */
    cellsPerPixel: number;
    /** 「全部」档里不进齐放的图标亮度（正片默认 0.35） */
    dimLevel?: number;
    /** 盘画在她和地形之后（默认是之前）：盘在她身前时用，半透明的带子才盖得到她身上 */
    wheelInFront?: boolean;
    /** 盘顺着镜头到杖尖的视线往后退几格（画面上圆心还压在杖尖）：盘正对镜头又要整个在她身后时用，不然盘面切过她的身子、图标压到脸上 */
    backOff?: number;
  };
  /** 不给就不出镜（五稿起，用户 11-10：「我什么时候让史蒂夫出镜了？」） */
  steve?: { 位: V3; /** 看哪（默认看她的头） */ 看?: V3 };
  /** 炼狱结界：本片加粗发光的辉线（特效/炼狱结界辉线.tsx，用户 11-10 定「加粗 并且加一个发光特效」），外观不另给就用它的默认。中心、半径系数（原版 5.89，顶点离中心 = 系数 × 1.647 格）、转到第几秒的样子 */
  cage?: { 心: V3; radiusFactor: number; 秒: number; /** 只在这个方案里改辉线的外观（不给就是辉线的默认） */ appearance?: Partial<CageGlowAppearance> };
  /** 杖头加一团加色的光（封面的修饰，游戏里没有） */
  wandTipGlow?: boolean;
  /** 裁切参考框（画面宽的比例）：4:3 和 3:4 的框以这个横坐标为中线，上下顶满 */
  cropCenterLine: number;
};

// 两腿一前一后微屈
const legs: Record<string, BonePose> = {
  RightLeg: { rot: [-12, 0, 0] },
  RightLowerLeg: { rot: [28, 0, 0] },
  LeftLeg: { rot: [6, 0, 0] },
  LeftLowerLeg: { rot: [10, 0, 0] },
};
// 手垂着时杖头朝前、握点在杖身正中（物品/下界魔杖.tsx）；手腕 rot.x 90 让杖顺着手臂伸出去，rot.y 90 让杖和手臂垂直、竖起来
const leftArmSpread: Record<string, BonePose> = { LeftArm: { rot: [0, 0, -50] }, LeftForeArm: { rot: [-20, 0, 0] } };
// 右臂往外上方斜举，手腕转 90 度让杖顺着手臂伸出去：杖头在头后大光环的外侧
const diagRaiseWand: Record<string, BonePose> = { ...legs, ...leftArmSpread, RightArm: { rot: [0, 0, 118] }, RightHand: { rot: [90, 0, 0] } };
// 右臂往外伸直，杖顺着手臂指出去。平 = 手臂水平，下 = 手臂往下压约 20 度（rot.z 70 是水平）
const sidePoint = (pressDown: boolean): Record<string, BonePose> => ({ ...legs, ...leftArmSpread, RightArm: { rot: [-10, 0, pressDown ? 52 : 75] }, RightHand: { rot: [90, 0, 0] } });
// 右臂往外略往前抬到肩上，杖竖在头侧、杖头高过帽顶
const raiseOverhead: Record<string, BonePose> = { ...legs, ...leftArmSpread, RightArm: { rot: [-15, 0, 100] }, RightHand: { rot: [0, 90, -15] } };

// ── 四稿（用户 11-10 看了三稿说「亚波伦应该在左上角，指向右下角，面板面向摄像头」）──
// 杖摆在画面平面里、从左上指向右下（和水平成 30 度），盘正对镜头：杖不缩短，盘是正圆、图标是正的。
// 右臂的角度是拿 持杖位姿 对着这个机位的画面平面搜出来的，换机位的朝向要重搜；身子不用包里 fly 的侧倒，用 idle 加手摆的腿。
const draft4Rig: Cam = { pos: [0, -5.2, 1.2], tgt: [0.1, 2.3, 2.8], lens: 22 };
// 直指：身子朝她的左前（画面右边）转 40 度（yaw 220），右臂伸直、杖顺着手臂伸出去，头转回镜头。杖尾那一半压在袖子上，手到杖头那一半露在外面
const straightPoint: Record<string, BonePose> = { ...legs, ...leftArmSpread, RightArm: { rot: [-28, 0, -72] }, RightHand: { rot: [90, 0, 0] }, Head: { rot: [0, 25, 0] } };
// 横持：身子转 15 度（yaw 195）、整个侧倾 12 度，右手在胯前握杖，杖和手臂不在一条线上：杖尾从她右肩外侧伸出去，杖头从左胯外侧伸出去
const holdHoriz: Record<string, BonePose> = { ...legs, ...leftArmSpread, AllBody: { rot: [0, 0, 12] }, RightArm: { rot: [-39, -32, 10] }, RightForeArm: { rot: [-13, 0, 0] }, RightHand: { rot: [-48, -38, 88] } };
// 结界辉线只在封面里压暗（辉线的默认不动）：三稿里它的红晕比轮盘抢眼。芯收细、颜色压到暗红，晕收窄、压到默认的两成
const coverCage: Partial<CageGlowAppearance> = { coreWidth: 0.11, haloWidth: 0.6, haloStrength: 0.18, hotspotScale: 1.4, hotspotHaloScale: 1, coreColor: [0.95, 0.38, 0.2], coreEdgeColor: [0.62, 0.05, 0.04], haloColor: [0.8, 0.05, 0.04] };

// ── 五稿（用户 11-10 看了四稿说「你这镜头不对，位置不对啊，镜头应该放中间啊。我什么时候让史蒂夫出镜了？」）──
// 史蒂夫、结界不出镜；镜头朝向照四稿机位（手臂角度不用重搜），平移到正对盘心（盘心居中），盘在画面正中张满。
// 她在盘的左上、杖尖点在盘心：她离画面中心多远由手到杖尖那一段（1.4 格）定。她抬高到盘的下沿不扎进地里。
// 陡指：同直指，杖和水平成 45 度（直指是 30 度），她更靠上、身子不压到圆心左边
const steepPoint: Record<string, BonePose> = { ...legs, ...leftArmSpread, RightArm: { rot: [-20, 0, -60] }, RightHand: { rot: [90, 0, 0] }, Head: { rot: [0, 25, 0] } };
// 正身指：身子只转 20 度（yaw 200），右臂伸直斜过身前，杖和水平成 45 度
const uprightPoint: Record<string, BonePose> = { ...legs, ...leftArmSpread, RightArm: { rot: [-6, 0, -64] }, RightHand: { rot: [90, 0, 0] }, Head: { rot: [0, 12, 0] } };

// ── 六稿（用户 11-10 看了癸说「就用 71 的」「这个聚晶的面应该和法杖垂直」「这法杖都没有拿到手上」）──
// 只出三圈 71 个。盘垂直杖身、圆心在杖尖，盘的正面朝她这一侧（摆法 反面）：镜头在她这一侧，看到的图标是正的。
// 镜头看得到她的脸、又看得到盘朝她的那一面：她的身子不朝着盘，侧对镜头（右半身朝镜头），右臂往前伸，杖从手里往她左前下方指出去（往画面右下、往画面里），头转向镜头。
// 手腕以绕小臂长轴转为主（rot.x 16～33 度），杖从手的侧面穿过去，握着的手在镜头这一侧、看得见。
// 右臂的角度是拿 持杖位姿 按杖的方向（她自己的坐标里：往前、往左 30 度、往下 22 或 37 度）搜出来的。
const draft6Legs: Record<string, BonePose> = { RightLeg: { rot: [-18, 0, 0] }, RightLowerLeg: { rot: [34, 0, 0] }, LeftLeg: { rot: [8, 0, 0] }, LeftLowerLeg: { rot: [14, 0, 0] } };
const draft6LeftArm: Record<string, BonePose> = { LeftArm: { rot: [20, 0, -35] }, LeftForeArm: { rot: [-25, 0, 0] } };
// 前指：右臂往前伸直、略低于肩，杖往下 22 度
const frontPoint = (headTurn: number): Record<string, BonePose> => ({ ...draft6Legs, ...draft6LeftArm, RightArm: { rot: [-61, 25, -1.25] }, RightForeArm: { rot: [-3.75, 0, 0] }, RightHand: { rot: [33, -90, 0] }, Head: { rot: [0, headTurn, 0] } });
// 斜下指：手抬到肩高、往前伸，杖往下 37 度
const diagDownPoint = (headTurn: number): Record<string, BonePose> => ({ ...draft6Legs, ...draft6LeftArm, RightArm: { rot: [-84.25, 10, -40] }, RightForeArm: { rot: [-32, 0, 0] }, RightHand: { rot: [16, 196, 0] }, Head: { rot: [0, headTurn, 0] } });
const draft6Wheel: Pick<Plan['wheel'], '放' | 'placement'> = { 放: '有画面', placement: { facing: '垂直杖身', reverseSide: true, tipOffset: 0.1 } };
const draft6Shot = (lens: number): Cam => ({ pos: [0, 0, 0], tgt: [0, 1, 0], lens });

// ── 八稿（用户 11-10 看了六稿子说「为什么亚波伦不能拿着那个法杖指向镜头？为什么要从背后偷窥她？被指着的压迫感更强」「这个聚晶圆盘的朝向就不对」，
// 又贴《崩坏：星穹铁道》大黑塔终结技的截图：「我想要的构图就是这样的，只不过只有最上方的一个，并且靠得近一点」）──
// 大仰拍：镜头在她下方（被她指着的人的位置）往上看，她浮在高处、身子前倾俯视镜头，右臂伸直、杖顺着手臂朝下指过来（握在杖尾那一头，伸到身前的一截长）。
// 盘心 = 杖尖，盘垂直杖身，正面朝杖尖指的那一侧（背对她）：镜头在正面一侧，图标不镜像，她在盘后面。三案只差 θ（杖和「盘心指向镜头」的夹角）：35、55、70 度，
// θ 越大盘越扁、她越往盘外露。机位由 界面/指杖机位.ts 反算，姿势（右臂、身子倾多少）和方位角是拿它的 画面自检 搜出来的；说明里的数是 画面自检 算的，八稿.test.ts 核对它们和标准。
// 七稿（θ = 0，她整个被盘盖住）没做完，没进这张表。
/** 三圈 71 个的盘外沿的半径（GUI 像素） */
export const draft8WheelOuterPx = ringRadius(arrangeWheel({ 放: '有画面' }).cellsPerRing.length - 1).outerRadius;
const draft8LeftArm: Record<string, BonePose> = { LeftArm: { rot: [10, 0, -40] }, LeftForeArm: { rot: [-20, 0, 0] } };
/** 倾 = 整个身子往前倾几度，滚 = 往她右边（画面左边）侧倾几度（负），臂 = 右上臂的转角；手腕转 90 度让杖顺着手臂伸出去 */
const topPoint = (tilt: number, roll: number, armRot: [number, number, number], headRot: [number, number, number] = [0, 0, 0]): Record<string, BonePose> => ({
  ...draft6Legs,
  ...draft8LeftArm,
  AllBody: { rot: [tilt, 0, roll] },
  RightArm: { rot: armRot },
  RightHand: { rot: [90, 0, 0] },
  Head: { rot: headRot },
});
const draft8Plan = (name: string, note: string, settings: { pointWand: NonNullable<Plan['pointWand']>; lens: number; wheelRadius: number; 位: V3; yaw: number; bonePose: Record<string, BonePose> }): Plan => ({
  名: name,
  说明: note,
  cameraRig: draft6Shot(settings.lens),
  pointWand: settings.pointWand,
  yaBoLun: { 位: settings.位, yaw: settings.yaw, act: '站立', bonePose: settings.bonePose },
  // 圆心就在杖尖（离尖 0）；盘在她身前，画在她之后
  wheel: { 放: '有画面', placement: { facing: '垂直杖身' }, cellsPerPixel: settings.wheelRadius / draft8WheelOuterPx, wheelInFront: true },
  wandTipGlow: true,
  cropCenterLine: 0.5,
});

export const plans: readonly Plan[] = [
  {
    名: '三稿甲 盘和杖身垂直，杖平指',
    说明: '三圈 71 个，盘直径 6.5 格。她侧身把杖平伸出去，盘像一把撑开的伞立在杖尖，斜对镜头；史蒂夫和结界在盘后面的地上',
    cameraRig: { pos: [0.9, -6.5, 2.0], tgt: [0.9, 0, 3.4], lens: 22 },
    yaBoLun: { 位: [1.9, 0, 2.5], yaw: 135, act: '站立', bonePose: sidePoint(false) },
    wheel: { 放: '有画面', placement: { facing: '垂直杖身', tipOffset: 0.15 }, cellsPerPixel: 0.027, wheelInFront: true },
    steve: { 位: [-5, 8, 0] },
    cage: { 心: [-5, 8, 0.9], radiusFactor: 2.1, 秒: 0.9 },
    cropCenterLine: 0.5,
  },
  {
    名: '三稿乙 盘正对镜头，圆心钉在杖尖',
    说明: '三圈 71 个，盘直径 6.2 格。她斜举杖，杖头在头后大光环外侧；盘和画面平行、是正圆，她在盘前面偏右下',
    cameraRig: { pos: [0, -7.5, 2.4], tgt: [0.1, 0, 4.0], lens: 22 },
    yaBoLun: { 位: [1.3, 0, 2.3], act: '站立', bonePose: diagRaiseWand },
    wheel: { 放: '有画面', placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.026 },
    steve: { 位: [-3.5, 4, 0] },
    cropCenterLine: 0.5,
  },
  {
    名: '三稿丙 杖举过头，盘张在头顶',
    说明: '四圈 128 个全亮，盘直径 9 格。贴近仰拍（16 毫米），盘接近水平、略朝镜头倾，近的一半出画；史蒂夫和结界在右下',
    cameraRig: { pos: [0, -4.8, 1.2], tgt: [-0.1, 0, 3.6], lens: 16 },
    yaBoLun: { 位: [0.4, 0, 2.3], act: '站立', bonePose: raiseOverhead },
    wheel: { 放: '全部', placement: { facing: { normal: [0, -0.17, -0.98] }, tipOffset: 0.15 }, cellsPerPixel: 0.03, dimLevel: 1 },
    steve: { 位: [3.2, 10, 0] },
    cage: { 心: [3.2, 10, 0.9], radiusFactor: 2.1, 秒: 0.9 },
    cropCenterLine: 0.5,
  },
  {
    名: '三稿丁 盘和杖身垂直，杖朝下指着史蒂夫',
    说明: '三圈 71 个，盘直径 7.2 格。她在高处把杖朝斜下方指向结界里的史蒂夫，盘斜着朝下对着他；杖头加了一团光',
    cameraRig: { pos: [1.2, -6.5, 1.6], tgt: [0.7, 0, 3.2], lens: 22 },
    yaBoLun: { 位: [1.9, 0, 3.1], yaw: 135, act: '站立', bonePose: sidePoint(true) },
    wheel: { 放: '有画面', placement: { facing: '垂直杖身', tipOffset: 0.15 }, cellsPerPixel: 0.03, wheelInFront: true },
    steve: { 位: [-5.5, 6.2, 0] },
    cage: { 心: [-5.5, 6.2, 0.9], radiusFactor: 2.1, 秒: 0.9 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '四稿戊 伸臂直指，三圈 71 个',
    说明: '她在左上，身子朝画面右边转 40 度、脸转回镜头，右臂伸直、杖顺着手臂指向右下结界里的史蒂夫；盘正对镜头、圆心在杖尖，她叠在盘的左上角前面',
    cameraRig: draft4Rig,
    yaBoLun: { 位: [-2.14, 0, 1.95], yaw: 220, act: '站立', bonePose: straightPoint },
    wheel: { 放: '有画面', placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.0235, backOff: 2 },
    steve: { 位: [5.2, 7.2, 0] },
    cage: { 心: [5.2, 7.2, 0.9], radiusFactor: 1.6, 秒: 0.9, appearance: coverCage },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '四稿己 伸臂直指，四圈 128 个全亮',
    说明: '姿势、机位同戊；盘换成四圈 128 个全亮，盘的大小不变、图标小一号',
    cameraRig: draft4Rig,
    yaBoLun: { 位: [-2.14, 0, 1.95], yaw: 220, act: '站立', bonePose: straightPoint },
    wheel: { 放: '全部', dimLevel: 1, placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.0188, backOff: 2 },
    steve: { 位: [5.2, 7.2, 0] },
    cage: { 心: [5.2, 7.2, 0.9], radiusFactor: 1.6, 秒: 0.9, appearance: coverCage },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '四稿庚 杖横过身前，三圈 71 个',
    说明: '她几乎正对镜头（转 15 度）、身子侧倾 12 度，右手在胯前握杖，杖尾在左上、杖头在右下，杖身横过身前；盘同戊',
    cameraRig: draft4Rig,
    yaBoLun: { 位: [-2.14, 0, 1.95], yaw: 195, act: '站立', bonePose: holdHoriz },
    wheel: { 放: '有画面', placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.0235, backOff: 2 },
    steve: { 位: [5.2, 7.2, 0] },
    cage: { 心: [5.2, 7.2, 0.9], radiusFactor: 1.6, 秒: 0.9, appearance: coverCage },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '五稿辛 伸臂直指 30 度，三圈 71 个',
    说明: '史蒂夫、结界不出镜，镜头正对盘心。姿势同戊（身子转 40 度、脸转回镜头，右臂伸直）；盘直径约画面高的 83%',
    cameraRig: draft4Rig,
    wheelCentered: true,
    yaBoLun: { 位: [0, 0, 3.3], yaw: 220, act: '站立', bonePose: straightPoint },
    wheel: { 放: '有画面', placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.026, backOff: 2 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '五稿壬 伸臂直指 45 度，四圈 128 个全亮',
    说明: '同辛，杖更陡（45 度），她更靠上；盘换成四圈 128 个全亮，直径约画面高的 86%',
    cameraRig: draft4Rig,
    wheelCentered: true,
    yaBoLun: { 位: [0, 0, 3.7], yaw: 220, act: '站立', bonePose: steepPoint },
    wheel: { 放: '全部', dimLevel: 1, placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.0216, backOff: 2 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '五稿癸 身子更正，杖 45 度，三圈 71 个',
    说明: '身子只转 20 度、近乎正对镜头，右臂伸直斜过身前，杖 45 度指向盘心；三圈 71 个，盘直径约画面高的 87%',
    cameraRig: draft4Rig,
    wheelCentered: true,
    yaBoLun: { 位: [0, 0, 3.7], yaw: 200, act: '站立', bonePose: uprightPoint },
    wheel: { 放: '有画面', placement: { facing: '正对镜头', tipOffset: 0.15 }, cellsPerPixel: 0.0285, backOff: 2 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '六稿子 盘垂直杖身，竖长椭圆，宽高比 0.65',
    说明: '三圈 71 个。她侧身、右臂前伸握杖，杖往画面右下和画面里指（画面上约 35 度），盘垂直杖身张在杖尖、正面朝她这一侧；镜头离圆心 8 格（22 毫米）、略仰，整个盘在画面里',
    cameraRig: draft6Shot(22),
    obliqueWheel: { flatten: 0.65, angleDeg: 35, 距: 8, wheelCenter: [0.56, 0.52] },
    yaBoLun: { 位: [0, 0, 4.2], yaw: 280, act: '站立', bonePose: frontPoint(55) },
    wheel: { ...draft6Wheel, cellsPerPixel: 0.024 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '六稿丑 杖更陡，宽高比 0.6，镜头近、广角',
    说明: '手抬到肩高、杖往下 37 度（画面上约 55 度），她在盘心的左上方；镜头略仰，镜头离圆心 5.5 格、16 毫米，她在前景更大，盘的右下出画；盘更扁（0.6）',
    cameraRig: draft6Shot(16),
    obliqueWheel: { flatten: 0.6, angleDeg: 55, 距: 5.5, wheelCenter: [0.6, 0.6] },
    yaBoLun: { 位: [0, 0, 4.2], yaw: 285, act: '站立', bonePose: diagDownPoint(60) },
    wheel: { ...draft6Wheel, cellsPerPixel: 0.024 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  {
    名: '六稿寅 盘小一号，宽高比 0.7',
    说明: '手抬到肩高、杖往下 37 度（画面上约 45 度）；盘小一号（直径约 4.6 格），她相对盘更大、更靠盘的边；盘更圆（0.7），镜头离圆心 5.5 格（20 毫米）、略俯',
    cameraRig: draft6Shot(20),
    obliqueWheel: { flatten: 0.7, angleDeg: 45, 距: 5.5, wheelCenter: [0.57, 0.55] },
    yaBoLun: { 位: [0, 0, 4.2], yaw: 275, act: '站立', bonePose: diagDownPoint(55) },
    wheel: { ...draft6Wheel, cellsPerPixel: 0.019 },
    wandTipGlow: true,
    cropCenterLine: 0.5,
  },
  draft8Plan('八稿卯 仰拍，θ 35 度', '镜头在她下方约 1.8 格处往上看，她身子直立、低头俯视镜头，右臂伸直握着杖尾朝镜头指下来；θ 最小，盘接近正圆，她大半个人隔着盘。自检：θ 35°、(镜头−盘心)·d 2.15 格；仰角 45°、镜头比她脚低 1.8 格、杖竖直分量 -0.73、脸比脚远 1.1 格、她占画面高 50%；脸 39%,36%、盘心 51%,56%；杖向右下 25°、短轴偏杖 0.1°、短长比 0.84、长轴离竖直 25°；盘在画内 100%、盘高是她的 1.82 倍；身·镜头 0.59、脸·镜头 0.92；脸隔着盘（离盘边 0.37 格）', {
    pointWand: { θ: 35, azimuthDeg: 100, 距: 2.63, wheelCenter: [0.51, 0.56], gripOffset: 0.85 },
    lens: 22,
    wheelRadius: 1.1,
    位: [0, 0, 3.38],
    yaw: 177,
    bonePose: topPoint(0, -10, [-30, 30, -60], [30, 0, 0]),
  }),
  draft8Plan('八稿辰 仰拍，θ 55 度', '同卯，镜头再往杖的侧面偏 20 度：盘是竖长略斜的椭圆，她的脸在盘的左上外面。自检：θ 55°、(镜头−盘心)·d 1.71 格；仰角 43°、镜头比她脚低 1.7 格、杖竖直分量 -0.70、脸比脚远 1.0 格、她占画面高 50%；脸 38%,35%、盘心 55%,62%；杖向右下 29°、短轴偏杖 0.2°、短长比 0.60、长轴离竖直 29°；盘在画内 100%、盘高是她的 1.57 倍；身·镜头 0.60、脸·镜头 0.92；脸在盘外 0.19 格', {
    pointWand: { θ: 55, azimuthDeg: 110, 距: 2.98, wheelCenter: [0.55, 0.62], gripOffset: 0.85 },
    lens: 22,
    wheelRadius: 1.11,
    位: [0, 0, 3.35],
    yaw: 177,
    bonePose: topPoint(0, -10, [-15, 30, -60], [30, 0, 0]),
  }),
  draft8Plan('八稿巳 仰拍，θ 70 度', '镜头偏到杖的侧面 70 度：盘最扁，她整个上身在盘外，杖从她胸前斜着伸到圆心。自检：θ 70°、(镜头−盘心)·d 1.17 格；仰角 47°、镜头比她脚低 2.1 格、杖竖直分量 -0.59、脸比脚远 1.0 格、她占画面高 50%；脸 33%,27%、盘心 51%,56%；杖向右下 31°、短轴偏杖 0.1°、短长比 0.37、长轴离竖直 31°；盘在画内 100%、盘高是她的 1.82 倍；身·镜头 0.56、脸·镜头 0.90；脸在盘外 0.42 格', {
    pointWand: { θ: 70, azimuthDeg: 130, 距: 3.42, wheelCenter: [0.51, 0.56], gripOffset: 0.85 },
    lens: 22,
    wheelRadius: 1.49,
    位: [0, 0, 3.75],
    yaw: 204,
    bonePose: topPoint(0, -10, [-15, 0, -60], [30, 0, 0]),
  }),
  // 扫角度（用户 11-10：「-180 度到 180 度之间都间隔来一段，我看哪个比较好」）：姿势、距离同辰，只变 θ，每 30 度一张；负的是镜头偏到杖的另一侧，绝对值过 90 镜头到了盘的背面
  // 末尾四张是 -10 度（用户挑的）配人物提亮 0.1、0.15、0.2、0.3，角度和别的都不变
  ...([-30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30].map((θ) => [θ, 0]) as [number, number][]).concat([0.1, 0.15, 0.2, 0.3].map((lift) => [-10, lift])).map(([θ, lift]): Plan => {
    // 盘占画面高的九成（用户 11-10 定）：盘心放画面正中，按 θ 把距离定到盘的竖向直径 = 0.9 个画面高（斜着时竖向按一半的倾斜量折算）
    const distance = (1.11 * Math.sqrt(1 - 0.5 * Math.sin((θ * Math.PI) / 180) ** 2)) / ((0.965 * ASPECT_HALF_WIDTH) / 22 / (aspect.宽 / aspect.高));
    const plan = draft8Plan(`八稿扫 θ ${θ} 度${lift ? `，人物提亮 ${lift}` : ''}`, `姿势、距离同辰，只变 θ = ${θ} 度`, {
      pointWand: { θ, azimuthDeg: 135, 距: distance, wheelCenter: [0.5, 0.5], gripOffset: 0.85 },
      lens: 22,
      wheelRadius: 1.11,
      位: realNetherScene(realNetherPick.x, realNetherPick.y, realNetherPick.z),
      yaw: 177,
      // 右臂朝身前伸直、杖顺着手臂指出去（不横过身子，免得看着像左手拿）；头朝镜头转，最多 70 度
      bonePose: { ...draft6Legs, AllBody: { rot: [10, 0, 0] }, RightArm: { rot: [-65, 0, 0] }, RightHand: { rot: [90, 0, 0] }, LeftArm: { rot: [15, 0, 0] }, Head: { rot: [20, Math.max(-70, Math.min(70, θ)), 0] } },
    });
    return { ...plan, 远景: true, ...(lift ? { figureBrighten: lift } : {}), wheel: { ...plan.wheel, wheelInFront: Math.abs(θ) < 90 } };
  }),
];
