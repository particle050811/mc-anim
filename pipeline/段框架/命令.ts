// anim cues：给段框架做的段（段.ts 用 窗口段）生成 声音表.生成.ts、声音地址.生成.ts（生成.ts）；--check 只核对不写。
// anim new work <名> / new seg <段键> --scene <场键>：照模板起一部新作品、一个新段（新作品.ts）。
// 找段不经 清单/清单.ts 的 全部段：那会先执行全部 段.ts，表过期时 放() 直接抛错，正是要靠这条命令修的。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { dataRoot } from '../环境/配置.ts';
import { readWorkAssetLock } from '../资产/资产锁.ts';
import { readLineTable } from '../合成/台词落点.ts';
import type { ManifestEntry } from '../../engine/段/清单条目.ts';
import type { SegmentDef } from '../../engine/段/段定义.ts';
import { isFrameworkSegDir, freshExec, collectExec, checkSeg, generateSeg, type GenerateEnv } from './生成.ts';
import { isFrameworkSeg } from '../../engine/段/窗口段.ts';
import { getAudioMeasure, knownAudioMeasure } from './音频数.ts';
import { newWork, newSegment, type SceneLegacySeg } from './新作品.ts';
import { loadAllSegments } from '../清单/清单.ts';

type WorkManifest = { manifest: readonly ManifestEntry[]; segDir: (segKey: string) => string; segmentName: (t: ManifestEntry) => string; segmentCode: (segKey: string) => string | null };

