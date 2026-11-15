// anim film <选择器…> [--名 <名>] [--级别 视频|预览] [--重渲] [--分享版]：唯一的出片路（anim render 用户 11-06 定删掉，决策/0014），
//   选择器同 选段（段键、段名、编号、场键、章、章范围），一段也行；缺的段当场渲，再接成片。
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { selectSegs } from '../清单/清单.ts';
import { renderLevels, type RenderLevel } from '../../engine/段/设置值.ts';
import { assembleFilm } from './拼成片.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { codeRoot } from '../环境/路径.ts';
import path from 'node:path';

export const composeCommands: Record<string, Command> = {
  film: {
    用法: 'film <选择器…> [--名 <名>] [--级别 视频|预览] [--重渲] [--分享版]',
    说明: '出片的唯一入口。选择器：段键、段名、编号、场键、章、章范围（6-7），一段也行。按清单顺序取各段（缺的当场渲成切片：画面 mp4 已带叠层、字幕、按成片参数压好，声音另出 wav，渲完派生段签、主检出删同段旧切片；--重渲 全部重渲），画面直接接、声音接起来拉响度，出到 交付/<UTC>-<名>/（带 SRT、字幕表、未拉响度的 FLAC、manifest.json）；--分享版 另压一份 1080p60 AV1 约 2.75 Mbps（照 B 站给观众的档，<名>-分享版1080p60.mp4），只在要分享版时加（用户 11-03）',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--名', '--级别'], toggles: ['--重渲', '--分享版'] });
      if (!p.位置.length) throw new UsageError('要给选择器（段键、段名、编号、场键、章、6-7 这样的章范围）');
      const level = (p.值['--级别'] ?? '视频') as RenderLevel;
      if (!renderLevels.includes(level)) throw new UsageError(`--级别 只能是 ${renderLevels.join('、')}`);
      const filmName = p.值['--名'] ?? (p.位置.join('+') + (level === '预览' ? '-预览' : ''));
      if (/[<>:"/\\|?*\x00-\x1f]/.test(filmName)) throw new UsageError(`--名「${filmName}」不能当文件夹名`);
      // 段框架的段：生成的声音表、地址表先和 cue 对齐（要在 选段 之前：表过期时 段.ts 加载就抛错）
      const cues = await runCuesBeforeRender();
      const segments = await selectSegs(p.位置);
      checkSelectedSegCues(cues, segments);
      // 用户 11-06 定：子 Agent 在 worktree 里只出静帧，整段渲染由主 Agent 合并后 --低优先 排；这里只提醒不拦（改渲染管线本身的活要真渲）
      if (codeRoot().includes(`${path.sep}mc-anim-wt${path.sep}`) && process.env.ANIM_PRIORITY !== 'low')
        console.error('== 提醒：在 worktree 里出片。子 Agent 看效果用 anim still；整段渲染留给主 Agent 合并后用 anim --低优先 film 排（CLAUDE.md 工作纪律）');
      // 段缺的当场渲（每段就是成片的一截，渲/渲段.ts）；--重渲 全部重渲
      await assembleFilm(segments, { 级别: level, 名: filmName, 范围: p.位置, rerender: p.toggles.has('--重渲'), 分享版: p.toggles.has('--分享版'), runRecord });
    },
  },
};
