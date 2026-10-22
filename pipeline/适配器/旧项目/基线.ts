// M0 基线：在旧项目冻结提交（tag 冻结-1021）上渲 35 个正式段，存基准帧、音频和旧版各表，量渲染底噪，和已交付成片对照。
// 只调旧项目现成的工具（段清单.mjs、批量渲染.mjs、导出音效清单.mjs、台词落点.ts、同步表片段、字幕.py），不改它们；重任务过资源闸（锁目录和旧项目共用）。
// 用法：node pipeline/适配器/旧项目/基线.ts <步骤>，步骤按顺序：检查 → 清单 → 声音清单 → 渲 A → 渲 B → 抽 → 表 → 底噪 → 对照 [门槛]
//   对照 [门槛]：「差>16 的像素占比」超过多少算这一帧有差（缺省 0.001）。渲 A 是基线，渲 B 是同机同提交再渲一遍，只量底噪。已渲好的母版不重渲。
// 路径都从 anim 的配置取：旧项目 = ANIM_LEGACY，产物在 <数据根>/基线/（anim env 看取值）。数值比较在同目录 比较.py、表.py（numpy 由 uv 临时装）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 配置, 数据路径 } from '../../环境/配置.ts';
import { 低优先级, 跑, 跑出 } from '../../环境/子进程.ts';
import { 过放行闸, 过渲染闸 } from '../../闸/闸.ts';
import { 记耗时 } from '../../运行记录/记录.ts';

const TAG = '冻结-1021';
const 本目录 = import.meta.dirname;
const OLD = 配置('旧项目');
const LIB = path.join(OLD, '参考模型库');
const BASE = 数据路径('基线');
const TABLES = path.join(BASE, '_表');
const MASTERS = path.join(BASE, '_母版');
// 已交付成片 第6-7章-1020-1306 用的母版：合成第六章.py 的缓存，克隆一份（APFS 写时复制），旧缓存以后被重渲盖掉也还在
const DELIVERED_MASTERS = path.join(BASE, '_交付母版-1020');
const OLD_MASTER_CACHE = path.join(LIB, '工具/合成第六章/out/视频');
const DELIVERED_FILM = path.join(OLD, '正篇/06-古城寻卷/成片/第6-7章-1020-1306.mp4');
const DELIVERED_RUN = path.join(OLD, '预览/渲染/1020-1306-第六章完整参考');
const ffmpeg = 配置('ffmpeg');
const ffprobe = 配置('ffprobe');

type 段 = { id: string; Composition: string; 帧数: number };
type 声音条 = { 起帧: number; 名: string };

const 旧跑 = (cmd: string[]) => 跑(cmd, { cwd: LIB });
const 旧出 = (cmd: string[]) => 跑出(cmd, { cwd: LIB });
// Python 叶子工具都过 uv 临时带上 numpy；ffmpeg 按 anim 的配置传进去
const pyEnv = { ...process.env, ANIM_FFMPEG: ffmpeg };
const uvPython = (script: string, args: string[]) => ['uv', 'run', '-q', '--no-project', '--with', 'numpy', 'python', path.join(本目录, script), ...args];

/** 重任务过闸（渲染走渲染锁，别的等放行），降优先级跑，耗时记进 anim 的耗时表 */
const 重 = async (标签: string, cmd: string[], { 渲染 = false, env = process.env } = {}) => {
  const 开始 = Date.now();
  let code = 1;
  try {
    await (渲染 ? 过渲染闸 : 过放行闸)(() => 跑(低优先级(cmd), { cwd: LIB, env }));
    code = 0;
  } finally {
    记耗时(标签, 开始, (Date.now() - 开始) / 1000, code, cmd.join(' '));
  }
};

const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file: string, v: unknown) => fs.writeFileSync(file, JSON.stringify(v, null, 1) + '\n', 'utf8');
const segments = () => readJson<{ 段: 段[] }>(path.join(TABLES, '段清单.json')).段;
const 冻结提交 = () => 旧出(['git', '-C', OLD, 'rev-parse', `${TAG}^{commit}`]).trim();

