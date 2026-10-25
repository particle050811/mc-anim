// 渲母版：整个工程只打包一次、开一个浏览器，逐段 renderMedia（旧项目 批量渲染.mjs 的链路）。
// 指纹对得上的母版直接用；每段渲之前排队过渲染闸，渲完核帧数、改名、写 .指纹.json，耗时按段记进耗时表。
// 段.ts 声明的透明叠层（<段键>-<名>）同样按指纹缓存，渲成 ProRes 4444 放 cache/叠层/。
// 打包前把作品随仓库发的字节补进数据根（资产/随仓库.ts）、备好按 cue 现取的私有配乐（资产/私有配乐.ts，缺了换静音并记进运行记录）；
// 包里别的段 import、数据根又没有的字节（公开仓库）打进占位，渲到才报错（资产/缺字节.ts）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { getCompositions, openBrowser, renderMedia, renderStill, type HeadlessBrowser } from '@remotion/renderer';
import { 代码根 } from '../环境/路径.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { webpack改写 } from '../资产/webpack.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import { 叠层键, 算段指纹, type 段指纹 } from '../指纹/指纹.ts';
import { 叠层目录, 数据根 } from '../环境/配置.ts';
import { 全部段, type 段信息 } from '../清单/清单.ts';
import { 读作品资产锁 } from '../资产/资产锁.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 补缺字节占位 } from '../资产/缺字节.ts';
import { 备好私有配乐, 缺配乐提示 } from '../资产/私有配乐.ts';
import { 记耗时, 预计耗时, type 运行记录 } from '../运行记录/记录.ts';
import { 叠层路径, 母版路径, 写指纹 } from './母版.ts';
import { 备好public目录 } from './public目录.ts';
import { 收求解缓存, 等求解缓存写完 } from './求解缓存收集.ts';
import { 视频信息 } from './探测.ts';
import { 叠层渲染参数, 渲染参数, 等帧超时毫秒, type 渲染参数表 } from './设置.ts';
import type { 叠层定义 } from '../../engine/段/段定义.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';

export const 渲染标签 = (键: string, 级别: 渲染级别) => `render:${作品名()}/${键}:${级别}`;

