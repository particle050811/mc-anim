// 成片时间轴、anim impact 要的一部作品的「源」：清单顺序的各正片段（段.ts、声音表.生成.ts）、各场的场时间线、作品的动作体检逐帧采样。
// 按给的代码根用 esbuild 打包加载（源码/打包加载.ts），所以既能读本检出，也能读别的检出、git archive 出来的旧提交：两边用同一套算法（本检出的 时间轴.ts）算，
// 比的才只是作品数据的差别。两次打包：先只打清单拿段目录，再把各段、场时间线、动作体检打进一个包，同一个模块只有一份。
import fs from 'node:fs';
import path from 'node:path';
import { auditMotion, type MotionPoint, type MotionProfile, type MotionSample } from '../../engine/anim/动作体检.ts';
import type { ManifestEntry } from '../../engine/段/清单条目.ts';
import type { ResolvedSceneSound } from '../../engine/段/场声音.ts';
import type { AudioInfo, SoundTable } from '../../engine/段/声音助手.ts';
import type { SegmentDef } from '../../engine/段/段定义.ts';
import { knownAudioMeasure } from '../段框架/音频数.ts';
import { applySwap, readAssetLock, workAssetLockPath, type AssetLock } from '../资产/资产锁.ts';
import { importBundled } from '../源码/打包加载.ts';

export type SourceSeg = { key: string; serial: string | null; def: SegmentDef; soundTable: SoundTable | null };
/** 场时间线里时间轴要的两样（老段接续做的时间线可能都没有） */
export type SourceTimeline = { events?: Readonly<Record<string, { sec: number }>>; sound?: readonly ResolvedSceneSound[] };
/** 动作体检逐帧采样（帧是整部作品正片的帧，从第一段起）；cuts 是 auditMotion 给的切镜 */
export type MotionFrames = { fps: number; frames: number; cuts: { frame: number; shot: string }[]; samples: { shot: string; points: Record<string, MotionPoint> }[] };

export type WorkSource = {
  work: string;
  /** 清单顺序的正片段（核对段不进） */
  segments: SourceSeg[];
  /** 场键 → 场时间线 */
  timelines: Readonly<Record<string, SourceTimeline>>;
  /** 作品没有 动作体检.ts 是 null；有但跑不了，motionError 写原因 */
  motion: MotionFrames | null;
  motionError?: string;
  /** 音频时长等（和 anim check 的声音接缝检查同一个取法：锁里的数或量过的缓存） */
  measure: (id: string) => AudioInfo | undefined;
  /** 出片时打包用的资产锁（作品的换件表换过的），时间轴的波形按它找字节；测试里可以不给 */
  lock?: AssetLock;
};

type WorkManifest = { manifest: readonly ManifestEntry[]; segDir: (segKey: string) => string; segmentCode: (segKey: string) => string | null };

/** 采样动作：先按 auditMotion 跑（cuts 用它的）；它因为配置问题抛错（旧检出的轨表对不上之类）就只逐帧采样、自己按镜头名变化切 */
export const sampleMotion = (profile: MotionProfile): { motion: MotionFrames; error?: string } => {
  const samples: MotionFrames['samples'] = [];
  const keep = (s: MotionSample) => ({ shot: s.shot, points: Object.fromEntries(Object.entries(s.points).map(([k, p]) => [k, [p[0], p[1], p[2]] as const])) });
  try {
    const r = auditMotion(profile, (frame, s) => (samples[frame] = keep(s)));
    return { motion: { fps: profile.fps, frames: profile.frames, cuts: r.cuts, samples } };
  } catch (e) {
    samples.length = 0;
    const cuts: MotionFrames['cuts'] = [];
    for (let frame = 0; frame < profile.frames; frame++) {
      const s = keep(profile.sample(frame, frame / profile.fps));
      if (s.shot !== samples[frame - 1]?.shot) cuts.push({ frame, shot: s.shot });
      samples.push(s);
    }
    return { motion: { fps: profile.fps, frames: profile.frames, cuts, samples }, error: `auditMotion 没跑完（${(e as Error).message}），切镜按逐帧镜头名自己切` };
  }
};

export const loadWorkSource = async (o: { codeRoot: string; workRoot: string; work: string; dataRoot: string; motion?: boolean }): Promise<WorkSource> => {
  const measureLock = { ...readAssetLock(path.join(o.codeRoot, 'assets', '资产锁')), ...readAssetLock(workAssetLockPath(o.workRoot)) };
  const lock = applySwap(measureLock, o.workRoot);
  const bundle = (contents: string) => importBundled({ contents, resolveDir: o.workRoot }, { codeRoot: o.codeRoot, lock });
  const manifestModule = (await bundle(`export * from ${JSON.stringify(path.join(o.workRoot, '清单.ts'))};`)) as unknown as WorkManifest;
  const entries = manifestModule.manifest.filter((t) => t.章 !== '核对');
  const segFiles = entries.map((t) => {
    const dir = path.join(o.workRoot, ...manifestModule.segDir(t.key).split('/'));
    const table = path.join(dir, '声音表.生成.ts');
    return { seg: path.join(dir, '段.ts'), table: fs.existsSync(table) ? table : null };
  });
  const sceneDir = path.join(o.workRoot, '场');
  const scenes = fs.existsSync(sceneDir) ? fs.readdirSync(sceneDir).filter((k) => fs.existsSync(path.join(sceneDir, k, '时间线.ts'))).sort() : [];
  const motionFile = path.join(o.workRoot, '动作体检.ts');
  const withMotion = o.motion !== false && fs.existsSync(motionFile);
  const q = JSON.stringify;
  const lines = [
    ...segFiles.flatMap((f, i) => [`import seg${i} from ${q(f.seg)};`, ...(f.table ? [`import table${i} from ${q(f.table)};`] : [])]),
    ...scenes.map((k, i) => `import * as scene${i} from ${q(path.join(sceneDir, k, '时间线.ts'))};`),
    ...(withMotion ? [`import motionProfile from ${q(motionFile)};`] : []),
    `export const segs = [${segFiles.map((f, i) => `[seg${i}, ${f.table ? `table${i}` : 'null'}]`).join(', ')}];`,
    `export const scenes = {${scenes.map((k, i) => `${q(k)}: scene${i}.default`).join(', ')}};`,
    `export const motion = ${withMotion ? 'motionProfile' : 'null'};`,
  ];
  const m = (await bundle(lines.join('\n'))) as { segs: [SegmentDef, SoundTable | null][]; scenes: Record<string, SourceTimeline | undefined>; motion: MotionProfile | null };
  const timelines = Object.fromEntries(Object.entries(m.scenes).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => [k, { events: v!.events, sound: v!.sound }]));
  const sampled = m.motion ? sampleMotion(m.motion) : null;
  return {
    work: o.work,
    segments: entries.map((t, i) => ({ key: t.key, serial: manifestModule.segmentCode(t.key), def: m.segs[i]![0], soundTable: m.segs[i]![1] })),
    timelines,
    motion: sampled?.motion ?? null,
    ...(sampled?.error ? { motionError: sampled.error } : {}),
    measure: (id) => knownAudioMeasure(measureLock[id], o.dataRoot),
    lock,
  };
};
