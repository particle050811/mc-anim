// 成片时间轴写盘：anim film 出完成片顺手写（拼成片.ts），anim film timeline 给已有成片补（交付夹，或 发布/<作品>/<夹>/ 里的 mp4）。
// 补的时候按「当前代码」算：manifest.json 记的 code.commit 和当前 HEAD 不同（或两边有一边是脏的）就标 stale: true，播放器照样画，但数据可能和片子对不上。
// 发布夹里没有 manifest.json：在 交付/<作品>/ 里找同样字节的成片（先比大小，再比头尾各 1 MB 的 sha256），用那一夹的 manifest。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listWorks } from '../环境/作品.ts';
import { deliveryRoot } from '../环境/作品数据.ts';
import { dataRoot } from '../环境/配置.ts';
import { codeRoot, commitStatus } from '../环境/路径.ts';
import { atomicWrite } from '../渲/母版.ts';
import { timelineWaveforms } from './波形.ts';
import { computeTimeline, timelineDoc, timelineFileName, type FilmTimeline } from './时间轴.ts';
import { loadWorkSource } from './作品源.ts';

/** manifest.json 里用到的几项（拼成片.ts 写的 v4） */
export type FilmManifest = { work: string; name: string; fps: number; totalFrameCount: number; code: { commit: string; dirty: boolean } | null; trial?: unknown; frames?: unknown; segment: { key: string; frameCount: number; filmStartFrame: number }[]; file: { film: string } };

