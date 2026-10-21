// 合成整片：按清单顺序取各段当前指纹的母版，硬切接成一条，整片只压一遍。做法照旧项目 工具/合成第六章.py：
//   声音先单独按样本截、接，整片一个固定增益拉到 −16 LUFS + 限幅（不做动态压缩），压成 AAC 量真峰值，超了就压低限幅重做；
//   画面 trim/scale/concat 和压成片一遍做完。Mac 默认 videotoolbox q38，其他平台 x264 slower CRF 32（用户 10-15 定）。
// 过期的母版默认拒绝：--重渲过期 先渲，--允许过期 用最近一份旧母版并逐段写进 manifest。
// 产出 <数据根>/交付/<UTC 月日-时分>-<名>/：成片、拼接表.tsv、manifest.json。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根, 配置, isMac } from '../环境/配置.ts';
import { 提交状态, 相对代码根 } from '../环境/路径.ts';
import { 低优先级, 跑, 跑出, 试跑 } from '../环境/子进程.ts';
import { 算段指纹, type 段指纹 } from '../指纹/指纹.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 母版路径, 历史指纹, 原子写 } from '../渲/母版.ts';
import { 渲染参数 } from '../渲/设置.ts';
import { 渲染母版 } from '../渲/渲.ts';
import { 时长秒, 视频信息 } from '../渲/探测.ts';
import { utc时间, utc月日时分, type 运行记录 } from '../运行记录/记录.ts';
import type { 渲染级别 } from '../../content/设置值.ts';

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
  if (!args) throw new Error(`编码器 ${名} 不认识，只能是 ${Object.keys(编码参数表).join('、')}（SR_VIDEO_ENCODER）`);
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

type 截 = { 段: 段信息; 指纹: string; 母版: string; 帧数: number; 过期: boolean; 全片起帧: number };

/** 每段取母版：当前指纹的；没有就按选项重渲或用旧的 */
const 取母版 = async (段们: 段信息[], 级别: 渲染级别, opts: { 允许过期?: boolean; 重渲过期?: boolean; 记录: 运行记录 }) => {
  const 参数 = 渲染参数(级别);
  const 指纹们: 段指纹[] = [];
  for (const s of 段们) 指纹们.push(await 算段指纹(s, 参数));
  const 缺 = 段们.filter((s, i) => !fs.existsSync(母版路径(s.键, 指纹们[i]!.指纹)));
  if (缺.length && opts.重渲过期) await 渲染母版(缺, 级别, { 记录: opts.记录 });
  const 截们: 截[] = [];
  let 起 = 0;
  for (const [i, s] of 段们.entries()) {
    let 指纹 = 指纹们[i]!.指纹;
    let 过期 = false;
    if (!fs.existsSync(母版路径(s.键, 指纹))) {
      const 旧 = opts.允许过期 ? 历史指纹(s.键).find((h) => fs.existsSync(母版路径(s.键, h.指纹))) : undefined;
      if (!旧) {
        const 提示 = opts.允许过期 ? '连旧母版也没有' : '加 --重渲过期 先渲，或 --允许过期 用旧母版';
        throw new Error(`${s.键} 没有当前指纹（${指纹.slice(0, 16)}）的母版：先 sr render ${s.键}，${提示}`);
      }
      指纹 = 旧.指纹;
      过期 = true;
      opts.记录.记('警告', `${s.键} 用的是过期母版 ${指纹.slice(0, 16)}`);
    }
    const 母版 = 母版路径(s.键, 指纹);
    const { 帧数 } = 视频信息(母版);
    if (帧数 !== s.段.帧数) throw new Error(`${s.键} 的母版 ${帧数} 帧，段.ts 写的是 ${s.段.帧数} 帧`);
    截们.push({ 段: s, 指纹, 母版, 帧数, 过期, 全片起帧: 起 });
    起 += 帧数;
  }
  return 截们;
};

