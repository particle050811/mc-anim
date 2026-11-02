// 后台转存的子进程入口（后台转存.ts 起它，不要手跑）。IPC 发回警告、等内存和最后的结果；日志直接继承父进程的 stdout、stderr。
// 父进程没了（信号、SIGKILL 都一样）靠 IPC 断开发现，跟着收尾退出（杀 ffmpeg、清临时文件、放占用），不留孤儿。
import os from 'node:os';
import { 指定作品 } from '../环境/作品.ts';
import { 收尾, 信号码 } from '../闸/收尾.ts';
import type { 阶段记录 } from '../运行记录/阶段.ts';
import { 后处理一段, 等内存够, type 后处理参数, type 后处理结果 } from './后处理.ts';

export type 后台消息 =
  | { 类: '警告'; 文本: string }
  | { 类: '等内存'; 事: '起' | '止'; 字段: Record<string, unknown> }
  | { 类: '完'; 阶段: 阶段记录[]; 结果: 后处理结果 };

const 发 = (m: 后台消息, 完?: () => void) => void process.send?.(m, undefined, undefined, () => 完?.());

const p = JSON.parse(process.argv[2]!) as 后处理参数;
// 单独续补时父进程还没降优先级；和旧串行一样跟在 Chrome 后面
try {
  os.setPriority(10);
} catch {
  // 没权限改优先级就照常跑
}
指定作品(p.作品);
process.on('disconnect', () => {
  收尾(信号码.SIGTERM, 'SIGTERM');
  process.exit(信号码.SIGTERM);
});

const 记录 = {
  记: (级别: string, 文本: string) => {
    if (级别 === '信息') console.log(文本);
    else 发({ 类: '警告', 文本 });
  },
};
const 收: 阶段记录[] = [];
const 结果 = await 后处理一段(p, {
  收,
  记录,
  让内存: async () => void (await 等内存够({ 事: (事, 字段) => 发({ 类: '等内存', 事, 字段 }), 超时: (s) => 发({ 类: '警告', 文本: `${p.键}：${s}` }) })),
});
process.removeAllListeners('disconnect');
发({ 类: '完', 阶段: 收, 结果 }, () => process.exit(0));
