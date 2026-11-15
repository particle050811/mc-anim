// anim assets add <id> <文件>：把一件已在资产表登记的资产按 sha 放进 store/（私有的进 私有/），写进登记它那一侧的资产锁：
// 共用表 assets/registry/ 登记的写 assets/资产锁/，作品资产表 <作品根>/资产表/ 登记的写 <作品根>/资产锁/（作品按 --work 选）。
// 从旧项目批量导入走 M2 的导入工具；这里只管单件（自制的、新生成的）。
// anim assets vendor [--check]：照 <作品根>/随仓库.toml 重写 <作品根>/字节/（随仓库发的字节，资产/随仓库.ts）；anim assets seed：把 字节/ 补进数据根 store/。
// anim assets measure [--check]：早先入库的音频条目补 时长/峰值/响度（资产/补量.ts）。
// anim assets pack [--upload]：照 <作品根>/随发布.toml 打挂 GitHub Release 发的附件、写 发布锁.json；anim assets pull：按发布锁下载进数据根（资产/发布.ts）。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { listWorks, workName, workRoot } from '../环境/作品.ts';
import { passGate } from '../闸/闸.ts';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { dataRoot } from '../环境/配置.ts';
import { CheckContext } from '../检查/上下文.ts';
import { uploadRelease, packRelease, pullRelease, readReleaseManifest, releaseTableName } from './发布.ts';
import { writeReleaseLock, readReleaseLock, releaseLockName } from './发布锁.ts';
import { fillBytes, writeRepoBundle, computeRepoBundle, readRepoManifest, repoTableName, bytesDir } from './随仓库.ts';
import { libName, readAssetRegistryBoth } from './资产表.ts';
import { workResourcePackTablePath, workResourcePackSelections, workAssetLockPath, importToStore, writeAssetLock, assetLockPath, readResourcePackSelection, readAssetLock, type LockEntry } from './资产锁.ts';
import { withAudioMetadata } from './音频量.ts';
import { buildResourcePackOverride } from './材质包.ts';
import { fillAudioMetadata } from './补量.ts';

/** 量音频：音频文件顺手量时长、峰值、响度写进锁（默认量，false 不量） */
export type IngestOptions = { workRoot: string; replace?: boolean; sharedTableDir?: string; sharedLockPath?: string; dataRoot?: string; measureAudio?: boolean };

/** 一件资产入库、写锁；返回锁条目、写的是哪份锁、有没有从另一份锁挪过来 */
export const registerAsset = (id: string, file: string, o: IngestOptions): { entry: LockEntry; lockFile: string; movedFrom?: string } => {
  const { entryMap: entries, duplicates } = readAssetRegistryBoth(o.workRoot, o.sharedTableDir);
  const e = entries.get(id);
  if (!e) throw new Error(`资产表里没有「${id}」，先在 assets/registry/<类>.toml（各作品共用）或 <作品根>/资产表/<类>.toml（只有这部作品用）里写好 id、类别、来源、许可、可见性`);
  if (duplicates.some((x) => x.id === id)) throw new Error(`「${id}」在共用表和作品资产表里都登记了，删掉一侧再入库`);
  if (!fs.statSync(file).isFile()) throw new Error(`${file} 不是文件`);
  const sharedLockPath = o.sharedLockPath ?? assetLockPath();
  const [lockFile, otherLockFile] = e.side === '作品' ? [workAssetLockPath(o.workRoot), sharedLockPath] : [sharedLockPath, workAssetLockPath(o.workRoot)];
  const assetLock = readAssetLock(lockFile);
  const otherLock = readAssetLock(otherLockFile);
  const storedBytes = importToStore(path.resolve(file), libName(e.可见性), o.dataRoot);
  const nextEntry = o.measureAudio === false ? storedBytes : withAudioMetadata(storedBytes, file);
  const prevEntry = assetLock[id] ?? otherLock[id];
  if (prevEntry && prevEntry.sha256 !== nextEntry.sha256 && !o.replace) {
    throw new Error(`「${id}」资产锁里已有另一份（sha ${prevEntry.sha256.slice(0, 12)}），确实要换成新的加 --replace（旧字节留在库里）`);
  }
  assetLock[id] = nextEntry;
  writeAssetLock(assetLock, lockFile);
  // 登记从一侧挪到另一侧（比如原来共用、改成只给一部作品用）：锁跟着挪，不留两份
  if (!otherLock[id]) return { entry: nextEntry, lockFile };
  delete otherLock[id];
  writeAssetLock(otherLock, otherLockFile);
  return { entry: nextEntry, lockFile, movedFrom: otherLockFile };
};

