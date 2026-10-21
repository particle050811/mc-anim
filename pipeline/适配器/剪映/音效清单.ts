// 各段的音效、配乐、台词清单（格式同 engine/audio/音效清单.ts 的 SfxClipLog），给 音效拆分.py 一声一个片段地合成。
// 旧项目是 exportSfx 渲第 0 帧收浏览器日志（导出音效清单.mjs）；新管线照 docs/架构.md 直接读段.ts 的声音 cue，不渲染。
// 音效、配乐 cue 的帧数、入点、速率、增益照写（配乐 = 资产 id 以 配乐/ 开头）。台词的起帧、入点、帧数照旧 台词轨.tsx：
// 文件头在段开头之前的从文件里跳过那一截，放到文件完多 1 帧、段尾或同一句接着放的下一截为止。
import fs from 'node:fs';
import path from 'node:path';
import { cue增益, type 段定义 } from '../../../content/段定义.ts';
import { 数据根 } from '../../环境/配置.ts';
import { 全部段, type 段信息 } from '../../清单/清单.ts';
import { 时长秒 } from '../../渲/探测.ts';
import { 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import { 上一段于, 台词头们, 开口表, 读台词表 } from '../../合成/台词落点.ts';

export type 清单条 = { 名: string; 档?: string; 文件: string; 起帧: number; 帧数: number; 入点秒: number; 速率: number; 循环: boolean; 增益: number[] };
export type 段清单 = { 音效清单: 清单条[]; 配乐清单: 清单条[]; 台词清单: 清单条[] };
type 段声音 = Pick<段定义, '声音' | 'fps' | '帧数'>;

/** 段.ts 的 cue → 三份清单；文件写成相对数据根的路径（音效拆分.py 的 文件根 = 数据根） */
export const 段的清单 = (
  s: 段信息,
  取文件: (资产id: string) => string,
  文件帧数: (file: string) => number,
  台词配音: Map<string, string>,
  开口: (id: string) => number,
  上一段?: 段声音,
): 段清单 => {
  const out: 段清单 = { 音效清单: [], 配乐清单: [], 台词清单: [] };
  const 相对 = (file: string) => path.relative(数据根(), file);
  for (const c of s.段.声音 ?? []) {
    if (c.台词 !== undefined) continue;
    const 条: 清单条 = {
      名: c.名,
      ...(c.档 !== undefined ? { 档: c.档 } : {}),
      文件: 相对(取文件(c.资产)),
      起帧: c.帧,
      帧数: c.帧数,
      入点秒: c.入点秒 ?? 0,
      速率: c.速率 ?? 1,
      循环: c.循环 ?? false,
      增益: Array.from({ length: c.帧数 }, (_, f) => cue增益(c, f)),
    };
    (c.资产.startsWith('配乐/') ? out.配乐清单 : out.音效清单).push(条);
  }
  const 头们 = 台词头们(s.段, 开口, 上一段);
  头们.forEach((h, i) => {
    const id = 台词配音.get(h.cue.台词);
    if (!id) throw new Error(`${s.键} 第 ${h.cue.帧} 帧的台词「${h.cue.台词}」在 story/台词.toml 里没写 配音`);
    const file = 取文件(id);
    const 起帧 = h.起帧;
    const 跳 = 起帧 - h.头;
    const 下一截 = 头们.slice(i + 1).find((x) => x.cue.接上段 && x.cue.台词 === h.cue.台词)?.cue.帧 ?? Infinity;
    const 帧数 = Math.min(h.cue.帧数 ?? Math.ceil(文件帧数(file) - 跳) + 1, 下一截 - 起帧, s.段.帧数 - 起帧);
    if (帧数 <= 0) return;
    out.台词清单.push({ 名: h.cue.台词, 文件: 相对(file), 起帧, 帧数, 入点秒: 跳 / s.段.fps, 速率: 1, 循环: false, 增益: Array(帧数).fill(1) });
  });
  return out;
};

/** 写 <目录>/{音效清单,配乐清单,台词清单}/<段键>.json 和 <目录>/段长.json；返回各段的声数 */
export const 写清单 = async (段们: 段信息[], 目录: string) => {
  const 锁 = 读资产锁();
  const 表 = 读台词表();
  const 台词配音 = new Map(表.flatMap((t) => (t.配音 ? [[t.id, t.配音] as const] : [])));
  const 开口 = 开口表(表);
  const 上一段 = 上一段于(await 全部段());
  const 帧数缓存 = new Map<string, number>();
  const 段长: Record<string, number> = {};
  const 计数: Record<string, number> = {};
  for (const s of 段们) {
    const 文件帧数 = (f: string) => 帧数缓存.get(f) ?? 帧数缓存.set(f, 时长秒(f) * s.段.fps).get(f)!;
    const 清单 = 段的清单(s, (id) => 解析资产(id, 锁).文件, 文件帧数, 台词配音, 开口, 上一段(s.键));
    for (const [类, 条们] of Object.entries(清单)) {
      fs.mkdirSync(path.join(目录, 类), { recursive: true });
      fs.writeFileSync(path.join(目录, 类, `${s.键}.json`), JSON.stringify(条们));
    }
    段长[s.键] = s.段.帧数;
    计数[s.键] = 清单.音效清单.length + 清单.配乐清单.length;
  }
  fs.writeFileSync(path.join(目录, '段长.json'), JSON.stringify(段长, null, 1));
  return 计数;
};
