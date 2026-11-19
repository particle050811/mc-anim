import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { auditMotion, type MotionProfile, type MotionSample } from '../../engine/anim/动作体检.ts';
import { parseArgs, UsageError } from '../cli/参数.ts';
import { workRoot } from '../环境/作品.ts';
import { config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { lowPriority, runCapture } from '../环境/子进程.ts';
import { passGate } from '../闸/闸.ts';
import { esbuildAliasPlugin } from '../资产/esbuild插件.ts';
import { resolveAsset, readWorkAssetLock } from '../资产/资产锁.ts';
import { auditCadence } from './成片节拍.ts';

const loadMotion = async (entry: string): Promise<MotionProfile> => {
  const lock = readWorkAssetLock(workRoot());
  const built = await build({ entryPoints: [entry], bundle: true, format: 'esm', packages: 'external', platform: 'node', write: false, jsx: 'automatic', logLevel: 'silent', plugins: [esbuildAliasPlugin(codeRoot()), {
    name: 'motion-assets', setup(builder) {
      builder.onResolve({ filter: /^asset:/ }, args => ({ path: args.path.slice(6), namespace: 'motion' }));
      builder.onLoad({ filter: /.*/, namespace: 'motion' }, args => {
        const { file, entry: asset } = resolveAsset(args.path, lock);
        if (asset.suffix === '.json') return { contents: fs.readFileSync(file), loader: 'json' };
        const value = asset.suffix === '.png' ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : `asset:${args.path}`;
        return { contents: `export default ${JSON.stringify(value)}` };
      });
    },
  }] });
  const cache = path.join(codeRoot(), 'node_modules', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.mkdtempSync(path.join(cache, 'motion-'));
  try {
    const moduleFile = path.join(dir, 'profile.mjs');
    fs.writeFileSync(moduleFile, built.outputFiles[0]!.contents);
    return (await import(pathToFileURL(moduleFile).href)).default;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

export const runMotionAudit = async (args: string[]) => {
  const parsed = parseArgs(args, { value: ['--video', '--out', '--trace'] });
  if (parsed.位置.length) throw new UsageError('verify motion [--video 成片] [--out 报告.json] [--trace 起帧-止帧]');
  const entry = path.join(workRoot(), '动作体检.ts');
  if (!fs.existsSync(entry)) throw new UsageError(`作品未登记动作轨和碰撞对：${entry}`);
  const video = parsed.value['--video'], out = parsed.value['--out'];
  if (out && (path.extname(out) !== '.json' || fs.existsSync(out))) throw new UsageError('--out 需用新的 .json 文件，避免覆盖已有数据');
  const profile = await loadMotion(entry);
  const window = parsed.value['--trace']?.match(/^(\d+)-(\d+)$/);
  if (parsed.value['--trace'] !== undefined && (!out || !window || +window[1]! > +window[2]! || +window[2]! >= profile.frames)) throw new UsageError('--trace 需为正片内闭区间，并指定 --out');
  const trace: (MotionSample & { frame: number })[] = [];
  const motion = auditMotion(profile, window ? (frame, sample) => {
    if (frame >= +window[1]! && frame <= +window[2]!) trace.push({ frame, ...sample });
  } : undefined);
  const cadence = video ? await passGate(async () => auditCadence(runCapture(lowPriority([config('ffmpeg'), '-v', 'error', '-xerror', '-nostdin', '-copyts', '-i', path.resolve(video), '-map', '0:v:0', '-vf', 'scale=160:90:flags=area,format=gray', '-fps_mode', 'passthrough', '-enc_time_base', 'demux', '-f', 'framemd5', '-'])), motion.fps, motion.frames)) : null;
  const report = { profile: entry, video: video ? path.resolve(video) : null, motion, cadence, ...(window && { trace }) };
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`动作 ${motion.frames} 帧 @ ${motion.fps}，${motion.cuts.length} 镜，${motion.findings.length} 段超限。`);
  for (const finding of motion.findings.slice(0, 15)) console.log(`${finding.shot} F${finding.first}–${finding.last} ${finding.track} ${finding.rule} ${finding.worst.toFixed(4)} > ${finding.limit}（峰值 F${finding.frame}）`);
  console.log(cadence ? `成片解码 ${cadence.frames} 帧，间隔 ${cadence.minMs.toFixed(3)}–${cadence.maxMs.toFixed(3)} ms，节拍超限 ${cadence.badTiming.length}，相邻缩略图相同 ${cadence.repeated.length}。` : '未传 --video，只检查动作源，不代表成片通过。');
  return motion.findings.length || cadence?.pass === false ? 1 : 0;
};

export const verifyWorkMotion = async () => {
  const entry = path.join(workRoot(), '动作体检.ts');
  if (!fs.existsSync(entry)) return;
  if (await runMotionAudit([])) throw Error('作品动作体检未通过，未开始整片渲染。用 verify motion --out 新报告.json 定位。');
};