export const 合成成片 = async (段们: 段信息[], opts: { 级别: 渲染级别; 名: string; 范围: string[]; 允许过期?: boolean; 重渲过期?: boolean; 记录: 运行记录 }) => {
  const 开始 = Date.now();
  const fps = 段们[0]!.段.fps;
  if (段们.some((s) => s.段.fps !== fps)) throw new Error(`各段帧率不一样：${段们.map((s) => `${s.键} ${s.段.fps}`).join('、')}`);
  const 每帧样本 = 采样率 / fps;
  if (!Number.isInteger(每帧样本)) throw new Error(`帧率 ${fps} 下每帧不是整数个样本`);
  const 截们 = await 取母版(段们, opts.级别, opts);
  const 总帧数 = 截们.reduce((a, c) => a + c.帧数, 0);
  const [宽, 高] = opts.级别 === '预览' ? [1280, 720] : [2560, 1440];

  const dir = path.join(交付根(), `${utc月日时分(开始)}-${opts.名}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了，不覆盖（过一分钟再出或换 --名）`);
  const 工作 = path.join(dir, '_工作');
  fs.mkdirSync(工作, { recursive: true });
  const ffmpeg = 配置('ffmpeg');
  const 输入 = 截们.flatMap((c) => ['-i', c.母版]);

  // 声音：按样本截、接
  const 未拉 = path.join(工作, '全片-未拉响度.wav');
  const 音频滤镜 = 截们.map((c, k) => `[${k}:a]atrim=start_sample=0:end_sample=${c.帧数 * 每帧样本},asetpts=PTS-STARTPTS,aresample=${采样率},aformat=channel_layouts=stereo[a${k}]`);
  音频滤镜.push(`${截们.map((_, k) => `[a${k}]`).join('')}concat=n=${截们.length}:v=0:a=1[a]`);
  console.log('== 拼声音');
  await 跑(低优先级([ffmpeg, '-v', 'error', '-y', ...输入, '-filter_complex', 音频滤镜.join(';'), '-map', '[a]', '-c:a', 'pcm_s16le', 未拉]));

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
  视频滤镜.push(`${截们.map((_, k) => `[v${k}]`).join('')}concat=n=${截们.length}:v=1:a=0[v]`);
  console.log(`== 拼画面、压成片（${视频编码[1]}）`);
  await 跑(
    低优先级([ffmpeg, '-v', 'error', '-y', ...输入, '-i', 成品音, '-filter_complex', 视频滤镜.join(';'), '-map', '[v]', '-map', `${截们.length}:a`, ...视频编码, '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', 写入中]),
  );
  const 出帧 = 视频信息(写入中).帧数;
  if (出帧 !== 总帧数) throw new Error(`成片 ${出帧} 帧，各段加起来是 ${总帧数} 帧（接缝丢帧或多帧）`);
  fs.renameSync(写入中, 成片);

  const 拼接表 = path.join(dir, '拼接表.tsv');
  原子写(拼接表, '编号\t段\t指纹\t段内起帧\t段内止帧（不含）\t全片起帧\n' + 截们.map((c) => `${c.段.编号 ?? ''}\t${c.段.键}\t${c.指纹.slice(0, 16)}\t0\t${c.帧数}\t${c.全片起帧}\n`).join(''));
  const manifest = {
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
    段: 截们.map((c) => ({ 编号: c.段.编号, 键: c.段.键, 段文件: 相对代码根(c.段.段文件), 指纹: c.指纹, 过期: c.过期, 母版: c.母版, 帧数: c.帧数, 全片起帧: c.全片起帧 })),
    文件: { 成片: path.basename(成片), 拼接表: path.basename(拼接表) },
  };
  原子写(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(工作, { recursive: true, force: true });
  opts.记录.产物.push(成片);
  console.log(`成片 ${成片}：${manifest.时长秒.toFixed(2)} 秒，${总帧数} 帧，${终.lufs.toFixed(1)} LUFS`);
  if (isMac && opts.级别 === '视频' && 配置('编码器') !== 'h264_videotoolbox') console.log('（这台是 Mac，但编码器设成了 ' + 配置('编码器') + '）');
  return { dir, 成片, manifest };
};
