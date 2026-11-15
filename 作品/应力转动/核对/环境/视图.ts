// 环境核对的视图：一帧一个。前六帧两两一对（现有组件 | <环境> 预设），同一个场景、同一个机位，逐像素比；
// 后面是新能力：同一条环境轨（环境.ts，段.ts 之外声明的环境）按关键帧换时刻、天气；仰望 = 镜头抬到快朝天顶，看半夜头顶的月亮和星星。
export type View =
  | { 名: string; lightSet: '暮色' | '主世界投影' | '主世界'; usage: '现有' | '环境' }
  | { 名: string; lightSet: '时刻'; usage: '环境'; lookUp?: true };

export const views: readonly View[] = [
  { 名: '暮色-现有', lightSet: '暮色', usage: '现有' },
  { 名: '暮色-环境', lightSet: '暮色', usage: '环境' },
  { 名: '主世界投影-现有', lightSet: '主世界投影', usage: '现有' },
  { 名: '主世界投影-环境', lightSet: '主世界投影', usage: '环境' },
  { 名: '主世界-现有', lightSet: '主世界', usage: '现有' },
  { 名: '主世界-环境', lightSet: '主世界', usage: '环境' },
  { 名: '早晨1000', lightSet: '时刻', usage: '环境' },
  { 名: '正午6000', lightSet: '时刻', usage: '环境' },
  { 名: '日落12600', lightSet: '时刻', usage: '环境' },
  { 名: '满月半夜18000', lightSet: '时刻', usage: '环境' },
  { 名: '正午雷雨', lightSet: '时刻', usage: '环境' },
  { 名: '满月半夜18000-仰望', lightSet: '时刻', usage: '环境', lookUp: true },
  { 名: '第4天半夜90000-仰望', lightSet: '时刻', usage: '环境', lookUp: true },
  { 名: '月落22500', lightSet: '时刻', usage: '环境' },
];

/** 一个视图占 1/24 秒（以前 24 帧一帧一个视图，留着这个数好照旧的静帧号比） */
export const viewFps = 24;
export const pageWidth = 1280;
export const pageHeight = 720;
/** 主世界那几帧的能见度（米，FlightFog 的 visibility） */
export const visibility = 900;
