// anim stale [<选择器…>] [--级别 …] [--详细] [--严格]：每段现在的切片分三态：✓ 渲过、切片（mp4 + wav）在；◐ 渲过（有 .指纹.json 或段签）、切片不在，要用时重渲；
// ✗ 过期（这个画面指纹没渲过），和同一档最近一次渲过的指纹比，说明是哪项变了。切片在、段签缺的另标「缺段签」（verify、认指纹 用到时自动补）。
// 指纹和 anim film 同一套算法（渲/段产物.ts：带这段的字幕、按成片输出帧率）；所有段一次建图算。默认退出码总是 0；--严格 时有过期段（✗）退出码 1（给脚本、CI 用），◐ 不算过期。
// ✓ 里 anim 认指纹 登记的另标「沿用 <旧指纹>」：切片是旧指纹那份的克隆，没真渲过。
// anim 认指纹 <选择器…> --理由 … [--抽 <n>] [--级别 …] [--只看]：过期的段抽帧和旧切片比，都在压缩噪声内就登记成沿用旧切片（认指纹.ts，决策/0013）。
import fs from 'node:fs';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 全部段, 选段 } from '../清单/清单.ts';
import { 历史指纹, 指纹文件 } from '../渲/母版.ts';
import { 读段签, 段签齐 } from '../段签/段签.ts';
import { 段产物们, 同档, 是画面记录, type 段产物 } from '../渲/段产物.ts';
import { 渲染标签 } from '../渲/渲.ts';
import { 预计耗时 } from '../运行记录/记录.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import { 指纹差异, 稳定JSON, type 段指纹 } from './指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 提交状态 } from '../环境/路径.ts';
import { 段签目录 } from '../环境/配置.ts';
import { 开会话, 找组合, 同页出帧, 缺的本机地形 } from '../渲/渲.ts';
import { 段渲染环境 } from '../渲/地形注入.ts';
import { 记已量帧 } from '../渲/地形用量.ts';
import { 等求解缓存写完 } from '../渲/求解缓存收集.ts';
import { 逐组照材质包 } from '../资产/资产锁.ts';
import { 懒放行闸, 过渲染闸 } from '../闸/闸.ts';
import { 记阶段 } from '../运行记录/阶段.ts';
import { 明细收集 } from '../运行记录/渲染明细.ts';
import { 读阈值 } from '../验收/比较.ts';
import { 帧号文本 } from '../验收/逐帧校验.ts';
import { 查所选段cues, 渲前跑cues } from '../段框架/自动.ts';
import { 默认抽帧数, 抽帧, 找旧版, 新指纹已有, 旧帧们, 比一帧, 登记沿用, 静帧证明不了, 帧转yuv, type 帧比, type 旧版 } from './认指纹.ts';

const 取级别 = (v: string | undefined): 渲染级别 => {
  const 级别 = (v ?? '视频') as 渲染级别;
  if (!渲染级别取值.includes(级别)) throw new 用法错误(`--级别 只能是 ${渲染级别取值.join('、')}`);
  return 级别;
};

// 只渲一截时第一帧的读地形摊不到，单独加上（和 逐帧校验 的估法一样）
const 第一帧约秒 = 15;
const 列出的不同帧最多 = 8;

type 一段 = { 段: 段信息; 产物: 段产物; 新: 段指纹; 旧: 旧版; 帧: number[] };

