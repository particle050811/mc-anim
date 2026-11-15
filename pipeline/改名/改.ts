// 改、核：按「组 id → 新名」表，用扫出来的位置一次改完；先在内存里改，改前改后各解析一遍逐个标识符核对指向的声明，过了才落盘。
// - 同一处的多份改动合成一份：简写 { 名 } 属性面、值面各归各的组，两面都改成同一个名还是简写，不同就写成 { 属性: 值 }；
// - 字符串引用（时间线事件名的 接: '…' 这类 TS 不查的）只在表里写了 strings 才改；
// - 核对：每个标识符出现处（不只改了的）在改前、改后指向的声明（按改名前的位置对应）必须一样，
//   新名遮住外层同名的、撞了别的名的、漏改的（改后解不到或解到别处）都会报出来；
//   再比改前改后这些文件的 TS 诊断，多出来的报出来（整仓 tsc 用 --tsc 在落盘后跑）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import ts from 'typescript';
import { HAN, badNewName, walk, Workspace } from './工程.ts';
import { sha1, type Loc, type ScanResult } from './扫.ts';

export type TableEntry = { id: string; name: string; strings?: 'all' | string[] };

/** 表：每行 组 id <TAB> 新名 [<TAB> strings]；# 开头是注释 */
export const readTable = (text: string): TableEntry[] =>
  text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const [id, name, strings] = l.split('\t');
      if (!id || !name) throw new Error(`表里这行不对：${l}`);
      const e: TableEntry = { id: id.trim(), name: name.trim() };
      if (strings?.trim()) e.strings = strings.trim() === 'all' ? 'all' : strings.split(',').map((s) => s.trim());
      return e;
    });

type Slot = { file: string; start: number; end: number; plain?: string; p?: string; v?: string; str?: boolean; owners: Set<string> };
type Edit = { start: number; end: number; text: string };

export type Mismatch = { file: string; line: number; before: string; after: string; was: string[]; now: string[] };
export type ApplyReport = {
  ok: boolean;
  written: boolean;
  groups: number;
  edits: number;
  stringEdits: number;
  files: string[];
  errors: string[];
  identifiersChecked: number;
  mismatches: Mismatch[];
  newDiagnostics: string[];
  tsc?: { exitCode: number | null; errors: number; output: string };
  seconds: number;
};

export type ApplyOptions = { write?: boolean; allowJson?: boolean; tsc?: boolean; log?: (s: string) => void };

/** 一个文件的改动按改后位置映回改前位置：落在改过的那一截里的映到那一截的起点 */
const backMapper = (edits: Edit[]) => {
  const spans: { aStart: number; aEnd: number; bStart: number; shiftAfter: number }[] = [];
  let delta = 0;
  for (const e of [...edits].sort((x, y) => x.start - y.start)) {
    const aStart = e.start + delta;
    delta += e.text.length - (e.end - e.start);
    spans.push({ aStart, aEnd: aStart + e.text.length, bStart: e.start, shiftAfter: delta });
  }
  return (pos: number): number => {
    let shift = 0;
    for (const s of spans) {
      if (pos < s.aStart) break;
      if (pos < s.aEnd) return s.bStart;
      shift = s.shiftAfter;
    }
    return pos - shift;
  };
};

