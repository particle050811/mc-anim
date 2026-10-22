// anim edit-package：照一次 anim film 的交付（manifest.json 记的母版、叠层、增益和 台词落点.json）出剪辑包，放在 <交付目录>/剪辑包/，出完写进剪映草稿。
// 照旧项目 导出剪辑包.py 的快路：画面 = 同一批母版 + 叠层、不带字幕，2K、CRF 32、每帧关键帧（用户 10-14 定，剪映里拖播放头哪帧都能直接解）；
// 声音 = 母版接起来、拉响度之前的整片声音，各句台词和字幕现算（字幕.ts），轨道、核对交给 剪辑包.py。
// 配乐、音效默认一条「去台词」；--拆音效 照段.ts 的 cue 出清单、一声一个片段（和成片差多少看 核对.tsv）。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根, 配置, 数据根 } from '../../环境/配置.ts';
import { 代码根 } from '../../环境/路径.ts';
import { 低优先级, 跑 } from '../../环境/子进程.ts';
import { 过放行闸 } from '../../闸/闸.ts';
import { 视频信息 } from '../../渲/探测.ts';
import { 选段 } from '../../清单/清单.ts';
import { 读资产锁, 解析资产 } from '../../资产/资产锁.ts';
import { 叠层滤镜, 展开段叠层 } from '../../合成/叠层.ts';
import { 排字幕, type 台词落点 } from '../../合成/字幕.ts';
import { 读单声道 } from '../../合成/音频.ts';
import type { 运行记录 } from '../../运行记录/记录.ts';
import { 写清单 } from './音效清单.ts';
import { 导入剪映 } from './剪映.ts';

const 宽 = 2560;
const 高 = 1440;
const 采样率 = 48000;
const 本目录 = path.join(代码根(), 'pipeline', '适配器', '剪映');

export type 交付段 = { 编号: string | null; 键: string; 指纹: string; 母版: string; 帧数: number; 全片起帧: number };
export type 交付manifest = {
  名: string;
  帧率: number;
  宽: number;
  高: number;
  总帧数: number;
  响度: { 增益dB: number };
  段: 交付段[];
  叠层: { 键: string; 段: string; 文件: string; 全片起帧: number }[];
  文件: Record<string, string>;
};

/** 给的是交付目录的名字（不是路径）就到 交付根 下找 */
export const 找交付目录 = (arg: string) => {
  const dir = fs.existsSync(arg) ? path.resolve(arg) : path.join(交付根(), arg);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`${dir} 里没有 manifest.json（要给 anim film 出的交付目录）`);
  return dir;
};

/** 剪辑包.py 的 段落 和 AI 配音行：段号用编号（6-1-2 这样），没有编号用段键 */
export const 段落表 = (m: 交付manifest) => m.段.map((s) => ({ 段: s.编号 ?? s.键, Composition: s.键, 全片起帧: s.全片起帧, 段内起帧: 0, 帧数: s.帧数 }));

/** 一句一个 AI 配音片段：接上段的后半截不另出，前半截不截到段尾（下一段接着放）；其余截到段尾（同旧 导出剪辑包.py 的 build_dialogue_lines） */
export const 台词行 = (m: 交付manifest, 落点们: 台词落点[], 取文件: (id: string) => string) => {
  const 段 = new Map(m.段.map((s) => [s.键, s]));
  const 接着放 = new Set(落点们.filter((a) => a.接上段).map((a) => a.id));
  return 落点们.flatMap((a) => {
    if (a.接上段) return [];
    const s = 段.get(a.段);
    if (!s) throw new Error(`台词落点 ${a.id} 的段 ${a.段} 不在 manifest 里`);
    return [{ id: a.id, 段: s.编号 ?? s.键, 字: a.字, 角色: a.角色, 文件: 取文件(a.配音), 起帧: a.文件头帧, 段尾: 接着放.has(a.id) ? null : s.全片起帧 + s.帧数 }];
  });
};

