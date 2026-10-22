// anim 的入口（anim / anim.cmd 转到这里，Node 24 直接跑 TS）：按子命令分发，每条命令结束写运行记录、追加耗时。
// 第一个 import 注册 @engine/、@库/ 的解析钩子（见 环境/别名钩子.ts），之后 import() 进来的作品文件才认得这两个前缀。
import '../环境/别名注册.ts';
import { 用法错误 } from './参数.ts';
import { 运行记录 } from '../运行记录/记录.ts';
import type { 命令 } from './命令.ts';
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
import { 取作品参数, 当前作品, 指定作品 } from '../环境/作品.ts';

const 命令表: Record<string, 命令> = { ...环境命令, ...资产命令, ...渲染命令, ...指纹命令, ...合成命令, ...预览命令, ...检查命令, ...验收命令, ...剪映命令, ...取材命令 };

const 帮助 = () => {
  console.log('用法：anim [--作品 <名>] <命令> [参数]\n');
  for (const c of Object.values(命令表)) console.log(`  anim ${c.用法}\n      ${c.说明}`);
};

const main = async (argv: string[]): Promise<number> => {
  // --作品 对所有命令都有效，这里统一取走（选作品的顺序见 环境/作品.ts）
  let 拆: ReturnType<typeof 取作品参数>;
  try {
    拆 = 取作品参数(argv);
    指定作品(拆.作品);
    if (拆.作品) 当前作品();
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const [名, ...args] = 拆.其余;
  if (!名 || 名 === 'help' || 名 === '--help' || 名 === '-h') {
    帮助();
    return 名 ? 0 : 1;
  }
  const c = 命令表[名];
  if (!c) {
    console.error(`没有 ${名} 这个命令`);
    帮助();
    return 1;
  }
  const 记录 = new 运行记录(名, args);
  let code = 1;
  try {
    code = (await c.跑(args, 记录)) ?? 0;
  } catch (e) {
    if (e instanceof 用法错误) {
      console.error(`${e.message}\n用法：anim ${c.用法}`);
      code = 2;
    } else {
      console.error(e instanceof Error ? (e.stack ?? e.message) : e);
      记录.记('错误', e instanceof Error ? e.message : String(e));
      code = 1;
    }
  }
  if (!c.不记录) 记录.结束(code);
  return code;
};

process.exitCode = await main(process.argv.slice(2));