export const segFrameCommands: Record<string, Command> = {
  cues: {
    usage: 'cues [<段键、段名、编号或章…>] [--check]',
    note: '给段框架的段（段.ts 用 窗口段）照 cue 生成 声音表.生成.ts（时长、峰值，锁里没有的现量）和 声音地址.生成.ts（资产 id → 地址）；--check 只核对不写，对不上退出码 1',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--check'] });
      const root = codeRoot();
      const workDir = workRoot();
      const m = (await import(pathToFileURL(path.join(workDir, '清单.ts')).href)) as WorkManifest;
      const assetLock = readWorkAssetLock(workDir);
      const lineTable = readLineTable(path.join(workDir, '台词.toml'));
      const filmSegments = m.manifest.filter((t) => t.章 !== '核对');
      const segDirOf = (segKey: string) => path.join(workDir, ...m.segDir(segKey).split('/'));
      const matchesEntry = (t: ManifestEntry) => !p.位置.length || p.位置.some((x) => [t.key, m.segmentName(t), m.segmentCode(t.key), String(t.章), `${workName()}/${t.key}`].includes(x));
      // 看不出的在收集模式下执行一遍判断（表过期时 放() 也不抛），老段执行完不是框架段就跳过
      const candidates: ManifestEntry[] = [];
      for (const t of m.manifest.filter(matchesEntry)) {
        const segDir = segDirOf(t.key);
        if (isFrameworkSegDir(segDir)) candidates.push(t);
        else if (fs.existsSync(path.join(segDir, '段.ts'))) {
          try {
            if (isFrameworkSeg((await collectExec(path.join(segDir, '段.ts'), root)).segment)) candidates.push(t);
          } catch {
            // 执行出错的老段由 anim check 的 加载 规则报，这里不管
          }
        }
      }
      if (p.位置.length && !candidates.length) throw new UsageError(`选择器没对上段框架的段：${p.位置.join('、')}（只认段键、段名、编号、章；段.ts 的默认导出要是 窗口段 做的）`);
      let issueCount = 0;
      for (const t of candidates) {
        const segFile = path.join(segDirOf(t.key), '段.ts');
        const i = filmSegments.findIndex((x) => x.key === t.key);
        const prevSeg = async (): Promise<SegmentDef | undefined> => (i > 0 ? ((await freshExec(path.join(segDirOf(filmSegments[i - 1]!.key), '段.ts'), root)).default as SegmentDef) : undefined);
        const env: GenerateEnv = { assetLock, lineTable, getMeasure: (id) => getAudioMeasure(id, assetLock[id], dataRoot()), prevSeg };
        try {
          if (p.toggles.has('--check')) {
            const seg = (await freshExec(segFile, root)).default as SegmentDef;
            const issues = await checkSeg(seg, path.dirname(segFile), root, { ...env, getMeasure: (id) => knownAudioMeasure(assetLock[id], dataRoot()) });
            issueCount += issues.length;
            console.log(`${issues.length ? '✗' : '✓'} ${t.key}${issues.map((x) => `\n    ${x}`).join('')}`);
          } else {
            const r = await generateSeg(segFile, root, env);
            for (const f of r.changed) runRecord.artifacts.push(relativeToCodeRoot(path.join(path.dirname(segFile), f)));
            const soundCount = r.segment.sound?.length ?? 0;
            console.log(`${r.changed.length ? '✎' : '✓'} ${t.key}：${soundCount} 条 cue，${Object.keys(r.表.asset).length} 个声音文件${r.changed.length ? `，写了 ${r.changed.join('、')}` : '，没变'}`);
          }
        } catch (e) {
          issueCount++;
          console.log(`✗ ${t.key}：${(e as Error).message}`);
        }
      }
      if (!candidates.length) console.log('没有段框架的段（段.ts 的默认导出是 窗口段 做的才算）');
      return issueCount ? 1 : 0;
    },
  },
  new: {
    usage: 'new work <作品名> | new seg <段键> [--scene <场键>] [--start <事件>] [--end <事件>]',
    note: 'work：照模板起一部作品（清单.ts、注册.tsx、index.ts，带一个能渲的 核对-起步 段）；seg：在所选作品里加一个窗口段（段.ts、画面.tsx、空的声音表和地址表，场时间线没有就建一条），排进清单末尾',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--scene', '--start', '--end'] });
      const [targetKind, name] = p.位置;
      if (p.位置.length !== 2 || (targetKind !== 'work' && targetKind !== 'seg')) throw new UsageError('要 anim new work <作品名> 或 anim new seg <段键> [--scene <场键>]');
      const scene = p.value['--scene'];
      // 场时间线还没有、本场有老段（defineSeg 写的）的：照清单找出来，新时间线用 continueOldSeg 把它们摆上去，新段接在后面
      let legacySegs: SceneLegacySeg[] | undefined;
      if (targetKind === 'seg' && scene && !fs.existsSync(path.join(workRoot(), '场', scene, '时间线.ts'))) {
        legacySegs = (await loadAllSegments())
          .filter((s) => s.章 !== '核对' && s.segment.scene === scene && !isFrameworkSeg(s.segment))
          .map((s) => ({ key: s.key, sec: s.segment.sec, ...(s.segment.sceneWindow ? { startSec: s.segment.sceneWindow.startSec } : {}), width: s.segment.width, height: s.segment.height }));
        if (legacySegs.length) console.log(`场 ${scene} 有 ${legacySegs.length} 个老段（${legacySegs.map((x) => x.key).join('、')}），场时间线用 continueOldSeg 摆上去，新段接在后面`);
      }
      const written = targetKind === 'work' ? newWork(codeRoot(), name!) : newSegment(workRoot(), name!, { scene: scene, start: p.value['--start'], end: p.value['--end'], legacySegs });
      for (const f of written) {
        runRecord.artifacts.push(relativeToCodeRoot(f));
        console.log(`+ ${relativeToCodeRoot(f)}`);
      }
      if (targetKind === 'work') console.log(`\n下一步：anim --work ${name} cues，再 anim --work ${name} still 核对-起步 0 --to-preview 工作-${name}起步`);
      else if (name!.startsWith('核对-')) console.log(`\n下一步：改 视图.ts 的视图表、画面.tsx，anim still ${name} 0 --to-preview 工作-${name}`);
      else console.log(`\n下一步：改 段.ts 的窗口和 cue、画面.tsx，跑 anim cues ${name}`);
    },
  },
};
