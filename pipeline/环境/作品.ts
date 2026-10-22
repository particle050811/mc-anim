// 作品：有哪几部、这次用哪部。作品是 <代码根>/作品/<名>/ 下有 清单.ts 的目录，外加 anim.local.toml [works] 登记的外部目录（见 docs/决策/0004-多作品.md）。
// 选哪部：--作品（cli/main.ts 解析后调 指定作品）> 当前目录在哪部作品里 > anim.local.toml 的 work（ANIM_WORK）> 只有一部就用它；都定不了就报错列出作品名。
import fs from 'node:fs';
import path from 'node:path';
import { 代码根 } from './路径.ts';
import { 配置, 作品路径表 } from './配置.ts';

/** 从旧仓库搬来的那部作品（旧项目适配器按它取基线、作品根） */
export const 旧布局作品 = '应力转动';

export type 作品 = { 名: string; 根: string };

/** 选不出作品（没指定、有好几部，或名字不对）：cli/main.ts 只打这一行提示，不打调用栈 */
export class 选作品错误 extends Error {}

/** 名字统一成 NFC；APFS、NTFS 默认不分大小写，查重按小写 */
const 规范名 = (名: string) => 名.normalize('NFC');
const 查名 = (名: string, 来自: string) => {
  if (!名 || /[\\/:*?"<>|]/.test(名) || 名.startsWith('.')) throw new 选作品错误(`作品名「${名}」不合规（${来自}）：不能空、不能以 . 开头、不能有 / \\ : * ? " < > |`);
};

/** 全部作品：名 → 根（绝对路径）。作品/ 下的和 [works] 登记的同名时，以登记的为准（作品/<名>/ 下的私有作品不用登记，见 0004「私有作品」） */
export const 作品们 = (根 = 代码根(), 登记 = 作品路径表()): Map<string, string> => {
  const 们 = new Map<string, string>();
  const 加 = (名: string, dir: string, 来自: string) => {
    名 = 规范名(名);
    查名(名, 来自);
    const 撞 = [...们.keys()].find((k) => k !== 名 && k.toLowerCase() === 名.toLowerCase());
    if (撞) throw new 选作品错误(`作品名「${名}」和「${撞}」只差大小写（${来自}）`);
    们.set(名, dir);
  };
  const 作品目录 = path.join(根, '作品');
  if (fs.existsSync(作品目录)) {
    for (const e of fs.readdirSync(作品目录, { withFileTypes: true })) {
      if (e.isDirectory() && fs.existsSync(path.join(作品目录, e.name, '清单.ts'))) 加(e.name, path.join(作品目录, e.name), `作品/${e.name}/`);
    }
  }
  for (const [名, dir] of Object.entries(登记)) {
    if (!fs.existsSync(path.join(dir, '清单.ts'))) throw new 选作品错误(`anim.local.toml [works] 的「${名}」指向 ${dir}，那里没有 清单.ts`);
    加(名, dir, `anim.local.toml [works]`);
  }
  return 们;
};

/** realpath；路径还不存在就解析到最近的存在的上级再接上剩下的（macOS 的 /var → /private/var） */
const 真实路径 = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    const 上 = path.dirname(p);
    return 上 === p ? p : path.join(真实路径(上), path.basename(p));
  }
};

const 在里面 = (dir: string, 根: string) => {
  const r = path.relative(真实路径(根), 真实路径(path.resolve(dir)));
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

export type 选法 = {
  参数?: string;
  cwd?: string;
  默认?: string;
  们?: Map<string, string>;
};

/** 按 --作品 > 当前目录 > 默认作品 > 只有一部 选；名字不分大小写 */
export const 选作品 = ({ 参数, cwd = process.cwd(), 默认 = '', 们 = 作品们() }: 选法 = {}): 作品 => {
  const 名单 = [...们.keys()];
  const 找 = (名: string, 来自: string): 作品 => {
    const 中 = 名单.find((k) => k.toLowerCase() === 规范名(名).toLowerCase());
    if (!中) throw new 选作品错误(`没有作品「${名}」（${来自}）；有：${名单.join('、') || '（一部都没有）'}`);
    return { 名: 中, 根: 们.get(中)! };
  };
  if (参数) return 找(参数, '--作品');
  // 最深的那个（外部作品可能在另一部作品目录里面）
  const 所在 = 名单.filter((k) => 在里面(cwd, 们.get(k)!)).sort((a, b) => 们.get(b)!.length - 们.get(a)!.length)[0];
  if (所在) return { 名: 所在, 根: 们.get(所在)! };
  if (默认) return 找(默认, 'anim.local.toml 的 work 或 ANIM_WORK');
  if (名单.length === 1) return { 名: 名单[0]!, 根: 们.get(名单[0]!)! };
  throw new 选作品错误(
    名单.length
      ? `有 ${名单.length} 部作品（${名单.join('、')}），用 --作品 <名> 指定，或在作品目录里跑，或在 anim.local.toml 写 work = "<名>"`
      : '一部作品都没有（作品/<名>/清单.ts）',
  );
};

let 指定: string | undefined;
let 当前: 作品 | undefined;

/** cli/main.ts 解析出 --作品 后调；测试也用它切换 */
export const 指定作品 = (名: string | undefined) => {
  指定 = 名;
  当前 = undefined;
};

export const 当前作品 = (): 作品 => (当前 ??= 选作品({ 参数: 指定, 默认: 配置('默认作品') }));
/** 作品根：作品的 index.ts、注册.tsx、清单.ts 所在的目录，打包入口和 webpack改写(作品根) 都从它取 */
export const 作品根 = () => 当前作品().根;
export const 作品名 = () => 当前作品().名;

/** 从参数里取出 --作品 <名> / --作品=<名>，返回剩下的参数 */
export const 取作品参数 = (args: readonly string[]): { 作品?: string; 其余: string[] } => {
  const 其余: string[] = [];
  let 作品: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--') {
      其余.push(...args.slice(i));
      break;
    }
    if (a === '--作品') {
      作品 = args[++i];
      if (!作品) throw new 选作品错误('--作品 后面要跟作品名');
    } else if (a.startsWith('--作品=')) 作品 = a.slice('--作品='.length);
    else 其余.push(a);
  }
  return { 作品, 其余 };
};

/** 段全名「作品/段键」拆开；只有段键时 作品 为空 */
export const 拆全名 = (选择器: string): { 作品?: string; 键: string } => {
  const i = 选择器.indexOf('/');
  return i < 0 ? { 键: 选择器 } : { 作品: 选择器.slice(0, i), 键: 选择器.slice(i + 1) };
};