export const apply = (root: string, scan: ScanResult, table: TableEntry[], opt: ApplyOptions = {}): ApplyReport => {
  const log = opt.log ?? (() => {});
  const t0 = performance.now();
  const errors: string[] = [];
  const byId = new Map(scan.groups.map((g) => [g.id, g]));
  // 别名（组里其他声明的 id）也能找到组；一个别名对上几个组就不认，要写正名
  const aliasCount = new Map<string, number>();
  for (const g of scan.groups) for (const a of g.aliases ?? []) aliasCount.set(a, (aliasCount.get(a) ?? 0) + 1);
  for (const g of scan.groups) for (const a of g.aliases ?? []) if (!byId.has(a) && aliasCount.get(a) === 1) byId.set(a, g);
  const slots = new Map<string, Slot>();
  let stringEdits = 0;
  const seenIds = new Set<string>();

  const slotAt = (l: { file: string; start: number; end: number }) => {
    const k = `${l.file}:${l.start}:${l.end}`;
    let s = slots.get(k);
    if (!s) slots.set(k, (s = { file: l.file, start: l.start, end: l.end, owners: new Set() }));
    return s;
  };
  const put = (s: Slot, role: Loc['role'], name: string, owner: string) => {
    const field = role === '' ? 'plain' : role;
    const cur = s[field];
    if (cur !== undefined && cur !== name) errors.push(`撞了：${s.file}:${s.start} 的${role === 'p' ? '属性面' : role === 'v' ? '值面' : ''}要改成 ${cur} 又要改成 ${name}（${[...s.owners].join('、')}、${owner}）`);
    s[field] = name;
    s.owners.add(owner);
  };

  for (const e of table) {
    const g = byId.get(e.id);
    if (!g) {
      errors.push(`扫描结果里没有组 ${e.id}`);
      continue;
    }
    if (seenIds.has(g.id)) errors.push(`表里 ${e.id} 和别的行是同一组 ${g.id}，写了两次`);
    seenIds.add(g.id);
    const bad = badNewName(e.name);
    if (bad) {
      errors.push(`${e.id} 的新名 ${e.name} ${bad}`);
      continue;
    }
    if (g.flags.multiName) errors.push(`${e.id} 组里有几个不同的名字（${g.flags.multiName.join('、')}），先看清再改`);
    const json = g.locs.filter((l) => /\.json$/.test(l.file));
    if (json.length && !opt.allowJson) {
      errors.push(`${e.id} 涉及 JSON 文件（盘上数据）${[...new Set(json.map((l) => l.file))].join('、')}，要改加 --allow-json（盘上字段该走数据迁移）`);
      continue;
    }
    for (const l of g.locs) {
      const s = slotAt(l);
      if (l.str) s.str = true;
      put(s, l.role, e.name, e.id);
    }
    if (e.strings) {
      const refs = scan.strings[g.name] ?? [];
      const want = e.strings === 'all' ? refs : refs.filter((r) => (e.strings as string[]).includes(`${r.file}:${r.start}`));
      if (e.strings !== 'all') for (const w of e.strings) if (!refs.some((r) => `${r.file}:${r.start}` === w)) errors.push(`${e.id} 的 strings 里 ${w} 不是「${g.name}」的字符串引用`);
      for (const r of want) {
        const s = slotAt(r);
        s.str = true;
        put(s, '', e.name, e.id);
        stringEdits++;
      }
    }
  }

  // 改动按文件归拢；扫描以后文件动过就不改（位置对不上）
  const ws = new Workspace(root);
  const perFile = new Map<string, Edit[]>();
  for (const s of slots.values()) {
    if (scan.hashes[s.file] && sha1(ws.text(s.file)) !== scan.hashes[s.file]) {
      errors.push(`${s.file} 在扫描以后改过，重新扫`);
      continue;
    }
    const old = ws.text(s.file).slice(s.start, s.end);
    let text: string;
    if (s.plain !== undefined) {
      if (s.p !== undefined || s.v !== undefined) errors.push(`${s.file}:${s.start} 既有整体改名又有简写两面的改名`);
      text = s.plain;
    } else {
      const P = s.p ?? old;
      const V = s.v ?? old;
      text = P === V ? P : `${P}: ${V}`;
    }
    if (s.str && !HAN.test(old) && old !== text) errors.push(`${s.file}:${s.start} 的字符串「${old}」不含汉字，不像要改的`);
    const list = perFile.get(s.file) ?? [];
    list.push({ start: s.start, end: s.end, text });
    perFile.set(s.file, list);
  }
  for (const [f, list] of perFile) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i]!.start < list[i - 1]!.end) errors.push(`${f}:${list[i]!.start} 两处改动重叠`);
  }
  const report: ApplyReport = {
    ok: false,
    written: false,
    groups: table.length,
    edits: [...perFile.values()].reduce((n, l) => n + l.length, 0),
    stringEdits,
    files: [...perFile.keys()].sort(),
    errors,
    identifiersChecked: 0,
    mismatches: [],
    newDiagnostics: [],
    seconds: 0,
  };
  if (errors.length) {
    report.seconds = Math.round((performance.now() - t0) / 100) / 10;
    return report;
  }

  // ---- 核：改前快照 ----
  const files = [...perFile.keys()].filter((f) => ws.fileSet.has(f));
  const back = new Map<string, (pos: number) => number>();
  const lineOfBefore = new Map<string, string>();
  for (const f of files) lineOfBefore.set(f, ws.text(f));
  const diagFiles = new Set(files);
  for (const e of table) {
    const g = byId.get(e.id)!;
    for (const r of scan.strings[g.name] ?? []) if (ws.fileSet.has(r.file)) diagFiles.add(r.file);
  }
  log(`核对：改前快照 ${files.length} 个文件`);
  const before = snapshot(ws, files, back);
  const diagBefore = diagnostics(ws, [...diagFiles], back);

  // ---- 内存里改 ----
  for (const [f, list] of perFile) {
    const text = ws.text(f);
    let out = text;
    for (const e of [...list].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    ws.setText(f, out);
    back.set(f, backMapper(list));
  }
  log('核对：改后快照');
  const after = snapshot(ws, files, back);
  const diagAfter = diagnostics(ws, [...diagFiles], back);

  for (const f of files) {
    const b = before.get(f)!;
    const a = after.get(f)!;
    const src = lineOfBefore.get(f)!;
    const lineAt = (p: number) => src.slice(0, p).split('\n').length;
    const pretty = (ids: Set<string>) =>
      [...ids].map((x) => {
        const m = /^(.*):(\d+)$/.exec(x);
        if (!m || !lineOfBefore.has(m[1]!)) return x;
        const t = lineOfBefore.get(m[1]!)!;
        return `${m[1]}:${t.slice(0, Number(m[2])).split('\n').length}`;
      });
    for (const [pos, ids] of b.ids) {
      report.identifiersChecked++;
      let now = a.ids.get(pos);
      // 没有声明的符号（Record<K, …> 映射出来的键）只能按名字认：这一处正是按表改的名，就把改后的名字认回改前的
      const bn = b.names.get(pos);
      const an = a.names.get(pos);
      if (now && bn !== an) now = new Set([...now].map((x) => (x === `内置:${an}` ? `内置:${bn}` : x)));
      if (!now || !sameSet(ids, now))
        report.mismatches.push({ file: f, line: lineAt(pos), before: b.names.get(pos)!, after: a.names.get(pos) ?? '（没了）', was: pretty(ids), now: now ? pretty(now) : [] });
    }
    for (const [pos, ids] of a.ids)
      if (!b.ids.has(pos)) report.mismatches.push({ file: f, line: lineAt(pos), before: '（没有）', after: a.names.get(pos)!, was: [], now: pretty(ids) });
  }
  for (const [k, d] of diagAfter) {
    const m = diagBefore.get(k)?.n ?? 0;
    if (d.n > m) report.newDiagnostics.push(`${d.where} ${k.split(' ').pop()} ${d.msg}${d.n - m > 1 ? `（${d.n - m} 处）` : ''}`);
  }
  report.ok = !report.mismatches.length && !report.newDiagnostics.length;
  log(`核对：${report.identifiersChecked} 处标识符，指向变了的 ${report.mismatches.length} 处，新增诊断 ${report.newDiagnostics.length} 条`);

  if (opt.write && report.ok) {
    for (const [f, text] of ws.changed()) fs.writeFileSync(ws.abs(f), text);
    report.written = true;
    if (opt.tsc) {
      log('跑 tsc --noEmit');
      const r = spawnSync('nice', ['-n', '10', process.execPath, 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
      const out = (r.stdout ?? '') + (r.stderr ?? '');
      report.tsc = { exitCode: r.status, errors: (out.match(/error TS\d+/g) ?? []).length, output: out.slice(0, 20000) };
      if (r.status !== 0) report.ok = false;
    }
  }
  report.seconds = Math.round((performance.now() - t0) / 100) / 10;
  return report;
};

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

type Snap = { ids: Map<number, Set<string>>; names: Map<number, string> };

/** 每个标识符出现处（按改名前的位置）指向的声明集合；声明记成「文件:改名前的位置」 */
const snapshot = (ws: Workspace, files: string[], back: Map<string, (pos: number) => number>): Map<string, Snap> => {
  const out = new Map<string, Snap>();
  const toBefore = (f: string, p: number) => back.get(f)?.(p) ?? p;
  for (const f of files) {
    const sf = ws.sourceFile(f);
    const checker = ws.program(f).getTypeChecker();
    const ident = (s: ts.Symbol | undefined): string[] => {
      if (!s) return ['（解不到）'];
      const roots = s.flags & ts.SymbolFlags.Transient ? checker.getRootSymbols(s) : [s];
      const r: string[] = [];
      for (const x of roots) {
        const ds = x.declarations ?? [];
        if (!ds.length) r.push(`内置:${x.name}`);
        for (const d of ds) {
          const dsf = d.getSourceFile();
          const df = ws.rel(dsf.fileName);
          const nm = ts.getNameOfDeclaration(d) ?? d;
          r.push(df.startsWith('..') || df.includes('node_modules/') ? `外部:${df.split('node_modules/').pop()}:${nm.getStart(dsf)}` : `${df}:${toBefore(df, nm.getStart(dsf))}`);
        }
      }
      return r;
    };
    const snap: Snap = { ids: new Map(), names: new Map() };
    walk(sf, (n) => {
      if (!ts.isIdentifier(n) && !ts.isPrivateIdentifier(n)) return;
      const pos = toBefore(f, n.getStart(sf));
      const set = snap.ids.get(pos) ?? new Set<string>();
      for (const x of ident(checker.getSymbolAtLocation(n))) set.add(x);
      const p = n.parent;
      if (ts.isShorthandPropertyAssignment(p) && p.name === n) for (const x of ident(checker.getShorthandAssignmentValueSymbol(p))) set.add(x);
      if (ts.isBindingElement(p) && p.name === n && !p.propertyName && ts.isObjectBindingPattern(p.parent)) {
        const t = checker.getTypeAtLocation(p.parent);
        const prop = checker.getPropertyOfType(checker.getApparentType(t), n.text);
        if (prop) for (const x of ident(prop)) set.add(x);
      }
      // 解构改名 { 属性: 值 } 的属性名：改前是简写的那一处会带上属性，改后也要带上
      if (ts.isBindingElement(p) && p.propertyName === n && ts.isObjectBindingPattern(p.parent)) {
        const t = checker.getTypeAtLocation(p.parent);
        const prop = checker.getPropertyOfType(checker.getApparentType(t), n.text);
        set.delete('（解不到）');
        if (prop) for (const x of ident(prop)) set.add(x);
      }
      snap.ids.set(pos, set);
      const prev = snap.names.get(pos);
      snap.names.set(pos, prev ? `${prev} ${n.text}` : n.text);
    });
    out.set(f, snap);
  }
  return out;
};

/** 这些文件的语法、语义诊断，按「文件:改名前位置 错误码」计数（改名会改消息里的名字，不按消息认） */
const diagnostics = (ws: Workspace, files: string[], back: Map<string, (pos: number) => number>): Map<string, { n: number; msg: string; where: string }> => {
  const out = new Map<string, { n: number; msg: string; where: string }>();
  for (const f of files) {
    const p = ws.program(f);
    const sf = ws.sourceFile(f);
    for (const d of [...p.getSyntacticDiagnostics(sf), ...p.getSemanticDiagnostics(sf)]) {
      const pos = back.get(f)?.(d.start ?? 0) ?? d.start ?? 0;
      const k = `${f}:${pos} TS${d.code}`;
      const e = out.get(k);
      if (e) e.n++;
      else
        out.set(k, {
          n: 1,
          msg: ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160),
          where: `${f}:${sf.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}`,
        });
    }
  }
  return out;
};
