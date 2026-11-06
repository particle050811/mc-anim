// 段签：每段渲完从切片派生一份小件（设计见 预览/1030-1755-母版管线重设计/01-推荐方案.md 第四节 A）：verify 的签名、首尾帧小图、无损声音。
//   段签/<作品>/<段键>/<画面指纹前 16 位>/
//     签.json    切片（mp4）和声音（wav）的字节 sha、大小、改于；verify 的签名（扫母版 算的那份：抽样帧 sha、16×9 块均值；声音 sha/响度/起音取自 wav）；首尾帧 160×90 灰度（接缝用）
//     声音.flac  wav 的 PCM 无损（解回来的 PCM sha 要等于签名里的 音频sha 才收）
//     历史.jsonl 同一指纹重渲：上一份的字节 sha 和自查结论
//     历史/<上一份切片字节 sha 前 16 位>/  重渲前那一套（签.json、声音.flac）原样挪进来
// 版本 3（11-06 起，决策/0014）：母版 = 切片 mp4，签名直接从它算（切片就是渲染出来的原样，没有转码这一步了）、声音从 wav 算。
// 版本 1、2 是 CRF1 时代的（母版 .mkv，转码过的记 转码自、存法），照读：补交付、认可参考找旧版还看它们；版本 1 的 抽样.mkv 没人用了，anim cache gc 回收。
// 同一指纹重渲可能变（换机器、驱动都会；同机的随机来源 10-31 修掉一个，见 docs/渲染性能.md）：自查比抽样帧 sha，不一样再比块均值（阈值.toml 的 块均值容差），超了算「重渲漂移」，要对这段跑 verify。
// 签.json 最后原子写，有它就是一整套；旧的一套只挪不删，不删切片。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 配置, 段签目录 } from '../环境/配置.ts';
import { 作品名 } from '../环境/作品.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 登记临时文件 } from '../闸/收尾.ts';
import { 有音轨 } from '../渲/探测.ts';
import { 原子写 } from '../渲/母版.ts';
import { 音频流 } from '../验收/帧流.ts';
import { 比块均值, 读阈值 } from '../验收/比较.ts';
import { 扫母版 } from '../验收/验收.ts';
import type { 签名 } from '../验收/认可.ts';
import { 分段计时, type 阶段记录 } from '../运行记录/阶段.ts';

export const 段签版本 = 3;
/** 还认的旧版本：1、2 是 CRF1 时代的（见文件头），1 多一个 抽样（抽样.mkv） */
const 认的版本 = new Set([1, 2, 3]);
export const 签文件名 = '签.json';
export const 声音文件名 = '声音.flac';
export const 抽样文件名 = '抽样.mkv';
export const 历史文件名 = '历史.jsonl';
export const 历史目录名 = '历史';
export const 小图宽 = 160;
export const 小图高 = 90;

export type 段签 = {
  版本: 1 | 2 | 3;
  作品: string;
  段: string;
  /** 画面指纹 */
  指纹: string;
  /** 版本 3：配的声音指纹（wav 那份） */
  声音指纹?: string;
  级别: string | null;
  /** 切片（版本 1、2 是母版）的样子：大小、改于对得上就当字节没变，不重算 sha。版本 1、2 转码过的：母版 是压缩母版那份、存法 是怎么转的，签名是从 转码自（CRF1）算的 */
  母版: 母版样子 & { 转码自?: 母版样子; 存法?: { 标签?: string } };
  /** 版本 3：声音那份 wav 的样子 */
  声音源?: 母版样子;
  签名: 签名;
  /** 没有声音是 null */
  声音: { 文件: string; sha: string; 大小: number } | null;
  /** 只有版本 1 有：抽样帧的无损 FFV1（11-02 起不用了） */
  抽样?: { 文件: string; sha: string; 大小: number; 帧: number[] };
  /** 首尾帧 160×90 灰度（base64），接缝.ts 判首帧重复用 */
  首尾: { 宽: number; 高: number; 首帧: string; 末帧: string };
  派生于: string;
  派生: '渲染' | '回填' | '补';
  /** anim 认指纹 登记的：这个指纹没渲过，母版和这份段签沿用 自 那个指纹的（决策/0013）；同一指纹真渲一次就照「重渲」换掉，这套挪进 历史/ */
  沿用?: 沿用记录;
};

/** 自：直接沿用的那个指纹；原渲：真渲出这份母版的指纹（连着认过几次也指到头）；帧：比过的帧；比法：哪种比法、哪套门槛 */
export type 沿用记录 = { 自: string; 原渲: string; 理由: string; 帧: number[]; 比法: string; 于: string; 提交: string };

export type 母版样子 = { 字节sha: string; 大小: number; 改于: number };

export type 自查 = { 结论: '同画面' | '容差内' | '漂移'; 说明: string };

export const 签路径 = (段键: string, 指纹: string, 作品 = 作品名()) => path.join(段签目录(段键, 指纹, 作品), 签文件名);

