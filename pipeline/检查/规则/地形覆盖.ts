// terrain：裁过的地形包够不够全片用（docs/世界.md「裁级」）。用加载计划（渲/加载计划.ts，按段指纹认，旧了当场在 Node 里算，一段几秒）：
// - 计划用到的区段裁过的包里没有：违规，列段、头一次用到的帧、区段和重裁命令（不重裁，出片那一帧会报「缺级」）；
// - 声明了地形包的段没有地形视图：违规（算不了计划）；
// - 裁过的包不是从现登记的完整包裁的：违规，重裁。
// 要算段指纹，--fast 跳过。
import fs from 'node:fs';
import { terrainPolicies } from '../../世界/版本.ts';
import path from 'node:path';
import { codeRoot } from '../../环境/路径.ts';
import { dataPath } from '../../环境/配置.ts';
import { loadAllSegments } from '../../清单/清单.ts';
import { freshPlans, inWork, segsUsingPacks } from '../../渲/加载计划.ts';
import type { CheckContext, CheckReport } from '../../源码/上下文.ts';

type Entry = { version: string; trimmed?: { version: string; from: string } };
const tablePath = 'assets/地形版本.json';

export const checkTerrainCover = async (c: CheckContext, report: CheckReport) => {
  const table = ((c.readJson(tablePath) ?? {}) as { pack?: Record<string, Entry> }).pack ?? {};
  const trimmed = Object.entries(terrainPolicies(table)).filter(([, v]) => v.trimmed);
  if (!trimmed.length) return;
  // 计划和段指纹都按本仓库算（测试的夹具仓库没有这些）
  if (c.root !== fs.realpathSync(codeRoot())) {
    report.skipped.push('不是本仓库，不查裁级缺不缺');
    return;
  }
  for (const [pack, v] of trimmed) if (v.trimmed!.from !== v.version) report.错(`${pack} 裁过的包 ${v.trimmed!.version} 是从 ${v.trimmed!.from} 裁的，登记的完整包已经是 ${v.version}：anim world trim ${pack}`, tablePath);
  const keepOf = new Map<string, Set<string> | null>();
  const keepSet = (pack: string, version: string) => {
    if (!keepOf.has(pack)) {
      const f = path.join(c.dataRoot ?? dataPath(), 'terrain', pack, version, '留表.tsv');
      keepOf.set(pack, fs.existsSync(f) ? new Set(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t').join('|'))) : null);
    }
    return keepOf.get(pack)!;
  };
  await inWork(c.workName, async () => {
    const allSegments = await loadAllSegments();
    const segs = segsUsingPacks(allSegments, trimmed.map(([p]) => p));
    if (!segs.length) return;
    let plans;
    try {
      plans = (await freshPlans(allSegments, segs)).plans;
    } catch (e) {
      report.错(`加载计划算不出来：${(e as Error).message.split('\n')[0]}`);
      return;
    }
    for (const plan of plans) {
      const seg = segs.find((s) => s.key === plan.segment)!;
      for (const [pack, v] of trimmed) {
        const used = plan.pack[pack]?.sections;
        if (!used) continue;
        const keep = keepSet(pack, v.trimmed!.version);
        if (!keep) {
          report.notice(`裁过的包 ${pack}/${v.trimmed!.version} 不在本机，查不了 ${plan.segment} 缺不缺：anim assets pull`);
          continue;
        }
        const missing = Object.entries(used).filter(([k]) => !keep.has(k)).sort((a, b) => a[1] - b[1]);
        if (missing.length)
          report.错(`${plan.segment} 用到的 ${missing.length} 个区段裁过的包 ${pack}/${v.trimmed!.version} 里没有（需要重新规划，不能把缺级回退当成已覆盖）：${missing.slice(0, 5).map(([k, f]) => `${k}（第 ${f} 帧）`).join('、')}${missing.length > 5 ? ' …' : ''}；${'policies' in (table[pack] ?? {}) ? '重算定级、world bake-far 重烘' : `重裁 anim world trim ${pack}`}`, seg.segmentFile);
      }
    }
    report.infoLines.push(`加载计划：${trimmed.map(([p]) => p).join('、')} 裁过；${segs.length} 段用到，计划都核过留表`);
  });
};
