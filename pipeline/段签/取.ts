// 取段签：verify、accept、认指纹 要段签时用。切片（mp4）和 wav 都在就看它们：段签是这一对派生的直接用，缺了或对不上当场从它们派生（派生 '补'）；
// 切片不在的，有齐全的段签就用（同一指纹的另一次渲染，字节对不上也只能用它），没有返回 null。
// 派生要解码切片，调用方传「等放行」（懒放行闸），真要派生时才过闸、一条命令只过一次。
import fs from 'node:fs';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 同一版, type 签名 } from '../验收/认可.ts';
import { 派生段签, 对得上切片, 读段签, 段签齐, type 段签, type 自查 } from './段签.ts';

export const 漂移提示 = (键: string, 查: 自查) => `重渲漂移：${键} 同一指纹重渲出来和上次派生的段签不一样（${查.说明}），对这段跑 anim verify ${键}`;

/**
 * verify 碰上指纹和认可版一样的段：只读 签.json、stat 切片（不解码、不过闸），看同一指纹是不是重渲过。
 * 段签的签名和认可记录不一样，或切片大小改于和段签记的不一样（重渲了、段签还没跟上），返回原因，要真比一次；没有段签、都一样返回 null
 */
export const 同指纹重渲过 = (签: 段签 | null, 认可: 签名, 画面: string): string | null => {
  if (!段签齐(签)) return null;
  if (fs.existsSync(画面)) {
    const st = fs.statSync(画面);
    if (st.size !== 签.母版.大小 || st.mtimeMs !== 签.母版.改于) return '切片和段签记的不是同一份';
  }
  return 同一版(签.签名, 认可) ? null : '段签的签名和认可记录不一样';
};

type 一段切片 = Parameters<typeof 派生段签>[0];

/** 这一段切片的段签（见文件头） */
export const 取段签 = async (r: 一段切片, opts: { 等放行: () => Promise<void>; 记录?: 运行记录 }): Promise<段签 | null> => {
  const 签 = 读段签(r.段.键, r.画面指纹.指纹);
  if (!fs.existsSync(r.画面) || !fs.existsSync(r.声音)) return 段签齐(签) ? 签 : null;
  if (段签齐(签) && (await 对得上切片(签, r.画面, r.声音))) return 签;
  await opts.等放行();
  console.log(`== 补段签 ${r.段.键}（${r.画面指纹.指纹.slice(0, 16)}）`);
  const x = await 派生段签(r, { 派生: '补' });
  if (x.自查?.结论 === '漂移') opts.记录?.记('警告', 漂移提示(r.段.键, x.自查));
  return x.签;
};
