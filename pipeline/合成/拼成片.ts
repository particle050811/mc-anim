// 拼成片：anim film 唯一的出片路（决策/0014）。缺的段先渲（渲/渲段.ts：每段已是成片的一截，叠层、字幕在段里，按成片参数压好），这里只接不重压（用户 11-05 定「母版 = 成片切片」）。
//   选的段要是清单里挨着的一串（单独一段、一个核对段也行），不挨着的先照样渲完，再拒绝接；
//   画面：ffmpeg concat 直接拷流（各段同一套编码参数、都从关键帧起）；
//   声音：各段的 wav 按编排帧率按样本截、接，整片一个固定增益拉到 −16 LUFS + 限幅，压 AAC 量真峰值，超了压低限幅重做（照旧 成片.ts）；
//   出到 <数据根>/交付/<UTC 月日-时分>-<名>/：成片、拼接表、字幕表、SRT、全片-未拉响度.flac、manifest.json；
//   --分享版 另从成片压一份 B 站 1080P60 AV1 档的（参数、文件名照旧 成片.ts，用户 11-05 定），只在要时加。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根, 配置 } from '../环境/配置.ts';
import { 提交状态, 相对代码根 } from '../环境/路径.ts';
import { 作品名 } from '../环境/作品.ts';
import { 低优先级, 跑, 跑出 } from '../环境/子进程.ts';
import { 全部段, type 段信息 } from '../清单/清单.ts';
import { 原子写 } from '../渲/母版.ts';
import { 渲染段们 } from '../渲/渲段.ts';
import { 成片档 } from '../渲/设置.ts';
import { 时长秒, 视频信息 } from '../渲/探测.ts';
import { utc时间, utc月日时分, type 运行记录 } from '../运行记录/记录.ts';
import { 分段计时 } from '../运行记录/阶段.ts';
import type { 渲染级别 } from '../../engine/段/设置值.ts';
import { 未拉响度文件, 拼未拉响度 } from './交付.ts';
import { 分享音频kbps, 压分享声音, 压分享版, 量响度 } from './成片.ts';
import { 排全片字幕 } from './段字幕.ts';
import { srt, 字幕表tsv } from './字幕.ts';

const 目标响度 = -16;
const 真峰值上限 = -1;
const 采样率 = 48000;

