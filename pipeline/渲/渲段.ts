// 渲段：唯一的出片路（用户 11-06「要改 改成直接出带字幕的成片」「那个 render 不用了 可以直接删了吧」，决策/0014）。
// 每段渲出来就是成片的一截（段产物.ts）：画面按成片参数直接压成 <指纹>.mp4；声音 <指纹>.wav 原生段和画面同一遍出（separateAudioTo，决策/0015），
// 没迁的段按编排帧率另出一遍（兼容层，迁完删）；成片只接不重压（合成/拼成片.ts）。
// 指纹对得上就不渲（✓ 已是最新）。要渲的每段排队过一次渲染闸（任务种 render，耗时表标签 render:<作品>/<段>:<级别>），闸里依次：
//   出画面（Remotion 直出，核帧数 = 输出窗帧数）→ 出声音 → 从这两份派生段签（段签/，verify 的签名、首尾小图、声音.flac）→ 删同段同级别的旧产物（缓存/钉.ts）。
// 删旧只在主检出做（worktree 渲的是没合并的改动，「旧」很可能还是 main 的当前指纹）；命中「已是最新」的也清一遍（worktree 里渲的合进来后第一次出片走这里）。
// 段目录下 本机地形.txt 写的区段包本机没有就跳过这段（用户 10-31 定，不让一条批量渲染死在核对段上）。
import fs from 'node:fs';
import path from 'node:path';
import type { 渲染级别 } from '../../engine/段/设置值.ts';
import { 母版目录, 数据根 } from '../环境/配置.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 逐组照材质包 } from '../资产/资产锁.ts';
import { 过渲染闸, 登记临时文件 } from '../闸/闸.ts';
import { 记耗时, 预计耗时, type 运行记录 } from '../运行记录/记录.ts';
import { 记阶段, 量阶段 } from '../运行记录/阶段.ts';
import type { 明细收集 } from '../运行记录/渲染明细.ts';
import { 删旧, 有要删的旧 } from '../缓存/钉.ts';
import { 派生段签 } from '../段签/段签.ts';
import { 漂移提示 } from '../段签/取.ts';
import { 段渲染环境 } from './地形注入.ts';
import { 开始整段量, 记已量帧 } from './地形用量.ts';
import { 等求解缓存写完 } from './求解缓存收集.ts';
import { 写指纹, 记用过 } from './母版.ts';
import { renderMedia } from './渲染器.ts';
import { 开会话, 找组合, 渲染标签, 缺的本机地形, 量渲染 } from './渲.ts';
import { 段产物们, 是原生, type 段产物 } from './段产物.ts';
import { 声音渲染参数, 等帧超时毫秒 } from './设置.ts';
import { 视频信息 } from './探测.ts';

export { 段画面路径, 段声音路径, 段产物们, type 段产物 } from './段产物.ts';

/** 这段的当前画面、声音指纹（删旧时都不算旧） */
const 当前们 = (r: 段产物) => [r.画面指纹.指纹, r.声音指纹.指纹];

/** 先写临时名、成了再改名；先记「刚用过」再改名：别的进程的删旧在闸外，只靠它挡着 */
const 写到 = async (文件: string, 键: string, 指纹: string, 渲: (tmp: string) => Promise<unknown>) => {
  const tmp = 文件.replace(/(\.\w+)$/, `.渲染中-${process.pid}$1`);
  const 撤 = 登记临时文件(tmp);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  try {
    await 渲(tmp);
    记用过(母版目录(键), 指纹);
    fs.renameSync(tmp, 文件);
  } finally {
    fs.rmSync(tmp, { force: true });
    撤();
  }
};

/**
 * 缺的（或 重渲）就渲；返回各段产物（本机没有区段包、跳过的段不在里面）。全部 = 整部作品的段（排字幕、算全片位置）
 */
