// anim cache gc 的规划：数据根和代码检出里各类缓存哪些删、哪些留、为什么留。这里只有纯规划和扫描（不删东西），删在 执行.ts。
// 母版（cache/母版/<作品>/<键>/<指纹前 16 位>.{mp4,wav}，切片的画面、声音；决策/0014）：只删媒体文件，旁边的 .指纹.json、.用过 一律留（stale 拿它说明哪项变了）。
//   留：各渲染级别的当前指纹（画面、声音各一份）、还没有认可参考的认可那版（accept 后补参考从它抽）、还没自足的交付 manifest 引用的、
//   每段每级别画面、声音各最近渲的一份、近 N 天渲的、近 2 小时用过的（.用过）、别的还在的检出用过的（.检出-*，它的当前指纹这边算不出来）、这段当前指纹算不出时整个目录。
// CRF1 时代的 .mkv、.x264.mkv 和 cache/叠层/ 不认（用户 11-06「旧的不用兼容」），母版目录里剩下的归「不认识」只报告。
// 草稿（run/草稿/<目录>）超过 N 天删；webpack 缓存（<检出>/node_modules/.cache/webpack/remotion-<环境>-<版本>/<哈希>/）换了 Remotion 版本的整个删，
// 同版本的每个环境留最近用的一份，其余超过 N 天没用的删。地形烘焙的暂存目录（run/暂存/terrain/<包>）写入锁没人拿、1 天没动的删。
// 列段、音频数这类认得但不自动删的只报大小（计划.ts 的 只报目录）；不认识的目录只报告。
// 解钉（01-推荐方案.md 第四节 D 的顺序）：交付自足了（有 全片-未拉响度.flac，不再读母版）才不再钉它引用的母版；
// 认可有了认可参考（文件名绑定认可记录的抽样哈希）才不再钉认可那版的母版。用户 10-30 定「这个未来用不到的就删」，gc 和渲段自动删旧都开着解钉（钉.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { currentCheckout } from '../环境/路径.ts';
import { holderPid, holderHost, processAlive } from '../闸/锁.ts';
import { recentUseMs } from '../渲/母版.ts';

export type KeepKind = '当前' | '认可' | '交付' | '最近一份' | '近期' | '在用' | '算不出';
/** 报告里按这个顺序算「主要因为什么留」 */
export const keepClassOrder: readonly KeepKind[] = ['当前', '认可', '交付', '最近一份', '近期', '在用', '算不出'];
export type KeepReason = { type: KeepKind; note: string };

const dayMs = 24 * 3600 * 1000;