/** anim assets vendor：照 随仓库.toml 重算集合、重写 字节/；--check 只报要改什么，有改动返回 1 */
const writeBytes = async (checkOnly: boolean, runRecord: Parameters<Command['跑']>[1]) => {
  const workDir = workRoot();
  const repoListPath = path.join(workDir, repoTableName);
  if (!fs.existsSync(repoListPath)) throw new Error(`${relativeToCodeRoot(repoListPath)} 不存在：这部作品没定随仓库发哪些段的字节（写 "段" = ["<段键或章>", …]）`);
  if (path.relative(path.join(codeRoot(), '作品', workName()), workDir) !== '') throw new Error(`${workName()} 不在 作品/ 下，随仓库发字节只管仓库里的作品`);
  const c = new CheckContext(codeRoot(), { 作品: workName() });
  try {
    const bundleSet = await computeRepoBundle(c, readRepoManifest(fs.readFileSync(repoListPath, 'utf8')).段);
    if (bundleSet.issues.length) throw new Error(`算不出随仓库的集合：\n  ${bundleSet.issues.join('\n  ')}`);
    const r = writeRepoBundle(bundleSet, workDir, dataRoot(), checkOnly);
    const relDir = relativeToCodeRoot(bytesDir(workDir));
    console.log(`${bundleSet.segKeys.length} 段要 ${r.fileCount} 件字节（${(r.大小 / 1e6).toFixed(1)} MB）；私有不带 ${bundleSet.privateFiles.length} 件${bundleSet.privateFiles.length ? `：${bundleSet.privateFiles.join('、')}` : ''}`);
    const changeCount = r.added.length + r.改.length + r.removed.length;
    if (!changeCount) console.log(`${relDir} 已经一致`);
    else console.log(`${relDir}${checkOnly ? ' 要' : ' '}添 ${r.added.length} 件、重拷 ${r.改.length} 件、删 ${r.removed.length} 件${checkOnly ? '（anim assets vendor 写进去）' : ''}`);
    if (!checkOnly && changeCount) runRecord.产物.push(bytesDir(workDir));
    return checkOnly && changeCount ? 1 : 0;
  } finally {
    c.finalize();
  }
};

/** anim assets pack：照 随发布.toml 打附件、写发布锁；--upload 建 Release、传附件 */
const runPackRelease = async (upload: boolean, runRecord: Parameters<Command['跑']>[1]) => {
  const workDir = workRoot();
  const tableFile = path.join(workDir, releaseTableName);
  if (!fs.existsSync(tableFile)) throw new Error(`${relativeToCodeRoot(tableFile)} 不存在：这部作品没定挂 Release 发哪些段（写 "仓库"、"标签"、"段"）`);
  const releaseTable = readReleaseManifest(fs.readFileSync(tableFile, 'utf8'));
  const c = new CheckContext(codeRoot(), { 作品: workName() });
  try {
    const { releaseLock, newPacks, expected } = await packRelease(c, releaseTable, workDir, dataRoot());
    writeReleaseLock(releaseLock, workDir);
    runRecord.产物.push(path.join(workDir, releaseLockName), ...newPacks);
    const totalBytes = releaseLock.附件.reduce((s, a) => s + a.大小, 0);
    console.log(`${expected.段数} 段：${expected.字节.length + expected.私有库字节.length} 件字节${expected.私有库字节.length ? `（私有/ 库 ${expected.私有库字节.length} 件）` : ''}、${expected.地形.length} 个地形包，${releaseLock.附件.length} 个附件共 ${(totalBytes / 1e9).toFixed(2)} GB；新打 ${newPacks.length} 个${expected.privateFiles.length ? `；私有不发 ${expected.privateFiles.length} 件：${expected.privateFiles.join('、')}` : ''}`);
    console.log(`写了 ${relativeToCodeRoot(path.join(workDir, releaseLockName))}`);
    if (upload) await uploadRelease(releaseLock, dataRoot());
    else if (newPacks.length) console.log(`传上去：anim assets pack --upload（要 gh 登录），或手动 gh release upload ${releaseLock.标签} <cache/发布/ 里的附件> --repo ${releaseLock.仓库}。传之前别 push：发布锁写的附件 Release 上还没有，别的机器 anim assets pull 拿不到`);
  } finally {
    c.finalize();
  }
};

