// anim still <段> <帧…> --to-preview <主题> [--level …] [--per-frame]；anim bench（测速.ts）；anim timing [<段>] [--last <n>] [--verbose]（运行记录/渲染明细.ts）。
// 出片（渲段、接成片）只有 anim film（合成/命令.ts）：anim render 用户 11-06 定删掉（「那个 render 不用了 可以直接删了吧」，决策/0014）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { selectSegs } from '../清单/清单.ts';
import { newPreviewDir } from '../预览/预览.ts';
import { renderLevels, type RenderLevel } from '../../engine/段/设置值.ts';
import { renderStillFrames } from './渲.ts';
import { bench } from './测速.ts';
import { parseShading } from './光影试看.ts';
import { parseTelescope } from './望远.ts';
import { detailOverview, detailReport, readDetailList } from '../运行记录/渲染明细.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { segFrameCount } from '../../engine/段/段定义.ts';
import { filmProfile } from './设置.ts';

export const stillFrameList = (params: string[], segKey: string, totalFrames: number) => {
  const frames = new Set<number>();
  for (const argItem of params) {
    for (const item of argItem.trim().split(/\s*,\s*|\s+/)) {
      const frameMatch = /^(\d+)(?:-(\d+))?$/.exec(item);
      if (!frameMatch) throw new UsageError(`帧号要是非负整数或闭区间：${item}`);
      const startFrame = Number(frameMatch[1]), endFrame = Number(frameMatch[2] ?? frameMatch[1]);
      if (startFrame > endFrame) throw new UsageError(`帧范围起点比终点大：${item}`);
      if (endFrame >= totalFrames) throw new UsageError(`${segKey} 只有 ${totalFrames} 帧，没有第 ${endFrame} 帧`);
      for (let frame = startFrame; frame <= endFrame; frame++) frames.add(frame);
    }
  }
  return [...frames];
};

const parseLevel = (v: string | undefined): RenderLevel => {
  const level = (v ?? '视频') as RenderLevel;
  if (!renderLevels.includes(level)) throw new UsageError(`--level 只能是 ${renderLevels.join('、')}`);
  return level;
};