/** 比较用的路径：绝对、NFC；Windows 不分大小写 */
export const canonicalPath = (p: string) => {
  const r = path.resolve(p).normalize('NFC');
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

const inDir = (file: string, dir: string) => {
  const r = path.relative(dir, file);
  return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
};

/** 要留的文件（按路径）和要整个留的目录 */
export class KeepSet {
  readonly file = new Map<string, KeepReason[]>();
  readonly 目录 = new Map<string, KeepReason[]>();

  加(file: string, reason: KeepReason) {
    const k = canonicalPath(file);
    const reasons = this.file.get(k) ?? [];
    if (!reasons.some((x) => x.type === reason.type && x.note === reason.note)) reasons.push(reason);
    this.file.set(k, reasons);
  }

  addDir(dir: string, reason: KeepReason) {
    const k = canonicalPath(dir);
    this.目录.set(k, [...(this.目录.get(k) ?? []), reason]);
  }

  reasonsFor(file: string): KeepReason[] {
    const k = canonicalPath(file);
    const r = [...(this.file.get(k) ?? [])];
    for (const [d, reasons] of this.目录) if (inDir(k, d)) r.push(...reasons);
    return r;
  }
}

// ---------- 母版 ----------

export type CacheKind = '母版';

export type MediaFile = {
  path: string;
  kind: CacheKind;
  work: string;
  /** 段键 */
  key: string;
  /** 文件名里的指纹前 16 位 */
  fingerprint: string;
  size: number;
  modifiedAt: number;
  /**
   * 旁边 .指纹.json 的修改时间（没有 json 用媒体文件的）。「最近一份」按它排，和 film --允许过期 用的 历史指纹 同序：
   * 迁移时硬链接到新指纹名下的母版，媒体文件还是旧的修改时间，json 是新的
   */
  recordedAt: number;
  /** 旁边 .指纹.json 里 渲染设置.inputProps.级别；没有 json 或读不出是 null */
  level: string | null;
  /** 设备-inode 和硬链接数：迁移时有过把同一份母版硬链接到新指纹名下，删掉一个名字不腾空间 */
  inode: string;
  linkCount: number;
  /** 切片（mp4 画面）、声音（wav） */
  storeKind: '切片' | '声音';
  /** 旁边 .用过 的修改时间（film、verify 最后一次用），没有是 null */
  usedAt: number | null;
  /** 同目录里有这个指纹正在写的临时文件（.渲染中、.转码中、.占用，1 天内动过的） */
  beingWritten: boolean;
  /** 用过这个指纹、路径还在的别的检出（旁边的 .检出-*） */
  otherCheckouts: string[];
};
export type WithReasons<T> = T & { reason: KeepReason[] };

/** 渲染中途崩掉留下的临时文件（渲.ts 的 .渲染中-<pid>、母版.ts 原子写 的 .写入中-<pid>）；渲/母版占用.ts 的 .占用 和锁协议的旁文件（.占用.<pid>.主机 等）同样算：活着的挡住这个指纹，崩掉留下的超 1 天 gc 删 */
export const isTempName = (fileName: string) => /\.(渲染中|写入中|转码中)-\d+|\.占用(\.|$)/.test(fileName);
const mediaNamePattern = /^([0-9a-f]{16})\.(mp4|wav)$/;
const usedMarkPattern = /^[0-9a-f]{16}\.用过$/;
const checkoutMarkPattern = /^[0-9a-f]{16}\.检出-[0-9a-f]{8}$/;

export type PlainFile = { path: string; size: number; modifiedAt: number };

/** 列目录和 stat 之间文件没了算没看见：别的进程在闸外清临时文件、删旧；只吞 ENOENT */
const readOrNull = <T>(read: () => T): T | null => {
  try {
    return read();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
};

export type MediaScan = { media: MediaFile[]; tempFiles: PlainFile[]; unknownFiles: PlainFile[] };

/** 读 .指纹.json 里的渲染级别；文件可能是旧算法的，只认 项.渲染设置.inputProps.级别 */
export const readLevel = (jsonFile: string): string | null => {
  try {
    const j = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as { items?: { renderSettings?: { inputProps?: { level?: unknown } } } };
    const v = j.items?.renderSettings?.inputProps?.level;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
};

export type ScanOptions = { now?: number };

/** 扫一个键目录（cache/<种>/<作品>/<键>/），结果追加进 r */
export const scanKeyDir = (dir: string, cacheKind: CacheKind, work: string, segKey: string, r: MediaScan, o: ScanOptions = {}) => {
  const now = o.now ?? Date.now();
  const entries = fs.readdirSync(dir);
  const writingNames = new Set(entries.filter(isTempName).filter((n) => {
    const st = readOrNull(() => fs.statSync(path.join(dir, n)));
    return st !== null && now - st.mtimeMs < dayMs;
  }).map((n) => n.slice(0, 16)));
  const thisCheckout = currentCheckout();
  const otherCheckouts = new Map<string, string[]>();
  for (const fileName of entries.filter((n) => checkoutMarkPattern.test(n))) {
    const checkoutPath = fs.readFileSync(path.join(dir, fileName), 'utf8').trim();
    if (checkoutPath && checkoutPath !== thisCheckout && fs.existsSync(checkoutPath)) otherCheckouts.set(fileName.slice(0, 16), [...(otherCheckouts.get(fileName.slice(0, 16)) ?? []), checkoutPath]);
  }
  for (const fileName of entries) {
    const f = path.join(dir, fileName);
    const st = readOrNull(() => fs.lstatSync(f));
    if (!st) continue;
    if (!st.isFile()) {
      r.unknownFiles.push({ path: f, size: 0, modifiedAt: st.mtimeMs });
      continue;
    }
    const m = mediaNamePattern.exec(fileName);
    if (m) {
      const json = path.join(dir, `${m[1]}.指纹.json`);
      const hasJson = fs.existsSync(json);
      let usedAt: number | null = null;
      try {
        usedAt = fs.statSync(path.join(dir, `${m[1]}.用过`)).mtimeMs;
      } catch {
        // 没用过
      }
      r.media.push({
        path: f, kind: cacheKind, work: work, key: segKey, fingerprint: m[1]!, size: st.size, modifiedAt: st.mtimeMs, recordedAt: hasJson ? fs.statSync(json).mtimeMs : st.mtimeMs,
        level: hasJson ? readLevel(json) : null, inode: `${st.dev}-${st.ino}`, linkCount: st.nlink,
        storeKind: m[2] === 'mp4' ? '切片' : '声音', usedAt, beingWritten: writingNames.has(m[1]!), otherCheckouts: otherCheckouts.get(m[1]!) ?? [],
      });
    } else if (isTempName(fileName)) r.tempFiles.push({ path: f, size: st.size, modifiedAt: st.mtimeMs });
    else if (!fileName.endsWith('.指纹.json') && !usedMarkPattern.test(fileName) && !checkoutMarkPattern.test(fileName)) r.unknownFiles.push({ path: f, size: st.size, modifiedAt: st.mtimeMs });
  }
};

/** 扫 cache/<种>/<作品>/ 下各键目录 */
export const scanMedia = (workDir: string, cacheKind: CacheKind, work: string, o: ScanOptions = {}): MediaScan => {
  const r: MediaScan = { media: [], tempFiles: [], unknownFiles: [] };
  if (!fs.existsSync(workDir)) return r;
  for (const segKey of fs.readdirSync(workDir)) {
    const dir = path.join(workDir, segKey);
    const dirStat = fs.statSync(dir);
    if (!dirStat.isDirectory()) {
      r.unknownFiles.push({ path: dir, size: dirStat.size, modifiedAt: dirStat.mtimeMs });
      continue;
    }
    scanKeyDir(dir, cacheKind, work, segKey, r, o);
  }
  return r;
};

/** 一个媒体文件身上的钉（gc、film 渲完自动删旧共用）：保留集里的，再加近 2 小时用过、别的检出用过、正在写 */
export const pinReasons = (f: MediaFile, keep: KeepSet, now: number): KeepReason[] => {
  const reasons = keep.reasonsFor(f.path);
  if (f.usedAt !== null && now - f.usedAt < recentUseMs) reasons.push({ type: '在用', note: '2 小时内用过' });
  for (const otherCheckout of f.otherCheckouts) reasons.push({ type: '在用', note: `别的检出用过：${otherCheckout}` });
  if (f.beingWritten) reasons.push({ type: '在用', note: '这个指纹正在写' });
  return reasons;
};

/**
 * 给每个媒体文件定留不留：钉理由 有的留；另外每个（种、作品、键、级别，画面声音分开）记于最新的那个指纹留（理由「最近一份」；
 * 每个级别的都留），近 近期天数 天里改过的留（「近期」）。理由为空的就是要删的。
 */
export const planMedia = (mediaFiles: readonly MediaFile[], keep: KeepSet, o: { now: number; recentDays: number }): WithReasons<MediaFile>[] => {
  const recentMedia = new Map<string, MediaFile>();
  for (const f of mediaFiles) {
    const k = [f.kind, f.work, f.key, f.level ?? '?', f.storeKind === '声音' ? '声音' : '画面'].join('\0');
    const existing = recentMedia.get(k);
    if (!existing || f.recordedAt > existing.recordedAt) recentMedia.set(k, f);
  }
  const recentFingerprints = new Set([...recentMedia.values()].map((f) => [f.kind, f.work, f.key, f.fingerprint].join('\0')));
  return mediaFiles.map((f) => {
    const reasons = pinReasons(f, keep, o.now);
    if (recentFingerprints.has([f.kind, f.work, f.key, f.fingerprint].join('\0'))) reasons.push({ type: '最近一份', note: f.level ?? '级别不明' });
    if (o.now - f.modifiedAt < o.recentDays * dayMs) reasons.push({ type: '近期', note: `${o.recentDays} 天内` });
    return { ...f, reason: reasons };
  });
};

/** 临时残留：超过 1 天还在的就是崩掉留下的（正在渲的那份改于一直在更新） */
export const planTemp = (tempFiles: readonly PlainFile[], now: number): WithReasons<PlainFile>[] =>
  tempFiles.map((f) => ({ ...f, reason: now - f.modifiedAt < dayMs ? [{ type: '近期' as const, note: '1 天内，可能还在写' }] : [] }));

// ---------- 认可、交付 ----------

/** 认可记录 <作品根>/认可/<平台>/<段键>.toml 的 段 和 指纹（只取这两项，别的字段坏了也不影响回收） */
export const readApprovedFingerprint = (file: string): { segment: string; fingerprint: string } | null => {
  const t = fs.readFileSync(file, 'utf8');
  const segKey = /^"段"\s*=\s*"([^"]+)"/m.exec(t)?.[1];
  const fingerprint = /^"指纹"\s*=\s*"([0-9a-f]{16,64})"/m.exec(t)?.[1];
  return segKey && fingerprint ? { segment: segKey, fingerprint: fingerprint } : null;
};

export type UnpinOptions = {
  /** true：自足的交付、有认可参考的认可不再钉母版（gc、film 渲完自动删旧都传 true，钉.ts）。不给是 false，只在说明里标 */
  unpin?: boolean;
  /** 认可记录文件 → 它在这个平台的认可参考（验收/参考.ts 的 参考文件，按记录的抽样哈希起名）；读不出记录返回 null。不给就当都没有参考 */
  referenceFile?: (approvalFile: string, hostPlatform: string) => string | null;
};

/** 认可记录里各段那版的母版进保留集（各平台的都算；别的平台的指纹本机本来就没有，加了也无妨）。读不出的记录整段目录留下 */
export const addApprovals = (keep: KeepSet, workRoot: string, masterDir: (segKey: string) => string, warn: (s: string) => void = () => {}, o: UnpinOptions = {}) => {
  const approvDir = path.join(workRoot, '认可');
  if (!fs.existsSync(approvDir)) return;
  for (const hostPlatform of fs.readdirSync(approvDir)) {
    const dir = path.join(approvDir, hostPlatform);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const fileName of fs.readdirSync(dir).filter((n) => n.endsWith('.toml'))) {
      const file = path.join(dir, fileName);
      const r = readApprovedFingerprint(file);
      const segKey = fileName.slice(0, -'.toml'.length);
      if (!r) {
        warn(`${file} 读不出 段 和 指纹，${segKey} 的母版整个留着`);
        keep.addDir(masterDir(segKey), { type: '算不出', note: '认可记录读不出' });
        continue;
      }
      const refFile = o.referenceFile?.(file, hostPlatform);
      const hasReference = !!refFile && fs.existsSync(refFile);
      if (hasReference && o.unpin) continue;
      const note = hasReference ? `${hostPlatform}（有认可参考）` : hostPlatform;
      keep.加(path.join(masterDir(r.segment), `${r.fingerprint.slice(0, 16)}.mp4`), { type: '认可', note: note });
    }
  }
};

