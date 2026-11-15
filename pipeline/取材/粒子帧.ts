// anim extract --粒子帧：照粒子定义（jar 里 assets/<命名空间>/particles/<名>.json）的 textures 顺序生成帧模块 <作品根>/粒子帧/<命名空间>/<名>.ts
// （定义登记在共用锁的放 库/粒子帧/），画面一行 `import 帧 from '…/粒子帧/goety/frost.ts'` 拿到排好序的 Png[]。
// 为什么生成进 Git 的模块、不做 asset:粒子/… 虚拟模块：打包（webpack.ts，文本进全部段指纹）、指纹、检查、随仓库、缺字节都按「asset: = 锁里一件」认，
// 虚拟模块要每处特判；生成的模块里只有普通的 asset:<贴图 id>，这些地方都不用动。anim check 核对生成的和定义、锁对得上（规则 资产）。
// jar 里的文件对应哪件资产，照 sourcing/extract.toml 的配方反查（导出模型 只导贴图的步骤、拷jar文件.py 的步骤，加上「产物」表），不按 id 的写法猜：
// 同一张贴图在几条配方里都导过（库里的 贴图/特效/杂项粒子/sga_a、作品里的 贴图/法术/…）时字节一样取哪件都一样，按定义同组优先、再按 id 排；字节不一样报错。
import fs from 'node:fs';
import path from 'node:path';
import { bytesPath, type AssetLock } from '../资产/资产锁.ts';
import { expandArtifacts, type SourcingManifest } from './清单.ts';

export type SideLocks = { 共用: AssetLock; 作品: AssetLock };
export type Particle = { namespaceName: string; 名: string };
export type ParticleFrameFile = { 粒子: string; definition: string; side: '共用' | '作品'; 文件: string; 文本: string; 帧: string[] };
export type ParticleFrameError = { 粒子: string; 错: string; missingTextures?: string[] };
/** jar 里的路径 → 从它导出的资产 id（只收锁里有的） */
export type SourceTable = Map<string, string[]>;

/** goety:frost → {goety, frost}；不写命名空间是 minecraft（同 ResourceLocation） */
export const parseParticleName = (s: string): Particle => {
  const i = s.indexOf(':');
  const [a, b] = i >= 0 ? [s.slice(0, i), s.slice(i + 1)] : ['minecraft', s];
  if (!/^[a-z0-9_.-]+$/.test(a) || !/^[a-z0-9_./-]+$/.test(b)) throw new Error(`粒子名「${s}」不对：写 <命名空间>:<名>，如 goety:frost`);
  return { namespaceName: a, 名: b };
};

export const definitionPath = (p: Particle) => `assets/${p.namespaceName}/particles/${p.名}.json`;
export const texturePath = (p: Particle) => `assets/${p.namespaceName}/textures/particle/${p.名}.png`;

