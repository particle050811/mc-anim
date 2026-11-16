// 魔杖细做核对的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。四根杖：原版（Goety 的 goety:nether_staff）和细做的三个候选
// （物品/下界魔杖细做.tsx）。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），机位在南边朝北看。
import type { Cam } from '@engine/core/机位.ts';

export const aspect = { width: 1280, height: 720 } as const;

export type Variant = '原版' | '甲' | '乙' | '丙';
export const variants: readonly Variant[] = ['原版', '甲', '乙', '丙'];
export const candidateLabels = ['甲', '乙', '丙'] as const;

export type View = {
  name: string;
  note?: string;
  /** 灰 = 中性灰底、白光；暗红 = 下界的暗红底，光照封面草稿的配法 */
  bottomBackground: '灰' | '暗红';
  pictureMode:
    | { type: '并排' }
    /** 杖头近看：杖立着，机位贴到杖头 */
    | { type: '杖头'; variant: Variant }
    /** 杆和握把近看：杖横躺（杖头朝右），段 = 看哪一截 */
    | { type: '杆'; variant: Variant; segment: '握把' | '上段' }
    /** 娘化亚波伦站着、默认斜举（角色/娘化亚波伦.tsx 的 斜举.站） */
    | { type: '持杖'; variant: Variant; cameraRig: '正面' | '斜侧' }
    /** 封面式中景：她在画面左上悬着，杖指向右下（用户 11-10 定的封面摆法），人占画面高约三分之一 */
    | { type: '中景'; variant: Variant };
};

/** 并排：四根杖立着，杖尾落在 z = 0，按拿在她手上的大小摆（0.7 倍），横向间隔 并排间隔 格 */
export const sideBySideGap = 0.95;
export const sideBySideRig: Cam = { pos: [0, -9.4, 1.22], tgt: [0, 0, 1.22], lens: 62 };
/** 杖头近看：杖立在原点（0.7 倍），机位在斜前上方，看点跟着各款芯的高度 */
export const wandHeadRig = (coreHeight: number): Cam => ({ pos: [-0.55, -2.15, coreHeight + 0.32], tgt: [0, 0, coreHeight + 0.02], lens: 60 });
/** 杆近看：杖横躺在 z = 0 的高度、杖尾在原点、杖头朝 +x，机位正对 中 这一处 */
export const shaftRig = (centerX: number): Cam => ({ pos: [centerX - 0.25, -1.6, 0.42], tgt: [centerX, 0, 0], lens: 60 });
// 全身连斜举的杖头都收进来
export const holdingRigs: Record<'正面' | '斜侧', Cam> = {
  正面: { pos: [-0.35, -9, 1.7], tgt: [-0.35, 0, 1.5], lens: 42 },
  斜侧: { pos: [-5.6, -7, 2.4], tgt: [-0.3, 0, 1.5], lens: 42 },
};
/** 中景：她在左上，身子朝画面右边转、脸转回镜头，右臂伸直、杖顺着手臂指向右下（封面草稿四稿戊的摆法） */
export const midShot = {
  cameraRig: { pos: [0, -9.5, 2.3], tgt: [0, 0, 2.3], lens: 34 } as Cam,
  位: [-1.5, 0, 2.0] as const,
  yaw: 250,
};

const notes = {
  甲: '甲 忠实细做：原版的结构按真器物重做。黑曜石细杆（铁箍、缠丝握把），铁托上四根弯铁条和两道箍围成笼，里面一颗熔融的晶体，四角各一片外张的锻刃。全长 44 像素（她身高的 0.96 倍）',
  乙: '乙 下界器物：黑杆镶金。金丝菱格握把，上段有发光的熔岩裂纹，颈上两道金箍夹一圈烈焰柱；黑曜杯上六爪的金冠围着一颗熔核。全长 45 像素（1.0 倍）',
  丙: '丙 权杖：金球节上托一弯朝上开口的黑曜新月（金尖、金线、外沿带刺），月心悬一颗晶体，前后各一只金爪；绳纹握把。全长 52 像素（1.15 倍）',
  原版: '原版：Goety 的模型照搬，1 粗的杆、5 宽的杖头，全长 31 像素（0.68 倍）',
} as const;

export const views: readonly View[] = [
  { name: '并排-灰底', note: '左起：原版、甲、乙、丙，按拿在她手上的大小', bottomBackground: '灰', pictureMode: { type: '并排' } },
  { name: '并排-暗红底', note: '左起：原版、甲、乙、丙', bottomBackground: '暗红', pictureMode: { type: '并排' } },
  ...candidateLabels.map((k): View => ({ name: `杖头近看-${k}`, note: notes[k], bottomBackground: '灰', pictureMode: { type: '杖头', variant: k } })),
  ...candidateLabels.map((k): View => ({ name: `杖头近看-${k}-暗红底`, note: notes[k], bottomBackground: '暗红', pictureMode: { type: '杖头', variant: k } })),
  ...candidateLabels.flatMap((k): View[] => [
    { name: `握把近看-${k}`, note: notes[k], bottomBackground: '灰', pictureMode: { type: '杆', variant: k, segment: '握把' } },
    { name: `上段近看-${k}`, note: notes[k], bottomBackground: '灰', pictureMode: { type: '杆', variant: k, segment: '上段' } },
  ]),
  ...candidateLabels.flatMap((k): View[] => [
    { name: `持杖-${k}-正面`, note: notes[k], bottomBackground: '灰', pictureMode: { type: '持杖', variant: k, cameraRig: '正面' } },
    { name: `持杖-${k}-斜侧`, note: notes[k], bottomBackground: '灰', pictureMode: { type: '持杖', variant: k, cameraRig: '斜侧' } },
  ]),
  ...variants.map((k): View => ({ name: `中景-${k}`, note: notes[k], bottomBackground: '暗红', pictureMode: { type: '中景', variant: k } })),
  { name: '杖头近看-原版', note: notes.原版, bottomBackground: '灰', pictureMode: { type: '杖头', variant: '原版' } },
  { name: '持杖-原版-正面', note: notes.原版, bottomBackground: '灰', pictureMode: { type: '持杖', variant: '原版', cameraRig: '正面' } },
];