const 比字幕表 = (dir: string, 屏们: { 字: string; 起帧: number; 止帧: number }[], 记录: 运行记录) => {
  const file = path.join(dir, '字幕表.tsv');
  if (!fs.existsSync(file)) return;
  const 旧 = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t')).filter((r) => r[4]).map((r) => `${r[3]}\t${r[4]}\t${r[5]}`);
  const 新 = 屏们.map((p) => `${p.字}\t${p.起帧}\t${p.止帧}`);
  if (旧.join('\n') !== 新.join('\n')) 记录.记('警告', `现算的字幕和成片的字幕表对不上（表 ${旧.length} 屏、现算 ${新.length} 屏），台词或配音在出成片以后改过？`);
};

const 画面 = async (m: 交付manifest, 出: string) => {
  const ffmpeg = 配置('ffmpeg');
  const fps = m.帧率;
  const 输入 = m.段.flatMap((s) => ['-i', s.母版]);
  const 滤镜 = m.段.map((s, k) => `[${k}:v]trim=start_frame=0:end_frame=${s.帧数},setpts=PTS-STARTPTS,scale=${m.宽}:${m.高}:flags=lanczos,setsar=1,fps=${fps}[v${k}]`);
  滤镜.push(`${m.段.map((_, k) => `[v${k}]`).join('')}concat=n=${m.段.length}:v=1:a=0[cat]`);
  const 段 = new Map(m.段.map((s) => [s.键, s]));
  const 层们 = m.叠层.map((l) => 展开段叠层(l.文件, 视频信息(l.文件).帧数, 段.get(l.段)!.帧数, l.全片起帧));
  const [层输入, 层滤镜, 出标签] = 叠层滤镜(层们, m.段.length, 'cat', fps);
  if (层滤镜) 滤镜.push(层滤镜);
  滤镜.push(`[${出标签}]scale=${宽}:${高}:flags=lanczos[out]`);
  const 写入中 = 出.replace(/\.mp4$/, '.写入中.mp4');
  console.log(`== 画面：${m.段.length} 段母版、叠 ${层们.length} 层，压成 2K 每帧关键帧`);
  await 过放行闸(() =>
    跑(
      低优先级([
        ffmpeg, '-v', 'error', '-y', ...输入, ...层输入, '-filter_complex', 滤镜.join(';'), '-map', '[out]', '-an',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-g', '1', '-keyint_min', '1', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', 写入中,
      ]),
    ),
  );
  const n = 视频信息(写入中).帧数;
  if (n !== m.总帧数) throw new Error(`剪辑包画面 ${n} 帧，manifest 是 ${m.总帧数} 帧`);
  fs.renameSync(写入中, 出);
};

/** 拉响度之前的整片声音：和 成片.ts 一样按样本截、接（32 位浮点，减台词时不多一层量化） */
const 未拉响度 = async (m: 交付manifest, 出: string) => {
  const 每帧样本 = 采样率 / m.帧率;
  const 滤镜 = m.段.map((s, k) => `[${k}:a]atrim=start_sample=0:end_sample=${s.帧数 * 每帧样本},asetpts=PTS-STARTPTS,aresample=${采样率},aformat=channel_layouts=stereo[a${k}]`);
  滤镜.push(`${m.段.map((_, k) => `[a${k}]`).join('')}concat=n=${m.段.length}:v=0:a=1[a]`);
  await 跑(低优先级([配置('ffmpeg'), '-v', 'error', '-y', ...m.段.flatMap((s) => ['-i', s.母版]), '-filter_complex', 滤镜.join(';'), '-map', '[a]', '-c:a', 'pcm_f32le', 出]));
};

export const uv带numpy = (script: string, args: string[]) => ['uv', 'run', '-q', '--no-project', '--with', 'numpy', 'python', path.join(本目录, script), ...args];
export const py环境 = () => ({ ...process.env, ANIM_FFMPEG: 配置('ffmpeg'), ANIM_FFPROBE: 配置('ffprobe') });

