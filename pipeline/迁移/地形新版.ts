// 地形包里的 JSON（包.json、远景*.json、交界.*.json）改键名：版本目录发布后只增不改，所以克隆登记的那一版（APFS 上 cp -c）、
// 在暂存目录里改键、算目录指纹、改名成新版本目录，再改 assets/地形版本.json 的登记（版本、文件数、大小、清单sha256）。旧版本不删。
// 冻结粗高度（assets/冻结粗高度/<包>.json）记着版本，跑完要 anim world freeze --write；新版本要照地形包的发布流程上传。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dirFingerprint, packManifest } from '../世界/版本.ts';
import { FORMATS } from './格式.ts';
import { loadKeyTable } from './键表.ts';
import { planFile, writeKeepingTimes, verifyRename, type Roots } from './盘键.ts';

export type TerrainPlan = { pack: string; from: string; files: { rel: string; format: string; renamed: number }[]; to?: string; skipped?: string };

const terrainFormats = FORMATS.filter((f) => f.root === 'terrain');

const listJson = (dir: string, rel = '', out: string[] = []) => {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) listJson(dir, r, out);
    else if (e.isFile() && e.name.endsWith('.json')) out.push(r);
  }
  return out;
};

/** 地形版本.json 里的字段，迁移前后两种键都认 */
const field = (entry: Record<string, unknown>, zh: string) => {
  const en = loadKeyTable('地形版本').forward.get(zh)!;
  return en in entry ? en : zh;
};

export const migrateTerrain = async (o: { roots: Roots; only?: string[]; dryRun: boolean; log: (s: string) => void }) => {
  const tablePath = path.join(o.roots.repo, 'assets', '地形版本.json');
  const table = JSON.parse(fs.readFileSync(tablePath, 'utf8')) as Record<string, unknown>;
  const packsKey = field(table, '包');
  const packs = table[packsKey] as Record<string, Record<string, unknown>>;
  const results: TerrainPlan[] = [];
  for (const [pack, entry] of Object.entries(packs)) {
    if (o.only?.length && !o.only.includes(pack)) continue;
    const from = entry[field(entry, '版本')] as string;
    const dir = path.join(o.roots.data, 'terrain', pack, from);
    const result: TerrainPlan = { pack, from, files: [] };
    results.push(result);
    if (!fs.existsSync(dir)) {
      result.skipped = '本机没有这一版（anim assets pull 拉下来再迁）';
      continue;
    }
    const plans = listJson(dir).flatMap((rel) => {
      const f = terrainFormats.find((x) => x.file.test(path.posix.basename(rel)));
      return f ? [{ f, p: planFile(f, loadKeyTable(f.id), dir, rel) }] : [];
    });
    const bad = plans.filter(({ p }) => p.problems.length);
    if (bad.length) throw new Error(`${pack}/${from}：${bad.map(({ p }) => `${p.rel} ${p.problems.join('；')}`).join(' | ')}`);
    result.files = plans.filter(({ p }) => p.renamed).map(({ f, p }) => ({ rel: p.rel, format: f.id, renamed: p.renamed }));
    if (!result.files.length) {
      result.skipped = '没有要改的键';
      continue;
    }
    if (o.dryRun) continue;
    const stage = path.join(o.roots.data, 'run', '暂存', 'terrain', `${pack}.盘键迁移`);
    if (fs.existsSync(stage)) throw new Error(`暂存目录已经有了（上次没跑完？）：${stage}，看过删掉再跑`);
    fs.mkdirSync(path.dirname(stage), { recursive: true });
    if (process.platform === 'darwin') execFileSync('cp', ['-cR', dir, stage]);
    else fs.cpSync(dir, stage, { recursive: true, preserveTimestamps: true });
    for (const { f, p } of plans.filter(({ p }) => p.renamed)) {
      const abs = path.join(stage, p.rel);
      writeKeepingTimes(abs, p.after);
      const problems = verifyRename(f.lang, p.before, fs.readFileSync(abs, 'utf8'), loadKeyTable(f.id));
      if (problems.length) throw new Error(`${pack} 暂存里的 ${p.rel} 读回核对没过：${problems.join('；')}（暂存目录留着：${stage}）`);
    }
    const to = dirFingerprint(stage);
    const dest = path.join(o.roots.data, 'terrain', pack, to);
    if (fs.existsSync(dest)) fs.rmSync(stage, { recursive: true, force: true });
    else fs.renameSync(stage, dest);
    const m = await packManifest(dest);
    entry[field(entry, '版本')] = to;
    entry[field(entry, '文件数')] = m.文件数;
    entry[field(entry, '大小')] = m.大小;
    entry[field(entry, '清单sha256')] = m.清单sha256;
    const sourceKey = field(entry, '来源');
    entry[sourceKey] = `${entry[sourceKey] as string}；盘键迁移从 ${from} 改键名`;
    result.to = to;
    o.log(`${pack}：${from} → ${to}（改了 ${result.files.map((x) => x.rel).join('、')}）`);
  }
  if (!o.dryRun && results.some((r) => r.to)) fs.writeFileSync(tablePath, JSON.stringify(table, null, 2) + '\n');
  return results;
};
