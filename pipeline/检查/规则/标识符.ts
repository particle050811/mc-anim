// 标识符：代码里不新增含汉字的标识符（用户 11-15 定代码名改英文，docs/命名.md「代码标识符」）。
// 现有的冻在 pipeline/检查/中文标识符基线.txt，一行一个名字：
// - 代码里出现基线以外的中文名 → 违规，起英文名；
// - 基线里的名字代码里已经没有了（改掉了）→ 违规，从基线删掉这一行；表和 main 的分叉点比只许减少，删掉的不许再加回来。
// 按名字记、不按文件记：盘上数据的键（info.版本）还是中文，新代码读它得过；挪文件也不用改表。代价是新代码重用基线里已有的中文名查不出。
// 只看语法树里的标识符（只解析不做类型检查，forEachChild 不进注释）：字符串、注释、JSX 文本、文件名都不算。
// 查全仓的代码（所有作品、测试也算），基线是全仓一张；Python 不查。
import { execFileSync } from 'node:child_process';
import { codeExtRegex, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { lineNo, parseSource, ts } from '../语法.ts';

export const hanBaselinePath = 'pipeline/检查/中文标识符基线.txt';

const HAN = /[㐀-鿿豈-﫿]/;

/** 读基线：# 开头的是注释，空行跳过，其余一行一个名字 */
export const readHanBaseline = (text: string): string[] => text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));

/** 一个文件里含汉字的标识符：名字 → 出现的行号 */
export const hanIdentifiers = (file: string, source: string): Map<string, number[]> => {
  const found = new Map<string, number[]>();
  if (!HAN.test(source)) return found;
  const sf = parseSource(file, source);
  const visit = (n: ts.Node) => {
    if ((ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) && HAN.test(n.text)) {
      (found.get(n.text) ?? found.set(n.text, []).get(n.text)!).push(lineNo(sf, n));
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return found;
};

/** 全仓代码里现有的中文标识符：名字 → 文件 → 行号 */
export const currentHanIdentifiers = (c: CheckContext): Map<string, Map<string, number[]>> => {
  const byName = new Map<string, Map<string, number[]>>();
  for (const p of c.file()) {
    if (!codeExtRegex.test(p)) continue;
    for (const [name, lines] of hanIdentifiers(p, c.读(p))) (byName.get(name) ?? byName.set(name, new Map()).get(name)!).set(p, lines);
  }
  return byName;
};

/** 基线在 main 分叉点上的样子；拿不到（不在 git、没有 main、那时还没这张表）给 null */
const baselineAtMergeBase = (c: CheckContext): string | null => {
  const git = (...a: string[]) => execFileSync('git', ['-C', c.root, '-c', 'core.quotepath=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    return git('show', `${git('merge-base', 'HEAD', 'main').trim()}:${hanBaselinePath}`);
  } catch {
    return null;
  }
};

export const hanIdentifierRule = (c: CheckContext, report: CheckReport) => {
  if (!c.exists(hanBaselinePath)) return void report.错(`没有 ${hanBaselinePath}（现有中文标识符的冻结表；一个都没有也要留文件）`);
  const baseline = readHanBaseline(c.读(hanBaselinePath));
  const allowed = new Set(baseline);
  const current = currentHanIdentifiers(c);

  for (const [name, files] of current) {
    if (allowed.has(name)) continue;
    const spots = [...files].flatMap(([p, lines]) => lines.map((l) => `${p}:${l}`));
    const [firstFile, firstLines] = [...files][0]!;
    report.错(`新的中文标识符「${name}」（${spots.length} 处：${spots.slice(0, 3).join('、')}${spots.length > 3 ? ' …' : ''}）：代码名用英文，见 docs/命名.md「代码标识符」`, firstFile, firstLines[0]);
  }
  const gone = baseline.filter((name) => !current.has(name));
  if (gone.length) report.错(`基线里有 ${gone.length} 个名字代码里已经没有了，从 ${hanBaselinePath} 删掉这几行：${gone.join('、')}`, hanBaselinePath);
  const dup = baseline.filter((name, i) => baseline.indexOf(name) !== i);
  if (dup.length) report.错(`基线里重复的行：${[...new Set(dup)].join('、')}`, hanBaselinePath);

  const old = baselineAtMergeBase(c);
  if (old === null) report.infoLines.push(`和 main 的分叉点比不了（不在 git、没有 main，或那时还没有 ${hanBaselinePath}），不查表只减不增`);
  else {
    const before = new Set(readHanBaseline(old));
    const added = baseline.filter((name) => !before.has(name));
    if (added.length) report.错(`基线比 main 的分叉点多了 ${added.length} 个名字（${added.join('、')}）：表只许减少，新代码起英文名`, hanBaselinePath);
  }
  report.infoLines.push(`中文标识符：基线 ${baseline.length} 个名字，代码里现有 ${current.size} 个`);
};
