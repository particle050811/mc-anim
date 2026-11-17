// 存档的区域按需读成列段：内存里留最近用的几十个，磁盘上按「区域文件 sha256 + 种子 + 读法」缓存在 <数据根>/cache/列段/（内容寻址，换存档、重生成都自动失效）。
// 区域由哪些文件组成、怎么读，看存档格式（存档格式.ts）：原版 .mca 一个文件，立方存档一组 .mcr3d。
// 套编辑（编辑/套用.ts）在这一层做：烘焙、查询拿到的都是套完编辑的列段，原始存档不动。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { decodeColumnSegments, encodeColumnSegments, type UnpackedColumnSegmentRegion } from './列段.ts';
import { regionFileName } from './存档.ts';
import { mcaFormat, type SaveFormat } from './存档格式.ts';

/** 读缓存时把修改时间推到现在（超过 1 天才动，省系统调用）：anim cache gc 按它算多久没用过 */
const markUsed = (f: string, now = Date.now()) => {
  try {
    if (now - fs.statSync(f).mtimeMs > 24 * 3600 * 1000) fs.utimesSync(f, new Date(now), new Date(now));
  } catch {
    // 别的进程刚回收了，或只读盘：不影响这次读
  }
};

export type RegionTransform = (r: UnpackedColumnSegmentRegion) => UnpackedColumnSegmentRegion;

// 缓存键（区域文件 sha256 接种子、读法版本）按「路径、大小、修改时间、种子」记在进程里：同一个存档常有两个区域源（套编辑的和编辑读原样的），共用一份
const keyTable = new Map<string, string>();

export class RegionSource {
  private cache = new Map<string, UnpackedColumnSegmentRegion | null>();
  private memoryLimit = 40;

  readonly regionDir: string;
  readonly seed: string;
  private cacheDir: string | null;
  private transform: RegionTransform | null;
  private format: SaveFormat;

  constructor(regionDir: string, seed: string, cacheDir: string | null, transform: RegionTransform | null = null, format: SaveFormat = mcaFormat) {
    this.regionDir = regionDir;
    this.seed = seed;
    this.cacheDir = cacheDir;
    this.transform = transform;
    this.format = format;
  }

  /** 存档里有的区域 [rx, rz]，按文件名排好 */
  regionFiles(): [number, number][] {
    if (!fs.existsSync(this.regionDir)) throw new Error(`没有区域目录 ${this.regionDir}`);
    return this.format.listRegions(this.regionDir);
  }

  /** 组成这个区域的文件里存在的；空 = 存档里没有这个区域 */
  private files(rx: number, rz: number) {
    return this.format.files(this.regionDir, rx, rz).filter((f) => fs.existsSync(f));
  }

  /** 存档里有这个区域 */
  has(rx: number, rz: number) {
    return this.files(rx, rz).length > 0;
  }

  private get keySuffix() {
    return `\0${this.seed}\0${this.format.readMethod}`;
  }

  /** 区域各文件的戳；存档里没有返回 null */
  private stamp(rx: number, rz: number) {
    const files = this.files(rx, rz);
    if (!files.length) return null;
    const stamps = files.map((f) => {
      const st = fs.statSync(f);
      return `${f}\0${st.size}\0${st.mtimeMs}`;
    });
    return { files, stamp: `${stamps.join('\0')}${this.keySuffix}` };
  }

  private cacheFile(rx: number, rz: number) {
    if (!this.cacheDir) return null;
    const s = this.stamp(rx, rz);
    if (!s) return null;
    let h = keyTable.get(s.stamp);
    if (!h) {
      const hash = createHash('sha256');
      for (const f of s.files) {
        if (this.format.namesInKey) hash.update(`${path.basename(f)}\0`);
        hash.update(fs.readFileSync(f));
      }
      keyTable.set(s.stamp, (h = hash.update(this.keySuffix).digest('hex')));
    }
    return path.join(this.cacheDir, h.slice(0, 2), h);
  }

  /** 在工作线程里先把这些区域的缓存键算好（之后 缓存文件 直接查表）；没缓存目录、文件不在的跳过 */
  async computeKeys(regions: readonly [number, number][], threadCount: number) {
    if (!this.cacheDir) return;
    const pending = regions.map(([rx, rz]) => this.stamp(rx, rz)).filter((s): s is { files: string[]; stamp: string } => !!s && !keyTable.has(s.stamp));
    if (pending.length <= 2) return; // 一两个文件起线程不划算，留给 缓存文件 当场算
    let nextIndex = 0;
    const runThread = () =>
      new Promise<void>((resolve, reject) => {
        const w = new Worker(new URL('./算键工人.ts', import.meta.url));
        let current: { files: string[]; stamp: string } | undefined;
        const dispatch = () => {
          current = pending[nextIndex++];
          if (current) w.postMessage({ files: current.files, namesInKey: this.format.namesInKey, suffix: this.keySuffix });
          else void w.terminate().then(() => resolve());
        };
        w.on('message', (h: string) => {
          keyTable.set(current!.stamp, h);
          dispatch();
        });
        w.on('error', reject);
        dispatch();
      });
    await Promise.all(Array.from({ length: Math.max(1, Math.min(threadCount, pending.length)) }, runThread));
  }

