// 各段的音效、配乐、台词清单（格式同 engine/audio/音效清单.ts 的 SfxClipLog），给 音效拆分.py 一声一个片段地合成。
// 旧项目是 exportSfx 渲第 0 帧收浏览器日志（导出音效清单.mjs）；新管线照 docs/架构.md 直接读段.ts 的声音 cue，不渲染。
// cue 现在只有 帧 和 资产（增益、档、淡出等 M5 定），所以每声从文件头放到文件完或段尾、音量 1；配乐 = 资产 id 以 配乐/ 开头。
// 台词清单的起帧是配音文件头：开口落在 cue 帧，文件头在段开头之前的从文件里跳过那一截。
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../../环境/配置.ts';
import type { 段信息 } from '../../清单/清单.ts';
import { 时长秒 } from '../../渲/探测.ts';
import { 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import { 读台词表, 读开口表 } from '../../合成/台词落点.ts';

export type 清单条 = { 名: string; 档?: string; 文件: string; 起帧: number; 帧数: number; 入点秒: number; 速率: number; 循环: boolean; 增益: number[] };
export type 段清单 = { 音效清单: 清单条[]; 配乐清单: 清单条[]; 台词清单: 清单条[] };

/** 段.ts 的 cue → 三份清单；文件写成相对数据根的路径（音效拆分.py 的 文件根 = 数据根） */
export const 段的清单 = (s: 段信息, 取文件: (资产id: string) => string, 文件帧数: (file: string) => number, 台词配音: Map<string, string>, 开口表: Map<string, number>): 段清单 => {
  const out: 段清单 = { 音效清单: [], 配乐清单: [], 台词清单: [] };
  const fps = s.段.fps;
  for (const c of s.段.声音 ?? []) {
    const id = c.台词 !== undefined ? 台词配音.get(c.台词) : c.资产!;
    if (!id) throw new Error(`${s.键} 第 ${c.帧} 帧的台词「${c.台词}」在 story/台词.toml 里没写 配音`);
    const file = 取文件(id);
    let 起帧 = c.帧;
    let 入点秒 = 0;
    if (c.台词 !== undefined) {
      const 头 = c.帧 - (开口表.get(c.台词) ?? 0) * fps;
      起帧 = Math.max(0, Math.ceil(头));
      入点秒 = (起帧 - 头) / fps;
    }
    const 帧数 = Math.min(Math.ceil(文件帧数(file) - 入点秒 * fps), s.段.帧数 - 起帧);
    if (帧数 <= 0) continue;
    const 条: 清单条 = { 名: c.台词 ?? id.split('/').pop()!, 文件: path.relative(数据根(), file), 起帧, 帧数, 入点秒, 速率: 1, 循环: false, 增益: Array(帧数).fill(1) };
    (c.台词 !== undefined ? out.台词清单 : id.startsWith('配乐/') ? out.配乐清单 : out.音效清单).push(条);
  }
  return out;
};

/** 写 <目录>/{音效清单,配乐清单,台词清单}/<段键>.json 和 <目录>/段长.json；返回各段的声数 */
export const 写清单 = (段们: 段信息[], 目录: string) => {
  const 锁 = 读资产锁();
  const 台词配音 = new Map(读台词表().flatMap((t) => (t.配音 ? [[t.id, t.配音] as const] : [])));
  const 开口表 = 读开口表();
  const 帧数缓存 = new Map<string, number>();
  const 段长: Record<string, number> = {};
  const 计数: Record<string, number> = {};
  for (const s of 段们) {
    const 文件帧数 = (f: string) => 帧数缓存.get(f) ?? 帧数缓存.set(f, 时长秒(f) * s.段.fps).get(f)!;
    const 清单 = 段的清单(s, (id) => 解析资产(id, 锁).文件, 文件帧数, 台词配音, 开口表);
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
