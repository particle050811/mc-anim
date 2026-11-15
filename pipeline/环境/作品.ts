// 作品：有哪几部、这次用哪部。作品是 <代码根>/作品/<名>/ 下有 清单.ts 的目录，外加 anim.local.toml [works] 登记的外部目录（见 docs/决策/0004-多作品.md）。
// 选哪部：--work（cli/路由.ts 解析后调 指定作品）> 当前目录在哪部作品里 > anim.local.toml 的 work（ANIM_WORK）> 只有一部就用它；都定不了就报错列出作品名。
import fs from 'node:fs';
import path from 'node:path';
import { codeRoot } from './路径.ts';
import { config, workPathTable } from './配置.ts';

export type Work = { 名: string; 根: string };

/** 选不出作品（没指定、有好几部，或名字不对）：cli/路由.ts 只打这一行提示，不打调用栈 */
export class WorkSelectError extends Error {}

/** 名字统一成 NFC；APFS、NTFS 默认不分大小写，查重按小写 */
const canonicalName = (name: string) => name.normalize('NFC');
const lookupName = (name: string, source: string) => {
  if (!name || /[\\/:*?"<>|]/.test(name) || name.startsWith('.')) throw new WorkSelectError(`作品名「${name}」不合规（${source}）：不能空、不能以 . 开头、不能有 / \\ : * ? " < > |`);
};

/** 全部作品：名 → 根（绝对路径）。作品/ 下的和 [works] 登记的同名时，以登记的为准（作品/<名>/ 下的作品不用登记，私有的也一样，见 0004「公开和私有」） */
export const listWorks = (root = codeRoot(), registry = workPathTable()): Map<string, string> => {
  const workRoots = new Map<string, string>();
  const addWork = (name: string, dir: string, source: string) => {
    name = canonicalName(name);
    lookupName(name, source);
    const clash = [...workRoots.keys()].find((k) => k !== name && k.toLowerCase() === name.toLowerCase());
    if (clash) throw new WorkSelectError(`作品名「${name}」和「${clash}」只差大小写（${source}）`);
    workRoots.set(name, dir);
  };
  const workDir = path.join(root, '作品');
  if (fs.existsSync(workDir)) {
    for (const e of fs.readdirSync(workDir, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(workDir, e.name, '清单.ts'))) addWork(e.name, path.join(workDir, e.name), `作品/${e.name}/`);
    }
  }
  for (const [name, dir] of Object.entries(registry)) {
    if (!fs.existsSync(path.join(dir, '清单.ts'))) throw new WorkSelectError(`anim.local.toml [works] 的「${name}」指向 ${dir}，那里没有 清单.ts`);
    addWork(name, dir, `anim.local.toml [works]`);
  }
  return workRoots;
};

/** realpath；路径还不存在就解析到最近的存在的上级再接上剩下的（macOS 的 /var → /private/var） */
const realPath = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    const parentDir = path.dirname(p);
    return parentDir === p ? p : path.join(realPath(parentDir), path.basename(p));
  }
};

const isInside = (dir: string, root: string) => {
  const r = path.relative(realPath(root), realPath(path.resolve(dir)));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

export type WorkSelectOptions = {
  参数?: string;
  cwd?: string;
  默认?: string;
  们?: Map<string, string>;
};

/** 按 --work > 当前目录 > 默认作品 > 只有一部 选；名字不分大小写 */
export const pickWork = ({ 参数: params, cwd = process.cwd(), 默认: defaultWork = '', 们: workRoots = listWorks() }: WorkSelectOptions = {}): Work => {
  const names = [...workRoots.keys()];
  const findWork = (name: string, source: string): Work => {
    const matchedName = names.find((k) => k.toLowerCase() === canonicalName(name).toLowerCase());
    if (!matchedName) throw new WorkSelectError(`没有作品「${name}」（${source}）；有：${names.join('、') || '（一部都没有）'}`);
    return { 名: matchedName, 根: workRoots.get(matchedName)! };
  };
  if (params) return findWork(params, '--work');
  // 最深的那个（外部作品可能在另一部作品目录里面）
  const matched = names.filter((k) => isInside(cwd, workRoots.get(k)!)).sort((a, b) => workRoots.get(b)!.length - workRoots.get(a)!.length)[0];
  if (matched) return { 名: matched, 根: workRoots.get(matched)! };
  if (defaultWork) return findWork(defaultWork, 'anim.local.toml 的 work 或 ANIM_WORK');
  if (names.length === 1) return { 名: names[0]!, 根: workRoots.get(names[0]!)! };
  throw new WorkSelectError(
    names.length
      ? `有 ${names.length} 部作品（${names.join('、')}），用 --work <名> 指定，或在作品目录里跑，或在 anim.local.toml 写 work = "<名>"`
      : '一部作品都没有（作品/<名>/清单.ts）',
  );
};

let explicitWork: string | undefined;
let current: Work | undefined;

/** cli/路由.ts 解析出 --work 后调；测试也用它切换 */
export const setSpecifiedWork = (name: string | undefined) => {
  explicitWork = name;
  current = undefined;
};

/** --work 给的名字（没给是 undefined）：anim cache gc 没给就处理全部作品 */
export const getSpecifiedWork = () => explicitWork;

export const currentWork = (): Work => (current ??= pickWork({ 参数: explicitWork, 默认: config('默认作品') }));
/** 作品根：作品的 index.ts、注册.tsx、清单.ts 所在的目录，打包入口和 webpack改写(作品根) 都从它取 */
export const workRoot = () => currentWork().根;
export const workName = () => currentWork().名;

/** 从参数里取出 --work <名> / --work=<名>，返回剩下的参数 */
export const parseWorkArg = (args: readonly string[]): { 作品?: string; rest: string[] } => {
  const rest: string[] = [];
  let work: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') {
      rest.push(...args.slice(i));
      break;
    }
    if (a === '--work') {
      work = args[++i];
      if (!work) throw new WorkSelectError('--work 后面要跟作品名');
    } else if (a.startsWith('--work=')) work = a.slice('--work='.length);
    else rest.push(a);
  }
  return { 作品: work, rest };
};

/** 段全名「作品/段键」拆开；只有段键时 作品 为空 */
export const splitFullName = (selector: string): { 作品?: string; 键: string } => {
  const i = selector.indexOf('/');
  return i < 0 ? { 键: selector } : { 作品: selector.slice(0, i), 键: selector.slice(i + 1) };
};
