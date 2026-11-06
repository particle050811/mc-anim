// 渲段：每段渲出来就是成片的一截（用户 11-05 定「母版 = 成片切片」，不再先出 CRF 1 母版、转存、派生段签）。
//   画面：按成片档的输出帧率、分辨率，叠层和这段的字幕画在段里，Remotion 直接压成成片参数（设置.ts 的 渲染参数），存 <指纹>.mp4；
//   声音：原生段（段.ts 写 时钟: '秒'）和画面同一遍出（separateAudioTo 写 wav，声音指纹 = 画面指纹，docs/决策/0015-原生60帧.md）；
//   没迁的段按编排帧率另出一遍 wav（声音渲染参数，兼容层，迁完删）。存 <指纹>.wav，放 cache/母版/<作品>/<段键>/。
// 成片只把各段的画面直接接起来、声音接起来拉响度（合成/拼成片.ts）。每段过渲染闸、记耗时，和以前一样。
import fs from 'node:fs';
import path from 'node:path';
import { 段输出窗, 全片起帧表 } from '../../engine/段/出帧.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';
import { 母版目录, 数据根 } from '../环境/配置.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 算全部段指纹, type 段指纹 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 过渲染闸, 登记临时文件 } from '../闸/闸.ts';
import { 记耗时, type 运行记录 } from '../运行记录/记录.ts';
import { 量阶段 } from '../运行记录/阶段.ts';
import { 排全片字幕, 段字幕卡 } from '../合成/段字幕.ts';
import { 段渲染环境 } from './地形注入.ts';
import { 写指纹, 记用过 } from './母版.ts';
import { renderMedia } from './渲染器.ts';
import { 开会话, 渲染标签 } from './渲.ts';
import { 成片档, 母版宽高, 声音渲染参数, 渲染参数, 等帧超时毫秒 } from './设置.ts';
import { 视频信息 } from './探测.ts';

export const 段画面路径 = (键: string, 指纹: string) => path.join(母版目录(键), `${指纹.slice(0, 16)}.mp4`);
export const 段声音路径 = (键: string, 指纹: string) => path.join(母版目录(键), `${指纹.slice(0, 16)}.wav`);

/** 原生段：画面和声音同一遍出 */
const 是原生 = (s: 段信息) => s.段.时钟 === '秒';

/** 声音起秒、止秒：这段的 wav 第 0 个样本、末尾在全片的第几秒。原生段是输出窗（和画面一样），兼容段是编排窗 */
export type 段产物 = { 段: 段信息; 画面指纹: 段指纹; 声音指纹: 段指纹; 画面: string; 声音: string; 输出帧数: number; 输出起帧: number; 声音起秒: number; 声音止秒: number };

/** 算各段的画面、声音指纹和输出窗（全部 = 整部作品的段，排字幕、算全片位置要用） */
export const 段产物们 = async (全部: readonly 段信息[], 段们: readonly 段信息[], 级别: 渲染级别): Promise<段产物[]> => {
  const 档 = 成片档();
  const [宽, 高] = 母版宽高(级别);
  const 字幕 = 排全片字幕(全部);
  const 起帧 = 全片起帧表(全部.map((s) => ({ 键: s.键, 帧数: s.段.帧数 })));
  const 画面参数们 = 段们.map((s) => {
    const p = 渲染参数(级别, 段字幕卡(s, 字幕, 档.fps, 宽, 高));
    return 是原生(s) ? { ...p, muted: false, audioCodec: 'pcm-16' as const } : p;
  });
  const 画面指纹们 = await 算全部段指纹(段们.map((s, i) => ({ 段: s, 渲染设置: 画面参数们[i]! })));
  const 兼容 = 段们.filter((s) => !是原生(s));
  const 兼容声音指纹 = await 算全部段指纹(兼容.map((s) => ({ 段: s, 渲染设置: 声音渲染参数() })));
  const 声音指纹们 = 段们.map((s, i) => (是原生(s) ? 画面指纹们[i]! : 兼容声音指纹[兼容.indexOf(s)]!));
  return 段们.map((s, i) => {
    const 窗 = 段输出窗(起帧.get(s.键)!, s.段.帧数, s.段.fps, 档.fps);
    return {
      段: s,
      画面指纹: 画面指纹们[i]!,
      声音指纹: 声音指纹们[i]!,
      画面: 段画面路径(s.键, 画面指纹们[i]!.指纹),
      声音: 段声音路径(s.键, 声音指纹们[i]!.指纹),
      输出帧数: 窗.帧数,
      输出起帧: 窗.起,
      ...(是原生(s)
        ? { 声音起秒: 窗.起 / 档.fps, 声音止秒: (窗.起 + 窗.帧数) / 档.fps }
        : { 声音起秒: 起帧.get(s.键)! / s.段.fps, 声音止秒: (起帧.get(s.键)! + s.段.帧数) / s.段.fps }),
      参数: 画面参数们[i]!,
    };
  });
};