const globToRegExp = (s: string) => new RegExp(`^${s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);

/**
 * 从配方反查 jar 路径 → 资产 id。认两种步骤：
 *   导出模型 只要贴图的写法（来源全是 .png，可写 名字=路径，路径里 * 只在文件名里）：输出是目录时每张存成 目录/名字.png，是 .png 时只有一张；
 *   python 拷jar文件.py <jar> <jar 里的路径> <输出文件>。
 * 输出文件再按条目的「产物」表（通配按锁展开）对到 id。
 */
export const buildSourceTable = (q: SourcingManifest, assetLock: AssetLock): SourceTable => {
  const sourceTable: SourceTable = new Map();
  const addSource = (innerPath: string, id: string) => {
    const xs = sourceTable.get(innerPath) ?? [];
    if (!xs.includes(id)) sourceTable.set(innerPath, [...xs, id].sort());
  };
  for (const e of q.entryMap.values()) {
    const fileToId = new Map<string, string>();
    for (const [id, f] of expandArtifacts(e.产物, assetLock).对) if (assetLock[id]) fileToId.set(path.posix.normalize(f), id);
    if (!fileToId.size) continue;
    for (const step of e.步骤) {
      const s = step.map((x) => (typeof x === 'string' ? x : ''));
      if (s[0] === 'python' && s[1]?.endsWith('/拷jar文件.py') && s.length === 5) {
        const id = fileToId.get(path.posix.normalize(s[4]!));
        if (id) addSource(s[3]!, id);
        continue;
      }
      if (s[0] !== '导出模型' || s.length < 4) continue;
      const outFile = s[2]!;
      const sourceFiles = s.slice(3);
      if (!sourceFiles.every((x) => x.endsWith('.png') && !x.startsWith('--'))) continue;
      for (const x of sourceFiles) {
        const k = x.indexOf('=');
        const [outName, innerPath] = k >= 0 ? [x.slice(0, k), x.slice(k + 1)] : [undefined, x];
        if (outFile.endsWith('.png')) {
          const id = fileToId.get(path.posix.normalize(outFile));
          if (id && sourceFiles.length === 1 && !innerPath.includes('*')) addSource(innerPath, id);
          continue;
        }
        const baseName = path.posix.basename(innerPath, '.png');
        if (!innerPath.includes('*')) {
          const id = fileToId.get(path.posix.normalize(`${outFile}/${outName ?? baseName}.png`));
          if (id) addSource(innerPath, id);
          continue;
        }
        if (path.posix.dirname(innerPath).includes('*') || outName) continue;
        const pattern = globToRegExp(path.posix.basename(innerPath));
        const prefix = `${path.posix.normalize(outFile)}/`;
        for (const [f, id] of fileToId) {
          if (!f.startsWith(prefix) || !f.endsWith('.png') || f.slice(prefix.length).includes('/')) continue;
          const fileName = f.slice(prefix.length);
          if (pattern.test(fileName)) addSource(`${path.posix.dirname(innerPath)}/${fileName}`, id);
        }
      }
    }
  }
  return sourceTable;
};

const preferSameGroup = (ids: string[], definitionId: string) => {
  const groupName = definitionId.split('/')[1];
  return [...ids].sort((a, b) => Number(b.split('/')[1] === groupName) - Number(a.split('/')[1] === groupName) || (a < b ? -1 : a > b ? 1 : 0));
};

/** 来源表里登记了定义的全部粒子（命名空间:名，排好序） */
export const listParticles = (sourceTable: SourceTable): string[] =>
  [...sourceTable.keys()].flatMap((k) => {
    const m = /^assets\/([^/]+)\/particles\/(.+)\.json$/.exec(k);
    return m ? [`${m[1]}:${m[2]}`] : [];
  }).sort();

/** 生成的文件放哪：定义在作品锁 → <作品根>/粒子帧/，在共用锁 → 库/粒子帧/ */
export const particleFrameFile = (p: Particle, side: '共用' | '作品', codeRoot: string, workRoot: string) =>
  path.join(side === '作品' ? workRoot : path.join(codeRoot, '库'), '粒子帧', p.namespaceName, ...`${p.名}.ts`.split('/'));

export const generatedHeader = '// anim extract --粒子帧 生成，别手改';

export const particleFrameText = (particleName: string, definitionId: string, definitionSha: string, frames: string[]): string => {
  const unique = [...new Set(frames)];
  const importNames = new Map(unique.map((id, i) => [id, `图${i}`]));
  return [
    `${generatedHeader}：粒子 ${particleName} 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。`,
    `// 定义 ${definitionId} sha256 ${definitionSha}`,
    `import { png, type Png } from '@engine/model/贴图.ts';`,
    ...unique.map((id) => `import ${importNames.get(id)} from 'asset:${id}';`),
    '',
    `const 帧: readonly Png[] = [${frames.map((id) => importNames.get(id)).join(', ')}].map(png);`,
    'export default 帧;',
    '',
  ].join('\n');
};

/** 生成文件头记的定义 id 和 sha；不是生成的文件返回 undefined */
export const readGeneratedHeader = (text: string): { definition: string; sha: string } | undefined => {
  if (!text.startsWith(generatedHeader)) return undefined;
  const m = /^\/\/ 定义 (\S+) sha256 ([0-9a-f]{64})$/m.exec(text);
  return m ? { definition: m[1]!, sha: m[2]! } : undefined;
};

/** 定义 json 的 textures */
export const readTextures = (bytesText: string, definitionId: string): string[] => {
  const j = JSON.parse(bytesText) as { textures?: unknown };
  if (!Array.isArray(j.textures) || !j.textures.length || !j.textures.every((t) => typeof t === 'string')) throw new Error(`${definitionId} 没有 textures（Provider 里程序画的粒子，没有贴图帧）`);
  return j.textures as string[];
};