/**
 * 一份交付 manifest.json（版本 3，anim film 写的）引用的切片：各段 <画面指纹>.mp4、<声音指纹>.wav，相对数据根。
 * 10-30 以前的 v1、v2 不认（用户 11-06「旧的不用兼容」），它们只引用 CRF1 时代的 .mkv。作品 是 manifest 没写作品时的兜底（交付目录的上一级）
 */
export const deliveryRefs = (manifest: unknown, work?: string): string[] => {
  const m = (manifest ?? {}) as { work?: unknown; segment?: { key?: unknown; pictureFingerprint?: unknown; soundFingerprint?: unknown }[] };
  const effectiveWork = typeof m.work === 'string' ? m.work : work;
  const r: string[] = [];
  for (const s of Array.isArray(m.segment) ? m.segment : []) {
    if (!effectiveWork || typeof s?.key !== 'string' || typeof s?.pictureFingerprint !== 'string') continue;
    r.push(['cache', '母版', effectiveWork, s.key, `${s.pictureFingerprint.slice(0, 16)}.mp4`].join('/'));
    if (typeof s.soundFingerprint === 'string') r.push(['cache', '母版', effectiveWork, s.key, `${s.soundFingerprint.slice(0, 16)}.wav`].join('/'));
  }
  return r;
};

