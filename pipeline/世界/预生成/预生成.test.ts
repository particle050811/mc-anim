import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readDecl, type PregenBox } from '../声明.ts';
import { csvText, pregenPlans } from './计划.ts';
import { enclosingSquare, rectChunkBox } from './范围.ts';
import { taskFile, finishLine, isThisBlock, consecutiveNoProgress, readTasks, progressLine, runBlock } from './看守.ts';

describe('预生成范围', () => {
  it('矩形照 Chunky：中心对齐区块，半边向上取整到区块', () => {
    expect(rectChunkBox({ name: 'a', shape: '矩形', center: [39680, -1216], halfSide: [2560, 2560] })).toEqual({ cx0: 2320, cx1: 2640, cz0: -236, cz1: 84 });
    expect(rectChunkBox({ name: 'a', shape: '矩形', center: [-1, 17.5], halfSide: [1, 17] })).toEqual({ cx0: -2, cx1: 0, cz0: -1, cz1: 3 });
  });

  it('主世界-116 三块：岛、边城的区块数，航线走廊的区块列表和旧项目 主世界范围.py csv 逐字节一样', () => {
    const ps = pregenPlans(readDecl('主世界-116'));
    expect(ps.map((p) => [p.tile.name, p.chunkCount])).toEqual([
      ['岛', 321 * 321],
      ['边城', 385 * 385],
      ['航线', 318710],
    ]);
    const plan = ps[2]!;
    // 旧项目 game/取材服务端-主世界/config/chunky/mcai-d56cda699c.csv（10-05 预生成航线用的那份）的 sha256
    expect(createHash('sha256').update(csvText(plan.chunks!)).digest('hex')).toBe('34c725157133b71574582c1c99d3552d6d628337228b9c228ca5b622fb58ef09');
    // 选区和旧任务文件 config/chunky/tasks/minecraft/overworld.properties 记的一样
    expect(plan.selection).toEqual({ shape: 'square', center: [24648, -5336], halfSide: [12608, 12608] });
    expect(enclosingSquare(plan.chunks!)).toEqual({ center: [24648, -5336], halfSide: 12608 });
  });
});

describe('预生成看守', () => {
  it('认得出 Chunky 的进度行、完成行', () => {
    const progressMatch = progressLine.exec('[12:00:01] [Server thread/INFO] [Chunky/]: [Chunky] Task running for minecraft:overworld. Processed: 1234 chunks (1.20%), ETA: 1:02:03, Rate: 45.6 cps, Current: 10, -3');
    expect(progressMatch?.slice(1)).toEqual(['minecraft:overworld', '1234', '1.20', '45.6']);
    const finishedMatch = finishLine.exec('[Chunky] Task finished for minecraft:overworld. Processed: 121 chunks (100.00%), Total time: 0:00:09');
    expect(finishedMatch?.slice(1)).toEqual(['minecraft:overworld', '121', '100.00', '0:00:09']);
  });

  it('暂停着的任务是不是这一块：中心、半径、图案（csv 还要名字）都对上才算', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '看守-'));
    const f = taskFile(d, 'minecraft:overworld');
    expect(f).toBe(path.join(d, 'config', 'chunky', 'tasks', 'minecraft', 'overworld.properties'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'world=minecraft:overworld\ncancelled=false\ncenter-x=24648.0\ncenter-z=-5336.0\nradius=12608.0\nshape=square\npattern=csv\ncsv=anim-d56cda699c\n');
    const [, , plan] = pregenPlans(readDecl('主世界-116'));
    const t = readTasks(f);
    expect(t.cancelled).toBe('false');
    expect(isThisBlock(t, plan!)).toBe(true);
    expect(isThisBlock({ ...t, csv: 'mcai-d56cda699c' }, plan!)).toBe(false);
    const rectPlan = pregenPlans(readDecl('主世界-116'), undefined, [{ name: '临时', shape: '矩形', corners: [0, 0, 64, 32] }])[0]!;
    expect(isThisBlock({ 'center-x': '32', 'center-z': '16', radius: '32', 'radius-z': '16', pattern: 'region' }, rectPlan)).toBe(true);
    expect(isThisBlock({ 'center-x': '32', 'center-z': '16', radius: '32', 'radius-z': '32', pattern: 'region' }, rectPlan)).toBe(false);
    fs.rmSync(d, { recursive: true });
  });
});

