import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeZip } from './测试夹具.ts';
import { parseEnabledPacks, checkBeforeStart, checkOrder } from './核对.ts';
import { startArgs, removeTempMods, Server, ENCODING_ARGS } from './服务端.ts';
import { ReadOnlyZip } from './zip.ts';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), '服务端-'));

describe('服务端', () => {
  it('zip：stored、deflate 都读得出', () => {
    const d = makeTempDir();
    writeZip(path.join(d, 'a.zip'), { 'a.txt': '甲', 'b/c.json': '{"x":1}' });
    const z = new ReadOnlyZip(path.join(d, 'a.zip'));
    expect(z.names()).toEqual(['a.txt', 'b/c.json']);
    expect(z.读('a.txt').toString()).toBe('甲');
    expect(z.读('b/c.json').toString()).toBe('{"x":1}');
    fs.rmSync(d, { recursive: true });
  });

  it('启动参数：认 Forge 的参数文件，几个版本时按声明挑；原版认 server.jar', () => {
    const d = makeTempDir();
    const argsFile = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
    for (const v of ['1.20.1-47.4.10', '1.20.1-47.2.0']) {
      fs.mkdirSync(path.join(d, 'libraries/net/minecraftforge/forge', v), { recursive: true });
      fs.writeFileSync(path.join(d, 'libraries/net/minecraftforge/forge', v, argsFile), '');
    }
    expect(() => startArgs(d)).toThrow(/几个版本/);
    expect(startArgs(d, '1.20.1-47.4.10')).toEqual([`@libraries/net/minecraftforge/forge/1.20.1-47.4.10/${argsFile}`, 'nogui']);
    const v = makeTempDir();
    fs.writeFileSync(path.join(v, 'server.jar'), '');
    expect(startArgs(v)).toEqual(['-jar', 'server.jar', 'nogui']);
    expect(() => startArgs(makeTempDir())).toThrow(/认不出/);
    fs.rmSync(d, { recursive: true });
  });

  it('上次没删的临时模组按记录删，人装的不动', () => {
    const d = makeTempDir();
    fs.mkdirSync(path.join(d, 'mods'));
    fs.writeFileSync(path.join(d, 'mods', 'Chunky.jar'), '');
    fs.writeFileSync(path.join(d, 'mods', '人装的.jar'), '');
    fs.writeFileSync(path.join(d, '.anim-临时模组.json'), JSON.stringify(['Chunky.jar']));
    expect(removeTempMods(d)).toEqual(['Chunky.jar']);
    expect(fs.readdirSync(path.join(d, 'mods'))).toEqual(['人装的.jar']);
    expect(removeTempMods(d)).toEqual([]);
    fs.rmSync(d, { recursive: true });
  });

  it('修整包要含修整类的 mcai jar，启用了还要排在它覆盖的包之上', () => {
    const server = makeTempDir(), world = makeTempDir();
    fs.mkdirSync(path.join(server, 'mods'));
    const dataPackDir = path.join(world, 'datapacks');
    fs.mkdirSync(path.join(dataPackDir, '主世界修整', 'data', 'minecraft', 'worldgen', 'density_function', 'overworld'), { recursive: true });
    fs.writeFileSync(path.join(dataPackDir, '主世界修整', 'pack.mcmeta'), '{}');
    fs.writeFileSync(path.join(dataPackDir, '主世界修整', 'data', 'minecraft', 'worldgen', 'density_function', 'overworld', 'continents.json'), '{"type":"mcai:edit"}');
    writeZip(path.join(dataPackDir, 'epicterrain.zip'), { 'pack.mcmeta': '{}', 'data/minecraft/worldgen/density_function/overworld/continents.json': '{}' });
    writeZip(path.join(server, 'mods', 'mcai-0.1.0.jar'), { 'mcai/Mcai.class': '' });
    expect(checkBeforeStart(server, world).issues.join()).toMatch(/主世界修整 用到生成时修整/);
    writeZip(path.join(server, 'mods', 'mcai-0.1.0.jar'), { 'mcai/terrain/TerrainTypes.class': '' });
    expect(checkBeforeStart(server, world)).toEqual({ issues: [], overrides: ['主世界修整'] });
    const line = 'There are 3 data pack(s) enabled: [vanilla (built-in)], [file/主世界修整 (world)], [file/epicterrain.zip (world)]';
    expect(parseEnabledPacks(line)).toEqual(['vanilla', 'file/主世界修整', 'file/epicterrain.zip']);
    expect(checkOrder(world, ['主世界修整'], parseEnabledPacks(line)).join()).toMatch(/排在 file\/epicterrain.zip 下面/);
    expect(checkOrder(world, ['主世界修整'], ['vanilla', 'file/epicterrain.zip', 'file/主世界修整'])).toEqual([]);
    expect(checkOrder(world, ['主世界修整'], ['vanilla'])).toHaveLength(1);
    fs.rmSync(server, { recursive: true });
    fs.rmSync(world, { recursive: true });
  });

  // 假的 java（node 脚本）当服务端：起服等 Done、发命令等回话、停服后 pid 文件和临时模组都撤掉，--universe/--world/--port 传对
  it.skipIf(process.platform === 'win32')('起服、发命令、停服：临时模组只在开着时在 mods/', async () => {
    const jdk = makeTempDir(), server = makeTempDir(), root = makeTempDir();
    fs.mkdirSync(path.join(jdk, 'bin'));
    fs.writeFileSync(
      path.join(jdk, '假服.mjs'),
      `import fs from 'node:fs';
import readline from 'node:readline';
console.log('ARGS ' + process.argv.slice(2).join(' '));
console.log('MODS ' + fs.readdirSync('mods').join(','));
console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"');
readline.createInterface({ input: process.stdin }).on('line', (l) => {
  if (l === 'stop') { console.log('Stopping the server'); process.exit(0); }
  console.log('收到 ' + l);
});
`,
    );
    fs.writeFileSync(path.join(jdk, 'bin', 'java'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/../假服.mjs" "$@"\n`, { mode: 0o755 });
    process.env.ANIM_JAVA_HOME = jdk;
    fs.writeFileSync(path.join(server, 'eula.txt'), 'eula=true\n');
    fs.writeFileSync(path.join(server, 'server.jar'), '');
    fs.mkdirSync(path.join(server, 'mods'));
    const world = path.join(root, '某世界');
    fs.mkdirSync(world);
    fs.writeFileSync(path.join(world, 'level.dat'), '');
    const jar = path.join(root, 'Chunky-test.jar');
    fs.writeFileSync(jar, 'x');
    const logLines: string[] = [];
    const s = await Server.起({ 目录: server, 存档: world, tempMods: [jar], onLine: (l) => logLines.push(l), 提示: () => {}, readyTimeoutSec: 20 });
    expect(logLines.find((l) => l.startsWith('ARGS '))).toBe(`ARGS -Xmx12G ${ENCODING_ARGS.join(' ')} -jar server.jar nogui --universe ${root} --world 某世界 --port ${s.port}`);
    expect(logLines).toContain('MODS Chunky-test.jar');
    expect(fs.existsSync(path.join(server, '.anim-服务端.pid'))).toBe(true);
    s.发('chunky start');
    expect(await s.等('收到 chunky start', 10)).toBe('收到 chunky start');
    expect(await s.等('不会出现', 0.2)).toBeNull();
    expect(await s.停()).toBe(0);
    expect(s.running).toBe(false);
    // 存档就在服务端目录下：不给 --universe（给了 Forge 会拒绝）
    fs.mkdirSync(path.join(server, '本地世界'));
    fs.writeFileSync(path.join(server, '本地世界', 'level.dat'), '');
    const lines: string[] = [];
    const s2 = await Server.起({ 目录: server, 存档: path.join(server, '本地世界'), onLine: (l) => lines.push(l), 提示: () => {}, readyTimeoutSec: 20 });
    expect(lines.find((l) => l.startsWith('ARGS '))).toBe(`ARGS -Xmx12G ${ENCODING_ARGS.join(' ')} -jar server.jar nogui --world 本地世界 --port ${s2.port}`);
    await s2.停();
    expect(fs.readdirSync(path.join(server, 'mods'))).toEqual([]);
    expect(fs.existsSync(path.join(server, '.anim-服务端.pid'))).toBe(false);
    expect(fs.existsSync(path.join(server, '.anim-临时模组.json'))).toBe(false);
    delete process.env.ANIM_JAVA_HOME;
    for (const d of [jdk, server, root]) fs.rmSync(d, { recursive: true });
  }, 30_000);
});
