import type { BedrockModel } from '@engine/model/基岩模型.tsx';
import type { Png } from '@engine/model/贴图.ts';
import { dHeadGeometry, paintDHead } from './D版头脸.ts';
import { dRobeGeometry, paintDRobe } from './D版法袍.ts';

const panelWidth = 128;

export const productionGeometry = (source: Omit<BedrockModel, 'texture'>) => ({
  ...dRobeGeometry(dHeadGeometry(source), source.texW + panelWidth), texW: source.texW + panelWidth * 2,
});

export const productionSkin = (source: Png): Png => {
  const atlas = { w: source.w + panelWidth * 2, h: source.h, px: new Uint8Array((source.w + panelWidth * 2) * source.h * 4) };
  for (let row = 0; row < source.h; row++) atlas.px.set(source.px.subarray(row * source.w * 4, (row + 1) * source.w * 4), row * atlas.w * 4);
  paintDHead(atlas, source.w, panelWidth);
  paintDRobe(atlas, source.w + panelWidth);
  return atlas;
};
