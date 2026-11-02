import {记阶段} from '../运行记录/阶段.ts';
// 测速：同一段取一段帧，照母版的渲染参数渲一遍，按阶段计时（打包 / 开浏览器 / 读 Composition / 首帧 / 出帧 / 编码收尾），不写母版缓存、不按段记耗时（不影响 render 报的预计耗时）。
// 用途：比 Remotion 版本、比引擎改动前后（docs/渲染性能.md）。走渲染闸；输出 mkv 放临时目录，跑完删掉。
// 命令行是 anim bench（渲/命令.ts）。详细：Remotion 开 verbose，日志写到 `日志`，看它自己报的各步耗时。
// --关共享内存、--浏览器：拆 Remotion 版本差异用（共享内存截图 4.0.534 起有；换自带 Chromium 的版本），母版不用。
// 每轮都写渲染明细（运行记录/渲染明细.ts）；--不收日志 退回 logLevel error（量 verbose 的开销）；--留输出 <目录> 留下 mkv（比两版浏览器的像素）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { getCompositions, openBrowser, renderMedia, type LogLevel } from './渲染器.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 代码根 } from '../环境/路径.ts';
import { 选段 } from '../清单/清单.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import { 照段材质包 } from '../资产/资产锁.ts';
import { 明细收集 } from '../运行记录/渲染明细.ts';
import { 删打包 } from './打包残留.ts';
import { 打包 } from './渲.ts';
import { 渲染参数, 等帧超时毫秒 } from './设置.ts';
import { 段渲染环境, 段现在的地形 } from './地形注入.ts';
import { 收地形用量, 记已量帧, 等地形用量写完 } from './地形用量.ts';
import { 收求解缓存, 等求解缓存写完 } from './求解缓存收集.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';

export type 测速结果 = {
  remotion: string;
  浏览器: string;
  共享内存: boolean;
  日志级别: LogLevel;
  段: string;
  帧: [number, number];
  打包秒: number;
  开浏览器秒: number;
  读组合秒: number;
  求解缓存准备: { 新写: number; 秒: number };
  轮: { 共享内存: boolean; 总秒: number; 首帧秒: number; 出帧秒: number; 收尾秒: number; 每帧中位毫秒: number; 每帧P90毫秒: number; 每帧P99毫秒: number; 最慢帧: { 帧: number; 毫秒: number }[]; 最多的等待: { 标签: string; 总毫秒: number; 次: number }[]; 明细: string | null; 输出: string | null }[];
};

