// 出图用的方块颜色：方块表（engine/voxel/真实方块表.ts）里这种方块朝上（或朝侧面）那一面的贴图，取图集（资产 贴图/场景/关键帧/方块表）里
// 那张贴图不透明像素的平均色，再乘群系染色（草、树叶、水）。只是示意，不是渲染：没光照、没 AO、不画镂空。
import fs from 'node:fs';
import { decode } from 'fast-png';
import { 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import type { 体素库 } from '../体素库.ts';

export type RGB = [number, number, number];
export const 没数据色: RGB = [40, 40, 44];
export const 天色: RGB = [214, 230, 245];
export const 不认识色: RGB = [255, 0, 255];

export class 方块配色 {
  private 库: 体素库;
  private 平均: RGB[] = [];
  private 缓存 = new Map<string, RGB>();

  constructor(库: 体素库) {
    this.库 = 库;
    const img = decode(fs.readFileSync(解析资产('贴图/场景/关键帧/方块表', 读资产锁()).文件));
    const ch = img.channels;
    const 张 = img.height / 16;
    for (let t = 0; t < 张; t++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let p = 0; p < 256; p++) {
        const o = (t * 256 + p) * ch;
        if (ch === 4 && img.data[o + 3]! < 128) continue;
        r += img.data[o]!;
        g += img.data[o + 1]!;
        b += img.data[o + 2]!;
        n++;
      }
      this.平均.push(n ? [r / n, g / n, b / n] : [0, 0, 0]);
    }
  }

  /** 状态在 (x, z) 处朝上（面 = 'top'）或朝侧面的颜色；方块表里没有的是品红 */
  色(状态: string, 群系: string | null, x: number, z: number, 面: 'top' | 'side'): RGB {
    const 键 = `${状态}|${群系}|${面}`;
    const 表 = this.库.方块表;
    const v = 表.voxelFromState(状态);
    if (!v) return 不认识色;
    // 随位置变的染色（沼泽草色噪声）不缓存，其余按 状态 + 群系 缓存
    const 染路 = 表.blockProps.tint[v]!;
    const 可缓存 = 染路 === 0 || !群系 || !this.库.群系色.variesByPos(群系);
    const 有 = 可缓存 ? this.缓存.get(键) : undefined;
    if (有) return 有;
    const 面表 = 表.faceTable[v]!;
    const S = 表.faceStride;
    const 要 = 面 === 'top' ? [4] : [0, 1, 2, 3];
    if (!面表.length) return 不认识色;
    let 选 = 0;
    for (let k = 0; k < 面表.length / S; k++)
      if (要.includes(面表[k * S]!)) {
        选 = k;
        break;
      }
    const tex = 面表[选 * S + 2]!, 叠 = 面表[选 * S + 3]!, 染底 = 面表[选 * S + 4]!;
    let c = this.平均[tex] ?? 不认识色;
    // 草方块侧面：底是泥土、叠加层是染色的草边；侧面图里看上半截，按一半一半混
    const 染 = 群系 ? 表.blockTint(v, 群系, x, z) : 0xffffff;
    const 乘 = (a: RGB): RGB => [(a[0] * ((染 >> 16) & 255)) / 255, (a[1] * ((染 >> 8) & 255)) / 255, (a[2] * (染 & 255)) / 255];
    if (染底) c = 乘(c);
    if (叠 >= 0 && this.平均[叠]) {
      const o = 乘(this.平均[叠]!);
      c = [(c[0] + o[0]) / 2, (c[1] + o[1]) / 2, (c[2] + o[2]) / 2];
    }
    const out: RGB = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
    if (可缓存) this.缓存.set(键, out);
    return out;
  }
}
