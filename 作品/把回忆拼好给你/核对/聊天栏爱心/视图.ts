// 聊天栏和驯服爱心的核对视图（纯数据，段.ts 也读）：一帧一个视图。刻都从驯服那一刻数起。
// 聊天栏：满亮（0、100）、淡出中（185、195）、消失（200）；爱心：刚出生（0、0.25）、升到一半（5、10）、快消失（15）；两样合看。
// 爱心在占位机位下有几颗飘出画面上沿，另加两张退远的（远景）看全 7 颗。
export type View = {
  name: string;
  width: number;
  height: number;
  chatTick?: number;
  heartTick?: number;
  farView?: true;
};

const widthPx = 1280;
const height = 720;

export const views: readonly View[] = [
  ...[0, 100, 185, 195, 200].map((tick) => ({ name: `聊天栏 第 ${tick} 刻`, width: widthPx, height: height, chatTick: tick })),
  ...[0, 0.25, 5, 10, 15].map((tick) => ({ name: `爱心 第 ${tick} 刻`, width: widthPx, height: height, heartTick: tick })),
  { name: '合看 第 5 刻', width: widthPx, height: height, chatTick: 5, heartTick: 5 },
  ...[5, 15].map((tick) => ({ name: `爱心 远景 第 ${tick} 刻`, width: widthPx, height: height, heartTick: tick, farView: true as const })),
];

export const pageWidth = Math.max(...views.map((v) => v.width));
export const pageHeight = Math.max(...views.map((v) => v.height));
