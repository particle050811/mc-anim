// 渲母版：整个工程只打包一次、开一个浏览器，逐段 renderMedia（旧项目 批量渲染.mjs 的链路）。
// 指纹对得上的母版直接用；每段渲之前排队过渲染闸，渲完核帧数、改名、写 .指纹.json，耗时按段记进耗时表，就放开渲染闸让下一段出帧。这段的后处理在后台做（后台转存.ts、后处理.ts）：
// 从 CRF1 派生段签（pipeline/段签/，不计进耗时表）、转存压缩母版（用户 10-30 定，转码.ts）、删掉 CRF1，最后删同段同级别的旧母版（缓存/钉.ts，叠层同样；只有主检出删，worktree 只新增）。渲染母版 等后台都做完才返回；ANIM_INLINE_TRANSCODE=1 和 --留CRF1 留在闸里当场做。
// 段.ts 声明的透明叠层（<段键>-<名>）同样按指纹缓存，渲成 ProRes 4444 放 cache/叠层/。
// 分阶段计时和每帧明细见 运行记录/阶段.ts、渲染明细.ts（anim 耗时 看）。
// 打包前把作品随仓库发的字节补进数据根（资产/随仓库.ts）、备好按 cue 现取的私有配乐（资产/私有配乐.ts，缺了换静音并记进运行记录）；
// 包里别的段 import、数据根又没有的字节（公开仓库）打进占位，渲到才报错（资产/缺字节.ts）；webpack 缓存名不随资产锁变（资产/缓存名.ts）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { getCompositions, openBrowser, renderFrames, renderMedia, renderStill, type HeadlessBrowser } from './渲染器.ts';
import { 代码根, 相对代码根 } from '../环境/路径.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { webpack改写 } from '../资产/webpack.ts';
import { 光影环境名, 套光影试看, type 光影配置 } from './光影试看.ts';
import { 稳定缓存名 } from '../资产/缓存名.ts';
import { 过渲染闸, 登记临时文件 } from '../闸/闸.ts';
import { 叠层键, 算全部段指纹, type 段指纹 } from '../指纹/指纹.ts';
import { 叠层目录, 数据根, 母版目录 } from '../环境/配置.ts';
import { 全部段, type 段信息 } from '../清单/清单.ts';
import { 核对段材质包, 照段材质包, 读作品资产锁, 逐组照材质包 } from '../资产/资产锁.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 补缺字节占位 } from '../资产/缺字节.ts';
import { 备好私有配乐, 缺配乐提示 } from '../资产/私有配乐.ts';
import { 缺的注册目录, 缺目录提示 } from '../段框架/注册目录.ts';
import { 记耗时, 预计耗时, type 运行记录 } from '../运行记录/记录.ts';
import { 出帧编码计时, 记阶段, 量阶段, 阶段小结, type 阶段记录 } from '../运行记录/阶段.ts';
import { 明细收集 } from '../运行记录/渲染明细.ts';
import { 压缩母版路径, 原母版路径, 叠层路径, 写指纹, 有母版, 现母版, 记用过 } from './母版.ts';
import { 备好public目录 } from './public目录.ts';
import { 已转完 } from './转存.ts';
import { 删打包, 登记打包 } from './打包残留.ts';
import { 收求解缓存, 等求解缓存写完 } from './求解缓存收集.ts';
import { 段渲染环境, 段现在的地形 } from './地形注入.ts';
import { 开始整段量, 收地形用量, 记已量帧, 等地形用量写完 } from './地形用量.ts';
import { 视频信息 } from './探测.ts';
import { 删旧, 有要删的旧 } from '../缓存/钉.ts';
import { 后处理一段 } from './后处理.ts';
import { 建后台转存, type 跑后台 } from './后台转存.ts';
import { 叠层渲染参数, 渲染参数, 等帧超时毫秒, type 渲染参数表 } from './设置.ts';
import type { 叠层定义 } from '../../engine/段/段定义.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';

