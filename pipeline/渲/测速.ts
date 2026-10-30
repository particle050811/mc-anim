// 测速：同一段取一段帧，照母版的渲染参数渲一遍，按阶段计时（打包 / 开浏览器 / 读 Composition / 首帧 / 出帧 / 编码收尾），不写缓存、不按段记耗时（不影响 render 报的预计耗时）。
// 用途：比 Remotion 版本、比引擎改动前后（docs/渲染性能.md）。走渲染闸；输出 mkv 放临时目录，跑完删掉。
// 命令行是 anim bench（渲/命令.ts）。详细：Remotion 开 verbose，日志写到 `日志`，看它自己报的各步耗时。
// --关共享内存、--浏览器：拆 Remotion 版本差异用（共享内存截图 4.0.534 起有；换自带 Chromium 的版本），母版不用。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getCompositions, openBrowser, renderMedia, type LogLevel } from '@remotion/renderer';
import { 作品名 } from '../环境/作品.ts';
import { 代码根 } from '../环境/路径.ts';
import { 选段 } from '../清单/清单.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import { 打包 } from './渲.ts';
import { 渲染参数, 等帧超时毫秒 } from './设置.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';

export type 测速结果 = {
  remotion: string;
  浏览器: string;
  共享内存: boolean;
  段: string;
  帧: [number, number];
  打包秒: number;
  开浏览器秒: number;
  读组合秒: number;
  轮: { 总秒: number; 首帧秒: number; 出帧秒: number; 收尾秒: number; 每帧中位毫秒: number; 每帧P90毫秒: number; 最慢帧: { 帧: number; 毫秒: number }[] }[];
};

const 分位 = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};

export const 测速 = async (opts: { 段: string; 帧?: [number, number]; 级别?: 渲染级别; 次?: number; 详细?: boolean; 日志?: string; 关共享内存?: boolean; 浏览器?: string }): Promise<测速结果> => {
  const 级别 = opts.级别 ?? '视频';
  const [s] = await 选段([opts.段]);
  if (!s) throw new Error(`没有段 ${opts.段}`);
  const 帧: [number, number] = opts.帧 ?? [0, Math.min(99, s.段.帧数 - 1)];
  const 参数 = 渲染参数(级别);
  const logLevel: LogLevel = opts.详细 ? 'verbose' : 'error';
  const 日志流 = opts.详细 && opts.日志 ? fs.createWriteStream(opts.日志) : null;
  // verbose 日志很多：写文件，不刷屏
  const 原log = console.log;
  if (日志流) console.log = (...a: unknown[]) => void 日志流.write(a.map(String).join(' ') + '\n');
  const remotion = (createRequire(path.join(代码根(), 'package.json'))('remotion/package.json') as { version: string }).version;
  try {
    let t = Date.now();
    const serveUrl = await 打包();
    const 打包秒 = (Date.now() - t) / 1000;
    t = Date.now();
    const browser = await openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel, browserExecutable: opts.浏览器 ?? null });
    const 开浏览器秒 = (Date.now() - t) / 1000;
    try {
      t = Date.now();
      const 组合 = await getCompositions(serveUrl, { inputProps: 参数.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: 参数.gl }, timeoutInMilliseconds: 等帧超时毫秒, logLevel });
      const 读组合秒 = (Date.now() - t) / 1000;
      const composition = 组合.find((c) => c.id === s.键);
      if (!composition) throw new Error(`打包里没有 Composition ${s.键}`);
      const 轮: 测速结果['轮'] = [];
      for (let i = 0; i < (opts.次 ?? 1); i++) {
        const out = path.join(os.tmpdir(), `mc-anim-测速-${process.pid}-${i}.mkv`);
        await 过渲染闸(async () => {
          const t0 = Date.now();
          let 首帧 = 0, 末帧 = 0, 上次 = 0, 上次帧数 = 0;
          const 每帧: { 帧: number; 毫秒: number }[] = [];
          try {
            await renderMedia({
              serveUrl, composition, outputLocation: out, inputProps: 参数.inputProps, puppeteerInstance: browser, chromiumOptions: { gl: 参数.gl },
              codec: 参数.codec, audioCodec: 参数.audioCodec, enforceAudioTrack: 参数.enforceAudioTrack, crf: 参数.crf, x264Preset: 参数.x264Preset,
              imageFormat: 参数.imageFormat, jpegQuality: 参数.jpegQuality, scale: 参数.scale, concurrency: 参数.concurrency,
              timeoutInMilliseconds: 等帧超时毫秒, overwrite: true, logLevel, frameRange: 帧,
              ...(opts.关共享内存 ? { disableSharedMemoryCapture: true } : {}),
              onProgress: (p) => {
                if (p.renderedFrames === 上次帧数) return;
                const now = Date.now();
                if (!首帧) 首帧 = now;
                // 并发 1：两次进度之间多出来的帧平摊这段时间（进度回调有节流，一次可能多帧）
                else for (let k = 上次帧数; k < p.renderedFrames; k++) 每帧.push({ 帧: 帧[0] + k, 毫秒: (now - 上次) / (p.renderedFrames - 上次帧数) });
                上次 = now;
                上次帧数 = p.renderedFrames;
                if (p.renderedFrames === 帧[1] - 帧[0] + 1) 末帧 = now;
              },
            });
          } finally {
            fs.rmSync(out, { force: true });
          }
          const end = Date.now();
          const ms = 每帧.map((x) => x.毫秒);
          轮.push({
            总秒: (end - t0) / 1000,
            首帧秒: (首帧 - t0) / 1000,
            出帧秒: (末帧 - 首帧) / 1000,
            收尾秒: (end - 末帧) / 1000,
            每帧中位毫秒: Math.round(分位(ms, 0.5)),
            每帧P90毫秒: Math.round(分位(ms, 0.9)),
            最慢帧: [...每帧].sort((a, b) => b.毫秒 - a.毫秒).slice(0, 5).map((x) => ({ 帧: x.帧, 毫秒: Math.round(x.毫秒) })),
          });
        }, (m) => console.error(`== 资源闸：${m}`));
      }
      return { remotion, 浏览器: opts.浏览器 ?? '自带', 共享内存: !opts.关共享内存, 段: `${作品名()}/${s.键}`, 帧, 打包秒, 开浏览器秒, 读组合秒, 轮 };
    } finally {
      await browser.close({ silent: true });
    }
  } finally {
    console.log = 原log;
    日志流?.end();
  }
};
