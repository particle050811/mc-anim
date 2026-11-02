// 母版转存的几步（用户 10-30 定，存法见 转码.ts）。
// 顺序保证验收不受影响：先有 CRF1 派生的段签（无损抽样帧、声音、签名），再转码到临时名，记进段签，最后改名；任何一步断了 CRF1 都还在，下次重来，转出来逐位相同。
// 备好母版：film、edit-package、render --到预览 要读母版时用，只有 CRF1 的（旧的）先照同样参数转码。
// 并发（后台转存让别的进程也可能碰到同一指纹）：动 CRF1 和段签都拿占用（母版占用.ts），拿到后重查；CRF1 被抢先删了不算错。
import fs from 'node:fs';
import { 母版目录 } from '../环境/配置.ts';
import { 作品名 } from '../环境/作品.ts';
import { 过渲染闸, 登记临时文件 } from '../闸/闸.ts';
import type { 运行记录 } from '../运行记录/记录.ts';
import { 出段签, 原样子, 对得上母版, 对得上原母版, 段签齐, 记转码, 读段签 } from '../段签/段签.ts';
import { 漂移提示 } from '../段签/补.ts';
import { 删已取代 } from '../缓存/钉.ts';
import { 压缩母版路径, 压缩后缀, 原母版路径, 记用过 } from './母版.ts';
import { 占着, 等占用放开 } from './母版占用.ts';
import { 转码 } from './转码.ts';

export type 转存结果 = { 文件: string; 原大小: number; 新大小: number; 秒: number };
type 记警告 = Pick<运行记录, '记'>;

const 同一份 = (a: fs.Stats, b: fs.Stats) => a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;

/** 这份 CRF1 还是不是当时 stat 的那份：没了算否（同一指纹重渲会原子换掉它） */
export const 还是那份 = (文件: string, 当时: fs.Stats) => {
  try {
    return 同一份(fs.statSync(文件), 当时);
  } catch {
    return false;
  }
};

/** 存成压缩 的本体：调用方已拿着占用。不过闸 */
export const 存成压缩内层 = async (键: string, 指纹: string, 级别: string | null, o: { 作品?: string; 记录?: 记警告 } = {}): Promise<转存结果> => {
  const 作品 = o.作品 ?? 作品名();
  const 原 = 原母版路径(键, 指纹, 作品);
  if (!fs.existsSync(原)) throw new Error(`${键}（${指纹.slice(0, 16)}）没有 CRF1 母版，转不了`);
  const t0 = Date.now();
  const 当时 = fs.statSync(原);
  let 签 = 读段签(键, 指纹, 作品);
  if (!段签齐(签) || !(await 对得上原母版(签, 原))) {
    const d = await 出段签(原, { 段键: 键, 指纹, 级别, 派生: '补', 作品 });
    if (d.自查?.结论 === '漂移') o.记录?.记('警告', 漂移提示(键, d.自查));
    签 = d.签;
  }
  const 出 = 压缩母版路径(键, 指纹, 作品);
  const tmp = 出.slice(0, -压缩后缀.length) + `.转码中-${process.pid}${压缩后缀}`;
  const 撤临时 = 登记临时文件(tmp);
  try {
    const 法 = await 转码(原, tmp);
    // 转的途中同一指纹又重渲了：这份是旧字节转的、段签也是旧的，不收，留给换它的那次接着转。CRF1 只是被删了不要紧，ffmpeg 开着文件转的还是那份
    if (fs.existsSync(原) && !还是那份(原, 当时)) throw new Error(`${键} 的 CRF1 转的途中被同一指纹的重渲换了，这份压缩母版不收，再跑一次`);
    await 记转码(键, 指纹, tmp, { 原字节sha: 原样子(签).字节sha, 存法: 法, 作品 });
    // 改名不动修改时间，段签刚记的大小、改于照样对得上
    fs.renameSync(tmp, 出);
  } finally {
    fs.rmSync(tmp, { force: true });
    撤临时();
  }
  return { 文件: 出, 原大小: 当时.size, 新大小: fs.statSync(出).size, 秒: (Date.now() - t0) / 1000 };
};

/** 这个指纹的 CRF1 存成压缩母版（CRF1 不删，调用方定）。段签缺了或不是这份 CRF1 派生的先派生。不过闸（调用方过） */
export const 存成压缩 = (键: string, 指纹: string, 级别: string | null, o: { 作品?: string; 记录?: 记警告 } = {}): Promise<转存结果> =>
  占着(键, 指纹, o.作品, () => 存成压缩内层(键, 指纹, 级别, o));

/** 这个指纹的压缩母版在、段签也认它、在的 CRF1 就是段签记的那份（CRF1 不在算不上，调用方自己看） */
const 都对得上 = async (键: string, 指纹: string, 作品: string) => {
  const 签 = 读段签(键, 指纹, 作品);
  const 压 = 压缩母版路径(键, 指纹, 作品);
  return fs.existsSync(压) && 段签齐(签) && (await 对得上母版(签, 压)) && (await 对得上原母版(签, 原母版路径(键, 指纹, 作品)));
};

const 不用转 = async (键: string, 指纹: string, 作品: string) => fs.existsSync(压缩母版路径(键, 指纹, 作品)) && (!fs.existsSync(原母版路径(键, 指纹, 作品)) || (await 都对得上(键, 指纹, 作品)));

/**
 * 要读这个指纹的母版出片：压缩母版在、段签也认它、在的 CRF1 就是段签记的那份，就用压缩母版；只有 CRF1（10-30 以前渲的），
 * 或压缩母版、CRF1 有一个和段签对不上而 CRF1 又在（CRF1 是后来重渲的），先从 CRF1 重新派生段签、照同样参数转码（过渲染闸；已被取代的 CRF1 没有理由留就删），
 * 保证同一指纹出同样的片。别的进程正在后台转这个指纹就等它转完再看。都没有 null。记一笔「用过」。
 */
export const 备好母版 = async (键: string, 指纹: string, 级别: string | null, o: { 作品?: string; 记录?: 记警告 } = {}): Promise<string | null> => {
  const 作品 = o.作品 ?? 作品名();
  const 压 = 压缩母版路径(键, 指纹, 作品);
  const 原 = 原母版路径(键, 指纹, 作品);
  if (!fs.existsSync(压) && !fs.existsSync(原)) return null;
  const 目录 = 母版目录(键, 作品);
  const 用它 = () => {
    记用过(目录, 指纹);
    return 压;
  };
  if (await 不用转(键, 指纹, 作品)) return 用它();
  await 等占用放开(键, 指纹, 作品);
  if (await 不用转(键, 指纹, 作品)) return 用它();
  await 过渲染闸(async () => {
    const 转了 = await 占着(键, 指纹, 作品, async () => {
      // 排队等闸的时候别的进程可能已经转好了
      if (await 不用转(键, 指纹, 作品)) return false;
      if (!fs.existsSync(原)) return false;
      console.log(`== 转存压缩母版 ${键}（${指纹.slice(0, 16)}，${(fs.statSync(原).size / 1e9).toFixed(2)} GB 的 CRF1）`);
      const r = await 存成压缩内层(键, 指纹, 级别, { 作品, 记录: o.记录 });
      console.log(`   ${键}：${(r.原大小 / 1e9).toFixed(2)} GB → ${(r.新大小 / 1e9).toFixed(2)} GB，${r.秒.toFixed(0)} 秒`);
      return true;
    });
    // 放了占用才删：自己占着会被算成「正在写」
    if (转了) 删已取代(键, 指纹, { 作品, 记录: o.记录 });
  });
  if (!fs.existsSync(压)) return null;
  return 用它();
};
