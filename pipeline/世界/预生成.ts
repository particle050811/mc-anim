// 预生成：按世界声明的 [[预生成.块]] 生成 Chunky 的命令（取材服务端里装着 Chunky），只生成不执行（dry-run）。
// 真跑要开取材服务端（重任务，过资源闸），旧项目 预生成看守.py 的看进度、卡住重启还没搬（docs/待办.md）。
import type { 世界声明, 预生成块 } from './声明.ts';

export type 预生成计划 = { 块: 预生成块; 中心: [number, number]; 半边: [number, number]; 区块数: number; 命令: string[] };

export const 块范围 = (k: 预生成块): { 中心: [number, number]; 半边: [number, number] } => {
  if (k.两角) {
    const [x1, z1, x2, z2] = k.两角;
    return { 中心: [(x1 + x2) / 2, (z1 + z2) / 2], 半边: [Math.abs(x2 - x1) / 2, Math.abs(z2 - z1) / 2] };
  }
  return { 中心: k.中心!, 半边: k.半边! };
};

export const 预生成计划们 = (w: 世界声明, 只要?: string): 预生成计划[] => {
  const 块们 = w.预生成.块.filter((k) => !只要 || k.名 === 只要);
  if (只要 && !块们.length) throw new Error(`世界 ${w.名称} 没有预生成块 ${只要}；有：${w.预生成.块.map((k) => k.名).join('、') || '（无）'}`);
  return 块们.map((k) => {
    const { 中心, 半边 } = 块范围(k);
    const 区块数 = Math.ceil((2 * 半边[0] + 1) / 16) * Math.ceil((2 * 半边[1] + 1) / 16);
    return {
      块: k,
      中心,
      半边,
      区块数,
      命令: [`chunky world ${w.维度}`, 'chunky shape rectangle', `chunky center ${中心[0]} ${中心[1]}`, `chunky radius ${半边[0]} ${半边[1]}`, 'chunky start'],
    };
  });
};
