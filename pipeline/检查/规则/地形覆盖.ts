// terrain：裁过的地形包够不够全片用（docs/世界.md「裁级」）。用的是存着的地形覆盖（渲/地形覆盖.ts，按段指纹认），不当场开浏览器量：
// - 段的覆盖没量过、或量完段又改了：提示，给 anim world cover 的命令（量完再 check 才知道缺不缺）；
// - 覆盖是新的、用到的区段裁过的包里没有：违规，列段、头一次用到的帧、区段和重裁命令（不重裁，出片那一帧会报「缺级」）；
// - 裁过的包不是从现登记的完整包裁的：违规，重裁。
// 要算段指纹，--fast 跳过。
import fs from 'node:fs';
import path from 'node:path';
import { codeRoot } from '../../环境/路径.ts';
import { dataPath } from '../../环境/配置.ts';
import { loadAllSegments } from '../../清单/清单.ts';
import { coverStatus, inWork, segsUsingPacks } from '../../渲/地形覆盖.ts';
import type { CheckContext, CheckReport } from '../../源码/上下文.ts';

type Entry = { version: string; trimmed?: { version: string; from: string } };
const tablePath = 'assets/地形版本.json';

export const checkTerrainCover = async (c: CheckContext, report: CheckReport) => {
  const table = ((c.readJson(tablePath) ?? {}) as { pack?: Record<string, Entry> }).pack ?? {};
  const trimmed = Object.entries(table).filter(([, v]) => v.trimmed);
  if (!trimmed.length) return;
  // 覆盖和段指纹都按本仓库算（测试的夹具仓库没有这些）
  if (c.root !== fs.realpathSync(codeRoot())) {
    report.skipped.push('不是本仓库，不查地形覆盖');
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
    const status = await coverStatus(allSegments, segs);
    const stale = status.filter((x) => x.stale);
    if (stale.length) report.notice(`${stale.length} 段的地形覆盖${stale.every((x) => !x.cover) ? '没量过' : '没量过或段改过'}，不知道裁过的包够不够：anim world cover ${stale.map((x) => x.segment.key).join(' ')}（不出图；量完再 check）`);
    let checkedSegs = 0;
    for (const x of status) {
      if (x.stale) continue;
      checkedSegs++;
      for (const [pack, v] of trimmed) {
        const used = x.cover!.pack[pack]?.sections;
        if (!used) continue;
        const keep = keepSet(pack, v.trimmed!.version);
        if (!keep) {
          report.notice(`裁过的包 ${pack}/${v.trimmed!.version} 不在本机，查不了 ${x.segment.key} 缺不缺：anim assets pull`);
          continue;
        }
        const missing = Object.entries(used).filter(([k]) => !keep.has(k)).sort((a, b) => a[1] - b[1]);
        if (missing.length)
          report.错(`${x.segment.key} 用到的 ${missing.length} 个区段裁过的包 ${pack}/${v.trimmed!.version} 里没有（出片到那一帧报「缺级」）：${missing.slice(0, 5).map(([k, f]) => `${k}（第 ${f} 帧）`).join('、')}${missing.length > 5 ? ' …' : ''}；重裁 anim world trim ${pack}`, x.segment.segmentFile);
      }
    }
    report.infoLines.push(`地形覆盖：${trimmed.map(([p]) => p).join('、')} 裁过；${segs.length} 段用到，${checkedSegs} 段的覆盖是新的、核过留表`);
  });
};
