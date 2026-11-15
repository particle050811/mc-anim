// 装 Forge 服务端：Forge 安装器（sourcing/jars.toml 的 forge-installer，核 sha256）装进空目录，再按世界声明放模组、第三方数据包、server.properties。
// 旧项目是手工装的（install.log），这里脚本化。装完的目录 anim world pregen --apply、new、server 就能用。
// - 安装器要联网：从 Mojang、Forge 的 maven 取原版服务端 jar 和依赖库（免费，几百 MB），装完 libraries/ 下有 unix_args.txt、win_args.txt。
// - eula.txt 不替人同意：默认不写，要人读过 Minecraft EULA（https://aka.ms/MinecraftEULA）后自己改，或加 --accept-eula 由人在命令行表态。
// - mcai 是自己编的，不在 jars.toml：anim mcai build 装；其余模组按声明的 id 从 jars.toml 取（游戏环境里有就拷，没有按「下载」下，核 sha256）。
import fs from 'node:fs';
import path from 'node:path';
import { fetchJar } from '../../取材/取jar.ts';
import { readManifest } from '../../取材/清单.ts';
import { jarPath } from '../../取材/提取.ts';
import { config } from '../../环境/配置.ts';
import { runCmd } from '../../环境/子进程.ts';
import type { WorldDecl } from '../声明.ts';
import { SERVER_DATAPACK_DIR_NAME, findDatapack, datapackDir } from './建世界.ts';
import { javaProgram, startArgs } from './服务端.ts';

/** 新装服务端的 server.properties（只写取材要的几项，其余服务端第一次启动时补默认值）。
 * max-tick-time=-1：预生成时一个 tick 卡很久，默认的 60 秒看门狗会把服务端杀了；其余照旧取材服务端（Oct 4 起一直这样用） */
export const defaultProps = (worldName: string) =>
  [
    '# anim world install-server 写的；其余项服务端第一次启动时补默认值',
    'difficulty=peaceful',
    'enable-command-block=false',
    'max-tick-time=-1',
    `motd=${worldName}`,
    'online-mode=false',
    'server-ip=127.0.0.1',
    'simulation-distance=4',
    'spawn-monsters=false',
    'view-distance=4',
    '',
  ].join('\n');

const copyTo = (sourcePath: string, destPath: string) => {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size === fs.statSync(sourcePath).size) return false;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(sourcePath, destPath, fs.constants.COPYFILE_FICLONE);
  return true;
};

export type InstallServerOptions = {
  声明: WorldDecl;
  /** 服务端目录（<ANIM_GAME>/<服务端>） */
  目录: string;
  acceptEula?: boolean;
  /** 不跑安装器（已经装过，只补模组、数据包） */
  skipLoader?: boolean;
  /** 测试用：直接给安装器路径，不走 jars.toml（真安装器的 sha256 才对得上登记） */
  installerPath?: string;
  说: (s: string) => void;
};

export type InstallServerResult = { loaderInstalled: boolean; newMods: string[]; missingMods: string[]; newDatapacks: string[]; eula: '已同意' | '已写' | '没写' };