/** 交付/ 下找 manifest.json（交付/<作品>/<目录>/，也认更早不分作品的 交付/<目录>/） */
export const findDeliveryManifests = (deliveryRoot: string, depth = 3): string[] => {
  if (!fs.existsSync(deliveryRoot)) return [];
  const r: string[] = [];
  const walk = (dir: string, layerDepth: number) => {
    const m = path.join(dir, 'manifest.json');
    if (fs.existsSync(m)) {
      r.push(m);
      return;
    }
    if (layerDepth >= depth) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) walk(path.join(dir, e.name), layerDepth + 1);
  };
  walk(deliveryRoot, 0);
  return r.sort();
};

/** 交付自足：有 全片-未拉响度.flac 就不再读母版（文件名同 合成/交付.ts；剪辑包用户 11-06 定不要了，不再要 剪辑包/画面.mp4） */
export const deliverySelfContained = (deliveryDir: string) => fs.existsSync(path.join(deliveryDir, '全片-未拉响度.flac'));

/** 交付 manifest 引用的母版进保留集，说明写交付目录（相对交付根） */
export const addDelivery = (keep: KeepSet, deliveryRoot: string, dataRoot: string, warn: (s: string) => void = () => {}, o: UnpinOptions = {}) => {
  for (const m of findDeliveryManifests(deliveryRoot)) {
    let refs: string[];
    let work: string;
    try {
      const j = JSON.parse(fs.readFileSync(m, 'utf8')) as { work?: unknown };
      work = typeof j?.work === 'string' ? j.work : path.basename(path.dirname(path.dirname(m)));
      refs = deliveryRefs(j, work);
    } catch (e) {
      // 自足的交付本来就不读母版；别的不知道引用了谁，和认可记录读不出一样整个留着（film 渲完自动删旧也看这里，不能当没引用）
      if (o.unpin && deliverySelfContained(path.dirname(m))) {
        warn(`${m} 读不出（${(e as Error).message}），交付已自足，不钉母版`);
        continue;
      }
      const layerParts = path.relative(deliveryRoot, path.dirname(m)).split(path.sep);
      const ownerWorks = layerParts.length >= 2 ? [layerParts[0]!] : [];
      warn(`${m} 读不出（${(e as Error).message}），它引用的母版不知道，${ownerWorks[0] ?? '各作品'}的母版整个留着`);
      keep.addDir(path.join(dataRoot, 'cache', '母版', ...ownerWorks), { type: '算不出', note: `交付 manifest 读不出：${layerParts.join('/')}` });
      continue;
    }
    const selfContained = deliverySelfContained(path.dirname(m));
    if (selfContained && o.unpin) continue;
    const note = path.relative(deliveryRoot, path.dirname(m)).split(path.sep).join('/') + (selfContained ? '（已自足）' : '');
    for (const p of refs) keep.加(path.isAbsolute(p) ? p : path.join(dataRoot, ...p.split('/')), { type: '交付', note: note });
  }
};

