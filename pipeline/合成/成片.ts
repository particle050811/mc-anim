// 合成整片：按清单顺序取各段当前指纹的母版，硬切接成一条，整片只压一遍。做法照旧项目 工具/合成第六章.py：
//   声音先单独按样本截、接，整片一个固定增益拉到 −16 LUFS + 限幅（不做动态压缩），压成 AAC 量真峰值，超了就压低限幅重做；
//   画面 trim/scale/concat 和压成片一遍做完。Mac 默认 videotoolbox q38，其他平台 x264 slower CRF 32（用户 10-15 定）。
// 过期的母版（和段声明的透明叠层）默认拒绝：--重渲过期 先渲，--允许过期 用同一渲染级别最近一份旧的并逐段写进 manifest。
// 叠层在下、字幕（按段.ts 的台词 cue 排，见 字幕.ts）在上，和画面一起压；接缝只查不改（接缝.ts）；--分享版 另压一份 50 MB 内的 720p。
// 声音和接缝读各段的段签（pipeline/段签/：声音.flac、首尾帧小图，缺了从 CRF1 当场派生），画面读 CRF12 母版（用户 10-30 定，渲/转码.ts；只有 CRF1 的旧母版先转存再用，同一指纹出同样的片）。
// 产出 <数据根>/交付/<UTC 月日-时分>-<名>/：成片、拼接表、接缝、字幕表、SRT、台词落点、同步表、字幕核对、全片-未拉响度.flac、manifest.json（v2，见 交付.ts）；
// 作品开了剪辑包（<作品根>/交付.toml）的，同一遍 ffmpeg 在叠完段叠层、叠字幕之前 split 出 剪辑包/画面.mp4。交付因此自足，edit-package 不再读母版。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根, 配置, isMac, 数据根 } from '../环境/配置.ts';
import { 提交状态, 相对代码根 } from '../环境/路径.ts';
import { 低优先级, 跑, 跑出, 试跑 } from '../环境/子进程.ts';
import { 叠层目录, 数据路径, 相对数据根 } from '../环境/配置.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 叠层键, 算全部段指纹, type 段指纹 } from '../指纹/指纹.ts';
import { 全部段, type 段信息 } from '../清单/清单.ts';
import { 读作品资产锁, 解析资产 } from '../资产/资产锁.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 叠层路径, 原母版路径, 历史指纹, 原子写, 最近同级别, 有母版, 现母版, 记用过 } from '../渲/母版.ts';
import { 备好母版 } from '../渲/转存.ts';
import { 叠层渲染参数, 渲染参数 } from '../渲/设置.ts';
import { 渲染叠层, 渲染母版 } from '../渲/渲.ts';
import { 时长秒, 视频信息 } from '../渲/探测.ts';
import { 判接缝, 母版端, 一帧声音, type 接缝判断, type 接缝端 } from './接缝.ts';
import { 剪辑画面编码, 剪辑画面宽, 剪辑画面高, 剪辑画面文件, 未拉响度文件, 拼未拉响度, 读交付设置, manifest版本 } from './交付.ts';
import { 取段签 } from '../段签/补.ts';
import { 声音路径, 小图, type 段签 } from '../段签/段签.ts';
import { 段签目录 } from '../环境/配置.ts';
import { 懒放行闸 } from '../闸/闸.ts';
import { 叠层滤镜, 展开段叠层, type 叠加层 } from './叠层.ts';
import { 读单声道 } from './音频.ts';
import { 核对开口, 排字幕, 字幕表tsv, srt } from './字幕.ts';
import { 画字幕卡 } from './字幕卡.ts';
import { 上一段于, 同步表, 算台词落点, 读台词表, 读音效起音 } from './台词落点.ts';
import { utc时间, utc月日时分, type 运行记录 } from '../运行记录/记录.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';

const 目标响度 = -16;
const 真峰值上限 = -1;
const 采样率 = 48000;