export const 拼成片 = async (段们: 段信息[], opts: { 级别: 渲染级别; 名: string; 范围: string[]; 重渲?: boolean; 分享版?: boolean; 记录: 运行记录 }) => {
  const 开始 = Date.now();
  const 全部 = await 全部段();
  const 点 = 分段计时(opts.记录.阶段, `film:${作品名()}/${opts.名}:${opts.级别}`);
  const 产物们 = await 渲染段们(全部, 段们, opts.级别, { 重渲: opts.重渲, 记录: opts.记录 });
  点('渲段');
  const 跳过 = 段们.filter((s) => !产物们.some((r) => r.段 === s));
  if (跳过.length) throw new Error(`${跳过.map((s) => s.键).join('、')} 没渲（本机没有区段包），接不成成片；别的段已渲好`);
  for (let k = 1; k < 产物们.length; k++) {
    const a = 产物们[k - 1]!;
    const b = 产物们[k]!;
    if (a.输出起帧 + a.输出帧数 !== b.输出起帧) throw new Error(`${a.段.键} 和 ${b.段.键} 在清单里不挨着，接不成一条（各段已渲好；要成片的话范围要是清单里连续的一串段，或者一段一段出）`);
  }
  const 编排fps = 段们[0]!.段.fps;
  if (段们.some((s) => s.段.fps !== 编排fps)) throw new Error('各段编排帧率不一样');
  const 档 = 成片档();
  const dir = path.join(交付根(), `${utc月日时分(开始)}-${opts.名}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了，不覆盖（过一分钟再出或换 --名）`);
  const 工作 = path.join(dir, '_工作');
  fs.mkdirSync(工作, { recursive: true });
  const ffmpeg = 配置('ffmpeg');

  // 声音
  const 未拉 = path.join(dir, 未拉响度文件);
  // 每段管到下一段的声音起点为止（原生段的 wav 是输出窗、兼容段的是编排窗；两种挨着时差不到一个输出帧，短了补静音，docs/决策/0015-原生60帧.md）
  const 样本数们 = 产物们.map((r, k) => Math.round(((产物们[k + 1]?.声音起秒 ?? r.声音止秒) - r.声音起秒) * 采样率));
  await 拼未拉响度(产物们.map((r) => r.声音), 样本数们, 未拉);
  const 原 = 量响度(未拉);
  const 静音 = !Number.isFinite(原.lufs) || 原.lufs < -70;
  if (静音) opts.记录.记('警告', `整片几乎没声音（${原.lufs} LUFS），不拉响度`);
  const 增益 = 静音 ? 0 : 目标响度 - 原.lufs;
  const 拉好 = path.join(工作, '全片声音.wav');
  const 成品音 = path.join(工作, '全片声音.m4a');
  let 余量 = 0.5;
  let 终 = 原;
  const 拉 = (余: number, 出: string) => {
    const limit = 10 ** ((真峰值上限 - 余) / 20);
    跑出([ffmpeg, '-v', 'error', '-y', '-i', 未拉, '-vn', '-af', `volume=${增益.toFixed(2)}dB,alimiter=limit=${limit.toFixed(4)}:attack=1:release=50:level=disabled:asc=0`, '-ar', String(采样率), '-c:a', 'pcm_s24le', 出]);
  };
  for (let i = 0; i < 4; i++) {
    拉(余量, 拉好);
    跑出([ffmpeg, '-v', 'error', '-y', '-i', 拉好, '-c:a', 'aac', '-b:a', '192k', 成品音]);
    终 = 量响度(成品音);
    console.log(`响度：原 ${原.lufs.toFixed(1)} LUFS → 加 ${增益.toFixed(1)} dB、限幅 ${(真峰值上限 - 余量).toFixed(1)} dBFS → ${终.lufs.toFixed(1)} LUFS、真峰值 ${终.真峰值.toFixed(1)} dBTP`);
    if (终.真峰值 <= 真峰值上限) break;
    余量 += 终.真峰值 - 真峰值上限 + 0.2;
  }
  点('声音');

  // 画面：直接拷流接起来，和声音封进一个 mp4
  const 表 = path.join(工作, '接.txt');
  fs.writeFileSync(表, 产物们.map((r) => `file '${r.画面.replace(/'/g, "'\\''")}'\n`).join(''));
  const 成片 = path.join(dir, `${opts.名}.mp4`);
  const 写入中 = path.join(工作, '成片.写入中.mp4');
  await 跑(低优先级([ffmpeg, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 表, '-i', 成品音, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', 写入中]));
  const 总帧数 = 产物们.reduce((a, r) => a + r.输出帧数, 0);
  const 出帧 = 视频信息(写入中).帧数;
  if (出帧 !== 总帧数) throw new Error(`成片 ${出帧} 帧，各段加起来是 ${总帧数} 帧`);
  fs.renameSync(写入中, 成片);
  点('接画面');

  let 分享: { kbps: number; MB: number; 真峰值: number; 限幅dBFS: number } | null = null;
  const 分享文件 = path.join(dir, `${opts.名}-分享版1080p60.mp4`);
  if (opts.分享版) {
    const 分享声音 = 压分享声音(拉, 余量, 工作);
    分享 = { ...(await 压分享版(成片, 分享声音.声音, 分享文件)), 真峰值: 量响度(分享文件).真峰值, 限幅dBFS: 分享声音.限幅dBFS };
    if (分享.真峰值 > 真峰值上限) opts.记录.记('警告', `分享版真峰值 ${分享.真峰值.toFixed(1)} dBTP，压低限幅 6 次还超过 ${真峰值上限}`);
    opts.记录.产物.push(分享文件);
    点('分享版');
  }

  // 表：拼接表（输出帧）、字幕表和 SRT（编排帧，换成本片从 0 起）
  原子写(path.join(dir, '拼接表.tsv'), '编号\t段\t画面指纹\t声音指纹\t帧数\t全片起帧\n' + 产物们.map((r) => `${r.段.编号 ?? ''}\t${r.段.键}\t${r.画面指纹.指纹.slice(0, 16)}\t${r.声音指纹.指纹.slice(0, 16)}\t${r.输出帧数}\t${r.输出起帧 - 产物们[0]!.输出起帧}\n`).join(''));
  const 字幕 = 排全片字幕(全部);
  const 片起 = 字幕.起帧.get(段们[0]!.键)!;
  const 片止 = 片起 + 段们.reduce((a, s) => a + s.段.帧数, 0);
  const 屏们 = 字幕.屏们.filter((p) => p.止帧 > 片起 && p.起帧 < 片止).map((p) => ({ ...p, 起帧: Math.max(0, p.起帧 - 片起), 止帧: Math.min(片止, p.止帧) - 片起 }));
  const 文件: Record<string, string> = { 成片: path.basename(成片), 拼接表: '拼接表.tsv', 未拉响度: 未拉响度文件 };
  if (分享) 文件.分享版 = path.basename(分享文件);
  if (屏们.length) {
    原子写(path.join(dir, '字幕表.tsv'), 字幕表tsv(屏们, 编排fps));
    原子写(path.join(dir, `${opts.名}.srt`), srt(屏们, 编排fps));
    Object.assign(文件, { 字幕表: '字幕表.tsv', SRT: `${opts.名}.srt` });
  }
  const manifest = {
    版本: 3,
    作品: 作品名(),
    名: opts.名,
    范围: opts.范围,
    级别: opts.级别,
    开始: utc时间(开始),
    完成: utc时间(),
    代码: 提交状态(),
    主机: 配置('主机'),
    成片档: 档.名,
    帧率: 档.fps,
    编排帧率: 编排fps,
    总帧数,
    时长秒: 时长秒(成片),
    响度: { 原LUFS: 原.lufs, 增益dB: Number(增益.toFixed(2)), 限幅dBFS: Number((真峰值上限 - 余量).toFixed(2)), 成片LUFS: 终.lufs, 真峰值dBTP: 终.真峰值 },
    段: 产物们.map((r) => ({ 编号: r.段.编号, 键: r.段.键, 段文件: 相对代码根(r.段.段文件), 画面指纹: r.画面指纹.指纹, 声音指纹: r.声音指纹.指纹, 帧数: r.输出帧数, 全片起帧: r.输出起帧 - 产物们[0]!.输出起帧, 编排帧数: r.段.段.帧数 })),
    字幕: { 屏数: 屏们.length },
    分享版: 分享 && { 视频kbps: 分享.kbps, 音频kbps: 分享音频kbps, MB: Number(分享.MB.toFixed(2)), 限幅dBFS: Number(分享.限幅dBFS.toFixed(2)), 真峰值dBTP: 分享.真峰值 },
    文件,
  };
  原子写(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(工作, { recursive: true, force: true });
  点('写表');
  opts.记录.产物.push(成片);
  console.log(`成片 ${成片}：${manifest.时长秒.toFixed(2)} 秒，${总帧数} 帧，${终.lufs.toFixed(1)} LUFS`);
  return { dir, 成片, manifest };
};