// ---------- 目录（草稿、webpack、不认识的） ----------

export type DirEntry = { path: string; name: string; size: number; modifiedAt: number };

/** 目录总大小（不跟符号链接、junction） */
export const dirSize = (p: string): number => {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.isFile() ? st.size : 0;
  let n = 0;
  for (const e of fs.readdirSync(p)) n += dirSize(path.join(p, e));
  return n;
};

/** 目录里最近改动的时间（递归到 深 层；webpack 写缓存是新建 pack 文件，草稿是往里加文件） */
export const latestModifiedAt = (p: string, depth = 2): number => {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return 0;
  }
  let t = st.mtimeMs;
  if (st.isDirectory() && depth > 0) for (const e of fs.readdirSync(p)) t = Math.max(t, latestModifiedAt(path.join(p, e), depth - 1));
  return t;
};

/** 根下各条目的大小和最近改动；给了 要 就只算它挑中的（大小要整棵走一遍，cache/母版 这类大目录不该白走） */
export const listDir = (root: string, depth = 2, keepName: (entryName: string) => boolean = () => true): DirEntry[] =>
  fs.existsSync(root)
    ? fs.readdirSync(root).filter(keepName).map((entryName) => ({ path: path.join(root, entryName), name: entryName, size: dirSize(path.join(root, entryName)), modifiedAt: latestModifiedAt(path.join(root, entryName), depth) }))
    : [];

