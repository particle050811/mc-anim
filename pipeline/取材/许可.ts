// 取材产物的许可按 jar 继承：jars.toml 每个 jar 的「许可」是结构化字段（代码、资源，可选 声音、结构、模型），值是 SPDX 表达式。
// 资产表里 来源 = 提取:<配方>@<sha12>[+<sha12>…] 的条目，按 @ 后面每个 jar 取「这类资产对应的那一部分」许可，用 AND 连起来（一张图集可能拼了几个 jar 的贴图，取最严的合取）。
// 值以 LicenseRef-待定 或 LicenseRef-待核- 开头的算没定（比如只知道是 CC BY-NC-SA、版本没核），继承出来仍是待定，列进 assets/待确认.md 等用户定。

export const licensePartValues = ['代码', '资源', '声音', '结构', '模型'] as const;
export type LicensePart = (typeof licensePartValues)[number];
export type JarLicense = Partial<Record<LicensePart, string>> & { 原文?: string; 依据?: string };

/** 没写的部分退回哪一部分：声音、结构、模型 没单独写的照 资源 */
const fallback: Record<LicensePart, LicensePart[]> = { 代码: ['代码'], 资源: ['资源'], 声音: ['声音', '资源'], 结构: ['结构', '资源'], 模型: ['模型', '资源'] };

/** 资产类别默认取 jar 的哪一部分；配方可用「许可部分」改（比如从模组 Java 代码里读出几何的实体模型，加上 代码） */
export const defaultParts = (category: string): LicensePart[] => (category === '音效' ? ['声音'] : category === '模型' ? ['模型'] : ['资源']);

export const pendingLicense = 'LicenseRef-待定';
export const undetermined = (spdx: string | undefined) => !spdx || spdx === pendingLicense || spdx.startsWith('LicenseRef-待核');

/** jars.toml 的「许可」：结构化表；旧写法（一句话）当成没定，原文留着给人看 */
export const readJarLicense = (raw: unknown): JarLicense => {
  if (typeof raw === 'string') return { 原文: raw };
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const invalidKeys = Object.keys(o).filter((k) => !(licensePartValues as readonly string[]).includes(k) && k !== '原文' && k !== '依据');
  if (invalidKeys.length) throw new Error(`jars.toml 的「许可」只认 ${licensePartValues.join('、')}、原文、依据，多了 ${invalidKeys.join('、')}`);
  return o as JarLicense;
};

export const getPart = (l: JarLicense, part: LicensePart): string | undefined => {
  for (const p of fallback[part]) if (l[p]) return l[p];
  return undefined;
};

/** 几个 SPDX 表达式用 AND 合起来：去重，带 OR 的加括号 */
export const conjunction = (exprs: readonly string[]): string => {
  const unique = [...new Set(exprs.map((s) => s.trim()))];
  if (unique.length === 1) return unique[0]!;
  return unique.map((s) => (/\sOR\s/.test(s) && !/^\(.*\)$/.test(s) ? `(${s})` : s)).join(' AND ');
};

export type LicenseEntry = { id: string; license: JarLicense };
/** jars.toml 一条里查许可要的字段（清单.ts 的 JarRecord 带着这些；只写这几个，许可.ts 不引 清单.ts，免得两边互引） */
export type LicensedJar = { id: string; sha256?: string; license?: JarLicense; oldSha256Prefixes?: string[] };
/**
 * sha256 前 12 位 → jar；资源索引另认 jars.toml 里记的历史前缀（Mojang 会更新同一个索引文件）。
 * 现算：jars.toml 没记 sha256 的（资源索引），按本机文件现算的前缀也认（登记时来源就是这么算的，见 登记.ts 来源串）；算不出返回 undefined
 */
export const licenseTable = (jars: Iterable<LicensedJar>, computeLocalSha?: (id: string) => string | undefined): Map<string, LicenseEntry> => {
  const m = new Map<string, LicenseEntry>();
  for (const j of jars) {
    const item = { id: j.id, license: j.license ?? {} };
    if (j.sha256) m.set(j.sha256.slice(0, 12), item);
    for (const p of j.oldSha256Prefixes ?? []) m.set(p, item);
    const localId = j.sha256 ? undefined : computeLocalSha?.(j.id);
    if (localId && !m.has(localId)) m.set(localId, item);
  }
  return m;
};

export type InheritResult = { license?: string; missing: string[] };

/** 来源（提取:<配方>@<sha12>+…）→ 继承的许可；有一个 jar 不认识或那一部分没定，就不给许可、在 缺 里说原因 */
export const inheritLicense = (source: string, parts: readonly LicensePart[], licenseTable: Map<string, LicenseEntry>): InheritResult => {
  const m = /^提取:[^@]+@([0-9a-f]{12}(?:\+[0-9a-f]{12})*)$/.exec(source);
  if (!m) return { missing: [`来源「${source}」不是 提取:<配方>@<jar sha>`] };
  const exprs: string[] = [];
  const missing: string[] = [];
  for (const sha of m[1]!.split('+')) {
    const j = licenseTable.get(sha);
    if (!j) {
      missing.push(`${sha} 不是 jars.toml 里哪个 jar 的 sha256 前缀`);
      continue;
    }
    for (const p of parts) {
      const v = getPart(j.license, p);
      if (undetermined(v)) missing.push(`${j.id} 的${p}许可${v ? ` ${v}` : '没写'}${j.license.原文 && !v ? `（原文：${j.license.原文}）` : ''}`);
      else exprs.push(v!);
    }
  }
  return missing.length ? { missing } : { license: conjunction(exprs), missing };
};