export const 打包 = async (记录?: 运行记录) => {
  const 根 = 作品根();
  补字节并报(根, 数据根());
  for (const x of 备好私有配乐(await 全部段(), 读作品资产锁(根), 数据根())) {
    if (记录) 记录.记('警告', 缺配乐提示(x));
    else console.error(`!! ${缺配乐提示(x)}`);
  }
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(作品根(), 'index.ts'),
    rootDir: 代码根(),
    webpackOverride: 补缺字节占位(webpack改写(根), 根),
    enableCaching: true,
    publicDir: 备好public目录(),
    // public 里只有指向数据根的链接，转发进包是预期的
    onSymlinkDetected: () => {},
  });
  console.log(`打包 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  return serveUrl;
};

type 会话 = { serveUrl: string; browser: HeadlessBrowser; 参数: 渲染参数表; 组合: Awaited<ReturnType<typeof getCompositions>> };

/** 打包、开浏览器、读 Composition 列表；fn 结束后关浏览器。渲染和编码降低优先级（nice 10），浏览器子进程跟着继承 */
export const 开会话 = async <T>(级别: 渲染级别, fn: (h: 会话) => Promise<T>, 记录?: 运行记录): Promise<T> => {
  try {
    os.setPriority(10);
  } catch {
    // 没权限改优先级就照常跑
  }
  const 参数 = 渲染参数(级别);
  const serveUrl = await 打包(记录);
  const browser = await openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel: 'error' });
  // 读 Composition 列表的页面先把模块初始化里没命中缓存的求解算一遍，关页面时收走写盘，后面各段的页面直接读
  收求解缓存(browser);
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

const 找组合 = (h: 会话, s: 段信息, id = s.键) => {
  const c = h.组合.find((x) => x.id === id);
  if (!c) throw new Error(`打包里没有 Composition ${id}（作品的 注册.tsx 按清单和 段.ts 的叠层登记，清单里有它吗？）`);
  if (c.durationInFrames !== s.段.帧数 || c.fps !== s.段.fps || c.width !== s.段.宽 || c.height !== s.段.高) {
    throw new Error(`${id} 的 Composition（${c.durationInFrames} 帧 ${c.fps}fps ${c.width}×${c.height}）和 段.ts 对不上`);
  }
  return c;
};

export type 母版结果 = { 段: 段信息; 指纹: 段指纹; 母版: string; 新渲: boolean };

export const 渲染母版 = async (段们: 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 记录: 运行记录 }): Promise<母版结果[]> => {
  // 先补字节再算指纹：空数据根时指纹的「缺字节」项要按补完的算，不然母版落在错的指纹下、film 认不出
  补字节并报(作品根(), 数据根());
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
      await 等求解缓存写完();
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
          记耗时(渲染标签(r.段.键, 级别), t0, 秒, code, `anim render ${r.段.键}`);
          if (code === 0) console.log(`   ${r.段.键}：${秒.toFixed(0)} 秒 → ${r.母版}`);
        }
      });
      opts.记录.产物.push(r.母版);
    }
  }, opts.记录);
  return 结果;
};

export const 叠层渲染标签 = (键: string, 级别: 渲染级别) => `render-layer:${作品名()}/${键}:${级别}`;
export type 叠层结果 = { 段: 段信息; 叠层: 叠层定义; 键: string; 指纹: 段指纹; 文件: string; 新渲: boolean };

/** 渲这些段声明的透明叠层；指纹对得上就跳过 */
export const 渲染叠层 = async (段们: 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 记录: 运行记录 }): Promise<叠层结果[]> => {
  补字节并报(作品根(), 数据根());
  const 参数 = 叠层渲染参数(级别);
  const 结果: 叠层结果[] = [];
  for (const s of 段们) {
    for (const l of s.段.叠层 ?? []) {
      const fp = await 算段指纹(s, 参数, l);
      结果.push({ 段: s, 叠层: l, 键: 叠层键(s.键, l), 指纹: fp, 文件: 叠层路径(叠层键(s.键, l), fp.指纹), 新渲: false });
    }
  }
  const 待渲 = 结果.filter((r) => {
    const 有 = fs.existsSync(r.文件) && !opts.重渲;
    if (有) console.log(`✓ ${r.键}：叠层已是最新（${r.指纹.指纹.slice(0, 16)}）`);
    return !有;
  });
  if (!待渲.length) return 结果;
  console.log(`== 要渲 ${待渲.length} 个叠层：${待渲.map((r) => r.键).join('、')}`);
  await 开会话(级别, async (h) => {
    for (const r of 待渲) {
      const composition = 找组合(h, r.段, r.键);
      await 等求解缓存写完();
      await 过渲染闸(async () => {
        const t0 = Date.now();
        const tmp = r.文件.replace(/\.mov$/, `.渲染中-${process.pid}.mov`);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        console.log(`== 渲叠层 ${r.键}`);
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
            proResProfile: 参数.proResProfile,
            pixelFormat: 参数.pixelFormat,
            imageFormat: 参数.imageFormat,
            scale: 参数.scale,
            concurrency: 参数.concurrency,
            muted: 参数.muted,
            timeoutInMilliseconds: 等帧超时毫秒,
            overwrite: true,
            logLevel: 'error',
          });
          const 帧 = 视频信息(tmp).帧数;
          if (帧 !== r.段.段.帧数) throw new Error(`${r.键} 渲出来 ${帧} 帧，段.ts 写的是 ${r.段.段.帧数} 帧`);
          fs.renameSync(tmp, r.文件);
          写指纹(r.指纹, 叠层目录(r.键));
          r.新渲 = true;
          code = 0;
        } finally {
          fs.rmSync(tmp, { force: true });
          const 秒 = (Date.now() - t0) / 1000;
          记耗时(叠层渲染标签(r.键, 级别), t0, 秒, code, `anim render ${r.段.键}`);
          if (code === 0) console.log(`   ${r.键}：${秒.toFixed(0)} 秒 → ${r.文件}`);
        }
      });
      opts.记录.产物.push(r.文件);
    }
  }, opts.记录);
  return 结果;
};

/** 单帧静帧（PNG），给预览核对用 */
export const 渲静帧 = async (s: 段信息, 帧们: number[], 级别: 渲染级别, 出到: string, 记录?: 运行记录) => {
  const 出: string[] = [];
  await 开会话(级别, async (h) => {
    const composition = 找组合(h, s);
    for (const f of 帧们) {
      if (!(f >= 0 && f < composition.durationInFrames)) throw new Error(`${s.键} 只有 ${composition.durationInFrames} 帧，没有第 ${f} 帧`);
    }
    await 等求解缓存写完();
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
  }, 记录);
  return 出;
};
