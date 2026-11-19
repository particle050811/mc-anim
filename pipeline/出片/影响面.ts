// anim impact 的比较：两份代码各算的全片快照（时间轴 + 动作体检逐帧采样）比一遍，按段、按成片秒列出变化。纯函数。
// 用户 11-19 说改一处总是「顾头不顾尾」，后面接着的地方跟着不连续，要像单元测试那样一眼看出：改完不渲染就知道全片哪里跟着变了。
// 前面的段变长变短，后面的段整体平移：平移单独报（连锁变化），不算后面那些段的内容变了；内容一律按段内时间对齐再比。
import type { TimelineAudio, TimelineBody, TimelineSegment } from './时间轴.ts';
import type { MotionFrames } from './作品源.ts';
import type { Snapshot } from './影响面源.ts';

/** 动作轨偏移小于这么多格当没变（浮点尾数） */
export const motionEpsilon = 1e-4;
const secEps = 1e-4;
const dbEps = 0.05;

export type AudioChange = { change: '增' | '删' | '改'; name: string; asset: string; group: string | null; kind: string; localSec: number; filmSec: number; details: string[] };
export type ShotChange = { change: '增' | '删' | '挪'; name: string; localSec: number; filmSec: number; details: string };
export type MotionChange = { shot: string; track: string; maxOffset: number; atLocalSec: number; atFilmSec: number; firstLocalSec: number; lastLocalSec: number; frames: number; onlyOneSide: boolean };
export type SegImpact = {
  key: string;
  status: '增' | '删' | '在';
  oldStartSec: number | null;
  newStartSec: number | null;
  oldDurSec: number | null;
  newDurSec: number | null;
  /** 新 − 旧（秒、帧）；增、删的段是 0 */
  durDeltaSec: number;
  durDeltaFrames: number;
  shiftSec: number;
  shiftFrames: number;
  audio: AudioChange[];
  shots: ShotChange[];
  motion: MotionChange[];
};
/** 一串整体平移的段和平移量；cause 是它前面段长变了、增删的段 */
export type ShiftRun = { keys: string[]; shiftSec: number; shiftFrames: number; cause: string[] };
export type ImpactReport = { oldLabel: string; newLabel: string; work: string; fps: number; segments: SegImpact[]; shifts: ShiftRun[]; motionNote: string[] };

