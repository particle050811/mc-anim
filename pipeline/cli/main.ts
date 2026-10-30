// anim 的入口（anim / anim.cmd 转到这里，Node 24 直接跑 TS）：拼命令表交给 路由.ts 分发，每条命令结束写运行记录、追加耗时。
// 第一个 import 注册 @engine/、@库/ 的解析钩子（见 环境/别名钩子.ts），之后 import() 进来的作品文件才认得这两个前缀。
import '../环境/别名注册.ts';
import type { 命令 } from './命令.ts';
import { 跑命令行 } from './路由.ts';
import { 环境命令 } from '../环境/命令.ts';
import { 资产命令 } from '../资产/命令.ts';
import { 渲染命令 } from '../渲/命令.ts';
import { 指纹命令 } from '../指纹/命令.ts';
import { 合成命令 } from '../合成/命令.ts';
import { 预览命令 } from '../预览/命令.ts';
import { 检查命令 } from '../检查/命令.ts';
import { 验收命令 } from '../验收/命令.ts';
import { 剪映命令 } from '../适配器/剪映/命令.ts';
import { 取材命令 } from '../取材/命令.ts';
import { 游戏导表命令 } from '../取材/游戏导表/命令.ts';
import { 平台命令 } from '../适配器/平台/命令.ts';
import { 世界命令 } from '../世界/命令.ts';
import { 配音命令 } from '../配音/命令.ts';
import { 缓存命令 } from '../缓存/命令.ts';
import { 段框架命令 } from '../段框架/命令.ts';

const 命令表: Record<string, 命令> = { ...环境命令, ...资产命令, ...渲染命令, ...指纹命令, ...合成命令, ...预览命令, ...检查命令, ...验收命令, ...剪映命令, ...取材命令, ...游戏导表命令, ...世界命令, ...平台命令, ...配音命令, ...缓存命令, ...段框架命令 };

process.exitCode = await 跑命令行(process.argv.slice(2), { 命令表, 环境变量: process.env });