export const 渲染段们 = async (全部: readonly 段信息[], 选的: readonly 段信息[], 级别: 渲染级别, opts: { 重渲?: boolean; 记录: 运行记录 }): Promise<段产物[]> => {
  const 段们 = 选的.filter((s) => {
    const 包 = 缺的本机地形(s);
    if (包) console.log(`跳过 ${s.键}：本机没有区段包 ${包}（anim world bake 烘出来才能渲）`);
    return !包;
  });
  const 总标签 = `批:${作品名()}:${级别}`;
  // 先补字节再算指纹：空数据根时指纹的「缺字节」项要按补完的算，不然产物落在错的指纹下、下次认不出
  await 量阶段(opts.记录.阶段, 总标签, '准备', async () => 补字节并报(作品根(), 数据根()));
  const 产物们 = await 量阶段(opts.记录.阶段, 总标签, '算指纹', () => 段产物们(全部, 段们, 级别));
  const 待渲 = 产物们.filter((r) => opts.重渲 || !fs.existsSync(r.画面) || !fs.existsSync(r.声音));
  const 命中 = 产物们.filter((r) => !待渲.includes(r));
  for (const r of 命中) {
    console.log(`✓ ${r.段.键}：已是最新（画面 ${r.画面指纹.指纹.slice(0, 16)}、声音 ${r.声音指纹.指纹.slice(0, 16)}）`);
    for (const fp of 当前们(r)) 记用过(母版目录(r.段.键), fp);
  }
  // 命中的也清旧；有要删的才过闸
  const 要清 = 命中.filter((r) => 有要删的旧('母版', r.段.键, 级别, 当前们(r)));
  if (要清.length) await 量阶段(opts.记录.阶段, 总标签, '清旧', () => 过渲染闸(async () => {
    for (const r of 要清) 删旧('母版', r.段.键, 级别, 当前们(r), { 记录: opts.记录 });
  }, undefined, {}, { 种: '清命中的旧', 不开渲染: true }));
  if (!待渲.length) return 产物们;

  const 估 = 待渲.map((r) => 预计耗时(渲染标签(r.段.键, 级别)));
  const 已知 = 估.filter((x): x is number => x !== null);
  console.log(
    `== 要渲 ${待渲.length} 段：${待渲.map((r) => r.段.键).join('、')}` +
      (已知.length ? `；按耗时表预计约 ${Math.round(已知.reduce((a, b) => a + b, 0))} 秒${已知.length < 待渲.length ? `（另 ${待渲.length - 已知.length} 段没有记录）` : ''}` : '；耗时表里还没有这些段的记录'),
  );
  // 材质包按段选的一组一个打包（资产锁.ts）；不按段选的只有一组
  await 逐组照材质包(作品根(), 待渲, (r) => r.段.键, (组) => 开会话(级别, async (h) => {
    for (const r of 组) {
      const 键 = r.段.键;
      const composition = 找组合(h, r.段, 全部);
      const 标签 = 渲染标签(键, 级别);
      await 量阶段(opts.记录.阶段, 标签, '等求解缓存', 等求解缓存写完);
      const 环境 = 段渲染环境(键, r.画面指纹.项.地形);
      const 排队起 = Date.now();
      const 明细 = await 过渲染闸(async () => {
        const t0 = Date.now();
        记阶段(opts.记录.阶段, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
        let code = 1;
        const 收: { 明细?: 明细收集 } = {};
        try {
          // 原生段声音和画面同一遍出：缺哪样都整遍重渲，wav 先写临时名，画面成了再改名
          const 同一遍 = 是原生(r.段);
          if (opts.重渲 || !fs.existsSync(r.画面) || (同一遍 && !fs.existsSync(r.声音))) {
            console.log(`== 渲 ${键} 画面${同一遍 ? '、声音' : ''}`);
            const p = r.参数;
            开始整段量(键, r.画面指纹.指纹);
            const 声tmp = r.声音.replace(/(\.\w+)$/, `.渲染中-${process.pid}$1`);
            const 撤声 = 同一遍 ? 登记临时文件(声tmp) : () => {};
            try {
              await 写到(r.画面, 键, r.画面指纹.指纹, async (tmp) => {
                收.明细 = await 量渲染(标签, opts.记录.阶段, t0, (钩子) => renderMedia({
                  ...(同一遍 ? { separateAudioTo: 声tmp, audioCodec: p.audioCodec } : {}),
                  serveUrl: h.serveUrl,
                  composition,
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
                  ...钩子,
                }));
                const t查 = Date.now();
                const 帧 = 视频信息(tmp).帧数;
                记阶段(opts.记录.阶段, 标签, '查帧数', t查, (Date.now() - t查) / 1000);
                if (帧 !== r.输出帧数) throw new Error(`${键} 渲出来 ${帧} 帧，按全片位置应该是 ${r.输出帧数} 帧`);
                if (同一遍) fs.renameSync(声tmp, r.声音);
              });
            } finally {
              fs.rmSync(声tmp, { force: true });
              撤声();
            }
            写指纹(r.画面指纹);
            await 记已量帧(键, Array.from({ length: r.输出帧数 }, (_, i) => i));
          }
          if (!同一遍 && (opts.重渲 || !fs.existsSync(r.声音))) {
            console.log(`== 渲 ${键} 声音`);
            const a = 声音渲染参数();
            const t声 = Date.now();
            await 写到(r.声音, 键, r.声音指纹.指纹, (tmp) => renderMedia({
              serveUrl: h.serveUrl,
              // 按编排帧率出：页面拿 输出fps = null 的设置，注册出来就是段.ts 的帧率、帧数
              composition: { ...composition, fps: r.段.段.fps, durationInFrames: r.段.段.帧数 },
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
            }));
            写指纹(r.声音指纹);
            记阶段(opts.记录.阶段, 标签, '声音', t声, (Date.now() - t声) / 1000);
          }
          code = 0;
          收.明细?.停表();
        } finally {
          const 秒 = (Date.now() - t0) / 1000;
          记耗时(标签, t0, 秒, code, `anim film ${键}`);
          if (code === 0) console.log(`   ${键}：${秒.toFixed(0)} 秒 → ${r.画面}、${path.basename(r.声音)}`);
        }
        // 段签在闸里当场派生（要解一遍切片；不计进耗时表）：之后 verify、认指纹 不用再解
        const t签 = Date.now();
        const 签 = await 派生段签(r, { 派生: '渲染', 计时: { 收: opts.记录.阶段, 标签 } });
        if (签.自查?.结论 === '漂移') opts.记录.记('警告', 漂移提示(键, 签.自查));
        记阶段(opts.记录.阶段, 标签, '段签', t签, (Date.now() - t签) / 1000);
        删旧('母版', 键, 级别, 当前们(r), { 记录: opts.记录 });
        return 收.明细;
      }, undefined, {}, { 种: 'render', 作品: 作品名(), 段: 键, 级别, 帧数: r.输出帧数, 项数: 待渲.length, 可让路: 待渲.length > 1, 用途: process.env.ANIM_PURPOSE ?? '产出' });
      await 明细?.写出(opts.记录.阶段, { 指纹: r.画面指纹.指纹.slice(0, 16) });
      opts.记录.产物.push(r.画面, r.声音);
    }
  }, opts.记录));
  return 产物们;
};
