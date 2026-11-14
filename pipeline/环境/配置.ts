// 本机配置：每一项按「环境变量 > anim.local.toml > 默认值」取，并记下取自哪一层（anim env 打出来）。
// anim.local.toml 里的键是环境变量名去掉 ANIM_ 的小写（TOML 的裸键只能是 ASCII）。不进 Git，先找代码根、再找主检出（worktree 里没有就用主检出那份）；里面的相对路径相对这个文件所在目录。模板见 anim.local.toml.example。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根, 主检出 } from './路径.ts';
import { 作品名 } from './作品.ts';

export const isMac = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';

export type 来源 = '环境变量' | 'anim.local.toml' | '默认';
export type 配置值 = { 值: string; 来源: 来源; 变量: string; 键: string; 说明: string };

type 项定义 = { 变量: string; 说明: string; 是路径: boolean; 默认: (已取: Record<string, string>) => string };

/** Prism Launcher 默认的数据目录（各平台安装器的默认位置） */
const prism数据默认 = () => {
  if (isMac) return path.join(os.homedir(), 'Library', 'Application Support', 'PrismLauncher');
  if (isWindows) return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'PrismLauncher');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'PrismLauncher');
};

/** 用户本机放外部模型仓库的地方（~/Developer/personal/<名>，旧项目 工具/公共/环境.py 同样的默认） */
const 个人仓库 = (名: string) => path.join(os.homedir(), 'Developer', 'personal', 名);

// 顺序有意义：后面的默认值可以用前面已经取到的值
const 项表 = {
  数据根: { 变量: 'ANIM_DATA', 说明: 'Git 外的数据根（store、私有、terrain、cache、交付、run）', 是路径: true, 默认: () => path.join(path.dirname(主检出()), 'mc-anim-data') },
  默认作品: { 变量: 'ANIM_WORK', 说明: '没给 --作品、当前目录也不在哪部作品里时用的作品（只有一部时不用写）', 是路径: false, 默认: () => '' },
  游戏: { 变量: 'ANIM_GAME', 说明: '游戏环境（取材服务端、Prism 实例、jar 缓存）', 是路径: true, 默认: (v) => path.join(v.数据根!, 'game') },
  java_home: { 变量: 'ANIM_JAVA_HOME', 说明: 'JDK 17（编译取材 mod、导出模型的 javap）；空就用 PATH 上的 java', 是路径: true, 默认: () => '' },
  prism: { 变量: 'ANIM_PRISM', 说明: 'Prism Launcher 程序（anim mcai 起游戏用）；空就从 PATH 找', 是路径: false, 默认: () => '' },
  prism数据: { 变量: 'ANIM_PRISM_DATA', 说明: 'Prism Launcher 的数据目录（原版 assets、库）', 是路径: true, 默认: () => prism数据默认() },
  mc资源: { 变量: 'ANIM_MC_ASSETS', 说明: '原版资源目录（声音、语言文件的 objects/、indexes/）', 是路径: true, 默认: (v) => path.join(v.prism数据!, 'assets') },
  python: { 变量: 'ANIM_PYTHON', 说明: '跑 mcai 和取材脚本的 Python（3.10 以上）', 是路径: false, 默认: () => (isWindows ? 'python' : 'python3') },
  // 调模型的事归 image-flow（用户 10-31 定，docs/决策/0009）
  image_flow: { 变量: 'ANIM_IMAGE_FLOW', 说明: 'image-flow 的命令行壳 imgflow.mjs（anim voice 合成用）', 是路径: true, 默认: () => path.join(个人仓库('image-flow'), 'skills', 'image-flow', 'imgflow.mjs') },
  对齐器: { 变量: 'ANIM_ALIGNER', 说明: 'Qwen3-ForcedAligner 的 uv 工程（.venv 和模型目录；anim voice lip 对齐字用）', 是路径: true, 默认: () => 个人仓库('qwen-aligner') },
  锁目录: {
    变量: 'ANIM_LOCK_DIR',
    说明: '资源闸的锁目录',
    是路径: true,
    默认: (v) => path.join(v.数据根!, 'run', 'locks'),
  },
  成片档: { 变量: 'ANIM_FILM_PROFILE', 说明: '成片档：4k60（默认，3 倍截图原生出 3840×2160、60 帧、码率上限 40 Mbps）或 1080p60（1.5 倍出 1920×1080、15 Mbps）；换档段全部重渲；见 pipeline/渲/设置.ts 的 成片档表', 是路径: false, 默认: () => '4k60' },
  // Windows 默认 vulkan：11-02 在 4060 笔记本上实测，ANGLE 默认的 D3D11 同一帧渲两遍有 45/86 帧不同，Vulkan 0/86、离 Mac 一样近，OpenGL 有大片黑斑
  // （数据根 archive/预览/1102-0601-跨机画面差异）。用户 11-13 定要别人在 Windows 上从 GitHub 拉下来就能渲出一样的，所以不让人自己去配
  gl: { 变量: 'ANIM_GL', 说明: '无头 Chrome 的 WebGL 后端（angle 走 GPU，Windows 默认 vulkan；Docker 里没有 GPU 用 swangle）', 是路径: false, 默认: () => (process.platform === 'win32' ? 'vulkan' : 'angle') },
  ffmpeg: { 变量: 'ANIM_FFMPEG', 说明: 'ffmpeg 程序（默认从 PATH 找）', 是路径: false, 默认: () => 'ffmpeg' },
  ffprobe: { 变量: 'ANIM_FFPROBE', 说明: 'ffprobe 程序（默认从 PATH 找）', 是路径: false, 默认: () => 'ffprobe' },
  渲染内存下限: { 变量: 'ANIM_RENDER_FREE_MIN', 说明: '渲染放行要的空闲内存百分比（照旧资源闸 30%）', 是路径: false, 默认: () => '30' },
  主机: { 变量: 'ANIM_HOST', 说明: '本机名（写进锁和运行记录）', 是路径: false, 默认: () => os.hostname() },
  记忆: {
    变量: 'ANIM_MEMORY',
    说明: 'agent-context 里本作品的记忆目录（规矩表出处 M/ 的根；anim check 查引用的记忆在不在，不在本机就跳过）',
    是路径: true,
    默认: () => path.join(os.homedir(), 'Developer', 'company', 'agent-context', 'memory', 'projects', 'stress-rotation-comic'),
  },
} satisfies Record<string, 项定义>;

