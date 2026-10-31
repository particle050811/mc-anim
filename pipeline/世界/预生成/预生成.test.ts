import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { 读声明, type 预生成块 } from '../声明.ts';
import { csv文本, 预生成计划们 } from './计划.ts';
import { 外包方形, 矩形区块 } from './范围.ts';
import { 任务文件, 完成行, 是这一块, 连续无进度, 读任务, 进度行, 跑一块 } from './看守.ts';

describe('预生成范围', () => {
  it('矩形照 Chunky：中心对齐区块，半边向上取整到区块', () => {
    expect(矩形区块({ 名: 'a', 形状: '矩形', 中心: [39680, -1216], 半边: [2560, 2560] })).toEqual({ cx0: 2320, cx1: 2640, cz0: -236, cz1: 84 });
    expect(矩形区块({ 名: 'a', 形状: '矩形', 中心: [-1, 17.5], 半边: [1, 17] })).toEqual({ cx0: -2, cx1: 0, cz0: -1, cz1: 3 });
  });

  it('主世界-116 三块：岛、边城的区块数，航线走廊的区块列表和旧项目 主世界范围.py csv 逐字节一样', () => {
    const ps = 预生成计划们(读声明('主世界-116'));
    expect(ps.map((p) => [p.块.名, p.区块数])).toEqual([
      ['岛', 321 * 321],
      ['边城', 385 * 385],
      ['航线', 318710],
    ]);
    const 线 = ps[2]!;
    // 旧项目 game/取材服务端-主世界/config/chunky/mcai-d56cda699c.csv（10-05 预生成航线用的那份）的 sha256
    expect(createHash('sha256').update(csv文本(线.区块!)).digest('hex')).toBe('34c725157133b71574582c1c99d3552d6d628337228b9c228ca5b622fb58ef09');
    // 选区和旧任务文件 config/chunky/tasks/minecraft/overworld.properties 记的一样
    expect(线.选区).toEqual({ 形状: 'square', 中心: [24648, -5336], 半边: [12608, 12608] });
    expect(外包方形(线.区块!)).toEqual({ 中心: [24648, -5336], 半边: 12608 });
  });
});

describe('预生成看守', () => {
  it('认得出 Chunky 的进度行、完成行', () => {
    const 进 = 进度行.exec('[12:00:01] [Server thread/INFO] [Chunky/]: [Chunky] Task running for minecraft:overworld. Processed: 1234 chunks (1.20%), ETA: 1:02:03, Rate: 45.6 cps, Current: 10, -3');
    expect(进?.slice(1)).toEqual(['minecraft:overworld', '1234', '1.20', '45.6']);
    const 完 = 完成行.exec('[Chunky] Task finished for minecraft:overworld. Processed: 121 chunks (100.00%), Total time: 0:00:09');
    expect(完?.slice(1)).toEqual(['minecraft:overworld', '121', '100.00', '0:00:09']);
  });

  it('暂停着的任务是不是这一块：中心、半径、图案（csv 还要名字）都对上才算', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '看守-'));
    const f = 任务文件(d, 'minecraft:overworld');
    expect(f).toBe(path.join(d, 'config', 'chunky', 'tasks', 'minecraft', 'overworld.properties'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 'world=minecraft:overworld\ncancelled=false\ncenter-x=24648.0\ncenter-z=-5336.0\nradius=12608.0\nshape=square\npattern=csv\ncsv=anim-d56cda699c\n');
    const [, , 线] = 预生成计划们(读声明('主世界-116'));
    const t = 读任务(f);
    expect(t.cancelled).toBe('false');
    expect(是这一块(t, 线!)).toBe(true);
    expect(是这一块({ ...t, csv: 'mcai-d56cda699c' }, 线!)).toBe(false);
    const 矩 = 预生成计划们(读声明('主世界-116'), undefined, [{ 名: '临时', 形状: '矩形', 两角: [0, 0, 64, 32] }])[0]!;
    expect(是这一块({ 'center-x': '32', 'center-z': '16', radius: '32', 'radius-z': '16', pattern: 'region' }, 矩)).toBe(true);
    expect(是这一块({ 'center-x': '32', 'center-z': '16', radius: '32', 'radius-z': '32', pattern: 'region' }, 矩)).toBe(false);
    fs.rmSync(d, { recursive: true });
  });
});

