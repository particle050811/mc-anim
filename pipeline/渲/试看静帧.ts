// anim still 的 --trial、--baseline、--contact（试看组.ts）：命令行这头的解析和出完以后的接触表、说明底稿，放这里不挤进 命令.ts。
import path from 'node:path';
import { UsageError, type ParsedArgs } from '../cli/参数.ts';
import { shellTrialTable } from './地形注入.ts';
import { parseTrialGroups, writeContactSheet, writeTrialReadme, type TrialGroup } from './试看组.ts';
import type { StillVariantDone } from './渲.ts';

export const trialStillFlags = { multiValue: ['--trial'], toggles: ['--baseline', '--contact'] } as const;
export const trialStillUsage = "[--trial '<JSON>'…] [--baseline] [--contact]";
export const trialStillNote =
  "--trial '<JSON>' 一次出几组试看参数（可重复；一个值也可以是 JSON 数组），同一会话只打包一次、开一次浏览器，每组一个新页面；各组并上 shell 里的 REMOTION_ANIM_TRIAL，文件名带 -试看<序号>-<短名>（如 雾曲线.起=0.8），名字、格式见 anim trial list。--baseline 另出一组不加 --trial 的（序号 0）；--contact 每帧再拼一张接触表（各组同帧，上面标组号和短名）。给了 --trial 时预览夹里没有 00-说明.md 就写一份底稿（每组一个小标题、各组耗时）";

export type TrialStillPlan = { groups: TrialGroup[]; contact: boolean; done: StillVariantDone[] };

export const trialStillPlan = (p: ParsedArgs): TrialStillPlan | undefined => {
  const values = p.multiValue['--trial'] ?? [];
  if (!values.length) {
    for (const flag of ['--baseline', '--contact']) if (p.toggles.has(flag)) throw new UsageError(`${flag} 要和 --trial 一起给`);
    return undefined;
  }
  return { groups: parseTrialGroups(values, p.toggles.has('--baseline')), contact: p.toggles.has('--contact'), done: [] };
};

/** 出完：按帧（再按光影、望远的变体）拼接触表，写说明底稿，打各组耗时；返回多出来的文件 */
export const finishTrialStills = async (plan: TrialStillPlan, o: { dir: string; segKey: string; frames: readonly number[] }): Promise<string[]> => {
  const extra: string[] = [];
  const contactSheets: string[] = [];
  if (plan.contact && plan.groups.length > 1) {
    const channelSuffixes = [...new Set(plan.done.map((d) => d.channelSuffix))];
    for (const ch of channelSuffixes)
      for (const [fi, f] of o.frames.entries()) {
        const tiles = plan.done.filter((d) => d.channelSuffix === ch).map((d) => ({ file: d.files[fi]!, label: `${d.trial!.index}  ${d.trial!.shortName}` }));
        const out = path.join(o.dir, `${o.segKey}-第${String(f).padStart(4, '0')}帧${ch}-接触表.png`);
        await writeContactSheet(tiles, out);
        contactSheets.push(out);
      }
    extra.push(...contactSheets);
  }
  const timing = plan.done.map((d) => `${d.trial!.index} ${d.trial!.shortName}${d.channelSuffix}：${d.seconds.toFixed(1)} 秒`).join('；');
  console.log(`各组出帧（开页到出完）：${timing}`);
  writeTrialReadme(o.dir, {
    segKey: o.segKey,
    frames: o.frames,
    groups: plan.groups,
    base: shellTrialTable(),
    files: (g) => plan.done.filter((d) => d.trial === g).flatMap((d) => d.files),
    contactSheets,
    timing: `各组出帧（开页到出完，不含打包、开浏览器）：${timing}`,
  });
  return extra;
};