export type 配置键 = keyof typeof 项表;

const toml键 = (变量: string) => 变量.replace(/^ANIM_/, '').toLowerCase();

const 本地配置位置 = (): string | null => {
  for (const dir of new Set([代码根(), 主检出()])) {
    const p = path.join(dir, 'anim.local.toml');
    if (fs.existsSync(p)) return p;
  }
  return null;
};

let 缓存: { 值: Record<string, 配置值>; 本地文件: string | null; 作品路径: Record<string, string> } | undefined;

/** [works] 表：放在 作品/ 外的作品名 → 目录。键是作品名（中文要加引号），相对路径相对这个 toml */
const 作品路径键 = 'works';

/** 读全部配置；env 给了就用它代替 process.env（测试用） */
export const 读配置 = (env: NodeJS.ProcessEnv = process.env, 本地文件: string | null = 本地配置位置()) => {
  let 本地: Record<string, unknown> = {};
  if (本地文件) {
    try {
      本地 = parse(fs.readFileSync(本地文件, 'utf8'));
    } catch (e) {
      throw new Error(`${本地文件} 解析失败：${(e as Error).message}`);
    }
    const 认识 = new Set(Object.values(项表).map((d) => toml键(d.变量)));
    认识.add(作品路径键);
    const 不认识 = Object.keys(本地).filter((k) => !认识.has(k));
    if (不认识.length) throw new Error(`${本地文件} 里有不认识的项：${不认识.join('、')}（能写的见 anim.local.toml.example）`);
  }
  const 已取: Record<string, string> = {};
  const 值: Record<string, 配置值> = {};
  for (const [名, 定义] of Object.entries(项表) as [string, 项定义][]) {
    let v: string;
    let 从: 来源;
    if (env[定义.变量]) {
      v = env[定义.变量]!;
      从 = '环境变量';
      if (定义.是路径) v = path.resolve(v);
    } else if (typeof 本地[toml键(定义.变量)] === 'string' || typeof 本地[toml键(定义.变量)] === 'number') {
      v = String(本地[toml键(定义.变量)]);
      从 = 'anim.local.toml';
      if (定义.是路径) v = path.resolve(path.dirname(本地文件!), v);
    } else {
      v = 定义.默认(已取);
      从 = '默认';
    }
    已取[名] = v;
    值[名] = { 值: v, 来源: 从, 变量: 定义.变量, 键: toml键(定义.变量), 说明: 定义.说明 };
  }
  const 作品路径: Record<string, string> = {};
  const 表 = 本地[作品路径键];
  if (表 !== undefined) {
    if (typeof 表 !== 'object' || Array.isArray(表) || 表 === null) throw new Error(`${本地文件} 的 ${作品路径键} 要写成表：[${作品路径键}] 下面 "名" = "目录"`);
    for (const [名, dir] of Object.entries(表)) {
      if (typeof dir !== 'string') throw new Error(`${本地文件} [${作品路径键}] 的「${名}」要是目录字符串`);
      作品路径[名] = path.resolve(path.dirname(本地文件!), dir);
    }
  }
  return { 值, 本地文件, 作品路径 };
};

