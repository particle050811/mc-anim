// anim env：列出每项配置的值和来源；anim doctor：查本机能不能跑（必需项不过就退出码 1，可选项只提示）；anim wt new：开 worktree（做法在 开worktree.ts）。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { readAssetRegistry } from '../资产/资产表.ts';
import { bytesPath, readAssetLock } from '../资产/资产锁.ts';
import { readReleaseLock, missingAttachmentCount } from '../分发/发布锁.ts';
import { allConfig, config, dataPath } from './配置.ts';
import { codeRoot, mainCheckout } from './路径.ts';
import { currentWork, listWorks } from './作品.ts';
import { readMemory, readingNote } from './资源.ts';
import { expectedVersion, browserLocation } from '../渲/浏览器.ts';
import { tryRun } from './子进程.ts';
import { installDeps, openWorktree } from './开worktree.ts';

type CheckResult = { items: string; 过: boolean; required: boolean; note: string };

const isWritable = (dir: string) => {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const installedVersion = (pkg: string): string | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(codeRoot(), 'node_modules', pkg, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
};

export const healthCheck = (): CheckResult[] => {
  const r: CheckResult[] = [];
  const addCheck = (checkItem: string, ok: boolean, note: string, required = true) => r.push({ items: checkItem, 过: ok, required, note: note });

  const wantedNode = fs.readFileSync(path.join(codeRoot(), '.nvmrc'), 'utf8').trim();
  addCheck('Node', process.versions.node.split('.')[0] === wantedNode, `${process.version}（.nvmrc 要 ${wantedNode}）`);

  const pkg = JSON.parse(fs.readFileSync(path.join(codeRoot(), 'package.json'), 'utf8'));
  const pinned = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>).filter(([, v]) => /^\d/.test(v));
  const mismatches = pinned.filter(([k, v]) => installedVersion(k) !== v).map(([k, v]) => `${k} 要 ${v}、装的是 ${installedVersion(k) ?? '没装'}`);
  addCheck('依赖', mismatches.length === 0, mismatches.length ? `${mismatches.join('；')}（跑 pnpm install --frozen-lockfile）` : `${pinned.length} 个锁死版本都对`);
  // pnpm 版本照 package.json 的 packageManager（用户 11-06 定换 pnpm）；corepack enable 后会自动用这一版
  const wantedPnpm = String(pkg.packageManager ?? '').replace(/^pnpm@/, '');
  const havePnpm = tryRun(['pnpm', '--version']);
  addCheck('pnpm', havePnpm.exitCode === 0 && havePnpm.stdout.trim() === wantedPnpm, havePnpm.exitCode === 0 ? `${havePnpm.stdout.trim()}（要 ${wantedPnpm}）` : `没装（要 ${wantedPnpm}：corepack enable，或 npm i -g pnpm@${wantedPnpm}）`);

  for (const tool of ['ffmpeg', 'ffprobe'] as const) {
    const v = tryRun([config(tool), '-version']);
    addCheck(tool, v.exitCode === 0, v.exitCode === 0 ? v.stdout.split('\n')[0]! : `跑不起来：${config(tool)}（装上或设 ANIM_${tool.toUpperCase()}）`);
  }
  const encoderTable = tryRun([config('ffmpeg'), '-hide_banner', '-encoders']).stdout;
  const hasEncoder = (encoderName: string) => new RegExp(`\\s${encoderName}\\s`).test(encoderTable);
  // 切片由 Remotion 自带的 ffmpeg 压，film 只接不重压；本机 ffmpeg 只有分享版要编码器
  addCheck('libsvtav1', hasEncoder('libsvtav1'), hasEncoder('libsvtav1') ? 'anim film --share 用' : 'libsvtav1 不在 ffmpeg 里（anim film --share 要它，换带 libsvtav1 的 ffmpeg）');

  for (const [k, expected] of [['core.quotepath', 'false'], ['core.longpaths', 'true']] as const) {
    const v = tryRun(['git', '-C', codeRoot(), 'config', '--get', k]).stdout.trim();
    addCheck(`git ${k}`, v === expected, v === expected ? v : `是「${v || '没设'}」，要 ${expected}（git config ${k} ${expected}）`);
  }

  const uv = tryRun(['uv', '--version']);
  addCheck('uv', uv.exitCode === 0, uv.exitCode === 0 ? uv.stdout.trim() : '没装（Python 叶子工具要用；见 https://docs.astral.sh/uv/）', false);

  // 子目录不在只提示：用到时各处自己建（从 GitHub 拉下来的新机器上，交付、基线、archive 渲之前都不在，用户 11-13 要照文档能一路走通）
  for (const subdir of ['store', '私有', 'terrain', 'cache', '交付', 'run', '基线', 'archive']) {
    const d = dataPath(subdir);
    if (fs.existsSync(d)) addCheck(`数据根/${subdir}`, isWritable(d), isWritable(d) ? d : `${d} 不可写`);
    else addCheck(`数据根/${subdir}`, false, `${d} 还不在（用到时自动建；要换位置设 ANIM_DATA）`, false);
  }
  const lockDir = config('锁目录');
  addCheck('锁目录', fs.existsSync(lockDir) && isWritable(lockDir), fs.existsSync(lockDir) ? lockDir : `${lockDir} 不在（第一次拿锁时会建）`, false);
  addCheck('游戏环境', fs.existsSync(config('游戏')), config('游戏'), false);
  try {
    const workRoots = listWorks();
    const work = currentWork();
    addCheck('作品', true, `${[...workRoots].map(([name, workRoot]) => `${name}（${path.relative(codeRoot(), workRoot) || '.'}）`).join('、')}；现在选的是 ${work.name}`);
  } catch (e) {
    addCheck('作品', false, (e as Error).message, false);
  }

  // 能不能渲看各作品的发布锁（段 = 全部，段要的字节、地形包都在里面）；共用资产锁里还有没段用到的参考图、旧版，Release 不发，缺了不算错
  let hasReleaseLock = false;
  try {
    for (const [name, workRoot] of listWorks()) {
      const releaseLock = readReleaseLock(workRoot);
      if (!releaseLock) continue;
      hasReleaseLock = true;
      const missing = releaseLock.attachments.filter((a) => missingAttachmentCount(a, dataPath()) > 0);
      addCheck(`素材·${name}`, missing.length === 0, missing.length ? `Release ${releaseLock.label} 的 ${releaseLock.attachments.length} 个附件里有 ${missing.length} 个还没下（anim --work ${name} assets pull）` : `Release ${releaseLock.label} 的 ${releaseLock.attachments.length} 个附件都在数据根`, false);
    }
  } catch {
    // 作品目录有问题上面「作品」一项已经报了
  }
  const assetLock = readAssetLock();
  const missingBytes = Object.entries(assetLock).filter(([, e]) => !fs.existsSync(bytesPath(e))).map(([id]) => id);
  addCheck(
    '资产字节',
    missingBytes.length === 0,
    missingBytes.length ? `共用资产锁有 ${missingBytes.length} 件不在数据根：${missingBytes.slice(0, 5).join('、')}${missingBytes.length > 5 ? '…' : ''}${hasReleaseLock ? '（没有段用到的参考图、旧版也算在里面；能不能渲看上面的「素材·<作品>」）' : ''}` : `资产锁 ${Object.keys(assetLock).length} 件都在`,
    !hasReleaseLock,
  );
  const assetTable = readAssetRegistry();
  const unregistered = Object.keys(assetLock).filter((id) => !assetTable.entryMap.has(id));
  addCheck('资产表', assetTable.issues.length === 0 && unregistered.length === 0, [...assetTable.issues.slice(0, 5), ...(unregistered.length ? [`资产锁里有 ${unregistered.length} 件资产表没登记：${unregistered.slice(0, 5).join('、')}`] : [])].join('；') || `${assetTable.entryMap.size} 条`);

  const browser = browserLocation();
  addCheck('渲染浏览器', fs.existsSync(browser.exePath), fs.existsSync(browser.exePath) ? browser.目录 : `数据根还没有 ${expectedVersion()}（第一次渲染时补：从 node_modules/.remotion 克隆，没有就从国内镜像或 Remotion 下载）`, false);

  const m = readMemory();
  addCheck('内存读数', m !== null, m ? readingNote(m) : '读不到（资源闸不等内存，直接放行）', false);
  return r;
};

