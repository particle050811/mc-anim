// 用 TypeScript 的解析器读语法树（只解析不做类型检查）：查调用、属性、字符串字面量时不会把注释和字符串里的字误当成代码。
import ts from 'typescript';

const scriptKind = (file: string) =>
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;

export const parseSource = (file: string, source: string) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));

export const walk = (n: ts.Node, fn: (n: ts.Node) => void) => {
  fn(n);
  n.forEachChild((c) => walk(c, fn));
};

export const lineNo = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** 字面量的值（字符串、数、布尔、负数）；不是字面量返回 undefined */
export const literalValue = (n: ts.Expression | undefined): string | number | boolean | undefined => {
  if (!n) return undefined;
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return -Number(n.operand.text);
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) return literalValue(n.expression);
  return undefined;
};

export const propertyName = (n: ts.PropertyName): string | undefined =>
  ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : undefined;

/** a.b 形式的属性访问，返回 ['a','b']；不是就 null */
export const dotPath = (n: ts.Node): string[] | null => {
  if (ts.isIdentifier(n)) return [n.text];
  if (ts.isPropertyAccessExpression(n)) {
    const leftPath = dotPath(n.expression);
    return leftPath ? [...leftPath, n.name.text] : null;
  }
  return null;
};

/** 文件里声明或导出的顶层名字（const、function、class、type、interface、enum、export { x }） */
export const declaredNames = (sf: ts.SourceFile): Set<string> => {
  const declaredNames = new Set<string>();
  for (const s of sf.statements) {
    if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) walk(d.name, (x) => ts.isIdentifier(x) && declaredNames.add(x.text));
    else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEnumDeclaration(s)) && s.name) declaredNames.add(s.name.text);
    else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) for (const e of s.exportClause.elements) declaredNames.add(e.name.text);
  }
  return declaredNames;
};

export { ts };
