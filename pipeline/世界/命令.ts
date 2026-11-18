// anim world <子命令>：世界声明（sourcing/worlds/<世界>.toml）→ 编辑层（<世界>.编辑.toml）→ 区段包。数据流和各字段见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { codeRoot } from '../环境/路径.ts';
import { passGate } from '../闸/闸.ts';
import { defaultThreads, bakeWorld, loadEdits } from './烘焙/流程.ts';
import { bakeRoutePacks, simulateFromLevel } from './远景/航线烘焙.ts';
import { overlayName, bakeWorkOverlay } from './远景/作品覆盖层.ts';
import { workName } from '../环境/作品.ts';
import { packCover } from '../渲/地形覆盖.ts';
import { bakeDhWorld } from './dh/流程.ts';
import { transcodePack } from './烘焙/转码.ts';
import { buildDecoder } from './区段解码器.ts';
import { buildReplay, buildReplayScript } from './编辑/重放.ts';
import { listWorlds, worldDir, readDecl, editFile, saveDir as declSaveDir, type WorldDecl, type PregenBox } from './声明.ts';
import { freeze } from './冻结.ts';
import { printCommands, csvText, pregenPlans } from './预生成/计划.ts';
import { runBlock } from './预生成/看守.ts';
import { sendCommandsInOrder } from './服务端/发命令.ts';
import { Server } from './服务端/服务端.ts';
import { makeNewWorldSandbox, makeSandbox } from './服务端/沙盒.ts';
import { installServer } from './服务端/安装.ts';
import { buildWorld } from './服务端/建世界.ts';
import { fetchJar } from '../取材/取jar.ts';
import { config, dataPath } from '../环境/配置.ts';
import { selectTerrainPolicy, versionDir, release, newStaging, registerTerrain, registerTerrainEntry, readTerrainTable } from './版本.ts';
import { countChunks, splitTasks, distantRange, type DistantTask } from './远景/任务.ts';
import { writeToDir, packDistant } from './远景/打包.ts';
import { distantLandmarks, type Landmark } from './远景/地标.ts';
import { worldDraftDir, QUERY_COMMANDS } from './查询/命令.ts';
import { TRIM_COMMANDS } from './裁级/命令.ts';

const relPath = (f: string) => path.relative(codeRoot(), f).split(path.sep).join('/');

/** 世界声明的 Forge 写成「MC 版本-Forge 版本」，就是 libraries 里的目录名 */
const loaderVersion = (w: WorldDecl) => w.Forge;

/** --corners x1,z1,x2,z2 → 临时的矩形块（只跑这一块） */
const boxFromCorners = (s: string): PregenBox => {
  const v = s.split(',').map(Number);
  if (v.length !== 4 || !v.every(Number.isInteger)) throw new UsageError('--corners 写 x1,z1,x2,z2 四个整数');
  return { name: `临时-${v.join('_')}`, shape: '矩形', corners: v as [number, number, number, number], basis: '命令行 --corners' };
};

/** anim world server 的命令（逐条的写法见 发命令.ts） */
const runServerCommand = async (serverDir: string, saveDir: string, loaderVersion: string | undefined, heap: string | undefined, commands: string[]) => {
  const s = await Server.start({ 目录: serverDir, save: saveDir, loaderVersion: loaderVersion, heap, onLine: (l) => console.log(l) });
  try {
    await sendCommandsInOrder(s, commands);
  } finally {
    await s.停();
  }
  return 0;
};

type SubCommand = { usage: string; 跑: (args: string[], runRecord: Parameters<Command['跑']>[1]) => Promise<number | void> };

