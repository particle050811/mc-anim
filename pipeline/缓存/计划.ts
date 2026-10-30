// anim cache gc 的整份计划（扫数据根、各检出的 webpack 缓存，算保留集）和执行。规则见 回收.ts 文件头。
import fs from 'node:fs';
import path from 'node:path';
import { 代码根, 主检出 } from '../环境/路径.ts';
import { 作品们 } from '../环境/作品.ts';
import { 数据根, 数据路径, 母版目录, 草稿根, 运行目录 } from '../环境/配置.ts';
import { 跑出 } from '../环境/子进程.ts';
import { 加当前指纹 } from './当前指纹.ts';
import { 找重复, 执行去重, 读账, 写账, 能克隆, type 去重组, type 去重账 } from './去重.ts';
import {
  保留集, 加交付, 加认可, 不认识条目, 列目录, 扫媒体, 扫webpack, 最近改于, 规划媒体, 规划临时, 规划草稿, 规划webpack,
  type 带理由, type 媒体文件, type 普通文件, type 目录条目, type webpack条目, type 缓存种,
} from './回收.ts';

export const 回收类 = ['母版', '叠层', '残留', '草稿', 'webpack', '去重'] as const;
export type 回收类名 = (typeof 回收类)[number];

export type 回收选项 = {
  /** 母版、叠层、去重只看这几部作品；空是全部（cache/ 下有、代码里没有的作品整个留着） */
  作品: string[];
  类: ReadonlySet<回收类名>;
  近期天数: number;
  草稿天数: number;
  webpack天数: number;
  现在: number;
};
export const 默认天数 = { 近期: 2, 草稿: 14, webpack: 3 };

export type webpack根计划 = { 根: string; 当前版本: string | null; 条目: 带理由<webpack条目>[] };
export type 回收计划 = {
  媒体: 带理由<媒体文件>[];
  临时: 带理由<普通文件>[];
  草稿: 带理由<目录条目>[];
  webpack: webpack根计划[];
  /** 只报告不删 */
  不认识: { 位置: string; 条目: 目录条目[] }[];
  去重: { 组: 去重组[]; 账: 去重账; 能做: boolean } | null;
  警告: string[];
};

/** 数据根 run/、cache/ 下 anim 认得的条目（别的只报告） */
export const run认识 = ['草稿', '运行记录', 'logs', 'locks', 'queue', 'public', 'extract'];
export const cache认识 = ['母版', '叠层', '求解', '私有配乐', '剪映解密', '发布', '缺字节', '接缝.json', '去重账.json'];
export const 去重账文件 = () => 数据路径('cache', '去重账.json');
const 相对数据根键 = (p: string) => path.relative(数据根(), p).split(path.sep).join('/');

/** 本机所有检出（主检出、各 worktree）：webpack 缓存在各自的 node_modules/.cache/webpack */
export const 各检出 = (): string[] => {
  const r = new Set([代码根(), 主检出()]);
  try {
    for (const l of 跑出(['git', '-C', 代码根(), 'worktree', 'list', '--porcelain']).split('\n')) if (l.startsWith('worktree ')) r.add(path.resolve(l.slice('worktree '.length).trim()));
  } catch {
    // 不在 git 里（公开版解压包）就只有代码根
  }
  return [...r].filter((d) => fs.existsSync(d));
};

const 装的Remotion版本 = (检出: string): string | null => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(检出, 'node_modules', 'remotion', 'package.json'), 'utf8')) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
};

const 留下的 = (计划: 回收计划) => 计划.媒体.filter((f) => f.理由.length);
const 要删的名字数 = (计划: 回收计划) => {
  const m = new Map<string, number>();
  for (const f of 计划.媒体) if (!f.理由.length) m.set(f.inode, (m.get(f.inode) ?? 0) + 1);
  return m;
};

