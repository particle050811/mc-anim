import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { 解析声明 } from '../声明.ts';
import { 装服务端, 默认属性 } from './安装.ts';
import { 建世界, 改属性文本, 找数据包 } from './建世界.ts';
import { 开服要有的日志 } from './核对.ts';
import { 建新世界沙盒 } from './沙盒.ts';
import { 写zip } from './测试夹具.ts';

const 临时 = () => fs.mkdtempSync(path.join(os.tmpdir(), '建世界-'));

// 配置读一次就缓存，ANIM_JAVA_HOME 要在第一次读之前设好：假 java 建一份各用例共用，行为走环境变量
// 假服务端：开服时把 server.properties 里的三项和 datapacks/ 里有什么打出来，建 <universe>/<world>/level.dat；
// 假安装器（-jar x --installServer）在当前目录建 libraries/…/unix_args.txt、win_args.txt
const jdk = fs.mkdtempSync(path.join(os.tmpdir(), '建世界假java-'));
beforeAll(() => {
  fs.mkdirSync(path.join(jdk, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(jdk, '假.mjs'),
    `import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const a = process.argv.slice(2);
if (a.includes('--installServer')) {
  const d = 'libraries/net/minecraftforge/forge/1.20.1-47.4.10';
  fs.mkdirSync(d, { recursive: true });
  for (const f of ['unix_args.txt', 'win_args.txt']) fs.writeFileSync(path.join(d, f), '');
  console.log('假安装器装完了');
  process.exit(0);
}
const props = fs.readFileSync('server.properties', 'utf8');
console.log('PROPS ' + props.split('\\n').filter((l) => /^(level-seed|level-type|generate-structures)=/.test(l)).join(' '));
const world = path.join(a.includes('--universe') ? a[a.indexOf('--universe') + 1] : '.', a[a.indexOf('--world') + 1]);
console.log('PACKS ' + (fs.existsSync(path.join(world, 'datapacks')) ? fs.readdirSync(path.join(world, 'datapacks')).sort().join(',') : ''));
if (process.env.FAKE_LOG !== '无') console.log('[Server thread/INFO] [mcai.TwilightGrid/]: 暮色地标网格：64 区块');
console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"');
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  if (l === 'stop') { fs.mkdirSync(world, { recursive: true }); fs.writeFileSync(path.join(world, 'level.dat'), 'x'); process.exit(0); }
  if (l === 'save-all flush') console.log('Saved the game');
  if (l === 'datapack list enabled') console.log('There are 2 data pack(s) enabled: [vanilla (built-in)], [file/暮色放大4倍 (world)]');
  console.log('收到 ' + l);
});
`,
  );
  fs.writeFileSync(path.join(jdk, 'bin', 'java'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/../假.mjs" "$@"\n`, { mode: 0o755 });
  process.env.ANIM_JAVA_HOME = jdk;
});
afterAll(() => {
  delete process.env.ANIM_JAVA_HOME;
  delete process.env.FAKE_LOG;
  fs.rmSync(jdk, { recursive: true, force: true });
});

const 声明 = (数据包: string[], 额外 = '') =>
  解析声明(`"名称" = "测试新世界"\n"服务端" = "某服务端"\n"维度" = "minecraft:overworld"\n"种子" = 1752\n"Forge" = "1.20.1-47.4.10"\n"数据包" = ${JSON.stringify(数据包)}\n${额外}`, '测试新世界');

const 搭服务端 = (mcai类?: string) => {
  const 服 = 临时();
  fs.writeFileSync(path.join(服, 'eula.txt'), 'eula=true\n');
  fs.writeFileSync(path.join(服, 'server.jar'), '');
  fs.writeFileSync(path.join(服, 'server.properties'), 'level-seed=20260930\nlevel-type=minecraft\\:normal\ngenerate-structures=true\nmotd=原样\n');
  fs.mkdirSync(path.join(服, 'mods'));
  if (mcai类) 写zip(path.join(服, 'mods', 'mcai-0.1.0.jar'), { [mcai类]: '' });
  return 服;
};

describe('建新世界', () => {
  it('server.properties：改三项，没有就追加，level-type 的冒号转义', () => {
    expect(改属性文本('level-seed=1\nlevel-type=minecraft\\:normal\ngenerate-structures=true\nmotd=甲\n', { 种子: '116', 世界类型: 'minecraft:normal', 生成结构: false })).toBe(
      'level-seed=116\nlevel-type=minecraft\\:normal\ngenerate-structures=false\nmotd=甲\n',
    );
    expect(改属性文本('motd=甲', { 种子: '-7', 世界类型: 'minecraft:large_biomes', 生成结构: true })).toBe('motd=甲\nlevel-seed=-7\nlevel-type=minecraft\\:large_biomes\ngenerate-structures=true\n');
  });

  it('声明的 世界类型、生成结构 默认 normal、true，可改', () => {
    expect(声明([])).toMatchObject({ 世界类型: 'minecraft:normal', 生成结构: true });
    expect(声明([], '"生成结构" = false\n"世界类型" = "minecraft:large_biomes"\n')).toMatchObject({ 世界类型: 'minecraft:large_biomes', 生成结构: false });
  });

  it('数据包：sourcing/datapacks 里的目录、服务端 世界数据包/ 里的 zip 都找得到，找不到列出找过的地方', async () => {
    const 服 = 搭服务端();
    fs.mkdirSync(path.join(服, '世界数据包'));
    写zip(path.join(服, '世界数据包', '第三方.zip'), { 'pack.mcmeta': '{}' });
    expect(await 找数据包('通用/不生成龙巢', 服)).toMatch(/sourcing[\\/]datapacks[\\/]通用[\\/]不生成龙巢$/);
    expect(await 找数据包('第三方.zip', 服)).toBe(path.join(服, '世界数据包', '第三方.zip'));
    await expect(找数据包('没有这个包', 服)).rejects.toThrow(/找不到数据包「没有这个包」：找过 .*sourcing.*世界数据包/);
    fs.rmSync(服, { recursive: true });
  });

  it('开服后要有的日志：暮色放大包要「暮色地标网格：64 区块」，普通包不要', () => {
    const 世 = 临时();
    fs.mkdirSync(path.join(世, 'datapacks'));
    fs.cpSync(path.join(import.meta.dirname, '../../../sourcing/datapacks/暮色放大4倍'), path.join(世, 'datapacks', '暮色放大4倍'), { recursive: true });
    fs.cpSync(path.join(import.meta.dirname, '../../../sourcing/datapacks/通用/不生成龙巢'), path.join(世, 'datapacks', '不生成龙巢'), { recursive: true });
    expect(开服要有的日志(世)).toEqual([{ 包: '暮色放大4倍', 行: '暮色地标网格：64 区块' }]);
    fs.rmSync(世, { recursive: true });
  });

  it.skipIf(process.platform === 'win32')('建世界：放数据包、临时改属性、核对模组认出、建出 level.dat，属性文件改回原文', async () => {
    const 服 = 搭服务端('mcai/TwilightGrid.class'), 存档 = path.join(服, '新世界');
    const 说: string[] = [];
    const r = await 建世界({ 声明: 声明(['通用/不生成龙巢', '暮色放大4倍'], '"生成结构" = false\n'), 服务端目录: 服, 存档, 说: (s) => 说.push(s), 命令们: ['say 你好', 'expect:收到 say 你好'] }).catch((e) => {
      throw new Error(`${e.message}\n${说.join('\n')}`);
    });
    expect(r.数据包).toEqual(['不生成龙巢', '暮色放大4倍']);
    expect(r.核对).toEqual(['暮色地标网格：64 区块']);
    expect(fs.existsSync(path.join(存档, 'level.dat'))).toBe(true);
    expect(fs.readFileSync(path.join(服, 'server.properties'), 'utf8')).toBe('level-seed=20260930\nlevel-type=minecraft\\:normal\ngenerate-structures=true\nmotd=原样\n');
    expect(fs.existsSync(path.join(存档, 'datapacks', '暮色放大4倍', 'data', 'mcai', 'twilight_x4.json'))).toBe(true);
    // 假服务端开服时看到的属性和数据包（它打出来的行在 说 里没有，这里只验结果；属性在下面单独验）
    await expect(建世界({ 声明: 声明([]), 服务端目录: 服, 存档, 说: () => {} })).rejects.toThrow(/世界已经有了/);
    fs.rmSync(服, { recursive: true });
  }, 30_000);

  it.skipIf(process.platform === 'win32')('开服时服务端读到的是声明的种子、类型、结构开关', async () => {
    const 服 = 搭服务端(), 存档 = path.join(服, '新世界');
    const 行们: string[] = [];
    // 每行回调接不到（建世界不转发服务端输出），改看沙盒外的证据：直接起一个同样的假服务端读属性
    fs.writeFileSync(path.join(服, 'server.properties'), 改属性文本(fs.readFileSync(path.join(服, 'server.properties'), 'utf8'), { 种子: '1752', 世界类型: 'minecraft:normal', 生成结构: false }));
    const { 服务端 } = await import('./服务端.ts');
    const s = await 服务端.起({ 目录: 服, 存档, 允许新世界: true, 每行: (l) => 行们.push(l), 提示: () => {} });
    await s.停();
    expect(行们.find((l) => l.startsWith('PROPS '))).toBe('PROPS level-seed=1752 level-type=minecraft\\:normal generate-structures=false');
    fs.rmSync(服, { recursive: true });
  }, 30_000);

  it.skipIf(process.platform === 'win32')('数据包缺、mcai 缺类、日志里没认出：都拒绝，且不留下半截世界目录', async () => {
    const 服 = 搭服务端(), 存档 = path.join(服, '新世界');
    await expect(建世界({ 声明: 声明(['没有这个包']), 服务端目录: 服, 存档, 说: () => {} })).rejects.toThrow(/找不到数据包/);
    expect(fs.existsSync(存档)).toBe(false);
    await expect(建世界({ 声明: 声明(['暮色放大4倍']), 服务端目录: 服, 存档, 说: () => {} })).rejects.toThrow(/没有暮色地标网格/);
    expect(fs.existsSync(存档)).toBe(false);
    写zip(path.join(服, 'mods', 'mcai-0.1.0.jar'), { 'mcai/TwilightGrid.class': '' });
    process.env.FAKE_LOG = '无';
    await expect(建世界({ 声明: 声明(['暮色放大4倍']), 服务端目录: 服, 存档, 说: () => {} })).rejects.toThrow(/没有「暮色地标网格：64 区块」/);
    delete process.env.FAKE_LOG;
    expect(fs.readFileSync(path.join(服, 'server.properties'), 'utf8')).toContain('motd=原样');
    expect(fs.readFileSync(path.join(服, 'server.properties'), 'utf8')).toContain('level-seed=20260930');
    fs.writeFileSync(path.join(服, '杂物'), '');
    fs.rmSync(服, { recursive: true });
    const 服2 = 搭服务端(), 世2 = path.join(服2, '已有杂物');
    fs.mkdirSync(世2);
    fs.writeFileSync(path.join(世2, '文件'), '');
    await expect(建世界({ 声明: 声明([]), 服务端目录: 服2, 存档: 世2, 说: () => {} })).rejects.toThrow(/不是世界/);
    fs.rmSync(服2, { recursive: true });
  }, 30_000);

  it('沙盒：新世界沙盒只克隆服务端，存档路径给出但不存在', () => {
    const 服 = 搭服务端('mcai/TwilightGrid.class'), 根 = 临时();
    fs.mkdirSync(path.join(服, '旧世界'));
    fs.writeFileSync(path.join(服, '旧世界', 'level.dat'), '');
    const b = 建新世界沙盒(服, '新世界', '测试', 根);
    expect(fs.existsSync(path.join(b.服务端, 'server.properties'))).toBe(true);
    expect(fs.existsSync(path.join(b.服务端, '旧世界'))).toBe(false);
    expect(b.存档).toBe(path.join(b.根, '新世界'));
    expect(fs.existsSync(b.存档)).toBe(false);
    for (const d of [服, 根]) fs.rmSync(d, { recursive: true });
  });
});

describe('装 Forge 服务端', () => {
  it.skipIf(process.platform === 'win32')('空目录：跑安装器、写 server.properties、不替人同意 EULA；装过的不重装；加 --同意EULA 才写', async () => {
    const 根 = 临时(), 目录 = path.join(根, '新服务端');
    const 安装器 = path.join(根, 'installer.jar');
    fs.writeFileSync(安装器, '');
    const r = await 装服务端({ 声明: 声明([]), 目录, 安装器路径: 安装器, 说: () => {} });
    expect(r).toMatchObject({ 已装加载器: true, 缺模组: [], eula: '没写' });
    expect(fs.existsSync(path.join(目录, 'libraries/net/minecraftforge/forge/1.20.1-47.4.10/unix_args.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(目录, 'server.properties'), 'utf8')).toBe(默认属性('新服务端'));
    expect(fs.existsSync(path.join(目录, 'eula.txt'))).toBe(false);
    const r2 = await 装服务端({ 声明: 声明([]), 目录, 安装器路径: 安装器, 同意EULA: true, 说: () => {} });
    expect(r2).toMatchObject({ 已装加载器: false, eula: '已写' });
    expect(fs.readFileSync(path.join(目录, 'eula.txt'), 'utf8')).toContain('eula=true');
    // 不是空目录又不是装好的 Forge：不往里装
    const 杂 = path.join(根, '杂');
    fs.mkdirSync(杂);
    fs.writeFileSync(path.join(杂, '别人的文件'), '');
    await expect(装服务端({ 声明: 声明([]), 目录: 杂, 安装器路径: 安装器, 说: () => {} })).rejects.toThrow(/不是空的/);
    fs.rmSync(根, { recursive: true });
  }, 30_000);
});
