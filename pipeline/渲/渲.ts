// 渲母版：整个工程只打包一次、开一个浏览器，逐段 renderMedia（旧项目 批量渲染.mjs 的链路）。
// 指纹对得上的母版直接用；每段渲之前排队过渲染闸，渲完核帧数、改名、写 .指纹.json，耗时按段记进耗时表。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { getCompositions, openBrowser, renderMedia, renderStill, type HeadlessBrowser } from '@remotion/renderer';
import { 代码根 } from '../环境/路径.ts';
import { webpack改写 } from '../资产/webpack.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import { 算段指纹, type 段指纹 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 记耗时, 预计耗时, type 运行记录 } from '../运行记录/记录.ts';
import { 母版路径, 写指纹 } from './母版.ts';
import { 视频信息 } from './探测.ts';
import { 渲染参数, 等帧超时毫秒, type 渲染参数表 } from './设置.ts';
import type { 渲染级别 } from '../../content/设置值.ts';

export const 渲染标签 = (键: string, 级别: 渲染级别) => `render:${键}:${级别}`;

export const 打包 = async () => {
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(代码根(), 'content', 'index.ts'),
    rootDir: 代码根(),
    webpackOverride: webpack改写,
    enableCaching: true,
  });
  console.log(`打包 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  return serveUrl;
};

type 会话 = { serveUrl: string; browser: HeadlessBrowser; 参数: 渲染参数表; 组合: Awaited<ReturnType<typeof getCompositions>> };

/** 打包、开浏览器、读 Composition 列表；fn 结束后关浏览器。渲染和编码降低优先级（nice 10），浏览器子进程跟着继承 */
export const 开会话 = async <T>(级别: 渲染级别, fn: (h: 会话) => Promise<T>): Promise<T> => {
  try {
    os.setPriority(10);
  } catch {
    // 没权限改优先级就照常跑
  }
  const 参数 = 渲染参数(级别);
  const serveUrl = await 打包();
  const browser = await openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel: 'error' });
  try {
    const 组合 = await getCompositions(serveUrl, {
      inputProps: 参数.inputProps,
      puppeteerInstance: browser,
      chromiumOptions: { gl: 参数.gl },
      timeoutInMilliseconds: 等帧超时毫秒,
      logLevel: 'error',
    });
    return await fn({ serveUrl, browser, 参数, 组合 });
  } finally {
    await browser.close({ silent: true });
  }
};

const 找组合 = (h: 会话, s: 段信息) => {
  const c = h.组合.find((x) => x.id === s.键);
  if (!c) throw new Error(`打包里没有 Composition ${s.键}（content/注册.tsx 按清单登记，清单里有它吗？）`);
  if (c.durationInFrames !== s.段.帧数 || c.fps !== s.段.fps || c.width !== s.段.宽 || c.height !== s.段.高) {
    throw new Error(`${s.键} 的 Composition（${c.durationInFrames} 帧 ${c.fps}fps ${c.width}×${c.height}）和 段.ts 对不上`);
  }
  return c;
};

export type 母版结果 = { 段: 段信息; 指纹: 段指纹; 母版: string; 新渲: boolean };

export const 渲染母版 = async (段们: 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 记录: 运行记录 }): Promise<母版结果[]> => {
  const 参数 = 渲染参数(级别);
  const 结果: 母版结果[] = [];
  const 待渲: 母版结果[] = [];
  for (const s of 段们) {
    const fp = await 算段指纹(s, 参数);
    const 母版 = 母版路径(s.键, fp.指纹);
    const r = { 段: s, 指纹: fp, 母版, 新渲: false };
    结果.push(r);
    if (fs.existsSync(母版) && !opts.重渲) console.log(`✓ ${s.键}：母版已是最新（${fp.指纹.slice(0, 16)}）`);
    else 待渲.push(r);
  }
  if (!待渲.length) return 结果;
  const 估 = 待渲.map((r) => 预计耗时(渲染标签(r.段.键, 级别)));
  const 已知 = 估.filter((x): x is number => x !== null);
  console.log(
    `== 要渲 ${待渲.length} 段：${待渲.map((r) => r.段.键).join('、')}` +
      (已知.length ? `；按耗时表预计约 ${Math.round(已知.reduce((a, b) => a + b, 0))} 秒${已知.length < 待渲.length ? `（另 ${待渲.length - 已知.length} 段没有记录）` : ''}` : '；耗时表里还没有这些段的记录'),
  );
  await 开会话(级别, async (h) => {
    for (const r of 待渲) {
      const composition = 找组合(h, r.段);
      await 过渲染闸(async () => {
        const t0 = Date.now();
        const tmp = r.母版.replace(/\.mkv$/, `.渲染中-${process.pid}.mkv`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        console.log(`== 渲 ${r.段.键}`);
        let code = 1;
        try {
          await renderMedia({
            serveUrl: h.serveUrl,
            composition,
            outputLocation: tmp,
            inputProps: 参数.inputProps,
            puppeteerInstance: h.browser,
            chromiumOptions: { gl: 参数.gl },
            codec: 参数.codec,
            audioCodec: 参数.audioCodec,
            enforceAudioTrack: 参数.enforceAudioTrack,
            crf: 参数.crf,
            x264Preset: 参数.x264Preset,
            imageFormat: 参数.imageFormat,
            jpegQuality: 参数.jpegQuality,
            scale: 参数.scale,
            concurrency: 参数.concurrency,
            timeoutInMilliseconds: 等帧超时毫秒,
            overwrite: true,
            logLevel: 'error',
          });
          const 帧 = 视频信息(tmp).帧数;
          if (帧 !== r.段.段.帧数) throw new Error(`${r.段.键} 渲出来 ${帧} 帧，段.ts 写的是 ${r.段.段.帧数} 帧`);
          fs.renameSync(tmp, r.母版);
          写指纹(r.指纹);
          r.新渲 = true;
          code = 0;
        } finally {
          fs.rmSync(tmp, { force: true });
          const 秒 = (Date.now() - t0) / 1000;
          记耗时(渲染标签(r.段.键, 级别), t0, 秒, code, `sr render ${r.段.键}`);
          if (code === 0) console.log(`   ${r.段.键}：${秒.toFixed(0)} 秒 → ${r.母版}`);
        }
      });
      opts.记录.产物.push(r.母版);
    }
  });
  return 结果;
};

/** 单帧静帧（PNG），给预览核对用 */
export const 渲静帧 = async (s: 段信息, 帧们: number[], 级别: 渲染级别, 出到: string) => {
  const 出: string[] = [];
  await 开会话(级别, async (h) => {
    const composition = 找组合(h, s);
    for (const f of 帧们) {
      if (!(f >= 0 && f < composition.durationInFrames)) throw new Error(`${s.键} 只有 ${composition.durationInFrames} 帧，没有第 ${f} 帧`);
    }
    await 过渲染闸(async () => {
      for (const f of 帧们) {
        const file = path.join(出到, `${s.键}-第${String(f).padStart(4, '0')}帧.png`);
        await renderStill({
          serveUrl: h.serveUrl,
          composition,
          output: file,
          frame: f,
          inputProps: h.参数.inputProps,
          puppeteerInstance: h.browser,
          chromiumOptions: { gl: h.参数.gl },
          imageFormat: 'png',
          scale: h.参数.scale,
          timeoutInMilliseconds: 等帧超时毫秒,
          overwrite: false,
          logLevel: 'error',
        });
        出.push(file);
      }
    });
  });
  return 出;
};
