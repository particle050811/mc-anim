// 建新世界：按世界声明（种子、世界类型、生成结构、数据包）在服务端目录里建一个新存档。旧项目 取材服务端.py --new 按本仓库重写。
// - 数据包要在第一次启动前放进 <存档>/datapacks/：建世界时自动启用，之后每个区块都按它来；种子、世界类型、结构开关只在建世界时读一次，
//   建错了只能删掉重建，所以先把能查的都查了（数据包找得到、要的模组类在 mods/ 里、世界没建过），开服后再核对模组真的认出了数据包。
// - 数据包名：相对 sourcing/datapacks/（目录），或服务端 世界数据包/ 下的（第三方的包，不进仓库），或 jars.toml 里登记的文件名（取 jar 路径拷过去）。
// - 种子、世界类型、结构开关临时写进 server.properties，服务端就绪以后改回原文（服务端启动时会重写这个文件，所以不能更早改回）。
// - 就绪、核对、发完命令以后 save-all flush 再正常停服（停服等存盘的规矩在 服务端.ts），停完要有 level.dat 才算建成。
import fs from 'node:fs';
import path from 'node:path';
import { 取jar } from '../../取材/取jar.ts';
import { 读清单 } from '../../取材/清单.ts';
import { 代码根 } from '../../环境/路径.ts';
import type { 世界声明 } from '../声明.ts';
import { 按顺序发命令 } from './发命令.ts';
import { 解析启用包, 开服前核对, 开服要有的日志, 排序核对 } from './核对.ts';
import { 服务端 } from './服务端.ts';

export const 数据包目录 = () => path.join(代码根(), 'sourcing', 'datapacks');
export const 服务端数据包目录名 = '世界数据包';

const 是数据包 = (f: string) => fs.existsSync(f) && ((fs.statSync(f).isFile() && f.endsWith('.zip')) || fs.existsSync(path.join(f, 'pack.mcmeta')));

/** 世界声明 数据包 里的一项 → 本机路径；找不到列出找过的地方 */
export const 找数据包 = async (名: string, 服务端目录: string, 说?: (s: string) => void): Promise<string> => {
  const 候选 = [path.join(数据包目录(), 名), path.join(服务端目录, 服务端数据包目录名, 名)];
  for (const f of 候选) if (是数据包(f)) return f;
  const q = 读清单();
  for (const [id, j] of q.jars) {
    const 文件 = (j as { 文件?: string }).文件 ?? path.basename(j.到);
    if (文件 === 名 && 名.endsWith('.zip')) return 取jar(id, { 清单: q, 说 });
  }
  throw new Error(`找不到数据包「${名}」：找过 ${候选.join('、')}，jars.toml 里也没有文件名叫它的`);
};

/** server.properties 原文里改这几项（没有这一行就追加）；level-type 的冒号要转义成 \: */
export const 改属性文本 = (原文: string, 新: { 种子: string; 世界类型: string; 生成结构: boolean }) => {
  const 值: Record<string, string> = { 'level-seed': 新.种子, 'level-type': 新.世界类型.replaceAll(':', '\\:'), 'generate-structures': String(新.生成结构) };
  let 文 = 原文;
  for (const [k, v] of Object.entries(值)) {
    const 行 = new RegExp(`^${k}=.*$`, 'm');
    文 = 行.test(文) ? 文.replace(行, () => `${k}=${v}`) : `${文}${文.endsWith('\n') || !文 ? '' : '\n'}${k}=${v}\n`;
  }
  return 文;
};

/** 开服后核对 /datapack list enabled：要盖住别人的包启用了、排在它盖的包之上 */
export const 核对启用包 = async (s: 服务端, 存档: string, 要盖: readonly string[]) => {
  s.发('datapack list enabled');
  const 行 = await s.等('data pack(s) enabled', 30);
  const 问题 = 排序核对(存档, 要盖, 解析启用包(行 ?? ''));
  if (!行 || 问题.length) throw new Error(行 ? 问题.join('\n') : '/datapack list enabled 30 秒没回');
};

export type 建世界选项 = {
  声明: 世界声明;
  服务端目录: string;
  /** 新存档的世界目录（里面还没有 level.dat） */
  存档: string;
  堆?: string;
  生成线程?: number;
  /** 建好以后接着发的命令（sleep:、wait:、expect: 照 anim world server） */
  命令们?: string[];
  说: (s: string) => void;
};

