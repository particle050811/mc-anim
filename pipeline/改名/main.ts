// 中文标识符改英文的工具入口（迁移做完整个目录删掉）。Python 那半边是 py改名.py。用法（详见 --help）：
//   node pipeline/改名/main.ts disk-keys --out <文件.tsv> [--data <数据根>]
//   node pipeline/改名/main.ts scan --out <目录> [--only <路径前缀>…] [--disk-keys <文件.tsv>]
//   node pipeline/改名/main.ts apply --scan <目录> --table <表.tsv> [--write] [--allow-json] [--tsc]
//   node pipeline/改名/main.ts check --groups <groups.jsonl>… [--batch-dir <目录>] [--out <tsv>] <批NN-页N.tsv>…
// 重的进程照 CLAUDE.md 加 nice（主检出可能在渲染）。
import fs from 'node:fs';
import path from 'node:path';
import { Workspace } from './工程.ts';
import { scan, type ScanResult } from './扫.ts';
import { diskKeys } from './盘上键.ts';
import { apply, readTable } from './改.ts';
import { checkTables, issuesTsv, loadInputs, summary } from './核表.ts';

const HELP = `用法：
  disk-keys --out <tsv> [--data <数据根>]      收盘上数据（进 Git 的 toml/json、数据根抽样）里含汉字的键
  scan --out <目录> [--only <前缀>…] [--ls] [--disk-keys <tsv>] [--text-files <正则>…] [--root <仓库根>]
       --only 只输出声明在这些前缀下的组；--ls 每组调语言服务 findRenameLocations（准但全仓要几小时，拿来对照）
       扫全仓含汉字的标识符，按必须同名的组输出 groups.jsonl（给人看）、scan.json（给 apply 用）、stats.json
  apply --scan <目录> --table <tsv> [--write] [--allow-json] [--tsc] [--report <json>]
       按表改名：表每行「组 id<TAB>新名[<TAB>strings]」，# 开头是注释；组 id 写组里任何一个声明的 id 都行（groups.jsonl 的 id、aliases）；
       strings = all（组的字符串引用全改）或逗号分隔的 文件:偏移（只改这几处，偏移取 scan.json 的 strings）；
       先在内存里改、改前改后逐个标识符核对指向的声明，过了才写盘（--write）；--tsc 写完跑 tsc --noEmit
  check --groups <groups.jsonl>… [--batch-dir <目录>] [--glossary <tsv>] [--rules <tsv>] [--out <tsv>] <批NN-页N.tsv>…
       核拼名模型交回的表（行号<TAB>新名<TAB>拿不准原因）：缺行、格式、非法名、关键字、全局名、撞名、黑名单形状、对照表、一词多译；
       --groups 可给多个（TS、Python 各一份）；--batch-dir 默认是输出表上一层（放 批NN.ids.tsv、对照表.tsv、规则.tsv 的目录）；
       问题写 --out（默认 <batch-dir>/核表问题.tsv），打一行汇总；有「错」退出码 1`;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const opts = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const flag = (name: string) => args.includes(name);
const root = path.resolve(opt('--root') ?? path.join(import.meta.dirname, '..', '..'));
const log = (s: string) => process.stderr.write(s + '\n');

if (!cmd || flag('--help') || flag('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (cmd === 'disk-keys') {
  const out = opt('--out');
  if (!out) throw new Error('要 --out');
  const data = opt('--data') ?? process.env.ANIM_DATA;
  const r = diskKeys(root, data);
  fs.writeFileSync(out, r.keys.map((k) => `${k.key}\t${k.count}\t${k.sample}`).join('\n') + '\n');
  log(`读了 ${r.files} 个文件，含汉字的键 ${r.keys.length} 个 → ${out}`);
} else if (cmd === 'scan') {
  const out = opt('--out');
  if (!out) throw new Error('要 --out');
  fs.mkdirSync(out, { recursive: true });
  const dk = opt('--disk-keys');
  const keys = dk ? new Set(fs.readFileSync(dk, 'utf8').split('\n').map((l) => l.split('\t')[0]!).filter(Boolean)) : undefined;
  const t0 = performance.now();
  const ws = new Workspace(root);
  log(`开工程：${ws.files.length} 个代码文件，${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
  const only = opts('--only');
  const textFiles = opts('--text-files').map((x) => new RegExp(x));
  const r = scan(ws, { only: only.length ? only : undefined, diskKeys: keys, textFiles, useLs: flag('--ls'), log });
  r.stats.secondsWithLoad = Math.round((performance.now() - t0) / 100) / 10;
  // 机器忙（主检出在渲染）时墙钟时间不准，另记本进程用掉的 CPU 秒
  const cpu = process.cpuUsage();
  r.stats.cpuSeconds = Math.round((cpu.user + cpu.system) / 1e5) / 10;
  const stream = fs.createWriteStream(path.join(out, 'groups.jsonl'));
  for (const g of r.groups) {
    const { locs, ...rest } = g;
    void locs;
    stream.write(JSON.stringify(rest) + '\n');
  }
  stream.end();
  fs.writeFileSync(path.join(out, 'scan.json'), JSON.stringify(r satisfies ScanResult));
  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify(r.stats, null, 2) + '\n');
  console.log(JSON.stringify(r.stats, null, 2));
} else if (cmd === 'apply') {
  const scanDir = opt('--scan');
  const tablePath = opt('--table');
  if (!scanDir || !tablePath) throw new Error('要 --scan 和 --table');
  const r = JSON.parse(fs.readFileSync(path.join(scanDir, 'scan.json'), 'utf8')) as ScanResult;
  const table = readTable(fs.readFileSync(tablePath, 'utf8'));
  const report = apply(root, r, table, { write: flag('--write'), allowJson: flag('--allow-json'), tsc: flag('--tsc'), log });
  const rp = opt('--report') ?? path.join(scanDir, 'apply-report.json');
  fs.writeFileSync(rp, JSON.stringify(report, null, 2) + '\n');
  log(`报告 → ${rp}`);
  process.exitCode = report.ok ? 0 : 1;
} else if (cmd === 'check') {
  const valued = new Set(['--groups', '--batch-dir', '--glossary', '--rules', '--out']);
  const outputs = args.slice(1).filter((a, i) => !a.startsWith('--') && !valued.has(args[i]!));
  const groups = opts('--groups');
  if (!outputs.length || !groups.length) throw new Error('要 --groups 和至少一个输出表');
  const batchDir = opt('--batch-dir') ?? path.dirname(path.dirname(path.resolve(outputs[0]!)));
  const inp = loadInputs({ outputs, groups, batchDir, glossary: opt('--glossary'), rules: opt('--rules') });
  const { rows, issues } = checkTables(inp);
  const out = opt('--out') ?? path.join(batchDir, '核表问题.tsv');
  fs.writeFileSync(out, issuesTsv(issues));
  console.log(`${summary(rows, issues)} → ${out}`);
  process.exitCode = issues.some((i) => i.level === '错') ? 1 : 0;
} else {
  console.error(`没有命令 ${cmd}\n${HELP}`);
  process.exitCode = 2;
}
