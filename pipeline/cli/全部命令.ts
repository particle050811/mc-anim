// anim 的入口（anim / anim.cmd 转到这里，Node 24 直接跑 TS）：拼命令表交给 路由.ts 分发，每条命令结束写运行记录、追加耗时。
// 第一个 import 注册 @engine/、@库/ 的解析钩子（见 环境/别名钩子.ts），之后 import() 进来的作品文件才认得这两个前缀。
import '../环境/别名注册.ts';
import {batchCommands} from '../渲/批.ts';
import {schedulerCommands} from '../闸/命令.ts';
import type { Command } from './命令.ts';
import { runCommandLine } from './路由.ts';
import { envCommands } from '../环境/命令.ts';
import { worktreeCommands } from '../环境/开worktree.ts';
import { assetCommands } from '../资产/命令.ts';
import { renderCommands } from '../渲/命令.ts';
import { fingerprintCommands } from '../指纹/命令.ts';
import { composeCommands } from '../合成/命令.ts';
import { previewCommands } from '../预览/命令.ts';
import { checkCommands } from '../检查/命令.ts';
import { verifyCommands } from '../验收/命令.ts';
import { sourcingCommands } from '../取材/命令.ts';
import { gameExportCommands } from '../取材/游戏导表/命令.ts';
import { platformCommands } from '../适配器/平台/命令.ts';
import { worldCommand } from '../世界/命令.ts';
import { voiceCommands } from '../配音/命令.ts';
import { cacheCommands } from '../缓存/命令.ts';
import { segFrameCommands } from '../段框架/命令.ts';

const commandTable: Record<string, Command> = { ...batchCommands, ...schedulerCommands, ...envCommands, ...worktreeCommands, ...assetCommands, ...renderCommands, ...fingerprintCommands, ...composeCommands, ...previewCommands, ...checkCommands, ...verifyCommands, ...sourcingCommands, ...gameExportCommands, ...worldCommand, ...platformCommands, ...voiceCommands, ...cacheCommands, ...segFrameCommands };

process.exitCode = await runCommandLine(process.argv.slice(2), { commandTable, env: process.env });
