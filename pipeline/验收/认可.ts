// 认可记录 verify/accepted/<平台>/<段键>.toml（进 Git）：认可的那一版母版的指纹、抽样帧签名和音频 sha。
// sr verify accept 写，人不手改；画面每次变化都会出现在 diff 里。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';

export type 帧签名 = { 帧: number; 哈希: string; 块均值: string[] };
export type 签名 = { 宽: number; 高: number; 帧数: number; 间隔: number; 帧: 帧签名[]; 音频sha: string | null };
export type 认可记录 = 签名 & { 段: string; 指纹: string; 平台: string; 渲染级别: string; 认可于: string; 提交: string; 理由: string; 上一版指纹: string | null };

export const 本平台 = () => `${process.platform}-${process.arch}`;

export const 认可文件 = (段键: string, 平台 = 本平台(), 根 = 代码根()) => path.join(根, 'verify', 'accepted', 平台, `${段键}.toml`);

export const 读认可 = (file: string): 认可记录 | null => {
  if (!fs.existsSync(file)) return null;
  const t = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const 要 = ['段', '指纹', '平台', '渲染级别', '认可于', '提交', '理由', '宽', '高', '帧数', '间隔', '帧'];
  const 缺 = 要.filter((k) => t[k] === undefined);
  if (缺.length) throw new Error(`${file} 缺 ${缺.join('、')}（这个文件由 sr verify accept 生成，别手改）`);
  return { ...(t as unknown as 认可记录), 音频sha: (t['音频sha'] as string | undefined) ?? null, 上一版指纹: (t['上一版指纹'] as string | undefined) ?? null };
};

const 串 = (s: string) => JSON.stringify(s);

/** 手写 TOML：键的顺序固定，帧一帧一张表，diff 好读 */
export const 认可文本 = (r: 认可记录) =>
  [
    '# sr verify accept 生成，别手改',
    `"段" = ${串(r.段)}`,
    `"指纹" = ${串(r.指纹)}`,
    `"平台" = ${串(r.平台)}`,
    `"渲染级别" = ${串(r.渲染级别)}`,
    `"认可于" = ${串(r.认可于)}`,
    `"提交" = ${串(r.提交)}`,
    `"理由" = ${串(r.理由)}`,
    ...(r.上一版指纹 ? [`"上一版指纹" = ${串(r.上一版指纹)}`] : []),
    `"宽" = ${r.宽}`,
    `"高" = ${r.高}`,
    `"帧数" = ${r.帧数}`,
    `"间隔" = ${r.间隔}`,
    ...(r.音频sha ? [`"音频sha" = ${串(r.音频sha)}`] : []),
    ...r.帧.flatMap((f) => ['', '[["帧"]]', `"帧" = ${f.帧}`, `"哈希" = ${串(f.哈希)}`, `"块均值" = [`, ...f.块均值.map((x) => `  ${串(x)},`), ']']),
  ].join('\n') + '\n';

export const 写认可 = (file: string, r: 认可记录) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, 认可文本(r), 'utf8');
  fs.renameSync(tmp, file);
};
