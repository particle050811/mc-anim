// anim still <段> <帧…> --到预览 <主题> [--级别 …] [--逐帧]；anim bench（测速.ts）；anim 耗时 [<段>] [--最近 <n>] [--详]（运行记录/渲染明细.ts）。
// 出片（渲段、接成片）只有 anim film（合成/命令.ts）：anim render 用户 11-06 定删掉（「那个 render 不用了 可以直接删了吧」，决策/0014）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 选段 } from '../清单/清单.ts';
import { 新建预览目录 } from '../预览/预览.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import { 渲静帧 } from './渲.ts';
import { 测速 } from './测速.ts';
import { 解析光影 } from './光影试看.ts';
import { 解析望远 } from './望远.ts';
import { 明细一览, 明细报告, 读明细们 } from '../运行记录/渲染明细.ts';
import { 查所选段cues, 渲前跑cues } from '../段框架/自动.ts';
import { 段帧数 } from '../../engine/段/段定义.ts';
import { 成片档 } from './设置.ts';

export const 静帧列表 = (参数: string[], 段: string, 总帧数: number) => {
  const 结果 = new Set<number>();
  for (const 参数项 of 参数) {
    for (const 项 of 参数项.trim().split(/\s*,\s*|\s+/)) {
      const 匹配 = /^(\d+)(?:-(\d+))?$/.exec(项);
      if (!匹配) throw new 用法错误(`帧号要是非负整数或闭区间：${项}`);
      const 起 = Number(匹配[1]), 止 = Number(匹配[2] ?? 匹配[1]);
      if (起 > 止) throw new 用法错误(`帧范围起点比终点大：${项}`);
      if (止 >= 总帧数) throw new 用法错误(`${段} 只有 ${总帧数} 帧，没有第 ${止} 帧`);
      for (let 帧号 = 起; 帧号 <= 止; 帧号++) 结果.add(帧号);
    }
  }
  return [...结果];
};

const 取级别 = (v: string | undefined): 渲染级别 => {
  const 级别 = (v ?? '视频') as 渲染级别;
  if (!渲染级别取值.includes(级别)) throw new 用法错误(`--级别 只能是 ${渲染级别取值.join('、')}`);
  return 级别;
};