export type 建世界结果 = { 存档: string; 数据包: string[]; 核对: string[] };

export const 建世界 = async (o: 建世界选项): Promise<建世界结果> => {
  const { 声明: w, 服务端目录, 存档 } = o;
  if (w.种子 === undefined) throw new Error(`${w.文件} 没写 种子，建不了世界`);
  if (fs.existsSync(path.join(存档, 'level.dat'))) throw new Error(`世界已经有了（${存档}）；要重建先删掉它`);
  const 本来有目录 = fs.existsSync(存档);
  if (本来有目录 && fs.readdirSync(存档).some((n) => n !== 'datapacks')) throw new Error(`${存档} 已经有东西但不是世界（没有 level.dat）：不往里建，先看一眼再删`);
  const props = path.join(服务端目录, 'server.properties');
  if (!fs.existsSync(props)) throw new Error(`${服务端目录} 不是服务端目录（没有 server.properties；anim world install-server 装）`);

  // 先把数据包找齐：缺一个就不动手，免得建出少了数据包的世界
  const 包们: { 名: string; 路径: string }[] = [];
  const 缺: string[] = [];
  for (const 名 of w.数据包) {
    try {
      包们.push({ 名, 路径: await 找数据包(名, 服务端目录, o.说) });
    } catch (e) {
      缺.push((e as Error).message);
    }
  }
  if (缺.length) throw new Error(缺.join('\n'));
  const 重名 = 包们.map((p) => path.basename(p.路径)).filter((n, i, a) => a.indexOf(n) !== i);
  if (重名.length) throw new Error(`数据包落到世界里的名字重了：${重名.join('、')}`);

  fs.mkdirSync(path.join(存档, 'datapacks'), { recursive: true });
  try {
    for (const p of 包们) {
      const 到 = path.join(存档, 'datapacks', path.basename(p.路径));
      if (fs.statSync(p.路径).isDirectory()) fs.cpSync(p.路径, 到, { recursive: true });
      else fs.copyFileSync(p.路径, 到);
      o.说(`放进数据包：${path.basename(p.路径)}`);
    }
    const 前查 = 开服前核对(服务端目录, 存档);
    if (前查.问题.length) throw new Error(前查.问题.join('\n'));

    const 原属性 = fs.readFileSync(props, 'utf8');
    fs.writeFileSync(props, 改属性文本(原属性, { 种子: w.种子, 世界类型: w.世界类型, 生成结构: w.生成结构 }));
    let s: 服务端;
    try {
      s = await 服务端.起({ 目录: 服务端目录, 存档, 允许新世界: true, 加载器版本: w.Forge, 堆: o.堆, 生成线程: o.生成线程, 提示: o.说, 每行: () => {} });
    } finally {
      fs.writeFileSync(props, 原属性);
    }
    const 核对: string[] = [];
    try {
      const 日志 = s.近来日志();
      for (const { 包, 行 } of 开服要有的日志(存档)) {
        const 有 = 日志.find((l) => l.includes(行));
        if (!有) throw new Error(`世界里有数据包 ${包}，可启动日志里没有「${行}」（取材 mod 太旧、没认出它？），停服；世界已建但不对，删掉重建`);
        核对.push(有.slice(有.indexOf(行)).trim());
      }
      if (前查.要盖.length) {
        await 核对启用包(s, 存档, 前查.要盖);
        核对.push(`数据包 ${前查.要盖.join('、')} 已启用、排在它覆盖的包之上`);
      }
      await 按顺序发命令(s, o.命令们 ?? [], o.说);
      s.发('save-all flush');
      await s.等('Saved the game', 120);
    } finally {
      await s.停();
    }
    if (!fs.existsSync(path.join(存档, 'level.dat'))) throw new Error(`服务端停了但 ${存档} 里没有 level.dat，世界没建成`);
    return { 存档, 数据包: 包们.map((p) => path.basename(p.路径)), 核对 };
  } catch (e) {
    // 没建成的就收拾掉：留着半截的目录，下次会被当成「已经有东西」
    if (!本来有目录 && !fs.existsSync(path.join(存档, 'level.dat'))) fs.rmSync(存档, { recursive: true, force: true });
    throw e;
  }
};
