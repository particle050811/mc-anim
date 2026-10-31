// 段签：渲过一个指纹就从母版派生一份小件，母版删了 film、verify、edit-package 照样用（设计见 预览/1030-1755-母版管线重设计/01-推荐方案.md 第四节 A）。
//   段签/<作品>/<段键>/<指纹前 16 位>/
//     签.json    母版字节 sha、大小、改于；verify 的签名（扫母版 算的那份，抽样帧 sha、16×9 块均值、声音 sha/响度/起音）；首尾帧 160×90 灰度（接缝用）
//     声音.flac  母版 PCM 无损（解回来的 PCM sha 要等于签名里的 音频sha 才收）
//     抽样.mkv   抽样帧（首帧、每 24 帧、末帧）全分辨率 yuv420p FFV1 无损（解成 rgb24 逐帧 sha 要等于签名才收）
//     历史.jsonl 同一指纹重渲：上一份的字节 sha 和自查结论；母版转码的改记
//     历史/<上一份母版字节 sha 前 16 位>/  重渲前那一套（签.json、抽样.mkv、声音.flac）原样挪进来，无损抽样帧不丢（认可参考还能从这里备）
// 渲染本身不确定，同一指纹重渲字节会变：自查比抽样帧 sha，不一样再比块均值（阈值.toml 的 块均值容差），超了算「重渲漂移」，要对这段跑 verify。
// 母版原地转码（用户 10-30 定 CRF1 转 CRF12）不是重渲：转码的那一步调 记转码，段签留着转码前无损抽的帧，不重新派生。
// 签.json 最后原子写，有它就是一整套；旧的一套只挪不删，不删母版。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 配置, 段签目录 } from '../环境/配置.ts';
import { 作品名 } from '../环境/作品.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 视频信息, 有音轨 } from '../渲/探测.ts';
import { 灰度帧 } from '../合成/接缝.ts';
import { 原子写 } from '../渲/母版.ts';
import { 抽样帧, 抽样流, 抽样滤镜, 音频流, sha, 默认间隔 } from '../验收/帧流.ts';
import { 比块均值, 读阈值 } from '../验收/比较.ts';
import { 扫母版 } from '../验收/验收.ts';
import type { 签名 } from '../验收/认可.ts';

export const 段签版本 = 1;
export const 签文件名 = '签.json';
export const 声音文件名 = '声音.flac';
export const 抽样文件名 = '抽样.mkv';
export const 历史文件名 = '历史.jsonl';
export const 历史目录名 = '历史';
export const 小图宽 = 160;
export const 小图高 = 90;

export type 段签 = {
  版本: typeof 段签版本;
  作品: string;
  段: string;
  指纹: string;
  级别: string | null;
  /** 派生时母版的样子：大小、改于对得上就当字节没变，不重算 sha。转码自：母版原地转码过，签名、抽样是从转码前这份抽的 */
  母版: 母版样子 & { 转码自?: 母版样子 };
  签名: 签名;
  /** 母版没有音轨是 null */
  声音: { 文件: string; sha: string; 大小: number } | null;
  抽样: { 文件: string; sha: string; 大小: number; 帧: number[] };
  /** 首尾帧 160×90 灰度（base64），接缝.ts 判首帧重复用 */
  首尾: { 宽: number; 高: number; 首帧: string; 末帧: string };
  派生于: string;
  派生: '渲染' | '回填' | '补';
};

type 母版样子 = { 字节sha: string; 大小: number; 改于: number };

export type 自查 = { 结论: '同画面' | '容差内' | '漂移'; 说明: string };

export const 签路径 = (段键: string, 指纹: string, 作品 = 作品名()) => path.join(段签目录(段键, 指纹, 作品), 签文件名);

/** 读段签；没有、版本不认识、指纹对不上都是 null */
export const 读段签 = (段键: string, 指纹: string, 作品 = 作品名()): 段签 | null => {
  const f = 签路径(段键, 指纹, 作品);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as 段签;
    return j.版本 === 段签版本 && j.指纹 === 指纹 ? j : null;
  } catch {
    return null;
  }
};