const 浏览器版本 = (可执行: string | undefined) => {
  if (!可执行) return '自带';
  try {
    return execFileSync(可执行, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return 可执行;
  }
};

export const 测速 = async (opts: { 段: string; 帧?: [number, number]; 级别?: 渲染级别; 次?: number; 详细?: boolean; 日志?: string; 关共享内存?: boolean; 浏览器?: string; 不收日志?: boolean; 留输出?: string }): Promise<测速结果> => {
  const 级别 = opts.级别 ?? '视频';
  const [s] = await 选段([opts.段]);
  if (!s) throw new Error(`没有段 ${opts.段}`);
  const 帧: [number, number] = opts.帧 ?? [0, Math.min(99, s.段.帧数 - 1)];
  const 参数 = 渲染参数(级别);
  // 打包、开浏览器这几步只有 --详细 才开 verbose；renderMedia 默认 verbose，日志进明细
  const 前期日志: LogLevel = opts.详细 ? 'verbose' : 'error';
  const 渲染日志: LogLevel = opts.不收日志 ? 'error' : 'verbose';
  const 日志流 = opts.详细 && opts.日志 ? fs.createWriteStream(opts.日志) : null;
  const 原log = console.log;
  if (日志流) console.log = (...a: unknown[]) => void 日志流.write(a.map(String).join(' ') + '\n');
  const remotion = (createRequire(path.join(代码根(), 'package.json'))('remotion/package.json') as { version: string }).version;
  try {
    let t = Date.now();
    const serveUrl = await 照段材质包(作品根(), s.键, () => 打包());
    const 打包秒 = (Date.now() - t) / 1000;
    t = Date.now();
    const browser = await openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel: 前期日志, browserExecutable: opts.浏览器 ?? null });
    const 开浏览器秒 = (Date.now() - t) / 1000;
    收地形用量(browser);
    const 求解缓存 = 收求解缓存(browser);
    try {
      const 读组合 = () => getCompositions(serveUrl, { inputProps: 参数.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: 参数.gl }, timeoutInMilliseconds: 等帧超时毫秒, logLevel: 前期日志 });
      t = Date.now();
      let 组合 = await 读组合();
      let 读组合秒 = (Date.now() - t) / 1000;
      await 等求解缓存写完();
      await 等地形用量写完();
      // 缓存键由页面里的求解决定，先读一次才能知道是否缺失；只有补写时才把这次冷启动归入准备、重新计时，热缓存不多开页面。
      const 求解缓存准备 = { 新写: 求解缓存.新写, 秒: 求解缓存.新写 ? (Date.now() - t) / 1000 : 0 };
      if (求解缓存准备.新写) {
        console.error(`求解缓存准备：新写 ${求解缓存准备.新写} 份，${求解缓存准备.秒.toFixed(3)} 秒，不计入测速阶段`);
        t = Date.now();
        组合 = await 读组合();
        读组合秒 = (Date.now() - t) / 1000;
        await 等求解缓存写完();
        await 等地形用量写完();
      }
      const composition = 组合.find((c) => c.id === s.键);
      if (!composition) throw new Error(`打包里没有 Composition ${s.键}`);
      const 轮: 测速结果['轮'] = [];
      for (let i = 0; i < (opts.次 ?? 1); i++) {
        if (opts.留输出) fs.mkdirSync(opts.留输出, { recursive: true });
        const out = path.join(opts.留输出 ?? os.tmpdir(), `mc-anim-测速-${process.pid}-${i}.mkv`);
        const 标签 = `bench:${作品名()}/${s.键}:${级别}`;
        const 排队起=Date.now();
        await 过渲染闸(async () => {
          const t0 = Date.now();
          const 等闸=记阶段(undefined,标签,'等闸',排队起,(t0-排队起)/1000);
          let 首帧 = 0, 末帧 = 0, 上次帧数 = 0;
          let 共享内存 = false;
          const 明细 = new 明细收集(标签, 帧[0]);
          const 跑 = () => renderMedia({
              serveUrl, composition, outputLocation: out, inputProps: 参数.inputProps, envVariables: 段渲染环境(s.键, 段现在的地形(s)), puppeteerInstance: browser, chromiumOptions: { gl: 参数.gl },
              codec: 参数.codec, audioCodec: 参数.audioCodec, enforceAudioTrack: 参数.enforceAudioTrack, crf: 参数.crf, x264Preset: 参数.x264Preset,
              imageFormat: 参数.imageFormat, jpegQuality: 参数.jpegQuality, scale: 参数.scale, concurrency: 参数.concurrency,
              timeoutInMilliseconds: 等帧超时毫秒, overwrite: true, logLevel: 渲染日志, frameRange: 帧,
              ...(opts.关共享内存 ? { disableSharedMemoryCapture: true } : {}),
              // Remotion 在 FFmpeg 探测和浏览器回退之后才确定输入格式；原样返回参数，只记录实际出帧路径，不靠平台或日志级别猜。
              ffmpegOverride: ({ type, args }) => {
                if (type === 'pre-stitcher') 共享内存 = args.some((arg, k) => arg === '-f' && args[k + 1] === 'remotionshm');
                return args;
              },
              onProgress: (p) => {
                if (p.renderedFrames === 上次帧数) return;
                const now = Date.now();
                if (!首帧) 首帧 = now;
                上次帧数 = p.renderedFrames;
                明细.帧完成(p.renderedFrames, now);
                if (p.renderedFrames === 帧[1] - 帧[0] + 1) 末帧 = now;
              },
            });
          try {
            if (opts.不收日志) await 跑();
            else await 明细.包(跑, 日志流 ? (文本) => void 日志流.write(文本 + '\n') : undefined);
          } finally {
            if (!opts.留输出) fs.rmSync(out, { force: true });
          }
          await 记已量帧(s.键, Array.from({ length: 帧[1] - 帧[0] + 1 }, (_, k) => 帧[0] + k));
          const end = Date.now();
          const { 文件, 明细: d } = await 明细.写出([等闸], { remotion, 浏览器: 浏览器版本(opts.浏览器), 日志级别: 渲染日志, 共享内存: String(共享内存), 第几轮: String(i + 1) });
          轮.push({
            共享内存,
            总秒: (end - t0) / 1000,
            首帧秒: (首帧 - t0) / 1000,
            出帧秒: (末帧 - 首帧) / 1000,
            收尾秒: (end - 末帧) / 1000,
            每帧中位毫秒: d.小结.中位毫秒,
            每帧P90毫秒: d.小结.P90毫秒,
            每帧P99毫秒: d.小结.P99毫秒,
            最慢帧: d.小结.最慢帧,
            最多的等待: d.等待.slice(0, 6).map((w) => ({ 标签: w.标签, 总毫秒: w.总毫秒, 次: w.次 })),
            明细: 文件,
            输出: opts.留输出 ? out : null,
          });
        }, (m) => console.error(`== 资源闸：${m}`),{}, {种:'bench',作品:作品名(),段:s.键,帧数:帧[1]-帧[0]+1,帧:`${帧[0]}-${帧[1]}`,级别,用途:process.env.ANIM_PURPOSE??'实验'});
      }
      return { remotion, 浏览器: 浏览器版本(opts.浏览器), 共享内存: 轮.every((r) => r.共享内存), 日志级别: 渲染日志, 段: `${作品名()}/${s.键}`, 帧, 打包秒, 开浏览器秒, 读组合秒, 求解缓存准备, 轮 };
    } finally {
      await 等求解缓存写完();
      await 等地形用量写完();
      await browser.close({ silent: true });
      删打包(serveUrl);
    }
  } finally {
    console.log = 原log;
    日志流?.end();
  }
};