export const 出剪辑包 = async (交付目录: string, opts: { 拆音效?: boolean; 重做画面?: boolean; 不导入?: boolean; 记录: 运行记录 }) => {
  const dir = 找交付目录(交付目录);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as 交付manifest;
  const 缺 = [...m.段.map((s) => s.母版), ...m.叠层.map((l) => l.文件)].filter((f) => !fs.existsSync(f));
  if (缺.length) throw new Error(`这次成片用的母版或叠层不在了（缓存被清过？）：${缺.join('、')}；重出一次 anim film`);
  const 包 = path.join(dir, '剪辑包');
  const 工作 = path.join(包, '_工作');
  fs.mkdirSync(工作, { recursive: true });

  const 画面文件 = path.join(包, '画面.mp4');
  if (opts.重做画面 || !fs.existsSync(画面文件)) await 画面(m, 画面文件);
  const 未拉 = path.join(工作, '全片-未拉响度.wav');
  await 未拉响度(m, 未拉);

  // 台词和字幕：成片时写的落点 + 资产库里的配音，字幕和成片同一套排法现算
  const 锁 = 读资产锁();
  const 取文件 = (id: string) => 解析资产(id, 锁).文件;
  const 落点文件 = path.join(dir, '台词落点.json');
  const 落点们 = fs.existsSync(落点文件) ? (JSON.parse(fs.readFileSync(落点文件, 'utf8')) as 台词落点[]) : [];
  if (落点们.some((a) => !a.配音)) throw new Error(`${落点文件} 没记配音的资产 id（旧版 anim film 出的），重出一次成片`);
  const 全路径落点 = 落点们.map((a) => ({ ...a, 文件: 取文件(a.配音) }));
  const 读声音缓存 = new Map<string, Float32Array>();
  const { 屏们 } = 排字幕(全路径落点, m.总帧数, m.帧率, (f) => 读声音缓存.get(f) ?? 读声音缓存.set(f, 读单声道(f)).get(f)!);
  比字幕表(dir, 屏们, opts.记录);
  if (!落点们.length) opts.记录.记('警告', '这次成片没有台词落点（段.ts 里没有台词 cue），剪辑包没有 AI 配音和字幕');

  let 清单目录: string | null = null;
  if (opts.拆音效) {
    清单目录 = path.join(工作, '清单');
    const 段们 = await 选段(m.段.map((s) => s.键));
    const 计数 = await 写清单(段们, 清单目录);
    const 没有 = Object.entries(计数).filter(([, n]) => n === 0).map(([k]) => k);
    if (没有.length) opts.记录.记('警告', `这些段的 段.ts 没有音效、配乐 cue，剪辑包里它们没声音：${没有.join('、')}`);
  }

  const 输入 = {
    包目录: 包,
    项目名: m.名,
    帧率: m.帧率,
    总帧: m.总帧数,
    增益dB: m.响度.增益dB,
    画面: path.basename(画面文件),
    未拉响度: 未拉,
    参照: path.join(dir, m.文件.成片!),
    段落: 段落表(m),
    台词: 台词行(m, 全路径落点, 取文件),
    字幕屏: 屏们.map((p) => ({ 句: p.句, 字: p.字, 起帧: p.起帧, 止帧: p.止帧, 位置: p.位置, 依据: p.依据 })),
    清单目录,
    文件根: 清单目录 && 数据根(),
    来源: { 交付: dir, 成片: path.join(dir, m.文件.成片!), 拼接表: path.join(dir, m.文件.拼接表!), 出法: `anim edit-package${opts.拆音效 ? ' --拆音效' : ''}` },
  };
  const 输入文件 = path.join(工作, '输入.json');
  fs.writeFileSync(输入文件, JSON.stringify(输入, null, 1));
  await 跑(低优先级(uv带numpy('剪辑包.py', [输入文件])), { env: py环境() });
  fs.rmSync(工作, { recursive: true, force: true });
  opts.记录.产物.push(包);

  // 出完包直接写进剪映草稿；写不进去不算剪辑包失败
  if (!opts.不导入) {
    try {
      await 导入剪映(包);
    } catch (e) {
      opts.记录.记('警告', `剪辑包出好了，没写进剪映：${(e as Error).message.split('\n')[0]}（单独跑 anim jianying export ${包} 看原因）`);
    }
  }
  return 包;
};
