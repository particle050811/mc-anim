// 母版、叠层哪些还钉着，和 render 渲完自动删旧（用户 10-30 定：「只是考虑旧的过期的模板都会删掉 就是改动重渲染过了」「这个未来用不到的就删」；不设预算、不按 LRU 删当前指纹）。
// 钉着的：还没自足的交付引用的、还没有认可参考的认可那版（回收.ts 的 加交付、加认可，解钉开着）。gc 也用这一份。
// render 写好某段某级别的新指纹后调 删旧：同段同级别别的指纹删媒体文件（.指纹.json、.用过 留着），跳过 钉理由 非空的（钉着、近 2 小时用过、正在写）；
// 级别读不出的不动（可能是别的级别的当前指纹）。删之前不用过闸：调用方（render）已经在渲染闸里。
import fs from 'node:fs';
import { 叠层目录, 数据根, 数据路径, 母版目录, 段签目录, 认可参考文件 } from '../环境/配置.ts';
import { 作品们, 作品名 } from '../环境/作品.ts';
import { 读交付设置 } from '../合成/交付.ts';
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

/** 这部作品开没开剪辑包（交付.toml 读不出按开了算：钉得多不会丢东西） */
export const 开剪辑包查法 = (已知 = 作品们()) => (作品: string) => {
  const 根 = 已知.get(作品);
  if (!根) return true;
  try {
    return 读交付设置(根).剪辑包;
  } catch {
    return true;
  }
};

/** 现在钉着的母版、叠层：还没自足的交付、还没有认可参考的认可 */
export const 钉住集 = (警告: (s: string) => void = () => {}): 保留集 => {
  const 保留 = new 保留集();
  const 已知 = 作品们();
  加交付(保留, 数据路径('交付'), 数据根(), 警告, { 解钉: true, 开剪辑包: 开剪辑包查法(已知) });
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

/** render 写好 键 在 级别 的 新指纹 后调：删同段同级别别的指纹（见文件头）。出错只警告，不影响这次渲染 */
export const 删旧 = (种: 缓存种, 键: string, 级别: string, 新指纹: string, o: { 记录?: 运行记录; 作品?: string; 现在?: number } = {}): 删旧结果 => {
  const r: 删旧结果 = { 删: [], 删大小: 0, 留: [] };
  const 警告 = (s: string) => (o.记录 ? o.记录.记('警告', s) : console.error(`!! ${s}`));
  try {
    const 新 = 新指纹.slice(0, 16);
    const 旧们 = 扫一键(种, 键, o.作品).媒体.filter((f) => f.指纹 !== 新 && f.级别 === 级别);
    if (!旧们.length) return r;
    const 保留 = 钉住集(警告);
    const 现在 = o.现在 ?? Date.now();
    for (const f of 旧们) {
      const 理由 = 钉理由(f, 保留, 现在);
      if (理由.length) {
        r.留.push({ 文件: f.路径, 理由: [...new Set(理由.map((x) => `${x.类}（${x.说明}）`))].join('、') });
        continue;
      }
      fs.rmSync(f.路径, { force: true });
      r.删.push(f.路径);
      r.删大小 += f.大小;
    }
    if (r.删.length) console.log(`   ${键}：删了同级别的旧${种} ${r.删.length} 个，${大小文本(r.删大小)}`);
    for (const x of r.留) console.log(`   ${键}：旧${种} ${x.文件.split(/[\\/]/).pop()} 留着：${x.理由}`);
  } catch (e) {
    警告(`${键} 的旧${种}没删成（${(e as Error).message.split('\n')[0]}），之后 anim cache gc 再清`);
  }
  return r;
};

/** 刚转码完（备好母版、一次性迁移之后）：这个指纹已被 CRF12 取代的 CRF1，没有理由留就删。返回删掉的大小 */
export const 删已取代 = (键: string, 指纹: string, o: { 记录?: 运行记录; 作品?: string; 现在?: number } = {}): number => {
  const 警告 = (s: string) => (o.记录 ? o.记录.记('警告', s) : console.error(`!! ${s}`));
  try {
    const 这个 = 扫一键('母版', 键, o.作品).媒体.find((f) => f.指纹 === 指纹.slice(0, 16) && f.已被取代);
    if (!这个) return 0;
    const 理由 = 钉理由(这个, 钉住集(警告), o.现在 ?? Date.now());
    if (理由.length) {
      console.log(`   ${键}：CRF1 留着：${[...new Set(理由.map((x) => `${x.类}（${x.说明}）`))].join('、')}`);
      return 0;
    }
    fs.rmSync(这个.路径, { force: true });
    console.log(`   ${键}：删了已被 CRF12 取代的 CRF1，${大小文本(这个.大小)}`);
    return 这个.大小;
  } catch (e) {
    警告(`${键} 的 CRF1 没删成（${(e as Error).message.split('\n')[0]}），之后 anim cache gc 再清`);
    return 0;
  }
};
