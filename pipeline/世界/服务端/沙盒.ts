// 沙盒：把服务端程序和一个世界克隆到 <数据根>/run/沙盒/<UTC 月日-时分>-<世界>/ 再开服，原存档、原服务端目录一个字节都不动。
// 试预生成、试编辑重放、试新数据包用。Mac（APFS）上用 cp -c 克隆，不占第二份空间；别的系统是普通拷贝，大世界会慢。
// 服务端目录里的世界（带 level.dat 的子目录）、日志、崩溃报告不拷。
import fs from 'node:fs';
import path from 'node:path';
import { dataPath, isMac } from '../../环境/配置.ts';
import { runCapture } from '../../环境/子进程.ts';
import { utcMonthDayTime } from '../../运行记录/记录.ts';

const NO_COPY = new Set(['logs', 'crash-reports', 'debug', '.anim-服务端.pid', '.anim-临时模组.json']);

const cloneTree = (sourcePath: string, destPath: string) => {
  if (isMac) runCapture(['cp', '-cR', sourcePath, destPath]);
  else fs.cpSync(sourcePath, destPath, { recursive: true, preserveTimestamps: true });
};

export type Sandbox = { 根: string; 服务端: string; 存档: string };

const newSandboxDir = (displayName: string, root: string) => {
  const dir = path.join(root, `${utcMonthDayTime(Date.now())}-${displayName}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了（同一分钟建了两次？）`);
  return dir;
};

/** 服务端程序和配置克隆到 到（不带里面的世界、日志） */
const cloneServer = (serverDir: string, destPath: string) => {
  fs.mkdirSync(destPath, { recursive: true });
  for (const e of fs.readdirSync(serverDir, { withFileTypes: true })) {
    if (NO_COPY.has(e.name)) continue;
    const f = path.join(serverDir, e.name);
    if (e.isDirectory() && fs.existsSync(path.join(f, 'level.dat'))) continue;
    cloneTree(f, path.join(destPath, e.name));
  }
};

/** 建新世界用的沙盒：只克隆服务端，存档路径给出来但还不存在（anim world new --sandbox 在里面建） */
export const makeNewWorldSandbox = (serverDir: string, saveName: string, displayName: string, root = dataPath('run', '沙盒')): Sandbox => {
  const dir = newSandboxDir(displayName, root);
  cloneServer(serverDir, path.join(dir, '服务端'));
  return { 根: dir, 服务端: path.join(dir, '服务端'), 存档: path.join(dir, saveName) };
};

export const makeSandbox = (serverDir: string, saveDir: string, displayName: string, root = dataPath('run', '沙盒')): Sandbox => {
  const dir = newSandboxDir(displayName, root);
  const server = path.join(dir, '服务端');
  cloneServer(serverDir, server);
  const world = path.join(dir, path.basename(saveDir));
  cloneTree(saveDir, world);
  fs.rmSync(path.join(world, 'session.lock'), { force: true });
  return { 根: dir, 服务端: server, 存档: world };
};