/** 读段签；没有、版本不认识、指纹对不上都是 null */
export const 读段签 = (段键: string, 指纹: string, 作品 = 作品名()): 段签 | null => {
  const f = 签路径(段键, 指纹, 作品);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as 段签;
    return 认的版本.has(j.版本) && j.指纹 === 指纹 ? j : null;
  } catch {
    return null;
  }
};

export const 段签文件 = (签: Pick<段签, '作品' | '段' | '指纹'>, 名: string) => path.join(段签目录(签.段, 签.指纹, 签.作品), 名);
export const 声音路径 = (签: 段签) => (签.声音 ? 段签文件(签, 签.声音.文件) : null);

export const 文件sha = async (file: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file)) h.update(c as Buffer);
  return h.digest('hex');
};

const 对得上样子 = async (样: 母版样子, 文件: string) => {
  if (!fs.existsSync(文件)) return false;
  const st = fs.statSync(文件);
  if (st.size !== 样.大小) return false;
  if (st.mtimeMs === 样.改于) return true;
  return (await 文件sha(文件)) === 样.字节sha;
};

/** 段签记的切片（版本 1、2 是母版，转码过的就是压缩母版那份）是不是这个文件：大小、改于一样就是；不一样再算字节 sha */
export const 对得上母版 = (签: 段签, 母版: string) => 对得上样子(签.母版, 母版);
/** 版本 3 段签记的声音是不是这份 wav */
export const 对得上声音源 = (签: 段签, wav: string) => (签.声音源 ? 对得上样子(签.声音源, wav) : Promise.resolve(false));
/** 段签是这一对切片、wav 派生的（版本 3、两样都对得上） */
export const 对得上切片 = async (签: 段签, 画面: string, 声音: string) => 签.版本 === 3 && (await 对得上母版(签, 画面)) && (await 对得上声音源(签, 声音));

/** 版本 1、2：段签是从哪份 CRF1 派生的（转码过的看 转码自） */
export const 原样子 = (签: 段签): 母版样子 => 签.母版.转码自 ?? 签.母版;
/** 段签是不是这份 CRF1 派生的 */
export const 对得上原母版 = (签: 段签, 原: string) => 对得上样子(原样子(签), 原);

/** 段签齐不齐：签.json 里登记的声音在（版本 1 的 抽样.mkv 不算，没人用了） */
export const 段签齐 = (签: 段签 | null): 签 is 段签 => !!签 && (!签.声音 || fs.existsSync(声音路径(签)!));

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

/** 重渲前的那一套挪进 历史/<字节 sha 前 16 位>/：先挪声音（版本 1 还有抽样），签.json 最后（中途断了，留下的签.json 指的文件不齐，下次照样重派生、接着挪） */
const 存旧 = (旧: 段签, dir: string) => {
  const 去 = path.join(dir, 历史目录名, 旧.母版.字节sha.slice(0, 16));
  fs.mkdirSync(去, { recursive: true });
  for (const 名 of [...(旧.声音 ? [旧.声音.文件] : []), ...(旧.抽样 ? [旧.抽样.文件] : []), 签文件名]) {
    const 从 = path.join(dir, 名);
    // 同一份字节的已经挪过一次（内容相同），留着那份
    if (fs.existsSync(从) && !fs.existsSync(path.join(去, 名))) fs.renameSync(从, path.join(去, 名));
  }
  return path.relative(dir, 去).split(path.sep).join('/');
};