export const readManifest = (dir: string): FilmManifest | null => {
  const f = path.join(dir, 'manifest.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as FilmManifest) : null;
};

/** 按当前代码算一部片的时间轴；manifestCode 是出片时的代码（不给 = 就是现在出的片） */
export const buildFilmTimeline = async (o: { work: string; workRoot: string; film: string; video: string; keys: readonly string[]; fps: number; manifestCode?: FilmManifest['code'] }): Promise<FilmTimeline> => {
  const src = await loadWorkSource({ codeRoot: codeRoot(), workRoot: o.workRoot, work: o.work, dataRoot: dataRoot() });
  if (src.motionError) console.warn(`== 时间轴：${src.motionError}`);
  const code = commitStatus();
  const stale = o.manifestCode === undefined ? false : !code || !o.manifestCode || code.commit !== o.manifestCode.commit || code.dirty || o.manifestCode.dirty;
  const body = computeTimeline(src, o.keys, o.fps);
  // 波形：台词的 asset 是台词 id，按声音表里它的配音资产找字节
  const voiceOf = new Map(src.segments.flatMap((s) => Object.entries(s.soundTable?.lines ?? {}).map(([id, t]) => [id, t.voice] as const)));
  const { waveforms, missing } = timelineWaveforms(body.audio, (a) => src.lock?.[a.kind === '台词' ? (voiceOf.get(a.asset) ?? '') : a.asset], dataRoot());
  if (missing.length) console.warn(`== 时间轴：${missing.length} 件资产没有波形（字节不在数据根或解不开）：${missing.slice(0, 5).join('、')}${missing.length > 5 ? ' …' : ''}`);
  return timelineDoc({ work: o.work, film: o.film, video: o.video, fps: o.fps, code, stale, body, waveforms });
};

const sampleHash = (file: string) => {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  try {
    const chunk = Math.min(1 << 20, size);
    const head = Buffer.alloc(chunk);
    const tail = Buffer.alloc(chunk);
    fs.readSync(fd, head, 0, chunk, 0);
    fs.readSync(fd, tail, 0, chunk, size - chunk);
    return crypto.createHash('sha256').update(head).update(tail).digest('hex');
  } finally {
    fs.closeSync(fd);
  }
};

/** 发布夹的 mp4 出自哪个交付夹：交付/<作品>/ 下字节一样的成片 */
export const findSourceDelivery = (video: string, work: string): string | null => {
  const root = deliveryRoot(work);
  if (!fs.existsSync(root)) return null;
  const size = fs.statSync(video).size;
  let want: string | undefined;
  for (const d of fs.readdirSync(root).sort().reverse()) {
    const m = readManifest(path.join(root, d));
    if (!m) continue;
    const candidates = Object.values(m.file).filter((x): x is string => typeof x === 'string' && x.endsWith('.mp4')).map((x) => path.join(root, d, x));
    for (const c of candidates) {
      if (!fs.existsSync(c) || fs.statSync(c).size !== size) continue;
      want ??= sampleHash(video);
      if (sampleHash(c) === want) return path.join(root, d);
    }
  }
  return null;
};

/** 发布/<作品>/<夹>/x.mp4 → 作品名 */
const publishWork = (file: string) => {
  const parts = path.resolve(file).split(path.sep);
  const i = parts.lastIndexOf('发布');
  return i >= 0 && parts.length > i + 2 ? parts[i + 1]! : null;
};

/** anim film timeline <交付夹|mp4>：给已有成片补时间轴，返回写的文件和数据 */
export const backfillTimeline = async (target: string): Promise<{ file: string; doc: FilmTimeline; manifestDir: string; notes: string[] }> => {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error(`${abs} 不存在`);
  const isDir = fs.statSync(abs).isDirectory();
  if (!isDir && path.extname(abs).toLowerCase() !== '.mp4') throw new Error(`要给交付夹或成片 mp4：${abs}`);
  const dir = isDir ? abs : path.dirname(abs);
  let manifestDir = dir;
  let manifest = readManifest(dir);
  const notes: string[] = [];
  if (!manifest) {
    if (isDir) throw new Error(`${dir} 里没有 manifest.json：发布夹要直接给 mp4`);
    const work = publishWork(abs);
    if (!work) throw new Error(`${dir} 里没有 manifest.json，也不在 发布/<作品>/ 下，认不出是哪部片`);
    const found = findSourceDelivery(abs, work);
    if (!found) throw new Error(`在 ${deliveryRoot(work)} 里没找到和 ${path.basename(abs)} 字节一样的成片，不知道它是哪几段、哪份代码出的`);
    manifestDir = found;
    manifest = readManifest(found)!;
    notes.push(`出自 ${found}`);
  }
  if (manifest.trial !== undefined || manifest.frames) throw new Error(`${manifestDir} 是试看片，不补时间轴`);
  const video = isDir ? manifest.file.film : path.basename(abs);
  if (!fs.existsSync(path.join(dir, video))) throw new Error(`${dir} 里没有 ${video}`);
  const workRoot = listWorks().get(manifest.work);
  if (!workRoot) throw new Error(`manifest 的作品「${manifest.work}」在本检出里找不到`);
  const doc = await buildFilmTimeline({ work: manifest.work, workRoot, film: manifest.name, video, keys: manifest.segment.map((s) => s.key), fps: manifest.fps, manifestCode: manifest.code });
  // 段长对不上：片子是别的代码出的，时间轴按现在的代码算，肯定对不上
  for (const s of manifest.segment) {
    const now = doc.segments.find((x) => x.key === s.key);
    if (now && (now.frameCount !== s.frameCount || now.startFrame !== s.filmStartFrame)) notes.push(`${s.key} 片里是第 ${s.filmStartFrame} 帧起 ${s.frameCount} 帧，现在的代码算出第 ${now.startFrame} 帧起 ${now.frameCount} 帧`);
  }
  if (doc.frameCount !== manifest.totalFrameCount) notes.push(`片子 ${manifest.totalFrameCount} 帧，现在的代码算出 ${doc.frameCount} 帧`);
  if (doc.stale) notes.unshift(`stale：片子是 ${manifest.code?.commit.slice(0, 8) ?? '（没记）'}${manifest.code?.dirty ? '（脏）' : ''} 出的，现在是 ${doc.code?.commit.slice(0, 8) ?? '（不在 git 里）'}${doc.code?.dirty ? '（脏）' : ''}，时间轴按现在的代码算`);
  const file = path.join(dir, timelineFileName(video));
  atomicWrite(file, JSON.stringify(doc, null, 2) + '\n');
  return { file, doc, manifestDir, notes };
};
