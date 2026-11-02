import { 解析, 遍历, ts } from './语法.ts';
import { 是渲染代码, type 报告, type 检查上下文 } from './上下文.ts';

/** 只守漏接线：同模块登记来源却完全没登记模型。不能替代浏览器里对版本、字节及调用先后的验证。 */
export const 漏登记模型 = (文件: string, 源: string): boolean => {
  const sf = 解析(文件, 源), 名们 = new Map<string, string>(), 空间 = new Set<string>();
  for (const n of sf.statements) {
    if (!ts.isImportDeclaration(n) || !ts.isStringLiteral(n.moduleSpecifier) || !n.moduleSpecifier.text.endsWith('/区段工人池.ts')) continue;
    const b = n.importClause?.namedBindings;
    if (b && ts.isNamedImports(b)) for (const e of b.elements) 名们.set(e.name.text, (e.propertyName ?? e.name).text);
    if (b && ts.isNamespaceImport(b)) 空间.add(b.name.text);
  }
  const 调了 = new Set<string>();
  遍历(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const e = n.expression;
    if (ts.isIdentifier(e)) 调了.add(名们.get(e.text) ?? '');
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && 空间.has(e.expression.text)) 调了.add(e.name.text);
  });
  return 调了.has('registerSource') && !调了.has('registerModel');
};

export const 查区段模型登记 = (c: 检查上下文, 报: 报告) => {
  for (const p of c.代码文件()) if (是渲染代码(p) && 漏登记模型(p, c.读(p)))
    报.错('区段来源 registerSource 没有配套 registerModel：格式 3 必须先取同版本的模型.bin、读模型校验并登记，再请求区段', p);
};
