// Remotion public 目录里的链接表：链接名 → 数据根里的目录。engine 按相对 public 的路径取数（terrain/…、solveCache/…），
// pipeline/渲/public目录.ts 照它建链接，pipeline/世界/node数据源.ts 照它在 Node 里把同样的路径换成盘上的文件；两边一份表。
import { terrainRoot, dataRoot, solveCacheDir, lightCacheDir } from '../环境/配置.ts';
import { privateMusicDir } from './私有配乐.ts';

// 键是盘上的链接名（engine 按 terrain/、solveCache/、私有配乐/、lightVolume/ 取），不是属性名，改名时别动
export const publicLinks = (): Record<string, string> => ({ terrain: terrainRoot(), solveCache: solveCacheDir(), 私有配乐: privateMusicDir(dataRoot()), lightVolume: lightCacheDir() });