/** 算一种粒子的帧模块；定义没登记、字节不在、贴图没登记都给 粒子帧错 */
export const computeParticleFrames = (
  particleName: string,
  assetLocks: SideLocks,
  sourceTable: SourceTable,
  codeRoot: string,
  workRoot: string,
  readText = (e: AssetLock[string]) => fs.readFileSync(bytesPath(e), 'utf8'),
): ParticleFrameFile | ParticleFrameError => {
  try {
    const p = parseParticleName(particleName);
    const particleFullName = `${p.namespaceName}:${p.名}`;
    const definitions = sourceTable.get(definitionPath(p)) ?? [];
    if (!definitions.length) return { 粒子: particleFullName, 错: `定义没登记：在 sourcing/extract.toml 的粒子定义配方里加一步（拷jar文件.py 拷 ${definitionPath(p)}），再 anim extract <配方> --登记` };
    if (definitions.length > 1) return { 粒子: particleFullName, 错: `定义登记了 ${definitions.length} 件：${definitions.join('、')}（只留一件）` };
    const definition = definitions[0]!;
    const side = assetLocks.作品[definition] ? '作品' : '共用';
    const lockEntry = (side === '作品' ? assetLocks.作品 : assetLocks.共用)[definition]!;
    let bytesText: string;
    try {
      bytesText = readText(lockEntry);
    } catch {
      return { 粒子: particleFullName, 错: `${definition} 的字节不在数据根（先 anim assets pull，或 anim extract <粒子定义配方>）` };
    }
    const textures = readTextures(bytesText, definition);
    // 共用侧生成进 库/，只许引共用锁里的贴图（别的作品打包时没有这部作品的锁）
    const usable = side === '共用' ? assetLocks.共用 : { ...assetLocks.共用, ...assetLocks.作品 };
    const missing: string[] = [];
    const frames = textures.map((t) => {
      const ids = (sourceTable.get(texturePath(parseParticleName(t))) ?? []).filter((id) => usable[id]?.后缀 === '.png');
      if (!ids.length) {
        if (!missing.includes(t)) missing.push(t);
        return '';
      }
      if (new Set(ids.map((id) => usable[id]!.sha256)).size > 1) throw new Error(`贴图 ${t} 对上了字节不同的几件：${ids.join('、')}（定不了用哪件）`);
      return preferSameGroup(ids, definition)[0]!;
    });
    if (missing.length) return { 粒子: particleFullName, 错: `${missing.length} 张贴图没登记（哪条配方都没导）：${missing.map((t) => texturePath(parseParticleName(t))).join('、')}`, missingTextures: missing };
    const file = particleFrameFile(p, side, codeRoot, workRoot);
    return { 粒子: particleFullName, definition, side, 文件: file, 文本: particleFrameText(particleFullName, definition, lockEntry.sha256, frames), 帧: frames };
  } catch (e) {
    return { 粒子: particleName, 错: (e as Error).message };
  }
};

export const isError = (x: ParticleFrameFile | ParticleFrameError): x is ParticleFrameError => '错' in x;

/** 已生成的帧模块（作品和库两处），返回绝对路径 */
export const generatedFiles = (codeRoot: string, workRoot: string): string[] =>
  [path.join(workRoot, '粒子帧'), path.join(codeRoot, '库', '粒子帧')]
    .flatMap((d) => (fs.existsSync(d) ? (fs.readdirSync(d, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => path.join(d, f)) : []))
    .sort();

/** 文件路径 → 粒子名（<…>/粒子帧/<命名空间>/<名>.ts） */
export const particleOfFile = (f: string): string => {
  const pathSegs = f.split(/[\\/]/);
  const i = pathSegs.lastIndexOf('粒子帧');
  return `${pathSegs[i + 1]}:${pathSegs.slice(i + 2).join('/').replace(/\.ts$/, '')}`;
};

/**
 * anim check 用：已生成的每个文件，头里的定义 sha 要和锁里一样；定义字节在本机的，再按现在的配方、锁重算，文本要一字不差。
 * 返回 [文件, 说明]
 */
export const checkParticleFrames = (codeRoot: string, workRoot: string, assetLocks: SideLocks, sourceTable: SourceTable, readText?: (e: AssetLock[string]) => string): [string, string][] => {
  const issues: [string, string][] = [];
  for (const f of generatedFiles(codeRoot, workRoot)) {
    const text = fs.readFileSync(f, 'utf8');
    const genHeader = readGeneratedHeader(text);
    if (!genHeader) {
      issues.push([f, '粒子帧/ 下只放 anim extract --粒子帧 生成的模块（头认不出）']);
      continue;
    }
    const lockEntry = assetLocks.共用[genHeader.definition] ?? assetLocks.作品[genHeader.definition];
    if (!lockEntry) {
      issues.push([f, `记的定义 ${genHeader.definition} 不在资产锁里`]);
      continue;
    }
    if (lockEntry.sha256 !== genHeader.sha) {
      issues.push([f, `定义 ${genHeader.definition} 换了字节（锁 ${lockEntry.sha256.slice(0, 12)}，生成时 ${genHeader.sha.slice(0, 12)}）：anim extract --粒子帧 重生成`]);
      continue;
    }
    const r = computeParticleFrames(particleOfFile(f), assetLocks, sourceTable, codeRoot, workRoot, readText);
    if (isError(r)) {
      if (!r.错.includes('字节不在数据根')) issues.push([f, r.错]);
      continue;
    }
    if (path.resolve(r.文件) !== path.resolve(f)) issues.push([f, `应该在 ${r.文件}`]);
    else if (r.文本 !== text) issues.push([f, '和按现在的定义、配方、资产锁生成的不一样（手改了，或贴图对应的 id 变了）：anim extract --粒子帧 重生成']);
  }
  return issues;
};