export const installServer = async (o: InstallServerOptions): Promise<InstallServerResult> => {
  const w = o.声明, log = o.说;
  if (!w.Forge) throw new Error(`${w.文件} 没写 Forge（版本，如 1.20.1-47.4.10）`);
  const sourcingManifest = readManifest();
  fs.mkdirSync(o.目录, { recursive: true });
  const alreadyInstalled = (() => {
    try {
      startArgs(o.目录, w.Forge);
      return fs.existsSync(path.join(o.目录, 'libraries', 'net', 'minecraftforge', 'forge', w.Forge));
    } catch {
      return false;
    }
  })();
  if (!alreadyInstalled && !o.skipLoader) {
    const installer = sourcingManifest.jars.get('forge-installer') as ({ 版本?: string } & ReturnType<typeof sourcingManifest.jars.get>) | undefined;
    if (!installer && !o.installerPath) throw new Error('sourcing/jars.toml 没登记 forge-installer');
    if (installer && !o.installerPath && installer.版本 !== w.Forge) throw new Error(`jars.toml 登记的 Forge 安装器是 ${installer.版本}，${w.文件} 要 ${w.Forge}：先在 jars.toml 登记那一版（下载地址、sha256）`);
    const extraEntries = fs.readdirSync(o.目录).filter((n) => !['eula.txt', 'server.properties'].includes(n));
    if (extraEntries.length) throw new Error(`${o.目录} 不是空的（有 ${extraEntries.slice(0, 5).join('、')}${extraEntries.length > 5 ? '…' : ''}）又不是装好的 Forge ${w.Forge}：不往里装，换个空目录`);
    const jar = o.installerPath ?? (await fetchJar('forge-installer', { sourcingManifest, 说: log }));
    log(`装 Forge ${w.Forge}：${javaProgram()} -jar ${path.basename(jar)} --installServer（要联网下载原版服务端和依赖库，几分钟）`);
    await runCmd([javaProgram(), '-jar', jar, '--installServer'], { cwd: o.目录 });
    try {
      startArgs(o.目录, w.Forge);
    } catch (e) {
      throw new Error(`安装器跑完了但 ${o.目录} 里没有 ${w.Forge} 的启动参数文件：${(e as Error).message}`);
    }
  } else if (alreadyInstalled) log(`Forge ${w.Forge} 已经装在 ${o.目录}，不重装`);

  const props = path.join(o.目录, 'server.properties');
  if (!fs.existsSync(props)) {
    fs.writeFileSync(props, defaultProps(path.basename(o.目录)));
    log('写了 server.properties');
  }

  const newMods: string[] = [], missingMods: string[] = [];
  const toInstall: { id: string; 路径: string }[] = [];
  for (const id of w.模组) {
    if (id === 'mcai') continue;
    try {
      toInstall.push({ id, 路径: await fetchJar(id, { sourcingManifest, 说: log }) });
    } catch (e) {
      missingMods.push(`${id}：${(e as Error).message}`);
    }
  }
  // 另需模组文件：写文件名，按 jars.toml 里同名文件，再按游戏环境 缓存/mods/ 找
  for (const fileName of w.另需模组文件) {
    const jarEntry = [...sourcingManifest.jars].find(([, j]) => path.basename(j.到) === fileName || (j as { 文件?: string }).文件 === fileName);
    const modPath = jarEntry ? jarPath(sourcingManifest, jarEntry[0]) : path.join(config('游戏'), '缓存', 'mods', fileName);
    if (fs.existsSync(modPath)) toInstall.push({ id: fileName, 路径: modPath });
    else missingMods.push(`${fileName}：jars.toml 没登记、游戏环境 缓存/mods/ 里也没有`);
  }
  for (const m of toInstall) if (copyTo(m.路径, path.join(o.目录, 'mods', path.basename(m.路径)))) newMods.push(path.basename(m.路径));
  if (w.模组.includes('mcai') && !fs.readdirSync(path.join(o.目录, 'mods'), { withFileTypes: true }).some((e) => /^mcai-.*\.jar$/.test(e.name)))
    log('注意：声明里有 mcai（取材 mod），mods/ 里还没有：anim mcai build 装上');

  // 第三方的数据包（jars.toml 里登记了文件名的 zip，如史诗地形）放进 世界数据包/，建世界时按声明挑
  const newDatapacks: string[] = [];
  for (const dataPackName of w.数据包) {
    if (fs.existsSync(path.join(datapackDir(), dataPackName))) continue;
    const destPath = path.join(o.目录, SERVER_DATAPACK_DIR_NAME, dataPackName);
    if (fs.existsSync(destPath)) continue;
    const sourcePath = await findDatapack(dataPackName, o.目录, log);
    if (copyTo(sourcePath, destPath)) newDatapacks.push(dataPackName);
  }

  const eula = path.join(o.目录, 'eula.txt');
  const eulaAccepted = fs.existsSync(eula) && /^\s*eula\s*=\s*true\s*$/m.test(fs.readFileSync(eula, 'utf8'));
  let eulaStatus: InstallServerResult['eula'] = eulaAccepted ? '已同意' : '没写';
  if (!eulaAccepted && o.acceptEula) {
    fs.writeFileSync(eula, '# 用户在命令行加了 --accept-eula，表示读过 https://aka.ms/MinecraftEULA 并同意\neula=true\n');
    eulaStatus = '已写';
  }
  return { loaderInstalled: !alreadyInstalled, newMods, missingMods, newDatapacks, eula: eulaStatus };
};
