// pipeline 这边看段：按 content/清单.ts 的顺序读各段的 段.ts（纯数据），以及选择器（anim render、anim film 的范围）。
// 选择器全字匹配：段键、段名、编号、场键、章，或章的范围（6-7）；几个选择器取并集，结果按清单顺序。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { 清单, 段目录, 段名, 编号, type 清单条目 } from '../../content/清单.ts';
import type { 段定义 } from '../../content/段定义.ts';
import { 代码根 } from '../环境/路径.ts';

export type 段信息 = 清单条目 & { 编号: string | null; 段名: string; 目录: string; 画面: string; 段文件: string; 段: 段定义 };

const 读段文件 = async (file: string): Promise<段定义> => {
  const m = (await import(pathToFileURL(file).href)) as { default?: 段定义 };
  if (!m.default) throw new Error(`${file} 没有 export default 定义段(...)`);
  return m.default;
};

export const 全部段 = async (): Promise<段信息[]> =>
  Promise.all(
    清单.map(async (t) => {
      const 目录 = path.join(代码根(), 'content', ...段目录(t.键).split('/'));
      const 段文件 = path.join(目录, '段.ts');
      return { ...t, 编号: 编号(t.键), 段名: 段名(t), 目录, 段文件, 画面: path.join(目录, '画面.tsx'), 段: await 读段文件(段文件) };
    }),
  );

export const 匹配 = (s: 段信息, 选择器: string) => {
  const 范围 = /^(\d+)-(\d+)$/.exec(选择器);
  if (范围 && typeof s.章 === 'number') return s.章 >= Number(范围[1]) && s.章 <= Number(范围[2]);
  return [s.键, s.段名, s.编号, s.段.场, String(s.章)].includes(选择器);
};

export const 选段 = async (选择器: readonly string[]): Promise<段信息[]> => {
  const 全 = await 全部段();
  const 没中 = 选择器.filter((x) => !全.some((s) => 匹配(s, x)));
  if (没中.length) throw new Error(`选择器没对上任何段：${没中.join('、')}（能用段键、段名、编号、场键、章或 6-7 这样的章范围；清单里有：${全.map((s) => s.键).join('、')}）`);
  return 全.filter((s) => 选择器.some((x) => 匹配(s, x)));
};
