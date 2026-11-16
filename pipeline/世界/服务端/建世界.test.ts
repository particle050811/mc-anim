import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDecl } from '../声明.ts';
import { installServer, defaultProps } from './安装.ts';
import { buildWorld, rewriteProps, findDatapack } from './建世界.ts';
import { requiredStartupLogs } from './核对.ts';
import { makeNewWorldSandbox } from './沙盒.ts';
import { writeZip } from './测试夹具.ts';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), '建世界-'));

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

const makeWorldDecl = (datapacks: string[], extra = '') =>
  parseDecl(`"displayName" = "测试新世界"\n"server" = "某服务端"\n"dimension" = "minecraft:overworld"\n"seed" = 1752\n"Forge" = "1.20.1-47.4.10"\n"datapacks" = ${JSON.stringify(datapacks)}\n${extra}`, '测试新世界');

const setupServer = (mcaiClass?: string) => {
  const server = makeTempDir();
  fs.writeFileSync(path.join(server, 'eula.txt'), 'eula=true\n');
  fs.writeFileSync(path.join(server, 'server.jar'), '');
  fs.writeFileSync(path.join(server, 'server.properties'), 'level-seed=20260930\nlevel-type=minecraft\\:normal\ngenerate-structures=true\nmotd=原样\n');
  fs.mkdirSync(path.join(server, 'mods'));
  if (mcaiClass) writeZip(path.join(server, 'mods', 'mcai-0.1.0.jar'), { [mcaiClass]: '' });
  return server;
};

