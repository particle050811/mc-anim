// 装 Forge 服务端：Forge 安装器（sourcing/jars.toml 的 forge-installer，核 sha256）装进空目录，再按世界声明放模组、第三方数据包、server.properties。
// 旧项目是手工装的（install.log），这里脚本化。装完的目录 anim world pregen --执行、new、server 就能用。
// - 安装器要联网：从 Mojang、Forge 的 maven 取原版服务端 jar 和依赖库（免费，几百 MB），装完 libraries/ 下有 unix_args.txt、win_args.txt。
// - eula.txt 不替人同意：默认不写，要人读过 Minecraft EULA（https://aka.ms/MinecraftEULA）后自己改，或加 --同意EULA 由人在命令行表态。
// - mcai 是自己编的，不在 jars.toml：anim mcai build 装；其余模组按声明的 id 从 jars.toml 取（游戏环境里有就拷，没有按「下载」下，核 sha256）。
import fs from 'node:fs';
import path from 'node:path';
import { 取jar } from '../../取材/取jar.ts';
import { 读清单 } from '../../取材/清单.ts';
import { jar路径 } from '../../取材/提取.ts';
import { 配置 } from '../../环境/配置.ts';
import { 跑 } from '../../环境/子进程.ts';
import type { 世界声明 } from '../声明.ts';
import { 服务端数据包目录名, 找数据包, 数据包目录 } from './建世界.ts';
import { java程序, 启动参数 } from './服务端.ts';

/** 新装服务端的 server.properties（只写取材要的几项，其余服务端第一次启动时补默认值）。
 * max-tick-time=-1：预生成时一个 tick 卡很久，默认的 60 秒看门狗会把服务端杀了；其余照旧取材服务端（Oct 4 起一直这样用） */
export const 默认属性 = (名: string) =>
  [
    '# anim world install-server 写的；其余项服务端第一次启动时补默认值',
    'difficulty=peaceful',
    'enable-command-block=false',
    'max-tick-time=-1',
    `motd=${名}`,
    'online-mode=false',
    'server-ip=127.0.0.1',
    'simulation-distance=4',
    'spawn-monsters=false',
    'view-distance=4',
    '',
  ].join('\n');

const 拷到 = (源: string, 到: string) => {
  if (fs.existsSync(到) && fs.statSync(到).size === fs.statSync(源).size) return false;
  fs.mkdirSync(path.dirname(到), { recursive: true });
  fs.copyFileSync(源, 到, fs.constants.COPYFILE_FICLONE);
  return true;
};

export type 装服务端选项 = {
  声明: 世界声明;
  /** 服务端目录（<ANIM_GAME>/<服务端>） */
  目录: string;
  同意EULA?: boolean;
  /** 不跑安装器（已经装过，只补模组、数据包） */
  不装加载器?: boolean;
  /** 测试用：直接给安装器路径，不走 jars.toml（真安装器的 sha256 才对得上登记） */
  安装器路径?: string;
  说: (s: string) => void;
};

export type 装服务端结果 = { 已装加载器: boolean; 新拷模组: string[]; 缺模组: string[]; 新拷数据包: string[]; eula: '已同意' | '已写' | '没写' };

