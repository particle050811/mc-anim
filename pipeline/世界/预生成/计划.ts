// 预生成计划：世界声明的 [[预生成.块]] → Chunky 的选区、图案和命令（取材服务端里临时装上 Chunky 跑，见 看守.ts）。
// 每条选区命令后面跟着 Chunky 回的那句话（lang/en.json 的 format_*）：哪条没生效（比如 csv 名不认），选区就还是上一次的，
// 接着 chunky start 会按错的范围生成，所以执行时没等到回话就停服。
import { createHash } from 'node:crypto';
import type { 世界声明, 预生成块 } from '../声明.ts';
import { 外包方形, 矩形中心半边, 矩形区块, 走廊区块 } from './范围.ts';

export type 选区 = { 形状: 'square' | 'rectangle'; 中心: [number, number]; 半边: [number, number] };
export type 预生成计划 = {
  块: 预生成块;
  选区: 选区;
  /** region = 按选区逐区域生成；csv = 按 区块 列表的顺序逐个生成（列表要拷进 <服务端>/config/chunky/<csv名>.csv） */
  图案: 'region' | 'csv';
  csv名?: string;
  区块?: [number, number][];
  区块数: number;
  /** [命令, 执行后要在日志里等到的话] */
  步骤: [string, string][];
};

/** Chunky 的命令参数只认 ASCII 的一个词，csv 名取世界名加块名的摘要 */
export const csv名 = (世界: string, 块: string) => `anim-${createHash('sha1').update(`${世界}/${块}`).digest('hex').slice(0, 10)}`;
/** csv 图案的文件内容：一行一个「cx,cz」 */
export const csv文本 = (区块: readonly [number, number][]) => 区块.map(([x, z]) => `${x},${z}\n`).join('');

const 选区步骤 = (维度: string, s: 选区, 图案: string): [string, string][] => [
  [`chunky world ${维度}`, 'World changed to'],
  [`chunky shape ${s.形状}`, `Shape changed to ${s.形状}`],
  [`chunky center ${s.中心[0]} ${s.中心[1]}`, 'Center changed to'],
  s.形状 === 'square' ? [`chunky radius ${s.半边[0]}`, 'Radius changed to'] : [`chunky radius ${s.半边[0]} ${s.半边[1]}`, 'Radius changed for x to'],
  [`chunky pattern ${图案}`, `Pattern changed to ${图案.split(' ')[0]}`],
];

/** 一块的计划；只要 只要 那一块（不写 = 全部） */
export const 预生成计划们 = (w: 世界声明, 只要?: string, 另加: 预生成块[] = []): 预生成计划[] => {
  const 全部 = [...w.预生成.块, ...另加];
  const 块们 = 全部.filter((k) => (只要 ? k.名 === 只要 : !另加.length || 另加.includes(k)));
  if (只要 && !块们.length) throw new Error(`世界 ${w.名称} 没有预生成块 ${只要}；有：${w.预生成.块.map((k) => k.名).join('、') || '（无）'}`);
  return 块们.map((k): 预生成计划 => {
    if (k.形状 === '走廊') {
      const 区块 = 走廊区块(k, 全部);
      if (!区块.length) throw new Error(`走廊 ${k.名} 一个区块都没有`);
      const 框 = 外包方形(区块);
      const 选: 选区 = { 形状: 'square', 中心: 框.中心, 半边: [框.半边, 框.半边] };
      const 名 = csv名(w.名称, k.名);
      return { 块: k, 选区: 选, 图案: 'csv', csv名: 名, 区块, 区块数: 区块.length, 步骤: 选区步骤(w.维度, 选, `csv ${名}`) };
    }
    const { 中心, 半边 } = 矩形中心半边(k);
    const 框 = 矩形区块(k);
    const 选: 选区 = { 形状: 半边[0] === 半边[1] ? 'square' : 'rectangle', 中心, 半边 };
    return { 块: k, 选区: 选, 图案: 'region', 区块数: (框.cx1 - 框.cx0 + 1) * (框.cz1 - 框.cz0 + 1), 步骤: 选区步骤(w.维度, 选, 'region') };
  });
};

/** 只打印时给人看的命令（csv 那一块另要把列表放进 config/chunky/） */
export const 打印命令 = (p: 预生成计划) => [...p.步骤.map(([c]) => c), 'chunky start'];
