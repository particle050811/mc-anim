// 渲染会话和静帧：整个工程只打包一次、开一个浏览器（开会话），段（渲段.ts）、静帧、bench、逐帧校验、认指纹都在会话里出帧。
// 分阶段计时和每帧明细见 运行记录/阶段.ts、渲染明细.ts（anim 耗时 看）。
// 打包前把作品随仓库发的字节补进数据根（资产/随仓库.ts）、备好按 cue 现取的私有配乐（资产/私有配乐.ts，缺了换静音并记进运行记录）；
// 包里别的段 import、数据根又没有的字节（公开仓库）打进占位，渲到才报错（资产/缺字节.ts）；webpack 缓存名不随资产锁变（资产/缓存名.ts）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { 备浏览器 } from './浏览器.ts';
import { getCompositions, openBrowser, renderFrames, renderStill, type HeadlessBrowser } from './渲染器.ts';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { webpack改写 } from '../资产/webpack.ts';
import { 光影环境名, 套光影试看, type 光影配置 } from './光影试看.ts';
import { 稳定缓存名 } from '../资产/缓存名.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import { 数据根 } from '../环境/配置.ts';
import { 全部段, type 段信息 } from '../清单/清单.ts';
import { 核对段材质包, 照段材质包, 读作品资产锁 } from '../资产/资产锁.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 补缺字节占位 } from '../资产/缺字节.ts';
import { 备好私有配乐, 缺配乐提示 } from '../资产/私有配乐.ts';
import { 缺的注册目录, 缺目录提示 } from '../段框架/注册目录.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 出帧编码计时, 记阶段, 量阶段, 阶段小结, type 阶段记录 } from '../运行记录/阶段.ts';
import { 明细收集 } from '../运行记录/渲染明细.ts';
import { 备好public目录 } from './public目录.ts';
import { 删打包, 登记打包 } from './打包残留.ts';
import { 收求解缓存, 等求解缓存写完 } from './求解缓存收集.ts';
import { 段渲染环境, 段现在的地形 } from './地形注入.ts';
import { 收地形用量, 记已量帧, 等地形用量写完 } from './地形用量.ts';
import { 段画面参数们, 段输出窗于 } from './段产物.ts';
import { 成片档, 渲染参数, 等帧超时毫秒, type 渲染参数表 } from './设置.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';

export const 渲染标签 = (键: string, 级别: 渲染级别) => `render:${作品名()}/${键}:${级别}`;