describe('预生成看守：连着没进度就放弃', () => {
  const 起 = (区块: number | null, o: { 完成?: boolean; 阶段?: '主' | '补洞'; 结束?: boolean } = {}) => ({
    阶段: o.阶段 ?? ('主' as const),
    开始: 't',
    结束: o.结束 === false ? undefined : 't',
    命令: [],
    最后进度: 区块 === null ? null : { 区块, 百分比: 0, 速度: 0, 时间: 't' },
    完成: o.完成 ? { 区块: 区块 ?? 0, 百分比: 100, 用时: '0:00:01', 时间: 't' } : null,
  });

  it('进度比之前最高值大就清零，不大（含没有进度行）每次加一', () => {
    expect(连续无进度([], '主')).toBe(0);
    expect(连续无进度([起(100), 起(100), 起(90), 起(null)], '主')).toBe(3);
    expect(连续无进度([起(100), 起(100), 起(200)], '主')).toBe(0);
    expect(连续无进度([起(null), 起(null)], '主')).toBe(2);
    // 跑完算有进度；补洞是另一个阶段，从自己的最高值数起
    expect(连续无进度([起(100), 起(100), 起(100, { 完成: true }), 起(50, { 阶段: '补洞' }), 起(50, { 阶段: '补洞' })], '补洞')).toBe(1);
    expect(连续无进度([起(100), 起(100, { 阶段: '补洞' }), 起(100, { 阶段: '补洞' })], '主')).toBe(0);
    // 看守被杀留下的、没有结束的记录不算一次失败
    expect(连续无进度([起(100), 起(null, { 结束: false })], '主')).toBe(0);
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

  const 搭 = (模式: 'stuck' | 'progress') => {
    process.env.FAKE_MODE = 模式;
    const 服 = fs.mkdtempSync(path.join(os.tmpdir(), '看守假服-')), 根 = fs.mkdtempSync(path.join(os.tmpdir(), '看守假根-'));
    fs.mkdirSync(path.join(jdk, 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(jdk, '假服.mjs'),
      `import fs from 'node:fs';
import readline from 'node:readline';
const 模式 = process.env.FAKE_MODE;
const 次 = fs.existsSync('启动次数') ? Number(fs.readFileSync('启动次数', 'utf8')) + 1 : 1;
fs.writeFileSync('启动次数', String(次));
console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"');
const 回 = { 'chunky world': 'World changed to', 'chunky shape': 'Shape changed to square', 'chunky center': 'Center changed to', 'chunky radius': 'Radius changed to', 'chunky pattern': 'Pattern changed to region' };
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  if (l === 'stop') process.exit(0);
  const k = Object.keys(回).find((k) => l.startsWith(k));
  if (k) return console.log(回[k]);
  if (l === 'chunky start') {
    console.log('Task started in minecraft:overworld');
    const n = 模式 === 'stuck' ? 100 : 100 * 次;
    console.log('[Chunky] Task running for minecraft:overworld. Processed: ' + n + ' chunks (1.00%), ETA: 1:00:00, Rate: 5.0 cps, Current: 0, 0');
    if (模式 === 'progress' && 次 >= 3) console.log('[Chunky] Task finished for minecraft:overworld. Processed: ' + n + ' chunks (100.00%), Total time: 0:00:09');
  }
});
`,
    );
    fs.writeFileSync(path.join(jdk, 'bin', 'java'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/../假服.mjs" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(服, 'eula.txt'), 'eula=true\n');
    fs.writeFileSync(path.join(服, 'server.jar'), '');
    fs.mkdirSync(path.join(服, 'mods'));
    const 世 = path.join(根, '某世界');
    fs.mkdirSync(世);
    fs.writeFileSync(path.join(世, 'level.dat'), '');
    fs.writeFileSync(path.join(根, 'Chunky-test.jar'), 'x');
    const 块: 预生成块 = { 名: '小', 形状: '矩形', 两角: [0, 0, 64, 64] };
    const 计划 = 预生成计划们({ ...读声明('主世界-116'), 预生成: { 块: [块] } })[0]!;
    const 选项 = { 世界: '某世界', 维度: 'minecraft:overworld', 服务端目录: 服, 存档: 世, chunky: path.join(根, 'Chunky-test.jar'), 日志目录: path.join(根, '日志'), 不过闸: true, 不补洞: true, 盯间隔秒: 0.2, 卡住分钟: 0.015, 说: () => {} };
    return { 计划, 选项, 清理: () => { for (const d of [服, 根]) fs.rmSync(d, { recursive: true, force: true }); } };
  };

  it.skipIf(process.platform === 'win32')('每次起服都停在同一个区块数：到上限就报错放弃，状态留着，起服次数不超过上限', async () => {
    const { 计划, 选项, 清理 } = 搭('stuck');
    try {
      await expect(跑一块(计划, { ...选项, 最多无进度重启: 2 })).rejects.toThrow(/连着 2 次重启都没有新进度（Chunky 停在 100 个区块/);
      const st = JSON.parse(fs.readFileSync(path.join(选项.日志目录, '小.状态.json'), 'utf8'));
      expect(st.起服).toHaveLength(3); // 第一次有进度（0 → 100），后两次没有
      expect(st.起服.every((r: { 停服原因: string }) => r.停服原因.startsWith('卡住'))).toBe(true);
    } finally {
      清理();
    }
  }, 60_000);

  it.skipIf(process.platform === 'win32')('每次起服都多跑一点：不受上限影响，跑完为止', async () => {
    const { 计划, 选项, 清理 } = 搭('progress');
    try {
      const st = await 跑一块(计划, { ...选项, 最多无进度重启: 1 });
      expect(st.阶段).toBe('完');
      expect(st.完成['主']?.区块).toBe(300);
    } finally {
      清理();
    }
  }, 60_000);
});
