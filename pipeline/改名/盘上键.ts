// 盘上数据里出现过的含汉字的键：进 Git 的 *.toml、*.json 全收，数据根按目录抽样（每个目录最多几个文件，跳过 store、game）。
// 扫的「盘上字段」标记拿它比：属性名在这张表里，才可能是读写盘的字段。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { HAN } from './工程.ts';

export type DiskKey = { key: string; count: number; sample: string };

const collect = (v: unknown, out: Map<string, DiskKey>, where: string) => {
  if (Array.isArray(v)) for (const x of v) collect(x, out, where);
  else if (v && typeof v === 'object' && !(v instanceof Date)) {
    for (const [k, x] of Object.entries(v)) {
      if (HAN.test(k)) {
        const e = out.get(k);
        if (e) e.count++;
        else out.set(k, { key: k, count: 1, sample: where });
      }
      collect(x, out, where);
    }
  }
};

const readOne = (file: string, label: string, out: Map<string, DiskKey>) => {
  try {
    const t = fs.readFileSync(file, 'utf8');
    collect(file.endsWith('.toml') ? parseToml(t) : JSON.parse(t), out, label);
    return true;
  } catch {
    return false;
  }
};

export const diskKeys = (root: string, dataRoot: string | undefined, perDir = 6, maxBytes = 8 << 20): { keys: DiskKey[]; files: number } => {
  const out = new Map<string, DiskKey>();
  let files = 0;
  const tracked = execFileSync('git', ['-c', 'core.quotepath=off', 'ls-files', '-z', '--', '*.toml', '*.json'], { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const f of tracked) {
    const abs = path.join(root, f);
    if (fs.existsSync(abs) && fs.statSync(abs).size <= maxBytes && readOne(abs, f, out)) files++;
  }
  if (dataRoot && fs.existsSync(dataRoot)) {
    const skip = new Set(['store', 'game', 'node_modules']);
    const visit = (dir: string, depth: number) => {
      let ents: fs.Dirent[];
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      let taken = 0;
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth === 0 && skip.has(e.name)) continue;
          if (depth < 8) visit(p, depth + 1);
        } else if (e.isFile() && /\.(json|toml)$/.test(e.name) && taken < perDir) {
          try {
            if (fs.statSync(p).size > maxBytes) continue;
          } catch {
            continue;
          }
          if (readOne(p, '数据根/' + path.relative(dataRoot, p), out)) {
            taken++;
            files++;
          }
        }
      }
    };
    visit(dataRoot, 0);
  }
  return { keys: [...out.values()].sort((a, b) => b.count - a.count), files };
};
