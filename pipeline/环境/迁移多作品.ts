// 数据根一次性迁移到按作品分的布局（重组方案 d 节）：cache/母版、cache/叠层、交付、基线 下的旧东西挪进 <类>/应力转动/，
// 改写 cache/接缝.json 的键、run/logs/耗时.tsv 的渲染标签、交付 manifest 的母版和叠层路径（改成相对数据根）、剪辑包/清单.json 的来源路径。
// 用法：node pipeline/环境/迁移多作品.ts [--执行]；不加 --执行 只打印要做的事。要先把所有 worktree 合进 main 并删掉（旧代码会往旧位置重渲，缓存从此分叉）。
// 过渲染闸拿锁再动；幂等：目标已有就跳过并报出来。改写前的文件和挪动日志存 迁移/多作品-<UTC>/。跑完删掉 配置.ts 的 按作品 回落和本文件。
import fs from 'node:fs';
import path from 'node:path';
import { 数据路径 } from './配置.ts';
import { 旧布局作品 } from './作品.ts';
import { utc月日时分 } from '../运行记录/记录.ts';
import { 过渲染闸 } from '../闸/闸.ts';

const 执行 = process.argv.includes('--执行');
const 作品 = 旧布局作品;
const 备份目录 = 数据路径('迁移', `多作品-${utc月日时分()}`);
const 日志: string[] = [];
const 记 = (s: string) => {
  日志.push(s);
  console.log(`${执行 ? '' : '（只打印）'}${s}`);
};
const 备份 = (f: string) => {
  if (!执行 || !fs.existsSync(f)) return;
  const 到 = path.join(备份目录, path.relative(数据路径(), f));
  fs.mkdirSync(path.dirname(到), { recursive: true });
  fs.copyFileSync(f, 到);
};
const 写 = (f: string, text: string) => {
  if (fs.readFileSync(f, 'utf8') === text) return;
  记(`改写 ${path.relative(数据路径(), f)}`);
  if (!执行) return;
  备份(f);
  fs.writeFileSync(f, text, 'utf8');
};

/** <类>/<名> → <类>/应力转动/<名>（同卷 rename，不复制）；返回挪了的名字 */
const 挪 = (类: string[]): string[] => {
  const 根 = 数据路径(...类);
  if (!fs.existsSync(根)) return [];
  const 挪了: string[] = [];
  for (const 名 of fs.readdirSync(根)) {
    if (名 === 作品 || 名.startsWith('.')) continue;
    const 从 = path.join(根, 名);
    const 到 = path.join(根, 作品, 名);
    if (fs.existsSync(到)) {
      记(`跳过 ${类.join('/')}/${名}：${类.join('/')}/${作品}/${名} 已经有了`);
      continue;
    }
    记(`挪 ${类.join('/')}/${名} → ${类.join('/')}/${作品}/${名}`);
    if (执行) {
      fs.mkdirSync(path.join(根, 作品), { recursive: true });
      fs.renameSync(从, 到);
    }
    挪了.push(名);
  }
  return 挪了;
};

/** 数据根下的路径（绝对的、或改名前 stress-rotation-data 的绝对路径）→ 相对数据根，并补上作品这一层 */
const 新相对 = (p: string) => {
  let r = p;
  if (path.isAbsolute(p)) {
    const m = /[/\\](?:mc-anim-data|stress-rotation-data)[/\\](.*)$/.exec(p);
    r = m ? m[1]!.split(path.sep).join('/') : path.relative(数据路径(), p).split(path.sep).join('/');
  }
  return r.replace(/^cache\/(母版|叠层)\/(?!应力转动\/)/, `cache/$1/${作品}/`);
};

const 迁移 = async () => {
  // 先改写再挪：改写读的是旧位置的文件
  const 接缝 = 数据路径('cache', '接缝.json');
  if (fs.existsSync(接缝)) {
    const 旧 = JSON.parse(fs.readFileSync(接缝, 'utf8')) as Record<string, string>;
    const 新 = Object.fromEntries(
      Object.entries(旧).map(([k, v]) => [
        k
          .split('|')
          .map((x, i) => (i % 2 === 0 ? 新相对(x) : x))
          .join('|'),
        v,
      ]),
    );
    写(接缝, JSON.stringify(新, null, 1) + '\n');
  }
  const 耗时 = 数据路径('run', 'logs', '耗时.tsv');
  if (fs.existsSync(耗时)) {
    const 行们 = fs.readFileSync(耗时, 'utf8').split('\n');
    写(
      耗时,
      行们
        .map((l) => {
          const c = l.split('\t');
          if (c[1]) c[1] = c[1].replace(/^(render(?:-layer)?):(?![^:]*\/)/, `$1:${作品}/`);
          return c.join('\t');
        })
        .join('\n'),
    );
  }
  const 交付根 = 数据路径('交付');
  const 交付们 = fs.existsSync(交付根) ? fs.readdirSync(交付根).filter((n) => n !== 作品 && fs.existsSync(path.join(交付根, n, 'manifest.json'))) : [];
  for (const 名 of 交付们) {
    const mf = path.join(交付根, 名, 'manifest.json');
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')) as { 作品?: string; 段?: { 母版: string }[]; 叠层?: { 文件: string }[] };
    // 迁移前跑的 anim film 已记 作品 但路径还是旧布局，照样改写（新相对 幂等）
    const 新 = { 作品: m.作品 ?? 作品, ...m, 段: m.段?.map((s) => ({ ...s, 母版: 新相对(s.母版) })), 叠层: m.叠层?.map((l) => ({ ...l, 文件: 新相对(l.文件) })) };
    写(mf, JSON.stringify(新, null, 2) + '\n');
    const 包 = path.join(交付根, 名, '剪辑包', '清单.json');
    if (fs.existsSync(包)) {
      const 旧前缀 = path.join(交付根, 名);
      const 新前缀 = path.join(交付根, 作品, 名);
      const 换 = (x: unknown): unknown =>
        typeof x === 'string'
          ? x === 旧前缀 || x.startsWith(旧前缀 + path.sep)
            ? 新前缀 + x.slice(旧前缀.length)
            : x
          : Array.isArray(x)
            ? x.map(换)
            : x && typeof x === 'object'
              ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, 换(v)]))
              : x;
      const 原 = JSON.parse(fs.readFileSync(包, 'utf8'));
      const 改 = 换(原);
      if (JSON.stringify(改) !== JSON.stringify(原)) 写(包, JSON.stringify(改, null, 1));
    }
  }
  for (const 类 of [['cache', '母版'], ['cache', '叠层'], ['交付'], ['基线']]) 挪(类);
  if (执行 && 日志.length) {
    fs.mkdirSync(备份目录, { recursive: true });
    fs.writeFileSync(path.join(备份目录, '迁移日志.txt'), 日志.join('\n') + '\n', 'utf8');
    console.log(`备份和日志在 ${备份目录}`);
  }
  if (!日志.length) console.log('没有要迁移的（已经是按作品分的布局）');
};

if (执行) await 过渲染闸(迁移);
else await 迁移();
