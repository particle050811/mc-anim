// 三渲二核对的视图表（纯数据，段.ts 也读）：一帧一个视图。坐标用隐世之境一楼的网格本地坐标（Z 朝上，见 地点/隐世之境一楼.tsx）。
// 场景：一楼主厅，魔法酒狐坐在模板里女仆的位置、面朝南；九胡站在她东边当玩家的替身（侧面里正对镜头，透视里侧过来看她）（史蒂夫还没做）；她西边一只箱子（贴图方盒，不描边）、面前地上一块蛋糕（物品贴图）。
// 侧面：正交像素机位从南往北看，主厅南头（y < −16 的方块）藏掉、切口补面，就是门机位那种侧剖面。透视：在主厅东南角往她那边看。
// 一楼机位：游戏截图 截图/隐世之境/一楼机位 的机位，左半边平涂、右半边游戏截图，比贴图颜色。
import type { V3 } from '@engine/model/parts.tsx';
import type { ToneName } from '../../色板.ts';

export type View = {
  名: string;
  cameraRig: '侧面' | '透视' | '一楼机位';
  /** 侧面的顶面像素（见 engine/三渲二/机位.tsx），不给用 画风.ts 的 正交顶面 */
  topDepth?: number;
  /** 描边宽（成片像素），不给 = 不描 */
  outlineWidth?: number;
  /** 盖整片后期 */
  withPost?: boolean;
  /** 不给 = 夏日白天 */
  tone?: ToneName;
  /** 不平涂、照原材质受光（成片灯 一楼灯光），对比用 */
  原样?: boolean;
  /** 主厅的灯笼、蜡烛当发光区（不乘色调） */
  lampGlow?: boolean;
  /** 留着方块网格的平滑 AO（平涂默认去掉），对比用 */
  AO?: boolean;
  /** 魔法酒狐放大到一个贴图像素几个成片像素（按她模型里最多的 0.9 单位一个贴图像素算），对比用；不给 = 原大小 */
  herTexturePixel?: number;
};

export const sideLookAt: V3 = [11.5, -10.5, 3];
export const perspectiveRig = { 眼: [14.5, -14, 2.6] as V3, 看: [11.5, -10.5, 0.9] as V3, fov: 55 };
export const firstFloorRig = { 眼: [11.5, -12.5, 1.6825] as V3, 看: [11.5, -10.5, 0.8] as V3, fov: 70 };

const grades: ToneName[] = ['雨后暖阳', '日落', '雷雨', '夜', '末地', '归隐之地', '褪色', '现实'];

export const views: readonly View[] = [
  { 名: '侧面-平涂', cameraRig: '侧面' },
  { 名: '侧面-平涂-描边6', cameraRig: '侧面', outlineWidth: 6 },
  { 名: '侧面-平涂-描边3', cameraRig: '侧面', outlineWidth: 3 },
  { 名: '侧面-平涂-描边6-后期', cameraRig: '侧面', outlineWidth: 6, withPost: true },
  { 名: '侧面-平涂-后期', cameraRig: '侧面', withPost: true },
  { 名: '侧面-纯侧面-描边6', cameraRig: '侧面', topDepth: 0, outlineWidth: 6 },
  { 名: '侧面-原样受光', cameraRig: '侧面', 原样: true },
  { 名: '透视-平涂', cameraRig: '透视' },
  { 名: '透视-平涂-描边6', cameraRig: '透视', outlineWidth: 6 },
  { 名: '透视-平涂-描边6-后期', cameraRig: '透视', outlineWidth: 6, withPost: true },
  { 名: '透视-平涂-后期', cameraRig: '透视', withPost: true },
  { 名: '一楼机位-左平涂-右游戏截图', cameraRig: '一楼机位' },
  ...grades.map((tone): View => ({ 名: `侧面-${tone}-描边6-后期`, cameraRig: '侧面', outlineWidth: 6, withPost: true, tone, lampGlow: tone === '夜' || tone === '雷雨' })),
  { 名: '侧面-平涂-留AO', cameraRig: '侧面', AO: true },
  { 名: '侧面-平涂-描边6-她放大到4像素', cameraRig: '侧面', outlineWidth: 6, herTexturePixel: 4 },
];