/** anim assets measure：共用锁和每部作品的锁里，没量过的音频条目量了补上；--check 只报，有能补的返回 1；有量不出的也返回 1 */
const fillMeasure = async (checkOnly: boolean, runRecord: Parameters<Command['跑']>[1]) => {
  const lockFiles = [assetLockPath(), ...[...listWorks().values()].map(workAssetLockPath).filter((f) => fs.existsSync(f))];
  const run = async () => {
    let filled = 0;
    let unmeasuredCount = 0;
    for (const lockFile of lockFiles) {
      const relPath = relativeToCodeRoot(lockFile);
      const r = fillAudioMetadata(readAssetLock(lockFile), {
        dataRoot: dataRoot(),
        checkOnly,
        进度: (i, n) => {
          if (i % 100 === 0 || i === n) console.error(`  ${relPath}：量到 ${i}/${n}`);
        },
      });
      filled += r.missing.length - r.noBytes.length;
      console.log(`${relPath}：音频 ${r.音频} 件，缺数 ${r.missing.length} 件${r.noBytes.length ? `，字节不在本机跳过 ${r.noBytes.length} 件` : ''}${checkOnly ? '' : `，补了 ${r.patched.length} 件`}`);
      unmeasuredCount += r.unmeasured.length;
      for (const x of r.unmeasured) console.log(`  量不出 ${x.id}：${x.原因}`);
      if (r.stillMissing.length) console.log(`  量完还缺字段 ${r.stillMissing.length} 件（静音没有峰值、太短没有积分响度）：${r.stillMissing.slice(0, 10).map((x) => `${x.id}（${x.missingFields.join('、')}）`).join('、')}${r.stillMissing.length > 10 ? ' …' : ''}`);
      if (!checkOnly && r.patched.length) {
        writeAssetLock(r.assetLock, lockFile);
        runRecord.产物.push(lockFile);
      }
    }
    if (checkOnly && filled) console.log(`能补 ${filled} 件：anim assets measure`);
    // 量不出的（字节坏了、ffmpeg 解不开）补了别的照样写锁，但退出码 1，别让批处理当成全补齐了
    return (checkOnly && filled) || unmeasuredCount ? 1 : 0;
  };
  // 一千来件挨个解码，重任务过放行闸；只查不解码
  return checkOnly ? run() : passGate(run);
};

