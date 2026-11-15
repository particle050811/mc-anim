// anim mcai：把动作转给 sourcing/mcai/mcai.py。mcai 只读 MCAI_* 环境变量，这里按 anim 配置传；
// 用户 10-04 定的是控制并发、不吃满内存；阈值和排法是 Agent 的实现。game start 排渲染票后判资源，build 只过放行闸。
import path from 'node:path';
import { config, dataPath } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';

export const mcaiScript = () => path.join(codeRoot(), 'sourcing', 'mcai', 'mcai.py');
export const mcaiCommand = () => [config('python'), mcaiScript()];

export const mcaiEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  MCAI_GAME: config('游戏'),
  MCAI_MOD_DIR: path.join(codeRoot(), 'sourcing', 'mod'),
  MCAI_TIME_LOG: dataPath('run', 'logs', 'mcai耗时.tsv'),
  // 两个 Minecraft 客户端不同时开（项目规矩）：mcai 看到别的实例的游戏开着就不起
  MCAI_ONE_CLIENT: '1',
  ...(config('java_home') ? { MCAI_JAVA_HOME: config('java_home') } : {}),
  ...(config('prism') ? { MCAI_PRISM: config('prism') } : {}),
});

/** 哪些动作是重任务、要过闸：起游戏、编译 mod */
export const needsGate = (args: readonly string[]) => (args[0] === 'game' && args[1] === 'start') || args[0] === 'build';
