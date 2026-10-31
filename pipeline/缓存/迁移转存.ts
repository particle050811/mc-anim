// anim cache 转存 [--执行]：把现有的 CRF1 母版一次转成 CRF12（用户 10-30 定「就用 CRF 12 转码 优化一下存储空间」，决策 0008）。
// 默认只打印：各作品、各级别当前指纹要转哪些、段签齐不齐，以及转完以后 anim cache gc 能删什么（已被取代的 CRF1、过期母版、叠层）。
// --执行 只转码（每段单独过渲染闸，别的渲染能插进来），CRF1 不删：先看报告，再 anim cache gc --执行 --只 母版,叠层 真删。断了重跑，转好的跳过。
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../环境/配置.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 压缩母版路径, 原母版路径 } from '../渲/母版.ts';
import { 存成压缩 } from '../渲/转存.ts';
import { 对得上原母版, 段签齐, 读段签 } from '../段签/段签.ts';
import { 大小文本, 小计, type 带理由, type 媒体文件 } from './回收.ts';
import { 当前母版们, type 当前母版 } from './当前指纹.ts';
import { 默认天数, 算回收计划 } from './计划.ts';

/** 只打印时估 CRF12 要新占多少：决策 0008 实测 62 个母版 9.6 GB → 3.9 GB */
const 估压缩比 = 0.4;
const 比 = (新: number, 原: number) => (原 ? `${((新 / 原) * 100).toFixed(0)}%` : '-');
const 相对 = (p: string) => path.relative(数据根(), p).split(path.sep).join('/');

/** 一个指纹的现状 */
const 现状 = async (x: 当前母版) => {
  const 原 = 原母版路径(x.键, x.指纹, x.作品);
  const 压 = 压缩母版路径(x.键, x.指纹, x.作品);
  const 有原 = fs.existsSync(原);
  const 签 = 读段签(x.键, x.指纹, x.作品);
  return {
    ...x, 原, 压, 有原, 有压: fs.existsSync(压),
    原大小: 有原 ? fs.statSync(原).size : 0,
    段签好: 段签齐(签) && (!有原 || (await 对得上原母版(签, 原))),
  };
};

/** 转存后 gc 会怎么处理母版、叠层：分三堆列出来，大小按真腾出来的算（硬链接见 回收.ts 的 小计） */
export const 打删除计划 = (媒体: readonly 带理由<媒体文件>[], 详细: boolean) => {
  const 取代 = 媒体.filter((f) => f.已被取代);
  const 组们: [string, 带理由<媒体文件>[]][] = [
    ['已被 CRF12 取代的 CRF1', 取代],
    ['其余母版（删的都是过期的）', 媒体.filter((f) => f.种 === '母版' && !f.已被取代)],
    ['叠层（删的都是过期的）', 媒体.filter((f) => f.种 === '叠层')],
  ];
  let 合计 = 0;
  for (const [名, 组] of 组们) {
    const s = 小计(组);
    合计 += s.删大小;
    console.log(`  ${名}：删 ${s.删数} 个 ${大小文本(s.删大小)}，留 ${s.留数} 个 ${大小文本(s.留大小)}`);
    if (详细) for (const f of 组) if (!f.理由.length) console.log(`    删 ${相对(f.路径)} ${大小文本(f.大小)}`);
  }
  const 留的原 = 媒体.filter((f) => f.已被取代 && f.理由.length);
  if (留的原.length) {
    console.log(`  CRF1 还留 ${留的原.length} 个（${大小文本(小计(留的原).留大小)}），先做完这些才能删：`);
    for (const f of 留的原) console.log(`    ${相对(f.路径)} ${大小文本(f.大小)}  ${[...new Set(f.理由.map((r) => `${r.类}（${r.说明}）`))].join('、')}`);
  }
  return 合计;
};

export const 迁移转存 = async (作品们: readonly string[], o: { 执行: boolean; 详细: boolean; 记录: 运行记录 }) => {
  const 警告 = (s: string) => o.记录.记('警告', s);
  const 全部 = [];
  for (const 作品 of 作品们) for (const x of await 当前母版们(作品, 警告)) 全部.push(await 现状(x));
  const 要转 = 全部.filter((x) => x.有原 && !x.有压);
  const 已转 = 全部.filter((x) => x.有压);
  const 缺签 = 要转.filter((x) => !x.段签好);
  console.log(`当前指纹 ${全部.length} 个：要转 ${要转.length} 个（CRF1 共 ${大小文本(要转.reduce((n, x) => n + x.原大小, 0))}），已转 ${已转.length} 个，没渲 ${全部.length - 要转.length - 已转.length} 个`);
  console.log(`段签：要转的里面 ${要转.length - 缺签.length} 个齐，${缺签.length} 个缺或对不上（转的时候先从 CRF1 派生）`);
  for (const x of 缺签) console.log(`  缺段签 ${x.作品}/${x.键}（${x.级别}，${x.指纹.slice(0, 16)}）`);

  let 失败 = 0;
  if (o.执行) {
    let 原和 = 0;
    let 新和 = 0;
    for (const [i, x] of 要转.entries()) {
      try {
        const r = await 过渲染闸(async () => (fs.existsSync(x.压) ? null : 存成压缩(x.键, x.指纹, x.级别, { 作品: x.作品, 记录: o.记录 })));
        if (!r) continue;
        原和 += r.原大小;
        新和 += r.新大小;
        console.log(`[${i + 1}/${要转.length}] ${x.作品}/${x.键}（${x.级别}）${大小文本(r.原大小)} → ${大小文本(r.新大小)}（${比(r.新大小, r.原大小)}），${r.秒.toFixed(0)} 秒`);
      } catch (e) {
        失败++;
        o.记录.记('错误', `${x.作品}/${x.键}（${x.级别}）没转成：${(e as Error).message.split('\n')[0]}`);
      }
    }
    console.log(`转了 ${要转.length - 失败} 个：${大小文本(原和)} → ${大小文本(新和)}（${比(新和, 原和)}）${失败 ? `，${失败} 个失败（见错误，重跑只转没转好的）` : ''}`);
  } else {
    for (const x of 要转) console.log(`  要转 ${x.作品}/${x.键}（${x.级别}）${大小文本(x.原大小)}`);
  }

  // 只打印时按「都转完了」算；真转了就看段签实记
  const 计划 = await 算回收计划({
    作品: [...作品们], 类: new Set(['母版', '叠层'] as const), 近期天数: 默认天数.近期, 草稿天数: 默认天数.草稿, webpack天数: 默认天数.webpack, 现在: Date.now(),
    ...(o.执行 ? {} : { 假定已转码: new Set(要转.map((x) => x.原)) }),
  });
  for (const w of 计划.警告) 警告(w);
  console.log(`\n${o.执行 ? '现在' : '转完以后'} anim cache gc 能删（CRF1 转完才算已被取代；交付已自足、认可有参考的才算解钉）：`);
  const 合计 = 打删除计划(计划.媒体, o.详细);
  if (o.执行) console.log(`  合计腾出约 ${大小文本(合计)}。真删：anim cache gc --执行 --只 母版,叠层`);
  else {
    const 新增 = 要转.reduce((n, x) => n + x.原大小, 0) * 估压缩比;
    console.log(`  合计删约 ${大小文本(合计)}，转存新占约 ${大小文本(新增)}（按实测 CRF12 约 CRF1 的 ${估压缩比 * 100}% 估），净省约 ${大小文本(Math.max(0, 合计 - 新增))}。先 anim cache 转存 --执行，再真删：anim cache gc --执行 --只 母版,叠层`);
  }
  return 失败 ? 1 : 0;
};
