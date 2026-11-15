// anim platform import <json> | anim platform analyze：B 站、抖音创作者中心数据（浏览器里跑各自 取数.js 下载的包）收进数据根，
// 对本地交付出一份报告：每个平台一节（各看各的关键指标），最后两平台对照。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../../cli/命令.ts';
import { UsageError, parseArgs } from '../../cli/参数.ts';
import { deliveryRoot } from '../../环境/配置.ts';
import { newPreviewDir } from '../../预览/预览.ts';
import { importData, latestData, parsePackage, type Submission } from '../bili/数据.ts';
import { bilibiliAdvice, bilibiliSection } from '../bili/报告.ts';
import { matchDelivery, statsBySegment, segmentRanges, readDeliveryList, defaultOpeningWindow, defaultEndingWindow } from '../bili/时间轴.ts';
import { importDouyin, latestDouyin, parseDouyin, type DouyinWork } from '../抖音/数据.ts';
import { douyinAdvice, douyinSection } from '../抖音/报告.ts';
import { chartPage, type CurveDraft, type MatchedRow } from './图与排名.ts';
import { comparisonPage, comparisonSection } from './对照.ts';

const parseSec = (v: string | undefined, optionName: string) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`${optionName} 要给非负的秒数`);
  return n;
};

const run: Command['跑'] = async (args, runRecord) => {
  const p = parseArgs(args, { 值: ['--head', '--tail'] });
  const [action, file] = p.位置;
  if (action === 'import') {
    if (p.位置.length !== 2) throw new UsageError('要给浏览器下载的 bili-数据-*.json 或 抖音-数据-*.json');
    const f = path.resolve(file!);
    const isDouyin = (JSON.parse(fs.readFileSync(f, 'utf8')) as { 平台?: string }).平台 === '抖音';
    const { 目标: targetPath, 包: rawPack } = isDouyin ? importDouyin(f) : importData(f);
    runRecord.产物.push(targetPath);
    const countText = '作品' in rawPack ? `${rawPack.作品.length} 个作品` : `${rawPack.稿件.length} 个稿件`;
    console.log(`${targetPath}（${countText}，${rawPack.请求数} 次请求${rawPack.停于风控 ? `，取数中途遇风控停了：${rawPack.停于风控}` : ''}）`);
    return;
  }
  if (action !== 'analyze' || p.位置.length !== 1) throw new UsageError('platform import <json> 或 platform analyze [--head <秒>] [--tail <秒>]');
  const headSec = parseSec(p.值['--head'], '--head') ?? defaultOpeningWindow;
  const tailSec = parseSec(p.值['--tail'], '--tail');
  const deliveryList = readDeliveryList(deliveryRoot());
  const alignCurves = <T extends CurveDraft>(curves: T[]) =>
    curves.flatMap((item): MatchedRow<T>[] => {
      const matchedDelivery = matchDelivery(item, deliveryList);
      if (!matchedDelivery) return [];
      const segRanges = segmentRanges(matchedDelivery.m);
      const edgeWindow = { headSec, tailSec: tailSec ?? defaultEndingWindow(segRanges) };
      return [{ curve: item, deliveryName: path.basename(matchedDelivery.目录), deliveryDoneAt: matchedDelivery.m.完成, 窗: edgeWindow, 段: statsBySegment(segRanges, item.留存, item.danmakuSec, edgeWindow) }];
    });

  const b = latestData();
  const submissions = parsePackage(b.包);
  const biliAligned = alignCurves<Submission>(submissions);
  const d = latestDouyin();
  const douyinWorks = d ? parseDouyin(d.包) : [];
  const douyinAligned = alignCurves<DouyinWork>(douyinWorks);

  const dir = newPreviewDir('平台数据分析');
  const writeChart = (filePrefix: string, matches: MatchedRow[], platformName: string, peerLegend?: string) => {
    const imageNames = new Map<string, string>();
    matches.forEach((x, i) => {
      const fileName = `${filePrefix}${String(i + 1).padStart(2, '0')}-${x.curve.id}-留存.html`;
      fs.writeFileSync(path.join(dir, fileName), chartPage(x, platformName, peerLegend), 'utf8');
      imageNames.set(x.curve.id, fileName);
    });
    return imageNames;
  };
  const biliChart = writeChart('B站-', biliAligned, 'B 站');
  const douyinChart = writeChart('抖音-', douyinAligned, '抖音', '平台给的同类作者参考线（非本作观众）');
  const platformNames: [string, string] = ['B 站', '抖音'];
  const comparisonPairs = biliAligned.flatMap((x) => douyinAligned.filter((y) => y.deliveryName === x.deliveryName).map((y) => [x, y] as const));
  const comparisonText = comparisonPairs.map(([x, y], i) => {
    const pageName = `对照-${String(i + 1).padStart(2, '0')}-${x.deliveryName}.html`;
    fs.writeFileSync(path.join(dir, pageName), comparisonPage(x, y, platformNames), 'utf8');
    return comparisonSection(x, y, platformNames, pageName);
  });
  const douyinText = d ? douyinSection(douyinWorks, douyinAligned, { 取于: d.包.取于, 请求数: d.包.请求数, 文件: d.f, 说明: d.包.说明 }, douyinChart) : '## 抖音\n\n数据根里还没有抖音数据：在浏览器里跑 pipeline/适配器/抖音/取数.js，再 anim platform import <json>。';
  const note = `# 平台数据分析

两个平台分发机制不同，分开解读：抖音刷到即播，先看前 5 秒；B 站点进来才播，先看封面标题点击率。各段的判断都用本平台自己的「开头窗、结尾窗之外在场观众每 10 秒流失」，最后一节才对照。

${douyinText}

${bilibiliSection(submissions, biliAligned, { 取于: b.包.取于, 请求数: b.包.请求数, 文件: b.f }, biliChart)}

## 两平台都掉人 / 都留得住的段

${comparisonText.join('\n\n') || '没有两个平台都对上同一份交付的作品。'}

## 建议

### 抖音（改开头几秒）

${douyinAdvice(douyinAligned, douyinWorks).map((s, i) => `${i + 1}. ${s}`).join('\n') || '—'}

### B 站（改封面标题，开头兑现封面）

${bilibiliAdvice(submissions, biliAligned).map((s, i) => `${i + 1}. ${s}`).join('\n') || '—'}

## 口径

- 「在场每 10 秒流失」= 1 −（出留存 / 进留存）^(10 / 时长)，按当时还在看的人算，不同位置的段可比；越往后在场的越是铁粉，后段天然偏低。
- 开头窗（默认 ${defaultOpeningWindow} 秒，\`--head\`）：推荐流「刷到就走」集中在开头，窗内的流失不记到段上，跨窗的段只算窗后；窗长是假设，B 站一节用同账号其他稿件同一时段检验。
- 结尾窗（默认最后一个段和最后 30 秒取较长的，\`--tail\`）：看出要结束就走是正常的，窗内不记到段上。
- 拖沓段 / 留得住的段：窗后、高于 / 低于本平台同一范围平均的段；短于半档的段数值只是所在档的平均，和相邻短段合成一组。
- 平台给的同类参考线（B 站同类稿件是拟合的平滑线，会外推出负数；抖音是同类作者）只画在图上，不参与计算。
- 段边界取交付 manifest 的全片起帧和帧率；作品发布早于交付完成时，上传的是更早的剪辑，段位置可能有偏差。
`;
  fs.writeFileSync(path.join(dir, '00-说明.md'), note, 'utf8');
  runRecord.产物.push(dir);
  const colText = (matches: MatchedRow[]) => matches.map((x) => `${x.curve.标题} ↔ ${x.deliveryName}`).join('；') || '无';
  console.log(`${dir}\nB 站 ${submissions.length} 个稿件，对上 ${colText(biliAligned)}\n抖音 ${douyinWorks.length} 个作品，对上 ${colText(douyinAligned)}`);
};

const platform: Command = {
  用法: 'platform import <json> | platform analyze [--head <秒>] [--tail <秒>]',
  说明: 'import：把浏览器里 pipeline/适配器/bili/取数.js 或 抖音/取数.js 下载的包挪进数据根 平台/<bilibili|抖音>/<UTC>/；analyze：读各平台最新一份，对到本作品的交付，出 预览/<UTC>-平台数据分析/（抖音前 5 秒、B 站封标、各平台窗后按段的在场流失、两平台对照、分平台建议）',
  跑: run,
};

export const platformCommands: Record<string, Command> = { platform };
