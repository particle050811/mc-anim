// 平台卫生：仓库里的路径在 Windows 上合法（不用 <>:"\|?* 和控制字符、不以点或空格结尾、不用 CON/NUL/COM1 这类保留名、
// 不靠大小写区分、Unicode 用 NFC）；结构层路径只用 ASCII（顶层目录（库、作品 除外，用户定的名字）、py/ 下的包、sourcing/mod/ 整棵树、作品/<名>/认可/<平台>）；
// 代码里不开 shell：JS/TS 的 shell 选项、exec/execSync（传字符串命令，Node 隐式起 sh/cmd.exe）、spawn/execFile 不带参数数组，
// Python 的 shell=True、os.system/os.popen、subprocess.getoutput/getstatusoutput；Python 不用 fcntl（Windows 没有）。
import { codeExtRegex, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { propertyName, lineNo, parseSource, walk, ts } from '../语法.ts';

const reservedNameRegex = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

export const nameProblem = (pathSegmentName: string): string | null => {
  if (/[<>:"\\|?*\x00-\x1f]/.test(pathSegmentName)) return '有 Windows 不许的字符（<>:"\\|?* 或控制字符）';
  if (/[. ]$/.test(pathSegmentName)) return '以点或空格结尾（Windows 会吃掉）';
  if (reservedNameRegex.test(pathSegmentName)) return '是 Windows 的保留设备名';
  if (pathSegmentName.normalize('NFC') !== pathSegmentName) return '不是 NFC（Mac 上分解写法的中文，别的系统上会变成另一个名字）';
  return null;
};

/** 哪些路径段属于结构层、要求 ASCII：返回不合规的那一段 */
export const structNonAscii = (p: string): string | null => {
  const pathSegs = p.split('/');
  const isNonAscii = (s: string) => /[^\x20-\x7e]/.test(s);
  if (pathSegs.length > 1 && isNonAscii(pathSegs[0]!) && !['库', '作品'].includes(pathSegs[0]!)) return pathSegs[0]!;
  if (pathSegs.length === 1 && isNonAscii(pathSegs[0]!)) return pathSegs[0]!; // 根目录下的文件
  if (pathSegs[0] === 'py' && pathSegs.length > 2 && isNonAscii(pathSegs[1]!)) return pathSegs[1]!;
  if (pathSegs[0] === 'sourcing' && pathSegs[1] === 'mod') return pathSegs.find(isNonAscii) ?? null;
  if (pathSegs[0] === '作品' && pathSegs[2] === '认可' && pathSegs.length > 4 && isNonAscii(pathSegs[3]!)) return pathSegs[3]!;
  return null;
};

/** 只差大小写（含 NFC 归一）的路径：目录也算，a/X/1 和 a/x/2 在 Windows、Mac 上落在同一个目录里 */
export const caseConflict = (paths: readonly string[]) => {
  const lowerNames = new Map<string, string>();
  const r: { file: string; existing: string; isFile: boolean }[] = [];
  for (const p of paths) {
    const pathSegs = p.split('/');
    for (let i = 1; i <= pathSegs.length; i++) {
      const originalPath = pathSegs.slice(0, i).join('/');
      const k = originalPath.normalize('NFC').toLowerCase();
      const existing = lowerNames.get(k);
      if (existing === undefined) lowerNames.set(k, originalPath);
      else if (existing !== originalPath) {
        r.push({ file: p, existing, isFile: i === pathSegs.length });
        break;
      }
    }
  }
  return r;
};

const childProcessModules = new Set(['child_process', 'node:child_process', 'cross-spawn']);
const implicitShellFns = new Set(['exec', 'execSync']);
const arrayArgFns = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'sync']);

/** child_process / cross-spawn 绑到本文件的名字：本地名 → 原函数名（default 和命名空间记 '*'） */
const childProcessBindings = (sf: ts.SourceFile) => {
  const localNames = new Map<string, string>();
  const isRequireCall = (e: ts.Expression | undefined): boolean =>
    !!e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'require' && !!e.arguments[0] && ts.isStringLiteral(e.arguments[0]) && childProcessModules.has(e.arguments[0].text);
  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && childProcessModules.has(n.moduleSpecifier.text) && n.importClause && !n.importClause.isTypeOnly) {
      const specifier = n.moduleSpecifier.text;
      if (n.importClause.name) localNames.set(n.importClause.name.text, specifier === 'cross-spawn' ? 'spawn' : '*');
      const b = n.importClause.namedBindings;
      if (b && ts.isNamespaceImport(b)) localNames.set(b.name.text, '*');
      if (b && ts.isNamedImports(b)) for (const e of b.elements) localNames.set(e.name.text, propertyName(e.propertyName ?? e.name) ?? e.name.text);
    }
    if (ts.isVariableDeclaration(n) && isRequireCall(n.initializer)) {
      if (ts.isIdentifier(n.name)) localNames.set(n.name.text, '*');
      else if (ts.isObjectBindingPattern(n.name))
        for (const e of n.name.elements) if (ts.isIdentifier(e.name)) localNames.set(e.name.text, e.propertyName ? (propertyName(e.propertyName) ?? e.name.text) : e.name.text);
    }
  });
  return localNames;
};

