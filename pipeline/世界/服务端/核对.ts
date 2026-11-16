// 开服前、开服后的核对：世界里的数据包要的模组类在不在 mods/ 的 jar 里，覆盖别人的包有没有启用、排在被盖的包之上。
// 旧项目 取材服务端.py 只认取材 mod 的生成时修整（mcai:region / mcai:edit），这里写成一张表，以后加别的「数据包要靠模组才读得进」照样加一行。
import fs from 'node:fs';
import path from 'node:path';
import { ReadOnlyZip } from './zip.ts';

/** 数据包 data/ 下的文件：相对路径（data/…）→ 读内容 */
export const packEntries = (src: string): Map<string, () => Buffer> => {
  const o = new Map<string, () => Buffer>();
  if (fs.statSync(src).isDirectory()) {
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) walk(f);
        else o.set(path.relative(src, f).split(path.sep).join('/'), () => fs.readFileSync(f));
      }
    };
    if (fs.existsSync(path.join(src, 'data'))) walk(path.join(src, 'data'));
  } else if (src.endsWith('.zip')) {
    const z = new ReadOnlyZip(src);
    for (const n of z.names()) if (n.startsWith('data/') && !n.endsWith('/')) o.set(n, () => z.读(n));
  }
  return o;
};

/** 世界 datapacks/ 里的数据包（zip，或带 pack.mcmeta 的目录），按名字排（服务端也按 id 排序加载） */
export const worldDatapacks = (saveDir: string) => {
  const d = path.join(saveDir, 'datapacks');
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .sort()
    .filter((n) => (n.endsWith('.zip') && fs.statSync(path.join(d, n)).isFile()) || fs.existsSync(path.join(d, n, 'pack.mcmeta')))
    .map((n) => ({ name: n, path: path.join(d, n) }));
};

export type ModRequirement = {
  name: string;
  /** 数据包里有没有用到 */
  applies: (entryMap: Map<string, () => Buffer>) => boolean;
  /** mods/ 里哪个 jar 要有哪个类 */
  jar: RegExp;
  type: string;
  /** 用到它的包要排在它覆盖的包之上（后加载的盖前面的） */
  overridesOthers: boolean;
  missing: string;
  /** 开服后启动日志里模组认出这个包时打的话（没有就是模组没生效，数据包白放）；条件省了 = 总要有 */
  startupLogs?: { 行: string; condition?: (entryMap: Map<string, () => Buffer>) => boolean }[];
};

export const MOD_REQUIREMENTS: ModRequirement[] = [
  {
    name: '生成时修整',
    applies: (e) => [...e].some(([k, r]) => /^data\/[^/]+\/worldgen\/density_function\/.+\.json$/.test(k) && /"mcai:(edit|region)"/.test(r().toString('utf8'))),
    jar: /^mcai-.*\.jar$/,
    type: 'mcai/terrain/TerrainTypes.class',
    overridesOthers: true,
    missing: '取材 mod 没有修整（mcai:region、mcai:edit）：专用服务端读不进修整包会起不来。anim mcai build 装上含修整的 jar（别的分支 build 的可能不含）',
  },
  {
    // 暮色放大 4 倍：mod 认包里的标记文件才放大地标网格，只有数据包的话首领建筑会重复十几座（sourcing/mod/MANUAL.md「暮色森林放大 4 倍」）
    name: '暮色放大 4 倍',
    applies: (e) => e.has('data/mcai/twilight_x4.json'),
    jar: /^mcai-.*\.jar$/,
    type: 'mcai/TwilightGrid.class',
    overridesOthers: false,
    missing: '取材 mod 没有暮色地标网格（TwilightGrid）：只有数据包的话暮色首领建筑会重复十几座。anim mcai build 装上',
    startupLogs: [{ 行: '暮色地标网格：64 区块' }],
  },
  {
    // 古城放大 4 倍（第 6 章第 4 场、第 7 章）：mod 的 BigJigsaw 放开原版拼图 8 区块上限，没有的话服务端读不进放大的古城
    name: '古城放大 4 倍',
    applies: (e) => e.has('data/minecraft/worldgen/structure/ancient_city.json') && [...e.keys()].some((k) => k.startsWith('data/mcai/')),
    jar: /^mcai-.*\.jar$/,
    type: 'mcai/BigJigsaw.class',
    overridesOthers: false,
    missing: '取材 mod 没有 BigJigsaw：读不进放大的远古城市。anim mcai build 装上',
    startupLogs: [
      { 行: '大拼图结构：minecraft:ancient_city' },
      // 带结构标签 mcai:fill_biome 的包，城底下那一层铺成深暗之域（mcai.FillBiome）
      { 行: '铺满群系：minecraft:ancient_city → minecraft:deep_dark', condition: (e) => e.has('data/mcai/tags/worldgen/structure/fill_biome.json') },
    ],
  },
];

