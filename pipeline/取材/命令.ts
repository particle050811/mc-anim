// anim mcai <动作…>：转给 sourcing/mcai/mcai.py（开游戏、编译前过资源闸）。
// anim extract [<名称或组>…|--all] [--print-only|--check [--verify]|--list] [--register] [--new <id>…]：按 sourcing/extract.toml 从游戏和模组 jar 导出资产，产物和资产锁比对、入库；
//   --register 另把锁里没有的产物登记进资产表、写锁（取材/登记.ts）。--new 把锁里还没有的 id 加进产物清单，给按锁反推要导什么的配方（音效）导新件。anim extract --licenses [--write]：资产表里待定的许可按 jar 继承补上（取材/许可.ts）。
//   anim extract --backfill-mesh [--write]：锁里没有配方的场景网格按网格头反填配方，标不重导（取材/网格配方.ts）。
//   anim extract --download [<id>…]：jars.toml 里 根 = 数据 的（官方映射这类本机自取的）下到数据根、核 sha（取材/下载.ts）。
//   anim extract --particle-frames [<命名空间:名>…|--all] [--check]：照粒子定义的 textures 顺序生成帧模块 <作品根>/粒子帧/<命名空间>/<名>.ts（取材/粒子帧.ts）。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { runForeground } from '../环境/子进程.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { readAssetRegistryBoth } from '../资产/资产表.ts';
import { workAssetLockPath, readWorkAssetLock, readAssetLock } from '../资产/资产锁.ts';
import { registerArtifacts, computeLicenseFills, writeLicenseFills } from './登记.ts';
import { passGate, passRenderGate } from '../闸/闸.ts';
import { mcaiCommand, mcaiEnv, needsGate } from './mcai.ts';
import { sourcingDir, readManifest, selectEntries } from './清单.ts';
import { groupMeshes, missingMeshRecipes, fillMeshRecipeText } from './网格配方.ts';
import { download, downloadList } from './下载.ts';
import { generatedFiles, buildSourceTable, particleOfFile, isError, listParticles, computeParticleFrames } from './粒子帧.ts';
import { jarRecordPath, jarPath, extractEntry, attributeNewIds, stagingDir, check, runSteps } from './提取.ts';