  /** 列段缓存里已经有了（读它不用解存档） */
  isCached(rx: number, rz: number) {
    const c = this.cacheFile(rx, rz);
    return !!c && (fs.existsSync(`${c}.列段`) || fs.existsSync(`${c}.空`));
  }

  /** 读一个区域（不套编辑）：先看缓存，没有就解存档并写缓存 */
  原样(rx: number, rz: number): UnpackedColumnSegmentRegion | null {
    const files = this.files(rx, rz);
    if (!files.length) return null;
    const c = this.cacheFile(rx, rz);
    if (c && fs.existsSync(`${c}.列段`)) {
      markUsed(`${c}.列段`);
      return decodeColumnSegments(fs.readFileSync(`${c}.列段`));
    }
    if (c && fs.existsSync(`${c}.空`)) {
      markUsed(`${c}.空`);
      return null;
    }
    const r = this.format.read(files, rx, rz, this.seed);
    if (c) writeCache(c, r ? encodeColumnSegments(r.columnSeg) : null);
    return r ? decodeColumnSegments(encodeColumnSegments(r.columnSeg)) : null;
  }

  /** 套过编辑的区域；内存里留最近用的 */
  region(rx: number, rz: number): UnpackedColumnSegmentRegion | null {
    const k = `${rx},${rz}`;
    let r = this.cache.get(k);
    if (r !== undefined) {
      this.cache.delete(k); // 挪到最新
      this.cache.set(k, r);
      return r;
    }
    r = this.原样(rx, rz);
    if (r && this.transform) r = this.transform(r);
    this.cache.set(k, r);
    if (this.cache.size > this.memoryLimit) this.cache.delete(this.cache.keys().next().value!);
    return r;
  }

  /** 只解几个区块（查询小范围用，不写缓存、不进内存）；整区域已在缓存就用缓存 */
  partialRegion(rx: number, rz: number, chunkSet: ReadonlySet<number>): UnpackedColumnSegmentRegion | null {
    const k = `${rx},${rz}`;
    if (this.cache.has(k)) return this.region(rx, rz);
    const c = this.cacheFile(rx, rz);
    if (c && (fs.existsSync(`${c}.列段`) || fs.existsSync(`${c}.空`))) return this.region(rx, rz);
    const files = this.files(rx, rz);
    if (!files.length) return null;
    const r = this.format.read(files, rx, rz, this.seed, chunkSet);
    if (!r) return null;
    const d = decodeColumnSegments(encodeColumnSegments(r.columnSeg));
    return this.transform ? this.transform(d) : d;
  }

  /** 并行把没缓存的区域读进缓存；返回有数据的区域 */
  async preRead(regions: [number, number][], threadCount: number, log?: (s: string) => void): Promise<[number, number][]> {
    if (!this.cacheDir) throw new Error('预读要有缓存目录');
    await this.computeKeys(regions, threadCount);
    const pending: { files: string[]; rx: number; rz: number; cachePath: string }[] = [];
    const hasData: [number, number][] = [];
    for (const [rx, rz] of regions) {
      const c = this.cacheFile(rx, rz);
      if (!c) continue;
      if (fs.existsSync(`${c}.列段`)) hasData.push([rx, rz]);
      else if (!fs.existsSync(`${c}.空`)) pending.push({ files: this.files(rx, rz), rx, rz, cachePath: c });
    }
    if (pending.length) {
      log?.(`读存档：${pending.length} 个区域没缓存，${Math.min(threadCount, pending.length)} 个线程读`);
      const t0 = performance.now();
      let nextIndex = 0;
      const runThread = () =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL('./读区域工人.ts', import.meta.url), { workerData: { seed: this.seed, format: this.format.spec } });
          const dispatch = () => {
            const j = pending[nextIndex++];
            if (j) w.postMessage(j);
            else void w.terminate().then(() => resolve());
          };
          w.on('message', (m: { rx: number; rz: number; chunkCount: number; bytes: number }) => {
            if (m.chunkCount) {
              hasData.push([m.rx, m.rz]);
              log?.(`  r.${m.rx}.${m.rz}：${m.chunkCount} 个区块，${(m.bytes / 1e6).toFixed(1)} MB`);
            }
            dispatch();
          });
          w.on('error', reject);
          dispatch();
        });
      await Promise.all(Array.from({ length: Math.max(1, Math.min(threadCount, pending.length)) }, runThread));
      log?.(`读存档完，${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
    }
    const compareRegion = (a: [number, number], b: [number, number]) => regionFileName(...a).localeCompare(regionFileName(...b));
    return hasData.sort(compareRegion);
  }
}

export const writeCache = (pathPrefix: string, gz: Buffer | null) => {
  fs.mkdirSync(path.dirname(pathPrefix), { recursive: true });
  const targetPath = gz ? `${pathPrefix}.列段` : `${pathPrefix}.空`;
  const tmp = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, gz ?? '');
  fs.renameSync(tmp, targetPath);
};