export const 渲染标签 =(键: string, 级别: 渲染级别) => `render:${作品名()}/${键}:${级别}`;

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
    browser = await 量阶段(收, 标签, '开浏览器', () => openBrowser('chrome', { chromiumOptions: { gl: 参数.gl }, forceDeviceScaleFactor: 参数.scale, logLevel: 'error' }));
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
const 量渲染 = async (标签: string, 收: 阶段记录[], t0: number, fn: (钩子: { logLevel: 'verbose'; onProgress: (p: { renderedFrames: number; renderedDoneIn: number | null }) => void }) => Promise<unknown>) => {
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

export const 找组合 = (h: Pick<会话, '组合'>, s: 段信息, id = s.键) => {
  核对段材质包(作品根(), s.键);
  const c = h.组合.find((x) => x.id === id);
  if (!c) throw new Error(`打包里没有 Composition ${id}（作品的 注册.tsx 按清单和 段.ts 的叠层登记，清单里有它吗？）`);
  if (c.durationInFrames !== s.段.帧数 || c.fps !== s.段.fps || c.width !== s.段.宽 || c.height !== s.段.高) {
    throw new Error(`${id} 的 Composition（${c.durationInFrames} 帧 ${c.fps}fps ${c.width}×${c.height}）和 段.ts 对不上`);
  }
  return c;
};

export type 母版结果 = { 段: 段信息; 指纹: 段指纹; 母版: string; 新渲: boolean };

/**
 * 没重渲、已是最新的这些键也清一遍旧的：worktree 里渲的新指纹合进主检出后，第一次 render 走这里（worktree 里 有要删的旧 总是 false）。
 * 有要删的才过闸
 */
const 清命中的旧 = async (种: '母版' | '叠层', 项们: { 键: string; 指纹: string }[], 级别: 渲染级别, 记录: 运行记录) => {
  const 要清 = 项们.filter((x) => 有要删的旧(种, x.键, 级别, x.指纹));
  if (!要清.length) return;
  await 过渲染闸(async () => {
    for (const x of 要清) 删旧(种, x.键, 级别, x.指纹, { 记录 });
  },undefined,{}, {种:'清命中的旧',不开渲染:true});
};

/** 段目录下的 本机地形.txt 写着这段要的、没登记发布的区段包（核对-世界编辑）。换台机器没有这个包就跳过：不让一条批量渲染死在核对段上（用户 10-31 定）。放段外的文件不进指纹 */
export const 缺的本机地形 = (s: Pick<段信息, '目录'>, 地形根 = path.join(数据根(), 'terrain')): string | null => {
  const f = path.join(s.目录, '本机地形.txt');
  if (!fs.existsSync(f)) return null;
  const 包 = fs.readFileSync(f, 'utf8').trim();
  return fs.existsSync(path.join(地形根, 包)) ? null : 包;
};

export const 渲染母版 = async (全部: 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 留CRF1?: boolean; 记录: 运行记录; /** 测试换掉子进程 */ 跑后台?: 跑后台 }): Promise<母版结果[]> => {
  const 段们 = 全部.filter((s) => {
    const 包 = 缺的本机地形(s);
    if (包) console.log(`跳过 ${s.键}：本机没有区段包 ${包}（anim world bake 烘出来才能渲）`);
    return !包;
  });
  // 先补字节再算指纹：空数据根时指纹的「缺字节」项要按补完的算，不然母版落在错的指纹下、film 认不出
  const 总标签 = `批:${作品名()}:${级别}`;
  await 量阶段(opts.记录.阶段, 总标签, '准备', async () => 补字节并报(作品根(), 数据根()));
  const 参数 = 渲染参数(级别);
  const 结果: 母版结果[] = [];
  const 待渲: 母版结果[] = [];
  const 指纹们 = await 量阶段(opts.记录.阶段, 总标签, '算指纹', () => 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: 参数 }))));
  for (const [i, s] of 段们.entries()) {
    const fp = 指纹们[i]!;
    const r = { 段: s, 指纹: fp, 母版: 现母版(s.键, fp.指纹) ?? 压缩母版路径(s.键, fp.指纹), 新渲: false };
    结果.push(r);
    if (有母版(s.键, fp.指纹) && !opts.重渲) {
      console.log(`✓ ${s.键}：母版已是最新（${fp.指纹.slice(0, 16)}）`);
      if (fs.existsSync(原母版路径(s.键, fp.指纹)) && !(await 已转完(s.键, fp.指纹, 作品名())))
        console.log(`  ${s.键}：CRF1 还没转，用到时（film、edit-package、--到预览）会转；或者重跑 --重渲`);
      记用过(母版目录(s.键), fp.指纹);
    } else 待渲.push(r);
  }
  await 量阶段(opts.记录.阶段, 总标签, '清旧', () => 清命中的旧('母版', 结果.filter((r) => !待渲.includes(r)).map((r) => ({ 键: r.段.键, 指纹: r.指纹.指纹 })), 级别, opts.记录));
  // ANIM_INLINE_TRANSCODE 是对照和逃生口（环境变量名必须 ASCII，非 ASCII 的名字 Node 24 Worker 段错误）。
  // 留 CRF1 的批也串行：这份 CRF1 转完就算已被取代，只有闸挡得住 film 的 备好母版、gc 在 verify 之前删它，跨进程没有别的记号
  const 后台 = process.env.ANIM_INLINE_TRANSCODE === '1' || opts.留CRF1 ? null : 建后台转存({ 记录: opts.记录, 级别, 跑: opts.跑后台 });
  try {
    if (待渲.length) {
      const 估 = 待渲.map((r) => 预计耗时(渲染标签(r.段.键, 级别)));
      const 已知 = 估.filter((x): x is number => x !== null);
      console.log(
        `== 要渲 ${待渲.length} 段：${待渲.map((r) => r.段.键).join('、')}` +
          (已知.length ? `；按耗时表预计约 ${Math.round(已知.reduce((a, b) => a + b, 0))} 秒${已知.length < 待渲.length ? `（另 ${待渲.length - 已知.length} 段没有记录）` : ''}` : '；耗时表里还没有这些段的记录'),
      );
      // 材质包按段选的一组一个打包（资产锁.ts）；不按段选的只有一组
      await 逐组照材质包(作品根(), 待渲, (r) => r.段.键, (组) => 开会话(级别, async (h) => {
        for (const r of 组) {
          const composition = 找组合(h, r.段);
          const 标签 = 渲染标签(r.段.键, 级别);
          await 后台?.等空位(r.段.键, 标签);
          await 量阶段(opts.记录.阶段, 标签, '等求解缓存', 等求解缓存写完);
          const 排队起 = Date.now();
          const 明细 = await 过渲染闸(async () => {
            const t0 = Date.now();
            记阶段(opts.记录.阶段, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
            const 原 = 原母版路径(r.段.键, r.指纹.指纹);
            const tmp = 原.replace(/\.mkv$/, `.渲染中-${process.pid}.mkv`);
            const 撤临时 = 登记临时文件(tmp);
            fs.mkdirSync(path.dirname(tmp), { recursive: true });
            console.log(`== 渲 ${r.段.键}`);
            let code = 1;
            let 明细: 明细收集 | null = null;
            try {
              开始整段量(r.段.键, r.指纹.指纹);
              明细 = await 量渲染(标签, opts.记录.阶段, t0, (钩子) => renderMedia({
                serveUrl: h.serveUrl,
                composition,
                outputLocation: tmp,
                inputProps: 参数.inputProps,
                envVariables: 段渲染环境(r.指纹.段, r.指纹.项.地形),
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
                ...钩子,
              }));
              const t查 = Date.now();
              const 帧 = 视频信息(tmp).帧数;
              记阶段(opts.记录.阶段, 标签, '查帧数', t查, (Date.now() - t查) / 1000);
              if (帧 !== r.段.段.帧数) throw new Error(`${r.段.键} 渲出来 ${帧} 帧，段.ts 写的是 ${r.段.段.帧数} 帧`);
              // 先记再改名：别的 render 的 删旧 在闸外跑，这份还没被段签记下来，只靠「刚用过」挡着
              记用过(母版目录(r.段.键), r.指纹.指纹);
              fs.renameSync(tmp, 原);
              写指纹(r.指纹);
              r.母版 = 原;
              r.新渲 = true;
              code = 0;
            } finally {
              fs.rmSync(tmp, { force: true });
              撤临时();
              const 秒 = (Date.now() - t0) / 1000;
              记耗时(渲染标签(r.段.键, 级别), t0, 秒, code, `anim render ${r.段.键}`);
              if (code === 0) console.log(`   ${r.段.键}：${秒.toFixed(0)} 秒 → ${原}`);
            }
            await 记已量帧(r.段.键, Array.from({ length: r.段.段.帧数 }, (_, i) => i));
            if (后台) {
              // 放闸就停表：明细的总秒还是这段占闸的时间，排队和后台另有阶段
              明细?.停表();
              return 明细;
            }
            // 还在渲染闸里：派生、转码都要解码整段母版
            const x = await 后处理一段({ 键: r.段.键, 指纹: r.指纹.指纹, 级别, 作品: 作品名(), 留CRF1: !!opts.留CRF1, 标签 }, { 收: opts.记录.阶段, 记录: opts.记录 });
            if (x.母版) r.母版 = x.母版;
            return 明细;
          }, undefined, {}, {种:'render',作品:作品名(),段:r.段.键,级别,帧数:composition.durationInFrames,项数:待渲.length,可让路:待渲.length>1,用途:process.env.ANIM_PURPOSE??'产出'});
          const 写明细 = () => 明细?.写出(opts.记录.阶段, { 指纹: r.指纹.指纹.slice(0, 16) });
          const 收工 = async () => {
            opts.记录.产物.push(r.母版);
            // 派生段签、转存的阶段这时才齐
            await 写明细();
          };
          if (!后台) await 收工();
          else {
            // 先落一份：批被杀时后台还没做完的段，出帧明细和温度不跟着丢；收工再写同一个文件，带齐后台阶段
            await 写明细();
            // 闸已放开：这里排，子进程才不算在持锁上下文里
            后台.排({ 键: r.段.键, 指纹: r.指纹.指纹, 标签 }, async (x) => {
              if (x?.母版) r.母版 = x.母版;
              await 收工();
            });
          }
        }
      }, opts.记录));
    }
  } finally {
    // 关了浏览器再等（开会话 的 finally 已关），出错、让路也要等：已经排上的段不能丢给孤儿
    await 后台?.等齐(总标签);
  }
  return 结果;
};

