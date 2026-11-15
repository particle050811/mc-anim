// 认可记录 <作品根>/认可/<平台>/<段键>.toml（进 Git）：认可的那一版母版的指纹、抽样帧签名，音频的 sha、响度和起音，
// 认可时比画面用的换算（比较.ts 的 换算）。
// anim verify accept 写，人不手改；画面每次变化都会出现在 diff 里。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { workRoot } from '../环境/作品.ts';
import { onsetToString, onsetFromString, type Onset } from './比较.ts';

export type FrameSig = { 帧: number; 哈希: string; 块均值: string[] };
export type AudioSig = { 音频sha: string | null; 响度: number | null; 起音: Onset[] | null };
export type Signature = { 宽: number; 高: number; 帧数: number; 间隔: number; 帧: FrameSig[] } & AudioSig;
export type ApprovalRecord = Signature & { 段: string; 指纹: string; 平台: string; 渲染级别: string; 认可于: string; 提交: string; 理由: string; 上一版指纹: string | null; conversion?: string };

/**
 * 一组抽样帧的身份：尺寸、帧数、间隔、各抽样帧的哈希（不含声音）。认可参考按它起名：同一指纹重渲后再 accept，
 * 哈希变了就是另一个参考文件，旧参考不会被当成新认可的
 */
export const sampleKey = (s: Pick<Signature, '宽' | '高' | '帧数' | '间隔' | '帧'>) =>
  crypto.createHash('sha256').update(JSON.stringify([s.宽, s.高, s.帧数, s.间隔, s.帧.map((f) => [f.帧, f.哈希])])).digest('hex').slice(0, 12);

/** 段签的签名和认可记录是不是同一版：两边都有的抽样帧哈希全一样、声音 sha 一样、尺寸帧数一样 */
export const sameVersion = (a: Signature, b: Signature) => {
  if (a.宽 !== b.宽 || a.高 !== b.高 || a.帧数 !== b.帧数 || (a.音频sha ?? null) !== (b.音频sha ?? null)) return false;
  const hashes = new Map(a.帧.map((f) => [f.帧, f.哈希]));
  return b.帧.every((f) => !hashes.has(f.帧) || hashes.get(f.帧) === f.哈希);
};

export const platformId = () => `${process.platform}-${process.arch}`;

export const approvalFile = (segKey: string, hostPlatform = platformId(), workDir = workRoot()) => path.join(workDir, '认可', hostPlatform, `${segKey}.toml`);

export const readApproval = (file: string): ApprovalRecord | null => {
  if (!fs.existsSync(file)) return null;
  const t = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const requiredKeys = ['段', '指纹', '平台', '渲染级别', '认可于', '提交', '理由', '宽', '高', '帧数', '间隔', '帧'];
  const missing = requiredKeys.filter((k) => t[k] === undefined);
  if (missing.length) throw new Error(`${file} 缺 ${missing.join('、')}（这个文件由 anim verify accept 生成，别手改）`);
  return {
    ...(t as unknown as ApprovalRecord),
    音频sha: (t['音频sha'] as string | undefined) ?? null,
    // 没有声音的段这几项不写
    响度: (t['响度'] as number | undefined) ?? null,
    起音: Array.isArray(t['起音']) ? (t['起音'] as string[]).map(onsetFromString) : null,
    上一版指纹: (t['上一版指纹'] as string | undefined) ?? null,
    ...(typeof t['换算'] === 'string' ? { conversion: t['换算'] } : {}),
  };
};

const quote = (s: string) => JSON.stringify(s);
const splitLines = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** 手写 TOML：键的顺序固定，帧一帧一张表，diff 好读 */
export const approvalText = (r: ApprovalRecord) =>
  [
    '# anim verify accept 生成，别手改',
    `"段" = ${quote(r.段)}`,
    `"指纹" = ${quote(r.指纹)}`,
    `"平台" = ${quote(r.平台)}`,
    `"渲染级别" = ${quote(r.渲染级别)}`,
    `"认可于" = ${quote(r.认可于)}`,
    `"提交" = ${quote(r.提交)}`,
    `"理由" = ${quote(r.理由)}`,
    ...(r.上一版指纹 ? [`"上一版指纹" = ${quote(r.上一版指纹)}`] : []),
    `"宽" = ${r.宽}`,
    `"高" = ${r.高}`,
    `"帧数" = ${r.帧数}`,
    `"间隔" = ${r.间隔}`,
    ...(r.conversion ? [`"换算" = ${quote(r.conversion)}`] : []),
    ...(r.音频sha ? [`"音频sha" = ${quote(r.音频sha)}`] : []),
    ...(r.响度 !== null ? [`"响度" = ${r.响度}`] : []),
    ...(r.起音 ? [`"起音" = [`, ...splitLines(r.起音.map((x) => quote(onsetToString(x))), 8).map((line) => `  ${line.join(', ')},`), ']'] : []),
    ...r.帧.flatMap((f) => ['', '[["帧"]]', `"帧" = ${f.帧}`, `"哈希" = ${quote(f.哈希)}`, `"块均值" = [`, ...f.块均值.map((x) => `  ${quote(x)},`), ']']),
  ].join('\n') + '\n';

export const writeApproval = (file: string, r: ApprovalRecord) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, approvalText(r), 'utf8');
  fs.renameSync(tmp, file);
};

/**
 * accept 的选择器每个只许点名一段，返回对上不止一段的（选择器和它对上的段键）。
 * 原来一次只认可一段；能不能按场、章一次认可整批还没让用户定，先只放开「逐段点名多段」，免得一个章号把整章都记成看过。
 */
export const findAmbiguous = <S extends { 键: string }>(selectors: readonly string[], segments: readonly S[], selectFn: (segments: readonly S[], selector: string) => readonly S[]) =>
  selectors.map((x) => ({ selector: x, 段: selectFn(segments, x).map((s) => s.键) })).filter((y) => y.段.length > 1);
