// debug：调试、试看开关和登记表（engine/core/调试开关.ts）两头对得上（用户 11-17 同意收成一张表）。
// - 代码里 trialParams('名')、trialOff('项')、trialKey('名') 的名字都登记过，参数要写字面量（不然查不了）；
// - 登记了的（不是占位）有人用、落点文件在；占位行（pending）被代码用到了就该去掉 pending；
// - REMOTION_ANIM_ 开头的字符串都是登记过的调试环境变量（或 nonDebugEnvNames 里的正式通道），登记了的环境变量名在它的落点里出现。
// 查全仓的代码（engine、库、所有作品、pipeline），测试不算。
import { debugSwitches, nonDebugEnvNames, type DebugSwitch } from '../../../engine/core/调试开关.ts';
import { codeExtRegex, isTestOrDecl, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { lineNo, literalValue, parseSource, walk, ts } from '../语法.ts';

const registry = 'engine/core/调试开关.ts';
const callKinds = { trialParams: 'trial', trialKey: 'trial', trialOff: 'off' } as const;
type Use = { kind: 'trial' | 'off' | 'channel'; name: string; file: string; line: number };

/** 一个文件里用到的名字；参数不是字面量的记进 bad */
export const findSwitchUses = (file: string, source: string): { uses: Use[]; bad: { file: string; line: number; text: string }[] } => {
  const uses: Use[] = [];
  const bad: { file: string; line: number; text: string }[] = [];
  if (!/trialParams|trialOff|trialKey|REMOTION_ANIM_/.test(source)) return { uses, bad };
  const sf = parseSource(file, source);
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text in callKinds) {
      const fn = n.expression.text as keyof typeof callKinds;
      const v = literalValue(n.arguments[0]);
      if (typeof v === 'string') uses.push({ kind: callKinds[fn], name: v, file, line: lineNo(sf, n) });
      else if (n.arguments.length) bad.push({ file, line: lineNo(sf, n), text: `${fn}(…) 的名字要写字符串字面量，check 才数得到` });
    }
    // 字符串里的名字，和 process.env.REMOTION_ANIM_X 这种直接读的
    const envName = ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isPropertyAccessExpression(n) ? n.name.text : undefined;
    if (envName && /^REMOTION_ANIM_[A-Z0-9_]+$/.test(envName)) uses.push({ kind: 'channel', name: envName, file, line: lineNo(sf, n) });
  });
  return { uses, bad };
};

export const checkDebugSwitches = (c: CheckContext, report: CheckReport) => {
  const rows = debugSwitches as readonly DebugSwitch[];
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.kind}:${r.name}`;
    if (seen.has(k)) report.错(`登记了两行 ${r.kind}「${r.name}」`, registry);
    seen.add(k);
  }
  const uses: Use[] = [];
  for (const p of c.file()) {
    if (!/^(engine|库|作品|pipeline)\//.test(p) || !codeExtRegex.test(p) || isTestOrDecl(p) || p === registry) continue;
    const r = findSwitchUses(p, c.读(p));
    uses.push(...r.uses);
    for (const b of r.bad) report.错(b.text, b.file, b.line);
  }
  const nonDebug = new Set<string>(nonDebugEnvNames);
  for (const u of uses) {
    if (u.kind === 'channel' && nonDebug.has(u.name)) continue;
    const row = rows.find((r) => r.kind === u.kind && r.name === u.name);
    if (!row) report.错(`${u.kind === 'channel' ? '环境变量' : u.kind === 'off' ? '「关」的项' : '试看名'}「${u.name}」没登记：加进 ${registry}`, u.file, u.line);
    else if (row.pending) report.错(`「${u.name}」已经有代码用了（${u.file}:${u.line}），登记表里还写着占位 ${row.pending}：删掉 pending、核对格式和落点`, registry);
  }
  let pendingCount = 0;
  for (const r of rows) {
    if (r.pending) {
      pendingCount++;
      continue;
    }
    const mine = uses.filter((u) => u.kind === r.kind && u.name === r.name);
    for (const u of mine) if (!r.files.includes(u.file)) report.错(`${r.kind}「${r.name}」在 ${u.file} 里用到了，落点没写它`, u.file, u.line);
    if (!mine.length) report.错(`登记了 ${r.kind}「${r.name}」，代码里没人用：删掉这一行，或写上 pending（还在哪条分支上）`, registry);
    for (const f of r.files) {
      if (!c.exists(f)) report.错(`${r.kind}「${r.name}」的落点 ${f} 不在`, registry);
      else if (r.kind === 'channel' && !mine.some((u) => u.file === f)) report.错(`环境变量 ${r.name} 登记的落点 ${f} 里没出现这个名字`, registry);
    }
  }
  report.infoLines.push(`登记 ${rows.length} 行（占位 ${pendingCount}），代码里用到 ${uses.length} 处`);
};
