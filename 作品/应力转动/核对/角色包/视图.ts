// 角色包核对的视图表（纯数据，段.ts 也读）：每个视图照旧项目一个现成核对 Composition 的某一帧，画布尺寸照那个 Composition，
// 画在页面左上角，新旧静帧裁到同一尺寸后逐像素比（预览/<UTC>-角色包核对/）。
export type View = {
  name: string;
  width: number;
  height: number;
  /** 旧项目里同一画面：Composition id 和帧号 */
  reference: { id: string; frame: number };
};

export const views: readonly View[] = [
  { name: '李樱-站姿正面', width: 900, height: 1200, reference: { id: '李樱对照', frame: 3 } },
  { name: '李樱-站姿斜侧', width: 900, height: 1200, reference: { id: '李樱对照', frame: 6 } },
  { name: '李樱-持刀', width: 1300, height: 1200, reference: { id: '拔刀剑持刀对照', frame: 2 } },
  { name: '李樱-嘴型', width: 1280, height: 720, reference: { id: '口型预览', frame: 1 } },
  { name: '九胡-自带嘴', width: 1280, height: 720, reference: { id: '口型预览', frame: 0 } },
  { name: '九胡-嘴型', width: 1280, height: 720, reference: { id: '口型预览', frame: 2 } },
  { name: '两人-李樱说话', width: 1280, height: 720, reference: { id: '口型演示', frame: 40 } },
  { name: '两人-九胡说话', width: 1280, height: 720, reference: { id: '口型演示', frame: 130 } },
];

export const pageWidth = Math.max(...views.map((v) => v.width));
export const pageHeight = Math.max(...views.map((v) => v.height));