/** anim 认指纹：见 认指纹.ts 文件头。返回退出码：选中的过期段有没认下来的（不同、没有旧切片、静帧证明不了）是 1 */
export const 跑认指纹 = async (段们: readonly 段信息[], o: { 理由: string; 抽: number; 级别: 渲染级别; 只看: boolean; 记录: 运行记录 }): Promise<number> => {
  const { 记录, 级别 } = o;
  let 没认 = 0;
  const 不认 = (文本: string) => {
    没认++;
    记录.记('错误', 文本);
  };
  const 全部 = await 全部段();
  const 产物们 = await 段产物们(全部, 段们, 级别);
  const 计划: 一段[] = [];
  let 本来最新 = 0;
  let 认了 = 0;
  // 旧切片缺段签时 找旧版 要当场派生（解码），和后面解旧切片共用一次放行闸
  const 等放行 = 懒放行闸();
  for (const [i, s] of 段们.entries()) {
    const 产物 = 产物们[i]!;
    const 新 = 产物.画面指纹;
    const 已有 = 新指纹已有(s.键, 产物);
    if (已有) {
      本来最新++;
      console.log(`· ${s.键}：不过期（${已有}），不用认`);
      continue;
    }
    const 包 = 缺的本机地形(s);
    if (包) {
      不认(`${s.键}：本机没有区段包 ${包}，出不了静帧（anim world bake 烘出来才能认）`);
      continue;
    }
    const { 旧, 没用的 } = await 找旧版(s.键, 新, { 帧数: 产物.输出帧数, 等放行 });
    if (!旧) {
      不认(`${s.键}：没有能比的旧切片（同一档渲过、切片和配的 wav 还在的）${没用的.length ? `\n    ${没用的.slice(0, 5).join('\n    ')}` : ''}`);
      continue;
    }
    const 拦 = 静帧证明不了(旧.项, 新.项);
    if (拦.length) {
      不认(`${s.键}：和 ${旧.指纹.slice(0, 16)} 比，${拦.join('；')}；要重渲（anim film ${s.键}）`);
      continue;
    }
    const 帧 = 抽帧(产物.输出帧数, o.抽);
    console.log(`== ${s.键}：${新.指纹.slice(0, 16)} 和 ${旧.指纹.slice(0, 16)}（${旧.母版.split(/[\\/]/).pop()}）比 ${帧.length} 帧：${帧号文本(帧)}`);
    for (const d of 指纹差异(旧.记录, 新).slice(0, 12)) console.log(`    ${d}`);
    计划.push({ 段: s, 产物, 新, 旧, 帧 });
  }
  if (计划.length && !o.只看) {
    const 估 = 计划.map((x) => {
      const 整段 = 预计耗时(渲染标签(x.段.键, 级别));
      return 整段 === null ? null : (整段 * x.帧.length) / x.产物.输出帧数 + 第一帧约秒;
    });
    const 已知 = 估.filter((x): x is number => x !== null);
    console.log(`== 认指纹 ${计划.length} 段、${计划.reduce((a, x) => a + x.帧.length, 0)} 帧${已知.length ? `；按耗时表预计出帧约 ${Math.round(已知.reduce((a, b) => a + b, 0))} 秒${已知.length < 计划.length ? `（另 ${计划.length - 已知.length} 段没有记录）` : ''}` : ''}`);
    const 阈 = 读阈值();
    const 提交 = (() => {
      const x = 提交状态();
      return x ? `${x.提交}${x.有改动 ? '+未提交改动' : ''}` : '不在 git 里';
    })();
    await 逐组照材质包(作品根(), 计划, (x) => x.段.键, (组) =>
      开会话(级别, async (h) => {
        for (const x of 组) {
          const 键 = x.段.键;
          const composition = 找组合(h, x.段, 全部);
          const { 宽, 高 } = x.旧.签.签名;
          // 先解旧切片（过放行闸，一条命令只过一次），再拿渲染闸出新帧：解码不占渲染闸
          await 等放行();
          const 旧帧 = await 旧帧们(x.旧, x.帧);
          await 等求解缓存写完();
          const 标签 = `认指纹:${作品名()}/${键}:${级别}`;
          const 排队起 = Date.now();
          const 比们: 帧比[] = [];
          await 过渲染闸(
            async () => {
              const t0 = Date.now();
              记阶段(记录.阶段, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
              const 明细 = new 明细收集(标签);
              // 同页按帧号升序连着出、声音开着，参数和切片那遍一样（带字幕），走法和 renderMedia 出切片一样（逐帧校验 同款）
              const 转: Promise<void>[] = [];
              await 明细.包(async () => {
                await 同页出帧({ ...h, 参数: x.产物.参数 }, composition, x.帧, {
                  打开声音: true,
                  环境: 段渲染环境(键, x.新.项.地形),
                  每帧: (图, f) => {
                    转.push(帧转yuv(图, 宽, 高).then((y) => {
                      比们.push(比一帧(f, y, 旧帧.get(f)!, 宽, 高, 阈));
                      明细.帧完成(比们.length);
                    }));
                  },
                });
                await Promise.all(转);
              });
              await 记已量帧(键, x.帧);
              记阶段(记录.阶段, 标签, '出帧', t0, (Date.now() - t0) / 1000);
              await 明细.写出(记录.阶段, { 指纹: x.新.指纹.slice(0, 16) });
            },
            undefined,
            {},
            { 种: 'still', 作品: 作品名(), 段: 键, 级别, 帧数: x.帧.length, 帧: x.帧.join(',').slice(0, 60), 用途: '认指纹' },
          );
          const 不同 = 比们.filter((b) => b.结论 === '不同').sort((a, b) => a.帧 - b.帧);
          const 一样 = 比们.filter((b) => b.结论 === '一样').length;
          const 看 = 比们.filter((b) => b.看一眼);
          if (比们.length !== x.帧.length) {
            不认(`${键}：只出了 ${比们.length}/${x.帧.length} 帧，不认`);
            continue;
          }
          if (不同.length) {
            不认(
              [`${键}：${x.帧.length} 帧里 ${不同.length} 帧和 ${x.旧.指纹.slice(0, 16)} 的切片不同（${帧号文本(不同.map((b) => b.帧))}），不认，照常过期`, ...不同.slice(0, 列出的不同帧最多).map((b) => `第 ${b.帧} 帧：${b.说明}`)].join('\n    '),
            );
            continue;
          }
          const r = 登记沿用(键, x.旧, x.产物, { 理由: o.理由, 帧: x.帧, 提交, 级别 });
          认了++;
          记录.产物.push(段签目录(键, x.新.指纹), r.母版, r.声音);
          console.log(`✓ ${键}：${x.帧.length} 帧都在压缩噪声内（逐字节一样 ${一样} 帧），${x.新.指纹.slice(0, 16)} 沿用 ${x.旧.指纹.slice(0, 16)} 的切片（${r.怎么复制}）`);
          for (const b of 看) console.log(`    第 ${b.帧} 帧在看一眼档里（不算不同）：${b.说明}`);
        }
      }, 记录),
    );
  }
  if (o.只看) console.log(`\n--只看：${计划.length} 段能比，没出帧、没登记${没认 ? `；${没认} 段认不了` : ''}`);
  else console.log(`\n${段们.length} 段：认了 ${认了} 段${没认 ? `，${没认} 段没认（照常过期，要重渲）` : ''}${本来最新 ? `，${本来最新} 段本来不过期` : ''}`);
  if (!o.只看 && 认了) console.log('认了的段没真渲过：没抽到的帧和声音没比。要补整段比对：anim --低优先 film <段> --重渲（同指纹重渲，段签自查会比签名和声音）');
  return 没认 ? 1 : 0;
};

export const 指纹命令: Record<string, 命令> = {
  认指纹: {
    用法: '认指纹 <选择器…> --理由 <…> [--抽 <n>] [--级别 视频|预览] [--只看]',
    说明: `过期的段抽 n 帧（默认 ${默认抽帧数}，含首尾；按输出帧）静帧和同一档最近一份旧切片比，都在压缩噪声内就把新指纹登记成沿用旧切片、不重渲；有一帧不同就不认、报是哪几帧。--只看 只列要比什么`,
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--理由', '--抽', '--级别'], 开关: ['--只看'] });
      if (!p.位置.length) throw new 用法错误('要给选择器（段键、段名、编号、场键、章）');
      const 理由 = p.值['--理由']?.trim();
      if (!理由) throw new 用法错误('要写 --理由（为什么认为画面没变，比如「three 0.186.1 → 0.186.2」「搬函数」），记进段签');
      const 抽 = p.值['--抽'] === undefined ? 默认抽帧数 : Number(p.值['--抽']);
      if (!Number.isInteger(抽) || 抽 < 2) throw new 用法错误('--抽 要是不小于 2 的整数（含首、尾帧）');
      const 级别 = 取级别(p.值['--级别']);
      const cues = await 渲前跑cues();
      const 段们 = await 选段(p.位置);
      查所选段cues(cues, 段们);
      return 跑认指纹(段们, { 理由, 抽, 级别, 只看: p.开关.has('--只看'), 记录 });
    },
  },
  stale: {
    用法: 'stale [<选择器…>] [--级别 视频|预览] [--详细] [--严格]',
    说明: '列出各段指纹和切片是否最新（和 anim film 同一套指纹），过期的说明哪项输入变了、预计重渲多久；--严格 有过期段时退出码 1',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--级别'], 开关: ['--详细', '--严格'] });
      const 级别 = 取级别(p.值['--级别']);
      const 段们 = p.位置.length ? await 选段(p.位置) : await 全部段();
      let 过期数 = 0;
      let 母版不在 = 0;
      let 预计 = 0;
      let 没记录 = 0;
      const 加预计 = (键: string) => {
        const 估 = 预计耗时(渲染标签(键, 级别));
        if (估 === null) 没记录++;
        else 预计 += 估;
        return 估;
      };
      const 产物们 = await 段产物们(await 全部段(), 段们, 级别);
      for (const r of 产物们) {
        const s = r.段;
        const fp = r.画面指纹;
        const 有 = fs.existsSync(r.画面) && fs.existsSync(r.声音);
        const 签 = 读段签(s.键, fp.指纹);
        const 渲过 = 有 || !!签 || fs.existsSync(指纹文件(s.键, fp.指纹));
        const 头 = `${(s.编号 ?? '').padEnd(5)} ${s.键}  ${fp.指纹.slice(0, 16)}`;
        if (有) console.log(`✓ ${头}${签?.沿用 ? `  沿用 ${签.沿用.自.slice(0, 16)}（认指纹，没真渲过）` : ''}${段签齐(签) ? '' : '  缺段签（verify、认指纹 用到时自动补）'}`);
        else if (渲过) {
          母版不在++;
          const 估 = 加预计(s.键);
          console.log(`◐ ${头}  渲过，切片不在${估 === null ? '' : `（要用时重渲约 ${Math.round(估)} 秒）`}`);
        } else console.log(`✗ ${头}  过期`);
        if (p.开关.has('--详细')) console.log(JSON.stringify(fp.项, null, 2).replace(/^/gm, '    '));
        if (渲过) continue;
        过期数++;
        加预计(s.键);
        // 和同一档最近渲过的那份比；没有同档的（CRF1 时代的、别的输出帧率的）退到同一级别最近的画面记录
        const 历史 = 历史指纹(s.键);
        const 同档的 = 历史.find((h) => 同档(h, fp));
        const 上次 = 同档的 ?? 历史.find((h) => 是画面记录(h) && 稳定JSON((h.项?.渲染设置?.inputProps as { 级别?: unknown } | undefined)?.级别) === 稳定JSON(级别));
        if (!上次) console.log('    没渲过');
        else {
          if (!同档的) console.log(`    同一档没渲过，和别的档的 ${上次.指纹.slice(0, 16)} 比`);
          for (const d of 指纹差异(上次, fp).slice(0, 20)) console.log(`    ${d}`);
        }
      }
      const 要渲 = 过期数 + 母版不在;
      console.log(
        `\n${段们.length} 段，过期 ${过期数} 段${母版不在 ? `，渲过但切片不在 ${母版不在} 段` : ''}` +
          `${要渲 > 没记录 ? `；按耗时表预计重渲约 ${Math.round(预计)} 秒` : ''}${没记录 ? `；${没记录} 段耗时表里没有记录` : ''}`,
      );
      return p.开关.has('--严格') && 过期数 ? 1 : 0;
    },
  },
};
