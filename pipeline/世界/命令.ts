// anim world <子命令>：世界声明（sourcing/worlds/<世界>.toml）→ 编辑层（<世界>.编辑.toml）→ 区段包。数据流和各字段见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { codeRoot } from '../环境/路径.ts';
import { passGate } from '../闸/闸.ts';
import { defaultThreads, bakeWorld, loadEdits } from './烘焙/流程.ts';
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
import { release, newStaging, registerTerrain, registerTerrainEntry, readTerrainTable } from './版本.ts';
import { countChunks, splitTasks, distantRange, type DistantTask } from './远景/任务.ts';
import { writeToDir, packDistant } from './远景/打包.ts';
import { distantLandmarks, type Landmark } from './远景/地标.ts';
import { worldDraftDir, QUERY_COMMANDS } from './查询/命令.ts';

const relPath = (f: string) => path.relative(codeRoot(), f).split(path.sep).join('/');

/** 世界声明的 Forge 写成「MC 版本-Forge 版本」，就是 libraries 里的目录名 */
const loaderVersion = (w: WorldDecl) => w.Forge;

/** --两角 x1,z1,x2,z2 → 临时的矩形块（只跑这一块） */
const boxFromCorners = (s: string): PregenBox => {
  const v = s.split(',').map(Number);
  if (v.length !== 4 || !v.every(Number.isInteger)) throw new UsageError('--两角 写 x1,z1,x2,z2 四个整数');
  return { 名: `临时-${v.join('_')}`, 形状: '矩形', 两角: v as [number, number, number, number], 依据: '命令行 --两角' };
};

/** anim world server 的命令（逐条的写法见 发命令.ts） */
const runServerCommand = async (serverDir: string, saveDir: string, loaderVersion: string | undefined, heap: string | undefined, commands: string[]) => {
  const s = await Server.起({ 目录: serverDir, 存档: saveDir, loaderVersion: loaderVersion, heap, onLine: (l) => console.log(l) });
  try {
    await sendCommandsInOrder(s, commands);
  } finally {
    await s.停();
  }
  return 0;
};

type SubCommand = { 用法: string; 跑: (args: string[], runRecord: Parameters<Command['跑']>[1]) => Promise<number | void> };

