// 用 TypeScript 的解析器读语法树（只解析不做类型检查）：查调用、属性、字符串字面量时不会把注释和字符串里的字误当成代码。
import ts from 'typescript';

const 种类 = (文件: string) =>
  文件.endsWith('.tsx') ? ts.ScriptKind.TSX : 文件.endsWith('.jsx') ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(文件) ? ts.ScriptKind.JS : ts.ScriptKind.TS;

export const 解析 = (文件: string, 源码: string) => ts.createSourceFile(文件, 源码, ts.ScriptTarget.Latest, true, 种类(文件));

export const 遍历 = (n: ts.Node, fn: (n: ts.Node) => void) => {
  fn(n);
  n.forEachChild((c) => 遍历(c, fn));
};

export const 行号 = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** 字面量的值（字符串、数、布尔、负数）；不是字面量返回 undefined */
export const 字面值 = (n: ts.Expression | undefined): string | number | boolean | undefined => {
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text);
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) return 字面值(n.expression);
  return undefined;
};

export const 属性名 = (n: ts.PropertyName): string | undefined =>
  ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : undefined;

/** a.b 形式的属性访问，返回 ['a','b']；不是就 null */
export const 点路径 = (n: ts.Node): string[] | null => {
  if (ts.isIdentifier(n)) return [n.text];
  if (ts.isPropertyAccessExpression(n)) {
    const 左 = 点路径(n.expression);
    return 左 ? [...左, n.name.text] : null;
  }
  return null;
};

/** 文件里声明或导出的顶层名字（const、function、class、type、interface、enum、export { x }） */
export const 声明的名字 = (sf: ts.SourceFile): Set<string> => {
  const 名 = new Set<string>();
  for (const s of sf.statements) {
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) 遍历(d.name, (x) => ts.isIdentifier(x) && 名.add(x.text));
    else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEnumDeclaration(s)) && s.name) 名.add(s.name.text);
    else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) for (const e of s.exportClause.elements) 名.add(e.name.text);
  }
  return 名;
};

export { ts };