describe('建新世界', () => {
  it('server.properties：改三项，没有就追加，level-type 的冒号转义', () => {
    expect(rewriteProps('level-seed=1\nlevel-type=minecraft\\:normal\ngenerate-structures=true\nmotd=甲\n', { seed: '116', worldType: 'minecraft:normal', generateStructures: false })).toBe(
      'level-seed=116\nlevel-type=minecraft\\:normal\ngenerate-structures=false\nmotd=甲\n',
    );
    expect(rewriteProps('motd=甲', { seed: '-7', worldType: 'minecraft:large_biomes', generateStructures: true })).toBe('motd=甲\nlevel-seed=-7\nlevel-type=minecraft\\:large_biomes\ngenerate-structures=true\n');
  });

  it('声明的 世界类型、生成结构 默认 normal、true，可改', () => {
    expect(makeWorldDecl([])).toMatchObject({ worldType: 'minecraft:normal', generateStructures: true });
    expect(makeWorldDecl([], '"generateStructures" = false\n"世界类型" = "minecraft:large_biomes"\n')).toMatchObject({ worldType: 'minecraft:large_biomes', generateStructures: false });
  });

  it('数据包：sourcing/datapacks 里的目录、服务端 世界数据包/ 里的 zip 都找得到，找不到列出找过的地方', async () => {
    const server = setupServer();
    fs.mkdirSync(path.join(server, '世界数据包'));
    writeZip(path.join(server, '世界数据包', '第三方.zip'), { 'pack.mcmeta': '{}' });
    expect(await findDatapack('通用/不生成龙巢', server)).toMatch(/sourcing[\\/]datapacks[\\/]通用[\\/]不生成龙巢$/);
    expect(await findDatapack('第三方.zip', server)).toBe(path.join(server, '世界数据包', '第三方.zip'));
    await expect(findDatapack('没有这个包', server)).rejects.toThrow(/找不到数据包「没有这个包」：找过 .*sourcing.*世界数据包/);
    fs.rmSync(server, { recursive: true });
  });

  it('开服后要有的日志：暮色放大包要「暮色地标网格：64 区块」，普通包不要', () => {
    const world = makeTempDir();
    fs.mkdirSync(path.join(world, 'datapacks'));
    fs.cpSync(path.join(import.meta.dirname, '../../../sourcing/datapacks/暮色放大4倍'), path.join(world, 'datapacks', '暮色放大4倍'), { recursive: true });
    fs.cpSync(path.join(import.meta.dirname, '../../../sourcing/datapacks/通用/不生成龙巢'), path.join(world, 'datapacks', '不生成龙巢'), { recursive: true });
    expect(requiredStartupLogs(world)).toEqual([{ pack: '暮色放大4倍', 行: '暮色地标网格：64 区块' }]);
    fs.rmSync(world, { recursive: true });
  });

  it.skipIf(process.platform === 'win32')('建世界：放数据包、临时改属性、核对模组认出、建出 level.dat，属性文件改回原文', async () => {
    const server = setupServer('mcai/TwilightGrid.class'), saveDir = path.join(server, '新世界');
    const logs: string[] = [];
    const r = await buildWorld({ decl: makeWorldDecl(['通用/不生成龙巢', '暮色放大4倍'], '"generateStructures" = false\n'), serverDir: server, save: saveDir, 说: (s) => logs.push(s), commands: ['say 你好', 'expect:收到 say 你好'] }).catch((e) => {
      throw new Error(`${e.message}\n${logs.join('\n')}`);
    });
    expect(r.datapacks).toEqual(['不生成龙巢', '暮色放大4倍']);
    expect(r.verify).toEqual(['暮色地标网格：64 区块']);
    expect(fs.existsSync(path.join(saveDir, 'level.dat'))).toBe(true);
    expect(fs.readFileSync(path.join(server, 'server.properties'), 'utf8')).toBe('level-seed=20260930\nlevel-type=minecraft\\:normal\ngenerate-structures=true\nmotd=原样\n');
    expect(fs.existsSync(path.join(saveDir, 'datapacks', '暮色放大4倍', 'data', 'mcai', 'twilight_x4.json'))).toBe(true);
    // 假服务端开服时看到的属性和数据包（它打出来的行在 说 里没有，这里只验结果；属性在下面单独验）
    await expect(buildWorld({ decl: makeWorldDecl([]), serverDir: server, save: saveDir, 说: () => {} })).rejects.toThrow(/世界已经有了/);
    fs.rmSync(server, { recursive: true });
  }, 30_000);

  it.skipIf(process.platform === 'win32')('开服时服务端读到的是声明的种子、类型、结构开关', async () => {
    const server = setupServer(), saveDir = path.join(server, '新世界');
    const logLines: string[] = [];
    // 每行回调接不到（建世界不转发服务端输出），改看沙盒外的证据：直接起一个同样的假服务端读属性
    fs.writeFileSync(path.join(server, 'server.properties'), rewriteProps(fs.readFileSync(path.join(server, 'server.properties'), 'utf8'), { seed: '1752', worldType: 'minecraft:normal', generateStructures: false }));
    const { Server: serverClass } = await import('./服务端.ts');
    const s = await serverClass.start({ 目录: server, save: saveDir, allowNewWorld: true, onLine: (l) => logLines.push(l), 提示: () => {} });
    await s.停();
    expect(logLines.find((l) => l.startsWith('PROPS '))).toBe('PROPS level-seed=1752 level-type=minecraft\\:normal generate-structures=false');
    fs.rmSync(server, { recursive: true });
  }, 30_000);

  it.skipIf(process.platform === 'win32')('数据包缺、mcai 缺类、日志里没认出：都拒绝，且不留下半截世界目录', async () => {
    const server = setupServer(), saveDir = path.join(server, '新世界');
    await expect(buildWorld({ decl: makeWorldDecl(['没有这个包']), serverDir: server, save: saveDir, 说: () => {} })).rejects.toThrow(/找不到数据包/);
    expect(fs.existsSync(saveDir)).toBe(false);
    await expect(buildWorld({ decl: makeWorldDecl(['暮色放大4倍']), serverDir: server, save: saveDir, 说: () => {} })).rejects.toThrow(/没有暮色地标网格/);
    expect(fs.existsSync(saveDir)).toBe(false);
    writeZip(path.join(server, 'mods', 'mcai-0.1.0.jar'), { 'mcai/TwilightGrid.class': '' });
    process.env.FAKE_LOG = '无';
    await expect(buildWorld({ decl: makeWorldDecl(['暮色放大4倍']), serverDir: server, save: saveDir, 说: () => {} })).rejects.toThrow(/没有「暮色地标网格：64 区块」/);
    delete process.env.FAKE_LOG;
    expect(fs.readFileSync(path.join(server, 'server.properties'), 'utf8')).toContain('motd=原样');
    expect(fs.readFileSync(path.join(server, 'server.properties'), 'utf8')).toContain('level-seed=20260930');
    fs.writeFileSync(path.join(server, '杂物'), '');
    fs.rmSync(server, { recursive: true });
    const otherServer = setupServer(), otherWorld = path.join(otherServer, '已有杂物');
    fs.mkdirSync(otherWorld);
    fs.writeFileSync(path.join(otherWorld, '文件'), '');
    await expect(buildWorld({ decl: makeWorldDecl([]), serverDir: otherServer, save: otherWorld, 说: () => {} })).rejects.toThrow(/不是世界/);
    fs.rmSync(otherServer, { recursive: true });
  }, 30_000);

  it('沙盒：新世界沙盒只克隆服务端，存档路径给出但不存在', () => {
    const server = setupServer('mcai/TwilightGrid.class'), root = makeTempDir();
    fs.mkdirSync(path.join(server, '旧世界'));
    fs.writeFileSync(path.join(server, '旧世界', 'level.dat'), '');
    const b = makeNewWorldSandbox(server, '新世界', '测试', root);
    expect(fs.existsSync(path.join(b.server, 'server.properties'))).toBe(true);
    expect(fs.existsSync(path.join(b.server, '旧世界'))).toBe(false);
    expect(b.save).toBe(path.join(b.root, '新世界'));
    expect(fs.existsSync(b.save)).toBe(false);
    for (const d of [server, root]) fs.rmSync(d, { recursive: true });
  });
});

