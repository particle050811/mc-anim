// anim cache gc [--执行] [--只 <类>…] [--近期天数 N] [--草稿天数 N] [--webpack天数 N] [--列段天数 N] [--详细]：缓存回收，默认只打印要删什么、能省多少。
// --作品 只限定母版、去重（cache/ 按作品分）；草稿、webpack 缓存不分作品。规则见 回收.ts。
// --执行 过渲染闸（拿着渲染锁算计划、删）：film 渲段写切片在闸里，不会和它同时；film 接片时只读切片不拿锁，靠「每段每级别最近一份」和近 2 小时的 .用过 留着它要的。只看不删不过闸。
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { currentWork, getSpecifiedWork } from '../环境/作品.ts';
import { dataRoot } from '../环境/配置.ts';
import { passRenderGate } from '../闸/闸.ts';
import { savableBytes } from './去重.ts';
import { keepClassOrder, sizeText, Subtotal, type KeepReason } from './回收.ts';
import { reclaimKinds, defaultDays, computeReclaimPlan, runReclaim, type ReclaimClass, type ReclaimPlan } from './计划.ts';

const parseDays = (v: string | undefined, defaultDays: number, optionName: string) => {
  if (v === undefined) return defaultDays;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`${optionName} 要是不小于 0 的天数`);
  return n;
};

const reasonText = (reasons: readonly KeepReason[]) => [...new Set(reasons.map((x) => `${x.类}（${x.说明}）`))].join('、');

const printSubtotal = (groupName: string, items: readonly { 大小: number; 理由: readonly KeepReason[] }[], unit: string) => {
  const s = Subtotal(items);
  const parts = keepClassOrder.filter((c) => s.byReason[c]).map((c) => `${c} ${sizeText(s.byReason[c]!)}`);
  const unfreedNote = s.hardlinkUnfreed ? `；另有 ${sizeText(s.hardlinkUnfreed)} 的名字删了也不腾空间（硬链接还在别处）` : '';
  console.log(`${groupName.padEnd(8)} 删 ${s.deletedCount} ${unit} ${sizeText(s.deletedSize)}，留 ${s.keptCount} ${unit} ${sizeText(s.keptSize)}${parts.length ? `（${parts.join('、')}）` : ''}${unfreedNote}`);
  return s.deletedSize;
};

const printReport = (plan: ReclaimPlan, verbose: boolean) => {
  let total = 0;
  const masterFiles = plan.media;
  if (masterFiles.length) total += printSubtotal('母版', masterFiles, '个');
  if (plan.tempFiles.length) total += printSubtotal('残留', plan.tempFiles, '个');
  if (plan.打包.length) total += printSubtotal('系统打包', plan.打包, '个目录');
  if (plan.staging.length) total += printSubtotal('地形暂存', plan.staging, '个目录');
  if (plan.drafts.length) total += printSubtotal('草稿', plan.drafts, '个目录');
  if (plan.columnSegs.length) total += printSubtotal('列段', plan.columnSegs, '个');
  for (const w of plan.webpack) {
    console.log(`webpack  ${w.根}（装的 Remotion ${w.currentVersion ?? '不知道'}）`);
    total += printSubtotal('', w.entryList, '个');
  }
  // 只因为交付留着的：哪几次交付占得多，用户可以决定删旧交付
  const onlyForDelivery = new Map<string, number>();
  const byInode = new Map<string, typeof plan.media>();
  for (const f of plan.media) byInode.set(f.inode, [...(byInode.get(f.inode) ?? []), f]);
  for (const group of byInode.values()) {
    const reasons = group.flatMap((f) => f.理由);
    if (!reasons.length || reasons.some((x) => x.类 !== '交付')) continue;
    const dirs = new Set(reasons.map((x) => x.说明));
    for (const d of dirs) onlyForDelivery.set(d, (onlyForDelivery.get(d) ?? 0) + group[0]!.大小 / dirs.size);
  }
  if (onlyForDelivery.size) {
    const bySize = [...onlyForDelivery].sort((a, b) => b[1] - a[1]);
    console.log(`         只因为交付 manifest 引用才留的约 ${sizeText(bySize.reduce((n, [, v]) => n + v, 0))}，占得多的：${bySize.slice(0, 5).map(([d, v]) => `${d} ${sizeText(v)}`).join('、')}`);
  }
  if (plan.dedupePlan && !plan.dedupePlan.canDedupe) console.log('去重     本平台不做（只在 Mac 的 APFS 上克隆）');
  else if (plan.dedupePlan) {
    const savedBytes = savableBytes(plan.dedupePlan.组);
    const groupCount = plan.dedupePlan.组.filter((g) => g.toClone.length).length;
    const t = plan.dedupePlan.sha;
    const hitNote = t.cacheHits + t.computed ? `（sha 缓存命中 ${t.cacheHits} 个 ${sizeText(t.hitBytes)}，现算 ${t.computed} 个 ${sizeText(t.computedBytes)}）` : '';
    console.log(`去重     留下的里内容相同的 ${groupCount} 组，克隆成共享块能再省 ${sizeText(savedBytes)}${hitNote}`);
    total += savedBytes;
  }
  for (const x of plan.reportOnly) console.log(`只报大小（不自动删）${x.位置} ${sizeText(x.大小)}：${x.用途}`);
  for (const x of plan.unknownGroups) console.log(`不认识（只报告不删）${x.位置}：${x.entryList.map((e) => `${e.名} ${sizeText(e.大小)}`).join('、')}`);
  console.log(`\n合计能省约 ${sizeText(total)}（按文件大小算；已经是克隆的共享块删了不一定腾出空间）`);
  if (verbose) {
    const colReport = (sectionName: string, items: readonly { 路径: string; 大小: number; 理由: readonly KeepReason[] }[]) => {
      for (const x of items) console.log(`  ${x.理由.length ? '留' : '删'} ${sectionName} ${x.路径} ${sizeText(x.大小)}${x.理由.length ? `  ${reasonText(x.理由)}` : ''}`);
    };
    console.log('\n明细：');
    colReport('母版', masterFiles);
    colReport('残留', plan.tempFiles);
    colReport('系统打包', plan.打包);
    colReport('地形暂存', plan.staging);
    colReport('草稿', plan.drafts);
    colReport('列段', plan.columnSegs);
    for (const w of plan.webpack) colReport('webpack', w.entryList);
    for (const g of plan.dedupePlan?.组 ?? []) for (const p of g.toClone) console.log(`  克隆 ${p} ← ${g.源} ${sizeText(g.大小)}`);
  }
};

