import type { BedrockBone, BedrockModel } from '@engine/model/基岩模型.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import native from './YSM原生/亚波伦头脸.geo.json';
import image from 'asset:贴图/角色/娘化亚波伦/YSM头脸';

const portrait = native['minecraft:geometry'][0];
const edits = new Map((portrait.bones as BedrockBone[]).filter(bone => bone.cubes !== undefined).map(bone => [bone.name, bone]));

export function dHeadGeometry(model: Omit<BedrockModel, 'texture'>) {
  const existing = new Set(model.bones.map(bone => bone.name));
  return { ...model, bones: [...model.bones.map(bone => edits.get(bone.name) ?? bone),
    ...(portrait.bones as BedrockBone[]).filter(bone => !existing.has(bone.name))] };
}

export function paintDHead(atlas: Png, left: number, width: number) {
  const sheet = png(image);
  if (atlas.w !== sheet.w || atlas.h !== sheet.h || sheet.w !== portrait.description.texture_width || sheet.h !== portrait.description.texture_height) throw new Error('亚波伦原生头脸与正片图集尺寸不同');
  for (let row = 0; row < atlas.h; row++) {
    const start = (row * sheet.w + left) * 4;
    atlas.px.set(sheet.px.subarray(start, start + width * 4), start);
  }
}
