// 母版（切片）哪些还钉着，和渲段渲完自动删旧（用户 10-30 定：「只是考虑旧的过期的模板都会删掉 就是改动重渲染过了」「这个未来用不到的就删」；不设预算、不按 LRU 删当前指纹）。
// 钉着的：还没自足的交付引用的、还没有认可参考的认可那版（回收.ts 的 加交付、加认可，解钉开着）。gc 也用这一份。
// 渲段（渲/渲段.ts）写好某段某级别的新切片后（命中「已是最新」也算）调 删旧：同段同级别、不是当前画面、声音指纹的媒体文件删掉（.指纹.json、.用过 留着；
// CRF1 时代的 .mkv、.x264.mkv 同样算旧的），跳过 钉理由 非空的（钉着、近 2 小时用过、别的检出用过、正在写）；级别读不出的不动（可能是别的级别的当前指纹）。
// 在渲染闸里跑，别人刚渲好的切片靠 .用过 挡（渲段 先记 .用过 再改名）。
// 只有主检出才删：worktree 里渲的是没合并的改动，「旧」指纹很可能还是 main 的当前指纹（这边算不出），认可记录也是分支上的。worktree 只新增，合并后主检出第一次出这段（命中也算）或 gc 再清。
import fs from 'node:fs';
import { 叠层目录, 数据根, 数据路径, 母版目录, 段签目录, 认可参考文件 } from '../环境/配置.ts';
import { 作品们, 作品名 } from '../环境/作品.ts';
import { 在主检出 } from '../环境/路径.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 抽样键, 读认可 } from '../验收/认可.ts';
import { 保留集, 加交付, 加认可, 大小文本, 扫键目录, 钉理由, type 媒体扫描, type 缓存种 } from './回收.ts';

/** 认可记录文件 → 它在这个平台的认可参考（按记录的抽样哈希起名）；读不出 null */
export const 参考文件查法 = (作品: string) => (file: string, 平台: string) => {
  try {
    const r = 读认可(file);
    return r ? 认可参考文件(r.段, r.指纹, 抽样键(r), 平台, 作品) : null;
  } catch {
    return null;
  }
};

/** 现在钉着的母版、叠层：还没自足的交付、还没有认可参考的认可 */
export const 钉住集 = (警告: (s: string) => void = () => {}): 保留集 => {
  const 保留 = new 保留集();
  const 已知 = 作品们();
  加交付(保留, 数据路径('交付'), 数据根(), 警告, { 解钉: true });
  for (const [作品, 根] of 已知) 加认可(保留, 根, (键) => 母版目录(键, 作品), 警告, { 解钉: true, 参考文件: 参考文件查法(作品) });
  return 保留;
};

export const 扫一键 = (种: 缓存种, 键: string, 作品 = 作品名()): 媒体扫描 => {
  const r: 媒体扫描 = { 媒体: [], 临时: [], 不认识: [] };
  const dir = 种 === '母版' ? 母版目录(键, 作品) : 叠层目录(键, 作品);
  if (fs.existsSync(dir)) 扫键目录(dir, 种, 作品, 键, r, { 段签目录: (k, f) => 段签目录(k, f, 作品) });
  return r;
};

export type 删旧结果 = { 删: string[]; 删大小: number; 留: { 文件: string; 理由: string }[] };

type 旧分法 = { 记录?: Pick<运行记录, '记'>; 作品?: string; 现在?: number };

/** 当前们：这段现在的指纹（切片一段有画面、声音两个） */
const 分旧的 = (种: 缓存种, 键: string, 级别: string, 当前们: readonly string[], o: 旧分法, 警告: (s: string) => void) => {
  const 新 = new Set(当前们.map((x) => x.slice(0, 16)));
  const 旧们 = 扫一键(种, 键, o.作品).媒体.filter((f) => !新.has(f.指纹) && f.级别 === 级别);
  if (!旧们.length) return { 删: [], 留: [] };
  const 保留 = 钉住集(警告);
  const 现在 = o.现在 ?? Date.now();
  const 分 = 旧们.map((f) => ({ f, 理由: 钉理由(f, 保留, 现在) }));
  return { 删: 分.filter((x) => !x.理由.length).map((x) => x.f), 留: 分.filter((x) => x.理由.length) };
};

/** 渲段命中（已是最新）时先问一声：有要删的才过闸，没旧的、旧的都钉着不用等闸。只看不删 */
export const 有要删的旧 = (种: 缓存种, 键: string, 级别: string, 当前们: readonly string[], o: 旧分法 & { 主检出?: boolean } = {}): boolean => {
  if (!(o.主检出 ?? 在主检出())) return false;
  try {
    return 分旧的(种, 键, 级别, 当前们, o, () => {}).删.length > 0;
  } catch {
    return false;
  }
};

/** 渲段写好 键 在 级别 的切片后调：删同段同级别别的指纹（见文件头）。出错只警告，不影响这次渲染 */
export const 删旧 = (种: 缓存种, 键: string, 级别: string, 当前们: readonly string[], o: 旧分法 & { 主检出?: boolean } = {}): 删旧结果 => {
  const r: 删旧结果 = { 删: [], 删大小: 0, 留: [] };
  const 警告 = (s: string) => (o.记录 ? o.记录.记('警告', s) : console.error(`!! ${s}`));
  try {
    const 分 = 分旧的(种, 键, 级别, 当前们, o, 警告);
    if (!(o.主检出 ?? 在主检出())) {
      const 旧们 = [...分.删, ...分.留.map((x) => x.f)];
      if (旧们.length) console.log(`   ${键}：这是 worktree，同级别的旧${种} ${旧们.length} 个不自动删（可能是主检出的当前指纹）；合并后主检出出这段或 anim cache gc 再清`);
      for (const f of 旧们) r.留.push({ 文件: f.路径, 理由: 'worktree 不自动删' });
      return r;
    }
    for (const f of 分.删) {
      fs.rmSync(f.路径, { force: true });
      r.删.push(f.路径);
      r.删大小 += f.大小;
    }
    for (const { f, 理由 } of 分.留) r.留.push({ 文件: f.路径, 理由: [...new Set(理由.map((x) => `${x.类}（${x.说明}）`))].join('、') });
    if (r.删.length) console.log(`   ${键}：删了同级别的旧${种} ${r.删.length} 个，${大小文本(r.删大小)}`);
    for (const x of r.留) console.log(`   ${键}：旧${种} ${x.文件.split(/[\\/]/).pop()} 留着：${x.理由}`);
  } catch (e) {
    警告(`${键} 的旧${种}没删成（${(e as Error).message.split('\n')[0]}），之后 anim cache gc 再清`);
  }
  return r;
};
