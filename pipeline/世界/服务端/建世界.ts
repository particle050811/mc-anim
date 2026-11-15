// 建新世界：按世界声明（种子、世界类型、生成结构、数据包）在服务端目录里建一个新存档。旧项目 取材服务端.py --new 按本仓库重写。
// - 数据包要在第一次启动前放进 <存档>/datapacks/：建世界时自动启用，之后每个区块都按它来；种子、世界类型、结构开关只在建世界时读一次，
//   建错了只能删掉重建，所以先把能查的都查了（数据包找得到、要的模组类在 mods/ 里、世界没建过），开服后再核对模组真的认出了数据包。
// - 数据包名：相对 sourcing/datapacks/（目录），或服务端 世界数据包/ 下的（第三方的包，不进仓库），或 jars.toml 里登记的文件名（取 jar 路径拷过去）。
// - 种子、世界类型、结构开关临时写进 server.properties，服务端就绪以后改回原文（服务端启动时会重写这个文件，所以不能更早改回）。
// - 就绪、核对、发完命令以后 save-all flush 再正常停服（停服等存盘的规矩在 服务端.ts），停完要有 level.dat 才算建成。
import fs from 'node:fs';
import path from 'node:path';
import { fetchJar } from '../../取材/取jar.ts';
import { readManifest } from '../../取材/清单.ts';
import { codeRoot } from '../../环境/路径.ts';
import type { WorldDecl } from '../声明.ts';
import { sendCommandsInOrder } from './发命令.ts';
import { parseEnabledPacks, checkBeforeStart, requiredStartupLogs, checkOrder } from './核对.ts';
import { Server } from './服务端.ts';

export const datapackDir = () => path.join(codeRoot(), 'sourcing', 'datapacks');
export const SERVER_DATAPACK_DIR_NAME = '世界数据包';

const isDatapack = (f: string) => fs.existsSync(f) && ((fs.statSync(f).isFile() && f.endsWith('.zip')) || fs.existsSync(path.join(f, 'pack.mcmeta')));

/** 世界声明 数据包 里的一项 → 本机路径；找不到列出找过的地方 */
export const findDatapack = async (dataPackName: string, serverDir: string, log?: (s: string) => void): Promise<string> => {
  const candidates = [path.join(datapackDir(), dataPackName), path.join(serverDir, SERVER_DATAPACK_DIR_NAME, dataPackName)];
  for (const f of candidates) if (isDatapack(f)) return f;
  const q = readManifest();
  for (const [id, j] of q.jars) {
    const file = (j as { 文件?: string }).文件 ?? path.basename(j.到);
    if (file === dataPackName && dataPackName.endsWith('.zip')) return fetchJar(id, { sourcingManifest: q, 说: log });
  }
  throw new Error(`找不到数据包「${dataPackName}」：找过 ${candidates.join('、')}，jars.toml 里也没有文件名叫它的`);
};

/** server.properties 原文里改这几项（没有这一行就追加）；level-type 的冒号要转义成 \: */
export const rewriteProps = (raw: string, newProps: { 种子: string; worldType: string; 生成结构: boolean }) => {
  const value: Record<string, string> = { 'level-seed': newProps.种子, 'level-type': newProps.worldType.replaceAll(':', '\\:'), 'generate-structures': String(newProps.生成结构) };
  let text = raw;
  for (const [k, v] of Object.entries(value)) {
    const line = new RegExp(`^${k}=.*$`, 'm');
    text = line.test(text) ? text.replace(line, () => `${k}=${v}`) : `${text}${text.endsWith('\n') || !text ? '' : '\n'}${k}=${v}\n`;
  }
  return text;
};

/** 开服后核对 /datapack list enabled：要盖住别人的包启用了、排在它盖的包之上 */
export const checkEnabledPacks = async (s: Server, saveDir: string, overrides: readonly string[]) => {
  s.发('datapack list enabled');
  const line = await s.等('data pack(s) enabled', 30);
  const issues = checkOrder(saveDir, overrides, parseEnabledPacks(line ?? ''));
  if (!line || issues.length) throw new Error(line ? issues.join('\n') : '/datapack list enabled 30 秒没回');
};

export type BuildWorldOptions = {
  声明: WorldDecl;
  serverDir: string;
  /** 新存档的世界目录（里面还没有 level.dat） */
  存档: string;
  heap?: string;
  genThreads?: number;
  /** 建好以后接着发的命令（sleep:、wait:、expect: 照 anim world server） */
  commands?: string[];
  说: (s: string) => void;
};

