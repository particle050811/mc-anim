// 隐世之境重逢核对的视图表（纯数据，段.ts 也读）：一帧一个视图，都是 1280×720。坐标同 场/2-隐世之境/参数.ts（网格本地，Z 朝上）。
// 机位不给就是 参数 的门口机位（49.96、封面帧）；身子朝向不给就照 参数。
import type { V3 } from '@engine/model/parts.tsx';

export type View = {
  name: string;
  cameraRig?: { 眼: V3; 看: V3; fov: number; nearClip?: number };
  hasLiYing?: boolean;
  bodyFacing?: number;
  doorLight?: boolean;
  /** 她头顶的气泡（参数 的 气泡字，按机位挂） */
  showBubble?: boolean;
  /** 左下的聊天：片 = 成片画幅那一版封面的原版位置像素聊天栏（缩放 6，同 2-摇铃 片里那一行），封面 = 封面版聊天行 */
  chatMode?: '片' | '封面';
  /** 盖上 B 站封面的安全区（4:3 取中间、底部 20%、右下角时长角标） */
  safeArea?: boolean;
  /** 平面图上标出机位、视线、她 */
  showAnnotation?: boolean;
};

// 从主厅正上方往下看（近裁剪面切掉二楼和屋顶）
const floorPlan = { 眼: [11, -11.5, 40] as V3, 看: [11, -11.49, 0] as V3, fov: 24, nearClip: 34.2 };
// 窗外远山（场/2-隐世之境/远山.ts）：从门口收窄了看东窗（东窗 x 17.5、y −14～−11、z 1～4），看清窗里那一小块的山、樱花林、雾和天；
// 再从屋顶上面往东看一大片（窗外近处那几棵树冠挡着，站低了看不远），看坡上的树有没有悬空、雾淡得对不对
const doorLookEastWindow = { 眼: [6.8, -10.5, 1.62] as V3, 看: [17.5, -12.5, 2.3] as V3, fov: 20 };
const roofLookEast = { 眼: [18, -12.5, 18] as V3, 看: [80, -22, 8] as V3, fov: 70 };
// 南头地洞（楼梯口）：站在洞北边的栏杆前往下看，洞底是暗色封底，不能露出草地
const lookGroundHole = { 眼: [14, -15.1, 1.62] as V3, 看: [14, -16.6, -0.8] as V3, fov: 70 };

export const views: readonly View[] = [
  { name: '门口-带她', hasLiYing: true },
  { name: '门口-去掉她', hasLiYing: false },
  { name: '门口-成片画幅的封面：气泡、原版聊天栏（片里这一帧不挂）', hasLiYing: true, showBubble: true, chatMode: '片' },
  { name: '封面：气泡、封面聊天行', hasLiYing: true, showBubble: true, chatMode: '封面' },
  { name: '封面-安全区', hasLiYing: true, showBubble: true, chatMode: '封面', safeArea: true },
  { name: '对比-身子朝向-35（侧到 90°）', hasLiYing: true, showBubble: true, bodyFacing: -35 },
  { name: '对比-不加门光', hasLiYing: true, doorLight: false },
  { name: '平面图', hasLiYing: true, cameraRig: floorPlan, showAnnotation: true },
  { name: '窗外-门口望东窗（视角 20）', hasLiYing: false, cameraRig: doorLookEastWindow },
  { name: '窗外-屋顶往东看', hasLiYing: false, cameraRig: roofLookEast },
  { name: '南头地洞', hasLiYing: false, cameraRig: lookGroundHole },
];
