// 分阶段计时（still、render）：打包、开浏览器、读组合（getCompositions）、等闸、出帧、编码各花多久，看清时间花在哪。
// 写进这条命令运行记录的「阶段」字段，另追加到 run/logs/阶段耗时.tsv；耗时.tsv 的列不动（预计耗时还按它算）。
// 编码 = renderMedia 出完最后一帧到返回（Remotion 边出帧边编码，这里只剩收尾编码和混音）；派生段签 = render 渲完从 CRF1 派生段签（pipeline/段签/）；转存 = 转成 CRF12（渲/转码.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { 耗时表, 配置 } from '../环境/配置.ts';

export type 阶段名 = '打包' | '开浏览器' | '读组合' | '等闸' | '出帧' | '编码' | '派生段签' | '转存';
export type 阶段记录 = { 标签: string; 阶段: 阶段名; 开始: string; 秒: number };

const 表头 = '开始（UTC）\t标签\t阶段\t秒\t主机\tpid\n';
export const 阶段表 = () => path.join(path.dirname(耗时表()), '阶段耗时.tsv');

const utc = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const 单行 = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/** 记一个阶段：收进 收（运行记录的 阶段 字段），追加一行到阶段表；写表失败只提示，不影响渲染 */
export const 记阶段 = (收: 阶段记录[] | undefined, 标签: string, 阶段: 阶段名, 开始ms: number, 秒: number, 表 = 阶段表()): 阶段记录 => {
  const r: 阶段记录 = { 标签, 阶段, 开始: utc(开始ms), 秒: Number(秒.toFixed(2)) };
  收?.push(r);
  try {
    fs.mkdirSync(path.dirname(表), { recursive: true });
    const 行 = `${r.开始}\t${单行(标签)}\t${阶段}\t${r.秒.toFixed(2)}\t${单行(配置('主机'))}\t${process.pid}\n`;
    if (!fs.existsSync(表)) fs.writeFileSync(表, 表头 + 行, 'utf8');
    else fs.appendFileSync(表, 行, 'utf8');
  } catch (e) {
    console.error(`!! 阶段耗时没写成：${(e as Error).message}`);
  }
  return r;
};

/** 量 fn 这一段（抛错也记） */
export const 量阶段 = async <T>(收: 阶段记录[] | undefined, 标签: string, 阶段: 阶段名, fn: () => Promise<T>, 表?: string): Promise<T> => {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    记阶段(收, 标签, 阶段, t0, (Date.now() - t0) / 1000, 表);
  }
};

/** renderMedia 的 onProgress 记下出完最后一帧的时刻，返回后拆成 出帧、编码 两段 */
export const 出帧编码计时 = () => {
  let 出帧毫秒: number | null = null;
  return {
    onProgress: (p: { renderedDoneIn: number | null }) => {
      if (p.renderedDoneIn !== null) 出帧毫秒 = p.renderedDoneIn;
    },
    拆: (总毫秒: number) => {
      const 出帧 = Math.min(出帧毫秒 ?? 总毫秒, 总毫秒);
      return { 出帧秒: 出帧 / 1000, 编码秒: (总毫秒 - 出帧) / 1000 };
    },
  };
};

/** 一行给人看的小结：打包 12.3 秒、开浏览器 0.8 秒… */
export const 阶段小结 = (rs: readonly 阶段记录[]) => rs.map((r) => `${r.阶段} ${r.秒.toFixed(1)} 秒`).join('、');
