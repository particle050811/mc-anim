// sr render <选择器…> [--级别 视频|预览] [--重渲] [--不叠层|--只叠层] [--到预览 <主题>]（段声明的透明叠层默认一起渲）；sr still <段> <帧…> --到预览 <主题> [--级别 …]
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 配置 } from '../环境/配置.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 选段 } from '../清单/清单.ts';
import { 新建预览目录 } from '../预览/预览.ts';
import { 渲染级别取值, type 渲染级别 } from '../../content/设置值.ts';
import { 渲染叠层, 渲染母版, 渲静帧 } from './渲.ts';

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
    用法: 'render <选择器…> [--级别 视频|预览] [--重渲] [--不叠层|--只叠层] [--到预览 <主题>]',
    说明: '渲母版到 cache/母版/<段键>/<指纹>.mkv、段声明的透明叠层到 cache/叠层/（指纹对得上就跳过），可再压一份母版进预览',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 值: ['--级别', '--到预览'], 开关: ['--重渲', '--不叠层', '--只叠层'] });
      if (!p.位置.length) throw new 用法错误('要给选择器（段键、段名、编号、场键、章）');
      if (p.开关.has('--不叠层') && p.开关.has('--只叠层')) throw new 用法错误('--不叠层 和 --只叠层 只能给一个');
      const 级别 = 取级别(p.值['--级别']);
      const 段们 = await 选段(p.位置);
      if (!p.开关.has('--不叠层')) await 渲染叠层(段们, 级别, { 重渲: p.开关.has('--重渲'), 记录 });
      if (p.开关.has('--只叠层')) return;
      const 结果 = await 渲染母版(段们, 级别, { 重渲: p.开关.has('--重渲'), 记录 });
      if (p.值['--到预览']) {
        const dir = 新建预览目录(p.值['--到预览']);
        for (const r of 结果) {
          const 出 = path.join(dir, `${r.段.编号 ? r.段.编号 + ' ' : ''}${r.段.键}${级别 === '预览' ? '-预览' : ''}.mp4`);
          await 压成mp4(r.母版, 出, 级别);
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
      if (!选择器 || !帧.length || !p.值['--到预览']) throw new 用法错误('要 sr still <段> <帧…> --到预览 <主题>');
      const 段们 = await 选段([选择器]);
      if (段们.length !== 1) throw new 用法错误(`still 一次只渲一段，「${选择器}」对上了 ${段们.length} 段`);
      const 帧们 = 帧.map((f) => {
        if (!/^\d+$/.test(f)) throw new 用法错误(`帧号要是非负整数：${f}`);
        return Number(f);
      });
      const dir = 新建预览目录(p.值['--到预览']);
      const 出 = await 渲静帧(段们[0]!, 帧们, 取级别(p.值['--级别']), dir);
      记录.产物.push(...出);
      console.log(`静帧在 ${dir}`);
    },
  },
};