export const 段签文件 = (签: Pick<段签, '作品' | '段' | '指纹'>, 名: string) => path.join(段签目录(签.段, 签.指纹, 签.作品), 名);
export const 声音路径 = (签: 段签) => (签.声音 ? 段签文件(签, 签.声音.文件) : null);
export const 抽样路径 = (签: 段签) => 段签文件(签, 签.抽样.文件);

export const 文件sha = async (file: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file)) h.update(c as Buffer);
  return h.digest('hex');
};

/** 段签是不是这份母版派生的：大小、改于一样就是；不一样再算字节 sha */
export const 对得上母版 = async (签: 段签, 母版: string) => {
  const st = fs.statSync(母版);
  if (st.size !== 签.母版.大小) return false;
  if (st.mtimeMs === 签.母版.改于) return true;
  return (await 文件sha(母版)) === 签.母版.字节sha;
};

/** 段签齐不齐：签.json 里登记的声音、抽样文件都在 */
export const 段签齐 = (签: 段签 | null): 签 is 段签 => !!签 && fs.existsSync(抽样路径(签)) && (!签.声音 || fs.existsSync(声音路径(签)!));

/** 同一指纹两份签名比：抽样帧 sha 全一样是同画面；不一样比块均值，超容差算漂移 */
export const 比签名 = (旧: 签名, 新: 签名, 块均值容差 = 读阈值().块均值容差): 自查 => {
  if (旧.宽 !== 新.宽 || 旧.高 !== 新.高 || 旧.帧数 !== 新.帧数) return { 结论: '漂移', 说明: `上次 ${旧.宽}×${旧.高} ${旧.帧数} 帧，这次 ${新.宽}×${新.高} ${新.帧数} 帧` };
  const 旧帧 = new Map(旧.帧.map((f) => [f.帧, f]));
  let 不同 = 0;
  let 最大 = 0;
  for (const f of 新.帧) {
    const o = 旧帧.get(f.帧);
    if (o && o.哈希 === f.哈希) continue;
    不同++;
    最大 = Math.max(最大, o ? 比块均值(f.块均值, o.块均值) : Infinity);
  }
  const 声 = 旧.音频sha === 新.音频sha ? '声音一样' : '声音 sha 不一样';
  if (!不同) return { 结论: '同画面', 说明: `抽样帧 sha 全一样，${声}` };
  return 最大 <= 块均值容差
    ? { 结论: '容差内', 说明: `${不同} 个抽样帧 sha 不一样，块均值最多差 ${最大}（容差 ${块均值容差}），${声}` }
    : { 结论: '漂移', 说明: `${不同} 个抽样帧 sha 不一样，块均值最多差 ${最大}（容差 ${块均值容差}），${声}` };
};

/** 把母版的抽样帧（首帧、每 间隔 帧、末帧）存成全分辨率 FFV1（无损，yuv420p 原样）；认可参考也用它 */
export const 写抽样 = (母版: string, 帧数: number, 间隔: number, 出: string) =>
  跑(
    低优先级([
      配置('ffmpeg'), '-v', 'error', '-nostdin', '-y', '-i', 母版, '-map', '0:v:0', '-vf', 抽样滤镜(帧数, 间隔), '-fps_mode', 'passthrough',
      '-c:v', 'ffv1', '-level', '3', '-g', '1', '-slicecrc', '1', '-an', 出,
    ]),
    { 安静: true },
  );

/** 重渲前的那一套挪进 历史/<字节 sha 前 16 位>/：先挪声音、抽样，签.json 最后（中途断了，留下的签.json 指的文件不齐，下次照样重派生、接着挪） */
const 存旧 = (旧: 段签, dir: string) => {
  const 去 = path.join(dir, 历史目录名, 旧.母版.字节sha.slice(0, 16));
  fs.mkdirSync(去, { recursive: true });
  for (const 名 of [...(旧.声音 ? [旧.声音.文件] : []), 旧.抽样.文件, 签文件名]) {
    const 从 = path.join(dir, 名);
    // 同一份字节的已经挪过一次（内容相同），留着那份
    if (fs.existsSync(从) && !fs.existsSync(path.join(去, 名))) fs.renameSync(从, path.join(去, 名));
  }
  return path.relative(dir, 去).split(path.sep).join('/');
};