export const envCommands: Record<string, Command> = {
  env: {
    usage: 'env',
    note: '列出本机配置的值和来源（环境变量 > anim.local.toml > 默认）',
    noRecord: true,
    跑: async (args) => {
      parseArgs(args, {});
      const { value: values, localFile } = allConfig();
      console.log(`代码根：${codeRoot()}\n主检出：${mainCheckout()}\n本地配置：${localFile ?? '（没有 anim.local.toml）'}\n`);
      for (const [configKey, v] of Object.entries(values)) console.log(`${configKey}：${v.value}\n    取自${v.source}；环境变量 ${v.变量}，anim.local.toml 键 ${v.key}。${v.note}`);
    },
  },
  doctor: {
    usage: 'doctor',
    note: '体检：Node、依赖版本、ffmpeg、编码器、git 设置、数据根、资产字节',
    跑: async (args, runRecord) => {
      parseArgs(args, {});
      const r = healthCheck();
      for (const x of r) console.log(`${x.过 ? '✓' : x.required ? '✗' : '!'} ${x.items}：${x.note}`);
      const failed = r.filter((x) => !x.过 && x.required);
      for (const x of r.filter((x) => !x.过)) runRecord.log(x.required ? '错误' : '警告', `${x.items}：${x.note}`);
      console.log(failed.length ? `\n${failed.length} 项必需的没过` : '\n必需项全过');
      return failed.length ? 1 : 0;
    },
  },
};

export const worktreeCommands: Record<string, Command> = {
  wt: {
    usage: 'wt new <名> [--from <分支>]',
    note: '开 worktree（../mc-anim-wt/<名>，新分支 <名>，默认从 main）并备好依赖：pnpm install --frozen-lockfile（从全机共用的 store 克隆或硬链接，几秒）；不进 Git 的 .claude/skills 复制过去。并行任务、子 Agent 开 worktree 都用它',
    跑: async (args) => {
      const p = parseArgs(args, { value: ['--from'] });
      if (p.位置[0] !== 'new' || p.位置.length !== 2) throw new UsageError('用法：anim wt new <名> [--from <分支>]');
      const r = await openWorktree(p.位置[1]!, p.value['--from'] ?? 'main');
      console.log(`${r.target}\n依赖：${installDeps.join(' ')}${r.carried.length ? `；带过去：${r.carried.join('、')}` : ''}`);
    },
  },
};
