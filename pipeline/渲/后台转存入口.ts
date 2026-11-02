// 后台转存的子进程入口（后台转存.ts 起它，不要手跑）。IPC 发回警告和最后的结果、资源读数；日志直接继承父进程的 stdout、stderr。
// 父进程没了（信号、SIGKILL 都一样）靠 IPC 断开发现，跟着收尾退出（杀 ffmpeg、清临时文件、放占用），不留孤儿。
import { 指定作品 } from '../环境/作品.ts';
import { 收尾, 信号码 } from '../闸/收尾.ts';
import type { 阶段记录 } from '../运行记录/阶段.ts';
import { 建CPU账 } from '../运行记录/渲染明细.ts';
import { 一分钟负载, 读内存, 读压力 } from '../环境/资源.ts';
import { 后处理一段, type 后处理参数, type 后处理结果 } from './后处理.ts';

export type 后台消息 =
  | { 类: '警告'; 文本: string }
  | { 类: '完'; 阶段: 阶段记录[]; 结果: 后处理结果; 资源: 后台资源 };

/** 这段后台花了多少 CPU（估算，见 建CPU账）、收工时机器的读数；父进程在出帧，不在那边读 */
export type 后台资源 = { CPU秒: number | null; 机: { 闸: number | null; 压力: number | null; 负载: number | null } };

const 发 = (m: 后台消息, 完?: () => void) => void process.send?.(m, undefined, undefined, () => 完?.());

const p = JSON.parse(process.argv[2]!) as 后处理参数;
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
const 账 = 建CPU账();
const 结果 = await 后处理一段(p, { 收, 记录 });
const 资源: 后台资源 = { CPU秒: await 账.止(), 机: { 闸: 读内存()?.空闲百分比 ?? null, 压力: 读压力(), 负载: 一分钟负载() } };
process.removeAllListeners('disconnect');
发({ 类: '完', 阶段: 收, 结果, 资源 }, () => process.exit(0));
