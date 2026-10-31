// 取段签、补段签：film、verify 要段签时用 取段签（缺了或和母版对不上、母版又在，就当场派生）；anim render --只派生 用 补段签 从现有母版回填。
// 派生要解码母版，调用方传「等放行」（懒放行闸），真要派生时才过闸、一条命令只过一次。
import fs from 'node:fs';
import { 段签目录 } from '../环境/配置.ts';
import { 母版路径 } from '../渲/母版.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 算全部段指纹 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';
import { 出段签, 对得上母版, 读段签, 段签齐, type 段签, type 自查 } from './段签.ts';

export const 漂移提示 = (键: string, 查: 自查) => `重渲漂移：${键} 同一指纹重渲出来和上次派生的段签不一样（${查.说明}），对这段跑 anim verify ${键}`;

/**
 * 这个指纹的段签：齐全且是现在这份母版派生的就直接用；母版不在时有段签就用段签（字节对不上也只能用它）；
 * 缺了、或母版换过字节，母版在就派生（派生 '补'），母版也不在返回 null
 */
export const 取段签 = async (
  段键: string,
  指纹: string,
  级别: string | null,
  opts: { 等放行: () => Promise<void>; 记录?: 运行记录; 母版?: string },
): Promise<段签 | null> => {
  const 母版 = opts.母版 ?? 母版路径(段键, 指纹);
  const 签 = 读段签(段键, 指纹);
  const 有母版 = fs.existsSync(母版);
  if (段签齐(签) && (!有母版 || (await 对得上母版(签, 母版)))) return 签;
  if (!有母版) return null;
  await opts.等放行();
  console.log(`== 补段签 ${段键}（${指纹.slice(0, 16)}）`);
  const r = await 出段签(母版, { 段键, 指纹, 级别, 派生: '补' });
  if (r.自查?.结论 === '漂移') opts.记录?.记('警告', 漂移提示(段键, r.自查));
  return r.签;
};

/** anim render --只派生：这些段在这些级别下当前指纹的母版在、段签缺（或和母版对不上）的，补段签；--重做 全部重新派生 */
export const 补段签 = async (段们: 段信息[], 级别们: readonly 渲染级别[], opts: { 重做?: boolean; 记录: 运行记录; 等放行: () => Promise<void> }) => {
  let 补 = 0;
  let 有 = 0;
  let 缺母版 = 0;
  for (const 级别 of 级别们) {
    const 指纹们 = await 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: 渲染参数(级别) })));
    for (const [i, s] of 段们.entries()) {
      const 指纹 = 指纹们[i]!.指纹;
      const 母版 = 母版路径(s.键, 指纹);
      if (!fs.existsSync(母版)) {
        缺母版++;
        continue;
      }
      const 签 = 读段签(s.键, 指纹);
      if (!opts.重做 && 段签齐(签) && (await 对得上母版(签, 母版))) {
        有++;
        continue;
      }
      await opts.等放行();
      const t0 = Date.now();
      const r = await 出段签(母版, { 段键: s.键, 指纹, 级别, 派生: '回填' });
      补++;
      console.log(`✓ ${s.键}（${级别}，${指纹.slice(0, 16)}）：段签 ${r.签.抽样.帧.length} 帧抽样、${r.签.声音 ? '有' : '没有'}声音，${((Date.now() - t0) / 1000).toFixed(0)} 秒${r.自查 ? `；自查：${r.自查.结论}（${r.自查.说明}）` : ''}`);
      if (r.自查?.结论 === '漂移') opts.记录.记('警告', 漂移提示(s.键, r.自查));
      opts.记录.产物.push(段签目录(s.键, 指纹));
    }
  }
  console.log(`\n补了 ${补} 份段签，${有} 份本来就齐${缺母版 ? `，${缺母版} 段×级别没有当前指纹的母版（没渲过或已删，跳过）` : ''}`);
};