const subCommands: Record<string, SubCommand> = {
  list: {
    用法: 'list',
    跑: async () => {
      const terrainTable = readTerrainTable().包;
      for (const worldName of listWorlds()) {
        const w = readDecl(worldName);
        const editNote = fs.existsSync(editFile(worldName)) ? `，编辑 ${relPath(editFile(worldName))}` : '';
        console.log(`${worldName}：${w.服务端}/${w.存档} ${w.维度}${editNote}`);
        for (const b of w.包) console.log(`  包 ${b.名}：${b.区域 ? `RX ${b.区域.RX.join('～')}、RZ ${b.区域.RZ.join('～')}` : '全部区域文件'}，原点 ${b.原点.join(', ')}，登记版本 ${terrainTable[b.名]?.版本 ?? '（没登记）'}`);
        for (const k of w.预生成.块) console.log(`  预生成 ${k.名}（${k.形状}）`);
      }
    },
  },
  bake: {
    用法: 'bake <世界> [--包 <名>] [--存档 <世界目录>] [--不套编辑] [--不登记] [--线程 <n>]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--包', '--存档', '--线程'], toggles: ['--不套编辑', '--不登记'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名（anim world list 看有哪些）');
      const w = readDecl(p.位置[0]!);
      const threads = p.值['--线程'] ? Number(p.值['--线程']) : undefined;
      if (threads !== undefined && !(Number.isInteger(threads) && threads > 0)) throw new UsageError('--线程 要是正整数');
      const editSet = p.toggles.has('--不套编辑') ? null : await loadEdits(w); // 编辑文件写错了，排队前就报
      if (editSet) console.log(`编辑层 ${relPath(editSet.文件)}：${editSet.步.length} 条命令`);
      const results = await passGate(() =>
        bakeWorld(w, { 包: p.值['--包'], 存档: p.值['--存档'], skipEdits: p.toggles.has('--不套编辑'), noRegister: p.toggles.has('--不登记'), threads, log: (s) => console.log(s) }),
      );
      for (const r of results) {
        runRecord.产物.push(r.目录);
        runRecord.log('信息', `${r.包} 版本 ${r.版本}${r.registered ? '' : '（没登记）'}`);
      }
    },
  },
  转码: {
    用法: '转码 <包…> [--从 <版本>] [--不登记] [--线程 <n>]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--从', '--线程'], toggles: ['--不登记'] });
      if (!p.位置.length) throw new UsageError('要给包名（assets/地形版本.json 里的键）');
      if (p.值['--从'] && p.位置.length !== 1) throw new UsageError('--从 只能配一个包');
      const threads = p.值['--线程'] ? Number(p.值['--线程']) : defaultThreads();
      if (!(Number.isInteger(threads) && threads > 0)) throw new UsageError('--线程 要是正整数');
      await passGate(async () => {
        for (const pack of p.位置) {
          const r = await transcodePack(pack, { 从: p.值['--从'], noRegister: p.toggles.has('--不登记'), threads, log: (s) => console.log(s) });
          runRecord.产物.push(r.目录);
          runRecord.log('信息', `${pack} ${r.oldVersion} → ${r.版本}，${r.区段} 个区段、${r.格} 格逐格核对过`);
        }
      });
    },
  },
  远景: {
    用法: '远景 任务 <世界> [--分 <n>] [--到 <目录>] | 远景 地标 <世界> <地标.json> --镜头框 x0,z0,x1,z1 [--视距 米] [--写 <区块表文件>] | 远景 打包 <任务.json…> [--不登记]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--分', '--到', '--镜头框', '--视距', '--写'], toggles: ['--不登记'] });
      const [action, ...restArgs] = p.位置;
      if (action === '任务') {
        if (restArgs.length !== 1) throw new UsageError('写 远景 任务 <世界>');
        const w = readDecl(restArgs[0]!);
        const parts = Number(p.值['--分'] ?? 1);
        if (!(Number.isInteger(parts) && parts > 0)) throw new UsageError('--分 要是正整数');
        const outDir = p.值['--到'] ? path.resolve(p.值['--到']) : worldDraftDir();
        fs.mkdirSync(outDir, { recursive: true });
        const tasks = splitTasks(w, path.join(outDir, '远景'), parts);
        const bounds = distantRange(w);
        for (const t of tasks) {
          const f = `${t.出}.任务.json`;
          fs.writeFileSync(f, JSON.stringify(t));
          runRecord.产物.push(f);
          console.log(`${relPath(f)}：${t.层.map((l) => `${l.名} ${l.块.length} 块`).join('，')}，${countChunks(t.层)} 区块`);
        }
        const landmarkTaskPath = path.join(outDir, '地标.任务.json');
        fs.writeFileSync(landmarkTaskPath, JSON.stringify({ 维度: w.维度, x0: bounds[0], z0: bounds[1], x1: bounds[2], z1: bounds[3], 出: path.join(outDir, '地标.json') }));
        runRecord.产物.push(landmarkTaskPath);
        console.log(`范围 x ${bounds[0]}～${bounds[2]}、z ${bounds[1]}～${bounds[3]}；取样：anim world server ${w.名称} --沙盒 -- "mcai far <任务.json>" "wait:mcai 远景：完成"（约 1000 区块/秒）`);
        return;
      }
      if (action === '地标') {
        if (restArgs.length !== 2) throw new UsageError('写 远景 地标 <世界> <mcai landmarks 输出的 JSON> --镜头框 x0,z0,x1,z1 [--视距 米] [--写 <区块表文件>]');
        const w = readDecl(restArgs[0]!);
        const rect = (p.值['--镜头框'] ?? '').split(',').map(Number);
        if (rect.length !== 4 || !rect.every(Number.isFinite)) throw new UsageError('--镜头框 写 x0,z0,x1,z1（镜头会飞到的范围，方块坐标）');
        const viewDistance = Number(p.值['--视距'] ?? 10000);
        const colList = JSON.parse(fs.readFileSync(restArgs[1]!, 'utf8')) as Landmark[];
        const r = distantLandmarks(w, colList, rect as [number, number, number, number], viewDistance);
        const counts = new Map<string, number>();
        for (const o of r.地标) counts.set(o.地标, (counts.get(o.地标) ?? 0) + 1);
        console.log(`列出 ${colList.length} 座（生成 ${colList.filter((o) => o.生成).length}），不全在导入范围里、离镜头框 ${viewDistance} 米以内 ${r.地标.length} 座，${r.区块.length} 个区块（约 ${Math.round(r.区块.length / 40 / 60)} 分钟预生成）`);
        console.log([...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('，'));
        if (p.值['--写']) {
          const f = path.join(worldDir(), p.值['--写']);
          fs.writeFileSync(f, JSON.stringify({ 说明: `anim world 远景 地标 ${w.名称}：镜头框 ${rect.join(',')}、视距 ${viewDistance} 米`, 地标: r.地标.map((o) => ({ 地标: o.地标, x: o.x, z: o.z, 群系: o.群系, 离: o.离, 框: o.框 })), 区块: r.区块 }) + '\n');
          runRecord.产物.push(f);
          console.log(`写了 ${relPath(f)}`);
        }
        return;
      }
      if (action !== '打包' || !restArgs.length) throw new UsageError('写 远景 任务 <世界>、远景 地标 <世界> <地标.json> 或 远景 打包 <任务.json…>');
      const tasks = restArgs.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')) as DistantTask);
      const world = listWorlds().map((n) => readDecl(n)).find((w) => w.远景 && w.维度 === tasks[0]!.维度);
      if (!world?.远景) throw new UsageError(`没有哪个世界声明写了 [远景] 且维度是 ${tasks[0]!.维度}`);
      const pack = world.远景.包;
      const r = await passGate(async () => {
        const packed = await packDistant(tasks);
        const staging = newStaging(pack);
        try {
          writeToDir(packed, staging.dir);
          const v = release(pack, staging.dir);
          const entry = await registerTerrainEntry(pack, v.版本, { 来源: `手工:${world.名称} 的暮色远景（mcai far 在服务端里只跑地形和地表那一步取样），anim world 远景 打包`, 许可: 'LicenseRef-Minecraft-Derived', 可见性: '发布' });
          if (!p.toggles.has('--不登记')) registerTerrain(pack, entry);
          return { ...v, 结果: packed };
        } finally {
          staging.放();
        }
      });
      runRecord.产物.push(r.目录);
      runRecord.log('信息', `${pack} 版本 ${r.版本}${r.existed ? '（同内容已有）' : ''}：${Object.entries(r.结果.pointCounts).map(([k, n]) => `${k} ${n} 点`).join('，')}，${r.结果.群系.length} 种群系、${r.结果.surfaceBlocks.length} 种地表方块`);
    },
  },
  解码器: {
    用法: '解码器 [--检查]',
    跑: async (args) => {
      const p = parseArgs(args, { toggles: ['--检查'] });
      if (p.位置.length) throw new UsageError('模型随每个包在 bake、转码时自动训练，不再写代码表');
      const r = buildDecoder({ check: p.toggles.has('--检查') });
      console.log(`wasm/区段解码.ts → ${r.大小} 字节，sha256 ${r.sha256.slice(0, 12)}，${r.same ? '和生成文件一样' : '已写回'}`);
      return 0;
    },
  },
  edit: {
    用法: 'edit check|replay <世界> [--到 <目录>]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--到'] });
      const [action, worldName] = p.位置;
      if ((action !== 'check' && action !== 'replay') || !worldName || p.位置.length !== 2) throw new UsageError('写 edit check <世界> 或 edit replay <世界>');
      const w = readDecl(worldName);
      const e = await loadEdits(w);
      if (!e) {
        console.log(`${worldName} 没有编辑文件（${relPath(editFile(worldName))}）`);
        return action === 'check' ? 0 : 1;
      }
      if (action === 'check') {
        console.log(`${relPath(e.文件)}：${e.步.length} 条命令，都过了方块表校验；sha256 ${e.sha256.slice(0, 12)}`);
        for (const s of e.步) console.log(`  ${s.出处}：${s.原文}`);
        for (const [k, v] of Object.entries(e.structMissingStates)) console.log(`  注意：结构 ${k} 里 ${v.length} 种状态方块表没有（烘焙时进 缺失.tsv，画不出来）：${v.slice(0, 8).join('、')}${v.length > 8 ? '…' : ''}`);
        return 0;
      }
      const r = buildReplay(e, w.维度);
      const dir = p.值['--到'] ? path.resolve(p.值['--到']) : worldDraftDir();
      fs.mkdirSync(dir, { recursive: true });
      const basePath = path.join(dir, `${worldName}.重放`);
      fs.writeFileSync(`${basePath}.mcfunction`, [...r.loads, ...r.命令, ...r.unloadCmds].join('\n') + '\n');
      fs.writeFileSync(`${basePath}.sh`, buildReplayScript(r, `anim world edit replay ${worldName} 生成：在游戏里重放 ${relPath(e.文件)}（${e.步.length} 条命令，sha256 ${e.sha256.slice(0, 12)}）`), { mode: 0o755 });
      for (const x of r.警告) console.log(`注意：${x}`);
      console.log(`${r.命令.length} 条命令（另 ${r.loads.length} 条 forceload），只生成不执行：\n  ${basePath}.sh（anim mcai batch，游戏要开着）\n  ${basePath}.mcfunction（放进数据包 /function 跑也行）`);
      runRecord.产物.push(`${basePath}.sh`, `${basePath}.mcfunction`);
    },
  },
  pregen: {
    用法: 'pregen <世界> [--块 <名> | --两角 <x1,z1,x2,z2>] [--执行 [--沙盒] [--存档 <世界目录>] [--服务端 <服务端目录>] [--堆 12G] [--生成线程 <n>] [--卡住分钟 10] [--老年代上限 90] [--最多无进度重启 3] [--不补洞] [--重来]]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--块', '--两角', '--存档', '--服务端', '--堆', '--生成线程', '--卡住分钟', '--老年代上限', '--最多无进度重启'], toggles: ['--执行', '--沙盒', '--不补洞', '--重来'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名');
      const w = readDecl(p.位置[0]!);
      if (p.值['--块'] && p.值['--两角']) throw new UsageError('--块 和 --两角 只给一个');
      const tempCornerBlocks = p.值['--两角'] ? [boxFromCorners(p.值['--两角'])] : [];
      const plan = pregenPlans(w, p.值['--块'], tempCornerBlocks);
      if (!plan.length) {
        console.log(`${w.名称} 没写 [[预生成.块]]`);
        return 0;
      }
      if (!p.toggles.has('--执行')) {
        console.log(`只打印、不执行（--执行 才开服跑，过资源闸；--沙盒 先把服务端和存档克隆到数据根 run/沙盒/ 再跑）：`);
        for (const k of plan) {
          console.log(`\n# ${k.块.名}：${k.块.形状 === '走廊' ? `走廊 ${k.块.折线!.map((x) => x.join(',')).join(' → ')}，半宽 ${k.块.半宽}` : k.块.形状 === '区块表' ? `区块表 ${k.块.文件}` : `中心 ${k.selection.中心.join(', ')}，半边 ${k.selection.半边.join(' × ')}`}，${k.区块数} 个区块${k.块.依据 ? `（${k.块.依据}）` : ''}`);
          if (k.pattern === 'csv') {
            const f = path.join(worldDraftDir(), `${k.csvName}.csv`);
            fs.writeFileSync(f, csvText(k.区块!));
            console.log(`# 区块列表写到 ${f}，执行时拷进 <服务端>/config/chunky/${k.csvName}.csv`);
          }
          for (const c of printCommands(k)) console.log(c);
        }
        if (w.预生成.区块数) console.log(`\n声明里记的存档区块数：${w.预生成.区块数}`);
        return 0;
      }
      const numFlag = (k: string, defaultValue?: number) => {
        const v = p.值[k];
        if (v === undefined) return defaultValue;
        const n = Number(v);
        if (!(n > 0)) throw new UsageError(`${k} 要是正数`);
        return n;
      };
      const genThreads = numFlag('--生成线程');
      if (genThreads !== undefined && !Number.isInteger(genThreads)) throw new UsageError('--生成线程 要是正整数');
      const maxNoProgress = numFlag('--最多无进度重启');
      if (maxNoProgress !== undefined && !Number.isInteger(maxNoProgress)) throw new UsageError('--最多无进度重启 要是正整数');
      let serverDir = p.值['--服务端'] ? path.resolve(p.值['--服务端']) : path.join(config('游戏'), w.服务端);
      let saveDir = declSaveDir(w, p.值['--存档']);
      let logDir = dataPath('run', '预生成', w.名称);
      const chunky = await fetchJar('chunky', { 说: (s) => console.log(s) });
      if (p.toggles.has('--沙盒')) {
        const b = makeSandbox(serverDir, saveDir, w.名称);
        console.log(`沙盒 ${b.根}：服务端、存档都是克隆，原来的不动`);
        [serverDir, saveDir, logDir] = [b.服务端, b.存档, path.join(b.根, '预生成')];
        runRecord.产物.push(b.根);
      }
      for (const k of plan) {
        const st = await runBlock(k, {
          世界: w.名称,
          维度: w.维度,
          serverDir,
          存档: saveDir,
          loaderVersion: loaderVersion(w),
          chunky,
          logDir,
          heap: p.值['--堆'],
          genThreads,
          stuckMinutes: numFlag('--卡住分钟'),
          oldGenLimit: numFlag('--老年代上限'),
          maxNoProgressRestarts: maxNoProgress,
          skipHoleFill: p.toggles.has('--不补洞'),
          fromScratch: p.toggles.has('--重来'),
          说: (s) => console.log(s),
        });
        runRecord.log('信息', `${k.块.名}：${Object.entries(st.完成).map(([a, b]) => `${a} ${b!.区块} 区块 ${b!.用时}`).join('，')}，起服 ${st.起服.length} 次`);
      }
      runRecord.产物.push(logDir);
    },
  },
  server: {
    用法: 'server <世界> [--存档 <世界目录>] [--服务端 <服务端目录>] [--沙盒] [--堆 <G>] -- <命令…>（sleep:<秒>、wait:<一句话>、expect:<一句话>）',
    跑: async (args) => {
      const separatorIndex = args.indexOf('--');
      const p = parseArgs(separatorIndex < 0 ? args : args.slice(0, separatorIndex), { 值: ['--存档', '--服务端', '--堆'], toggles: ['--沙盒'] });
      const commands = separatorIndex < 0 ? [] : args.slice(separatorIndex + 1);
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名，命令写在 -- 后面');
      const w = readDecl(p.位置[0]!);
      let serverDir = p.值['--服务端'] ? path.resolve(p.值['--服务端']) : path.join(config('游戏'), w.服务端);
      let saveDir = declSaveDir(w, p.值['--存档']);
      if (p.toggles.has('--沙盒')) ({ 服务端: serverDir, 存档: saveDir } = makeSandbox(serverDir, saveDir, w.名称));
      return passGate(() => runServerCommand(serverDir, saveDir, loaderVersion(w), p.值['--堆'], commands));
    },
  },
  'install-server': {
    用法: 'install-server <世界> [--服务端 <服务端目录>] [--同意EULA] [--不装加载器]',
    跑: async (args) => {
      const p = parseArgs(args, { 值: ['--服务端'], toggles: ['--同意EULA', '--不装加载器'] });
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名（装它声明的 服务端 目录、Forge、模组、第三方数据包）');
      const w = readDecl(p.位置[0]!);
      const serverDir = p.值['--服务端'] ? path.resolve(p.值['--服务端']) : path.join(config('游戏'), w.服务端);
      const r = await installServer({ 声明: w, 目录: serverDir, acceptEula: p.toggles.has('--同意EULA'), skipLoader: p.toggles.has('--不装加载器'), 说: (s) => console.log(s) });
      console.log(`${serverDir}：${r.loaderInstalled ? `装了 Forge ${w.Forge}` : 'Forge 原来就装着'}；新拷模组 ${r.newMods.length} 个${r.newMods.length ? `（${r.newMods.join('、')}）` : ''}；新拷数据包 ${r.newDatapacks.join('、') || '无'}`);
      for (const m of r.missingMods) console.log(`  缺模组 ${m}`);
      if (r.eula === '没写') console.log(`eula.txt 还没同意：读过 Minecraft EULA（https://aka.ms/MinecraftEULA）后自己把 ${path.join(serverDir, 'eula.txt')} 写成 eula=true，或重跑时加 --同意EULA（anim 不替人同意）`);
      return r.missingMods.length ? 1 : 0;
    },
  },
  new: {
    用法: 'new <世界> [--服务端 <服务端目录>] [--存档 <世界目录>] [--沙盒] [--堆 <G>] [--生成线程 <n>] [-- <命令…>]（按声明的种子、世界类型、生成结构、数据包建新存档）',
    跑: async (args, runRecord) => {
      const separatorIndex = args.indexOf('--');
      const p = parseArgs(separatorIndex < 0 ? args : args.slice(0, separatorIndex), { 值: ['--服务端', '--存档', '--堆', '--生成线程'], toggles: ['--沙盒'] });
      const commands = separatorIndex < 0 ? [] : args.slice(separatorIndex + 1);
      if (p.位置.length !== 1) throw new UsageError('要给一个世界名，建完要接着发的命令写在 -- 后面');
      const w = readDecl(p.位置[0]!);
      const threads = p.值['--生成线程'] ? Number(p.值['--生成线程']) : undefined;
      if (threads !== undefined && !(Number.isInteger(threads) && threads > 0)) throw new UsageError('--生成线程 要是正整数');
      let serverDir = p.值['--服务端'] ? path.resolve(p.值['--服务端']) : path.join(config('游戏'), w.服务端);
      // 给了 --服务端 又没给 --存档：新世界建在那个服务端目录下，不去动 ANIM_GAME 里同名的正式存档
      let saveDir = p.值['--存档'] || !p.值['--服务端'] ? declSaveDir(w, p.值['--存档']) : path.join(serverDir, path.basename(declSaveDir(w)));
      if (fs.existsSync(path.join(saveDir, 'level.dat'))) throw new Error(`世界已经有了（${saveDir}）；要重建先删掉它`);
      if (!fs.existsSync(serverDir)) throw new Error(`${serverDir} 不存在；anim world install-server ${w.名称} 先装服务端`);
      if (p.toggles.has('--沙盒')) {
        const b = makeNewWorldSandbox(serverDir, path.basename(saveDir), w.名称);
        console.log(`沙盒 ${b.根}：服务端是克隆，新世界建在里面，原服务端不动`);
        [serverDir, saveDir] = [b.服务端, b.存档];
        runRecord.产物.push(b.根);
      }
      const r = await passGate(() => buildWorld({ 声明: w, serverDir, 存档: saveDir, heap: p.值['--堆'], genThreads: threads, commands, 说: (s) => console.log(s) }));
      for (const x of r.核对) console.log(`核对：${x}`);
      console.log(`世界已建：${r.存档}（种子 ${w.种子}，${w.worldType}，${w.生成结构 ? '生成结构' : '结构全禁'}；数据包 ${r.数据包.join('、') || '无'}）\n下一步：anim world pregen ${w.名称} 看预生成命令，--执行 开服跑`);
      runRecord.产物.push(r.存档);
    },
  },
  freeze: {
    用法: 'freeze [<包…>] [--写]',
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { toggles: ['--写'] });
      let toWrite = 0;
      for (const r of await freeze(p.位置, { write: p.toggles.has('--写') })) {
        const relFile = relPath(r.文件);
        if (r.same) console.log(`${r.包}：版本 ${r.版本}，粗高度指纹 ${r.指纹}，和 ${relFile} 一样`);
        else {
          toWrite++;
          console.log(`${r.包}：版本 ${r.版本}，粗高度指纹 ${r.指纹}；${r.原 ? `冻结的是 ${r.原.版本}（${r.原.指纹}）` : '还没冻结'}${r.written ? `，已写 ${relFile}：用它编排的段都过期，航线、巡航高度跟着变，出静帧核对、重看配乐卡点` : '（加 --写 才写）'}`);
          if (r.written) runRecord.产物.push(r.文件);
        }
      }
      return toWrite && !p.toggles.has('--写') ? 1 : 0;
    },
  },
  ...QUERY_COMMANDS,
};

const worldHelp = () => Object.values(subCommands).map((c) => `  anim world ${c.用法}`).join('\n');

export const worldCommand: Record<string, Command> = {
  world: {
    help: worldHelp,
    用法: `world ${Object.values(subCommands)
      .map((c) => c.用法.split(' ')[0])
      .join('|')} …`,
    说明: '世界：list 列声明；bake 从存档烘区段包（套编辑层，过资源闸）；转码 把旧格式的包转成逐格预测压缩、没做可见变换的做上（只写新版本目录，逐格、逐网格核对）；解码器 重编 WASM、核对；edit check|replay 校验编辑、生成游戏里重放的命令；block、heightmap、map、slice 查方块、出图；install-server 装 Forge 服务端、模组、数据包；new 按声明建新存档；pregen 打印或执行预生成（起专用服务端跑 Chunky）；server 起服务端发命令；freeze 冻结粗高度。anim world help 看各子命令',
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
