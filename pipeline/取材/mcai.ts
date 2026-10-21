// sr mcai：把动作转给 sourcing/mcai/mcai.py。mcai 只读 MCAI_* 环境变量，这里按 sr 配置传；
// 开游戏、编译前过放行闸，开游戏还要等渲染锁空出来（渲染和游戏抢同一块 GPU 和内存，用户 10-04 定的资源闸规矩）。
import path from 'node:path';
import fs from 'node:fs';
import { 配置, 数据路径 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 持有者, 持有者主机, 锁文件, 进程在吗 } from '../闸/锁.ts';

export const mcai脚本 = () => path.join(代码根(), 'sourcing', 'mcai', 'mcai.py');
export const mcai命令 = () => [配置('python'), mcai脚本()];

export const mcai环境 = (): NodeJS.ProcessEnv => ({
  ...process.env,
  MCAI_GAME: 配置('游戏'),
  MCAI_MOD_DIR: path.join(代码根(), 'sourcing', 'mod'),
  MCAI_TIME_LOG: 数据路径('run', 'logs', 'mcai耗时.tsv'),
  // 两个 Minecraft 客户端不同时开（项目规矩）：mcai 看到别的实例的游戏开着就不起
  MCAI_ONE_CLIENT: '1',
  ...(配置('java_home') ? { MCAI_JAVA_HOME: 配置('java_home') } : {}),
  ...(配置('prism') ? { MCAI_PRISM: 配置('prism') } : {}),
});

/** 哪些动作是重任务、要过闸：起游戏、编译 mod */
export const 要过闸 = (args: readonly string[]) => (args[0] === 'game' && args[1] === 'start') || args[0] === 'build';

/** 渲染锁现在被活着的进程拿着：返回 pid（别的机器上的当活着），没有返回 null */
export const 渲染中 = (锁目录 = 配置('锁目录'), 本机 = 配置('主机')): number | null => {
  const file = 锁文件(锁目录, '渲染');
  if (!fs.existsSync(file)) return null;
  const pid = 持有者(file);
  if (pid === null) return -1; // 刚建、还没写 pid
  const 主机 = 持有者主机(file, pid);
  if (主机 && 主机 !== 本机) return pid;
  return 进程在吗(pid) ? pid : null;
};