const 检查 = () => {
  const head = 旧出(['git', '-C', OLD, 'rev-parse', 'HEAD']).trim();
  const tag = 冻结提交();
  const dirty = 旧出(['git', '-C', OLD, 'status', '--porcelain']).trim();
  if (head !== tag) throw new Error(`旧项目 HEAD ${head} 不是 ${TAG}（${tag}）`);
  if (dirty) throw new Error(`旧项目工作区不干净：\n${dirty}`);
  console.log(`旧项目 HEAD = ${TAG} = ${head}，工作区干净`);
  return head;
};

const 清单 = async () => {
  fs.mkdirSync(TABLES, { recursive: true });
  const commit = 检查();
  await 旧跑(['node', '工具/段清单/段清单.mjs', '导出', path.join(TABLES, '段清单.json')]);
  const segs = segments();
  // 拼接表：同 合成第六章.py 的 write_concat_tables（各段整段接，段内 0～帧数）
  let start = 0;
  const rows = segs.map((s) => {
    const row = `${s.id}\t${s.Composition}\t0\t${s.帧数}\t${start}`;
    start += s.帧数;
    return row;
  });
  fs.writeFileSync(path.join(TABLES, '拼接表.tsv'), '段\tComposition\t从段内帧\t到段内帧（不含）\t全片起帧\n' + rows.join('\n') + '\n', 'utf8');
  const lines = 旧出(['node', '工具/一镜到底/跑.mjs', '工具/合成第六章/台词落点.ts']);
  writeJson(path.join(TABLES, '台词落点.json'), JSON.parse(lines.slice(lines.indexOf('['))));
  const frag = path.join(TABLES, '同步表片段');
  fs.mkdirSync(frag, { recursive: true });
  for (const name of ['第1至3场', '第4场']) {
    fs.writeFileSync(path.join(frag, `${name}.tsv`), 旧出(['node', '工具/一镜到底/跑.mjs', `工具/合成第六章/同步表-${name}.ts`]), 'utf8');
  }
  fs.copyFileSync(path.join(LIB, 'src/配音/台词表.json'), path.join(TABLES, '台词表.json'));
  // 已交付那次的拼接表等，原样留一份对照
  const delivered = path.join(TABLES, '交付-1020-1306');
  fs.mkdirSync(delivered, { recursive: true });
  for (const f of fs.readdirSync(DELIVERED_RUN)) fs.copyFileSync(path.join(DELIVERED_RUN, f), path.join(delivered, f));
  writeJson(path.join(TABLES, '来源.json'), {
    旧项目提交: commit, tag: TAG, 段数: segs.length, 总帧数: start,
    说明: '段清单 = 工具/段清单/段清单.mjs 导出；台词落点 = 工具/合成第六章/台词落点.ts；同步表片段 = 工具/合成第六章/同步表-*.ts；台词表 = src/配音/台词表.json 原样；声音清单 = 工具/剪辑微调/导出音效清单.mjs',
  });
  console.log(`${segs.length} 段，${start} 帧`);
};

const 声音清单 = async () => {
  检查();
  const out = path.join(TABLES, '声音清单');
  await 重('基线声音清单', ['node', '工具/剪辑微调/导出音效清单.mjs', '--出到', out, ...segments().map((s) => s.Composition)], { 渲染: true });
};