export type BuildWorldResult = { 存档: string; 数据包: string[]; 核对: string[] };

export const buildWorld = async (o: BuildWorldOptions): Promise<BuildWorldResult> => {
  const { 声明: w, serverDir, 存档: saveDir } = o;
  if (w.种子 === undefined) throw new Error(`${w.文件} 没写 种子，建不了世界`);
  if (fs.existsSync(path.join(saveDir, 'level.dat'))) throw new Error(`世界已经有了（${saveDir}）；要重建先删掉它`);
  const existedBefore = fs.existsSync(saveDir);
  if (existedBefore && fs.readdirSync(saveDir).some((n) => n !== 'datapacks')) throw new Error(`${saveDir} 已经有东西但不是世界（没有 level.dat）：不往里建，先看一眼再删`);
  const props = path.join(serverDir, 'server.properties');
  if (!fs.existsSync(props)) throw new Error(`${serverDir} 不是服务端目录（没有 server.properties；anim world install-server 装）`);

  // 先把数据包找齐：缺一个就不动手，免得建出少了数据包的世界
  const packs: { 名: string; 路径: string }[] = [];
  const missing: string[] = [];
  for (const dataPackName of w.数据包) {
    try {
      packs.push({ 名: dataPackName, 路径: await findDatapack(dataPackName, serverDir, o.说) });
    } catch (e) {
      missing.push((e as Error).message);
    }
  }
  if (missing.length) throw new Error(missing.join('\n'));
  const dupNames = packs.map((p) => path.basename(p.路径)).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupNames.length) throw new Error(`数据包落到世界里的名字重了：${dupNames.join('、')}`);

  fs.mkdirSync(path.join(saveDir, 'datapacks'), { recursive: true });
  try {
    for (const p of packs) {
      const destPath = path.join(saveDir, 'datapacks', path.basename(p.路径));
      if (fs.statSync(p.路径).isDirectory()) fs.cpSync(p.路径, destPath, { recursive: true });
      else fs.copyFileSync(p.路径, destPath);
      o.说(`放进数据包：${path.basename(p.路径)}`);
    }
    const preCheck = checkBeforeStart(serverDir, saveDir);
    if (preCheck.issues.length) throw new Error(preCheck.issues.join('\n'));

    const originalProps = fs.readFileSync(props, 'utf8');
    fs.writeFileSync(props, rewriteProps(originalProps, { 种子: w.种子, worldType: w.worldType, 生成结构: w.生成结构 }));
    let s: Server;
    try {
      s = await Server.起({ 目录: serverDir, 存档: saveDir, allowNewWorld: true, loaderVersion: w.Forge, heap: o.heap, genThreads: o.genThreads, 提示: o.说, onLine: () => {} });
    } finally {
      fs.writeFileSync(props, originalProps);
    }
    const verifyNotes: string[] = [];
    try {
      const logLines = s.recentLogs();
      for (const { 包: pack, 行: line } of requiredStartupLogs(saveDir)) {
        const matchedLine = logLines.find((l) => l.includes(line));
        if (!matchedLine) throw new Error(`世界里有数据包 ${pack}，可启动日志里没有「${line}」（取材 mod 太旧、没认出它？），停服；世界已建但不对，删掉重建`);
        verifyNotes.push(matchedLine.slice(matchedLine.indexOf(line)).trim());
      }
      if (preCheck.overrides.length) {
        await checkEnabledPacks(s, saveDir, preCheck.overrides);
        verifyNotes.push(`数据包 ${preCheck.overrides.join('、')} 已启用、排在它覆盖的包之上`);
      }
      await sendCommandsInOrder(s, o.commands ?? [], o.说);
      s.发('save-all flush');
      await s.等('Saved the game', 120);
    } finally {
      await s.停();
    }
    if (!fs.existsSync(path.join(saveDir, 'level.dat'))) throw new Error(`服务端停了但 ${saveDir} 里没有 level.dat，世界没建成`);
    return { 存档: saveDir, 数据包: packs.map((p) => path.basename(p.路径)), 核对: verifyNotes };
  } catch (e) {
    // 没建成的就收拾掉：留着半截的目录，下次会被当成「已经有东西」
    if (!existedBefore && !fs.existsSync(path.join(saveDir, 'level.dat'))) fs.rmSync(saveDir, { recursive: true, force: true });
    throw e;
  }
};
