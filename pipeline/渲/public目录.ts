// Remotion 的 public 目录：<数据根>/run/public/ 下两个链接，engine/core/数据源.ts 按相对它的路径现取 Git 外的数据。
//   terrain → <数据根>/terrain（区段包，路径见 engine/voxel/区段包位置.ts）；求解 → <数据根>/cache/求解（engine/core/求解缓存.ts）
// 不直接把数据根当 public：Remotion 打包时把 public 拷进包（Windows 上不能软链整个目录），里面的链接只转发不拷（@remotion/bundler 的 copyDir）。
// Windows 用 junction（不要管理员权限）。anim render 和 remotion.config.ts（studio）共用。
import fs from 'node:fs';
import path from 'node:path';
import { isWindows, public目录, 地形根, 求解缓存目录 } from '../环境/配置.ts';

const 链接表 = () => ({ terrain: 地形根(), 求解: 求解缓存目录() });

/** 建好（或校正）public 目录里的链接，返回 public 目录的路径 */
export const 备好public目录 = (): string => {
  const dir = public目录();
  fs.mkdirSync(dir, { recursive: true });
  for (const [名, 目标] of Object.entries(链接表())) {
    fs.mkdirSync(目标, { recursive: true });
    const 链接 = path.join(dir, 名);
    const st = fs.lstatSync(链接, { throwIfNoEntry: false });
    if (st) {
      if (!st.isSymbolicLink()) throw new Error(`${链接} 不是链接（public 目录里只放链接，数据放 ${目标}），先挪走它`);
      let 指向: string | null = null;
      try {
        指向 = fs.realpathSync(链接);
      } catch {
        // 断了的链接：重建
      }
      if (指向 === fs.realpathSync(目标)) continue;
      fs.unlinkSync(链接);
    }
    fs.symlinkSync(目标, 链接, isWindows ? 'junction' : 'dir');
  }
  return dir;
};
