import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { 主检出 } from '../环境/路径.ts';
import { utc月日时分 } from '../运行记录/记录.ts';
import { 稳定JSON } from './指纹.ts';
import type { 帧比 } from './认指纹.ts';

export type 取样口径 = { 作品: string; 段: string; 旧指纹: string; 旧片sha: string; 宽: number; 高: number; 总帧数: number; 帧号: number[]; 级别: string; 平台: string; 主机: string; 后端: string; 输出fps: number; 缩放: number; 阈值: string };
export type 取样证据 = { 版本: 1; 口径: 取样口径; 指纹: string; 提交: string; 理由: string; 帧: (帧比 & { sha: string })[] };
const 摘要 = (内容: Buffer | string) => createHash('sha256').update(内容).digest('hex');
const 图名 = (帧: number) => `第${String(帧).padStart(4, '0')}帧.png`;
const 表名 = '抽样.json';

export const 存样本图 = (目录: string, 帧: number, 图: Buffer) => {
  fs.writeFileSync(path.join(目录, 图名(帧)), 图, { flag: 'wx' });
  return 摘要(图);
};
export const 存取样表 = (目录: string, 表: 取样证据) => fs.writeFileSync(path.join(目录, 表名), JSON.stringify(表, null, 2), { flag: 'wx' });
export const 读基点 = (目录: string): 取样证据 => {
  const 表 = JSON.parse(fs.readFileSync(path.join(目录, 表名), 'utf8')) as 取样证据;
  if (表.版本 !== 1 || !Array.isArray(表.帧) || !表.帧.length || !Array.isArray(表.口径?.帧号) || 表.帧.length !== 表.口径.帧号.length) throw new Error('基点抽样不完整或版本不符，请重新留基点');
  if (!表.帧.every((样, 序) => Number.isSafeInteger(样.帧) && 样.帧 >= 0 && 样.帧 < 表.口径.总帧数 && 样.帧 === 表.口径.帧号[序] && (!序 || 样.帧 > 表.帧[序 - 1]!.帧) && ['一样', '噪声内', '不同'].includes(样.结论))) throw new Error('基点帧号或旧片比较结论不完整');
  for (const 样 of 表.帧) if (摘要(fs.readFileSync(path.join(目录, 图名(样.帧)))) !== 样.sha) throw new Error(`基点第 ${样.帧} 帧和存档哈希不符`);
  return 表;
};
export const 核对口径 = (基: 取样口径, 现: 取样口径) => {
  for (const 键 of Object.keys(现) as (keyof 取样口径)[]) {
    if (稳定JSON(基[键]) !== 稳定JSON(现[键])) throw new Error(`基点和候选的「${键}」不一致，不作归因`);
  }
};

export const 交对照 = (基目录: string, 基: 取样证据, 现目录: string, 现: 取样证据, 根 = path.join(主检出(), '预览')) => {
  核对口径(基.口径, 现.口径);
  if (现.帧.length !== 基.帧.length || 现.帧.some((样, 序) => 样.帧 !== 基.帧[序]!.帧)) throw new Error('基点和候选出帧不齐，不作归因');
  if (现.帧.some((样, 序) => 样.sha === 基.帧[序]!.sha && 样.结论 !== 基.帧[序]!.结论)) throw new Error('相同 PNG 对同一旧片的比较结论不一致，不作归因');
  const 异 = 现.帧.filter((样, 序) => 样.sha !== 基.帧[序]!.sha);
  const 旧差 = 基.帧.filter(样 => 样.结论 === '不同');
  const 判词 = 异.length ? `候选与基点有 ${异.length} 张 PNG 不同，不能把差异全归给基点。` : 旧差.length ? `基点自身有 ${旧差.length} 帧不认；候选的全部抽样 PNG 与基点完全相同，抽中帧对旧片的差异来自基点。` : '基点、候选的抽样 PNG 完全相同，基点抽样未超旧片门槛。';
  const 标 = 摘要(稳定JSON([基, 现])).slice(0, 20);
  // 同一对证据重复交接只发一份；先在私有草稿内领下第一次交接的 UTC 时刻。
  const 回执 = path.join(基目录, `交接-${标}`);
  fs.mkdirSync(回执, { recursive: true });
  const 目录 = path.join(根, `${utc月日时分(fs.statSync(回执).birthtimeMs)}-认指纹对照-${现.口径.段}-${标}`);
  fs.mkdirSync(根, { recursive: true });
  const 帧 = (异[0] ?? 旧差[0] ?? 现.帧[0]!).帧;
  const 基点图 = `01-基点-${图名(帧)}`, 候选图 = `02-候选-${图名(帧)}`;
  const 帧表 = 现.帧.map((样, 序) => `| ${样.帧} | ${基.帧[序]!.结论} | ${样.结论} | ${样.sha === 基.帧[序]!.sha ? '相同' : '不同'} |`).join('\n');
  const 正文 = `# ${现.口径.段}：基点／候选对照\n\n${判词}\n\n旧切片：${现.口径.旧指纹}。基点 ${基.提交}（${基.理由}）；候选 ${现.提交}（${现.理由}）。\n\n只比 ${现.帧.length} 个输出帧；不证明整段或声音相同，没有登记沿用或认可。\n\n| 第 ${帧} 帧：基点 | 候选 |\n|---|---|\n| ![基点](${基点图}) | ![候选](${候选图}) |\n\n| 帧 | 基点对旧片 | 候选对旧片 | 基点／候选 PNG |\n|---|---|---|---|\n${帧表}\n\n完整 SHA 见抽样表。\n\n你的回复：\n`;
  if (!fs.existsSync(path.join(目录, '00-说明.md'))) {
    const 暂 = fs.mkdtempSync(path.join(根, '.认指纹-'));
    try {
      fs.copyFileSync(path.join(基目录, 图名(帧)), path.join(暂, 基点图));
      fs.copyFileSync(path.join(现目录, 图名(帧)), path.join(暂, 候选图));
      fs.writeFileSync(path.join(暂, '03-抽样.json'), JSON.stringify({ 基点: 基, 候选: 现 }, null, 2));
      fs.writeFileSync(path.join(暂, '00-说明.md'), 正文);
      try { fs.renameSync(暂, 目录); } catch (错) { if (!fs.existsSync(path.join(目录, '03-抽样.json'))) throw 错; }
    } finally { fs.rmSync(暂, { recursive: true, force: true }); }
  }
  return { 目录, 判词, 候选有差: 异.length > 0 };
};