/** 历史/ 里挪过去的各套段签（签.json 和抽样帧都在的），给 备参考 找认可那一版 */
export const 读历史段签 = (段键: string, 指纹: string, 作品 = 作品名()): { 签: 段签; 抽样: string }[] => {
  const 根 = path.join(段签目录(段键, 指纹, 作品), 历史目录名);
  if (!fs.existsSync(根)) return [];
  return fs.readdirSync(根).sort().flatMap((名) => {
    try {
      const 签 = JSON.parse(fs.readFileSync(path.join(根, 名, 签文件名), 'utf8')) as 段签;
      const 抽样 = path.join(根, 名, 签.抽样.文件);
      return 签.版本 === 段签版本 && 签.指纹 === 指纹 && fs.existsSync(抽样) ? [{ 签, 抽样 }] : [];
    } catch {
      return [];
    }
  });
};

const 临时名 = (dir: string, 名: string) => {
  const ext = path.extname(名);
  return path.join(dir, `${path.basename(名, ext)}.写入中-${process.pid}${ext}`);
};

/**
 * 从母版派生段签（只读母版、只写段签目录）。签名用 扫母版（和 verify、accept 同一份代码）；声音存 FLAC、抽样帧存 FFV1，各自解回来核对过才收。
 * 同一指纹已有段签、字节 sha 变了（重渲）：旧的记进 历史.jsonl 并自查。不过闸，调用方过
 */
