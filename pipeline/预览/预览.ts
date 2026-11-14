// 给用户看的预览目录：主检出下 预览/<UTC 月日-时分>-<主题>/（不进 Git；worktree 里也写回主检出）。
// 一个主题一个文件夹、里面不再套文件夹，时间用 UTC、精确到分钟（用户 10-19 定）。不覆盖旧的：同分钟同主题加序号，不复用空目录，另一个调用可能已领走目录、还没写第一张图（用户 11-14 定）。
// 主题以「工作-」开头的是 Agent 自己看的中间稿，放数据根 run/草稿/，不进 预览/（用户 10-24 嫌预览目录里堆满了草稿）。
import fs from 'node:fs';
import path from 'node:path';
import { 草稿根 } from '../环境/配置.ts';
import { 主检出 } from '../环境/路径.ts';
import { utc月日时分 } from '../运行记录/记录.ts';

export const 主题合法 = (主题: string) => 主题.length > 0 && !/[<>:"/\\|?*\x00-\x1f]/.test(主题) && !/^[. ]|[. ]$/.test(主题);

export const 是草稿 = (主题: string) => 主题.startsWith('工作-');

export const 新建预览目录 = (主题: string, 根 = 是草稿(主题) ? 草稿根() : path.join(主检出(), '预览'), ms = Date.now()) => {
  if (!主题合法(主题)) throw new Error(`主题「${主题}」不能当文件夹名（不能有 <>:"/\\|?* 和控制字符，不以点或空格开头结尾）`);
  fs.mkdirSync(根, { recursive: true });
  const 前缀 = path.join(根, `${utc月日时分(ms)}-${主题}`);
  for (let 序号 = 1; ; 序号++) {
    const dir = 序号 === 1 ? 前缀 : `${前缀}-${序号}`;
    try {
      fs.mkdirSync(dir);
      return dir;
    } catch (错) {
      if ((错 as NodeJS.ErrnoException).code !== 'EEXIST') throw 错;
    }
  }
};
