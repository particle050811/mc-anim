// sr check 测试用的小仓库：在临时目录里按 { 相对路径: 内容 } 写文件。违规样例和合规样例都在测试里现造，不进 content/。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { 代码根 } from '../环境/路径.ts';
import { 报告, 检查上下文, type 规则类 } from './上下文.ts';
import { 规则表 } from './检查.ts';

export type 文件表 = Record<string, string | Buffer | null>;

/** 一个合规的最小仓库：一段 7-甲（场 7-场一）、一件公开资产、一条规矩、空台词表 */
export const 基础 = (): 文件表 => ({
  'content/段定义.ts': fs.readFileSync(path.join(代码根(), 'content', '段定义.ts'), 'utf8'),
  'content/清单.ts': [
    "export const 清单 = [{ 键: '7-甲', 章: 7 }];",
    "export const 段目录 = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice(3)}` : `段/${键}`);",
  ].join('\n'),
  'content/段/7-甲/段.ts': "import { 定义段 } from '../../段定义.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 10, fps: 24, 宽: 4, 高: 4, 地形: [] });\n",
  'content/段/7-甲/画面.tsx': "import 图 from 'asset:贴图/甲';\nexport default () => <img src={图} />;\n",
  'engine/core/例外.ts': fs.readFileSync(path.join(代码根(), 'engine', 'core', '例外.ts'), 'utf8'),
  'docs/旧名.tsv': '类别\t旧名\t新键\t备注\n段号\t7-1-1\t7-甲\t\n段名\t7-老名\t7-甲\t改名\n',
  'rules/规矩.toml': [
    '[["规矩"]]',
    'id = "打击停顿"',
    '"默认值" = 1',
    '"级别" = "参考"',
    '"原话" = []',
    '"针对" = "打中"',
    '"出处" = ["测试"]',
    '"落点" = ["engine/core/例外.ts 例外", "旧:src/lib/anim.ts HIT_STOP_FRAMES"]',
    '"例外" = []',
  ].join('\n'),
  'story/台词.toml': '',
  'assets/registry/贴图.toml': ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "贴图"', '"来源" = "手工:测试"', '"许可" = "MIT"', '"可见性" = "公开"'].join('\n'),
  'assets/资产锁.json': JSON.stringify({ '贴图/甲': { sha256: 'a'.repeat(64), 后缀: '.png', 大小: 3, 库: 'store' } }),
  'assets/地形版本.json': JSON.stringify({ 包: {} }),
});

export const 造仓库 = (...层: 文件表[]): string => {
  const 根 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sr-检查样例-')));
  const 合 = Object.assign({}, ...层) as 文件表;
  for (const [p, 内容] of Object.entries(合)) {
    if (内容 === null) continue;
    const f = path.join(根, ...p.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 内容);
  }
  return 根;
};

/** 在样例仓库上跑一类规则，返回违规文本（带文件前缀，方便 toMatch）和整份报告 */
export const 跑 = async (名: 规则类, 根: string, 选项: { 深?: boolean; 数据根?: string } = {}) => {
  const c = new 检查上下文(根, 选项);
  const 报 = new 报告();
  try {
    await 规则表[名].跑(c, 报);
  } finally {
    c.收尾();
    fs.rmSync(根, { recursive: true, force: true });
  }
  return { 违规: 报.违规.map((q) => `${q.文件 ?? ''}${q.行 ? `:${q.行}` : ''} ${q.文本}`), 报 };
};
