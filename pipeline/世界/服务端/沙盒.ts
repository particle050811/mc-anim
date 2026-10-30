// 沙盒：把服务端程序和一个世界克隆到 <数据根>/run/沙盒/<UTC 月日-时分>-<世界>/ 再开服，原存档、原服务端目录一个字节都不动。
// 试预生成、试编辑重放、试新数据包用。Mac（APFS）上用 cp -c 克隆，不占第二份空间；别的系统是普通拷贝，大世界会慢。
// 服务端目录里的世界（带 level.dat 的子目录）、日志、崩溃报告不拷。
import fs from 'node:fs';
import path from 'node:path';
import { 数据路径, isMac } from '../../环境/配置.ts';
import { 跑出 } from '../../环境/子进程.ts';
import { utc月日时分 } from '../../运行记录/记录.ts';

const 不拷 = new Set(['logs', 'crash-reports', 'debug', '.anim-服务端.pid', '.anim-临时模组.json']);

const 克隆 = (源: string, 到: string) => {
  if (isMac) 跑出(['cp', '-cR', 源, 到]);
  else fs.cpSync(源, 到, { recursive: true, preserveTimestamps: true });
};

export type 沙盒 = { 根: string; 服务端: string; 存档: string };

export const 建沙盒 = (服务端目录: string, 存档: string, 名: string, 根 = 数据路径('run', '沙盒')): 沙盒 => {
  const dir = path.join(根, `${utc月日时分(Date.now())}-${名}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了（同一分钟建了两次？）`);
  const 服 = path.join(dir, '服务端');
  fs.mkdirSync(服, { recursive: true });
  for (const e of fs.readdirSync(服务端目录, { withFileTypes: true })) {
    if (不拷.has(e.name)) continue;
    const f = path.join(服务端目录, e.name);
    if (e.isDirectory() && fs.existsSync(path.join(f, 'level.dat'))) continue;
    克隆(f, path.join(服, e.name));
  }
  const 世 = path.join(dir, path.basename(存档));
  克隆(存档, 世);
  fs.rmSync(path.join(世, 'session.lock'), { force: true });
  return { 根: dir, 服务端: 服, 存档: 世 };
};
