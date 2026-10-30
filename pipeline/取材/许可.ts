// 取材产物的许可按 jar 继承：jars.toml 每个 jar 的「许可」是结构化字段（代码、资源，可选 声音、结构、模型），值是 SPDX 表达式。
// 资产表里 来源 = 提取:<配方>@<sha12>[+<sha12>…] 的条目，按 @ 后面每个 jar 取「这类资产对应的那一部分」许可，用 AND 连起来（一张图集可能拼了几个 jar 的贴图，取最严的合取）。
// 值以 LicenseRef-待定 或 LicenseRef-待核- 开头的算没定（比如只知道是 CC BY-NC-SA、版本没核），继承出来仍是待定，列进 assets/待确认.md 等用户定。
import type { jar登记 } from './清单.ts';

export const 许可部分取值 = ['代码', '资源', '声音', '结构', '模型'] as const;
export type 许可部分 = (typeof 许可部分取值)[number];
export type jar许可 = Partial<Record<许可部分, string>> & { 原文?: string; 依据?: string };

/** 没写的部分退回哪一部分：声音、结构、模型 没单独写的照 资源 */
const 退回: Record<许可部分, 许可部分[]> = { 代码: ['代码'], 资源: ['资源'], 声音: ['声音', '资源'], 结构: ['结构', '资源'], 模型: ['模型', '资源'] };

/** 资产类别默认取 jar 的哪一部分；配方可用「许可部分」改（比如从模组 Java 代码里读出几何的实体模型，加上 代码） */
export const 默认部分 = (类别: string): 许可部分[] => (类别 === '音效' ? ['声音'] : 类别 === '模型' ? ['模型'] : ['资源']);

export const 待定许可 = 'LicenseRef-待定';
export const 没定 = (spdx: string | undefined) => !spdx || spdx === 待定许可 || spdx.startsWith('LicenseRef-待核');

/** jars.toml 的「许可」：结构化表；旧写法（一句话）当成没定，原文留着给人看 */
export const 读jar许可 = (raw: unknown): jar许可 => {
  if (typeof raw === 'string') return { 原文: raw };
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const 坏 = Object.keys(o).filter((k) => !(许可部分取值 as readonly string[]).includes(k) && k !== '原文' && k !== '依据');
  if (坏.length) throw new Error(`jars.toml 的「许可」只认 ${许可部分取值.join('、')}、原文、依据，多了 ${坏.join('、')}`);
  return o as jar许可;
};

export const 取部分 = (l: jar许可, 部分: 许可部分): string | undefined => {
  for (const p of 退回[部分]) if (l[p]) return l[p];
  return undefined;
};

/** 几个 SPDX 表达式用 AND 合起来：去重，带 OR 的加括号 */
export const 合取 = (式们: readonly string[]): string => {
  const 去重 = [...new Set(式们.map((s) => s.trim()))];
  if (去重.length === 1) return 去重[0]!;
  return 去重.map((s) => (/\sOR\s/.test(s) && !/^\(.*\)$/.test(s) ? `(${s})` : s)).join(' AND ');
};

export type 许可表项 = { id: string; 许可: jar许可 };
/** sha256 前 12 位 → jar；资源索引另认 jars.toml 里记的历史前缀（Mojang 会更新同一个索引文件） */
export const 许可表 = (jars: Iterable<jar登记>): Map<string, 许可表项> => {
  const m = new Map<string, 许可表项>();
  for (const j of jars) {
    const 项 = { id: j.id, 许可: j.许可 ?? {} };
    if (j.sha256) m.set(j.sha256.slice(0, 12), 项);
    for (const p of j.旧sha256前缀 ?? []) m.set(p, 项);
  }
  return m;
};

export type 继承结果 = { 许可?: string; 缺: string[] };

/** 来源（提取:<配方>@<sha12>+…）→ 继承的许可；有一个 jar 不认识或那一部分没定，就不给许可、在 缺 里说原因 */
export const 继承许可 = (来源: string, 部分们: readonly 许可部分[], 表: Map<string, 许可表项>): 继承结果 => {
  const m = /^提取:[^@]+@([0-9a-f]{12}(?:\+[0-9a-f]{12})*)$/.exec(来源);
  if (!m) return { 缺: [`来源「${来源}」不是 提取:<配方>@<jar sha>`] };
  const 式们: string[] = [];
  const 缺: string[] = [];
  for (const sha of m[1]!.split('+')) {
    const j = 表.get(sha);
    if (!j) {
      缺.push(`${sha} 不是 jars.toml 里哪个 jar 的 sha256 前缀`);
      continue;
    }
    for (const p of 部分们) {
      const v = 取部分(j.许可, p);
      if (没定(v)) 缺.push(`${j.id} 的${p}许可${v ? ` ${v}` : '没写'}${j.许可.原文 && !v ? `（原文：${j.许可.原文}）` : ''}`);
      else 式们.push(v!);
    }
  }
  return 缺.length ? { 缺 } : { 许可: 合取(式们), 缺 };
};