/** 缺的（或 重渲）就渲；返回各段产物 */
export const 渲染段们 = async (全部: readonly 段信息[], 段们: readonly 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 记录: 运行记录 }): Promise<段产物[]> => {
  await 量阶段(opts.记录.阶段, `批:${作品名()}:${级别}`, '准备', async () => 补字节并报(作品根(), 数据根()));
  const 产物们 = (await 段产物们(全部, 段们, 级别)) as (段产物 & { 参数: ReturnType<typeof 渲染参数> })[];
  const 待渲 = 产物们.filter((r) => opts.重渲 || !fs.existsSync(r.画面) || !fs.existsSync(r.声音));
  // 原生段画面在、声音缺：同一遍出的，删画面整遍重渲
  for (const r of 待渲) if (!opts.重渲 && 是原生(r.段) && fs.existsSync(r.画面) && !fs.existsSync(r.声音)) fs.rmSync(r.画面);
  for (const r of 产物们.filter((x) => !待渲.includes(x))) {
    console.log(`✓ ${r.段.键}：已是最新（画面 ${r.画面指纹.指纹.slice(0, 16)}、声音 ${r.声音指纹.指纹.slice(0, 16)}）`);
    记用过(母版目录(r.段.键), r.画面指纹.指纹);
    记用过(母版目录(r.段.键), r.声音指纹.指纹);
  }
  if (!待渲.length) return 产物们;
  console.log(`== 要渲 ${待渲.length} 段：${待渲.map((r) => r.段.键).join('、')}`);
  await 开会话(级别, async (h) => {
    for (const r of 待渲) {
      const c = h.组合.find((x) => x.id === r.段.键);
      if (!c) throw new Error(`打包里没有 Composition ${r.段.键}`);
      if (c.durationInFrames !== r.输出帧数) throw new Error(`${r.段.键} 的 Composition 有 ${c.durationInFrames} 帧，按全片位置应该是 ${r.输出帧数} 帧`);
      const 环境 = 段渲染环境(r.段.键, r.画面指纹.项.地形);
      const 出 = async (种: '画面' | '声音', 文件: string, fp: 段指纹, 渲: (tmp: string) => Promise<unknown>) => {
        if (!opts.重渲 && fs.existsSync(文件)) return;
        const 标签 = `${渲染标签(r.段.键, 级别)}${种 === '声音' ? ':声音' : ''}`;
        await 过渲染闸(
          async () => {
            const t0 = Date.now();
            const tmp = 文件.replace(/(\.\w+)$/, `.渲染中-${process.pid}$1`);
            const 撤 = 登记临时文件(tmp);
            fs.mkdirSync(path.dirname(tmp), { recursive: true });
            console.log(`== 渲 ${r.段.键} ${种}`);
            let code = 1;
            try {
              await 渲(tmp);
              记用过(母版目录(r.段.键), fp.指纹);
              fs.renameSync(tmp, 文件);
              写指纹(fp);
              code = 0;
            } finally {
              fs.rmSync(tmp, { force: true });
              撤();
              const 秒 = (Date.now() - t0) / 1000;
              记耗时(标签, t0, 秒, code, `anim render ${r.段.键}`);
              if (code === 0) console.log(`   ${r.段.键} ${种}：${秒.toFixed(0)} 秒 → ${文件}`);
            }
          },
          undefined,
          {},
          { 种: 'render', 作品: 作品名(), 段: r.段.键, 级别, 帧数: 种 === '画面' ? r.输出帧数 : r.段.段.帧数, 项数: 待渲.length, 可让路: 待渲.length > 1, 用途: process.env.ANIM_PURPOSE ?? '产出' },
        );
      };
      const p = r.参数 as typeof r.参数 & { audioCodec?: 'pcm-16' };
      const 同一遍 = 是原生(r.段);
      await 出('画面', r.画面, r.画面指纹, async (tmp) => {
        // 原生段：声音同一遍写到 wav 临时名，画面改名成功后再改名（同一个指纹，缺一样就整遍重渲）
        const 声tmp = r.声音.replace(/(\.\w+)$/, `.渲染中-${process.pid}$1`);
        if (同一遍) fs.rmSync(r.声音, { force: true });
        const 撤声 = 同一遍 ? 登记临时文件(声tmp) : () => {};
        try {
          await renderMedia({
            ...(同一遍 ? { separateAudioTo: 声tmp, audioCodec: p.audioCodec } : {}),
            serveUrl: h.serveUrl,
            composition: c,
            outputLocation: tmp,
            inputProps: p.inputProps,
            envVariables: 环境,
            puppeteerInstance: h.browser,
            chromiumOptions: { gl: p.gl },
            codec: p.codec,
            crf: p.crf,
            x264Preset: p.x264Preset,
            encodingMaxRate: p.encodingMaxRate,
            encodingBufferSize: p.encodingBufferSize,
            colorSpace: p.colorSpace,
            pixelFormat: p.pixelFormat,
            muted: p.muted,
            imageFormat: p.imageFormat,
            jpegQuality: p.jpegQuality,
            scale: p.scale,
            concurrency: p.concurrency,
            timeoutInMilliseconds: 等帧超时毫秒,
            overwrite: true,
            logLevel: 'error',
          });
          const 帧 = 视频信息(tmp).帧数;
          if (帧 !== r.输出帧数) throw new Error(`${r.段.键} 渲出来 ${帧} 帧，应该是 ${r.输出帧数} 帧`);
          if (同一遍) fs.renameSync(声tmp, r.声音);
        } finally {
          if (同一遍) fs.rmSync(声tmp, { force: true });
          撤声();
        }
      });
      const a = 声音渲染参数();
      if (!同一遍) await 出('声音', r.声音, r.声音指纹, async (tmp) => {
        await renderMedia({
          serveUrl: h.serveUrl,
          // 按编排帧率出：页面拿 输出fps = null 的设置，注册出来就是段.ts 的帧率、帧数
          composition: { ...c, fps: r.段.段.fps, durationInFrames: r.段.段.帧数 },
          outputLocation: tmp,
          inputProps: a.inputProps,
          envVariables: 环境,
          puppeteerInstance: h.browser,
          chromiumOptions: { gl: a.gl },
          codec: a.codec,
          audioCodec: a.audioCodec,
          concurrency: a.concurrency,
          timeoutInMilliseconds: 等帧超时毫秒,
          overwrite: true,
          logLevel: 'error',
        });
      });
      opts.记录.产物.push(r.画面, r.声音);
    }
  }, opts.记录);
  return 产物们;
};
