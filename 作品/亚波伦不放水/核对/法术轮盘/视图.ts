// 核对-法术轮盘 的视图表（纯数据，段.ts 也读）：一秒一个视图。原版一圈的照搬当对照，后面是多圈轮盘的各档、张开过程和立在世界里的示意。
import type { OpenClose } from '../../界面/分圈.ts';
import type { ArrangeOptions } from '../../界面/轮盘法术.ts';

type MultiRing = ArrangeOptions & { 刻?: number; selectedId?: string; centerIcon?: string | null; backdropMode?: '原大' | '随外圈' | '无'; colorBySchool?: boolean; openClose?: Partial<OpenClose> };

export type View =
  | { name: string; pictureMode: '原版'; cellCount: number; textCell?: string; selectedId?: number; 刻?: number }
  | ({ name: string; pictureMode: '多圈' } & MultiRing)
  | ({ name: string; pictureMode: '世界' } & MultiRing);

/** 静帧里「完全张开」取的时刻：打开后 2 秒（各圈已经转了 6°） */
export const openTicks = 40;

export const views: readonly View[] = [
  { name: '① 原版一圈 20 格（照搬 GenericRadialMenu，当对照）', pictureMode: '原版', cellCount: 20 },
  { name: '①b 原版：19 个聚晶加「提取」文字格，悬停第 3 格', pictureMode: '原版', cellCount: 19, textCell: '提取', selectedId: 2 },
  { name: '② 多圈默认档：只放有画面的，按学派连续排，完全张开', pictureMode: '多圈' },
  { name: '③ 128 个全放：不进齐放的图标压暗', pictureMode: '多圈', 放: '全部' },
  { name: '④ 学派分色档（原创，默认关）', pictureMode: '多圈', colorBySchool: true },
  { name: '⑤-1 张开中：第 1.25 刻，内圈刚弹出', pictureMode: '多圈', 刻: 1.25 },
  { name: '⑤-2 张开中：第 3.75 刻，内圈到位、第二圈弹到一半', pictureMode: '多圈', 刻: 3.75 },
  { name: '⑤-3 张开中：第 7 刻，第三圈弹到八成', pictureMode: '多圈', 刻: 7 },
  { name: '⑥ 立在世界里的示意：史蒂夫顶替亚波伦，轮盘竖在身后', pictureMode: '世界' },
  { name: '⑦ 另一档排法：照注册顺序、各圈格数均分', pictureMode: '多圈', sortMode: '注册', splitMode: '均分' },
  { name: '⑧ 选中高亮（火球）、圆心换成火球（原版画当前聚晶的做法）、背景贴图随外圈放大', pictureMode: '多圈', selectedId: 'goety:fireball_focus', centerIcon: 'goety:fireball_focus', backdropMode: '随外圈' },
  { name: '⑨ 128 个全放 + 学派分色', pictureMode: '多圈', 放: '全部', colorBySchool: true },
  { name: '⑩ 圆心：本作品默认固定画炼狱聚晶（用户 11-09 定），选中凋灵也不换', pictureMode: '多圈', selectedId: 'goety:wither_skull_focus' },
  { name: '⑩b 对照：圆心不画（圆心: null）', pictureMode: '多圈', centerIcon: null },
];