export const 算回收计划 = async (o: 回收选项, 进度: (s: string) => void = () => {}): Promise<回收计划> => {
  const 计划: 回收计划 = { 媒体: [], 临时: [], 草稿: [], webpack: [], 不认识: [], 去重: null, 警告: [] };
  const 警告 = (s: string) => 计划.警告.push(s);
  const 要 = (c: 回收类名) => o.类.has(c);

  if (要('母版') || 要('叠层') || 要('残留') || 要('去重')) {
    const 已知 = 作品们();
    const 种们: 缓存种[] = ['母版', '叠层'];
    const 缓存里的 = new Set(种们.flatMap((种) => (fs.existsSync(数据路径('cache', 种)) ? fs.readdirSync(数据路径('cache', 种)) : [])));
    const 这次 = o.作品.length ? o.作品 : [...new Set([...已知.keys(), ...缓存里的])].sort();
    const 保留 = new 保留集();
    加交付(保留, 数据路径('交付'), 数据根(), 警告);
    for (const 作品 of 这次) {
      if (!缓存里的.has(作品)) continue;
      const 根 = 已知.get(作品);
      if (!根) {
        警告(`cache/ 下有作品「${作品}」，代码里没有这部作品（私有的没登记、或在别的分支上），它的母版、叠层整个留着`);
        for (const 种 of 种们) 保留.加目录(数据路径('cache', 种, 作品), { 类: '算不出', 说明: '代码里没有这部作品' });
        continue;
      }
      加认可(保留, 根, (键) => 母版目录(键, 作品), 警告);
      if (要('母版') || 要('叠层') || 要('去重')) await 加当前指纹(保留, 作品, 警告, 进度);
    }
    for (const 作品 of 这次) {
      for (const 种 of 种们) {
        const 扫 = 扫媒体(数据路径('cache', 种, 作品), 种, 作品);
        if (要(种) || 要('去重')) 计划.媒体.push(...规划媒体(扫.媒体, 保留, { 现在: o.现在, 近期天数: o.近期天数 }));
        if (要('残留')) 计划.临时.push(...规划临时(扫.临时, o.现在));
        if (扫.不认识.length) 计划.不认识.push({ 位置: `cache/${种}/${作品}`, 条目: 扫.不认识.map((f) => ({ ...f, 名: path.relative(数据路径('cache', 种, 作品), f.路径) })) });
      }
    }
    // 只要了去重、没要删的那一种：那一种的都按留算
    计划.媒体 = 计划.媒体.map((f) => (要(f.种) || f.理由.length ? f : { ...f, 理由: [{ 类: '算不出' as const, 说明: `这次没选 ${f.种}` }] }));
  }

  if (要('草稿')) 计划.草稿 = 规划草稿(列目录(草稿根()), { 现在: o.现在, 天数: o.草稿天数 });

  if (要('webpack')) {
    for (const 检出 of 各检出()) {
      const 根 = path.join(检出, 'node_modules', '.cache', 'webpack');
      if (!fs.existsSync(根)) continue;
      const 当前版本 = 装的Remotion版本(检出);
      const 扫 = 扫webpack(根, 当前版本);
      计划.webpack.push({ 根, 当前版本, 条目: 规划webpack(扫.条目, { 当前版本, 现在: o.现在, 天数: o.webpack天数, 每环境留: 作品们().size }) });
      if (扫.不认识.length) 计划.不认识.push({ 位置: 根, 条目: 扫.不认识 });
    }
  }

  计划.不认识.push({ 位置: 'run', 条目: 不认识条目(运行目录(), run认识) }, { 位置: 'cache', 条目: 不认识条目(数据路径('cache'), cache认识) });
  计划.不认识 = 计划.不认识.filter((x) => x.条目.length);

  if (要('去重')) {
    const 账 = 读账(去重账文件());
    // 克隆不了的平台连 sha 也不算：同大小的有几十 GB，算了也只是报个做不了的数
    计划.去重 = 能克隆() ? { 组: await 找重复(留下的(计划), 账, 相对数据根键, { 进度, 另删: 要删的名字数(计划) }), 账, 能做: true } : { 组: [], 账, 能做: false };
  }
  return 计划;
};

export type 执行结果 = { 删数: number; 删大小: number; 跳过: string[]; 失败: string[]; 克隆数: number; 克隆省: number };

const 天 = 24 * 3600 * 1000;

/** 照计划删、克隆。删之前再看一眼：文件这会儿又被改过（近期天数内）就跳过；去重在删完以后按现状重找一遍（sha 用账本里的，不重算） */
export const 执行回收 = async (计划: 回收计划, o: Pick<回收选项, '近期天数' | '草稿天数' | 'webpack天数'>, 现在 = Date.now()): Promise<执行结果> => {
  const r: 执行结果 = { 删数: 0, 删大小: 0, 跳过: [], 失败: [], 克隆数: 0, 克隆省: 0 };
  const 删 = (p: string, 大小: number, 新近: (改于: number) => boolean, 递归: boolean) => {
    try {
      if (!fs.existsSync(p)) return;
      const 改于 = 递归 ? 最近改于(p, 3) : fs.statSync(p).mtimeMs;
      if (新近(改于)) {
        r.跳过.push(`${p}（刚改过）`);
        return;
      }
      fs.rmSync(p, { recursive: 递归, force: true, maxRetries: 3 });
      r.删数++;
      r.删大小 += 大小;
    } catch (e) {
      r.失败.push(`${p}：${(e as Error).message}`);
    }
  };
  const 未满 = (天数: number) => (改于: number) => 现在 - 改于 < 天数 * 天;
  for (const f of 计划.媒体) if (!f.理由.length) 删(f.路径, f.大小, 未满(o.近期天数), false);
  for (const f of 计划.临时) if (!f.理由.length) 删(f.路径, f.大小, 未满(1), false);
  for (const d of 计划.草稿) if (!d.理由.length) 删(d.路径, d.大小, 未满(o.草稿天数), true);
  for (const w of 计划.webpack) for (const e of w.条目) if (!e.理由.length) 删(e.路径, e.大小, e.哈希 === null ? () => false : 未满(o.webpack天数), true);
  if (计划.去重?.能做 && 计划.去重.组.length) {
    const 组 = await 找重复(留下的(计划).filter((f) => fs.existsSync(f.路径)), 计划.去重.账, 相对数据根键);
    const d = 执行去重(组, 计划.去重.账, 相对数据根键);
    r.克隆数 = d.克隆数;
    r.克隆省 = d.省;
    r.失败.push(...d.失败);
    写账(去重账文件(), 计划.去重.账);
  }
  return r;
};