export const 装服务端 = async (o: 装服务端选项): Promise<装服务端结果> => {
  const w = o.声明, 说 = o.说;
  if (!w.Forge) throw new Error(`${w.文件} 没写 Forge（版本，如 1.20.1-47.4.10）`);
  const 清单 = 读清单();
  fs.mkdirSync(o.目录, { recursive: true });
  const 已装 = (() => {
    try {
      启动参数(o.目录, w.Forge);
      return fs.existsSync(path.join(o.目录, 'libraries', 'net', 'minecraftforge', 'forge', w.Forge));
    } catch {
      return false;
    }
  })();
  if (!已装 && !o.不装加载器) {
    const 安装器 = 清单.jars.get('forge-installer') as ({ 版本?: string } & ReturnType<typeof 清单.jars.get>) | undefined;
    if (!安装器 && !o.安装器路径) throw new Error('sourcing/jars.toml 没登记 forge-installer');
    if (安装器 && !o.安装器路径 && 安装器.版本 !== w.Forge) throw new Error(`jars.toml 登记的 Forge 安装器是 ${安装器.版本}，${w.文件} 要 ${w.Forge}：先在 jars.toml 登记那一版（下载地址、sha256）`);
    const 其余 = fs.readdirSync(o.目录).filter((n) => !['eula.txt', 'server.properties'].includes(n));
    if (其余.length) throw new Error(`${o.目录} 不是空的（有 ${其余.slice(0, 5).join('、')}${其余.length > 5 ? '…' : ''}）又不是装好的 Forge ${w.Forge}：不往里装，换个空目录`);
    const jar = o.安装器路径 ?? (await 取jar('forge-installer', { 清单, 说 }));
    说(`装 Forge ${w.Forge}：${java程序()} -jar ${path.basename(jar)} --installServer（要联网下载原版服务端和依赖库，几分钟）`);
    await 跑([java程序(), '-jar', jar, '--installServer'], { cwd: o.目录 });
    try {
      启动参数(o.目录, w.Forge);
    } catch (e) {
      throw new Error(`安装器跑完了但 ${o.目录} 里没有 ${w.Forge} 的启动参数文件：${(e as Error).message}`);
    }
  } else if (已装) 说(`Forge ${w.Forge} 已经装在 ${o.目录}，不重装`);

  const props = path.join(o.目录, 'server.properties');
  if (!fs.existsSync(props)) {
    fs.writeFileSync(props, 默认属性(path.basename(o.目录)));
    说('写了 server.properties');
  }

  const 新拷模组: string[] = [], 缺模组: string[] = [];
  const 要的: { id: string; 路径: string }[] = [];
  for (const id of w.模组) {
    if (id === 'mcai') continue;
    try {
      要的.push({ id, 路径: await 取jar(id, { 清单, 说 }) });
    } catch (e) {
      缺模组.push(`${id}：${(e as Error).message}`);
    }
  }
  // 另需模组文件：写文件名，按 jars.toml 里同名文件，再按游戏环境 缓存/mods/ 找
  for (const 名 of w.另需模组文件) {
    const 登记 = [...清单.jars].find(([, j]) => path.basename(j.到) === 名 || (j as { 文件?: string }).文件 === 名);
    const 找 = 登记 ? jar路径(清单, 登记[0]) : path.join(配置('游戏'), '缓存', 'mods', 名);
    if (fs.existsSync(找)) 要的.push({ id: 名, 路径: 找 });
    else 缺模组.push(`${名}：jars.toml 没登记、游戏环境 缓存/mods/ 里也没有`);
  }
  for (const m of 要的) if (拷到(m.路径, path.join(o.目录, 'mods', path.basename(m.路径)))) 新拷模组.push(path.basename(m.路径));
  if (w.模组.includes('mcai') && !fs.readdirSync(path.join(o.目录, 'mods'), { withFileTypes: true }).some((e) => /^mcai-.*\.jar$/.test(e.name)))
    说('注意：声明里有 mcai（取材 mod），mods/ 里还没有：anim mcai build 装上');

  // 第三方的数据包（jars.toml 里登记了文件名的 zip，如史诗地形）放进 世界数据包/，建世界时按声明挑
  const 新拷数据包: string[] = [];
  for (const 名 of w.数据包) {
    if (fs.existsSync(path.join(数据包目录(), 名))) continue;
    const 到 = path.join(o.目录, 服务端数据包目录名, 名);
    if (fs.existsSync(到)) continue;
    const 源 = await 找数据包(名, o.目录, 说);
    if (拷到(源, 到)) 新拷数据包.push(名);
  }

  const eula = path.join(o.目录, 'eula.txt');
  const 同意了 = fs.existsSync(eula) && /^\s*eula\s*=\s*true\s*$/m.test(fs.readFileSync(eula, 'utf8'));
  let eula状态: 装服务端结果['eula'] = 同意了 ? '已同意' : '没写';
  if (!同意了 && o.同意EULA) {
    fs.writeFileSync(eula, '# 用户在命令行加了 --同意EULA，表示读过 https://aka.ms/MinecraftEULA 并同意\neula=true\n');
    eula状态 = '已写';
  }
  return { 已装加载器: !已装, 新拷模组, 缺模组, 新拷数据包, eula: eula状态 };
};