const subCommands: Record<string, SubCommand> = {
  list: {
    usage: 'list',
    跑: async () => {
      const terrainTable = readTerrainTable().pack;
      for (const worldName of listWorlds()) {
        const w = readDecl(worldName);
        const editNote = fs.existsSync(editFile(worldName)) ? `，编辑 ${relPath(editFile(worldName))}` : '';
        console.log(`${worldName}：${w.server}/${w.save} ${w.dimension}${editNote}`);
        for (const b of w.pack) console.log(`  包 ${b.name}：${b.region ? `RX ${b.region.RX.join('～')}、RZ ${b.region.RZ.join('～')}` : '全部区域文件'}，原点 ${b.origin.join(', ')}，登记版本 ${terrainTable[b.name]?.version ?? '（没登记）'}`);
        for (const k of w.pregen.tile) console.log(`  预生成 ${k.name}（${k.shape}）`);
      }
    },
  },
  bake: {
    usage: 'bake <世界> [--pack <名>] [--save-dir <世界目录>] [--no-edits] [--no-register] [--threads <n>]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--pack', '--save-dir', '--threads'], toggles: ['--no-edits', '--no-register'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名（anim world list 看有哪些）');
      const w = readDecl(p.位置[0]!);
      const threads = p.value['--threads'] ? Number(p.value['--threads']) : undefined;
      if (threads !== undefined && !(Number.isInteger(threads) && threads > 0)) throw new UsageError('--threads 要是正整数');
      const editSet = p.toggles.has('--no-edits') ? null : await loadEdits(w); // 编辑文件写错了，排队前就报
      if (editSet) console.log(`编辑层 ${relPath(editSet.file)}：${editSet.step.length} 条命令`);
      const results = await passGate(() =>
        bakeWorld(w, { pack: p.value['--pack'], save: p.value['--save-dir'], skipEdits: p.toggles.has('--no-edits'), noRegister: p.toggles.has('--no-register'), threads, log: (s) => console.log(s) }),
      );
      for (const r of results) {
        runRecord.artifacts.push(r.目录);
        runRecord.log('信息', `${r.pack} 版本 ${r.version}${r.registered ? '' : '（没登记）'}`);
      }
    },
  },
  'bake-far': {
    usage: 'bake-far <世界> [--cover-dir <规划目录>] [--simulate-from 2|3|4|5|outside] [--no-register]（默认推荐起级；outside 保留存档内真实区段）',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--simulate-from', '--cover-dir'], toggles: ['--no-register'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个暮色世界名');
      const world = readDecl(p.位置[0]!);
      const pack = world.farView?.sectionPack;
      if (!pack || !world.farView?.landmarkPack) throw new UsageError('世界缺底包或远地标原料包声明');
      const policy = p.value['--simulate-from'] ?? String(simulateFromLevel);
      if (!['2', '3', '4', '5', 'outside'].includes(policy)) throw new UsageError('--simulate-from 只取 2、3、4、5 或 outside');
      const directory = p.value['--cover-dir'];
      const plan = await packCover(pack, { measure: false, ...(directory ? { override: { work: workName(), directory } } : {}) });
      if (plan.stale.length) throw Error(`航线规划缺失或过期：${plan.stale.join('、')}；先在对应作品跑 anim world cover`);
      const used = new Set(plan.used.keys());
      if (!used.size) throw Error('航线留表为空，不登记');
      const register = !p.toggles.has('--no-register');
      if (register && !readTerrainTable().pack[pack] && policy !== 'outside') throw Error('首次登记先烘 outside 保真版');
      const level = policy === 'outside' ? Infinity : Number(policy);
      const made = (await passGate(() => bakeRoutePacks(world, used, [level])))[policy]!;
      if (register) {
        const old = readTerrainTable().pack[pack];
        // 重烘某一档不等于批准改正式画面；正式选择只在版本表一处切换。
        registerTerrain(pack, {
          ...(policy === 'outside' ? made : old!), activePolicy: old?.activePolicy ?? 'outside',
          policies: { ...old?.policies, ...(policy === 'outside' ? {} : { [policy]: made }) },
        });
      }
      runRecord.artifacts.push(versionDir(pack, made.version), versionDir(pack, made.trimmed!.version));
    },
  },
  'bake-overlay': {
    usage: 'bake-overlay <世界> [--simulate-from outside|2|3|4|5] [--no-register]（从底包和当前作品的地形改动烘整块覆盖层）',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--simulate-from'], toggles: ['--no-register'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名');
      const base = readDecl(p.位置[0]!).farView?.sectionPack;
      const registry = readTerrainTable().pack;
      if (!base || !registry[base]) throw Error('没有已登记的世界底包，先 world bake-far');
      const baseRecord = registry[base];
      const policy = p.value['--simulate-from'] ?? baseRecord.activePolicy ?? 'outside';
      if (!['outside', '2', '3', '4', '5'].includes(policy)) throw new UsageError('模拟起级只取 outside、2、3、4、5');
      const pack = overlayName(base, workName());
      const register = !p.toggles.has('--no-register');
      if (register && !registry[pack] && policy !== 'outside') throw Error('首次登记作品覆盖层请先烘 outside');
      const made = await passGate(() => bakeWorkOverlay(base, selectTerrainPolicy(baseRecord, policy)));
      if (register) {
        const old = readTerrainTable().pack[pack];
        registerTerrain(pack, {
          ...(policy === 'outside' ? made : old!),
          policyFrom: base,
          policies: { ...old?.policies, ...(policy === 'outside' ? {} : { [policy]: made }) },
        });
      }
      runRecord.artifacts.push(versionDir(pack, made.version));
      if (made.trimmed) runRecord.artifacts.push(versionDir(pack, made.trimmed.version));
    },
  },
  'bake-dh': {
    usage: 'bake-dh <世界> [--save-dir <世界目录>] [--no-register]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--save-dir'], toggles: ['--no-register'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名（声明里写了 [dh] 的）');
      const w = readDecl(p.位置[0]!);
      const r = await passGate(() => bakeDhWorld(w, { save: p.value['--save-dir'], noRegister: p.toggles.has('--no-register'), log: (s) => console.log(s) }));
      runRecord.artifacts.push(r.目录);
      runRecord.log('信息', `${r.pack} 版本 ${r.version}${r.registered ? '' : '（没登记）'}`);
    },
  },
  transcode: {
    usage: 'transcode <包…> [--from <版本>] [--no-register] [--to <目录>] [--threads <n>]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--from', '--threads', '--to'], toggles: ['--no-register'] });
      if (!p.位置.length) throw new UsageError('要给包名（assets/地形版本.json 里的键）');
      if (p.value['--from'] && p.位置.length !== 1) throw new UsageError('--from 只能配一个包');
      const threads = p.value['--threads'] ? Number(p.value['--threads']) : defaultThreads();
      if (!(Number.isInteger(threads) && threads > 0)) throw new UsageError('--threads 要是正整数');
      await passGate(async () => {
        for (const pack of p.位置) {
          const r = await transcodePack(pack, { 从: p.value['--from'], noRegister: p.toggles.has('--no-register'), outRoot: p.value['--to'] ? path.resolve(p.value['--to']) : undefined, threads, log: (s) => console.log(s) });
          runRecord.artifacts.push(r.目录);
          runRecord.log('信息', `${pack} ${r.oldVersion} → ${r.version}，${r.sections} 个区段${'cell' in r ? `、${r.cell} 格逐格核对过` : '换容器、逐个区段字节核对过'}`);
        }
      });
    },
  },
  far: {
    usage: 'far tasks <世界> [--parts <n>] [--to <目录>] | far landmarks <世界> <地标.json> --camera-box x0,z0,x1,z1 [--view-dist 米] [--write <区块表文件>] | far pack <任务.json…> [--no-register]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--parts', '--to', '--camera-box', '--view-dist', '--write'], toggles: ['--no-register'] });
      const [action, ...restArgs] = p.位置;
      if (action === 'tasks') {
        if (restArgs.length !== 1) throw new UsageError('写 far tasks <世界>');
        const w = readDecl(restArgs[0]!);
        const parts = Number(p.value['--parts'] ?? 1);
        if (!(Number.isInteger(parts) && parts > 0)) throw new UsageError('--parts 要是正整数');
        const outDir = p.value['--to'] ? path.resolve(p.value['--to']) : worldDraftDir();
        fs.mkdirSync(outDir, { recursive: true });
        const tasks = splitTasks(w, path.join(outDir, '远景'), parts);
        const bounds = distantRange(w);
        for (const t of tasks) {
          const f = `${t.出}.任务.json`;
          fs.writeFileSync(f, JSON.stringify(t));
          runRecord.artifacts.push(f);
          console.log(`${relPath(f)}：${t.layers.map((l) => `${l.name} ${l.tile.length} 块`).join('，')}，${countChunks(t.layers)} 区块`);
        }
        const landmarkTaskPath = path.join(outDir, '地标.任务.json');
        fs.writeFileSync(landmarkTaskPath, JSON.stringify({ dimension: w.dimension, x0: bounds[0], z0: bounds[1], x1: bounds[2], z1: bounds[3], 出: path.join(outDir, '地标.json') }));
        runRecord.artifacts.push(landmarkTaskPath);
        console.log(`范围 x ${bounds[0]}～${bounds[2]}、z ${bounds[1]}～${bounds[3]}；取样：anim world server ${w.displayName} --sandbox -- "mcai far <任务.json>" "wait:mcai 远景：完成"（约 1000 区块/秒）`);
        return;
      }
      if (action === 'landmarks') {
        if (restArgs.length !== 2) throw new UsageError('写 far landmarks <世界> <mcai landmarks 输出的 JSON> --camera-box x0,z0,x1,z1 [--view-dist 米] [--write <区块表文件>]');
        const w = readDecl(restArgs[0]!);
        const rect = (p.value['--camera-box'] ?? '').split(',').map(Number);
        if (rect.length !== 4 || !rect.every(Number.isFinite)) throw new UsageError('--camera-box 写 x0,z0,x1,z1（镜头会飞到的范围，方块坐标）');
        const viewDistance = Number(p.value['--view-dist'] ?? 10000);
        const colList = JSON.parse(fs.readFileSync(restArgs[1]!, 'utf8')) as Landmark[];
        const r = distantLandmarks(w, colList, rect as [number, number, number, number], viewDistance);
        const counts = new Map<string, number>();
        for (const o of r.landmarks) counts.set(o.landmarks, (counts.get(o.landmarks) ?? 0) + 1);
        console.log(`列出 ${colList.length} 座（生成 ${colList.filter((o) => o.generated).length}），不全在导入范围里、离镜头框 ${viewDistance} 米以内 ${r.landmarks.length} 座，${r.chunks.length} 个区块（约 ${Math.round(r.chunks.length / 40 / 60)} 分钟预生成）`);
        console.log([...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('，'));
        if (p.value['--write']) {
          const f = path.join(worldDir(), p.value['--write']);
          fs.writeFileSync(f, JSON.stringify({ note: `anim world far landmarks ${w.displayName}：镜头框 ${rect.join(',')}、视距 ${viewDistance} 米`, landmarks: r.landmarks.map((o) => ({ landmarks: o.landmarks, x: o.x, z: o.z, biome: o.biome, distance: o.distance, box: o.box })), chunks: r.chunks }) + '\n');
          runRecord.artifacts.push(f);
          console.log(`写了 ${relPath(f)}`);
        }
        return;
      }
      if (action !== 'pack' || !restArgs.length) throw new UsageError('写 far tasks <世界>、far landmarks <世界> <地标.json> 或 far pack <任务.json…>');
      const tasks = restArgs.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as DistantTask);
      const world = listWorlds().map((n) => readDecl(n)).find((w) => w.farView && w.dimension === tasks[0]!.dimension);
      if (!world?.farView) throw new UsageError(`没有哪个世界声明写了 [远景] 且维度是 ${tasks[0]!.dimension}`);
      const pack = world.farView.pack;
      const r = await passGate(async () => {
        const packed = await packDistant(tasks);
        const staging = newStaging(pack);
        try {
          writeToDir(packed, staging.dir);
          const v = release(pack, staging.dir);
          const entry = await registerTerrainEntry(pack, v.version, { source: `手工:${world.displayName} 的暮色远景（mcai far 在服务端里只跑地形和地表那一步取样），anim world far pack`, license: 'LicenseRef-Minecraft-Derived', visibility: '发布' });
          if (!p.toggles.has('--no-register')) registerTerrain(pack, entry);
          return { ...v, result: packed };
        } finally {
          staging.放();
        }
      });
      runRecord.artifacts.push(r.目录);
      runRecord.log('信息', `${pack} 版本 ${r.version}${r.existed ? '（同内容已有）' : ''}：${Object.entries(r.result.pointCounts).map(([k, n]) => `${k} ${n} 点`).join('，')}，${r.result.biome.length} 种群系、${r.result.surfaceBlocks.length} 种地表方块`);
    },
  },
  decoder: {
    usage: 'decoder [--check]',
    跑: async (args) => {
      const p = parseArgs(args, { toggles: ['--check'] });
      if (p.位置.length) throw new UsageError('模型随每个包在 bake、transcode 时自动训练，不再写代码表');
      const r = buildDecoder({ check: p.toggles.has('--check') });
      console.log(`wasm/区段解码.ts → ${r.size} 字节，sha256 ${r.sha256.slice(0, 12)}，${r.same ? '和生成文件一样' : '已写回'}`);
      return 0;
    },
  },
  edit: {
    usage: 'edit check|replay <世界> [--to <目录>]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--to'] });
      const [action, worldName] = p.位置;
      if ((action !== 'check' && action !== 'replay') || !worldName || p.位置.length !== 2) throw new UsageError('写 edit check <世界> 或 edit replay <世界>');
      const w = readDecl(worldName);
      const e = await loadEdits(w);
      if (!e) {
        console.log(`${worldName} 没有编辑文件（${relPath(editFile(worldName))}）`);
        return action === 'check' ? 0 : 1;
      }
      if (action === 'check') {
        console.log(`${relPath(e.file)}：${e.step.length} 条命令，都过了方块表校验；sha256 ${e.sha256.slice(0, 12)}`);
        for (const s of e.step) console.log(`  ${s.provenance}：${s.原文}`);
        for (const [k, v] of Object.entries(e.structMissingStates)) console.log(`  注意：结构 ${k} 里 ${v.length} 种状态方块表没有（烘焙时进 缺失.tsv，画不出来）：${v.slice(0, 8).join('、')}${v.length > 8 ? '…' : ''}`);
        return 0;
      }
      const r = buildReplay(e, w.dimension);
      const dir = p.value['--to'] ? path.resolve(p.value['--to']) : worldDraftDir();
      fs.mkdirSync(dir, { recursive: true });
      const basePath = path.join(dir, `${worldName}.重放`);
      fs.writeFileSync(`${basePath}.mcfunction`, [...r.loads, ...r.command, ...r.unloadCmds].join('\n') + '\n');
      fs.writeFileSync(`${basePath}.sh`, buildReplayScript(r, `anim world edit replay ${worldName} 生成：在游戏里重放 ${relPath(e.file)}（${e.step.length} 条命令，sha256 ${e.sha256.slice(0, 12)}）`), { mode: 0o755 });
      for (const x of r.warnings) console.log(`注意：${x}`);
      console.log(`${r.command.length} 条命令（另 ${r.loads.length} 条 forceload），只生成不执行：\n  ${basePath}.sh（anim mcai batch，游戏要开着）\n  ${basePath}.mcfunction（放进数据包 /function 跑也行）`);
      runRecord.artifacts.push(`${basePath}.sh`, `${basePath}.mcfunction`);
    },
  },
  pregen: {
    usage: 'pregen <世界> [--box <名> | --corners <x1,z1,x2,z2>] [--apply [--sandbox] [--save-dir <世界目录>] [--server-dir <服务端目录>] [--heap 12G] [--gen-threads <n>] [--stuck-minutes 10] [--old-gen-limit 90] [--max-stalled-restarts 3] [--no-fill-holes] [--from-scratch]]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--box', '--corners', '--save-dir', '--server-dir', '--heap', '--gen-threads', '--stuck-minutes', '--old-gen-limit', '--max-stalled-restarts'], toggles: ['--apply', '--sandbox', '--no-fill-holes', '--from-scratch'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名');
      const w = readDecl(p.位置[0]!);
      if (p.value['--box'] && p.value['--corners']) throw new UsageError('--box 和 --corners 只给一个');
      const tempCornerBlocks = p.value['--corners'] ? [boxFromCorners(p.value['--corners'])] : [];
      const plan = pregenPlans(w, p.value['--box'], tempCornerBlocks);
      if (!plan.length) {
        console.log(`${w.displayName} 没写 [[预生成.块]]`);
        return 0;
      }
      if (!p.toggles.has('--apply')) {
        console.log(`只打印、不执行（--apply 才开服跑，过资源闸；--sandbox 先把服务端和存档克隆到数据根 run/沙盒/ 再跑）：`);
        for (const k of plan) {
          console.log(`\n# ${k.tile.name}：${k.tile.shape === '走廊' ? `走廊 ${k.tile.polyline!.map((x) => x.join(',')).join(' → ')}，半宽 ${k.tile.halfWidth}` : k.tile.shape === '区块表' ? `区块表 ${k.tile.file}` : `中心 ${k.selection.center.join(', ')}，半边 ${k.selection.halfSide.join(' × ')}`}，${k.chunkCount} 个区块${k.tile.basis ? `（${k.tile.basis}）` : ''}`);
          if (k.pattern === 'csv') {
            const f = path.join(worldDraftDir(), `${k.csvName}.csv`);
            fs.writeFileSync(f, csvText(k.chunks!));
            console.log(`# 区块列表写到 ${f}，执行时拷进 <服务端>/config/chunky/${k.csvName}.csv`);
          }
          for (const c of printCommands(k)) console.log(c);
        }
        if (w.pregen.chunkCount) console.log(`\n声明里记的存档区块数：${w.pregen.chunkCount}`);
        return 0;
      }
      const numFlag = (k: string, defaultValue?: number) => {
        const v = p.value[k];
        if (v === undefined) return defaultValue;
        const n = Number(v);
        if (!(n > 0)) throw new UsageError(`${k} 要是正数`);
        return n;
      };
      const genThreads = numFlag('--gen-threads');
      if (genThreads !== undefined && !Number.isInteger(genThreads)) throw new UsageError('--gen-threads 要是正整数');
      const maxNoProgress = numFlag('--max-stalled-restarts');
      if (maxNoProgress !== undefined && !Number.isInteger(maxNoProgress)) throw new UsageError('--max-stalled-restarts 要是正整数');
      let serverDir = p.value['--server-dir'] ? path.resolve(p.value['--server-dir']) : path.join(config('游戏'), w.server);
      let saveDir = declSaveDir(w, p.value['--save-dir']);
      let logDir = dataPath('run', '预生成', w.displayName);
      const chunky = await fetchJar('chunky', { 说: (s) => console.log(s) });
      if (p.toggles.has('--sandbox')) {
        const b = makeSandbox(serverDir, saveDir, w.displayName);
        console.log(`沙盒 ${b.root}：服务端、存档都是克隆，原来的不动`);
        [serverDir, saveDir, logDir] = [b.server, b.save, path.join(b.root, '预生成')];
        runRecord.artifacts.push(b.root);
      }
      for (const k of plan) {
        const st = await runBlock(k, {
          world: w.displayName,
          dimension: w.dimension,
          serverDir,
          save: saveDir,
          loaderVersion: loaderVersion(w),
          chunky,
          logDir,
          heap: p.value['--heap'],
          genThreads,
          stuckMinutes: numFlag('--stuck-minutes'),
          oldGenLimit: numFlag('--old-gen-limit'),
          maxNoProgressRestarts: maxNoProgress,
          skipHoleFill: p.toggles.has('--no-fill-holes'),
          fromScratch: p.toggles.has('--from-scratch'),
          说: (s) => console.log(s),
        });
        runRecord.log('信息', `${k.tile.name}：${Object.entries(st.completed).map(([a, b]) => `${a} ${b!.chunks} 区块 ${b!.elapsed}`).join('，')}，起服 ${st.serverStarts.length} 次`);
      }
      runRecord.artifacts.push(logDir);
    },
  },
  server: {
    usage: 'server <世界> [--save-dir <世界目录>] [--server-dir <服务端目录>] [--sandbox] [--heap <G>] -- <命令…>（sleep:<秒>、wait:<一句话>、expect:<一句话>）',
    跑: async (args) => {
      const separatorIndex = args.indexOf('--');
      const p = parseArgs(separatorIndex < 0 ? args : args.slice(0, separatorIndex), { value: ['--save-dir', '--server-dir', '--heap'], toggles: ['--sandbox'] });
      const commands = separatorIndex < 0 ? [] : args.slice(separatorIndex + 1);
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名，命令写在 -- 后面');
      const w = readDecl(p.位置[0]!);
      let serverDir = p.value['--server-dir'] ? path.resolve(p.value['--server-dir']) : path.join(config('游戏'), w.server);
      let saveDir = declSaveDir(w, p.value['--save-dir']);
      if (p.toggles.has('--sandbox')) ({ server: serverDir, save: saveDir } = makeSandbox(serverDir, saveDir, w.displayName));
      return passGate(() => runServerCommand(serverDir, saveDir, loaderVersion(w), p.value['--heap'], commands));
    },
  },
  'install-server': {
    usage: 'install-server <世界> [--server-dir <服务端目录>] [--accept-eula] [--no-loader]',
    跑: async (args) => {
      const p = parseArgs(args, { value: ['--server-dir'], toggles: ['--accept-eula', '--no-loader'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名（装它声明的 服务端 目录、Forge、模组、第三方数据包）');
      const w = readDecl(p.位置[0]!);
      const serverDir = p.value['--server-dir'] ? path.resolve(p.value['--server-dir']) : path.join(config('游戏'), w.server);
      const r = await installServer({ decl: w, 目录: serverDir, acceptEula: p.toggles.has('--accept-eula'), skipLoader: p.toggles.has('--no-loader'), 说: (s) => console.log(s) });
      console.log(`${serverDir}：${r.loaderInstalled ? `装了 Forge ${w.Forge}` : 'Forge 原来就装着'}；新拷模组 ${r.newMods.length} 个${r.newMods.length ? `（${r.newMods.join('、')}）` : ''}；新拷数据包 ${r.newDatapacks.join('、') || '无'}`);
      for (const m of r.missingMods) console.log(`  缺模组 ${m}`);
      if (r.eula === '没写') console.log(`eula.txt 还没同意：读过 Minecraft EULA（https://aka.ms/MinecraftEULA）后自己把 ${path.join(serverDir, 'eula.txt')} 写成 eula=true，或重跑时加 --accept-eula（anim 不替人同意）`);
      return r.missingMods.length ? 1 : 0;
    },
  },
  new: {
    usage: 'new <世界> [--server-dir <服务端目录>] [--save-dir <世界目录>] [--sandbox] [--heap <G>] [--gen-threads <n>] [-- <命令…>]（按声明的种子、世界类型、生成结构、数据包建新存档）',
    跑: async (args, runRecord) => {
      const separatorIndex = args.indexOf('--');
      const p = parseArgs(separatorIndex < 0 ? args : args.slice(0, separatorIndex), { value: ['--server-dir', '--save-dir', '--heap', '--gen-threads'], toggles: ['--sandbox'] });
      const commands = separatorIndex < 0 ? [] : args.slice(separatorIndex + 1);
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名，建完要接着发的命令写在 -- 后面');
      const w = readDecl(p.位置[0]!);
      const threads = p.value['--gen-threads'] ? Number(p.value['--gen-threads']) : undefined;
      if (threads !== undefined && !(Number.isInteger(threads) && threads > 0)) throw new UsageError('--gen-threads 要是正整数');
      let serverDir = p.value['--server-dir'] ? path.resolve(p.value['--server-dir']) : path.join(config('游戏'), w.server);
      // 给了 --server-dir 又没给 --save-dir：新世界建在那个服务端目录下，不去动 ANIM_GAME 里同名的正式存档
      let saveDir = p.value['--save-dir'] || !p.value['--server-dir'] ? declSaveDir(w, p.value['--save-dir']) : path.join(serverDir, path.basename(declSaveDir(w)));
      if (fs.existsSync(path.join(saveDir, 'level.dat'))) throw new Error(`世界已经有了（${saveDir}）；要重建先删掉它`);
      if (!fs.existsSync(serverDir)) throw new Error(`${serverDir} 不存在；anim world install-server ${w.displayName} 先装服务端`);
      if (p.toggles.has('--sandbox')) {
        const b = makeNewWorldSandbox(serverDir, path.basename(saveDir), w.displayName);
        console.log(`沙盒 ${b.root}：服务端是克隆，新世界建在里面，原服务端不动`);
        [serverDir, saveDir] = [b.server, b.save];
        runRecord.artifacts.push(b.root);
      }
      const r = await passGate(() => buildWorld({ decl: w, serverDir, save: saveDir, heap: p.value['--heap'], genThreads: threads, commands, 说: (s) => console.log(s) }));
      for (const x of r.verify) console.log(`核对：${x}`);
      console.log(`世界已建：${r.save}（种子 ${w.seed}，${w.worldType}，${w.generateStructures ? '生成结构' : '结构全禁'}；数据包 ${r.datapacks.join('、') || '无'}）\n下一步：anim world pregen ${w.displayName} 看预生成命令，--apply 开服跑`);
      runRecord.artifacts.push(r.save);
    },
  },
  freeze: {
    usage: 'freeze [<包…>] [--write]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--write'] });
      let toWrite = 0;
      for (const r of await freeze(p.位置, { write: p.toggles.has('--write') })) {
        const relFile = relPath(r.file);
        if (r.same) console.log(`${r.pack}：版本 ${r.version}，粗高度指纹 ${r.fingerprint}，和 ${relFile} 一样`);
        else {
          toWrite++;
          console.log(`${r.pack}：版本 ${r.version}，粗高度指纹 ${r.fingerprint}；${r.原 ? `冻结的是 ${r.原.version}（${r.原.fingerprint}）` : '还没冻结'}${r.written ? `，已写 ${relFile}：用它编排的段都过期，航线、巡航高度跟着变，出静帧核对、重看配乐卡点` : '（加 --write 才写）'}`);
          if (r.written) runRecord.artifacts.push(r.file);
        }
      }
      return toWrite && !p.toggles.has('--write') ? 1 : 0;
    },
  },
  ...QUERY_COMMANDS,
  ...TRIM_COMMANDS,
};

