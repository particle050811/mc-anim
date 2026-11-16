// 出图用的方块颜色：方块表（engine/voxel/真实方块表.ts）里这种方块朝上（或朝侧面）那一面的贴图，取图集（资产 贴图/场景/关键帧/方块表）里
// 那张贴图不透明像素的平均色，再乘群系染色（草、树叶、水）。只是示意，不是渲染：没光照、没 AO、不画镂空。
import fs from 'node:fs';
import { decode } from 'fast-png';
import { readAssetLock, resolveAsset } from '../../资产/资产锁.ts';
import type { VoxelLib } from '../体素库.ts';

export type RGB = [number, number, number];
export const noDataColor: RGB = [40, 40, 44];
export const skyRgb: RGB = [214, 230, 245];
export const unknownColor: RGB = [255, 0, 255];

export class BlockPalette {
  private lib: VoxelLib;
  private averages: RGB[] = [];
  private colorCache = new Map<string, RGB>();

  constructor(voxelLib: VoxelLib) {
    this.lib = voxelLib;
    const img = decode(fs.readFileSync(resolveAsset('贴图/场景/关键帧/方块表', readAssetLock()).file));
    const ch = img.channels;
    const tileCount = img.height / 16;
    for (let t = 0; t < tileCount; t++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let p = 0; p < 256; p++) {
        const o = (t * 256 + p) * ch;
        if (ch === 4 && img.data[o + 3]! < 128) continue;
        r += img.data[o]!;
        g += img.data[o + 1]!;
        b += img.data[o + 2]!;
        n++;
      }
      this.averages.push(n ? [r / n, g / n, b / n] : [0, 0, 0]);
    }
  }

  /** 状态在 (x, z) 处朝上（面 = 'top'）或朝侧面的颜色；方块表里没有的是品红 */
  色(blockState: string, biome: string | null, x: number, z: number, face: 'top' | 'side'): RGB {
    const cacheKey = `${blockState}|${biome}|${face}`;
    const blockTable = this.lib.blockTable;
    const v = blockTable.voxelFromState(blockState);
    if (!v) return unknownColor;
    // 随位置变的染色（沼泽草色噪声）不缓存，其余按 状态 + 群系 缓存
    const tintKind = blockTable.blockProps.tint[v]!;
    const cacheable = tintKind === 0 || !biome || !this.lib.biomeColor.variesByPos(biome);
    const cached = cacheable ? this.colorCache.get(cacheKey) : undefined;
    if (cached) return cached;
    const faceList = blockTable.faceTable[v]!;
    const S = blockTable.faceStride;
    const faceIndices = face === 'top' ? [4] : [0, 1, 2, 3];
    if (!faceList.length) return unknownColor;
    let chosenIdx = 0;
    for (let k = 0; k < faceList.length / S; k++)
      if (faceIndices.includes(faceList[k * S]!)) {
        chosenIdx = k;
        break;
      }
    const tex = faceList[chosenIdx * S + 2]!, overlayTex = faceList[chosenIdx * S + 3]!, tintBase = faceList[chosenIdx * S + 4]!;
    let c = this.averages[tex] ?? unknownColor;
    // 草方块侧面：底是泥土、叠加层是染色的草边；侧面图里看上半截，按一半一半混
    const tint = biome ? blockTable.blockTint(v, biome, x, z) : 0xffffff;
    const multiplyRgb = (a: RGB): RGB => [(a[0] * ((tint >> 16) & 255)) / 255, (a[1] * ((tint >> 8) & 255)) / 255, (a[2] * (tint & 255)) / 255];
    if (tintBase) c = multiplyRgb(c);
    if (overlayTex >= 0 && this.averages[overlayTex]) {
      const o = multiplyRgb(this.averages[overlayTex]!);
      c = [(c[0] + o[0]) / 2, (c[1] + o[1]) / 2, (c[2] + o[2]) / 2];
    }
    const out: RGB = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
    if (cacheable) this.colorCache.set(cacheKey, out);
    return out;
  }
}
