// anim film <选择器…> [--名 <名>] [--级别 视频|预览] [--重渲] [--分享版]：唯一的出片路（anim render 用户 11-06 定删掉，决策/0014），
//   选择器同 选段（段键、段名、编号、场键、章、章范围），一段也行；缺的段当场渲，再接成片。
// anim film 补声音 <交付…> | --全部 [--只看]：给旧交付补 全片-未拉响度.flac，补完不再要母版
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 选段 } from '../清单/清单.ts';
import { 渲染级别取值, type 渲染级别 } from '../../engine/段/设置值.ts';
import { 拼成片 } from './拼成片.ts';
import { 补交付, 全部交付 } from './补交付.ts';
import { 找交付目录 } from './交付.ts';
import { 懒放行闸 } from '../闸/闸.ts';
import { 查所选段cues, 渲前跑cues } from '../段框架/自动.ts';
import { 代码根 } from '../环境/路径.ts';
import path from 'node:path';

export const 合成命令: Record<string, 命令> = {
  film: {
    用法: 'film <选择器…> [--名 <名>] [--级别 视频|预览] [--重渲] [--分享版]；film 补声音 <交付…> | --全部 [--只看]',
    说明: '出片的唯一入口。选择器：段键、段名、编号、场键、章、章范围（6-7），一段也行。按清单顺序取各段（缺的当场渲成切片：画面 mp4 已带叠层、字幕、按成片参数压好，声音另出 wav，渲完派生段签、主检出删同段旧切片；--重渲 全部重渲），画面直接接、声音接起来拉响度，出到 交付/<UTC>-<名>/（带 SRT、字幕表、未拉响度的 FLAC、manifest.json）；--分享版 另压一份 1080p60 AV1 约 2.75 Mbps（照 B 站给观众的档，<名>-分享版1080p60.mp4），只在要分享版时加（用户 11-03）；补声音 给旧交付补上不再要母版的文件',
    跑: async (args, 记录) => {
      if (args[0] === '补声音') {
        const q = 解析参数(args.slice(1), { 开关: ['--全部', '--只看'] });
        if (q.开关.has('--全部') === q.位置.length > 0) throw new 用法错误('anim film 补声音 要给交付目录（名字或路径），或 --全部，二选一');
        const dirs = q.开关.has('--全部') ? 全部交付() : q.位置.map(找交付目录);
        return 补交付(dirs, { 只看: q.开关.has('--只看'), 记录, 等放行: 懒放行闸() });
      }
      const p = 解析参数(args, { 值: ['--名', '--级别'], 开关: ['--重渲', '--分享版'] });
      if (!p.位置.length) throw new 用法错误('要给选择器（段键、段名、编号、场键、章、6-7 这样的章范围）');
      const 级别 = (p.值['--级别'] ?? '视频') as 渲染级别;
      if (!渲染级别取值.includes(级别)) throw new 用法错误(`--级别 只能是 ${渲染级别取值.join('、')}`);
      const 名 = p.值['--名'] ?? (p.位置.join('+') + (级别 === '预览' ? '-预览' : ''));
      if (/[<>:"/\\|?*\x00-\x1f]/.test(名)) throw new 用法错误(`--名「${名}」不能当文件夹名`);
      // 段框架的段：生成的声音表、地址表先和 cue 对齐（要在 选段 之前：表过期时 段.ts 加载就抛错）
      const cues = await 渲前跑cues();
      const 段们 = await 选段(p.位置);
      查所选段cues(cues, 段们);
      // 用户 11-06 定：子 Agent 在 worktree 里只出静帧，整段渲染由主 Agent 合并后 --低优先 排；这里只提醒不拦（改渲染管线本身的活要真渲）
      if (代码根().includes(`${path.sep}mc-anim-wt${path.sep}`) && process.env.ANIM_PRIORITY !== 'low')
        console.error('== 提醒：在 worktree 里出片。子 Agent 看效果用 anim still；整段渲染留给主 Agent 合并后用 anim --低优先 film 排（CLAUDE.md 工作纪律）');
      // 段缺的当场渲（每段就是成片的一截，渲/渲段.ts）；--重渲 全部重渲
      await 拼成片(段们, { 级别, 名, 范围: p.位置, 重渲: p.开关.has('--重渲'), 分享版: p.开关.has('--分享版'), 记录 });
    },
  },
};