/** 开服前：世界用到的数据包要的模组类都在吗；返回问题列表和要盖住别人的包 */
export const checkBeforeStart = (serverDir: string, saveDir: string) => {
  const issues: string[] = [];
  const overrides: string[] = [];
  const mods = path.join(serverDir, 'mods');
  const jars = fs.existsSync(mods) ? fs.readdirSync(mods).filter((n) => n.endsWith('.jar')) : [];
  for (const p of worldDatapacks(saveDir)) {
    const e = packEntries(p.path);
    for (const r of MOD_REQUIREMENTS) {
      if (!r.applies(e)) continue;
      if (r.overridesOthers) overrides.push(p.name);
      const hasClass = jars.filter((n) => r.jar.test(n)).some((n) => new ReadOnlyZip(path.join(mods, n)).entryMap.has(r.type));
      if (!hasClass) issues.push(`数据包 ${p.name} 用到${r.name}，可 ${mods} 里没有含 ${r.type} 的 jar：${r.missing}`);
    }
  }
  return { issues, overrides };
};

/** 开服后启动日志里该有哪几句：世界里的数据包用到的模组功能，模组认出来时会打 */
export const requiredStartupLogs = (saveDir: string): { pack: string; 行: string }[] => {
  const o: { pack: string; 行: string }[] = [];
  for (const p of worldDatapacks(saveDir)) {
    const e = packEntries(p.path);
    for (const r of MOD_REQUIREMENTS) if (r.applies(e)) for (const l of r.startupLogs ?? []) if (!l.condition || l.condition(e)) o.push({ pack: p.name, 行: l.行 });
  }
  return o;
};

/** 开服后：/datapack list enabled 那一行解析出启用的包（按加载顺序） */
export const parseEnabledPacks = (line: string) => [...line.matchAll(/\[(\S+) \(/g)].map((m) => m[1]!);

/** 要盖住别人的包启用了、并且排在和它有重叠文件的包之上 */
export const checkOrder = (saveDir: string, overrides: readonly string[], enabled: readonly string[]) => {
  const issues: string[] = [];
  const packs = worldDatapacks(saveDir);
  for (const dataPackName of overrides) {
    const fileKey = `file/${dataPackName}`;
    if (!enabled.includes(fileKey)) {
      issues.push(`数据包 ${fileKey} 没有启用（启用的：${enabled.join('、') || '无'}）`);
      continue;
    }
    const mine = new Set(packEntries(path.join(saveDir, 'datapacks', dataPackName)).keys());
    for (const p of packs) {
      if (p.name === dataPackName) continue;
      const other = `file/${p.name}`;
      if (!enabled.includes(other) || enabled.indexOf(other) < enabled.indexOf(fileKey)) continue;
      if ([...packEntries(p.path).keys()].some((k) => mine.has(k))) issues.push(`数据包 ${fileKey} 排在 ${other} 下面，覆盖的文件会被它盖回去`);
    }
  }
  return issues;
};