const 编码参数表: Record<string, string[]> = {
  h264_videotoolbox: ['-c:v', 'h264_videotoolbox', '-q:v', '38', '-profile:v', 'high'],
  libx264: ['-c:v', 'libx264', '-preset', 'slower', '-crf', '32', '-profile:v', 'high'],
};

export const 成片编码参数 = (级别: 渲染级别): string[] => {
  if (级别 === '预览') return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'];
  const 名 = 配置('编码器');
  const args = 编码参数表[名];
  if (!args) throw new Error(`编码器 ${名} 不认识，只能是 ${Object.keys(编码参数表).join('、')}（ANIM_VIDEO_ENCODER）`);
  return args;
};

export const 量响度 = (file: string) => {
  const r = 试跑([配置('ffmpeg'), '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(tail)?.[1]?.replace('-inf', '-Infinity'));
  const peak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(tail)?.[1]?.replace('-inf', '-Infinity'));
  if (r.退出码 !== 0 || Number.isNaN(lufs) || Number.isNaN(peak)) throw new Error(`量不出 ${file} 的响度：${r.stderr.slice(-300)}`);
  return { lufs, 真峰值: peak };
};

type 截 = { 段: 段信息; 指纹: string; 母版: string; 帧数: number; 过期: boolean; 全片起帧: number; 签: 段签 | null };

/** 每段取母版：当前指纹的；没有就按选项重渲或用旧的 */
const 取母版 = async (段们: 段信息[], 级别: 渲染级别, opts: { 允许过期?: boolean; 重渲过期?: boolean; 记录: 运行记录 }) => {
  const 参数 = 渲染参数(级别);
  const 指纹们: 段指纹[] = await 算全部段指纹(段们.map((s) => ({ 段: s, 渲染设置: 参数 })));
  const 缺 = 段们.filter((s, i) => !有母版(s.键, 指纹们[i]!.指纹));
  if (缺.length && opts.重渲过期) await 渲染母版(缺, 级别, { 记录: opts.记录 });
  const 截们: 截[] = [];
  let 起 = 0;
  for (const [i, s] of 段们.entries()) {
    let 指纹 = 指纹们[i]!.指纹;
    let 过期 = false;
    if (!有母版(s.键, 指纹)) {
      const 找 = opts.允许过期 ? 最近同级别(历史指纹(s.键), 级别, (h) => 现母版(s.键, h) ?? 原母版路径(s.键, h)) : null;
      const 旧 = 找?.旧;
      if (!旧) {
        const 别的 = 找?.别的级别.length ? `（只有${找.别的级别.join('、')}级的，不能接进${级别}级成片）` : '';
        const 提示 = opts.允许过期 ? `连${级别}级的旧母版也没有${别的}` : '加 --重渲过期 先渲，或 --允许过期 用旧母版';
        throw new Error(`${s.键} 没有当前指纹（${指纹.slice(0, 16)}）的母版：先 anim render ${s.键}，${提示}`);
      }
      指纹 = 旧.指纹;
      过期 = true;
      opts.记录.记('警告', `${s.键} 用的是过期母版 ${指纹.slice(0, 16)}`);
    }
    const 母版 = (await 备好母版(s.键, 指纹, 级别, { 记录: opts.记录 }))!;
    const { 帧数 } = 视频信息(母版);
    if (帧数 !== s.段.帧数) throw new Error(`${s.键} 的母版 ${帧数} 帧，段.ts 写的是 ${s.段.帧数} 帧`);
    截们.push({ 段: s, 指纹, 母版, 帧数, 过期, 全片起帧: 起, 签: null });
    起 += 帧数;
  }
  return 截们;
};

type 叠层截 = { 键: string; 指纹: string; 文件: string; 过期: boolean; 截: 截 };

/** 各段声明的透明叠层：和母版一样按指纹取，过期的按选项重渲或用旧的 */
const 取叠层 = async (截们: 截[], 级别: 渲染级别, opts: { 允许过期?: boolean; 重渲过期?: boolean; 记录: 运行记录 }) => {
  const 参数 = 叠层渲染参数(级别);
  const 各层 = 截们.flatMap((c) => (c.段.段.叠层 ?? []).map((l) => ({ 截: c, 叠层: l })));
  const 指纹们 = await 算全部段指纹(各层.map((x) => ({ 段: x.截.段, 渲染设置: 参数, 叠层: x.叠层 })));
  const 要 = 各层.map((x, i) => ({ 截: x.截, 键: 叠层键(x.截.段.键, x.叠层), 指纹: 指纹们[i]!.指纹 }));
  const 缺段 = [...new Set(要.filter((x) => !fs.existsSync(叠层路径(x.键, x.指纹))).map((x) => x.截.段))];
  if (缺段.length && opts.重渲过期) await 渲染叠层(缺段, 级别, { 记录: opts.记录 });
  const out: 叠层截[] = [];
  for (const x of 要) {
    let 指纹 = x.指纹;
    let 过期 = false;
    if (!fs.existsSync(叠层路径(x.键, 指纹))) {
      const 找 = opts.允许过期 ? 最近同级别(历史指纹(x.键, 叠层目录(x.键)), 级别, (h) => 叠层路径(x.键, h)) : null;
      const 旧 = 找?.旧;
      if (!旧) {
        const 别的 = 找?.别的级别.length ? `（只有${找.别的级别.join('、')}级的）` : '';
        throw new Error(`叠层 ${x.键} 没有当前指纹（${指纹.slice(0, 16)}）的渲染：先 anim render ${x.截.段.键}，${opts.允许过期 ? `连${级别}级的旧的也没有${别的}` : '或加 --重渲过期 / --允许过期'}（不要叠层就 --不叠层）`);
      }
      指纹 = 旧.指纹;
      过期 = true;
      opts.记录.记('警告', `叠层 ${x.键} 用的是过期的 ${指纹.slice(0, 16)}`);
    }
    记用过(叠层目录(x.键), 指纹);
    out.push({ 键: x.键, 指纹, 文件: 叠层路径(x.键, 指纹), 过期, 截: x.截 });
  }
  return out;
};

/** 各段的段签：缺了、或和 CRF1 字节对不上就当场从 CRF1 派生（要解码，过放行闸）；派生失败、只剩 CRF12 又没段签的只报警，这段的声音、接缝退回读母版（CRF12 里的 PCM 是原样拷的） */
const 取段签们 = async (截们: 截[], 级别: 渲染级别, 记录: 运行记录) => {
  const 等放行 = 懒放行闸();
  for (const c of 截们) {
    try {
      c.签 = await 取段签(c.段.键, c.指纹, 级别, { 等放行, 记录 });
    } catch (e) {
      记录.记('警告', `${c.段.键} 的段签派生不出来（${(e as Error).message.split('\n')[0]}），声音、接缝读母版`);
    }
  }
};

/** 接缝一头：有段签读首尾帧小图和 声音.flac（和母版逐位相同），没有读母版 */
const 接缝头 = (c: 截, 哪头: '首帧' | '末帧'): 接缝端 => {
  const 帧 = 哪头 === '首帧' ? 0 : c.帧数 - 1;
  const 签 = c.签;
  if (!签) return 母版端(c.母版, 帧);
  return { 灰度: () => 小图(签, 哪头), 声音: (n) => 一帧声音(声音路径(签) ?? c.母版, 帧, n) };
};

// 判过的接缝记在 cache/接缝.json 里不再判。键用两段母版的字节 sha（段签里记的；同一指纹重渲字节变了会重判），没段签的用相对数据根的母版路径
const 查接缝 = (截们: 截[], 每帧样本: number, 记录: 运行记录) => {
  const 记忆文件 = 数据路径('cache', '接缝.json');
  const 相对 = (f: string) => path.relative(数据路径(), f).split(path.sep).join('/');
  let 记忆: Record<string, 接缝判断> = {};
  try {
    记忆 = JSON.parse(fs.readFileSync(记忆文件, 'utf8'));
  } catch {
    // 没有或坏了就重判
  }
  const 结果: { 前: string; 后: string; 判断: 接缝判断 }[] = [];
  for (let k = 1; k < 截们.length; k++) {
    const a = 截们[k - 1]!;
    const b = 截们[k]!;
    const key = `${a.签?.母版.字节sha ?? 相对(a.母版)}|${a.帧数 - 1}|${b.签?.母版.字节sha ?? 相对(b.母版)}|0`;
    记忆[key] ??= 判接缝(接缝头(a, '末帧'), 接缝头(b, '首帧'), 每帧样本);
    结果.push({ 前: a.段.键, 后: b.段.键, 判断: 记忆[key]! });
    if (记忆[key] === '首帧重复') 记录.记('警告', `接缝 ${a.段.键} → ${b.段.键}：后一段首帧和前一段末帧画面、声音都重复（两帧都留）`);
  }
  原子写(记忆文件, JSON.stringify(记忆, null, 1) + '\n');
  console.log(`接缝 ${结果.length} 处，首帧重复 ${结果.filter((x) => x.判断 === '首帧重复').length} 处（只报警，不丢帧）`);
  return 结果;
};

// 分享版（用户 10-15 定）：从成片再压，720p、x264 slow 两遍，视频约 760 kbps + AAC 96k，50 MB 以内；超了按比例降码率重压，最多 3 次。
// 真峰值只量、记进 manifest，超 −1 dBTP 报警不重做：96k 的超出是 AAC 编码噪声，压低限幅或增益重压实测不降反升（第 6、7 章 −0.8 dBTP）
const 分享上限MB = 50;
const 分享视频kbps = 760;
const 分享音频kbps = 96;
const 压分享版 = async (成片: string, 声音: string, 出: string, 工作: string, 时长: number) => {
  const ffmpeg = 配置('ffmpeg');
  let kbps = Math.min(分享视频kbps, Math.floor((分享上限MB * 8e3 * 0.97) / 时长 - 分享音频kbps));
  const log = path.join(工作, '分享版两遍');
  const 视频 = ['-map', '0:v', '-vf', 'scale=1280:720:flags=lanczos,setsar=1', '-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p'];
  for (let i = 0; i < 3; i++) {
    await 跑(低优先级([ffmpeg, '-v', 'error', '-y', '-i', 成片, ...视频, '-b:v', `${kbps}k`, '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', '-']));
    await 跑(
      低优先级([ffmpeg, '-v', 'error', '-y', '-i', 成片, '-i', 声音, ...视频, '-map', '1:a', '-b:v', `${kbps}k`, '-pass', '2', '-passlogfile', log, '-c:a', 'aac', '-b:a', `${分享音频kbps}k`, '-movflags', '+faststart', 出]),
    );
    const mb = fs.statSync(出).size / 1e6;
    console.log(`分享版 ${mb.toFixed(1)} MB（视频 ${kbps} kbps）`);
    if (mb <= 分享上限MB) return { kbps, MB: mb };
    kbps = Math.floor(((kbps * 分享上限MB) / mb) * 0.97);
  }
  throw new Error(`分享版压了 3 次还超过 ${分享上限MB} MB`);
};

export const 合成成片 = async (
  段们: 段信息[],
  opts: { 级别: 渲染级别; 名: string; 范围: string[]; 允许过期?: boolean; 重渲过期?: boolean; 不叠层?: boolean; 不叠字幕?: boolean; 分享版?: boolean; 记录: 运行记录 },
) => {
  const 开始 = Date.now();
  const fps = 段们[0]!.段.fps;
  if (段们.some((s) => s.段.fps !== fps)) throw new Error(`各段帧率不一样：${段们.map((s) => `${s.键} ${s.段.fps}`).join('、')}`);
  const 每帧样本 = 采样率 / fps;
  if (!Number.isInteger(每帧样本)) throw new Error(`帧率 ${fps} 下每帧不是整数个样本`);
  // 同步表要读资产锁里的字节（音效起音）：公开仓库 clone 下来、母版都在别处渲好的，也先把随仓库的字节补进数据根
  补字节并报(作品根(), 数据根());
  const 截们 = await 取母版(段们, opts.级别, opts);
  await 取段签们(截们, opts.级别, opts.记录);
  const 叠层们 = opts.不叠层 ? [] : await 取叠层(截们, opts.级别, opts);
  const 总帧数 = 截们.reduce((a, c) => a + c.帧数, 0);
  const [宽, 高] = opts.级别 === '预览' ? [1280, 720] : [2560, 1440];
  const 接缝们 = 查接缝(截们, 每帧样本, opts.记录);

  // 字幕：段.ts 的台词 cue → 落点 → 排时间；不叠字幕时照样排、出表和 SRT
  const 锁 = 读作品资产锁(作品根());
  const 读声音缓存 = new Map<string, Float32Array>();
  const 读声音 = (f: string) => 读声音缓存.get(f) ?? 读声音缓存.set(f, 读单声道(f)).get(f)!;
  const 有台词 = 截们.some((c) => c.段.段.声音?.some((x) => x.台词 !== undefined));
  const 落点们 = 有台词 ? 算台词落点(截们, 读台词表(), (id) => 解析资产(id, 锁).文件, 上一段于(await 全部段())) : [];
  const 字幕 = 排字幕(落点们, 总帧数, fps, 读声音);
  if (落点们.length) console.log(`字幕：${字幕.句们.length} 句、${字幕.屏们.length} 屏${opts.不叠字幕 ? '（只排不叠）' : ''}`);
  else opts.记录.记('警告', '这些段的 段.ts 里没有台词 cue，成片没有字幕');

  const dir = path.join(交付根(), `${utc月日时分(开始)}-${opts.名}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了，不覆盖（过一分钟再出或换 --名）`);
  const 工作 = path.join(dir, '_工作');
  fs.mkdirSync(工作, { recursive: true });
  const ffmpeg = 配置('ffmpeg');
  const 输入 = 截们.flatMap((c) => ['-i', c.母版]);
  const 剪辑包 = 读交付设置(作品根()).剪辑包;

  // 叠层们（段叠层在下、字幕卡在上）
  const 段层们: 叠加层[] = 叠层们.map((l) => {
    const 层帧 = 视频信息(l.文件);
    if (层帧.宽 !== 宽 || 层帧.高 !== 高) throw new Error(`叠层 ${l.键} 是 ${层帧.宽}×${层帧.高}，成片是 ${宽}×${高}（叠层要按成片的级别渲）`);
    return 展开段叠层(l.文件, 层帧.帧数, l.截.帧数, l.截.全片起帧);
  });
  const 卡层们: 叠加层[] = [];
  if (!opts.不叠字幕 && 字幕.屏们.length) {
    const 卡目录 = path.join(工作, '字幕卡');
    fs.mkdirSync(卡目录, { recursive: true });
    const 卡 = new Map<string, { 文件: string; x: number; y: number }>();
    for (const p of 字幕.屏们) {
      const key = `${p.位置}\u0000${p.字}`;
      if (!卡.has(key)) {
        const c = 画字幕卡(p.字, p.位置, 宽, 高);
        const 文件 = path.join(卡目录, `${String(卡.size).padStart(3, '0')}.png`);
        fs.writeFileSync(文件, c.png);
        卡.set(key, { 文件, x: c.x, y: c.y });
      }
      const c = 卡.get(key)!;
      卡层们.push({ 文件: c.文件, 起帧: p.起帧, 帧数: p.止帧 - p.起帧, x: c.x, y: c.y, 静图: true, 取自帧: 0 });
    }
  }

  const 层们 = [...段层们, ...卡层们];

  // 声音：各段 声音.flac（没段签的读母版）按样本截、接，存成交付里的 全片-未拉响度.flac（edit-package 用）
  const 未拉 = path.join(dir, 未拉响度文件);
  console.log('== 拼声音');
  await 拼未拉响度(截们.map((c) => (c.签 && 声音路径(c.签)) ?? c.母版), { 段: 截们, 帧率: fps }, 未拉);

  // 响度：固定增益 + 限幅，压成 AAC 后真峰值还超就压低限幅重做
  const 原 = 量响度(未拉);
  const 静音 = !Number.isFinite(原.lufs) || 原.lufs < -70;
  if (静音) opts.记录.记('警告', `整片几乎没声音（${原.lufs} LUFS），不拉响度`);
  const 增益 = 静音 ? 0 : 目标响度 - 原.lufs;
  const 拉好 = path.join(工作, '全片声音.wav');
  const 成品音 = path.join(工作, '全片声音.m4a');
  let 余量 = 0.5;
  let 终 = 原;
  for (let i = 0; i < 4; i++) {
    const limit = 10 ** ((真峰值上限 - 余量) / 20);
    跑出([ffmpeg, '-v', 'error', '-y', '-i', 未拉, '-vn', '-af', `volume=${增益.toFixed(2)}dB,alimiter=limit=${limit.toFixed(4)}:attack=1:release=50:level=disabled:asc=0`, '-ar', String(采样率), '-c:a', 'pcm_s24le', 拉好]);
    跑出([ffmpeg, '-v', 'error', '-y', '-i', 拉好, '-c:a', 'aac', '-b:a', '192k', 成品音]);
    终 = 量响度(成品音);
    console.log(`响度：原 ${原.lufs.toFixed(1)} LUFS → 加 ${增益.toFixed(1)} dB、限幅 ${(真峰值上限 - 余量).toFixed(1)} dBFS → ${终.lufs.toFixed(1)} LUFS、真峰值 ${终.真峰值.toFixed(1)} dBTP`);
    if (终.真峰值 <= 真峰值上限) break;
    余量 += 终.真峰值 - 真峰值上限 + 0.2;
  }

  // 画面：截、缩放、接，和声音一起压成片
  const 视频编码 = 成片编码参数(opts.级别);
  const 成片 = path.join(dir, `${opts.名}.mp4`);
  const 写入中 = path.join(工作, `${opts.名}.写入中.mp4`);
  const 视频滤镜 = 截们.map((c, k) => `[${k}:v]trim=start_frame=0:end_frame=${c.帧数},setpts=PTS-STARTPTS,scale=${宽}:${高}:flags=lanczos,setsar=1,fps=${fps}[v${k}]`);
  视频滤镜.push(`${截们.map((_, k) => `[v${k}]`).join('')}concat=n=${截们.length}:v=1:a=0[cat]`);
  let 层输入: string[];
  let 出标签: string;
  // 放子目录里：成片的临时名是 <名>.写入中.mp4，名可以是任何字，同一层会撞
  const 剪辑写入中 = path.join(工作, '剪辑包', '画面.写入中.mp4');
  if (剪辑包) fs.mkdirSync(path.dirname(剪辑写入中), { recursive: true });
  const 剪辑出: string[] = [];
  if (剪辑包) {
    // 段叠层叠完 split：一路接着叠字幕卡压成片，一路缩到 2K 压剪辑包画面（edit-package 原来从母版现做的同一套滤镜）
    const [段输入, 段滤镜, 段标签] = 叠层滤镜(段层们, 截们.length + 1, 'cat', fps, 'd');
    const [卡输入, 卡滤镜, 卡标签] = 叠层滤镜(卡层们, 截们.length + 1 + 段层们.length, 'pre', fps, 'c');
    if (段滤镜) 视频滤镜.push(段滤镜);
    视频滤镜.push(`[${段标签}]split=2[pre][pkgsrc]`, `[pkgsrc]scale=${剪辑画面宽}:${剪辑画面高}:flags=lanczos[pkg]`);
    if (卡滤镜) 视频滤镜.push(卡滤镜);
    层输入 = [...段输入, ...卡输入];
    出标签 = 卡标签;
    剪辑出.push('-map', '[pkg]', '-an', ...剪辑画面编码(fps), 剪辑写入中);
  } else {
    const [输入们, 滤镜, 标签] = 叠层滤镜(层们, 截们.length + 1, 'cat', fps);
    if (滤镜) 视频滤镜.push(滤镜);
    层输入 = 输入们;
    出标签 = 标签;
  }
  console.log(`== 拼画面、叠 ${层们.length} 层、压成片（${视频编码[1]}）${剪辑包 ? '，另出剪辑包画面（不带字幕）' : ''}`);
  await 跑(
    低优先级([
      ffmpeg, '-v', 'error', '-y', ...输入, '-i', 成品音, ...层输入, '-filter_complex', 视频滤镜.join(';'), '-map', `[${出标签}]`, '-map', `${截们.length}:a`,
      ...视频编码, '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', 写入中, ...剪辑出,
    ]),
  );
  const 出帧 = 视频信息(写入中).帧数;
  if (出帧 !== 总帧数) throw new Error(`成片 ${出帧} 帧，各段加起来是 ${总帧数} 帧（接缝丢帧或多帧）`);
  if (剪辑包) {
    const n = 视频信息(剪辑写入中).帧数;
    if (n !== 总帧数) throw new Error(`剪辑包画面 ${n} 帧，各段加起来是 ${总帧数} 帧`);
  }
  fs.renameSync(写入中, 成片);
  if (剪辑包) {
    fs.mkdirSync(path.join(dir, path.dirname(剪辑画面文件)), { recursive: true });
    fs.renameSync(剪辑写入中, path.join(dir, 剪辑画面文件));
  }

  const 拼接表 = path.join(dir, '拼接表.tsv');
  原子写(拼接表, '编号\t段\t指纹\t段内起帧\t段内止帧（不含）\t全片起帧\n' + 截们.map((c) => `${c.段.编号 ?? ''}\t${c.段.键}\t${c.指纹.slice(0, 16)}\t0\t${c.帧数}\t${c.全片起帧}\n`).join(''));
  const 文件: Record<string, string> = { 成片: path.basename(成片), 拼接表: path.basename(拼接表), 接缝: '接缝.tsv', 未拉响度: 未拉响度文件, ...(剪辑包 ? { 剪辑画面: '剪辑包/画面.mp4' } : {}) };
  原子写(path.join(dir, '接缝.tsv'), '前\t后\t判断\n' + 接缝们.map((x) => `${x.前}\t${x.后}\t${x.判断}\n`).join(''));
  let 开口最大差: number | null = null;
  let 同步: { 对上: number; 总: number } | null = null;
  if (落点们.length) {
    原子写(path.join(dir, '字幕表.tsv'), 字幕表tsv(字幕.屏们, fps, 字幕.接着放们));
    原子写(path.join(dir, `${opts.名}.srt`), srt(字幕.屏们, fps));
    原子写(path.join(dir, '台词落点.json'), JSON.stringify(落点们.map((a) => ({ ...a, 文件: path.basename(a.文件) })), null, 1) + '\n');
    Object.assign(文件, { 字幕表: '字幕表.tsv', SRT: `${opts.名}.srt`, 台词落点: '台词落点.json' });
  }
  if (截们.some((c) => c.段.段.声音?.length)) {
    const 混音 = 读单声道(拉好);
    if (字幕.句们.length) {
      const r = 核对开口(字幕.句们, 混音, fps, 读声音);
      原子写(path.join(dir, '字幕核对.tsv'), r.tsv);
      开口最大差 = Number.isNaN(r.最大差) ? null : r.最大差;
      文件.字幕核对 = '字幕核对.tsv';
      console.log(`字幕核对：字幕落点和成片里实际开口最多差 ${开口最大差?.toFixed(2) ?? '—'} 帧`);
      if (开口最大差 !== null && 开口最大差 > 1) opts.记录.记('警告', `有台词在成片里的开口和字幕落点差 ${开口最大差.toFixed(2)} 帧（> 1 帧），见 字幕核对.tsv`);
    }
    const r = 同步表(截们, 混音, fps, 读音效起音());
    原子写(path.join(dir, '同步表.tsv'), r.tsv);
    同步 = { 对上: r.对上, 总: r.总 };
    文件.同步表 = '同步表.tsv';
    console.log(`同步表：${r.总} 条 cue，成片声音里 ±1 帧内测到起音的 ${r.对上} 条`);
  }
  let 分享: { kbps: number; MB: number; 真峰值: number } | null = null;
  if (opts.分享版) {
    const 出 = path.join(dir, `${opts.名}-分享版${分享上限MB}MB.mp4`);
    分享 = { ...(await 压分享版(成片, 拉好, 出, 工作, 时长秒(成片))), 真峰值: 量响度(出).真峰值 };
    if (分享.真峰值 > 真峰值上限) opts.记录.记('警告', `分享版真峰值 ${分享.真峰值.toFixed(1)} dBTP，超过 ${真峰值上限}（AAC ${分享音频kbps}k 的编码噪声，成片本身没超）`);
    文件.分享版 = path.basename(出);
    opts.记录.产物.push(出);
  }
  const manifest = {
    版本: manifest版本,
    作品: 作品名(),
    名: opts.名,
    范围: opts.范围,
    级别: opts.级别,
    开始: utc时间(开始),
    完成: utc时间(),
    代码: 提交状态(),
    平台: `${process.platform}-${process.arch}`,
    主机: 配置('主机'),
    帧率: fps,
    宽,
    高,
    总帧数,
    时长秒: 时长秒(成片),
    编码: { 视频: 视频编码, 音频: ['-c:a', 'aac', '-b:a', '192k'] },
    响度: { 原LUFS: 原.lufs, 增益dB: Number(增益.toFixed(2)), 限幅dBFS: Number((真峰值上限 - 余量).toFixed(2)), 成片LUFS: 终.lufs, 真峰值dBTP: 终.真峰值 },
    // v2：段不记母版（按作品、段键、指纹现算，交付.ts），记母版字节 sha 和段签（相对数据根）；叠层写相对数据根；段 仍记短名（剪辑微调/读取调整.py 只认短名）
    段: 截们.map((c) => ({
      编号: c.段.编号, 键: c.段.键, 段文件: 相对代码根(c.段.段文件), 指纹: c.指纹, 过期: c.过期,
      字节sha: c.签?.母版.字节sha ?? null, 存法: c.签?.母版.存法?.标签 ?? null, 段签: c.签 ? 相对数据根(段签目录(c.段.键, c.指纹)) : null, 声音: c.签 && 声音路径(c.签) ? 相对数据根(声音路径(c.签)!) : null,
      帧数: c.帧数, 全片起帧: c.全片起帧,
    })),
    叠层: 叠层们.map((l) => ({ 键: l.键, 段: l.截.段.键, 指纹: l.指纹, 过期: l.过期, 文件: 相对数据根(l.文件), 全片起帧: l.截.全片起帧 })),
    字幕: { 句数: 字幕.句们.length, 屏数: 字幕.屏们.length, 叠了: !opts.不叠字幕 && 字幕.屏们.length > 0, 开口最大差帧: 开口最大差 },
    同步表: 同步,
    接缝: { 处数: 接缝们.length, 首帧重复: 接缝们.filter((x) => x.判断 === '首帧重复').map((x) => `${x.前} → ${x.后}`) },
    分享版: 分享 && { 视频kbps: 分享.kbps, 音频kbps: 分享音频kbps, MB: Number(分享.MB.toFixed(2)), 真峰值dBTP: 分享.真峰值 },
    文件,
  };
  原子写(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(工作, { recursive: true, force: true });
  opts.记录.产物.push(成片);
  console.log(`成片 ${成片}：${manifest.时长秒.toFixed(2)} 秒，${总帧数} 帧，${终.lufs.toFixed(1)} LUFS`);
  if (isMac && opts.级别 === '视频' && 配置('编码器') !== 'h264_videotoolbox') console.log('（这台是 Mac，但编码器设成了 ' + 配置('编码器') + '）');
  return { dir, 成片, manifest };
};
