// 母版（切片）哪些还钉着，和渲段渲完自动删旧（用户 10-30 定：「只是考虑旧的过期的模板都会删掉 就是改动重渲染过了」「这个未来用不到的就删」；不设预算、不按 LRU 删当前指纹）。
// 钉着的：还没自足的交付引用的、还没有认可参考的认可那版（回收.ts 的 加交付、加认可，解钉开着）。gc 也用这一份。
// 渲段（出片/渲段.ts）写好某段某级别的新切片后（命中「已是最新」也算）调 删旧：同段同级别、不是当前画面、声音指纹的媒体文件删掉（.指纹.json、.用过 留着），跳过 钉理由 非空的（钉着、近 2 小时用过、别的检出用过、正在写）；级别读不出的不动（可能是别的级别的当前指纹）。
// 在渲染闸里跑，别人刚渲好的切片靠 .用过 挡（渲段 先记 .用过 再改名）。
// 只有主检出才删：worktree 里渲的是没合并的改动，「旧」指纹很可能还是 main 的当前指纹（这边算不出），认可记录也是分支上的。worktree 只新增，合并后主检出第一次出这段（命中也算）或 gc 再清。
import fs from 'node:fs';
import { masterDir, approvRefFile } from '../环境/作品数据.ts';
import { dataRoot, dataPath } from '../环境/配置.ts';
import { listWorks, workName } from '../环境/作品.ts';
import { inMainCheckout } from '../环境/路径.ts';
import type { RunRecord } from '../运行记录/记录.ts';
import { sampleKey, readApproval } from '../验收/认可.ts';
import { KeepSet, addDelivery, addApprovals, sizeText, scanKeyDir, pinReasons, type MediaScan, type CacheKind } from './回收.ts';

/** 认可记录文件 → 它在这个平台的认可参考（按记录的抽样哈希起名）；读不出 null */
export const referenceFileLookup = (work: string) => (file: string, hostPlatform: string) => {
  try {
    const r = readApproval(file);
    return r ? approvRefFile(r.段, r.指纹, sampleKey(r), hostPlatform, work) : null;
  } catch {
    return null;
  }
};

/** 现在钉着的母版：还没自足的交付、还没有认可参考的认可 */
export const pinnedSet = (warn: (s: string) => void = () => {}): KeepSet => {
  const keep = new KeepSet();
  const knownWorks = listWorks();
  addDelivery(keep, dataPath('交付'), dataRoot(), warn, { unpin: true });
  for (const [work, workRoot] of knownWorks) addApprovals(keep, workRoot, (segKey) => masterDir(segKey, work), warn, { unpin: true, referenceFile: referenceFileLookup(work) });
  return keep;
};

export const scanKey = (cacheKind: CacheKind, segKey: string, work = workName()): MediaScan => {
  const r: MediaScan = { media: [], tempFiles: [], unknownFiles: [] };
  const dir = masterDir(segKey, work);
  if (fs.existsSync(dir)) scanKeyDir(dir, cacheKind, work, segKey, r);
  return r;
};

export type DeleteOldResult = { removed: string[]; deletedSize: number; 留: { 文件: string; 理由: string }[] };

type SplitOldOptions = { runRecord?: Pick<RunRecord, 'log'>; 作品?: string; now?: number };

/** 当前们：这段现在的指纹（切片一段有画面、声音两个） */
const splitOld = (cacheKind: CacheKind, segKey: string, level: string, currentFingerprints: readonly string[], o: SplitOldOptions, warn: (s: string) => void) => {
  const keepPrefixes = new Set(currentFingerprints.map((x) => x.slice(0, 16)));
  const oldFiles = scanKey(cacheKind, segKey, o.作品).media.filter((f) => !keepPrefixes.has(f.指纹) && f.级别 === level);
  if (!oldFiles.length) return { removed: [], 留: [] };
  const keep = pinnedSet(warn);
  const now = o.now ?? Date.now();
  const classified = oldFiles.map((f) => ({ f, 理由: pinReasons(f, keep, now) }));
  return { removed: classified.filter((x) => !x.理由.length).map((x) => x.f), 留: classified.filter((x) => x.理由.length) };
};

/** 渲段命中（已是最新）时先问一声：有要删的才过闸，没旧的、旧的都钉着不用等闸。只看不删 */
export const hasOldToDelete = (cacheKind: CacheKind, segKey: string, level: string, currentFingerprints: readonly string[], o: SplitOldOptions & { mainCheckout?: boolean } = {}): boolean => {
  if (!(o.mainCheckout ?? inMainCheckout())) return false;
  try {
    return splitOld(cacheKind, segKey, level, currentFingerprints, o, () => {}).removed.length > 0;
  } catch {
    return false;
  }
};

/** 渲段写好 键 在 级别 的切片后调：删同段同级别别的指纹（见文件头）。出错只警告，不影响这次渲染 */
export const deleteOld = (cacheKind: CacheKind, segKey: string, level: string, currentFingerprints: readonly string[], o: SplitOldOptions & { mainCheckout?: boolean } = {}): DeleteOldResult => {
  const r: DeleteOldResult = { removed: [], deletedSize: 0, 留: [] };
  const warn = (s: string) => (o.runRecord ? o.runRecord.log('警告', s) : console.error(`!! ${s}`));
  try {
    const classified = splitOld(cacheKind, segKey, level, currentFingerprints, o, warn);
    if (!(o.mainCheckout ?? inMainCheckout())) {
      const oldFiles = [...classified.removed, ...classified.留.map((x) => x.f)];
      if (oldFiles.length) console.log(`   ${segKey}：这是 worktree，同级别的旧${cacheKind} ${oldFiles.length} 个不自动删（可能是主检出的当前指纹）；合并后主检出出这段或 anim cache gc 再清`);
      for (const f of oldFiles) r.留.push({ 文件: f.路径, 理由: 'worktree 不自动删' });
      return r;
    }
    for (const f of classified.removed) {
      fs.rmSync(f.路径, { force: true });
      r.removed.push(f.路径);
      r.deletedSize += f.大小;
    }
    for (const { f, 理由: reasons } of classified.留) r.留.push({ 文件: f.路径, 理由: [...new Set(reasons.map((x) => `${x.类}（${x.说明}）`))].join('、') });
    if (r.removed.length) console.log(`   ${segKey}：删了同级别的旧${cacheKind} ${r.removed.length} 个，${sizeText(r.deletedSize)}`);
    for (const x of r.留) console.log(`   ${segKey}：旧${cacheKind} ${x.文件.split(/[\\/]/).pop()} 留着：${x.理由}`);
  } catch (e) {
    warn(`${segKey} 的旧${cacheKind}没删成（${(e as Error).message.split('\n')[0]}），之后 anim cache gc 再清`);
  }
  return r;
};
