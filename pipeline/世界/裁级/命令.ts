// anim world trim | cover：按全片实际用到的级裁地形包（docs/世界.md「裁级」）。
import fs from 'node:fs';
import path from 'node:path';
import { UsageError, parseArgs } from '../../cli/参数.ts';
import type { Command } from '../../cli/命令.ts';
import { selectSegs } from '../../清单/清单.ts';
import { readTerrainTable } from '../版本.ts';
import { measureCovers, packCover } from '../../渲/地形覆盖.ts';
import { importTrimmed, registerTrimmed, trimPack } from './裁剪.ts';
import { compareWithCover, planSeg, viewFile, writePlan } from '../加载计划/计划.ts';

type SubCommand = { usage: string; 跑: (args: string[], runRecord: Parameters<Command['跑']>[1]) => Promise<number | void> };

export const TRIM_COMMANDS: Record<string, SubCommand> = {
  trim: {
    usage: 'trim <包…> [--no-register] [--keep <留表.tsv>] | trim --import <裁过的包目录>（按全片用到的级裁出地形包、登记；覆盖旧了的段先量）',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--keep', '--import'], toggles: ['--no-register'] });
      if (p.value['--import']) {
        if (p.位置.length || p.value['--keep']) throw new UsageError('trim --import 只要一个目录');
        await importTrimmed(path.resolve(p.value['--import']));
        return 0;
      }
      if (!p.位置.length) throw new UsageError('要给包名（assets/地形版本.json 里登记的）');
      if (p.value['--keep'] && p.位置.length !== 1) throw new UsageError('--keep 一次只裁一个包');
      const table = readTerrainTable().pack;
      for (const pack of p.位置) if (!table[pack]) throw new UsageError(`assets/地形版本.json 没登记包 ${pack}`);
      // 裁级是为了发布（pull 只下裁过的）和笔记本回传；可见性私有的包不进发布（分发/发布.ts），不裁
      for (const pack of p.位置) if (table[pack]!.visibility === '私有') throw new UsageError(`${pack} 可见性私有，不进发布，不用裁`);
      for (const pack of p.位置) {
        let used: Iterable<string>;
        if (p.value['--keep']) {
          // 手给的留表（核对缺级报错用）：每行 L\ti\tj，照常补祖先和 L3 以上
          used = fs.readFileSync(path.resolve(p.value['--keep']), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t').join('|'));
          console.log(`${pack}：照 ${p.value['--keep']} 裁，不量覆盖`);
        } else {
          const c = await packCover(pack, { measure: true, runRecord, log: (s) => console.log(s) });
          if (!c.segCount) throw new Error(`没有段声明地形包 ${pack}，不用裁`);
          used = c.used.keys();
          console.log(`${pack}：${c.segCount} 段用到 ${c.used.size} 个区段`);
        }
        const r = await trimPack(pack, used);
        runRecord.artifacts.push(r.dir);
        if (p.toggles.has('--no-register')) console.log(`没登记（--no-register）：${r.dir}`);
        else {
          const old = registerTrimmed(pack, r.record);
          console.log(`登记进 assets/地形版本.json：${pack} 正式出片读 ${r.record.version}${old && old !== r.record.version ? `（原来是 ${old}）` : ''}`);
        }
      }
      return 0;
    },
  },
  plan: {
    usage: 'plan <段…> [--check]（照段的地形视图在 Node 里算加载计划：每个区段头一次用到的帧，存 <数据根>/cache/加载计划/；--check 和地形覆盖逐个区段比）',
    跑: async (args) => {
      const p = parseArgs(args, { toggles: ['--check'] });
      if (!p.位置.length) throw new UsageError('要给段（选择器同 anim film）');
      const segs = (await selectSegs(p.位置)).filter((s) => s.segment.terrain.length);
      if (!segs.length) throw new UsageError('选中的段都没声明地形包');
      let bad = 0;
      for (const s of segs) {
        if (!fs.existsSync(viewFile(s))) {
          console.log(`${s.key}：还没有 地形视图.ts`);
          bad++;
          continue;
        }
        const t0 = Date.now();
        const plan = await planSeg(s);
        writePlan(plan);
        const counts = Object.entries(plan.pack).map(([pack, r]) => `${pack} ${Object.keys(r.sections).length}`).join('、') || '没有区段';
        const diffs = p.toggles.has('--check') ? compareWithCover(plan) : [];
        console.log(`${s.key}：${plan.frameCount} 帧 ${Date.now() - t0} 毫秒，${counts}${p.toggles.has('--check') ? (diffs.length ? '，和覆盖不一样' : '，和覆盖一样') : ''}`);
        for (const d of diffs) console.log(`  ${d}`);
        if (diffs.length) bad++;
      }
      return bad ? 1 : 0;
    },
  },
  cover: {
    usage: 'cover <段…> [--to <独立目录>]（量段的地形覆盖：每帧挑哪些区段，存 <数据根>/cache/地形覆盖/；不出图不画，过放行闸、整批一张票）',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--to'] });
      if (!p.位置.length) throw new UsageError('要给段（选择器同 anim film）');
      const segs = (await selectSegs(p.位置)).filter((s) => s.segment.terrain.length);
      if (!segs.length) throw new UsageError('选中的段都没声明地形包');
      await measureCovers(segs, runRecord, undefined, undefined, p.value['--to']);
      return 0;
    },
  },
};