export const 叠层渲染标签 = (键: string, 级别: 渲染级别) => `render-layer:${作品名()}/${键}:${级别}`;
export type 叠层结果 = { 段: 段信息; 叠层: 叠层定义; 键: string; 指纹: 段指纹; 文件: string; 新渲: boolean };

/** 渲这些段声明的透明叠层；指纹对得上就跳过 */
export const 渲染叠层 = async (段们: 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 记录: 运行记录 }): Promise<叠层结果[]> => {
  补字节并报(作品根(), 数据根());
  const 参数 = 叠层渲染参数(级别);
  const 各层 = 段们.flatMap((s) => (s.段.叠层 ?? []).map((l) => ({ 段: s, 叠层: l })));
  const 指纹们 = await 算全部段指纹(各层.map((x) => ({ 段: x.段, 渲染设置: 参数, 叠层: x.叠层 })));
  const 结果: 叠层结果[] = 各层.map(({ 段: s, 叠层: l }, i) => ({ 段: s, 叠层: l, 键: 叠层键(s.键, l), 指纹: 指纹们[i]!, 文件: 叠层路径(叠层键(s.键, l), 指纹们[i]!.指纹), 新渲: false }));
  const 待渲 = 结果.filter((r) => {
    const 有 = fs.existsSync(r.文件) && !opts.重渲;
    if (有) {
      console.log(`✓ ${r.键}：叠层已是最新（${r.指纹.指纹.slice(0, 16)}）`);
      记用过(叠层目录(r.键), r.指纹.指纹);
    }
    return !有;
  });
  await 清命中的旧('叠层', 结果.filter((r) => !待渲.includes(r)).map((r) => ({ 键: r.键, 指纹: r.指纹.指纹 })), 级别, opts.记录);
  if (!待渲.length) return 结果;
  console.log(`== 要渲 ${待渲.length} 个叠层：${待渲.map((r) => r.键).join('、')}`);
  await 逐组照材质包(作品根(), 待渲, (r) => r.段.键, (组) => 开会话(级别, async (h) => {
    for (const r of 组) {
      const composition = 找组合(h, r.段, r.键);
      const 标签 = 叠层渲染标签(r.键, 级别);
      await 量阶段(opts.记录.阶段, 标签, '等求解缓存', 等求解缓存写完);
      const 排队起 = Date.now();
      await 过渲染闸(async () => {
        const t0 = Date.now();
        记阶段(opts.记录.阶段, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
        const tmp = r.文件.replace(/\.mov$/, `.渲染中-${process.pid}.mov`);
        const 撤临时 = 登记临时文件(tmp);
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        console.log(`== 渲叠层 ${r.键}`);
        let code = 1;
        let 明细: 明细收集 | null = null;
        try {
          明细 = await 量渲染(标签, opts.记录.阶段, t0, (钩子) => renderMedia({
            serveUrl: h.serveUrl,
            composition,
            outputLocation: tmp,
            inputProps: 参数.inputProps,
            envVariables: 段渲染环境(r.指纹.段, r.指纹.项.地形),
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
            ...钩子,
          }));
          const 帧 = 视频信息(tmp).帧数;
          if (帧 !== r.段.段.帧数) throw new Error(`${r.键} 渲出来 ${帧} 帧，段.ts 写的是 ${r.段.段.帧数} 帧`);
          fs.renameSync(tmp, r.文件);
          写指纹(r.指纹, 叠层目录(r.键));
          r.新渲 = true;
          code = 0;
        } finally {
          fs.rmSync(tmp, { force: true });
          撤临时();
          const 秒 = (Date.now() - t0) / 1000;
          记耗时(叠层渲染标签(r.键, 级别), t0, 秒, code, `anim render ${r.段.键}`);
          if (code === 0) console.log(`   ${r.键}：${秒.toFixed(0)} 秒 → ${r.文件}`);
        }
        记用过(叠层目录(r.键), r.指纹.指纹);
        删旧('叠层', r.键, 级别, r.指纹.指纹, { 记录: opts.记录 });
        await 明细?.写出(opts.记录.阶段, { 指纹: r.指纹.指纹.slice(0, 16) });
      }, undefined, {}, {种:'render',作品:作品名(),段:r.段.键,级别,帧数:composition.durationInFrames,项数:待渲.length,可让路:待渲.length>1,用途:process.env.ANIM_PURPOSE??'产出'});
      opts.记录.产物.push(r.文件);
    }
  }, opts.记录));
  return 结果;
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
    const composition = 找组合(h, s);
    for (const f of 要出) {
      if (!(f >= 0 && f < composition.durationInFrames)) throw new Error(`${s.键} 只有 ${composition.durationInFrames} 帧，没有第 ${f} 帧`);
    }
    await 等求解缓存写完();
    const 标签 = `still:${作品名()}/${s.键}:${级别}`;
    const 排队起 = Date.now();
    await 过渲染闸(async () => {
      const t0 = Date.now();
      const 收 = 记录?.阶段;
      const 等闸 = 记阶段(收, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
      const 明细 = new 明细收集(标签);
      const 环境 = 段渲染环境(s.键, 段现在的地形(s));
      if (!o.光影) await 明细.包(() => 出静帧们(h, composition, s.键, 要出, 出到, { 逐帧: o.逐帧, 环境, 完成: (已出) => 明细.帧完成(已出) }));
      else {
        const 们 = o.光影;
        await 明细.包(async () => {
          for (const [i, c] of 们.entries())
            await 出静帧们(h, composition, s.键, 要出, 出到, { 逐帧: o.逐帧, 环境: { ...环境, [光影环境名]: c.值 }, 后缀: `-光影-${c.名}`, 完成: (已出) => 明细.帧完成(i * 要出.length + 已出) });
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
