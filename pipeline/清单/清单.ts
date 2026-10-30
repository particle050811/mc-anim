// pipeline 这边看段：按所选作品的 清单.ts 的顺序读各段的 段.ts（纯数据），以及选择器（anim render、anim film 的范围）。
// 选择器全字匹配：段键、段名、编号、场键、章，都对不上才当章的范围（6-7）；可以写成带作品的全名（<作品>/<段键>），作品要是所选的那部。几个选择器取并集，结果按清单顺序。
import path from 'node:path';
import '../环境/别名注册.ts';
import { pathToFileURL } from 'node:url';
import type { 清单条目 } from '../../engine/段/清单条目.ts';
import type { 段定义 } from '../../engine/段/段定义.ts';
import { 拆全名, 作品名, 作品根 } from '../环境/作品.ts';

export type 段信息 = 清单条目 & { 编号: string | null; 段名: string; 目录: string; 画面: string; 段文件: string; 段: 段定义 };

const 读段文件 = async (file: string): Promise<段定义> => {
  const m = (await import(pathToFileURL(file).href)) as { default?: 段定义 };
  if (!m.default) throw new Error(`${file} 没有 export default 定义段(...)`);
  return m.default;
};

type 作品清单 = { 清单: readonly 清单条目[]; 段目录: (键: string) => string; 段名: (t: 清单条目) => string; 编号: (键: string) => string | null };

export const 全部段 = async (): Promise<段信息[]> => {
  const 根 = 作品根();
  const { 清单, 段目录, 段名, 编号 } = (await import(pathToFileURL(path.join(根, '清单.ts')).href)) as 作品清单;
  return Promise.all(
    清单.map(async (t) => {
      const 目录 = path.join(根, ...段目录(t.键).split('/'));
      const 段文件 = path.join(目录, '段.ts');
      return { ...t, 编号: 编号(t.键), 段名: 段名(t), 目录, 段文件, 画面: path.join(目录, '画面.tsx'), 段: await 读段文件(段文件) };
    }),
  );
};

const 是别的作品 = (选择器: string) => {
  const 作 = 拆全名(选择器).作品;
  return 作 !== undefined && 作.normalize('NFC').toLowerCase() !== 作品名().toLowerCase();
};

const 全字 = (s: 段信息, 键: string) => [s.键, s.段名, s.编号, s.段.场, String(s.章)].includes(键);

const 在章范围 = (s: 段信息, 键: string) => {
  const 范围 = /^(\d+)-(\d+)$/.exec(键);
  return !!范围 && typeof s.章 === 'number' && s.章 >= Number(范围[1]) && s.章 <= Number(范围[2]);
};

/**
 * 一个选择器选中的段（按 全 的顺序）：先全字匹配段键、段名、编号、场键、章，一段都对不上才当章范围。
 * 编号（6-01、7-08）也长成「数字-数字」，先当章范围的话 6-01 成了 6～1 章、7-08 成了整两章。
 */
export const 选中 = (全: readonly 段信息[], 全名: string): 段信息[] => {
  if (是别的作品(全名)) return [];
  const 键 = 拆全名(全名).键;
  const 中 = 全.filter((s) => 全字(s, 键));
  return 中.length ? 中 : 全.filter((s) => 在章范围(s, 键));
};

export const 选段 = async (选择器: readonly string[]): Promise<段信息[]> => {
  const 全 = await 全部段();
  const 别的 = 选择器.filter(是别的作品);
  if (别的.length) throw new Error(`${别的.join('、')} 不是现在选的作品「${作品名()}」的段（一次只处理一部作品，换作品用 --作品）`);
  const 各 = 选择器.map((x) => 选中(全, x));
  const 没中 = 选择器.filter((_, i) => !各[i]!.length);
  if (没中.length) throw new Error(`选择器没对上任何段：${没中.join('、')}（能用段键、段名、编号、场键、章或 6-7 这样的章范围；清单里有：${全.map((s) => s.键).join('、')}）`);
  const 要 = new Set(各.flat());
  return 全.filter((s) => 要.has(s));
};