const 渲 = async (pass: string | undefined) => {
  if (pass !== 'A' && pass !== 'B') throw new Error('渲 A 或 渲 B');
  检查();
  const dir = path.join(MASTERS, pass);
  fs.mkdirSync(dir, { recursive: true });
  const pending = segments().filter((s) => !fs.existsSync(path.join(dir, `${s.Composition}.mkv`)));
  if (!pending.length) return console.log(`${pass} 已全部渲好`);
  // 参数同 合成第六章.py 的 视频级母版：2K（scale 2）、PNG 帧、h264-mkv CRF 1 veryfast、PCM
  const job = {
    标签前缀: `基线${pass}-`, codec: 'h264-mkv', audioCodec: 'pcm-16', crf: 1, x264Preset: 'veryfast', scale: 2, imageFormat: 'png', inputProps: {},
    段: pending.map((s) => ({ id: s.Composition, out: path.join(dir, `${s.Composition}.mkv`) })),
  };
  const jobFile = path.join(dir, '_批量任务.json');
  writeJson(jobFile, job);
  await 重(`基线${pass}（${pending.length} 段）`, ['node', '工具/批量渲染.mjs', jobFile], { 渲染: true });
};

// 每段取哪几帧：首帧、末帧、每 24 帧、声音事件帧（声音清单的起帧、同步表片段的段内帧、台词落点的起帧，取整后落在 [0, 帧数) 里的）
const cueFrames = (s: 段) => {
  const cues = new Map<number, Set<string>>();
  const add = (f: number, why: string) => {
    const k = Math.floor(f);
    if (k < 0 || k >= s.帧数) return;
    if (!cues.has(k)) cues.set(k, new Set());
    cues.get(k)!.add(why);
  };
  for (const kind of ['音效清单', '配乐清单', '台词清单']) {
    const file = path.join(TABLES, '声音清单', kind, `${s.Composition}.json`);
    if (!fs.existsSync(file)) throw new Error(`缺 ${file}（先跑 声音清单）`);
    for (const c of readJson<声音条[]>(file)) add(c.起帧, `${kind.slice(0, 2)}:${c.名}`);
  }
  for (const f of fs.readdirSync(path.join(TABLES, '同步表片段'))) {
    for (const line of fs.readFileSync(path.join(TABLES, '同步表片段', f), 'utf8').split('\n').slice(1)) {
      const [id, frame, event] = line.split('\t');
      if (id === s.id && /^-?[\d.]+/.test(frame ?? '')) add(parseFloat(frame!), `同步:${event}`);
    }
  }
  for (const a of readJson<{ 段: string; 起帧: number; 文件: string }[]>(path.join(TABLES, '台词落点.json'))) {
    if (a.段 === s.id) add(a.起帧, `台词:${path.basename(a.文件)}`);
  }
  return cues;
};