export const cacheCommands: Record<string, Command> = {
  cache: {
    用法: `cache gc [--执行] [--只 <类>[,<类>…]] [--近期天数 ${defaultDays.recent}] [--草稿天数 ${defaultDays.draftDays}] [--webpack天数 ${defaultDays.webpack}] [--列段天数 ${defaultDays.columnSeg}] [--详细]（类：${reclaimKinds.join('、')}）`,
    说明:
      '缓存回收，默认只打印要删什么、能省多少，--执行 才删。母版（切片 mp4、声音 wav）只删旧指纹的媒体文件（.指纹.json 留着），当前指纹不删；留还没有认可参考的认可那版、还没自足的交付引用的、每段每级别画面声音各最近一份、近期渲的、近 2 小时用过的、别的还在的检出用过的；' +
      'CRF1 时代的 .mkv、.x264.mkv 不认，只当不认识报告；' +
      '留下的内容相同的克隆成共享块（Mac，sha 按路径、大小、修改时间缓存在 cache/sha缓存.json）；草稿超过天数的删；地形烘焙中断留下的暂存删；系统临时打包超过 24 小时且能确认无进程使用才删（归残留）；webpack 缓存旧 Remotion 版本的整个删、超过天数没用的删；列段缓存超过天数没读过的删；' +
      '音频数等只报大小，run/、cache/ 下不认识的只报告。--执行 过渲染闸。--作品 只限定母版、去重。',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--执行', '--详细'], 值: ['--近期天数', '--草稿天数', '--webpack天数', '--列段天数'], multiValue: ['--只'] });
      if (p.位置[0] !== 'gc' || p.位置.length !== 1) {
        const looksLikeKinds = p.位置.slice(1).some((x) => (reclaimKinds as readonly string[]).includes(x));
        throw new UsageError(looksLikeKinds ? '--只 的几类用逗号分开（--只 母版,草稿），或者重复写 --只' : '要 anim cache gc [--执行] …');
      }
      const onlyNames = (p.multiValue['--只'] ?? []).flatMap((x) => x.split(/[,，、]/)).filter(Boolean);
      const unknownKinds = onlyNames.filter((x) => !(reclaimKinds as readonly string[]).includes(x));
      if (unknownKinds.length) throw new UsageError(`--只 不认识 ${unknownKinds.join('、')}（有：${reclaimKinds.join('、')}）`);
      const o = {
        作品: getSpecifiedWork() ? [currentWork().名] : [],
        类: new Set<ReclaimClass>(onlyNames.length ? (onlyNames as ReclaimClass[]) : reclaimKinds),
        recentDays: parseDays(p.值['--近期天数'], defaultDays.recent, '--近期天数'),
        draftDays: parseDays(p.值['--草稿天数'], defaultDays.draftDays, '--草稿天数'),
        webpackDays: parseDays(p.值['--webpack天数'], defaultDays.webpack, '--webpack天数'),
        columnSegDays: parseDays(p.值['--列段天数'], defaultDays.columnSeg, '--列段天数'),
        now: Date.now(),
      };
      const execute = p.toggles.has('--执行');
      console.log(`anim cache gc（${execute ? '执行' : '只看不删，加 --执行 才删'}）数据根 ${dataRoot()}${o.作品.length ? `，作品 ${o.作品.join('、')}` : '，全部作品'}`);
      const calc = async () => {
        const plan = await computeReclaimPlan(o, (s) => console.log(`.. ${s}`));
        for (const w of plan.警告) runRecord.log('警告', w);
        printReport(plan, p.toggles.has('--详细'));
        return plan;
      };
      if (!execute) {
        await calc();
        return 0;
      }
      const r = await passRenderGate(async () => runReclaim(await calc(), o),undefined,{}, {种:'cache gc',不开渲染:true});
      console.log(`\n删了 ${r.deletedCount} 项 ${sizeText(r.deletedSize)}${r.cloneCount ? `，克隆 ${r.cloneCount} 个省 ${sizeText(r.cloneSavedBytes)}` : ''}${r.跳过.length ? `，跳过 ${r.跳过.length} 项（刚改过）` : ''}`);
      for (const x of r.跳过) runRecord.log('信息', `跳过 ${x}`);
      for (const x of r.failed) runRecord.log('错误', x);
      return r.failed.length ? 1 : 0;
    },
  },
};
