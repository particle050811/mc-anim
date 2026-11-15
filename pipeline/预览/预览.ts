// 给用户看的预览目录：主检出下 预览/<UTC 月日-时分>-<主题>/（不进 Git；worktree 里也写回主检出）。
// 一个主题一个文件夹、里面不再套文件夹，时间用 UTC、精确到分钟（用户 10-19 定）。不覆盖旧的：同分钟同主题加序号，不复用空目录，另一个调用可能已领走目录、还没写第一张图（用户 11-14 定）。
// 主题以「工作-」开头的是 Agent 自己看的中间稿，放数据根 run/草稿/，不进 预览/（用户 10-24 嫌预览目录里堆满了草稿）。
import fs from 'node:fs';
import path from 'node:path';
import { draftRoot } from '../环境/配置.ts';
import { mainCheckout } from '../环境/路径.ts';
import { utcMonthDayTime } from '../运行记录/记录.ts';

export const isValidTopic = (topic: string) => topic.length > 0 && !/[<>:"/\\|?*\x00-\x1f]/.test(topic) && !/^[. ]|[. ]$/.test(topic);

export const isDraft = (topic: string) => topic.startsWith('工作-');

export const newPreviewDir = (topic: string, previewRoot = isDraft(topic) ? draftRoot() : path.join(mainCheckout(), '预览'), ms = Date.now()) => {
  if (!isValidTopic(topic)) throw new Error(`主题「${topic}」不能当文件夹名（不能有 <>:"/\\|?* 和控制字符，不以点或空格开头结尾）`);
  fs.mkdirSync(previewRoot, { recursive: true });
  const baseDir = path.join(previewRoot, `${utcMonthDayTime(ms)}-${topic}`);
  for (let serial = 1; ; serial++) {
    const dir = serial === 1 ? baseDir : `${baseDir}-${serial}`;
    try {
      fs.mkdirSync(dir);
      return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
};