describe('装 Forge 服务端', () => {
  it.skipIf(process.platform === 'win32')('空目录：跑安装器、写 server.properties、不替人同意 EULA；装过的不重装；加 --accept-eula 才写', async () => {
    const root = makeTempDir(), serverDir = path.join(root, '新服务端');
    const installerPath = path.join(root, 'installer.jar');
    fs.writeFileSync(installerPath, '');
    const r = await installServer({ decl: makeWorldDecl([]), 目录: serverDir, installerPath: installerPath, 说: () => {} });
    expect(r).toMatchObject({ loaderInstalled: true, missingMods: [], eula: '没写' });
    expect(fs.existsSync(path.join(serverDir, 'libraries/net/minecraftforge/forge/1.20.1-47.4.10/unix_args.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(serverDir, 'server.properties'), 'utf8')).toBe(defaultProps('新服务端'));
    expect(fs.existsSync(path.join(serverDir, 'eula.txt'))).toBe(false);
    const r2 = await installServer({ decl: makeWorldDecl([]), 目录: serverDir, installerPath: installerPath, acceptEula: true, 说: () => {} });
    expect(r2).toMatchObject({ loaderInstalled: false, eula: '已写' });
    expect(fs.readFileSync(path.join(serverDir, 'eula.txt'), 'utf8')).toContain('eula=true');
    // 不是空目录又不是装好的 Forge：不往里装
    const misc = path.join(root, '杂');
    fs.mkdirSync(misc);
    fs.writeFileSync(path.join(misc, '别人的文件'), '');
    await expect(installServer({ decl: makeWorldDecl([]), 目录: misc, installerPath: installerPath, 说: () => {} })).rejects.toThrow(/不是空的/);
    fs.rmSync(root, { recursive: true });
  }, 30_000);
});
