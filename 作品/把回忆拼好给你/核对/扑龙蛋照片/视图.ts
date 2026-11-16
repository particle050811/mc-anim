// 扑龙蛋照片核对的视图表（纯数据，段.ts 也读）：每帧都是正片第 5 句 照片-扑龙蛋 那一帧（她整个扑在蛋上、爪子抱着蛋，蛋还没被点走），只差下面这一项。
// 第 0 帧是第 8 句收的那张照片的底片：不画歌词（这一镜本来就没有聊天栏、气泡）。第 1 帧是片子里那一帧（带歌词），对照用。
export type View = { name: string; clean: boolean };

export const views: readonly View[] = [
  { name: '照片', clean: true },
  { name: '成片', clean: false },
];