const worldHelp = () => Object.values(subCommands).map((c) => `  anim world ${c.usage}`).join('\n');

export const worldCommand: Record<string, Command> = {
  world: {
    help: worldHelp,
    usage: `world ${Object.values(subCommands)
      .map((c) => c.usage.split(' ')[0])
      .join('|')} …`,
    note: '世界：list 列声明；bake 从存档烘区段包（套编辑层，过资源闸）；bake-dh 从存档里 Distant Horizons 的 LOD 库烘各处细度不一的区段包（声明的 [dh]，过资源闸）；transcode 把旧格式的包转成现行格式（格式 4 只换容器、区段字节不变）、没做可见变换的做上（只写新版本目录，逐格、逐网格或逐区段字节核对）；decoder 重编 WASM、核对；edit check|replay 校验编辑、生成游戏里重放的命令；block、heightmap、map、slice 查方块、出图；install-server 装 Forge 服务端、模组、数据包；new 按声明建新存档；pregen 打印或执行预生成（起专用服务端跑 Chunky）；server 起服务端发命令；freeze 冻结粗高度；trim 按全片用到的级裁地形包（--import 登记别的机器裁好的）、cover 量段的地形覆盖。anim world help 看各子命令',
    跑: async (args, runRecord) => {
      const [subcommand, ...rest] = args;
      if (!subcommand || subcommand === 'help' || subcommand === '--help') {
        console.log(worldHelp());
        return subcommand ? 0 : 1;
      }
      const c = subCommands[subcommand];
      if (!c) throw new UsageError(`world 没有 ${subcommand} 这个子命令（${Object.keys(subCommands).join('、')}）`);
      return c.跑(rest, runRecord);
    },
  },
};