/** 草稿：最近改动超过 天数 天的删 */
export const planDrafts = (entries: readonly DirEntry[], o: { now: number; days: number }): WithReasons<DirEntry>[] =>
  entries.map((e) => ({ ...e, reason: o.now - e.modifiedAt < o.days * dayMs ? [{ type: '近期' as const, note: `${o.days} 天内` }] : [] }));

/** 只报不删：根下不在 认识 里的条目 */
export const unrecognizedEntries = (root: string, knownNames: readonly string[]): DirEntry[] => listDir(root, 1, (entryName) => !knownNames.includes(entryName));

// ---------- 地形暂存 ----------

/** 锁文件有没有活着的持有者（协议见 闸/锁.ts：空文件、别的主机的都当有人拿着） */
export const isLockHeld = (lockPath: string, localHost: string): boolean => {
  if (!fs.existsSync(lockPath)) return false;
  const pid = holderPid(lockPath);
  if (pid === null) return true;
  const host = holderHost(lockPath, pid);
  return (host !== null && host !== localHost) || processAlive(pid);
};

export type StagingEntry = DirEntry & { lockHeld: boolean };

/** run/暂存/terrain 下各包的暂存目录（世界/版本.ts 的 新暂存：锁是旁边的 <包>.写入.lock） */
export const scanStaging = (root: string, localHost = ''): StagingEntry[] =>
  listDir(root, 3, (entryName) => !entryName.includes('.lock')).filter((e) => fs.statSync(e.path).isDirectory()).map((e) => ({ ...e, lockHeld: isLockHeld(`${e.path}.写入.lock`, localHost) }));

/** 暂存目录：锁有人拿着的留（正在烘焙）；1 天内动过的留；别的是烘焙中断留下的（下次烘焙同一个包也会先删它） */
export const planStaging = (entries: readonly StagingEntry[], now: number): WithReasons<DirEntry>[] =>
  entries.map(({ lockHeld, ...e }) => ({
    ...e,
    reason: lockHeld ? [{ type: '在用' as const, note: '写入锁有人拿着' }] : now - e.modifiedAt < dayMs ? [{ type: '近期' as const, note: '1 天内，可能还在写' }] : [],
  }));

// webpack 缓存：Remotion 按 remotion-<environment>-<VERSION>/<webpack 配置的 md5> 起名（@remotion/bundler 的 webpack-cache.js）