export const renderCommands: Record<string, Command> = {
  still: {
    用法: 'still <段> <帧…（空格、逗号或起-止）> --to-preview <主题> [--level 视频|预览] [--per-frame] [--shading <配置>[;<配置>…]] [--tele <x,y,宽 | 心x,心y,倍x>[;…] [--finer] [--truth]]',
    说明: '渲几帧静帧（PNG）进预览。多帧默认在同一页面连出，快；--per-frame 每帧开新页面，慢但每帧都和单独出一帧相同，逐像素比或连出崩页时用它。--shading 把三渲二画布换成带光影层的试看画布，每份配置（预设名或 JSON）各出一遍，文件名带 -光影-<名>（pipeline/渲/光影试看.ts）。--tele 照原镜头只把原帧里的一块矩形用整张图原生渲出来（看远处细节，不是渲完再放大）：x,y,宽 是矩形左上角和宽（原帧像素，视频级 3840×2160），或 心x,心y,8x 给中心和倍数；2D 叠层和字幕不画，文件名带 -望远-x…-y…-宽…；默认出来的是原帧那块的放大（分级、阴影、台阶并色、贴图级别都照原帧算）；加 --finer 远处强制用更细的一级，加 --truth 着色器里按像素大小做的远处简化（台阶并色、贴图取粗一级）照望远后的像素算、等于看原帧每个像素里本来有什么（文件名再带 -细一级、-真值，都不再是原帧那块的放大）。做法和偏差见 docs/望远.md',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--level', '--to-preview', '--shading', '--tele'], toggles: ['--per-frame', '--finer', '--truth'] });
      const [selector, ...frameArgs] = p.位置;
      if (!selector || !frameArgs.length || !p.值['--to-preview']) throw new UsageError('要 anim still <段> <帧…> --to-preview <主题>');
      const cues = await runCuesBeforeRender();
      const segments = await selectSegs([selector]);
      if (segments.length !== 1) throw new UsageError(`still 一次只渲一段，「${selector}」对上了 ${segments.length} 段`);
      checkSelectedSegCues(cues, segments);
      const seg = segments[0]!;
      const frames = stillFrameList(frameArgs, seg.键, segFrameCount(seg.段, filmProfile().fps));
      const level = parseLevel(p.值['--level']);
      for (const flag of ['--finer', '--truth']) if (p.toggles.has(flag) && !p.值['--tele']) throw new UsageError(`${flag} 要和 --tele 一起给（整帧看就写 --tele 0,0,<全宽>）`);
      if (p.值['--shading'] && p.值['--tele']) throw new UsageError('--shading 和 --tele 不能同时给');
      const outputScale = level === '预览' ? 1 : filmProfile().renderMultiplier;
      let telescope;
      try {
        telescope = p.值['--tele'] ? parseTelescope(p.值['--tele'], [seg.段.宽 * outputScale, seg.段.高 * outputScale], { fineLevel: p.toggles.has('--finer'), 真值: p.toggles.has('--truth') }) : undefined;
      } catch (e) {
        throw new UsageError((e as Error).message);
      }
      const dir = newPreviewDir(p.值['--to-preview']);
      const products = await renderStillFrames(segments[0]!, frames, level, dir, runRecord, { frameByFrame: p.toggles.has('--per-frame'), shading: p.值['--shading'] ? parseShading(p.值['--shading']) : undefined, telescope });
      runRecord.产物.push(...products);
      console.log(`静帧在 ${dir}`);
    },
  },
  bench: {
    用法: 'bench <段> [--frames <起>-<止>] [--level 视频|预览] [--runs <n>] [--verbose] [--out <json>] [--no-shm] [--browser <chrome-headless-shell>] [--no-logs] [--keep-out <目录>] [--shading <配置>]',
    说明: '测速：照切片参数（带字幕、输出帧）渲一段帧（默认前 100 帧），按打包、开浏览器、首帧、出帧、收尾计时，不写母版缓存，缺求解缓存时先补齐（docs/渲染性能.md）',
    跑: async (args) => {
      const p = parseArgs(args, { 值: ['--frames', '--level', '--runs', '--out', '--browser', '--keep-out', '--shading'], toggles: ['--verbose', '--no-shm', '--no-logs'] });
      const shading = p.值['--shading'] ? parseShading(p.值['--shading']) : undefined;
      if (shading && shading.length !== 1) throw new UsageError('bench 的 --shading 只给一份配置');
      if (p.位置.length !== 1) throw new UsageError('要给一段（段键、段名或编号）');
      const frameRange = p.值['--frames'];
      const m = frameRange ? /^(\d+)-(\d+)$/.exec(frameRange) : null;
      if (frameRange && (!m || Number(m[1]) > Number(m[2]))) throw new UsageError(`--frames 写成 <起>-<止>：${frameRange}`);
      const repeats = Number(p.值['--runs'] ?? 1);
      if (!Number.isInteger(repeats) || repeats < 1) throw new UsageError(`--runs 要是正整数：${p.值['--runs']}`);
      const outPath = p.值['--out'];
      const verbose = p.toggles.has('--verbose');
      const r = await bench({
        段: p.位置[0]!, 帧: m ? [Number(m[1]), Number(m[2])] : undefined, 级别: p.值['--level'] ? parseLevel(p.值['--level']) : undefined, 次: repeats, verbose,
        disableSharedMemory: p.toggles.has('--no-shm'), 浏览器: p.值['--browser'], noLogCollect: p.toggles.has('--no-logs'), keepOutput: p.值['--keep-out'], shading: shading?.[0],
        logPath: verbose ? (outPath ? outPath.replace(/\.json$/, '') : path.join(os.tmpdir(), `mc-anim-测速-${process.pid}`)) + '.log' : undefined,
      });
      const text = JSON.stringify(r, null, 2);
      console.log(text);
      if (outPath) fs.writeFileSync(outPath, text + '\n', 'utf8');
    },
  },
  timing: {
    用法: 'timing [<段>] [--last <n>] [--verbose]',
    说明: '看渲染耗时：不给段列最近几次；给段（标签里含这几个字）报最近一次的阶段、每帧、等得最多的、最慢的帧、机器负载（docs/渲染性能.md）',
    跑: async (args) => {
      const p = parseArgs(args, { 值: ['--last'], toggles: ['--verbose'] });
      if (p.位置.length > 1) throw new UsageError('最多给一段');
      const recentCount = Number(p.值['--last'] ?? (p.位置.length ? 1 : 20));
      if (!Number.isInteger(recentCount) || recentCount < 1) throw new UsageError(`--last 要是正整数：${p.值['--last']}`);
      const details = readDetailList({ contains: p.位置[0], 最多: recentCount });
      if (!details.length) {
        console.log(p.位置[0] ? `还没有含「${p.位置[0]}」的渲染明细` : '还没有渲染明细（渲过一次才有）');
        return;
      }
      if (p.位置.length || p.toggles.has('--verbose')) console.log(details.map((x) => detailReport(x.明细, x.文件)).join('\n\n'));
      else console.log(detailOverview(details));
    },
  },
};