/** 光影：换上光影试看画布（光影试看.ts，只给 still、bench） */
export const 打包 = async (记录?: 运行记录, 标签 = `会话:${作品名()}`, o: { 光影?: boolean } = {}) => {
  const 根 = 作品根();
  const 缺目录 = 缺的注册目录(根);
  if (缺目录.length) throw new Error(缺目录.map((d) => 缺目录提示(相对代码根(根), d)).join('\n'));
  const t备 = Date.now();
  补字节并报(根, 数据根());
  for (const x of 备好私有配乐(await 全部段(), 读作品资产锁(根), 数据根())) {
    if (记录) 记录.记('警告', 缺配乐提示(x));
    else console.error(`!! ${缺配乐提示(x)}`);
  }
  记阶段(记录?.阶段, 标签, '备素材', t备, (Date.now() - t备) / 1000);
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(作品根(), 'index.ts'),
    rootDir: 代码根(),
    webpackOverride: 稳定缓存名(补缺字节占位(o.光影 ? 套光影试看(webpack改写(根)) : webpack改写(根), 根)),
    enableCaching: true,
    publicDir: 备好public目录(),
    // public 里只有指向数据根的链接，转发进包是预期的
    onSymlinkDetected: () => {},
  });
  登记打包(serveUrl);
  记阶段(记录?.阶段, 标签, 'webpack', t0, (Date.now() - t0) / 1000);
  console.log(`打包 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  return serveUrl;
};

type 会话 = { serveUrl: string; browser: HeadlessBrowser; 参数: 渲染参数表; 组合: Awaited<ReturnType<typeof getCompositions>> };

/** 打包、开浏览器、读 Composition 列表；fn 结束后关浏览器。渲染和编码降低优先级（nice 10），浏览器子进程跟着继承 */
export const 开会话 = async <T>(级别: 渲染级别, fn: (h: 会话) => Promise<T>, 记录?: 运行记录, 打包选项: { 光影?: boolean } = {}): Promise<T> => {
  try {
    os.setPriority(10);
  } catch {
    // 没权限改优先级就照常跑
  }
  const 参数 = 渲染参数(级别);
  const 标签 = `会话:${作品名()}:${级别}`;
  const 收 = 记录?.阶段;
  const 起 = 收?.length ?? 0;
  const serveUrl = await 量阶段(收, 标签, '打包', () => 打包(记录, 标签, 打包选项));
  let browser: HeadlessBrowser | undefined;
  try {
    browser = await 量阶段(收, 标签, '开浏览器', async () => openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel: 'error', browserExecutable: await 备浏览器() }));
    // 读 Composition 列表的页面先把模块初始化里没命中缓存的求解算一遍，关页面时收走写盘，后面各段的页面直接读
    收求解缓存(browser);
    收地形用量(browser);
    const 组合 = await 量阶段(收, 标签, '读组合', () =>
      getCompositions(serveUrl, {
        inputProps: 参数.inputProps,
        puppeteerInstance: browser,
        chromiumOptions: { gl: 参数.gl },
        timeoutInMilliseconds: 等帧超时毫秒,
        logLevel: 'error',
      }),
    );
    if (收) console.log(`会话就绪：${阶段小结(收.slice(起))}`);
    return await fn({ serveUrl, browser, 参数, 组合 });
  } finally {
    try {
      await 等地形用量写完();
      await browser?.close({ silent: true });
    } finally {
      删打包(serveUrl);
    }
  }
};

/** 渲一次的共用部分：Remotion 开 verbose（日志级别不进指纹），日志和进度进明细，出帧、编码分开计时 */
export const 量渲染 = async (标签: string, 收: 阶段记录[], t0: number, fn: (钩子: { logLevel: 'verbose'; onProgress: (p: { renderedFrames: number; renderedDoneIn: number | null }) => void }) => Promise<unknown>) => {
  const 计 = 出帧编码计时();
  const 明细 = new 明细收集(标签);
  await 明细.包(() =>
    fn({
      logLevel: 'verbose',
      onProgress: (p) => {
        计.onProgress(p);
        明细.帧完成(p.renderedFrames);
      },
    }),
  );
  记出帧编码(收, 标签, t0, 计);
  return 明细;
};

const 记出帧编码 = (收: 阶段记录[], 标签: string, t0: number, 计: ReturnType<typeof 出帧编码计时>) => {
  const { 出帧秒, 编码秒 } = 计.拆(Date.now() - t0);
  记阶段(收, 标签, '出帧', t0, 出帧秒);
  记阶段(收, 标签, '编码', t0 + 出帧秒 * 1000, 编码秒);
};

/**
 * 打包里这段的 Composition，核对和切片的输出窗一样：打包按成片档的输出帧率注册（engine/段/注册工厂.tsx），段在输出帧上的窗按全片位置算，
 * 这里用同一个算法（段产物.ts 的 段输出窗于）算应有的帧数，差一帧也不认。全部 = 整部作品的段（算全片位置）
 */
export const 找组合 = (h: Pick<会话, '组合'>, s: 段信息, 全部: readonly 段信息[], id = s.键) => {
  核对段材质包(作品根(), s.键);
  const c = h.组合.find((x) => x.id === id);
  if (!c) throw new Error(`打包里没有 Composition ${id}（作品的 注册.tsx 按清单和 段.ts 的叠层登记，清单里有它吗？）`);
  const 窗 = 段输出窗于(全部, s);
  if (c.fps !== 成片档().fps || c.durationInFrames !== 窗.帧数 || c.width !== s.段.宽 || c.height !== s.段.高) {
    throw new Error(`${id} 的 Composition（${c.durationInFrames} 帧 ${c.fps}fps ${c.width}×${c.height}）和 段.ts、全片位置对不上（应是 ${窗.帧数} 帧 ${成片档().fps}fps ${s.段.宽}×${s.段.高}）`);
  }
  return c;
};

/** 段目录下的 本机地形.txt 写着这段要的、没登记发布的区段包（核对-世界编辑）。换台机器没有这个包就跳过：不让一条批量渲染死在核对段上（用户 10-31 定）。放段外的文件不进指纹 */
export const 缺的本机地形 = (s: Pick<段信息, '目录'>, 地形根 = path.join(数据根(), 'terrain')): string | null => {
  const f = path.join(s.目录, '本机地形.txt');
  if (!fs.existsSync(f)) return null;
  const 包 = fs.readFileSync(f, 'utf8').trim();
  return fs.existsSync(path.join(地形根, 包)) ? null : 包;
};

/**
 * 同一页面、并发 1 按帧号升序出 PNG（Remotion 自己排序，帧号不能重复）；不写母版、不编码。
 * 打开声音：renderStill 是关的、renderMedia 是开的。静帧照 renderStill（声音文件也不用下），逐帧校验照 renderMedia
 */
export const 同页出帧 = (
  h: Pick<会话, 'serveUrl' | 'browser' | '参数'>,
  composition: 会话['组合'][number],
  帧们: readonly number[],
  o: { 打开声音: boolean; 环境: Record<string, string>; 每帧: (png: Buffer, 帧: number) => void | Promise<void> },
) =>
  renderFrames({
    serveUrl: h.serveUrl,
    composition,
    outputDir: null,
    frames: [...帧们],
    inputProps: h.参数.inputProps,
    envVariables: o.环境,
    puppeteerInstance: h.browser,
    chromiumOptions: { gl: h.参数.gl },
    imageFormat: 'png',
    scale: h.参数.scale,
    concurrency: 1,
    muted: !o.打开声音,
    timeoutInMilliseconds: 等帧超时毫秒,
    logLevel: 'verbose',
    onStart: () => {},
    onFrameUpdate: () => {},
    onFrameBuffer: o.每帧,
  });

export const 静帧文件 = (出到: string, 段键: string, 帧: number, 后缀 = '') => path.join(出到, `${段键}-第${String(帧).padStart(4, '0')}帧${后缀}.png`);

/**
 * 多帧默认同页连出（第一帧之后不用从头读地形）；逐帧 = 每帧一个新页面，等于旧做法。两边文件名一样，已有的文件都不覆盖。
 * 用户 10-31 定做连出。同一帧单出和连出已知的例外见 连出提醒（docs/渲染性能.md「同一帧的像素取决于之前渲过哪些帧」）。
 */
export const 出静帧们 = async (h: Pick<会话, 'serveUrl' | 'browser' | '参数'>, composition: 会话['组合'][number], 段键: string, 帧们: readonly number[], 出到: string, o: { 逐帧?: boolean; 环境: Record<string, string>; 完成: (已出: number) => void; 后缀?: string }) => {
  if (帧们.length > 1 && !o.逐帧) {
    let 已出 = 0;
    await 同页出帧(h, composition, 帧们, {
      打开声音: false,
      环境: o.环境,
      每帧: (png, f) => {
        fs.writeFileSync(静帧文件(出到, 段键, f, o.后缀), png, { flag: 'wx' });
        o.完成(++已出);
      },
    });
    return;
  }
  for (const [i, f] of 帧们.entries()) {
    await renderStill({
      serveUrl: h.serveUrl,
      composition,
      output: 静帧文件(出到, 段键, f, o.后缀),
      frame: f,
      inputProps: h.参数.inputProps,
      envVariables: o.环境,
      puppeteerInstance: h.browser,
      chromiumOptions: { gl: h.参数.gl },
      imageFormat: 'png',
      scale: h.参数.scale,
      timeoutInMilliseconds: 等帧超时毫秒,
      overwrite: false,
      logLevel: 'verbose',
    });
    o.完成(i + 1);
  }
};

/** 连出才有的提醒 */
export const 连出提醒 = (段键: string, 帧们: readonly number[], 逐帧?: boolean) =>
  帧们.length > 1 && !逐帧
    ? `${段键} 这 ${帧们.length} 帧在同一页面连出，和单帧的差别已修到极少（已知例外：核对-门口哈气，没进成片）。要和单帧或母版逐像素比，加 --逐帧；连出崩页（Page crashed）也改用 --逐帧`
    : null;

/** 静帧（PNG），给预览核对用。帧号重复的只出一次；返回的文件按给的帧号顺序 */
/** 光影：每份配置各出一遍这几帧，文件名带「-光影-<名>」（光影试看.ts） */
export const 渲静帧 = async (s: 段信息, 帧们: number[], 级别: 渲染级别, 出到: string, 记录?: 运行记录, o: { 逐帧?: boolean; 光影?: 光影配置[] } = {}) => {
  const 要出 = [...new Set(帧们)];
  const 提醒 = 连出提醒(s.键, 要出, o.逐帧);
  if (提醒) 记录?.记('警告', 提醒);
  await 照段材质包(作品根(), s.键, () => 开会话(级别, async (h) => {
    const 全部 = await 全部段();
    const composition = 找组合(h, s, 全部);
    for (const f of 要出) {
      if (!(f >= 0 && f < composition.durationInFrames)) throw new Error(`${s.键} 只有 ${composition.durationInFrames} 帧，没有第 ${f} 帧`);
    }
    // 段里画的字幕（母版 = 成片切片，用户 11-05 定）静帧也画上，和成片这一帧一样
    const 带字幕 = { ...h, 参数: 段画面参数们(全部, [s], 级别)[0]! };
    await 等求解缓存写完();
    const 标签 = `still:${作品名()}/${s.键}:${级别}`;
    const 排队起 = Date.now();
    await 过渲染闸(async () => {
      const t0 = Date.now();
      const 收 = 记录?.阶段;
      const 等闸 = 记阶段(收, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
      const 明细 = new 明细收集(标签);
      const 环境 = 段渲染环境(s.键, 段现在的地形(s));
      if (!o.光影) await 明细.包(() => 出静帧们(带字幕, composition, s.键, 要出, 出到, { 逐帧: o.逐帧, 环境, 完成: (已出) => 明细.帧完成(已出) }));
      else {
        const 们 = o.光影;
        await 明细.包(async () => {
          for (const [i, c] of 们.entries())
            await 出静帧们(带字幕, composition, s.键, 要出, 出到, { 逐帧: o.逐帧, 环境: { ...环境, [光影环境名]: c.值 }, 后缀: `-光影-${c.名}`, 完成: (已出) => 明细.帧完成(i * 要出.length + 已出) });
        });
      }
      await 记已量帧(s.键, 要出);
      const 出帧 = 记阶段(收, 标签, '出帧', t0, (Date.now() - t0) / 1000);
      await 明细.写出(收 ?? []);
      console.log(`${阶段小结([等闸, 出帧])}（${要出.length} 帧）`);
    }, undefined, {}, {种:'still',作品:作品名(),段:s.键,级别,帧数:要出.length,帧:要出.join(',').slice(0,60),用途:process.env.ANIM_PURPOSE??'核对'});
  }, 记录, { 光影: !!o.光影 }));
  return o.光影 ? o.光影.flatMap((c) => 要出.map((f) => 静帧文件(出到, s.键, f, `-光影-${c.名}`))) : 要出.map((f) => 静帧文件(出到, s.键, f));
};
