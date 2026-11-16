// 盘上数据改键名的入口（一次性迁移，迁完整个 pipeline/迁移/ 删掉）。用法见 HELP。
import path from 'node:path';
import { migrateTerrain } from './地形新版.ts';
import { runMigration, verifyAll, type Roots } from './盘键.ts';

const HELP = `用法：node pipeline/迁移/main.ts <命令> [--repo <仓库根>] [--data <数据根>] [--only <格式|包>,…] [--dry-run]
  run      进 Git 的和数据根的（不含地形包、store）：算好、核对，全过才写；数据根的先打包到 <数据根>/archive/盘键迁移-<UTC>/
  verify   只读：每种格式解析一遍，报表里的中文键还剩没剩（剩了退出码 1）
  terrain  登记的地形包出新版本（克隆、改键、算指纹、改 assets/地形版本.json）；--only 给包名
  --dry-run 只算不写；--repo 默认本检出，--data 默认 $ANIM_DATA（没设就是仓库旁边的 mc-anim-data）
  跑之前停掉所有 anim 进程（调度、渲染会边跑边写日志和签）`;

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cmd = args[0];
if (!cmd || args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(cmd ? 0 : 2);
}
const repo = path.resolve(opt('--repo') ?? path.join(import.meta.dirname, '..', '..'));
const roots: Roots = { repo, data: path.resolve(opt('--data') ?? process.env.ANIM_DATA ?? path.join(repo, '..', 'mc-anim-data')) };
const only = opt('--only')?.split(',').filter(Boolean);
const dryRun = args.includes('--dry-run');
const log = (s: string) => console.log(s);
log(`仓库 ${roots.repo}\n数据根 ${roots.data}${dryRun ? '\n（只算不写）' : ''}`);

if (cmd === 'run') {
  const r = runMigration({ roots, only, dryRun, log });
  const unlisted = r.summaries.filter((s) => s.unlisted.length);
  for (const s of unlisted) log(`  表外含汉字的键（${s.format}）：${s.unlisted.slice(0, 20).join('、')}${s.unlisted.length > 20 ? ` 等 ${s.unlisted.length} 个` : ''}`);
  log(r.failed ? `有 ${r.failed} 个文件没过核对${dryRun || !r.written ? '，一个都没写' : ''}` : dryRun ? `要改 ${r.plans.length} 个文件` : `写了 ${r.written} 个文件${r.backup ? `，备份在 ${r.backup}` : ''}`);
  process.exit(r.failed ? 1 : 0);
} else if (cmd === 'verify') {
  process.exit(verifyAll({ roots, only, log }) ? 1 : 0);
} else if (cmd === 'terrain') {
  const r = await migrateTerrain({ roots, only, dryRun, log });
  for (const x of r) log(`${x.pack} ${x.from}：${x.skipped ?? (x.to ? `→ ${x.to}` : `要改 ${x.files.map((f) => `${f.rel}（${f.renamed} 处）`).join('、')}`)}`);
} else {
  console.error(`没有这个命令：${cmd}\n${HELP}`);
  process.exit(2);
}