export const sourcingCommands: Record<string, Command> = {
  mcai: {
    usage: 'mcai <动作…>',
    passThrough: true,
    note: '取材 mod 的命令行（sourcing/mcai/mcai.py，anim mcai --help 看全部）；game start、build 先过资源闸，开游戏还要等渲染让出',
    跑: async (args, runRecord) => {
      const argv = args.length ? [...args] : ['--help'];
      const runMcai = () => runForeground([...mcaiCommand(), ...argv], { env: mcaiEnv() });
      if (!needsGate(argv)) return runMcai();
      const code = await (argv[0] === 'game' ? passRenderGate(runMcai,undefined,{}, {kind:'mcai game start',needsLoad:true}) : passGate(runMcai,undefined,{}, {kind:'mcai build'}));
      runRecord.log('信息', `mcai ${argv.join(' ')} 退出码 ${code}`);
      return code;
    },
  },
  extract: {
    usage: 'extract [<名称或组>…] [--all] [--print-only | --check [--verify] | --list] [--register] [--new <id>…] | extract --licenses [--write] | extract --backfill-mesh [--write] | extract --download [<id>…] | extract --particle-frames [<命名空间:名>…|--all] [--check]',
    note:
      '按 sourcing/extract.toml 从 jar 导出资产，artifacts sha 和资产锁一样的放进库（PNG 像素一样也算一样），不一样的报出来；--all = 有步骤、不用开游戏、不待迁移的条目；--register 把锁里没有的产物登记进资产表、写锁，许可按 jar 继承（脚本写了产物来源的按件记用到的 jar）；--new <id> 把锁里还没有的 id 加进产物清单（按锁反推的配方如 音效 照它导新件），可写多次；--licenses 列出资产表里能按 jar 补上的待定许可，--write 写回；--backfill-mesh 给锁里没有配方的场景网格按网格头反填配方（标不重导），--write 追加进 extract.toml；--download 把 jars.toml 里 root = 数据 的（官方映射这类不许再分发、本机自取的）按地址下到数据根并核 sha，不给 id 就是全部这一类；--particle-frames 照粒子定义（assets/<命名空间>/particles/<name>.json，已登记成资产）的 textures 顺序生成帧模块 <作品根>/粒子帧/<命名空间>/<name>.ts（定义在共用锁的放 lib/粒子帧/），画面 import 它拿到排好序的 Png[]；不给名字是重生成已有的，--all 是锁里有定义的全部粒子，--check 只比不写',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--all', '--print-only', '--check', '--verify', '--list', '--register', '--licenses', '--write', '--backfill-mesh', '--download', '--particle-frames'], multiValue: ['--new'] });
      const newIds = p.multiValue['--new'] ?? [];
      if (newIds.length && ['--backfill-mesh', '--licenses', '--check', '--list', '--print-only'].some((k) => p.toggles.has(k))) throw new UsageError('--new 只配跑条目（可加 --register）');
      const q = readManifest();
      if (p.toggles.has('--download')) {
        if (p.toggles.size > 1 || newIds.length) throw new UsageError('--download 后面只跟 jars.toml 的 id');
        const items = downloadList(q, p.位置, jarRecordPath);
        // 不点名时，「也认」的位置（比如早先放进游戏目录的）已经有了就不下
        const existsElsewhere = p.位置.length ? [] : items.filter((x) => jarPath(q, x.id) !== x.dest && fs.existsSync(jarPath(q, x.id)));
        for (const x of existsElsewhere) console.log(`已有（在别处）：${x.id} ${jarPath(q, x.id)}`);
        const toExtract = items.filter((x) => !existsElsewhere.includes(x));
        if (!toExtract.length) {
          if (!items.length) console.log('jars.toml 里没有能自动下的（根 = "数据"、写了 下载 和 sha256 的）');
          return 0;
        }
        const r = download(toExtract);
        for (const x of r) console.log(`${x.state}：${x.id} ${x.dest}${x.note ? `（${x.note}）` : ''}`);
        runRecord.artifacts.push(...r.filter((x) => x.state === '下好').map((x) => x.dest));
        return r.some((x) => x.state === '失败') ? 1 : 0;
      }
      if (p.toggles.has('--particle-frames')) {
        if (newIds.length || [...p.toggles].some((k) => !['--particle-frames', '--all', '--check'].includes(k))) throw new UsageError('--particle-frames 只配 <命名空间:名>…、--all、--check');
        const root = workRoot();
        const sides = { 共用: readAssetLock(), 作品: readAssetLock(workAssetLockPath(root)) };
        const sourceTable = buildSourceTable(q, { ...sides.共用, ...sides.作品 });
        const particles = p.toggles.has('--all') ? listParticles(sourceTable) : p.位置.length ? p.位置 : generatedFiles(codeRoot(), root).map(particleOfFile);
        if (!particles.length) throw new UsageError('要给粒子名（如 goety:frost）或 --all；不给就是重生成已有的，现在一个也没有');
        let bad = 0;
        for (const particleName of particles) {
          const r = computeParticleFrames(particleName, sides, sourceTable, codeRoot(), root);
          if (isError(r)) {
            bad++;
            console.log(`✗ ${r.粒子}：${r.错}`);
            continue;
          }
          const prevText = fs.existsSync(r.file) ? fs.readFileSync(r.file, 'utf8') : undefined;
          const changeState = prevText === r.text ? '没变' : prevText === undefined ? '新' : '改';
          if (!p.toggles.has('--check') && changeState !== '没变') {
            fs.mkdirSync(path.dirname(r.file), { recursive: true });
            fs.writeFileSync(r.file, r.text, 'utf8');
            runRecord.artifacts.push(r.file);
          }
          if (changeState !== '没变' && p.toggles.has('--check')) bad++;
          console.log(`${changeState === '没变' ? '✓' : p.toggles.has('--check') ? '✗ 要重生成' : `写（${changeState}）`} ${r.粒子} ${r.frame.length} 帧 → ${relativeToCodeRoot(r.file)}`);
        }
        return bad ? 1 : 0;
      }
      if (p.toggles.has('--backfill-mesh')) {
        if (p.位置.length || [...p.toggles].some((k) => k !== '--backfill-mesh' && k !== '--write')) throw new UsageError('--backfill-mesh 只配 --write');
        const root = workRoot();
        const { grid: meshes, unreadable } = missingMeshRecipes(q, [[readAssetLock(), undefined], [readAssetLock(workAssetLockPath(root)), workName()]], readAssetRegistryBoth(root).entryMap);
        for (const id of unreadable) console.log(`读不到网格头（字节不在库里？先 anim assets pull）：${id}`);
        if (!meshes.length) {
          console.log('锁里的场景网格都有配方');
          return unreadable.length ? 1 : 0;
        }
        const text = fillMeshRecipeText(groupMeshes(meshes, new Set(q.entryMap.keys())));
        if (!p.toggles.has('--write')) {
          console.log(text);
          console.log(`${meshes.length} 块网格没有配方；追加进 sourcing/extract.toml：anim extract --backfill-mesh --write`);
          return 0;
        }
        const f = path.join(sourcingDir(), 'extract.toml');
        fs.appendFileSync(f, text, 'utf8');
        readManifest();
        runRecord.artifacts.push(f);
        console.log(`给 ${meshes.length} 块网格补了配方 → ${relativeToCodeRoot(f)}`);
        return unreadable.length ? 1 : 0;
      }
      if (p.toggles.has('--licenses')) {
        if (p.位置.length || [...p.toggles].some((k) => k !== '--licenses' && k !== '--write')) throw new UsageError('--licenses 只配 --write');
        const r = computeLicenseFills(q, readAssetRegistryBoth(workRoot()).entryMap.values(), (i) => jarPath(q, i));
        const countByLicense = new Map<string, number>();
        for (const x of r.fillable) countByLicense.set(x.license, (countByLicense.get(x.license) ?? 0) + 1);
        console.log(`能按 jar 补上的待定许可 ${r.fillable.length} 件：`);
        for (const [l, n] of [...countByLicense].sort((a, b) => b[1] - a[1])) console.log(`  ${n} 件 → ${l}`);
        const byMissing = new Map<string, string[]>();
        for (const x of r.stillPending) for (const k of x.missing) byMissing.set(k, [...(byMissing.get(k) ?? []), x.e.id]);
        if (r.stillPending.length) console.log(`仍待定 ${r.stillPending.length} 件（jars.toml 里这些定了就能补）：`);
        for (const [k, ids] of [...byMissing].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${ids.length} 件卡在 ${k}（如 ${ids[0]}）`);
        if (!p.toggles.has('--write')) {
          if (r.fillable.length) console.log('写回资产表：anim extract --licenses --write');
          return 0;
        }
        const written = writeLicenseFills(r.fillable, workRoot());
        runRecord.artifacts.push(...written);
        console.log(`改了 ${written.map(relativeToCodeRoot).join('、') || '（没有）'}`);
        return 0;
      }
      if (p.toggles.has('--list')) {
        for (const e of q.entryMap.values()) {
          const statusNote = e.pendingMigration ? '（待迁移）' : e.noReExtract ? '（不重导）' : e.needsGame ? '（要开游戏）' : !e.steps.length ? '（没有自己的步骤）' : '';
          console.log(`${e.displayName}${statusNote}  需要 ${e.requires.join('、') || '无'}`);
        }
        for (const [g, ms] of Object.entries(q.group)) console.log(`组 ${g}：${ms.join('、')}`);
        return 0;
      }
      if (p.toggles.has('--check')) {
        const es = p.位置.length || p.toggles.has('--all') ? selectEntries(q, p.位置, p.toggles.has('--all'), workName()) : [...q.entryMap.values()];
        const { issues, pendingMigration: pendingMigration, noReExtract: noReExtract, otherWork } = check(q, es, p.toggles.has('--verify'));
        for (const x of issues) console.log(x);
        if (pendingMigration.length) console.log(`\n待迁移、跑不了的 ${pendingMigration.length} 条：\n  ${pendingMigration.join('\n  ')}`);
        if (noReExtract.length) console.log(`\n不重导、只查了产物的 ${noReExtract.length} 条：${noReExtract.join('、')}`);
        if (otherWork.length) console.log(`\n属于别的作品、没查的 ${otherWork.length} 条：\n  ${otherWork.join('\n  ')}`);
        console.log(`查了 ${es.length} 条：${issues.length ? `有 ${issues.length} 处缺` : '都齐'}`);
        return issues.length ? 1 : 0;
      }
      if (!p.位置.length && !p.toggles.has('--all')) throw new UsageError('要给条目名、组名或 --all（--list 看有哪些）');
      const es = selectEntries(q, p.位置, p.toggles.has('--all'), workName());
      if (p.toggles.has('--print-only')) {
        for (const e of es) await runSteps(q, e, stagingDir(e.displayName), true).catch((err: Error) => console.log(`（${err.message}）`));
        return 0;
      }
      // 不重导的在进资源闸之前就拒：闸可能要排几分钟队
      const notRun = es.filter((e) => e.noReExtract);
      if (notRun.length) throw new Error(`${notRun.map((e) => `「${e.displayName}」`).join('')}不重导（步骤只是记录）：--print-only 看步骤；真要重导，先删掉配方里的「不重导」`);
      // --new 的 id 分给产物表对得上的条目；哪条都对不上的也在进闸前拒
      const newOwners = new Map(es.map((e) => [e.displayName, attributeNewIds(e, newIds).对.map(([id]) => id)]));
      const unowned = newIds.filter((id) => ![...newOwners.values()].some((xs) => xs.includes(id)));
      if (unowned.length) throw new UsageError(`--new 的 ${unowned.join('、')} 不是所选条目的产物（对不上产物表的哪一项）`);
      if (!es.length) return 0;
      return passGate(async () => {
        let bad = 0;
        const doRegister = p.toggles.has('--register');
        for (const e of es) {
          const { dir, result: r, artifactSources } = await extractEntry(q, e, newOwners.get(e.displayName));
          const summary = `${e.displayName}：${r.consistent.length + r.pixelMatched.length} 件和资产锁一样（新入库 ${r.imported.length}${r.pixelMatched.length ? `，其中 ${r.pixelMatched.length} 件 PNG 字节不同、像素一样，锁里留原来那份` : ''}）`;
          console.log(`${summary}${r.mismatched.length ? `，${r.mismatched.length} 件不一样` : ''}${r.missingFiles.length ? `，缺 ${r.missingFiles.length} 件` : ''}`);
          if (doRegister && r.newArtifacts.length) {
            const g = registerArtifacts(q, e, dir, r.newArtifacts, { workRoot: workRoot(), registered: readAssetRegistryBoth(workRoot()).entryMap, assetLock: readWorkAssetLock(workRoot(), undefined, false), jarPath: (i) => jarPath(q, i), artifactSources });
            console.log(`  登记 ${g.newRegistered.length} 件进 ${g.tableFiles.map(relativeToCodeRoot).join('、') || '（都已登记过）'}，写锁 ${g.lockAdded.length} 件`);
            for (const x of g.stillPending) console.log(`  许可待定：${x.id}（${x.missing.join('；')}）`);
            runRecord.artifacts.push(...g.tableFiles, ...g.lockAdded.map((id) => `入库 ${id}`));
          } else if (r.newArtifacts.length) console.log(`  锁里没有的产物 ${r.newArtifacts.length} 件（加 --register 登记、入库）`);
          for (const x of r.mismatched) console.log(`  不一样：${x.id}（${x.file}）锁 ${x.lockHash.slice(0, 12)}，这次 ${x.新.slice(0, 12)}`);
          for (const x of r.missingFiles) console.log(`  缺：${x.id}（${x.file}）`);
          for (const x of r.emptyPatterns) console.log(`  资产锁里一个也没有：${x}`);
          if (r.unregistered.length) console.log(`  暂存目录里另有 ${r.unregistered.length} 个没登记成产物的文件（不入库）：${r.unregistered.slice(0, 5).join('、')}${r.unregistered.length > 5 ? '…' : ''}`);
          console.log(`  暂存目录：${dir}`);
          runRecord.artifacts.push(...r.imported.map((id) => `入库 ${id}`));
          runRecord.log(r.mismatched.length || r.missingFiles.length ? '警告' : '信息', summary);
          if (r.mismatched.length || r.missingFiles.length || r.emptyPatterns.length) bad++;
        }
        return bad ? 1 : 0;
      });
    },
  },
};
