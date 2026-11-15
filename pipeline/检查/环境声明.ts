// anim check「加载」里查 <环境> 的声明：段/、场/、核对/ 目录下的 环境.ts（docs/架构.md「光照环境」）。
// 模块本身由 加载 执行（定义环境、定义环境轨 写错了加载时就抛）；这里再查执行不出来的：
// - export default 是一份环境描述或环境轨，用 engine/light/环境.ts 的 定义环境、定义环境轨 再核一遍（直接写字面量、没套 定义… 的也查到）；
// - 画法有模块：engine/light/画法/<名>.tsx 或 库/画法/<名>.tsx，里面 defineDraw('<名>', …)；
// - 关键帧落在段里：帧 < 段.ts 的帧数（场目录的按场内帧取，帧数不在一处，不查）。
import type { SegItem } from './内容.ts';
import { isEnvDecl, type CheckReport, type CheckContext } from './上下文.ts';

const envModulePath = 'engine/light/环境.ts';
export const drawMethodDirs = ['engine/light/画法', '库/画法'] as const;

type EnvFunction = {
  defineEnvironment: (e: unknown, displayName?: string) => unknown;
  defineEnvTrack: (envTrack: unknown, displayName?: string) => unknown;
  isEnvTrack: (x: unknown) => boolean;
};

/** 画法名 → 模块文件；没有、或文件里没 defineDraw('<名>' 的报出来 */
export const findDrawMethod = (c: CheckContext, drawName: string): { 文件: string } | { 错误: string } => {
  for (const dir of drawMethodDirs) {
    const file = `${dir}/${drawName}.tsx`;
    if (!c.exists(file)) continue;
    const text = c.读(file);
    if (!new RegExp(`defineDraw\\(\\s*['"]${drawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`).test(text)) return { 错误: `${file} 里没有 defineDraw('${drawName}', …)（画法名要和文件名一样）` };
    return { 文件: file };
  }
  return { 错误: `没有画法「${drawName}」：要有 ${drawMethodDirs.map((d) => `${d}/${drawName}.tsx`).join(' 或 ')}` };
};

export const checkEnvDecl = async (c: CheckContext, report: CheckReport, segments: readonly SegItem[]) => {
  const envDeclFiles = c.workFiles().filter(isEnvDecl);
  if (!envDeclFiles.length) return;
  const loadResult = c.exists(envModulePath) ? await c.loadModule(envModulePath) : { 错误: `没有 ${envModulePath}` };
  if (!loadResult.模块) return report.错(`查环境声明要执行 ${envModulePath}：${loadResult.错误}`);
  const f = loadResult.模块 as unknown as EnvFunction;
  let okCount = 0;
  for (const p of envDeclFiles) {
    const r = await c.loadModule(p);
    if (!r.模块) continue; // 执行出错 加载 已报
    const v = r.模块.default as Record<string, unknown> | undefined;
    if (!v || typeof v !== 'object') {
      report.错('环境.ts 要 export default 一份环境描述（定义环境）或环境轨（定义环境轨）', p);
      continue;
    }
    const envTrack = f.isEnvTrack(v);
    try {
      if (envTrack) f.defineEnvTrack(v, p);
      else f.defineEnvironment(v, p);
    } catch (e) {
      report.错(e instanceof Error ? e.message : String(e), p);
      continue;
    }
    const base = (envTrack ? v.base : v) as { 画法: string };
    const renderer = findDrawMethod(c, base.画法);
    if ('错误' in renderer) {
      report.错(renderer.错误, p);
      continue;
    }
    if (envTrack) {
      const segDir = p.slice(0, -'/环境.ts'.length);
      const seg = segments.find((s) => s.目录 === segDir);
      // 环境轨的关键帧按 24 帧一秒（核对-环境 一个视图 1/24 秒）
      const frameCount = seg?.definition ? Math.round(seg.definition.秒 * 24) : undefined;
      const outOfRange = frameCount === undefined ? [] : (v.keyframes as { 帧: number }[]).filter((k) => k.帧 >= frameCount);
      if (outOfRange.length) {
        report.错(`关键帧 ${outOfRange.map((k) => k.帧).join('、')} 不在段里（段长 ${seg!.definition!.秒} 秒，一秒 24 帧共 ${frameCount} 帧）`, p);
        continue;
      }
    }
    okCount++;
  }
  report.infoLines.push(`查了 ${envDeclFiles.length} 份环境声明，${okCount} 份合法`);
};
