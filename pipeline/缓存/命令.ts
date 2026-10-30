// anim cache gc [--执行] [--只 <类>…] [--近期天数 N] [--草稿天数 N] [--webpack天数 N] [--详细]：缓存回收，默认只打印要删什么、能省多少。
// --作品 只限定母版、叠层、去重（cache/ 按作品分）；草稿、webpack 缓存不分作品。规则见 回收.ts。
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 当前作品, 指定的作品 } from '../环境/作品.ts';
import { 数据根 } from '../环境/配置.ts';
import { 可省 } from './去重.ts';
import { 保留类顺序, 大小文本, 小计, type 保留理由 } from './回收.ts';
import { 回收类, 默认天数, 算回收计划, 执行回收, type 回收类名, type 回收计划 } from './计划.ts';

const 天数 = (v: string | undefined, 默认: number, 名: string) => {
  if (v === undefined) return 默认;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new 用法错误(`${名} 要是不小于 0 的天数`);
  return n;
};

const 理由串 = (理由: readonly 保留理由[]) => [...new Set(理由.map((x) => `${x.类}（${x.说明}）`))].join('、');

const 打小计 = (名: string, 项: readonly { 大小: number; 理由: readonly 保留理由[] }[], 单位: string) => {
  const s = 小计(项);
  const 分 = 保留类顺序.filter((c) => s.按理由[c]).map((c) => `${c} ${大小文本(s.按理由[c]!)}`);
  const 未腾 = s.硬链接未腾 ? `；另有 ${大小文本(s.硬链接未腾)} 的名字删了也不腾空间（硬链接还在别处）` : '';
  console.log(`${名.padEnd(8)} 删 ${s.删数} ${单位} ${大小文本(s.删大小)}，留 ${s.留数} ${单位} ${大小文本(s.留大小)}${分.length ? `（${分.join('、')}）` : ''}${未腾}`);
  return s.删大小;
};

const 打报告 = (计划: 回收计划, 详细: boolean) => {
  let 合计 = 0;
  const 母版 = 计划.媒体.filter((f) => f.种 === '母版');
  const 叠层 = 计划.媒体.filter((f) => f.种 === '叠层');
  if (母版.length) 合计 += 打小计('母版', 母版, '个');
  if (叠层.length) 合计 += 打小计('叠层', 叠层, '个');
  if (计划.临时.length) 合计 += 打小计('残留', 计划.临时, '个');
  if (计划.草稿.length) 合计 += 打小计('草稿', 计划.草稿, '个目录');
  for (const w of 计划.webpack) {
    console.log(`webpack  ${w.根}（装的 Remotion ${w.当前版本 ?? '不知道'}）`);
    合计 += 打小计('', w.条目, '个');
  }
  // 只因为交付留着的：哪几次交付占得多，用户可以决定删旧交付
  const 只因交付 = new Map<string, number>();
  const 按inode = new Map<string, typeof 计划.媒体>();
  for (const f of 计划.媒体) 按inode.set(f.inode, [...(按inode.get(f.inode) ?? []), f]);
  for (const 名们 of 按inode.values()) {
    const 理由 = 名们.flatMap((f) => f.理由);
    if (!理由.length || 理由.some((x) => x.类 !== '交付')) continue;
    const 目录们 = new Set(理由.map((x) => x.说明));
    for (const d of 目录们) 只因交付.set(d, (只因交付.get(d) ?? 0) + 名们[0]!.大小 / 目录们.size);
  }
  if (只因交付.size) {
    const 排 = [...只因交付].sort((a, b) => b[1] - a[1]);
    console.log(`         只因为交付 manifest 引用才留的约 ${大小文本(排.reduce((n, [, v]) => n + v, 0))}，占得多的：${排.slice(0, 5).map(([d, v]) => `${d} ${大小文本(v)}`).join('、')}`);
  }
  if (计划.去重) {
    const 省 = 可省(计划.去重.组);
    const 组数 = 计划.去重.组.filter((g) => g.待克隆.length).length;
    console.log(`去重     留下的里内容相同的 ${组数} 组，克隆成共享块能再省 ${大小文本(省)}${计划.去重.能做 ? '' : '（本平台不做：只在 Mac 的 APFS 上克隆）'}`);
    if (计划.去重.能做) 合计 += 省;
  }
  for (const x of 计划.不认识) console.log(`不认识（只报告不删）${x.位置}：${x.条目.map((e) => `${e.名} ${大小文本(e.大小)}`).join('、')}`);
  console.log(`\n合计能省约 ${大小文本(合计)}（按文件大小算；已经是克隆的共享块删了不一定腾出空间）`);
  if (详细) {
    const 列 = (名: string, 项: readonly { 路径: string; 大小: number; 理由: readonly 保留理由[] }[]) => {
      for (const x of 项) console.log(`  ${x.理由.length ? '留' : '删'} ${名} ${x.路径} ${大小文本(x.大小)}${x.理由.length ? `  ${理由串(x.理由)}` : ''}`);
    };
    console.log('\n明细：');
    列('母版', 母版);
    列('叠层', 叠层);
    列('残留', 计划.临时);
    列('草稿', 计划.草稿);
    for (const w of 计划.webpack) 列('webpack', w.条目);
    for (const g of 计划.去重?.组 ?? []) for (const p of g.待克隆) console.log(`  克隆 ${p} ← ${g.源} ${大小文本(g.大小)}`);
  }
};