const 全部 = () => (缓存 ??= 读配置());

export const 配置 = (名: 配置键): string => 全部().值[名]!.值;
export const 全部配置 = () => 全部();
export const 作品路径表 = () => 全部().作品路径;

// ---------- 数据根下的布局（方案「二、新项目总览」）；按作品分：母版、交付、基线；共用：store、私有、terrain、cache/求解 ----------

export const 数据根 = () => 配置('数据根');
export const 数据路径 = (...段: string[]) => path.join(数据根(), ...段);

/** 按作品分的位置：<数据根>/<类…>/<作品>/<键…> */
const 按作品 = (类: string[], 作品: string, 键: string[]) => 数据路径(...类, 作品, ...键);
export const 母版目录 = (段键: string, 作品 = 作品名()) => 按作品(['cache', '母版'], 作品, [段键]);
export const 地形根 = () => 数据路径('terrain');
export const 求解缓存目录 = () => 数据路径('cache', '求解');
/** Remotion 的 public 目录：里面只放指向 terrain/、cache/求解/ 的链接（见 pipeline/渲/public目录.ts） */
export const public目录 = () => 数据路径('run', 'public');
/** 段签：段签/<作品>/<段键>/<指纹前 16 位>/（签.json、声音.flac、历史.jsonl），渲过一个指纹就留一份，母版删了也在（pipeline/段签/） */
export const 段签目录 = (段键: string, 指纹: string, 作品 = 作品名()) => 按作品(['段签'], 作品, [段键, 指纹.slice(0, 16)]);
/**
 * 认可参考：认可那版的抽样帧（全分辨率 FFV1，存解出来的 yuv420p 原样；从认可那版的切片抽），
 * 认可参考/<作品>/<平台>/<段键>/<指纹前 16 位>-<抽样键>.mkv，旁边 .json 是旁记（验收/参考像素.ts）；verify 比像素用，不再要认可那版的母版。
 * 抽样键见 验收/认可.ts，文件名跟着认可记录的哈希走，同一指纹重新 accept 不会撞上旧参考
 */
export const 认可参考文件 = (段键: string, 指纹: string, 抽样键: string, 平台: string, 作品 = 作品名()) => 按作品(['认可参考'], 作品, [平台, 段键, `${指纹.slice(0, 16)}-${抽样键}.mkv`]);
/** anim verify 逐帧 存的逐帧校验值：run/逐帧校验/<作品>/<名>/<段键>.tsv */
export const 逐帧校验目录 = (名: string, 作品 = 作品名()) => 按作品(['run', '逐帧校验'], 作品, [名]);
/** 交付/<作品>/，下面是 <UTC 月日-时分>-<名>/ */
export const 交付根 = (作品 = 作品名()) => 按作品(['交付'], 作品, []);
/** 旧项目对照的基线：基线/<作品>/（只有 应力转动 有） */
export const 基线根 = (作品 = 作品名()) => 按作品(['基线'], 作品, []);
/** manifest 里数据根下的路径：相对数据根的、绝对的都认 */
export const 数据根下 = (p: string) => (path.isAbsolute(p) ? p : path.join(数据根(), ...p.split('/')));
export const 运行目录 = () => 数据路径('run');
/** Agent 的中间稿：run/草稿/<UTC 月日-时分>-工作-<主题>/（见 pipeline/预览/预览.ts） */
export const 草稿根 = () => 数据路径('run', '草稿');
export const 耗时表 = () => 数据路径('run', 'logs', '耗时.tsv');
export const 运行记录目录 = () => 数据路径('run', '运行记录');
