// anim render <选择器…> [--级别 视频|预览] [--重渲] [--不叠层|--只叠层] [--到预览 <主题>]（段声明的透明叠层默认一起渲）；
// anim render [<选择器…>] --只派生 [--重做] [--级别 …]：不渲，从现有当前指纹的母版补段签（没给选择器是全部段，没给 --级别 是各级别）；anim still <段> <帧…> --到预览 <主题> [--级别 …]；anim bench（测速.ts）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 配置 } from '../环境/配置.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 选段 } from '../清单/清单.ts';
import { 新建预览目录 } from '../预览/预览.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import { 渲染叠层, 渲染母版, 渲静帧 } from './渲.ts';
import { 备好母版 } from './转存.ts';
import { 测速 } from './测速.ts';
import { 查所选段cues, 渲前跑cues } from '../段框架/自动.ts';
import { 全部段 } from '../清单/清单.ts';
import { 补段签 } from '../段签/补.ts';
import { 懒放行闸 } from '../闸/闸.ts';

const 取级别 = (v: string | undefined): 渲染级别 => {
  const 级别 = (v ?? '视频') as 渲染级别;
  if (!渲染级别取值.includes(级别)) throw new 用法错误(`--级别 只能是 ${渲染级别取值.join('、')}`);
  return 级别;
};

/** 母版压成给人看的 mp4（压法照旧项目 渲染带音频.py：视频级 x264 slower CRF 32，预览级 veryfast CRF 23，AAC 192k） */
export const 压成mp4 = (母版: string, 出: string, 级别: 渲染级别) =>
  跑(
    低优先级([
      配置('ffmpeg'), '-v', 'error', '-y', '-i', 母版,
      '-c:v', 'libx264', '-preset', 级别 === '预览' ? 'veryfast' : 'slower', '-crf', 级别 === '预览' ? '23' : '32',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 出,
    ]),
  );

export const 渲染命令: Record<string, 命令> = {
  render: {
    用法: 'render <选择器…> [--级别 视频|预览] [--重渲] [--不叠层|--只叠层] [--到预览 <主题>]；render [<选择器…>] --只派生 [--重做] [--级别 …]',
    说明: '渲母版到 cache/母版/<段键>/<指纹>.crf12.mkv、段声明的透明叠层到 cache/叠层/（指纹对得上就跳过），渲完从 CRF1 派生段签（段签/）、转存 CRF12、删同段同级别的旧母版（钉着的、近 2 小时用过的、别的检出用过的不删，worktree 里不删）；可再压一份母版进预览。--只派生 不渲，从现有当前指纹的 CRF1 母版补段签',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--级别', '--到预览'], 开关: ['--重渲', '--不叠层', '--只叠层', '--只派生', '--重做'] });
      if (p.开关.has('--只派生')) {
        const 别的 = ['--重渲', '--不叠层', '--只叠层'].filter((k) => p.开关.has(k));
        if (别的.length || p.值['--到预览']) throw new 用法错误(`--只派生 不渲，不能和 ${[...别的, ...(p.值['--到预览'] ? ['--到预览'] : [])].join('、')} 一起给`);
        const cues = await 渲前跑cues();
        const 段们 = p.位置.length ? await 选段(p.位置) : await 全部段();
        查所选段cues(cues, 段们);
        await 补段签(段们, p.值['--级别'] ? [取级别(p.值['--级别'])] : 渲染级别取值, { 重做: p.开关.has('--重做'), 记录, 等放行: 懒放行闸() });
        return;
      }
      if (p.开关.has('--重做')) throw new 用法错误('--重做 只和 --只派生 一起用');
      if (!p.位置.length) throw new 用法错误('要给选择器（段键、段名、编号、场键、章）');
      if (p.开关.has('--不叠层') && p.开关.has('--只叠层')) throw new 用法错误('--不叠层 和 --只叠层 只能给一个');
      const 级别 = 取级别(p.值['--级别']);
      // 段框架的段：生成的声音表、地址表先和 cue 对齐（要在 选段 之前：表过期时 段.ts 加载就抛错）
      const cues = await 渲前跑cues();
      const 段们 = await 选段(p.位置);
      查所选段cues(cues, 段们);
      if (!p.开关.has('--不叠层')) await 渲染叠层(段们, 级别, { 重渲: p.开关.has('--重渲'), 记录 });
      if (p.开关.has('--只叠层')) return;
      const 结果 = await 渲染母版(段们, 级别, { 重渲: p.开关.has('--重渲'), 记录 });
      if (p.值['--到预览']) {
        const dir = 新建预览目录(p.值['--到预览']);
        for (const r of 结果) {
          const 出 = path.join(dir, `${r.段.编号 ? r.段.编号 + ' ' : ''}${r.段.键}${级别 === '预览' ? '-预览' : ''}.mp4`);
          // 只有 CRF1 的旧母版先转存，和 film 读同一份画面
          await 压成mp4((await 备好母版(r.段.键, r.指纹.指纹, 级别, { 记录 })) ?? r.母版, 出, 级别);
          记录.产物.push(出);
        }
        console.log(`预览在 ${dir}`);
      }
    },
  },
  still: {
    用法: 'still <段> <帧…> --到预览 <主题> [--级别 视频|预览]',
    说明: '渲几帧静帧（PNG）进预览',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--级别', '--到预览'] });
      const [选择器, ...帧] = p.位置;
      if (!选择器 || !帧.length || !p.值['--到预览']) throw new 用法错误('要 anim still <段> <帧…> --到预览 <主题>');
      const cues = await 渲前跑cues();
      const 段们 = await 选段([选择器]);
      if (段们.length !== 1) throw new 用法错误(`still 一次只渲一段，「${选择器}」对上了 ${段们.length} 段`);
      查所选段cues(cues, 段们);
      const 帧们 = 帧.map((f) => {
        if (!/^\d+$/.test(f)) throw new 用法错误(`帧号要是非负整数：${f}`);
        return Number(f);
      });
      const dir = 新建预览目录(p.值['--到预览']);
      const 出 = await 渲静帧(段们[0]!, 帧们, 取级别(p.值['--级别']), dir, 记录);
      记录.产物.push(...出);
      console.log(`静帧在 ${dir}`);
    },
  },
  bench: {
    用法: 'bench <段> [--帧 <起>-<止>] [--级别 视频|预览] [--次 <n>] [--详细] [--输出 <json>] [--关共享内存] [--浏览器 <chrome-headless-shell>]',
    说明: '测速：照母版参数渲一段帧（默认前 100 帧），按打包、开浏览器、首帧、出帧、收尾计时，不写缓存（docs/渲染性能.md）',
    跑: async (args) => {
      const p = 解析参数(args, { 值: ['--帧', '--级别', '--次', '--输出', '--浏览器'], 开关: ['--详细', '--关共享内存'] });
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
        关共享内存: p.开关.has('--关共享内存'), 浏览器: p.值['--浏览器'],
        日志: 详细 ? (输出 ? 输出.replace(/\.json$/, '') : path.join(os.tmpdir(), `mc-anim-测速-${process.pid}`)) + '.log' : undefined,
      });
      const text = JSON.stringify(r, null, 2);
      console.log(text);
      if (输出) fs.writeFileSync(输出, text + '\n', 'utf8');
    },
  },
};
