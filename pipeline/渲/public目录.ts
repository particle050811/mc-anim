// Remotion 的 public 目录：<数据根>/run/public/ 下三个链接，engine/core/数据源.ts 按相对它的路径现取 Git 外的数据。
//   terrain → <数据根>/terrain（区段包，路径见 engine/voxel/区段包位置.ts）；求解 → <数据根>/cache/求解（engine/core/求解缓存.ts）；
//   私有配乐 → <数据根>/cache/私有配乐（按 cue 现取的私有配乐，里面的文件打包前由 pipeline/资产/私有配乐.ts 备好）；光体 → <数据根>/cache/光体（engine/light/光体缓存读写.ts）
// 不直接把数据根当 public：Remotion 打包时把 public 拷进包（Windows 上不能软链整个目录），里面的链接只转发不拷（@remotion/bundler 的 copyDir）。
// Windows 用 junction（不要管理员权限）。anim film 和 remotion.config.ts（studio）共用。
import fs from 'node:fs';
import path from 'node:path';
import { isWindows, publicDir, terrainRoot, dataRoot, solveCacheDir, lightCacheDir } from '../环境/配置.ts';
import { privateMusicDir } from '../资产/私有配乐.ts';

// 键是盘上的链接名（engine 按 terrain/、solveCache/、私有配乐/、光体/ 取），不是属性名，改名时别动
const linkTable = () => ({ terrain: terrainRoot(), solveCache: solveCacheDir(), 私有配乐: privateMusicDir(dataRoot()), '光体': lightCacheDir() });

/** 建好（或校正）public 目录里的链接，返回 public 目录的路径 */
export const ensurePublicDir = (): string => {
  const dir = publicDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const [linkName, targetDir] of Object.entries(linkTable())) {
    fs.mkdirSync(targetDir, { recursive: true });
    const linkPath = path.join(dir, linkName);
    const st = fs.lstatSync(linkPath, { throwIfNoEntry: false });
    if (st) {
      if (!st.isSymbolicLink()) throw new Error(`${linkPath} 不是链接（public 目录里只放链接，数据放 ${targetDir}），先挪走它`);
      let linkTarget: string | null = null;
      try {
        linkTarget = fs.realpathSync(linkPath);
      } catch {
        // 断了的链接：重建
      }
      if (linkTarget === fs.realpathSync(targetDir)) continue;
      fs.unlinkSync(linkPath);
    }
    fs.symlinkSync(targetDir, linkPath, isWindows ? 'junction' : 'dir');
  }
  return dir;
};