/** 起子进程的调用里会经过 shell、或没给参数数组的：返回原因 */
const spawnProblem = (n: ts.CallExpression, bindings: Map<string, string>): string | null => {
  let calleeName: string | undefined;
  if (ts.isIdentifier(n.expression)) calleeName = bindings.get(n.expression.text);
  else if (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && bindings.get(n.expression.expression.text) === '*') calleeName = n.expression.name.text;
  if (!calleeName) return null;
  if (implicitShellFns.has(calleeName)) return `${calleeName} 传字符串命令，会隐式起 shell：改用 execFile/spawn 加参数数组`;
  if (arrayArgFns.has(calleeName)) {
    const argParams = n.arguments[1];
    if (!argParams || ts.isObjectLiteralExpression(argParams) || ts.isStringLiteral(argParams) || ts.isTemplateExpression(argParams) || ts.isNoSubstitutionTemplateLiteral(argParams)) return `${calleeName} 要带参数数组（没有参数也写 []）`;
  }
  return null;
};

export const checkPlatform = async (c: CheckContext, report: CheckReport) => {
  for (const p of c.file()) {
    for (const pathSegmentName of p.split('/')) {
      const pathProblem = nameProblem(pathSegmentName);
      if (pathProblem) report.错(`路径里的「${pathSegmentName}」${pathProblem}`, p);
    }
    const nonAsciiPart = structNonAscii(p);
    if (nonAsciiPart) report.错(`结构层路径要用英文 ASCII：「${nonAsciiPart}」（场、段、资产这类实体名才用中文）`, p);
  }
  for (const x of caseConflict(c.file())) report.错(`和 ${x.existing} 只差大小写，Windows 和 Mac 上是同一个${x.isFile ? '文件' : '目录'}`, x.file);

  for (const p of c.file()) {
    if (codeExtRegex.test(p) && !/\.d\.[cm]?ts$/.test(p)) {
      const sourceText = c.读(p);
      if (!/shell|child_process|cross-spawn/.test(sourceText)) continue;
      const sf = parseSource(p, sourceText);
      const bindings = childProcessBindings(sf);
      walk(sf, (n) => {
        const shellProblem = bindings.size && ts.isCallExpression(n) ? spawnProblem(n, bindings) : null;
        if (shellProblem) report.错(`不开 shell：${shellProblem}（pipeline/环境/子进程.ts）`, p, lineNo(sf, n));
        if (ts.isPropertyAssignment(n) && propertyName(n.name) === 'shell' && n.initializer.kind !== ts.SyntaxKind.FalseKeyword) {
          report.错('不开 shell：子进程用数组参数（pipeline/环境/子进程.ts；Windows 的 .cmd 交给 cross-spawn）', p, lineNo(sf, n));
        }
        if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'shell') report.错('不开 shell：子进程用数组参数', p, lineNo(sf, n));
      });
    } else if (p.endsWith('.py')) {
      c.读(p)
        .split('\n')
        .forEach((l, i) => {
          const codeLine = l.replace(/#.*$/, '');
          if (/\bshell\s*=\s*(?!False\b)\w/.test(codeLine)) report.错('不开 shell：subprocess 用列表参数', p, i + 1);
          if (/\bos\.(system|popen)\s*\(|\bsubprocess\.(getoutput|getstatusoutput)\s*\(|^\s*from\s+(os\s+import\s+.*\b(system|popen)\b|subprocess\s+import\s+.*\bget(status)?output\b)/.test(codeLine))
            report.错('不开 shell：os.system、os.popen、subprocess.getoutput 都经过 shell，改用 subprocess.run 加列表参数', p, i + 1);
          if (/^\s*(import\s+([\w.]+\s*,\s*)*fcntl\b|from\s+fcntl\s+import\b)/.test(codeLine)) report.错('不用 fcntl（Windows 没有）：锁用 O_EXCL 建文件，照 pipeline/闸/锁.ts', p, i + 1);
        });
    }
  }
};