const r = (x: number, d = 3) => Number(x.toFixed(d));
const fmt = (x: number, d = 2) => x.toFixed(d);
const signed = (x: number, d = 2) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(d)}`;
const dbText = (x: number | null) => (x === null ? '静音' : `${fmt(x, 1)} dB`);

/** 截到段尾时截在文件第几秒 */
const cutFileSec = (a: TimelineAudio) => a.inSec + a.durSec * a.rate;

const audioDetails = (o: TimelineAudio, n: TimelineAudio, oSeg: TimelineSegment, nSeg: TimelineSegment): string[] => {
  const out: string[] = [];
  if (o.name !== n.name) out.push(`改名「${o.name}」→「${n.name}」`);
  const moved = n.startSec - nSeg.startSec - (o.startSec - oSeg.startSec);
  if (Math.abs(moved) > secEps) out.push(`起点挪了 ${signed(moved, 3)} 秒（段内 ${fmt(o.startSec - oSeg.startSec, 3)} → ${fmt(n.startSec - nSeg.startSec, 3)}）`);
  if (Math.abs(n.durSec - o.durSec) > secEps) out.push(`长 ${fmt(o.durSec, 3)} → ${fmt(n.durSec, 3)} 秒`);
  if (Math.abs(n.inSec - o.inSec) > secEps) out.push(`入点 ${fmt(o.inSec, 3)} → ${fmt(n.inSec, 3)} 秒`);
  const gainDiff = (a: number | null, b: number | null) => (a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > dbEps);
  if (gainDiff(o.gainDb, n.gainDb)) out.push(`起点增益 ${dbText(o.gainDb)} → ${dbText(n.gainDb)}`);
  if (gainDiff(o.endGainDb, n.endGainDb)) out.push(`末尾增益 ${dbText(o.endGainDb)} → ${dbText(n.endGainDb)}`);
  if (Math.abs(n.rate - o.rate) > 1e-6) out.push(`速率 ${o.rate} → ${n.rate}`);
  if (o.loop !== n.loop) out.push(n.loop ? '改成循环' : '不再循环');
  if ((o.fadeOutSec ?? 0) !== (n.fadeOutSec ?? 0)) out.push(`淡出 ${o.fadeOutSec ?? '无'} → ${n.fadeOutSec ?? '无'}`);
  if (o.cutAtSegEnd !== n.cutAtSegEnd) out.push(n.cutAtSegEnd ? `变成在段尾被截断（截在文件第 ${fmt(cutFileSec(n))} 秒）` : `不再被段尾截断（原来截在文件第 ${fmt(cutFileSec(o))} 秒）`);
  else if (o.cutAtSegEnd && Math.abs(cutFileSec(n) - cutFileSec(o)) > secEps) out.push(`段尾截断的位置变了：截在文件第 ${fmt(cutFileSec(o))} → ${fmt(cutFileSec(n))} 秒`);
  if ((o.cutReason ?? '') !== (n.cutReason ?? '')) out.push(`cutReason「${o.cutReason ?? ''}」→「${n.cutReason ?? ''}」`);
  if (o.group !== n.group) out.push(`跨段分组 ${o.group ?? '无'} → ${n.group ?? '无'}`);
  return out;
};

/** 同名同资产的几条：条数一样按顺序配，不一样按段内起点最近的先配 */
const pairAudio = (olds: TimelineAudio[], news: TimelineAudio[], oSeg: TimelineSegment, nSeg: TimelineSegment) => {
  const key = (a: TimelineAudio) => `${a.kind}\u0000${a.name}\u0000${a.asset}`;
  const groups = new Map<string, { o: TimelineAudio[]; n: TimelineAudio[] }>();
  for (const a of olds) (groups.get(key(a)) ?? groups.set(key(a), { o: [], n: [] }).get(key(a))!).o.push(a);
  for (const a of news) (groups.get(key(a)) ?? groups.set(key(a), { o: [], n: [] }).get(key(a))!).n.push(a);
  const pairs: [TimelineAudio | null, TimelineAudio | null][] = [];
  for (const { o, n } of groups.values()) {
    if (o.length === n.length) {
      o.forEach((x, i) => pairs.push([x, n[i]!]));
      continue;
    }
    const cand = o.flatMap((x, i) => n.map((y, j) => ({ i, j, d: Math.abs(y.startSec - nSeg.startSec - (x.startSec - oSeg.startSec)) }))).sort((a, b) => a.d - b.d);
    const usedO = new Set<number>();
    const usedN = new Set<number>();
    for (const c of cand) {
      if (usedO.has(c.i) || usedN.has(c.j)) continue;
      usedO.add(c.i);
      usedN.add(c.j);
      pairs.push([o[c.i]!, n[c.j]!]);
    }
    o.forEach((x, i) => usedO.has(i) || pairs.push([x, null]));
    n.forEach((y, j) => usedN.has(j) || pairs.push([null, y]));
  }
  // 改了名的（同一资产、同一刻起放）：配成一对，不算一删一增
  const lone = (side: 0 | 1) => pairs.filter((p) => p[side] && !p[1 - side]);
  for (const del of lone(0)) {
    const x = del[0]!;
    const add = lone(1).find(([, y]) => y!.kind === x.kind && y!.asset === x.asset && Math.abs(y!.startSec - nSeg.startSec - (x.startSec - oSeg.startSec)) < secEps);
    if (!add) continue;
    pairs.splice(pairs.indexOf(add), 1);
    del[1] = add[1];
  }
  return pairs;
};

const diffAudio = (oldBody: TimelineBody, newBody: TimelineBody, oSeg: TimelineSegment, nSeg: TimelineSegment): AudioChange[] => {
  const out: AudioChange[] = [];
  for (const [o, n] of pairAudio(oldBody.audio.filter((a) => a.segment === oSeg.key), newBody.audio.filter((a) => a.segment === nSeg.key), oSeg, nSeg)) {
    const x = (n ?? o)!;
    const seg = n ? nSeg : oSeg;
    const localSec = r(x.startSec - seg.startSec);
    // 成片秒一律按新的一边算（删掉的那条也给它在新片里该在的位置）
    const base = { name: x.name, asset: x.asset, group: x.group, kind: x.kind, localSec, filmSec: r(nSeg.startSec + localSec) };
    if (!o) out.push({ ...base, change: '增', details: [`段内 ${fmt(base.localSec, 3)} 秒起放 ${fmt(x.durSec, 3)} 秒`] });
    else if (!n) out.push({ ...base, change: '删', details: [`原来段内 ${fmt(base.localSec, 3)} 秒起放 ${fmt(x.durSec, 3)} 秒`] });
    else {
      const details = audioDetails(o, n, oSeg, nSeg);
      if (details.length) out.push({ ...base, change: '改', details });
    }
  }
  return out.sort((a, b) => a.localSec - b.localSec);
};

const diffShots = (oldBody: TimelineBody, newBody: TimelineBody, oSeg: TimelineSegment, nSeg: TimelineSegment, fps: number): ShotChange[] => {
  const local = (b: TimelineBody, s: TimelineSegment) => b.shots.filter((x) => x.segment === s.key).map((x) => ({ name: x.name, frame: x.startFrame - s.startFrame }));
  const o = local(oldBody, oSeg);
  const n = local(newBody, nSeg);
  const out: ShotChange[] = [];
  const usedO = new Set<number>();
  for (const y of n) {
    const exact = o.findIndex((x, i) => !usedO.has(i) && x.name === y.name && x.frame === y.frame);
    if (exact >= 0) {
      usedO.add(exact);
      continue;
    }
    const near = o.map((x, i) => ({ x, i })).filter(({ x, i }) => !usedO.has(i) && x.name === y.name).sort((a, b) => Math.abs(a.x.frame - y.frame) - Math.abs(b.x.frame - y.frame))[0];
    const localSec = r(y.frame / fps);
    if (near) {
      usedO.add(near.i);
      out.push({ change: '挪', name: y.name, localSec, filmSec: r((nSeg.startFrame + y.frame) / fps), details: `切到这一镜挪了 ${signed((y.frame - near.x.frame) / fps, 3)} 秒（${y.frame - near.x.frame} 帧，段内 ${fmt(near.x.frame / fps, 3)} → ${fmt(localSec, 3)}）` });
    } else out.push({ change: '增', name: y.name, localSec, filmSec: r((nSeg.startFrame + y.frame) / fps), details: `段内 ${fmt(localSec, 3)} 秒切到这一镜` });
  }
  o.forEach((x, i) => usedO.has(i) || out.push({ change: '删', name: x.name, localSec: r(x.frame / fps), filmSec: r((nSeg.startFrame + x.frame) / fps), details: `原来段内 ${fmt(x.frame / fps, 3)} 秒切到这一镜` }));
  return out.sort((a, b) => a.localSec - b.localSec);
};

/** 动作轨：两边按段内帧对齐（只比两边都有的帧），按（本检出的镜头、轨）收最大偏移和出现区间 */
const diffMotion = (om: MotionFrames, nm: MotionFrames, oSeg: TimelineSegment, nSeg: TimelineSegment, fps: number): MotionChange[] => {
  const acc = new Map<string, MotionChange & { firstFrame: number; lastFrame: number; maxFrame: number }>();
  const frames = Math.min(oSeg.frameCount, nSeg.frameCount);
  for (let g = 0; g < frames; g++) {
    const oi = Math.round(((oSeg.startFrame + g) / fps) * om.fps);
    const ni = Math.round(((nSeg.startFrame + g) / fps) * nm.fps);
    const a = om.samples[oi];
    const b = nm.samples[ni];
    if (!a || !b) continue;
    for (const track of new Set([...Object.keys(a.points), ...Object.keys(b.points)])) {
      const p = a.points[track];
      const q = b.points[track];
      const onlyOneSide = !p || !q;
      const d = onlyOneSide ? Infinity : Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (!(d > motionEpsilon)) continue;
      const k = `${b.shot}\u0000${track}\u0000${onlyOneSide}`;
      const m = acc.get(k);
      if (!m) acc.set(k, { shot: b.shot, track, maxOffset: d, atLocalSec: 0, atFilmSec: 0, firstLocalSec: 0, lastLocalSec: 0, frames: 1, onlyOneSide, firstFrame: g, lastFrame: g, maxFrame: g });
      else {
        m.frames++;
        m.lastFrame = g;
        if (d > m.maxOffset) Object.assign(m, { maxOffset: d, maxFrame: g });
      }
    }
  }
  return [...acc.values()]
    .map(({ firstFrame, lastFrame, maxFrame, ...m }) => ({ ...m, maxOffset: m.onlyOneSide ? 0 : r(m.maxOffset, 4), atLocalSec: r(maxFrame / fps), atFilmSec: r((nSeg.startFrame + maxFrame) / fps), firstLocalSec: r(firstFrame / fps), lastLocalSec: r(lastFrame / fps) }))
    .sort((a, b) => a.firstLocalSec - b.firstLocalSec || a.track.localeCompare(b.track));
};

export const compareSnapshots = (oldSnap: Snapshot, newSnap: Snapshot, o: { work: string; fps: number }): ImpactReport => {
  const fps = o.fps;
  const oldSegs = oldSnap.body.segments;
  const newSegs = newSnap.body.segments;
  const motionNote: string[] = [];
  const motionOk = oldSnap.motion && newSnap.motion;
  if (!oldSnap.motion !== !newSnap.motion) motionNote.push(`动作体检只有一边有（${oldSnap.motion ? oldSnap.label : newSnap.label}），不比动作轨`);
  for (const s of [oldSnap, newSnap]) if (s.motionError) motionNote.push(`${s.label}：${s.motionError}`);
  const segments: SegImpact[] = [];
  const empty = { audio: [], shots: [], motion: [] };
  for (const n of newSegs) {
    const old = oldSegs.find((x) => x.key === n.key);
    if (!old) {
      segments.push({ key: n.key, status: '增', oldStartSec: null, newStartSec: n.startSec, oldDurSec: null, newDurSec: n.durSec, durDeltaSec: 0, durDeltaFrames: 0, shiftSec: 0, shiftFrames: 0, ...empty });
      continue;
    }
    segments.push({
      key: n.key, status: '在', oldStartSec: old.startSec, newStartSec: n.startSec, oldDurSec: old.durSec, newDurSec: n.durSec,
      durDeltaSec: r(n.durSec - old.durSec, 6), durDeltaFrames: n.frameCount - old.frameCount, shiftSec: r(n.startSec - old.startSec, 6), shiftFrames: n.startFrame - old.startFrame,
      audio: diffAudio(oldSnap.body, newSnap.body, old, n),
      shots: diffShots(oldSnap.body, newSnap.body, old, n, fps),
      motion: motionOk ? diffMotion(oldSnap.motion!, newSnap.motion!, old, n, fps) : [],
    });
  }
  for (const old of oldSegs) if (!newSegs.some((x) => x.key === old.key)) segments.push({ key: old.key, status: '删', oldStartSec: old.startSec, newStartSec: null, oldDurSec: old.durSec, newDurSec: null, durDeltaSec: 0, durDeltaFrames: 0, shiftSec: 0, shiftFrames: 0, ...empty });
  // 连锁平移：新顺序里平移量一样、挨着的几段算一串，原因是它前面段长变了、增删了的段
  const shifts: ShiftRun[] = [];
  const ordered = newSegs.map((n) => segments.find((s) => s.key === n.key)!);
  ordered.forEach((s, i) => {
    if (s.status !== '在' || s.shiftFrames === 0) return;
    const last = shifts.at(-1);
    if (last && last.shiftFrames === s.shiftFrames && last.keys.at(-1) === ordered[i - 1]?.key) {
      last.keys.push(s.key);
      return;
    }
    const cause = [
      ...ordered.slice(0, i).filter((x) => x.status === '增' || x.durDeltaFrames !== 0).map((x) => (x.status === '增' ? `${x.key} 是新加的（${fmt(x.newDurSec!)} 秒）` : `${x.key} 段长 ${signed(x.durDeltaSec)} 秒`)),
      ...segments.filter((x) => x.status === '删').map((x) => `${x.key} 删了（${fmt(x.oldDurSec!)} 秒）`),
    ];
    shifts.push({ keys: [s.key], shiftSec: s.shiftSec, shiftFrames: s.shiftFrames, cause });
  });
  return { oldLabel: oldSnap.label, newLabel: newSnap.label, work: o.work, fps, segments, shifts, motionNote };
};

/** 段平移以外有没有真变 */
export const contentChanged = (s: SegImpact) => s.status !== '在' || s.durDeltaFrames !== 0 || s.audio.length > 0 || s.shots.length > 0 || s.motion.length > 0;

const audioLine = (a: AudioChange) => `声音${a.change} ${a.name}（${a.kind} ${a.asset}${a.group ? `，${a.group}` : ''}，段内 ${fmt(a.localSec, 3)} 秒、成片 ${fmt(a.filmSec, 3)} 秒）：${a.details.join('；')}`;
const motionLine = (m: MotionChange) =>
  m.onlyOneSide
    ? `动作 ${m.shot} ${m.track}：只有一边有这条轨，段内 ${fmt(m.firstLocalSec)}–${fmt(m.lastLocalSec)} 秒（${m.frames} 帧）`
    : `动作 ${m.shot} ${m.track}：最大偏移 ${m.maxOffset >= 0.01 ? fmt(m.maxOffset, 3) : m.maxOffset.toExponential(1)} 格（段内 ${fmt(m.atLocalSec)} 秒、成片 ${fmt(m.atFilmSec)} 秒），段内 ${fmt(m.firstLocalSec)}–${fmt(m.lastLocalSec)} 秒有偏移（${m.frames} 帧）`;

/** 终端输出：先一行总结，再连锁平移，再按段列平移以外的变化（只列 keys 里的段；不给 = 全部） */
export const formatImpact = (rep: ImpactReport, o: { keys?: readonly string[]; maxLines?: number } = {}): string[] => {
  const maxLines = o.maxLines ?? 20;
  const shown = rep.segments.filter((s) => !o.keys || o.keys.includes(s.key));
  const lenChanged = shown.filter((s) => s.status === '在' && s.durDeltaFrames !== 0);
  const shifted = shown.filter((s) => s.status === '在' && s.shiftFrames !== 0);
  const changed = shown.filter((s) => s.status === '在' && (s.audio.length || s.shots.length || s.motion.length));
  const added = shown.filter((s) => s.status === '增');
  const removed = shown.filter((s) => s.status === '删');
  const lines: string[] = [];
  const parts = [
    added.length && `新加 ${added.length} 段`, removed.length && `删了 ${removed.length} 段`, lenChanged.length && `段长变了 ${lenChanged.length} 段`,
    shifted.length && `整体平移 ${shifted.length} 段`, changed.length && `平移以外内容变了 ${changed.length} 段`,
  ].filter(Boolean);
  lines.push(`影响面：${rep.newLabel} 对比 ${rep.oldLabel}，作品 ${rep.work}，看 ${shown.length} 段：${parts.length ? parts.join('，') : '没有变化'}`);
  for (const n of rep.motionNote) lines.push(`  注意：${n}`);
  const runs = rep.shifts.map((x) => ({ ...x, keys: x.keys.filter((k) => !o.keys || o.keys.includes(k)) })).filter((x) => x.keys.length);
  if (lenChanged.length || added.length || removed.length || runs.length) {
    lines.push('== 段长、起点（连锁平移）');
    for (const s of added) lines.push(`  ${s.key} 新加：成片 ${fmt(s.newStartSec!)}–${fmt(s.newStartSec! + s.newDurSec!)} 秒`);
    for (const s of removed) lines.push(`  ${s.key} 删了：原来成片 ${fmt(s.oldStartSec!)}–${fmt(s.oldStartSec! + s.oldDurSec!)} 秒`);
    for (const s of lenChanged) lines.push(`  ${s.key} 段长 ${fmt(s.oldDurSec!, 3)} → ${fmt(s.newDurSec!, 3)} 秒（${signed(s.durDeltaSec, 3)} 秒，${signed(s.durDeltaFrames, 0)} 帧）`);
    for (const x of runs)
      lines.push(`  → ${x.keys.length > 1 ? `${x.keys.length} 段` : x.keys[0]} 整体${x.shiftFrames < 0 ? '前移' : '后移'} ${fmt(Math.abs(x.shiftSec), 3)} 秒（${Math.abs(x.shiftFrames)} 帧）：${x.keys.join('、')}${x.cause.length ? `；因为 ${x.cause.join('、')}` : ''}。下面按段内时间对齐比，平移本身不算变化`);
  }
  lines.push('== 按段（段内时间对齐，平移以外的变化）');
  for (const s of shown) {
    if (s.status !== '在') continue;
    const where = `成片 ${fmt(s.newStartSec!)}–${fmt(s.newStartSec! + s.newDurSec!)} 秒${s.shiftFrames ? `，原 ${fmt(s.oldStartSec!)}–${fmt(s.oldStartSec! + s.oldDurSec!)}` : ''}`;
    // 先列最容易听出、看出突变的：配乐、段尾截断，再切镜、动作，最后别的声音；同类按段内时间
    const audioRank = (a: AudioChange) => (a.kind === '配乐' ? 0 : a.details.some((d) => d.includes('截断')) ? 1 : 4);
    const sortedAudio = [...s.audio].sort((a, b) => audioRank(a) - audioRank(b) || a.localSec - b.localSec);
    const items = [
      ...sortedAudio.filter((a) => audioRank(a) < 4).map(audioLine),
      ...s.shots.map((x) => `镜头${x.change} ${x.name}：${x.details}（成片 ${fmt(x.filmSec, 3)} 秒）`),
      ...s.motion.map(motionLine),
      ...sortedAudio.filter((a) => audioRank(a) === 4).map(audioLine),
    ];
    const lenNote = s.durDeltaFrames ? `（段长变了，动作只比两边都有的前 ${fmt(Math.min(s.oldDurSec!, s.newDurSec!))} 秒）` : '';
    if (!items.length) {
      lines.push(`${s.key}（${where}）：${s.durDeltaFrames ? '段长以外没变' : '平移以外没变'}`);
      continue;
    }
    lines.push(`${s.key}（${where}）${lenNote}`);
    for (const t of items.slice(0, maxLines)) lines.push(`  ${t}`);
    if (items.length > maxLines) lines.push(`  …还有 ${items.length - maxLines} 处（--json 看全部）`);
  }
  return lines;
};
