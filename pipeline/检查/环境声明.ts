// anim check「加载」里查 <环境> 的声明：段/、场/、核对/ 目录下的 环境.ts（docs/架构.md「光照环境」）。
// 模块本身由 加载 执行（定义环境、定义环境轨 写错了加载时就抛）；这里再查执行不出来的：
// - export default 是一份环境描述或环境轨，用 engine/light/环境.ts 的 定义环境、定义环境轨 再核一遍（直接写字面量、没套 定义… 的也查到）；
// - 画法有模块：engine/light/画法/<名>.tsx 或 库/画法/<名>.tsx，里面 定义画法('<名>', …)；
// - 关键帧落在段里：帧 < 段.ts 的帧数（场目录的按场内帧取，帧数不在一处，不查）。
import type { 段项 } from './内容.ts';
import { 是环境声明, type 报告, type 检查上下文 } from './上下文.ts';

const 环境模块 = 'engine/light/环境.ts';
export const 画法目录 = ['engine/light/画法', '库/画法'] as const;

type 环境函数 = {
  定义环境: (e: unknown, 名?: string) => unknown;
  定义环境轨: (轨: unknown, 名?: string) => unknown;
  是环境轨: (x: unknown) => boolean;
};

/** 画法名 → 模块文件；没有、或文件里没 定义画法('<名>' 的报出来 */
export const 找画法 = (c: 检查上下文, 名: string): { 文件: string } | { 错误: string } => {
  for (const 目录 of 画法目录) {
    const 文件 = `${目录}/${名}.tsx`;
    if (!c.存在(文件)) continue;
    const 文本 = c.读(文件);
    if (!new RegExp(`定义画法\\(\\s*['"]${名.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(文本)) return { 错误: `${文件} 里没有 定义画法('${名}', …)（画法名要和文件名一样）` };
    return { 文件 };
  }
  return { 错误: `没有画法「${名}」：要有 ${画法目录.map((d) => `${d}/${名}.tsx`).join(' 或 ')}` };
};

export const 查环境声明 = async (c: 检查上下文, 报: 报告, 段们: readonly 段项[]) => {
  const 文件们 = c.本作品文件().filter(是环境声明);
  if (!文件们.length) return;
  const 引擎 = c.存在(环境模块) ? await c.加载(环境模块) : { 错误: `没有 ${环境模块}` };
  if (!引擎.模块) return 报.错(`查环境声明要执行 ${环境模块}：${引擎.错误}`);
  const f = 引擎.模块 as unknown as 环境函数;
  let 好 = 0;
  for (const p of 文件们) {
    const r = await c.加载(p);
    if (!r.模块) continue; // 执行出错 加载 已报
    const v = r.模块.default as Record<string, unknown> | undefined;
    if (!v || typeof v !== 'object') {
      报.错('环境.ts 要 export default 一份环境描述（定义环境）或环境轨（定义环境轨）', p);
      continue;
    }
    const 轨 = f.是环境轨(v);
    try {
      if (轨) f.定义环境轨(v, p);
      else f.定义环境(v, p);
    } catch (e) {
      报.错(e instanceof Error ? e.message : String(e), p);
      continue;
    }
    const 基础 = (轨 ? v.基础 : v) as { 画法: string };
    const 画法 = 找画法(c, 基础.画法);
    if ('错误' in 画法) {
      报.错(画法.错误, p);
      continue;
    }
    if (轨) {
      const 目录 = p.slice(0, -'/环境.ts'.length);
      const 段 = 段们.find((s) => s.目录 === 目录);
      const 帧数 = 段?.定义?.帧数;
      const 越界 = 帧数 === undefined ? [] : (v.关键帧 as { 帧: number }[]).filter((k) => k.帧 >= 帧数);
      if (越界.length) {
        报.错(`关键帧 ${越界.map((k) => k.帧).join('、')} 不在段里（段.ts 帧数 ${帧数}）`, p);
        continue;
      }
    }
    好++;
  }
  报.信息.push(`查了 ${文件们.length} 份环境声明，${好} 份合法`);
};
