import { parseSource, walk, ts } from './语法.ts';
import { isRenderCode, type CheckReport, type CheckContext } from './上下文.ts';

/** 只守漏接线：同模块登记来源却完全没登记模型。不能替代浏览器里对版本、字节及调用先后的验证。 */
export const isUnregisteredSectionModel = (file: string, sourceText: string): boolean => {
  const sf = parseSource(file, sourceText), names = new Map<string, string>(), spaces = new Set<string>();
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || !n.moduleSpecifier.text.endsWith('/区段工人池.ts')) continue;
    const b = n.importClause?.namedBindings;
    if (b && ts.isNamedImports(b)) for (const e of b.elements) names.set(e.name.text, (e.propertyName ?? e.name).text);
    if (b && ts.isNamespaceImport(b)) spaces.add(b.name.text);
  }
  const called = new Set<string>();
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const e = n.expression;
    if (ts.isIdentifier(e)) called.add(names.get(e.text) ?? '');
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && spaces.has(e.expression.text)) called.add(e.name.text);
  });
  return called.has('registerSource') && !called.has('registerModel');
};

export const checkSectionModelReg = (c: CheckContext, report: CheckReport) => {
  for (const p of c.codeFiles()) if (isRenderCode(p) && isUnregisteredSectionModel(p, c.读(p)))
    report.错('区段来源 registerSource 没有配套 registerModel：格式 3 必须先取同版本的模型.bin、读模型校验并登记，再请求区段', p);
};
