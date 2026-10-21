// 给用户看的预览目录：主检出下 预览/<UTC 月日-时分>-<主题>/（不进 Git；worktree 里也写回主检出）。
// 一个主题一个文件夹、里面不再套文件夹；不覆盖旧的，同一分钟同主题已有且不空就报错（用户 10-19 定 UTC、精确到分钟）。
import fs from 'node:fs';
import path from 'node:path';
import { 主检出 } from '../环境/路径.ts';
import { utc月日时分 } from '../运行记录/记录.ts';

export const 主题合法 = (主题: string) => 主题.length > 0 && !/[<>:"/\\|?*\x00-\x1f]/.test(主题) && !/^[. ]|[. ]$/.test(主题);

export const 新建预览目录 = (主题: string, 根 = path.join(主检出(), '预览'), ms = Date.now()) => {
  if (!主题合法(主题)) throw new Error(`主题「${主题}」不能当文件夹名（不能有 <>:"/\\|?* 和控制字符，不以点或空格开头结尾）`);
  const dir = path.join(根, `${utc月日时分(ms)}-${主题}`);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} 已经有东西了，不覆盖：过一分钟再建或换个主题`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
