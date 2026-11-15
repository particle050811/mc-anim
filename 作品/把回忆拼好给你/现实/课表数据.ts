// 墙上课表的内容（纯数据，段.ts 也能读）。节次结构照 预览/1023-1635-正片三版-歌词与画面/01-课表-原样.png，
// 加上三稿表头「课表」那段用户定的改动（预览/1024-0233-正片三版三稿-歌词与画面/00-说明.md）：不写届别，空格留空，
// 晚自修的格子只写「自修」，周六最后一节是周测，周日 9:00 前返校、上午数学培优。不出任何真实的学校、班级、人名。
// 没有生物课：用户 10-24 定「我这个是物化班+一门选科」，第三门在「选考走班」里上，原来的生物格换成物、化、英。
export const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
export type Weekday = (typeof weekdays)[number];

/** 课表的行，从上往下；时段照 01（第 1 节 7:40–8:20，一节 40 分钟） */
export const periods = [
  { 节: '早读', timeRange: '07:00 – 07:30' },
  { 节: '第1节', timeRange: '07:40 – 08:20' },
  { 节: '第2节', timeRange: '08:30 – 09:10' },
  { 节: '大课间', timeRange: '09:10 – 09:35' },
  { 节: '第3节', timeRange: '09:35 – 10:15' },
  { 节: '第4节', timeRange: '10:25 – 11:05' },
  { 节: '第5节', timeRange: '11:15 – 11:55' },
  { 节: '午餐 午休', timeRange: '11:55 – 13:30' },
  { 节: '第6节', timeRange: '13:30 – 14:10' },
  { 节: '第7节', timeRange: '14:20 – 15:00' },
  { 节: '第8节', timeRange: '15:10 – 15:50' },
  { 节: '第9节', timeRange: '16:00 – 16:40' },
  { 节: '晚餐', timeRange: '16:40 – 18:10' },
  { 节: '晚自修一', timeRange: '18:10 – 19:20' },
  { 节: '晚自修二', timeRange: '19:30 – 20:30' },
  { 节: '晚自修三', timeRange: '20:40 – 21:40' },
] as const;
export type PeriodName = (typeof periods)[number]['节'];

/** 一格：行 = 节们 的下标，列 = 星期们 的下标；跨行、跨列是合并了几格；字 '' 是留空的格；疏 = 字间拉开一个字宽（01 里合并的大格这么排） */
export type TimetableCell = { 行: number; 列: number; rowSpan: number; colSpan: number; 字: string; sparse?: true };

const rowCells = (row: number, chars: readonly string[], startColumn = 0): TimetableCell[] => chars.map((text, i) => ({ 行: row, 列: startColumn + i, rowSpan: 1, colSpan: 1, 字: text }));

export const timetableCells: readonly TimetableCell[] = [
  ...rowCells(0, ['语文', '英语', '语文', '英语', '语文', '英语']),
  { 行: 0, 列: 6, rowSpan: 3, colSpan: 1, 字: '' }, // 周日 9:00 前返校，之前留空
  ...rowCells(1, ['语', '数', '英', '语', '数', '语']),
  ...rowCells(2, ['数', '英', '语', '数', '语', '英']),
  { 行: 3, 列: 0, rowSpan: 1, colSpan: 6, 字: '跑操', sparse: true },
  { 行: 3, 列: 6, rowSpan: 4, colSpan: 1, 字: '数学培优班' },
  ...rowCells(4, ['英', '语', '数', '英', '英', '数']),
  ...rowCells(5, ['物', '化', '化', '物', '化', '物']),
  ...rowCells(6, ['化', '物', '物', '化', '物', '化']),
  { 行: 7, 列: 0, rowSpan: 1, colSpan: 7, 字: '午餐·午休', sparse: true },
  { 行: 8, 列: 0, rowSpan: 1, colSpan: 1, 字: '物' },
  { 行: 8, 列: 1, rowSpan: 2, colSpan: 1, 字: '选考走班' },
  { 行: 8, 列: 2, rowSpan: 1, colSpan: 1, 字: '化' },
  { 行: 8, 列: 3, rowSpan: 2, colSpan: 1, 字: '选考走班' },
  { 行: 8, 列: 4, rowSpan: 1, colSpan: 1, 字: '化' },
  { 行: 8, 列: 5, rowSpan: 1, colSpan: 1, 字: '英' },
  { 行: 8, 列: 6, rowSpan: 4, colSpan: 1, 字: '自修', sparse: true },
  { 行: 9, 列: 0, rowSpan: 1, colSpan: 1, 字: '数' },
  { 行: 9, 列: 2, rowSpan: 1, colSpan: 1, 字: '英' },
  { 行: 9, 列: 4, rowSpan: 1, colSpan: 1, 字: '语' },
  { 行: 9, 列: 5, rowSpan: 3, colSpan: 1, 字: '周测', sparse: true },
  ...rowCells(10, ['英', '语', '数', '数', '英']),
  ...rowCells(11, ['自', '自', '自', '自', '自']),
  { 行: 12, 列: 0, rowSpan: 1, colSpan: 5, 字: '晚餐', sparse: true },
  { 行: 12, 列: 5, rowSpan: 4, colSpan: 1, 字: '' }, // 周六周测完放学，晚上留空
  // 只有一行高，不能疏：疏了一字一行竖着排要 18 像素，格子里只有 9（用户 11-03「晚餐那个字的 排列跳出边框了」）
  { 行: 12, 列: 6, rowSpan: 1, colSpan: 1, 字: '晚餐' },
  { 行: 13, 列: 0, rowSpan: 3, colSpan: 5, 字: '自修', sparse: true },
  { 行: 13, 列: 6, rowSpan: 3, colSpan: 1, 字: '自修', sparse: true },
];

export const timetableTitle = '高三（　　）班　课程表';
export const timetableNote = '注：1. 上午第一节 7:40 开始；2. 下午第一节 13:30 开始；3. 周日 9:00 前返校，上午数学培优；4. 选考走班按选考科目分班上课。';

/** 某一格亮多少（0 不亮、1 亮满）；同一个合并格里有几节都亮时取最亮的 */
export type LitCell = { 周: Weekday; 节: PeriodName; brightness: number };

/** 盖住 周×节 这一格的那个格（合并格返回整块） */
export const findCell = (weekday: Weekday, period: PeriodName): TimetableCell => {
  const colIndex = weekdays.indexOf(weekday);
  const row = periods.findIndex((n) => n.节 === period);
  const cell = timetableCells.find((g) => row >= g.行 && row < g.行 + g.rowSpan && colIndex >= g.列 && colIndex < g.列 + g.colSpan);
  if (!cell) throw new Error(`课表里没有 ${weekday} ${period} 这一格`);
  return cell;
};