/** 历史/ 里挪过去的各套段签和它们所在的目录（补交付找出片时那份声音、备参考找认可那一版） */
export const 读历史段签 = (段键: string, 指纹: string, 作品 = 作品名()): { 签: 段签; 目录: string }[] => {
  const 根 = path.join(段签目录(段键, 指纹, 作品), 历史目录名);
  if (!fs.existsSync(根)) return [];
  return fs.readdirSync(根).sort().flatMap((名) => {
    try {
      const 签 = JSON.parse(fs.readFileSync(path.join(根, 名, 签文件名), 'utf8')) as 段签;
      return 认的版本.has(签.版本) && 签.指纹 === 指纹 ? [{ 签, 目录: path.join(根, 名) }] : [];
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
 * 从切片和 wav 派生段签（只读这两样、只写段签目录）。签名用 扫母版（和 verify、accept 同一份代码），首尾帧小图在同一次解码里出；声音存 FLAC，解回来核对过才收。
 * 同一指纹已有段签、切片字节 sha 变了（重渲）：旧的记进 历史.jsonl 并自查。不过闸，调用方过
 */
export const 出段签 = async (画面: string, 声音源: string | null, o: { 段键: string; 指纹: string; 声音指纹?: string; 级别: string | null; 派生: 段签['派生']; 作品?: string; 计时?: { 收: 阶段记录[]; 标签: string } }): Promise<{ 签: 段签; 自查: 自查 | null }> => {
  const 作品 = o.作品 ?? 作品名();
  const dir = 段签目录(o.段键, o.指纹, 作品);
  fs.mkdirSync(dir, { recursive: true });
  const 样子 = async (f: string): Promise<母版样子> => {
    const st = fs.statSync(f);
    return { 字节sha: await 文件sha(f), 大小: st.size, 改于: st.mtimeMs };
  };
  const 点 = o.计时 ? 分段计时(o.计时.收, o.计时.标签) : () => {};
  const 母版 = await 样子(画面);
  const 声音样子 = 声音源 ? await 样子(声音源) : undefined;
  点('段签：算字节');
  const ffmpeg = 配置('ffmpeg');
  const 临时: string[] = [];
  const 撤们: (() => void)[] = [];
  const 记临时 = (f: string) => {
    临时.push(f);
    撤们.push(登记临时文件(f));
  };
  try {
    const 小图文件 = 临时名(dir, '首尾.gray');
    记临时(小图文件);
    const { 签名 } = await 扫母版(画面, { 首尾小图: 小图文件, 声音: 声音源 });
    const 小图们 = fs.readFileSync(小图文件);
    const 一张 = 小图宽 * 小图高;
    if (小图们.length !== (签名.帧数 > 1 ? 2 : 1) * 一张) throw new Error(`${画面} 的首尾帧小图只出了 ${小图们.length} 字节`);
    const 首尾 = { 宽: 小图宽, 高: 小图高, 首帧: 小图们.subarray(0, 一张).toString('base64'), 末帧: 小图们.subarray(小图们.length - 一张).toString('base64') };
    点('段签：扫切片');
    let 声音: 段签['声音'] = null;
    let 声音tmp: string | null = null;
    const 声源 = 声音源 ?? (有音轨(画面) ? 画面 : null);
    if (声源 && 签名.音频sha) {
      const tmp = (声音tmp = 临时名(dir, 声音文件名));
      记临时(tmp);
      await 跑(低优先级([ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', 声源, '-map', '0:a:0', '-c:a', 'flac', tmp]), { 安静: true });
      const h = crypto.createHash('sha256');
      for await (const c of 音频流(tmp)) h.update(c);
      const pcm = h.digest('hex');
      if (pcm !== 签名.音频sha) throw new Error(`${声源} 的声音存成 FLAC 再解回来对不上（PCM sha ${pcm.slice(0, 12)}，原来 ${签名.音频sha.slice(0, 12)}）`);
      声音 = { 文件: 声音文件名, sha: await 文件sha(tmp), 大小: fs.statSync(tmp).size };
    }
    点('段签：存声音');

    const 签: 段签 = {
      版本: 段签版本, 作品, 段: o.段键, 指纹: o.指纹, ...(o.声音指纹 ? { 声音指纹: o.声音指纹 } : {}), 级别: o.级别,
      母版, ...(声音样子 ? { 声音源: 声音样子 } : {}),
      签名, 声音,
      首尾, 派生于: new Date().toISOString(), 派生: o.派生,
    };
    const 旧 = 读段签(o.段键, o.指纹, 作品);
    let 查: 自查 | null = null;
    if (旧 && 旧.母版.字节sha !== 母版.字节sha) {
      查 = 比签名(旧.签名, 签名);
      const 存于 = 存旧(旧, dir);
      fs.appendFileSync(path.join(dir, 历史文件名), JSON.stringify({ 记于: 签.派生于, 上次字节sha: 旧.母版.字节sha, 上次派生于: 旧.派生于, 这次字节sha: 母版.字节sha, ...查, 存于 }) + '\n', 'utf8');
    }
    if (声音) fs.renameSync(声音tmp!, path.join(dir, 声音文件名));
    else fs.rmSync(path.join(dir, 声音文件名), { force: true });
    原子写(path.join(dir, 签文件名), JSON.stringify(签, null, 1) + '\n');
    点('段签：写入');
    return { 签, 自查: 查 };
  } finally {
    for (const f of 临时) fs.rmSync(f, { force: true });
    for (const 撤 of 撤们) 撤();
  }
};

/** 一段切片的段签（渲段.ts 渲完、取段签 补的时候调） */
export const 派生段签 = (r: { 段: { 键: string }; 画面: string; 声音: string; 画面指纹: { 指纹: string }; 声音指纹: { 指纹: string }; 参数: { inputProps: { 级别: string } } }, o: { 派生: 段签['派生']; 计时?: { 收: 阶段记录[]; 标签: string } }) =>
  出段签(r.画面, r.声音, { 段键: r.段.键, 指纹: r.画面指纹.指纹, 声音指纹: r.声音指纹.指纹, 级别: r.参数.inputProps.级别, 派生: o.派生, 计时: o.计时 });

/** 接缝一头取自段签：首尾帧小图、声音.flac 里那一帧 */
export const 小图 = (签: 段签, 哪头: '首帧' | '末帧') => Buffer.from(签.首尾[哪头], 'base64');
