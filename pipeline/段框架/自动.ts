// render、still、studio 开跑前自动跑 anim cues：段框架的段生成的 声音表.生成.ts、声音地址.生成.ts 和 段.ts 的 cue 对不上就重新生成（变了才写）。
// 为什么自动生成、不是报错让人去跑：这两份文件只由 段.ts、场时间线、资产锁、台词.toml 和字节算出来，人去跑也是同一条命令、同一个结果；
// 报错的话 studio 起不来、改一声就要多敲一条命令。写了哪份会打出来（进 Git，git diff 看得见），anim check 照样核对。
// 只看一眼认得出的段（段.ts 直接引 窗口段，或目录里已经有生成的声音表；anim new seg 建的段一开始就有空表），不执行老段，开跑前不慢。
// 必须在 清单/清单.ts 的 全部段 之前跑：声音表过期时 放() 直接抛错，全部段 连加载都过不去。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品根 } from '../环境/作品.ts';
import { 数据根 } from '../环境/配置.ts';
import { 读作品资产锁 } from '../资产/资产锁.ts';
import { 读台词表 } from '../合成/台词落点.ts';
import type { 清单条目 } from '../../engine/段/清单条目.ts';
import type { 段定义 } from '../../engine/段/段定义.ts';
import { 新鲜执行, 生成一段, type 生成环境 } from './生成.ts';
import { 是框架段目录 } from './命令.ts';
import { 取音频数 } from './音频数.ts';

type 作品清单 = { 清单: readonly 清单条目[]; 段目录: (键: string) => string };

export type 自动结果 = { 写了: string[]; 失败: Map<string, string> };

/** 所选作品里段框架的段逐个生成一遍（变了才写）；出错的不抛，记进 失败（段键 → 原因），由调用的命令决定要不要停 */
export const 渲前跑cues = async (o: { 打印?: (行: string) => void } = {}): Promise<自动结果> => {
  const 打印 = o.打印 ?? ((x: string) => console.error(x));
  const 根 = 代码根();
  const 作根 = 作品根();
  const m = (await import(pathToFileURL(path.join(作根, '清单.ts')).href)) as 作品清单;
  const 目录于 = (键: string) => path.join(作根, ...m.段目录(键).split('/'));
  const 框架段 = m.清单.filter((t) => 是框架段目录(目录于(t.键)));
  const 结果: 自动结果 = { 写了: [], 失败: new Map() };
  if (!框架段.length) return 结果;
  const 锁 = 读作品资产锁(作根);
  const 台词表 = 读台词表(path.join(作根, '台词.toml'));
  const 片 = m.清单.filter((t) => t.章 !== '核对');
  for (const t of 框架段) {
    const i = 片.findIndex((x) => x.键 === t.键);
    const 上一段 = async (): Promise<段定义 | undefined> => (i > 0 ? ((await 新鲜执行(path.join(目录于(片[i - 1]!.键), '段.ts'), 根)).default as 段定义) : undefined);
    const 环境: 生成环境 = { 锁, 台词表, 取数: (id) => 取音频数(id, 锁[id], 数据根()), 上一段 };
    try {
      const r = await 生成一段(path.join(目录于(t.键), '段.ts'), 根, 环境);
      if (r.改了.length) {
        const 文件们 = r.改了.map((f) => 相对代码根(path.join(目录于(t.键), f)));
        结果.写了.push(...文件们);
        打印(`✎ anim cues ${t.键}：段.ts 的 cue 和生成的文件对不上，重新生成了 ${r.改了.join('、')}`);
      }
    } catch (e) {
      结果.失败.set(t.键, (e as Error).message);
    }
  }
  return 结果;
};

/** render、still 用：所选的段里有 cues 生成失败的就停（声音会放错），别的段失败只提醒 */
export const 查所选段cues = (r: 自动结果, 所选: readonly { 键: string }[], 打印: (行: string) => void = (x) => console.error(x)) => {
  const 选中 = new Set(所选.map((s) => s.键));
  const 停 = [...r.失败].filter(([k]) => 选中.has(k));
  for (const [k, x] of r.失败) if (!选中.has(k)) 打印(`!! ${k} 的 anim cues 没跑通（这次没选它，先不管）：${x}`);
  if (停.length) throw new Error(`段框架的段生成声音表失败，声音会放错：${停.map(([k, x]) => `${k}：${x}`).join('；')}`);
};