export const assetCommands: Record<string, Command> = {
  assets: {
    用法: 'assets add <id> <文件> [--replace] | assets measure [--check] | assets vendor [--check] | assets seed | assets pack [--upload] | assets pull | assets packs',
    说明: 'add：一件资产入库（按 sha 放进 store/ 或 私有/），写进登记它那一侧的资产锁；measure：共用锁和各作品锁里早先入库的音频条目补 时长、峰值、响度（只加缺的字段，sha 不动；字节不在本机的跳过），--check 只报；vendor：照作品的 随仓库.toml 重写随仓库发的 字节/；seed：把 字节/ 补进数据根 store/（film、still、studio 开头会自动做）；pack：照作品的 随发布.toml 打挂 GitHub Release 发的附件、写 发布锁.json，--upload 传上去；pull：按 发布锁.json 下载、核 sha、解进数据根；材质包：按作品选用的材质包（<作品根>/材质包.toml 的 "包"、"封顶"，[段] 小节里按段另选的各建一份；试样用环境变量 ANIM_PACKS=<名,名…>、ANIM_PACKS_RES=16 顶掉）建覆盖层锁，包本身先登记成资产 材质包/<名>',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--replace', '--check', '--upload'] });
      const [subcommand, id, file] = p.位置;
      if (subcommand === 'measure' && p.位置.length === 1 && [...p.toggles].every((k) => k === '--check')) return fillMeasure(p.toggles.has('--check'), runRecord);
      if (subcommand === 'vendor' && p.位置.length === 1 && !p.toggles.has('--replace')) return writeBytes(p.toggles.has('--check'), runRecord);
      if (subcommand === 'pack' && p.位置.length === 1 && [...p.toggles].every((k) => k === '--upload')) return runPackRelease(p.toggles.has('--upload'), runRecord);
      if (subcommand === 'pull' && p.位置.length === 1 && !p.toggles.size) {
        const releaseLock = readReleaseLock(workRoot());
        if (!releaseLock) throw new Error(`${workName()} 没有 ${releaseLockName}：这部作品没有挂 Release 发的字节`);
        await pullRelease(releaseLock, dataRoot());
        return;
      }
      if (subcommand === 'packs' && p.位置.length === 1 && !p.toggles.size) {
        // 试样（环境变量）只建那一份；不然 材质包.toml 里的每一种选用（"包" 和 [段] 另选的）各建一份
        const selections = readResourcePackSelection(workRoot()).source === '环境' ? [readResourcePackSelection(workRoot())] : workResourcePackSelections(workRoot());
        if (!selections.length) throw new Error(`这部作品没选用材质包：在 ${relativeToCodeRoot(workResourcePackTablePath(workRoot()))} 写 "包" = ["材质包/<名>"]（或 [段] 里给某段选），或试样时前面带 ANIM_PACKS=<名>`);
        for (const packSelection of selections) {
          const r = buildResourcePackOverride(workRoot(), packSelection);
          const report = r.resourcePackLock.报告 as { 分辨率: { 规则: string; 方块图集格: number }; 方块图集: { 换: number; 共: number; 包里没有: number; 不合: number }; 单张: { 共: number; 换: number; 包里没有: number; 包里没有但同组放大: string[]; 不合: { id: string; 原因: string }[] }; 缩放: Record<string, number>; 各包贡献: Record<string, number>; 群系色: { 改: number } | null; 警告: string[] };
          console.log(`选用（${r.选.source}，上面的盖下面的）：${r.packs.map((p) => `${p.id}（${p.许可}，${p.可见性}）`).join(' > ')} > 原版`);
          console.log(`分辨率：${report.分辨率.规则}；方块图集一格 ${report.分辨率.方块图集格} 像素`);
          console.log(`方块图集换了 ${report.方块图集.换}/${report.方块图集.共} 格（包里没有 ${report.方块图集.包里没有}，尺寸不合 ${report.方块图集.不合}）；照搬的单张贴图 ${report.单张.共} 件，换了 ${report.单张.换} 件，包里没有 ${report.单张.包里没有} 件（其中 ${report.单张.包里没有但同组放大.length} 件跟同组放大）`);
          for (const x of report.单张.不合) console.log(`  不合 ${x.id}：${x.原因}`);
          console.log(`缩放：${Object.entries(report.缩放).map(([k, n]) => `${k} ${n}`).join('、')}；各包贡献：${Object.entries(report.各包贡献).map(([k, n]) => `${k} ${n}`).join('、')}`);
          console.log(report.群系色 ? `群系色：按包的 colormap 改了 ${report.群系色.改} 处` : '群系色：包里没有 colormap，照原版');
          for (const w of report.警告) console.log(`  !! ${w}`);
          console.log(`覆盖层 ${Object.keys(r.resourcePackLock.覆盖).length} 件，写了 ${relativeToCodeRoot(r.lockFile)}`);
          runRecord.产物.push(r.lockFile);
        }
        return 0;
      }
      if (subcommand === 'seed' && p.位置.length === 1 && !p.toggles.size) {
        const r = fillBytes(workRoot(), dataRoot());
        console.log(`${relativeToCodeRoot(bytesDir(workRoot()))}：${r.共} 件，补进 ${path.join(dataRoot(), 'store')} ${r.copied} 件（其余已有）`);
        return;
      }
      if (subcommand !== 'add' || !id || !file || p.位置.length !== 3 || p.toggles.has('--check')) throw new UsageError('要 anim assets add <id> <文件> [--replace]、anim assets measure [--check]、anim assets vendor [--check]、anim assets seed、anim assets pack [--upload] 或 anim assets pull');
      const { entry: entry, lockFile, movedFrom } = registerAsset(id, file, { workRoot: workRoot(), replace: p.toggles.has('--replace') });
      runRecord.产物.push(`${id} → ${entry.库}/${entry.sha256}`);
      const meterText = entry.时长 !== undefined ? `，${entry.时长} 秒、峰值 ${entry.峰值 ?? '-inf'} dBFS、响度 ${entry.响度 ?? '?'} LUFS` : '';
      console.log(`${id}：${entry.库}/${entry.sha256.slice(0, 2)}/${entry.sha256}（${entry.大小} 字节，${entry.后缀}${meterText}）→ ${relativeToCodeRoot(lockFile)}`);
      if (movedFrom) console.log(`  从 ${relativeToCodeRoot(movedFrom)} 挪过来（登记换了一侧）`);
    },
  },
};