export const 出段签 = async (母版: string, o: { 段键: string; 指纹: string; 级别: string | null; 派生: 段签['派生']; 作品?: string }): Promise<{ 签: 段签; 自查: 自查 | null }> => {
  const 作品 = o.作品 ?? 作品名();
  const dir = 段签目录(o.段键, o.指纹, 作品);
  fs.mkdirSync(dir, { recursive: true });
  const st = fs.statSync(母版);
  const 字节sha = await 文件sha(母版);
  const { 签名 } = await 扫母版(母版);
  const ffmpeg = 配置('ffmpeg');
  const 临时: string[] = [];
  try {
    let 声音: 段签['声音'] = null;
    if (有音轨(母版)) {
      const tmp = 临时名(dir, 声音文件名);
      临时.push(tmp);
      await 跑(低优先级([ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', 母版, '-map', '0:a:0', '-c:a', 'flac', tmp]), { 安静: true });
      const h = crypto.createHash('sha256');
      for await (const c of 音频流(tmp)) h.update(c);
      const pcm = h.digest('hex');
      if (pcm !== 签名.音频sha) throw new Error(`${母版} 的声音存成 FLAC 再解回来对不上（PCM sha ${pcm.slice(0, 12)}，母版 ${签名.音频sha?.slice(0, 12)}）`);
      声音 = { 文件: 声音文件名, sha: await 文件sha(tmp), 大小: fs.statSync(tmp).size };
    }

    const 帧们 = 抽样帧(签名.帧数, 默认间隔);
    const 抽 = 临时名(dir, 抽样文件名);
    临时.push(抽);
    await 写抽样(母版, 签名.帧数, 默认间隔, 抽);
    const 签哈希 = 签名.帧.map((f) => f.哈希);
    const 抽哈希: string[] = [];
    for await (const rgb of 抽样流(抽, 帧们, 帧们, 签名.宽, 签名.高)) 抽哈希.push(sha(rgb));
    if (抽哈希.join() !== 签哈希.join()) throw new Error(`${母版} 的抽样帧存成 FFV1 再解回来和签名对不上（${抽哈希.length}/${签哈希.length} 帧）`);
    if (视频信息(抽).帧数 !== 帧们.length) throw new Error(`${抽} 帧数不对`);
    const 首尾 = { 宽: 小图宽, 高: 小图高, 首帧: 灰度帧(抽, 0).toString('base64'), 末帧: 灰度帧(抽, 帧们.length - 1).toString('base64') };

    const 签: 段签 = {
      版本: 段签版本, 作品, 段: o.段键, 指纹: o.指纹, 级别: o.级别,
      母版: { 字节sha, 大小: st.size, 改于: st.mtimeMs },
      签名, 声音,
      抽样: { 文件: 抽样文件名, sha: await 文件sha(抽), 大小: fs.statSync(抽).size, 帧: 帧们 },
      首尾, 派生于: new Date().toISOString(), 派生: o.派生,
    };
    const 旧 = 读段签(o.段键, o.指纹, 作品);
    let 查: 自查 | null = null;
    if (旧 && 旧.母版.字节sha !== 字节sha) {
      查 = 比签名(旧.签名, 签名);
      const 存于 = 存旧(旧, dir);
      fs.appendFileSync(path.join(dir, 历史文件名), JSON.stringify({ 记于: 签.派生于, 上次字节sha: 旧.母版.字节sha, 上次派生于: 旧.派生于, 这次字节sha: 字节sha, ...查, 存于 }) + '\n', 'utf8');
    }
    if (声音) fs.renameSync(临时[0]!, path.join(dir, 声音文件名));
    fs.renameSync(抽, path.join(dir, 抽样文件名));
    原子写(path.join(dir, 签文件名), JSON.stringify(签, null, 1) + '\n');
    return { 签, 自查: 查 };
  } finally {
    for (const f of 临时) fs.rmSync(f, { force: true });
  }
};

/**
 * 母版原地转码之后调（转码那一步负责先有段签、再转码、再调这里）：段签记的母版改成转码后的字节，签名、抽样帧、声音不动
 * （09-补充-能不能用压缩版.md：验收用转码前从 CRF1 抽的无损抽样帧）。要求段签齐全、是 原字节sha 那份母版派生的，
 * 转码后尺寸帧数一样、声音 PCM 和签名一样；不然抛错，不改。不过闸（解声音要过放行闸，调用方过）
 */
export const 记转码 = async (段键: string, 指纹: string, 新母版: string, o: { 原字节sha: string; 作品?: string }): Promise<段签> => {
  const 作品 = o.作品 ?? 作品名();
  const 签 = 读段签(段键, 指纹, 作品);
  if (!段签齐(签)) throw new Error(`${段键}（${指纹.slice(0, 16)}）没有齐全的段签，转码前先 anim render ${段键} --只派生`);
  if (签.母版.字节sha !== o.原字节sha) throw new Error(`${段键} 的段签是字节 ${签.母版.字节sha.slice(0, 12)} 的母版派生的，转码前的母版是 ${o.原字节sha.slice(0, 12)}，对不上`);
  const v = 视频信息(新母版);
  if (v.宽 !== 签.签名.宽 || v.高 !== 签.签名.高 || v.帧数 !== 签.签名.帧数) throw new Error(`${新母版} 转码后是 ${v.宽}×${v.高} ${v.帧数} 帧，段签是 ${签.签名.宽}×${签.签名.高} ${签.签名.帧数} 帧`);
  if (签.签名.音频sha) {
    const h = crypto.createHash('sha256');
    if (有音轨(新母版)) for await (const c of 音频流(新母版)) h.update(c);
    if (h.digest('hex') !== 签.签名.音频sha) throw new Error(`${新母版} 转码后声音 PCM 和段签不一样（声音要原样拷）`);
  }
  const st = fs.statSync(新母版);
  const 新: 段签 = { ...签, 母版: { 字节sha: await 文件sha(新母版), 大小: st.size, 改于: st.mtimeMs, 转码自: 签.母版.转码自 ?? { 字节sha: 签.母版.字节sha, 大小: 签.母版.大小, 改于: 签.母版.改于 } } };
  const dir = 段签目录(段键, 指纹, 作品);
  fs.appendFileSync(path.join(dir, 历史文件名), JSON.stringify({ 记于: new Date().toISOString(), 转码: true, 上次字节sha: 签.母版.字节sha, 这次字节sha: 新.母版.字节sha }) + '\n', 'utf8');
  原子写(path.join(dir, 签文件名), JSON.stringify(新, null, 1) + '\n');
  return 新;
};

/** 接缝一头取自段签：首尾帧小图、声音.flac 里那一帧 */
export const 小图 = (签: 段签, 哪头: '首帧' | '末帧') => Buffer.from(签.首尾[哪头], 'base64');