describe('预生成看守：连着没进度就放弃', () => {
  const makeEntry = (chunkCount: number | null, o: { completed?: boolean; stage?: '主' | '补洞'; endedAt?: boolean } = {}) => ({
    stage: o.stage ?? ('主' as const),
    startedAt: 't',
    endedAt: o.endedAt === false ? undefined : 't',
    command: [],
    lastProgress: chunkCount === null ? null : { chunks: chunkCount, percent: 0, speed: 0, time: 't' },
    completed: o.completed ? { chunks: chunkCount ?? 0, percent: 100, elapsed: '0:00:01', time: 't' } : null,
  });

  it('进度比之前最高值大就清零，不大（含没有进度行）每次加一', () => {
    expect(consecutiveNoProgress([], '主')).toBe(0);
    expect(consecutiveNoProgress([makeEntry(100), makeEntry(100), makeEntry(90), makeEntry(null)], '主')).toBe(3);
    expect(consecutiveNoProgress([makeEntry(100), makeEntry(100), makeEntry(200)], '主')).toBe(0);
    expect(consecutiveNoProgress([makeEntry(null), makeEntry(null)], '主')).toBe(2);
    // 跑完算有进度；补洞是另一个阶段，从自己的最高值数起
    expect(consecutiveNoProgress([makeEntry(100), makeEntry(100), makeEntry(100, { completed: true }), makeEntry(50, { stage: '补洞' }), makeEntry(50, { stage: '补洞' })], '补洞')).toBe(1);
    expect(consecutiveNoProgress([makeEntry(100), makeEntry(100, { stage: '补洞' }), makeEntry(100, { stage: '补洞' })], '主')).toBe(0);
    // 看守被杀留下的、没有结束的记录不算一次失败
    expect(consecutiveNoProgress([makeEntry(100), makeEntry(null, { endedAt: false })], '主')).toBe(0);
  });

  // 假的 java 当服务端：按 FAKE_MODE 打进度行。stuck = 每次起服都停在 100 个区块不动；progress = 每次多 100，第三次起服跑完
  // 配置读一次就缓存，ANIM_JAVA_HOME 要在第一次读之前设好：假 java 建一份各用例共用，模式走环境变量 FAKE_MODE
  const jdk = fs.mkdtempSync(path.join(os.tmpdir(), '看守假java-'));
  beforeAll(() => {
    process.env.ANIM_JAVA_HOME = jdk;
  });
  afterAll(() => {
    delete process.env.ANIM_JAVA_HOME;
    fs.rmSync(jdk, { recursive: true, force: true });
  });

  const buildFixture = (fakeMode: 'stuck' | 'progress') => {
    process.env.FAKE_MODE = fakeMode;
    const server = fs.mkdtempSync(path.join(os.tmpdir(), '看守假服-')), root = fs.mkdtempSync(path.join(os.tmpdir(), '看守假根-'));
    fs.mkdirSync(path.join(jdk, 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(jdk, '假服.mjs'),
      `import fs from 'node:fs';
import readline from 'node:readline';
const 模式 = process.env.FAKE_MODE;
const count = fs.existsSync('启动次数') ? Number(fs.readFileSync('启动次数', 'utf8')) + 1 : 1;
fs.writeFileSync('启动次数', String(count));
console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"');
const 回 = { 'chunky world': 'World changed to', 'chunky shape': 'Shape changed to square', 'chunky center': 'Center changed to', 'chunky radius': 'Radius changed to', 'chunky pattern': 'Pattern changed to region' };
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  if (l === 'stop') process.exit(0);
  const k = Object.keys(回).find((k) => l.startsWith(k));
  if (k) return console.log(回[k]);
  if (l === 'chunky start') {
    console.log('Task started in minecraft:overworld');
    const n = 模式 === 'stuck' ? 100 : 100 * count;
    console.log('[Chunky] Task running for minecraft:overworld. Processed: ' + n + ' chunks (1.00%), ETA: 1:00:00, Rate: 5.0 cps, Current: 0, 0');
    if (模式 === 'progress' && count >= 3) console.log('[Chunky] Task finished for minecraft:overworld. Processed: ' + n + ' chunks (100.00%), Total time: 0:00:09');
  }
});
`,
    );
    fs.writeFileSync(path.join(jdk, 'bin', 'java'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/../假服.mjs" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(server, 'eula.txt'), 'eula=true\n');
    fs.writeFileSync(path.join(server, 'server.jar'), '');
    fs.mkdirSync(path.join(server, 'mods'));
    const world = path.join(root, '某世界');
    fs.mkdirSync(world);
    fs.writeFileSync(path.join(world, 'level.dat'), '');
    fs.writeFileSync(path.join(root, 'Chunky-test.jar'), 'x');
    const pregenBlock: PregenBox = { name: '小', shape: '矩形', corners: [0, 0, 64, 64] };
    const plan = pregenPlans({ ...readDecl('主世界-116'), pregen: { tile: [pregenBlock] } })[0]!;
    const options = { world: '某世界', dimension: 'minecraft:overworld', serverDir: server, save: world, chunky: path.join(root, 'Chunky-test.jar'), logDir: path.join(root, '日志'), skipGate: true, skipHoleFill: true, watchIntervalSec: 0.2, stuckMinutes: 0.015, 说: () => {} };
    return { plan, options, cleanup: () => { for (const d of [server, root]) fs.rmSync(d, { recursive: true, force: true }); } };
  };

  it.skipIf(process.platform === 'win32')('每次起服都停在同一个区块数：到上限就报错放弃，状态留着，起服次数不超过上限', async () => {
    const { plan, options, cleanup } = buildFixture('stuck');
    try {
      await expect(runBlock(plan, { ...options, maxNoProgressRestarts: 2 })).rejects.toThrow(/连着 2 次重启都没有新进度（Chunky 停在 100 个区块/);
      const st = JSON.parse(fs.readFileSync(path.join(options.logDir, '小.状态.json'), 'utf8'));
      expect(st.serverStarts).toHaveLength(3); // 第一次有进度（0 → 100），后两次没有
      expect(st.serverStarts.every((r: { stopReason: string }) => r.stopReason.startsWith('卡住'))).toBe(true);
    } finally {
      cleanup();
    }
  }, 60_000);

  it.skipIf(process.platform === 'win32')('每次起服都多跑一点：不受上限影响，跑完为止', async () => {
    const { plan, options, cleanup } = buildFixture('progress');
    try {
      const st = await runBlock(plan, { ...options, maxNoProgressRestarts: 1 });
      expect(st.stage).toBe('完');
      expect(st.completed['主']?.chunks).toBe(300);
    } finally {
      cleanup();
    }
  }, 60_000);
});
