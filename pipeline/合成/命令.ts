// anim film <选择器…> [--name <名>] [--level 视频|预览] [--rerender] [--share] [--frames a-b]：唯一的出片路（anim render 用户 11-06 定删掉，决策/0014），
//   选择器同 选段（段键、段名、编号、场键、章、章范围），一段也行；缺的段当场渲，再接成片。
// anim film timeline <交付夹|成片 mp4>：给已有成片按当前代码补 <片名>.时间轴.json（出片/时间轴文件.ts），发布夹的 mp4 也行。
//   设了 REMOTION_ANIM_TRIAL 是试看出片（出片/试看.ts，用户 11-17 定）：照切片的编码当场渲、出到 run/草稿/，正式产物一样不碰；--frames 只在这时、只配一段。
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { selectSegs } from '../清单/清单.ts';
import { renderLevels, type RenderLevel } from '../../engine/段/设置值.ts';
import { assembleFilm } from '../出片/拼成片.ts';
import { backfillTimeline } from '../出片/时间轴文件.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { codeRoot } from '../环境/路径.ts';
import { trialActive } from '../渲/地形注入.ts';
import path from 'node:path';

export const composeCommands: Record<string, Command> = {
  film: {
    usage: 'film <选择器…> [--name <名>] [--level 视频|预览] [--rerender] [--share] [--frames <起>-<止>（只在试看）]；film timeline <交付夹|成片 mp4>',
    note: '出片的唯一入口。选择器：段键、段名、编号、场键、章、章范围（6-7），一段也行。按清单顺序取各段（缺的当场渲成切片：画面 mp4 已带叠层、字幕、按成片参数压好，声音另出 wav，渲完派生段签、主检出删同段旧切片；--rerender 全部重渲），画面直接接、声音接起来拉响度，出到 交付/<UTC>-<名>/（带 SRT、字幕表、未拉响度的 FLAC、manifest.json）；--share 另压一份 1080p60 AV1 约 2.75 Mbps（照 B 站给观众的档，<名>-分享版1080p60.mp4），只在要分享版时加（用户 11-03）。试看：shell 里设了 REMOTION_ANIM_TRIAL（engine/core/试看.ts）就把它原样转给页面、「地形」列的包并进地形版本表，各段照切片的编码当场渲（不读也不写切片缓存，不派生段签、不碰认可、不删旧切片），接成的片出到 <数据根>/run/草稿/<UTC>-工作-试看-<名>/，不进 交付/，能直接和成片对比（用户 11-17 定）；--frames 起-止 只出这段的一截（段内输出帧号、闭区间），只在试看、只选一段时能用。正式出片顺手在交付夹写 <名>.时间轴.json（段、镜头、场时间线事件、每一截声音的成片秒，给 image-flow 播放器画时间轴，格式见 docs/时间轴.md）。film timeline <交付夹|成片 mp4>：给已有成片按当前代码补时间轴，写在 mp4 旁边；发布/<作品>/<夹>/ 里的 mp4 按字节在 交付/<作品>/ 找出处；manifest.json 记的代码和当前 HEAD 不同就标 stale: true 并提示',
    跑: async (args, runRecord) => {
      if (args[0] === 'timeline') {
        if (args.length !== 2) throw new UsageError('film timeline <交付夹|成片 mp4>');
        const r = await backfillTimeline(args[1]!);
        for (const n of r.notes) console.log(`== ${n}`);
        const groups = new Set(r.doc.audio.map((x) => x.group).filter(Boolean));
        console.log(`时间轴 ${r.file}：${r.doc.segments.length} 段、${r.doc.shots.length} 镜、${r.doc.markers.length} 个事件、${r.doc.audio.length} 截声音（跨段 ${groups.size} 组，段尾截断 ${r.doc.audio.filter((x) => x.cutAtSegEnd).length} 截）${r.doc.stale ? '，stale' : ''}`);
        return;
      }
      const p = parseArgs(args, { value: ['--name', '--level', '--frames'], toggles: ['--rerender', '--share'] });
      if (!p.位置.length) throw new UsageError('要给选择器（段键、段名、编号、场键、章、6-7 这样的章范围）');
      const level = (p.value['--level'] ?? '视频') as RenderLevel;
      if (!renderLevels.includes(level)) throw new UsageError(`--level 只能是 ${renderLevels.join('、')}`);
      const trial = trialActive();
      const frameRange = p.value['--frames'];
      // 正式切片是整段、成片要接整段，--frames 只给试看
      if (frameRange !== undefined && !trial) throw new UsageError('--frames 只在试看出片时能用（shell 里设了 REMOTION_ANIM_TRIAL）：正式出片按整段出切片、接整段');
      const frameMatch = frameRange === undefined ? null : /^(\d+)-(\d+)$/.exec(frameRange);
      if (frameRange !== undefined && (!frameMatch || Number(frameMatch[1]) > Number(frameMatch[2]))) throw new UsageError(`--frames 写成 <起>-<止>（段内帧号、闭区间）：${frameRange}`);
      const frames = frameMatch ? ([Number(frameMatch[1]), Number(frameMatch[2])] as [number, number]) : undefined;
      if (trial && p.toggles.has('--rerender')) throw new UsageError('试看出片每次都当场渲、不读切片缓存，不用 --rerender');
      const filmName = p.value['--name'] ?? (p.位置.join('+') + (frames ? `-${frames[0]}-${frames[1]}` : '') + (level === '预览' ? '-预览' : ''));
      if (/[<>:"/\\|?*\x00-\x1f]/.test(filmName)) throw new UsageError(`--name「${filmName}」不能当文件夹名`);
      // 段框架的段：生成的声音表、地址表先和 cue 对齐（要在 选段 之前：表过期时 段.ts 加载就抛错）
      const cues = await runCuesBeforeRender();
      const segments = await selectSegs(p.位置);
      checkSelectedSegCues(cues, segments);
      if (frames && segments.length !== 1) throw new UsageError(`--frames 是一段里的帧号，只能选一段：「${p.位置.join(' ')}」对上了 ${segments.length} 段`);
      // 用户 11-06 定：子 Agent 在 worktree 里只出静帧，整段渲染由主 Agent 合并后 --low-priority 排；这里只提醒不拦（改渲染管线本身的活要真渲）
      if (codeRoot().includes(`${path.sep}mc-anim-wt${path.sep}`) && process.env.ANIM_PRIORITY !== 'low')
        console.error('== 提醒：在 worktree 里出片。子 Agent 看效果用 anim still；整段渲染留给主 Agent 合并后用 anim --low-priority film 排（CLAUDE.md 工作纪律）');
      // 段缺的当场渲（每段就是成片的一截，出片/渲段.ts）；--rerender 全部重渲
      await assembleFilm(segments, { level: level, name: filmName, bounds: p.位置, rerender: p.toggles.has('--rerender'), shareVersion: p.toggles.has('--share'), ...(trial ? { trial: { frames } } : {}), runRecord });
    },
  },
};
