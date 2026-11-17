// 存档格式：区域目录里有哪些列段区域、一个区域由哪些文件组成、怎么读成列段。原版 .mca 一个区域一个文件（存档.ts）；
// 立方区块存档一个区域是一组 .mcr3d（立方存档.ts）。区域源.ts 按它列文件、算缓存键、读；工作线程收不到函数，按 spec 重建。
import fs from 'node:fs';
import path from 'node:path';
import { parseRegionFileName, readRegion, regionFileName, type ReadRegionResult } from './存档.ts';
import { listCubicRegions, readCubicRegion } from './立方存档.ts';

/** 世界声明的 saveFormat（和 mcr3d 要的 yRange）；不写 = mca */
export type SaveFormatSpec = { kind: 'mca' } | { kind: 'mcr3d'; yRange: [number, number] };

export type SaveFormat = {
  spec: SaveFormatSpec;
  /** 进列段缓存键：读法（状态串、并段、取舍规则）改了就换一版 */
  readMethod: string;
  /** 文件名进不进缓存键：一个区域多个文件时名字定位置；.mca 只有一个文件，键照旧只有内容 */
  namesInKey: boolean;
  /** 目录里有的列段区域 [rx, rz]，按文件名排好 */
  listRegions(dir: string): [number, number][];
  /** 组成这个区域的文件（绝对路径，先后固定）；不一定存在 */
  files(dir: string, rx: number, rz: number): string[];
  /** 读成列段；没有数据返回 null。wanted：只解这些区块（下标 cz·32 + cx） */
  read(files: readonly string[], rx: number, rz: number, seed: string, wanted?: ReadonlySet<number>): ReadRegionResult | null;
};

export const mcaFormat: SaveFormat = {
  spec: { kind: 'mca' },
  readMethod: 'mca-列段v2',
  namesInKey: false,
  listRegions: (dir) =>
    fs
      .readdirSync(dir)
      .sort()
      .map(parseRegionFileName)
      .filter((x): x is readonly [number, number] => !!x)
      .map(([a, b]) => [a, b]),
  files: (dir, rx, rz) => [path.join(dir, regionFileName(rx, rz))],
  read: (files, rx, rz, seed, wanted) => readRegion(files[0]!, rx, rz, seed, wanted),
};

const cubicFormat = (yRange: [number, number]): SaveFormat => {
  const listings = new Map<string, Map<string, string[]>>();
  const listing = (dir: string) => {
    let l = listings.get(dir);
    if (!l) listings.set(dir, (l = listCubicRegions(dir)));
    return l;
  };
  return {
    spec: { kind: 'mcr3d', yRange },
    readMethod: `mcr3d-列段v1 y${yRange[0]}..${yRange[1]}`,
    namesInKey: true,
    listRegions: (dir) => [...listing(dir).keys()].map((k) => k.split(',').map(Number) as [number, number]),
    files: (dir, rx, rz) => (listing(dir).get(`${rx},${rz}`) ?? []).map((f) => path.join(dir, f)),
    read: (files, rx, rz, seed, wanted) => readCubicRegion(files, rx, rz, seed, yRange, wanted),
  };
};

export const saveFormat = (spec: SaveFormatSpec): SaveFormat => (spec.kind === 'mca' ? mcaFormat : cubicFormat(spec.yRange));