export const 缓存命令: Record<string, 命令> = {
  cache: {
    用法: `cache gc [--执行] [--只 ${回收类.join('|')}…] [--近期天数 ${默认天数.近期}] [--草稿天数 ${默认天数.草稿}] [--webpack天数 ${默认天数.webpack}] [--详细]`,
    说明:
      '缓存回收，默认只打印要删什么、能省多少，--执行 才删。母版、叠层只删旧指纹的媒体文件（.指纹.json 留着），留各级别当前指纹、认可那版、交付 manifest 引用的、每段每级别最近一份、近期渲的；' +
      '留下的内容相同的克隆成共享块（Mac）；草稿超过天数的删；webpack 缓存旧 Remotion 版本的整个删、超过天数没用的删；run/、cache/ 下不认识的只报告。--作品 只限定母版、叠层、去重',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--执行', '--详细'], 值: ['--近期天数', '--草稿天数', '--webpack天数'], 多值: ['--只'] });
      if (p.位置[0] !== 'gc' || p.位置.length !== 1) throw new 用法错误('要 anim cache gc [--执行] …');
      const 只 = (p.多值['--只'] ?? []).flatMap((x) => x.split(/[,，、]/)).filter(Boolean);
      const 不认识 = 只.filter((x) => !(回收类 as readonly string[]).includes(x));
      if (不认识.length) throw new 用法错误(`--只 不认识 ${不认识.join('、')}（有：${回收类.join('、')}）`);
      const o = {
        作品: 指定的作品() ? [当前作品().名] : [],
        类: new Set<回收类名>(只.length ? (只 as 回收类名[]) : 回收类),
        近期天数: 天数(p.值['--近期天数'], 默认天数.近期, '--近期天数'),
        草稿天数: 天数(p.值['--草稿天数'], 默认天数.草稿, '--草稿天数'),
        webpack天数: 天数(p.值['--webpack天数'], 默认天数.webpack, '--webpack天数'),
        现在: Date.now(),
      };
      const 执行 = p.开关.has('--执行');
      console.log(`anim cache gc（${执行 ? '执行' : '只看不删，加 --执行 才删'}）数据根 ${数据根()}${o.作品.length ? `，作品 ${o.作品.join('、')}` : '，全部作品'}`);
      const 计划 = await 算回收计划(o, (s) => console.log(`.. ${s}`));
      for (const w of 计划.警告) 记录.记('警告', w);
      打报告(计划, p.开关.has('--详细'));
      if (!执行) return 0;
      const r = await 执行回收(计划, o);
      console.log(`\n删了 ${r.删数} 项 ${大小文本(r.删大小)}${r.克隆数 ? `，克隆 ${r.克隆数} 个省 ${大小文本(r.克隆省)}` : ''}${r.跳过.length ? `，跳过 ${r.跳过.length} 项（刚改过）` : ''}`);
      for (const x of r.跳过) 记录.记('信息', `跳过 ${x}`);
      for (const x of r.失败) 记录.记('错误', x);
      return r.失败.length ? 1 : 0;
    },
  },
};
