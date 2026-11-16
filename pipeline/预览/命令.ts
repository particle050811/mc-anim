import { createRequire } from 'node:module';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { missingRegistryDirs, missingDirHint } from '../段框架/注册目录.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { runForeground } from '../环境/子进程.ts';
import { newPreviewDir } from './预览.ts';
import { cleanupSummary, planDefaultCleanup, executeCleanup, previewKeepDays } from './清理.ts';
import { dataRoot } from '../环境/配置.ts';
import { loadAllSegments } from '../清单/清单.ts';
import { readWorkAssetLock } from '../资产/资产锁.ts';
import { fillBytesAndReport } from '../分发/随仓库.ts';
import { preparePrivateMusic, missingMusicHint } from '../资产/私有配乐.ts';
import { runCuesBeforeRender } from '../段框架/自动.ts';
import { fullTableEnv } from '../渲/地形注入.ts';

/** Remotion CLI 的 js 入口：用 node 直接跑，不经 npx（Windows 上 npx 是 .cmd） */
const remotionEntry = () => {
  const pkgJsonPath = createRequire(path.join(codeRoot(), 'package.json')).resolve('@remotion/cli/package.json');
  return path.join(path.dirname(pkgJsonPath), 'remotion-cli.js');
};

export const previewCommands: Record<string, Command> = {
  preview: {
    用法: `preview new <主题> | preview clean [--apply] [--days ${previewKeepDays}]`,
    说明:
      'new：在主检出的 预览/ 下建 <UTC 月日-时分>-<主题>/，打印路径；主题以「工作-」开头的是中间稿，建在数据根 run/草稿/ 下。每次 new 先顺手清理一遍。' +
      'clean：预览里超过天数的夹只留文字（说明、表格）挪进数据根 archive/预览/，图、视频、声音删掉，Git 管的文件按路径引用的照留；archive/预览/ 里的只留文字；草稿删按日期起名、超过 cache gc 草稿天数的。默认只打印',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--apply'], 值: ['--days'] });
      if (p.位置[0] === 'clean' && p.位置.length === 1) {
        const days = p.值['--days'] === undefined ? previewKeepDays : Number(p.值['--days']);
        if (!Number.isFinite(days) || days < 0) throw new UsageError('--days 要非负的数');
        const { plan, drafts } = planDefaultCleanup(Date.now(), days);
        for (const x of plan) console.log(`${x.archiveTo ? '归档' : '瘦身'}  ${x.名}：留 ${x.留.length} 个文字，删 ${x.removed.length} 个（${(x.removed.reduce((n, f) => n + f.大小, 0) / 1024 / 1024).toFixed(0)} MB）`);
        for (const d of drafts) console.log(`删草稿  ${d.名}（${(d.大小 / 1024 / 1024).toFixed(0)} MB）`);
        if (!plan.length && !drafts.length) return console.log('没有要清理的');
        if (!p.toggles.has('--apply')) return console.log('只打印了；加 --apply 才动手');
        console.log(cleanupSummary(executeCleanup(plan, drafts)));
        return;
      }
      if (p.位置[0] !== 'new' || p.位置.length !== 2 || p.toggles.size || Object.keys(p.值).length) throw new UsageError('要 anim preview new <主题> 或 anim preview clean [--apply] [--days N]');
      // 清理出错不挡建预览
      try {
        const { plan, drafts } = planDefaultCleanup();
        const summary = cleanupSummary(executeCleanup(plan, drafts));
        if (summary) console.error(`预览清理：${summary}`);
      } catch (e) {
        console.error(`!! 预览清理没做成（预览照建）：${(e as Error).message}`);
      }
      const dir = newPreviewDir(p.位置[1]!);
      runRecord.产物.push(dir);
      console.log(dir);
    },
  },
  studio: {
    用法: 'studio [<remotion studio 的参数…>]',
    说明: '开 Remotion Studio 在浏览器里预览所选作品（入口 <作品根>/index.ts，打包规则读 remotion.config.ts），参数原样转给 remotion studio',
    noRecord: true,
    passThrough: true,
    // remotion.config.ts 在 Remotion CLI 进程里求值，靠 ANIM_WORK 知道是哪部作品（资产锁、求解入口按它取）。
    // 随仓库的字节、私有配乐（缺了换静音）先在这边备好，和 anim film 打包前一样（渲/渲.ts 的 打包）；段框架的段先对齐生成的声音文件（段框架/自动.ts）。
    // 开着 Studio 时改了 段.ts 的声音不会自动重生成，要手跑 anim cues。一个页面看全部段，地形版本传全表（渲/地形注入.ts），登记了新版本要重开
    跑: async (args) => {
      const workDir = workRoot();
      const missingDirs = missingRegistryDirs(workDir);
      if (missingDirs.length) throw new Error(missingDirs.map((d) => missingDirHint(relativeToCodeRoot(workDir), d)).join('\n'));
      for (const [k, x] of (await runCuesBeforeRender()).failed) console.error(`!! ${k} 的 anim cues 没跑通，Studio 里这段会报错：${x}`);
      fillBytesAndReport(workDir, dataRoot());
      for (const x of preparePrivateMusic(await loadAllSegments(), readWorkAssetLock(workDir), dataRoot())) console.error(`!! ${missingMusicHint(x)}`);
      return runForeground([process.execPath, remotionEntry(), 'studio', relativeToCodeRoot(path.join(workDir, 'index.ts')), ...args], { cwd: codeRoot(), env: { ...process.env, ...fullTableEnv(), ANIM_WORK: workName() } });
    },
  },
};
