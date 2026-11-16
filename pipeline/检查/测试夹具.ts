// anim check 测试用的小仓库：在临时目录里按 { 相对路径: 内容 } 写文件。违规样例和合规样例都在测试里现造，不进 作品/。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codeRoot } from '../环境/路径.ts';
import { CheckReport, CheckContext, type RuleKind } from '../源码/上下文.ts';
import { ruleTable } from './检查.ts';

export type FileTable = Record<string, string | Buffer | null>;

/** 一个合规的最小仓库：一段 7-甲（场 7-场一）、一件公开资产、一条规矩、空台词表 */
export const base = (): FileTable => ({
  'engine/段/段定义.ts': fs.readFileSync(path.join(codeRoot(), 'engine', '段', '段定义.ts'), 'utf8'),
  'engine/段/按时取值.ts': fs.readFileSync(path.join(codeRoot(), 'engine', '段', '按时取值.ts'), 'utf8'),
  '作品/应力转动/清单.ts': [
    "export const manifest = [{ key: '7-甲', 章: 7 }];",
    "export const segDir = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice(3)}` : `段/${键}`);",
  ].join('\n'),
  '作品/应力转动/段/7-甲/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场一', sec: 10, width: 4, height: 4, terrain: [] });\n",
  '作品/应力转动/段/7-甲/画面.tsx': "import 图 from 'asset:贴图/甲';\nexport default () => <img src={图} />;\n",
  'engine/core/例外.ts': fs.readFileSync(path.join(codeRoot(), 'engine', 'core', '例外.ts'), 'utf8'),
  '作品/应力转动/旧名.tsv': '类别\t旧名\t新键\t备注\n段号\t7-1-1\t7-甲\t\n段名\t7-老名\t7-甲\t改名\n',
  '作品/应力转动/规矩.toml': [
    '[["rule"]]',
    'id = "打击停顿"',
    '"defaultValue" = 1',
    '"level" = "参考"',
    '"quotes" = []',
    '"appliesTo" = "打中"',
    '"provenance" = ["测试"]',
    '"placement" = ["engine/core/例外.ts exception", "旧:src/lib/anim.ts HIT_STOP_FRAMES"]',
    '"exceptions" = []',
  ].join('\n'),
  '作品/应力转动/台词.toml': '',
  'assets/registry/贴图.toml': ['[["asset"]]', 'id = "贴图/甲"', '"category" = "贴图"', '"source" = "手工:测试"', '"license" = "MIT"', '"visibility" = "公开"'].join('\n'),
  'assets/资产锁.json': JSON.stringify({ '贴图/甲': { sha256: 'a'.repeat(64), suffix: '.png', size: 3, lib: 'store' } }),
  'assets/地形版本.json': JSON.stringify({ pack: {} }),
});

/** 文件表里的 '<目录>/资产锁.json' 是整份锁的简写（后面的层整份顶掉前面的），写进仓库时展开成 <目录>/资产锁/<id>.json 一件一个文件 */
const expandLocks = (files: FileTable): FileTable => {
  const expanded: FileTable = {};
  for (const [p, content] of Object.entries(files)) {
    if (!p.endsWith('资产锁.json') || typeof content !== 'string') {
      expanded[p] = content;
      continue;
    }
    for (const [id, entry] of Object.entries(JSON.parse(content) as Record<string, unknown>)) expanded[`${p.slice(0, -'.json'.length)}/${id}.json`] = JSON.stringify(entry);
  }
  return expanded;
};

export const makeRepo = (...fileLayers: FileTable[]): string => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-检查样例-')));
  const mergedFiles = expandLocks(Object.assign({}, ...fileLayers) as FileTable);
  for (const [p, content] of Object.entries(mergedFiles)) {
    if (content === null) continue;
    const f = path.join(root, ...p.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  return root;
};

/** 在样例仓库上跑一类规则，返回违规文本（带文件前缀，方便 toMatch）和整份报告 */
export const runRule = async (ruleName: RuleKind, root: string, options: { depthCheck?: boolean; release?: boolean; dataRoot?: string; memoryRoot?: string; work?: string } = {}) => {
  const c = new CheckContext(root, options);
  const report = new CheckReport();
  try {
    await ruleTable[ruleName].跑(c, report);
  } finally {
    c.finalize();
    fs.rmSync(root, { recursive: true, force: true });
  }
  return { violations: report.violations.map((q) => `${q.file ?? ''}${q.行 ? `:${q.行}` : ''} ${q.text}`), report };
};