export type WebpackEntry = DirEntry & { env: string; version: string; hash: string | null };
const envDirPattern = /^remotion-([a-z]+)-(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/;

/** 扫一个 node_modules/.cache/webpack：认得的环境目录逐个哈希列出（版本不对的整个一条），认不得的另列 */
export const scanWebpack = (root: string, currentVersion: string | null): { entryList: WebpackEntry[]; unknownEntries: DirEntry[] } => {
  const r = { entryList: [] as WebpackEntry[], unknownEntries: [] as DirEntry[] };
  for (const e of listDir(root, 0)) {
    const m = envDirPattern.exec(e.name);
    if (!m || !fs.statSync(e.path).isDirectory()) {
      r.unknownEntries.push(e);
      continue;
    }
    const [, env, cacheVersion] = m as unknown as [string, string, string];
    if (currentVersion !== null && cacheVersion !== currentVersion) {
      r.entryList.push({ ...e, modifiedAt: latestModifiedAt(e.path, 3), env: env, version: cacheVersion, hash: null });
      continue;
    }
    for (const h of listDir(e.path, 2)) r.entryList.push({ ...h, name: `${e.name}/${h.name}`, env: env, version: cacheVersion, hash: h.name });
  }
  return r;
};

/**
 * 换了 Remotion 版本的整个删；同版本每个环境留最近用的 每环境留 份，其余 天数 天内用过的留。
 * 每部作品的打包入口、资产锁不同，各有各的缓存目录，所以 每环境留 默认取作品数。
 */
export const planWebpack = (entries: readonly WebpackEntry[], o: { currentVersion: string | null; now: number; days: number; keepPerEnv?: number }): WithReasons<WebpackEntry>[] => {
  const byEnv = new Map<string, WebpackEntry[]>();
  for (const e of entries) if (e.hash !== null) byEnv.set(`${e.env}-${e.version}`, [...(byEnv.get(`${e.env}-${e.version}`) ?? []), e]);
  const recentFiles = new Set([...byEnv.values()].flatMap((es) => [...es].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, Math.max(1, o.keepPerEnv ?? 1))));
  return entries.map((e) => {
    if (e.hash === null) return { ...e, reason: o.currentVersion === null ? [{ type: '算不出' as const, note: '不知道装的 Remotion 版本' }] : [] };
    const reasons: KeepReason[] = [];
    if (recentFiles.has(e)) reasons.push({ type: '最近一份', note: e.env });
    if (o.now - e.modifiedAt < o.days * dayMs) reasons.push({ type: '近期', note: `${o.days} 天内用过` });
    return { ...e, reason: reasons };
  });
};

// ---------- 汇总 ----------

export const mainReason = (reasons: readonly KeepReason[]): KeepKind | null => keepClassOrder.find((c) => reasons.some((x) => x.type === c)) ?? null;

/** 删大小只算真腾出来的：同一 inode 的名字全删了、而且没有计划外的硬链接；留大小同一 inode 只算一次 */
export type Subtotal = { deletedCount: number; deletedSize: number; keptCount: number; keptSize: number; byReason: Partial<Record<KeepKind, number>>; hardlinkUnfreed: number };
type TallyItem = { size: number; reason: readonly KeepReason[]; inode?: string; linkCount?: number };

export const Subtotal = (items: readonly TallyItem[]): Subtotal => {
  const r: Subtotal = { deletedCount: 0, deletedSize: 0, keptCount: 0, keptSize: 0, byReason: {}, hardlinkUnfreed: 0 };
  const byInode = new Map<string, TallyItem[]>();
  items.forEach((x, i) => {
    const k = x.inode ?? `#${i}`;
    byInode.set(k, [...(byInode.get(k) ?? []), x]);
  });
  for (const inodeGroup of byInode.values()) {
    const kept = inodeGroup.filter((x) => mainReason(x.reason) !== null);
    r.deletedCount += inodeGroup.length - kept.length;
    r.keptCount += kept.length;
    const byteSize = inodeGroup[0]!.size;
    if (kept.length) {
      const c = keepClassOrder.find((c) => kept.some((x) => x.reason.some((y) => y.type === c)))!;
      r.keptSize += byteSize;
      r.byReason[c] = (r.byReason[c] ?? 0) + byteSize;
    } else if (inodeGroup.length >= (inodeGroup[0]!.linkCount ?? 1)) r.deletedSize += byteSize;
    else r.hardlinkUnfreed += byteSize;
  }
  return r;
};

export const sizeText = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`);
