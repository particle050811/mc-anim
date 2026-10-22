// 作品/应力转动/旧名.tsv：类别、旧名、新键、备注四列。旧名永不复用：新段键、段名、场键、台词 id 不能等于表里的旧名，除非那一行的新键就是它自己（docs/命名.md）。
import type { 报告, 检查上下文 } from './上下文.ts';

export const 旧名类别 = ['场号', '段号', 'Composition', '拍号', '段名', '台词', '已删段', '已删台词'] as const;
export type 旧名行 = { 类别: string; 旧名: string; 新键: string; 备注: string; 行: number };

export const 旧名表路径 = '作品/应力转动/旧名.tsv';

export const 读旧名 = (c: 检查上下文, 报?: 报告): 旧名行[] => {
  if (!c.存在(旧名表路径)) {
    报?.错(`没有 ${旧名表路径}`);
    return [];
  }
  const 行们 = c.读(旧名表路径).split('\n');
  if (行们.at(-1) === '') 行们.pop();
  if (行们[0] !== '类别\t旧名\t新键\t备注') 报?.错('表头要是「类别\\t旧名\\t新键\\t备注」', 旧名表路径, 1);
  const r: 旧名行[] = [];
  行们.slice(1).forEach((l, i) => {
    const 列 = l.split('\t');
    const 行 = i + 2;
    if (列.length !== 4) return 报?.错(`要正好 4 列，这行 ${列.length} 列`, 旧名表路径, 行);
    const [类别, 旧名, 新键, 备注] = 列 as [string, string, string, string];
    if (!(旧名类别 as readonly string[]).includes(类别)) 报?.错(`类别「${类别}」不认识（能用：${旧名类别.join('、')}）`, 旧名表路径, 行);
    if (!旧名) 报?.错('旧名是空的', 旧名表路径, 行);
    if (!新键 && !类别.startsWith('已删')) 报?.错(`${类别} 要写新键（删掉的用 已删段、已删台词）`, 旧名表路径, 行);
    r.push({ 类别, 旧名, 新键, 备注, 行 });
  });
  return r;
};

/** 名字撞了哪些旧名（那一行的新键就是它自己的不算） */
export const 撞旧名 = (表: 旧名行[], 名: string, 新键 = 名) => 表.filter((x) => x.旧名 === 名 && x.新键 !== 新键);

/** 段名撞了哪些旧段名（段名、已删段两类，按去掉「<章>-」的名字比） */
export const 撞旧段名 = (表: 旧名行[], 段名: string, 段键: string) =>
  表.filter((x) => (x.类别 === '段名' || x.类别 === '已删段') && x.旧名.replace(/^\d+-/, '') === 段名 && x.新键 !== 段键);