const 抽 = async () => {
  const dir = path.join(MASTERS, 'A');
  const commit = 冻结提交();
  for (const s of segments()) {
    const master = path.join(dir, `${s.Composition}.mkv`);
    const segDir = path.join(BASE, s.id);
    const frameDir = path.join(segDir, '帧');
    if (fs.existsSync(path.join(segDir, '段.json'))) continue;
    fs.rmSync(segDir, { recursive: true, force: true });
    fs.mkdirSync(frameDir, { recursive: true });
    const reasons = new Map<number, string[]>();
    const tag = (f: number, why: string) => reasons.set(f, [...(reasons.get(f) ?? []), why]);
    tag(0, '首帧');
    tag(s.帧数 - 1, '末帧');
    for (let f = 0; f < s.帧数; f += 24) tag(f, '每24帧');
    for (const [f, whys] of cueFrames(s)) for (const w of whys) tag(f, w);
    const frames = [...reasons.keys()].sort((a, b) => a - b);
    const 帧名 = (f: number) => `${String(f).padStart(5, '0')}.png`;
    // select 的表达式太长 ffmpeg 解析不了：每 60 帧一批，trim 到这批最后一帧就停，不往后解码
    const got: string[] = [];
    for (let k = 0; k < frames.length; k += 60) {
      const batch = frames.slice(k, k + 60);
      const scriptFile = path.join(segDir, '_select.txt');
      fs.writeFileSync(scriptFile, `trim=end_frame=${batch.at(-1)! + 1},select='${batch.map((f) => `eq(n\\,${f})`).join('+')}'`, 'utf8');
      const prefix = `_${String(k).padStart(5, '0')}_`;
      await 旧跑([ffmpeg, '-v', 'error', '-y', '-i', master, '-/vf', scriptFile, '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-start_number', '0', path.join(frameDir, `${prefix}%05d.png`)]);
      fs.rmSync(scriptFile);
      got.push(...fs.readdirSync(frameDir).filter((f) => f.startsWith(prefix)).sort());
    }
    if (got.length !== frames.length) throw new Error(`${s.id}：要 ${frames.length} 帧，抽出 ${got.length} 帧`);
    got.forEach((f, i) => fs.renameSync(path.join(frameDir, f), path.join(frameDir, 帧名(frames[i]!))));
    const wav = path.join(segDir, '音频.wav');
    await 旧跑([ffmpeg, '-v', 'error', '-y', '-i', master, '-map', '0:a:0', '-c:a', 'pcm_s16le', wav]);
    const nb = parseInt(旧出([ffprobe, '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', master]).trim(), 10);
    if (nb !== s.帧数) throw new Error(`${s.id}：母版 ${nb} 帧，清单 ${s.帧数} 帧`);
    writeJson(path.join(segDir, '段.json'), {
      段: s.id, Composition: s.Composition, 帧数: s.帧数, 旧项目提交: commit,
      母版: path.relative(BASE, master), 母版sha256: sha256(master),
      音频: { 文件: '音频.wav', sha256: sha256(wav), 说明: '母版里的 PCM 原样（48 kHz、16 位、立体声），没拉响度' },
      帧: frames.map((f) => ({ 帧: f, 文件: `帧/${帧名(f)}`, 原因: reasons.get(f), sha256: sha256(path.join(frameDir, 帧名(f))) })),
      说明: 'PNG 由 CRF 1 母版（yuv420p）解码成 rgb24，和成片走同一条路；不是 renderStill 单帧（单帧渲染的绘制历史和连续渲染不同）',
    });
    console.log(`${s.id}：${frames.length} 帧、音频`);
  }
};

const 表 = () => 跑(uvPython('表.py', [LIB, TABLES, BASE]), { cwd: LIB, env: pyEnv });

const 底噪 = () => 重('基线底噪', uvPython('比较.py', ['底噪', BASE]), { env: pyEnv });

const 对照 = async (threshold: string | undefined) => {
  fs.mkdirSync(DELIVERED_MASTERS, { recursive: true });
  const filmTime = fs.statSync(DELIVERED_FILM).mtimeMs;
  for (const s of segments()) {
    const src = path.join(OLD_MASTER_CACHE, `${s.Composition}.mkv`);
    const dst = path.join(DELIVERED_MASTERS, `${s.Composition}.mkv`);
    if (fs.existsSync(dst)) continue;
    // 缓存里的母版要比成片早，才是那次交付用的那份
    if (fs.statSync(src).mtimeMs > filmTime) throw new Error(`${src} 比成片新，不是交付时那份`);
    // COPYFILE_FICLONE：APFS 上是写时复制的克隆，不占第二份空间；不支持的文件系统退回普通拷贝
    fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE);
    fs.utimesSync(dst, fs.statSync(src).atime, fs.statSync(src).mtime);
  }
  await 重('基线对照', uvPython('比较.py', ['对照', BASE, DELIVERED_FILM, ...(threshold ? ['--门槛', threshold] : [])]), { env: pyEnv });
};

const [step, arg] = process.argv.slice(2);
const steps: Record<string, () => unknown> = { 检查, 清单, 声音清单, 渲: () => 渲(arg), 抽, 表, 底噪, 对照: () => 对照(arg) };
const 步 = step === undefined ? undefined : steps[step];
if (!步) {
  console.error(`用法：node pipeline/适配器/旧项目/基线.ts <${Object.keys(steps).join('|')}> [参数]`);
  process.exit(2);
}
await 步();
