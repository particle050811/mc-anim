// anim 的全部命令：各模块的命令表拼成一张（全部命令.ts 拿它分发，旧名.test.ts 拿它核对旧名表）。
// 第一个 import 注册 @engine/、@库/ 的解析钩子（见 环境/别名钩子.ts），之后 import() 进来的作品文件才认得这两个前缀。
import '../环境/别名注册.ts';
import {batchCommands} from '../渲/批.ts';
import {schedulerCommands} from '../闸/命令.ts';
import type { Command } from './命令.ts';
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

export const commandTable: Record<string, Command> = { ...batchCommands, ...schedulerCommands, ...envCommands, ...worktreeCommands, ...assetCommands, ...renderCommands, ...fingerprintCommands, ...composeCommands, ...previewCommands, ...checkCommands, ...verifyCommands, ...sourcingCommands, ...gameExportCommands, ...worldCommand, ...platformCommands, ...voiceCommands, ...cacheCommands, ...segFrameCommands };