export const 渲染命令: Record<string, 命令> = {
  still: {
    用法: 'still <段> <帧…（空格、逗号或起-止）> --到预览 <主题> [--级别 视频|预览] [--逐帧] [--光影 <配置>[;<配置>…]] [--望远 <x,y,宽 | 心x,心y,倍x>[;…] [--细一级] [--真值]]',
    说明: '渲几帧静帧（PNG）进预览。多帧默认在同一页面连出，快；--逐帧 每帧开新页面，慢但每帧都和单独出一帧相同，逐像素比或连出崩页时用它。--光影 把三渲二画布换成带光影层的试看画布，每份配置（预设名或 JSON）各出一遍，文件名带 -光影-<名>（pipeline/渲/光影试看.ts）。--望远 照原镜头只把原帧里的一块矩形用整张图原生渲出来（看远处细节，不是渲完再放大）：x,y,宽 是矩形左上角和宽（原帧像素，视频级 3840×2160），或 心x,心y,8x 给中心和倍数；2D 叠层和字幕不画，文件名带 -望远-x…-y…-宽…；默认出来的是原帧那块的放大（分级、阴影、台阶并色、贴图级别都照原帧算）；加 --细一级 远处强制用更细的一级，加 --真值 着色器里按像素大小做的远处简化（台阶并色、贴图取粗一级）照望远后的像素算、等于看原帧每个像素里本来有什么（文件名再带 -细一级、-真值，都不再是原帧那块的放大）。做法和偏差见 docs/望远.md',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--级别', '--到预览', '--光影', '--望远'], 开关: ['--逐帧', '--细一级', '--真值'] });
      const [选择器, ...帧] = p.位置;
      if (!选择器 || !帧.length || !p.值['--到预览']) throw new 用法错误('要 anim still <段> <帧…> --到预览 <主题>');
      const cues = await 渲前跑cues();
      const 段们 = await 选段([选择器]);
      if (段们.length !== 1) throw new 用法错误(`still 一次只渲一段，「${选择器}」对上了 ${段们.length} 段`);
      查所选段cues(cues, 段们);
      const 段 = 段们[0]!;
      const 帧们 = 静帧列表(帧, 段.键, 段帧数(段.段, 成片档().fps));
      const 级别 = 取级别(p.值['--级别']);
      for (const 开 of ['--细一级', '--真值']) if (p.开关.has(开) && !p.值['--望远']) throw new 用法错误(`${开} 要和 --望远 一起给（整帧看就写 --望远 0,0,<全宽>）`);
      if (p.值['--光影'] && p.值['--望远']) throw new 用法错误('--光影 和 --望远 不能同时给');
      const 出图倍 = 级别 === '预览' ? 1 : 成片档().渲染倍数;
      let 望远;
      try {
        望远 = p.值['--望远'] ? 解析望远(p.值['--望远'], [段.段.宽 * 出图倍, 段.段.高 * 出图倍], { 细一级: p.开关.has('--细一级'), 真值: p.开关.has('--真值') }) : undefined;
      } catch (e) {
        throw new 用法错误((e as Error).message);
      }
      const dir = 新建预览目录(p.值['--到预览']);
      const 出 = await 渲静帧(段们[0]!, 帧们, 级别, dir, 记录, { 逐帧: p.开关.has('--逐帧'), 光影: p.值['--光影'] ? 解析光影(p.值['--光影']) : undefined, 望远 });
      记录.产物.push(...出);
      console.log(`静帧在 ${dir}`);
    },
  },
  bench: {
    用法: 'bench <段> [--帧 <起>-<止>] [--级别 视频|预览] [--次 <n>] [--详细] [--输出 <json>] [--关共享内存] [--浏览器 <chrome-headless-shell>] [--不收日志] [--留输出 <目录>] [--光影 <配置>]',
    说明: '测速：照切片参数（带字幕、输出帧）渲一段帧（默认前 100 帧），按打包、开浏览器、首帧、出帧、收尾计时，不写母版缓存，缺求解缓存时先补齐（docs/渲染性能.md）',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--帧', '--级别', '--次', '--输出', '--浏览器', '--留输出', '--光影'], 开关: ['--详细', '--关共享内存', '--不收日志'] });
      const 光影 = p.值['--光影'] ? 解析光影(p.值['--光影']) : undefined;
      if (光影 && 光影.length !== 1) throw new 用法错误('bench 的 --光影 只给一份配置');
      if (p.位置.length !== 1) throw new 用法错误('要给一段（段键、段名或编号）');
      const 帧串 = p.值['--帧'];
      const m = 帧串 ? /^(\d+)-(\d+)$/.exec(帧串) : null;
      if (帧串 && (!m || Number(m[1]) > Number(m[2]))) throw new 用法错误(`--帧 写成 <起>-<止>：${帧串}`);
      const 次 = Number(p.值['--次'] ?? 1);
      if (!Number.isInteger(次) || 次 < 1) throw new 用法错误(`--次 要是正整数：${p.值['--次']}`);
      const 输出 = p.值['--输出'];
      const 详细 = p.开关.has('--详细');
      const r = await 测速({
        段: p.位置[0]!, 帧: m ? [Number(m[1]), Number(m[2])] : undefined, 级别: p.值['--级别'] ? 取级别(p.值['--级别']) : undefined, 次, 详细,
        关共享内存: p.开关.has('--关共享内存'), 浏览器: p.值['--浏览器'], 不收日志: p.开关.has('--不收日志'), 留输出: p.值['--留输出'], 光影: 光影?.[0],
        日志: 详细 ? (输出 ? 输出.replace(/\.json$/, '') : path.join(os.tmpdir(), `mc-anim-测速-${process.pid}`)) + '.log' : undefined,
      });
      const text = JSON.stringify(r, null, 2);
      console.log(text);
      if (输出) fs.writeFileSync(输出, text + '\n', 'utf8');
    },
  },
  耗时: {
    用法: '耗时 [<段>] [--最近 <n>] [--详]',
    说明: '看渲染耗时：不给段列最近几次；给段（标签里含这几个字）报最近一次的阶段、每帧、等得最多的、最慢的帧、机器负载（docs/渲染性能.md）',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--最近'], 开关: ['--详'] });
      if (p.位置.length > 1) throw new 用法错误('最多给一段');
      const 最近 = Number(p.值['--最近'] ?? (p.位置.length ? 1 : 20));
      if (!Number.isInteger(最近) || 最近 < 1) throw new 用法错误(`--最近 要是正整数：${p.值['--最近']}`);
      const 们 = 读明细们({ 含: p.位置[0], 最多: 最近 });
      if (!们.length) {
        console.log(p.位置[0] ? `还没有含「${p.位置[0]}」的渲染明细` : '还没有渲染明细（渲过一次才有）');
        return;
      }
      if (p.位置.length || p.开关.has('--详')) console.log(们.map((x) => 明细报告(x.明细, x.文件)).join('\n\n'));
      else console.log(明细一览(们));
    },
  },
};
