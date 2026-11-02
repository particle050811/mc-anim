// 一个指纹的母版占用标记 <指纹前 16 位>.占用（O_EXCL，协议同 闸/锁.ts，持有者死了下一个来的人回收）。
// 后台转存（后处理.ts）和 备好母版、存成压缩、取段签、--只派生 都要动同一份 CRF1 和段签，一次一个；回收.ts 把它算「正在写」，gc、删旧、删已取代 就都绕开这个指纹。
// 为什么用标记不用 CRF1 上的文件锁：别的进程不开 CRF1 也要知道「有人在转」（备好母版要等它转完，不要重转一遍）。
// 锁序只有 渲染闸 → 占用，持有占用的人不再等渲染闸，不会死锁。同一进程不能套着拿（试拿 认不出是自己，会一直等）。
// CRF1 改名（渲.ts）不等占用：改名是原子的，等了就是占着渲染闸空等；靠 删 CRF1 之前核身份（后处理.ts）和 备好母版 的自愈。
import fs from 'node:fs';
import path from 'node:path';
import { 配置, 母版目录 } from '../环境/配置.ts';
import { 登记收尾 } from '../闸/收尾.ts';
import { 放, 试拿, 锁被占 } from '../闸/锁.ts';

const 轮询毫秒 = 1000;
const 睡 = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const 占用文件 = (键: string, 指纹: string, 作品?: string) => path.join(母版目录(键, 作品), `${指纹.slice(0, 16)}.占用`);

/** 有活人占着这个指纹（死人留下的不算） */
export const 被占着 = (键: string, 指纹: string, 作品?: string) => 锁被占(占用文件(键, 指纹, 作品), 配置('主机'));

/** 等别人做完。不拿占用：等完多半已经没事可做，省得进渲染闸 */
export const 等占用放开 = async (键: string, 指纹: string, 作品?: string, 间隔毫秒 = 轮询毫秒) => {
  let 报了 = false;
  while (被占着(键, 指纹, 作品)) {
    if (!报了) console.error(`== ${键}（${指纹.slice(0, 16)}）有别的任务在转存，等它做完`);
    报了 = true;
    await 睡(间隔毫秒);
  }
};

/** 拿到占用再做 fn，做完放；进程被杀时 收尾 放掉。fn 里要自己重查：等的这会儿别人可能已经做完了 */
export const 占着 = async <T>(键: string, 指纹: string, 作品: string | undefined, fn: () => Promise<T>, 间隔毫秒 = 轮询毫秒): Promise<T> => {
  const file = 占用文件(键, 指纹, 作品);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  while (!试拿(file, 配置('主机'))) await 睡(间隔毫秒);
  const 撤 = 登记收尾(() => 放(file));
  try {
    return await fn();
  } finally {
    撤();
    放(file);
  }
};
