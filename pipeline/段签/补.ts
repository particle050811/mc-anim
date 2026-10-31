// 取段签、补段签：film、verify 要段签时用 取段签（缺了或和母版对不上、CRF1 母版又在，就当场派生）；anim render --只派生 用 补段签 从现有 CRF1 母版回填。
// 只从 CRF1 派生：只剩 CRF12 的段，段签缺了就补不了（verify 报要重渲，不拿 CRF12 的像素顶）。
// 派生要解码母版，调用方传「等放行」（懒放行闸），真要派生时才过闸、一条命令只过一次。
import fs from 'node:fs';
import { 段签目录 } from '../环境/配置.ts';
import { 压缩母版路径, 原母版路径 } from '../渲/母版.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 算全部段指纹 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';
import { 同一版, type 签名 } from '../验收/认可.ts';
import { 出段签, 原样子, 对得上母版, 对得上原母版, 读段签, 段签齐, type 段签, type 自查 } from './段签.ts';

export const 漂移提示 = (键: string, 查: 自查) => `重渲漂移：${键} 同一指纹重渲出来和上次派生的段签不一样（${查.说明}），对这段跑 anim verify ${键}`;

/**
 * verify 碰上指纹和认可版一样的段：只读 签.json、stat 母版（不解码、不过闸），看同一指纹是不是重渲过。
 * 段签的签名和认可记录不一样，或母版（给了原母版时连 CRF1）大小改于和段签记的不一样（重渲了、段签还没跟上），返回原因，要真比一次；没有段签、都一样返回 null
 */
export const 同指纹重渲过 = (签: 段签 | null, 认可: 签名, 母版: string, 原母版?: string): string | null => {
  if (!段签齐(签)) return null;
  const 变了 = (文件: string, 样: { 大小: number; 改于: number }) => {
    if (!fs.existsSync(文件)) return false;
    const st = fs.statSync(文件);
    return st.size !== 样.大小 || st.mtimeMs !== 样.改于;
  };
  if (变了(母版, 签.母版) || (原母版 && 变了(原母版, 原样子(签)))) return '母版和段签记的不是同一份';
  return 同一版(签.签名, 认可) ? null : '段签的签名和认可记录不一样';
};

/**
 * 这个指纹的段签：CRF1 在就看它（只有它是段签的来源，同一指纹重渲出新 CRF1 时 CRF12、段签都还是旧的），对得上直接用，缺了或对不上从它派生（派生 '补'）；
 * 只剩 CRF12 的、母版都不在的，有齐全的段签就用（同一指纹的另一次渲染，字节对不上也只能用它），没有返回 null
 */
export const 取段签 = async (段键: string, 指纹: string, 级别: string | null, opts: { 等放行: () => Promise<void>; 记录?: 运行记录 }): Promise<段签 | null> => {
  const 原 = 原母版路径(段键, 指纹);
  const 签 = 读段签(段键, 指纹);
  if (!fs.existsSync(原)) return 段签齐(签) ? 签 : null;
  if (段签齐(签) && (await 对得上原母版(签, 原))) return 签;
  await opts.等放行();
  console.log(`== 补段签 ${段键}（${指纹.slice(0, 16)}）`);
  const r = await 出段签(原, { 段键, 指纹, 级别, 派生: '补' });
  if (r.自查?.结论 === '漂移') opts.记录?.记('警告', 漂移提示(段键, r.自查));
  return r.签;
};

/** anim render --只派生：这些段在这些级别下当前指纹的 CRF1 母版在、段签缺（或和它对不上）的，补段签；--重做 全部重新派生。只剩 CRF12 的补不了，单独报 */
export const 补段签 = async (段们: 段信息[], 级别们: readonly 渲染级别[], opts: { 重做?: boolean; 记录: 运行记录; 等放行: () => Promise<void> }) => {
  let 补 = 0;
  let 有 = 0;
  let 缺母版 = 0;
  const 只剩压缩: string[] = [];
  for (const 级别 of 级别们) {
    const 指纹们 = await 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: 渲染参数(级别) })));
    for (const [i, s] of 段们.entries()) {
      const 指纹 = 指纹们[i]!.指纹;
      const 母版 = 原母版路径(s.键, 指纹);
      const 签 = 读段签(s.键, 指纹);
      if (!fs.existsSync(母版)) {
        if (!fs.existsSync(压缩母版路径(s.键, 指纹))) 缺母版++;
        else if (段签齐(签) && (await 对得上母版(签, 压缩母版路径(s.键, 指纹)))) 有++;
        else 只剩压缩.push(`${s.键}（${级别}）`);
        continue;
      }
      if (!opts.重做 && 段签齐(签) && (await 对得上原母版(签, 母版))) {
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
  if (只剩压缩.length) opts.记录.记('警告', `这些段只剩 CRF12 母版、段签缺或对不上，补不了（段签只从 CRF1 派生），要验收就重渲：${只剩压缩.join('、')}`);
};
