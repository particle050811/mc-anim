// 本机配置：每一项按「环境变量 > anim.local.toml > 默认值」取，并记下取自哪一层（anim env 打出来）。
// anim.local.toml 里的键是环境变量名去掉 ANIM_ 的小写（TOML 的裸键只能是 ASCII）。不进 Git，先找代码根、再找主检出（worktree 里没有就用主检出那份）；里面的相对路径相对这个文件所在目录。模板见 anim.local.toml.example。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { codeRoot, mainCheckout } from './路径.ts';

export const isMac = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';

export type ConfigSource = '环境变量' | 'anim.local.toml' | '默认';
export type ConfigValue = { value: string; source: ConfigSource; 变量: string; key: string; note: string };

type ItemDef = { 变量: string; note: string; isPath: boolean; 默认: (resolved: Record<string, string>) => string };

/** Prism Launcher 默认的数据目录（各平台安装器的默认位置） */
const prismDataDefault = () => {
  if (isMac) return path.join(os.homedir(), 'Library', 'Application Support', 'PrismLauncher');
  if (isWindows) return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'PrismLauncher');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'), 'PrismLauncher');
};

/** 用户本机放外部模型仓库的地方（~/Developer/personal/<名>，旧项目 工具/公共/环境.py 同样的默认） */
const personalRepo = (repoName: string) => path.join(os.homedir(), 'Developer', 'personal', repoName);

// 顺序有意义：后面的默认值可以用前面已经取到的值
const configItems = {
  数据根: { 变量: 'ANIM_DATA', note: 'Git 外的数据根（store、私有、terrain、cache、交付、run）', isPath: true, 默认: () => path.join(path.dirname(mainCheckout()), 'mc-anim-data') },
  默认作品: { 变量: 'ANIM_WORK', note: '没给 --work、当前目录也不在哪部作品里时用的作品（只有一部时不用写）', isPath: false, 默认: () => '' },
  游戏: { 变量: 'ANIM_GAME', note: '游戏环境（取材服务端、Prism 实例、jar 缓存）', isPath: true, 默认: (v) => path.join(v.数据根!, 'game') },
  java_home: { 变量: 'ANIM_JAVA_HOME', note: 'JDK 17（编译取材 mod、导出模型的 javap）；空就用 PATH 上的 java', isPath: true, 默认: () => '' },
  prism: { 变量: 'ANIM_PRISM', note: 'Prism Launcher 程序（anim mcai 起游戏用）；空就从 PATH 找', isPath: false, 默认: () => '' },
  prism数据: { 变量: 'ANIM_PRISM_DATA', note: 'Prism Launcher 的数据目录（原版 assets、库）', isPath: true, 默认: () => prismDataDefault() },
  mc资源: { 变量: 'ANIM_MC_ASSETS', note: '原版资源目录（声音、语言文件的 objects/、indexes/）', isPath: true, 默认: (v) => path.join(v.prism数据!, 'assets') },
  python: { 变量: 'ANIM_PYTHON', note: '跑 mcai 和取材脚本的 Python（3.10 以上）', isPath: false, 默认: () => (isWindows ? 'python' : 'python3') },
  // 调模型的事归 image-flow（用户 10-31 定，docs/决策/0009）
  image_flow: { 变量: 'ANIM_IMAGE_FLOW', note: 'image-flow 的命令行壳 imgflow.mjs（anim voice 合成用）', isPath: true, 默认: () => path.join(personalRepo('image-flow'), 'skills', 'image-flow', 'imgflow.mjs') },
  对齐器: { 变量: 'ANIM_ALIGNER', note: 'Qwen3-ForcedAligner 的 uv 工程（.venv 和模型目录；anim voice lip 对齐字用）', isPath: true, 默认: () => personalRepo('qwen-aligner') },
  锁目录: {
    变量: 'ANIM_LOCK_DIR',
    note: '资源闸的锁目录',
    isPath: true,
    默认: (v) => path.join(v.数据根!, 'run', 'locks'),
  },
  成片档: { 变量: 'ANIM_FILM_PROFILE', note: '成片档：4k60（默认，3 倍截图原生出 3840×2160、60 帧、码率上限 40 Mbps）或 1080p60（1.5 倍出 1920×1080、15 Mbps）；换档段全部重渲；见 pipeline/渲/设置.ts 的 成片档表', isPath: false, 默认: () => '4k60' },
  // Windows 默认 vulkan：11-02 在 4060 笔记本上实测，ANGLE 默认的 D3D11 同一帧渲两遍有 45/86 帧不同，Vulkan 0/86、离 Mac 一样近，OpenGL 有大片黑斑
  // （数据根 archive/预览/1102-0601-跨机画面差异）。用户 11-13 定要别人在 Windows 上从 GitHub 拉下来就能渲出一样的，所以不让人自己去配
  gl: { 变量: 'ANIM_GL', note: '无头 Chrome 的 WebGL 后端（angle 走 GPU，Windows 默认 vulkan；Docker 里没有 GPU 用 swangle）', isPath: false, 默认: () => (process.platform === 'win32' ? 'vulkan' : 'angle') },
  // 下载源默认用国内镜像（用户 11-13「观众未必有代理」）；只有国外有的，下载失败时提示走代理
  浏览器镜像: {
    变量: 'ANIM_CHROME_MIRROR',
    note: '渲染用浏览器（Google 的 Chrome for Testing）的镜像根，默认 npmmirror；anim.local.toml 写 chrome_mirror = "" 就不走镜像、直接让 Remotion 从 Google 下',
    isPath: false,
    默认: () => 'https://registry.npmmirror.com/-/binary/chrome-for-testing',
  },
  github下载根: {
    变量: 'ANIM_GITHUB_MIRROR',
    note: 'anim assets pull 下 Release 附件用的地址前缀，默认 https://github.com；连不上 GitHub 又没代理时可以换成加速站前缀（附件都核 sha256，换了不怕被改）',
    isPath: false,
    默认: () => 'https://github.com',
  },
  ffmpeg: { 变量: 'ANIM_FFMPEG', note: 'ffmpeg 程序（默认从 PATH 找）', isPath: false, 默认: () => 'ffmpeg' },
  ffprobe: { 变量: 'ANIM_FFPROBE', note: 'ffprobe 程序（默认从 PATH 找）', isPath: false, 默认: () => 'ffprobe' },
  渲染内存下限: { 变量: 'ANIM_RENDER_FREE_MIN', note: '渲染放行要的空闲内存百分比（照旧资源闸 30%）', isPath: false, 默认: () => '30' },
  主机: { 变量: 'ANIM_HOST', note: '本机名（写进锁和运行记录）', isPath: false, 默认: () => os.hostname() },
  记忆: {
    变量: 'ANIM_MEMORY',
    note: 'agent-context 里本作品的记忆目录（规矩表出处 M/ 的根；anim check 查引用的记忆在不在，不在本机就跳过）',
    isPath: true,
    默认: () => path.join(os.homedir(), 'Developer', 'company', 'agent-context', 'memory', 'projects', 'stress-rotation-comic'),
  },
} satisfies Record<string, ItemDef>;

export type ConfigKey = keyof typeof configItems;

const tomlKey = (envVar: string) => envVar.replace(/^ANIM_/, '').toLowerCase();

const localConfigPath = (): string | null => {
  for (const dir of new Set([codeRoot(), mainCheckout()])) {
    const p = path.join(dir, 'anim.local.toml');
    if (fs.existsSync(p)) return p;
  }
  return null;
};

let configCache: { value: Record<string, ConfigValue>; localFile: string | null; workPaths: Record<string, string> } | undefined;

/** [works] 表：放在 作品/ 外的作品名 → 目录。键是作品名（中文要加引号），相对路径相对这个 toml */
const workPathKey = 'works';

/** 读全部配置；env 给了就用它代替 process.env（测试用） */
export const readConfig = (env: NodeJS.ProcessEnv = process.env, localFile: string | null = localConfigPath()) => {
  let localConfig: Record<string, unknown> = {};
  if (localFile) {
    try {
      localConfig = parse(fs.readFileSync(localFile, 'utf8'));
    } catch (e) {
      throw new Error(`${localFile} 解析失败：${(e as Error).message}`);
    }
    const knownKeys = new Set(Object.values(configItems).map((d) => tomlKey(d.变量)));
    knownKeys.add(workPathKey);
    const unknownKeys = Object.keys(localConfig).filter((k) => !knownKeys.has(k));
    if (unknownKeys.length) throw new Error(`${localFile} 里有不认识的项：${unknownKeys.join('、')}（能写的见 anim.local.toml.example）`);
  }
  const resolved: Record<string, string> = {};
  const values: Record<string, ConfigValue> = {};
  for (const [configKey, definition] of Object.entries(configItems) as [string, ItemDef][]) {
    let v: string;
    let source: ConfigSource;
    if (env[definition.变量]) {
      v = env[definition.变量]!;
      source = '环境变量';
      if (definition.isPath) v = path.resolve(v);
    } else if (typeof localConfig[tomlKey(definition.变量)] === 'string' || typeof localConfig[tomlKey(definition.变量)] === 'number') {
      v = String(localConfig[tomlKey(definition.变量)]);
      source = 'anim.local.toml';
      if (definition.isPath) v = path.resolve(path.dirname(localFile!), v);
    } else {
      v = definition.默认(resolved);
      source = '默认';
    }
    resolved[configKey] = v;
    values[configKey] = { value: v, source: source, 变量: definition.变量, key: tomlKey(definition.变量), note: definition.note };
  }
  const workPaths: Record<string, string> = {};
  const workConfig = localConfig[workPathKey];
  if (workConfig !== undefined) {
    if (typeof workConfig !== 'object' || Array.isArray(workConfig) || workConfig === null) throw new Error(`${localFile} 的 ${workPathKey} 要写成表：[${workPathKey}] 下面 "名" = "目录"`);
    for (const [workName, dir] of Object.entries(workConfig)) {
      if (typeof dir !== 'string') throw new Error(`${localFile} [${workPathKey}] 的「${workName}」要是目录字符串`);
      workPaths[workName] = path.resolve(path.dirname(localFile!), dir);
    }
  }
  return { value: values, localFile, workPaths };
};

const cachedAllConfig = () => (configCache ??= readConfig());
/** 丢掉读过的配置，下次 config() 重读环境变量和 anim.local.toml。单测改了 ANIM_* 以后调（不用 vi.resetModules，那样静态导入的模块拿的还是旧实例） */
export const resetConfigCache = () => {
  configCache = undefined;
};

export const config = (configKey: ConfigKey): string => cachedAllConfig().value[configKey]!.value;
export const allConfig = () => cachedAllConfig();
export const workPathTable = () => cachedAllConfig().workPaths;

// ---------- 数据根下的布局（方案「二、新项目总览」）；共用的 store、私有、terrain、cache/求解 在这里，按作品分的母版、交付、基线在 作品数据.ts ----------

export const dataRoot = () => config('数据根');
export const dataPath = (...pathSegs: string[]) => path.join(dataRoot(), ...pathSegs);

export const terrainRoot = () => dataPath('terrain');
export const solveCacheDir = () => dataPath('cache', '求解');
/** 光体缓存：cache/光体/<作品>/<键哈希>.gz（engine/light/光体缓存.ts） */
export const lightCacheDir = () => dataPath('cache', '光体');
/** Remotion 的 public 目录：里面只放指向 terrain/、cache/求解/、cache/光体/ 等的链接（见 pipeline/渲/public目录.ts） */
export const publicDir = () => dataPath('run', 'public');
/** manifest 里数据根下的路径：相对数据根的、绝对的都认 */
export const underDataRoot = (p: string) => (path.isAbsolute(p) ? p : path.join(dataRoot(), ...p.split('/')));
export const runDir = () => dataPath('run');
/** Agent 的中间稿：run/草稿/<UTC 月日-时分>-工作-<主题>/（见 pipeline/预览/预览.ts） */
export const draftRoot = () => dataPath('run', '草稿');
export const timingLogPath = () => dataPath('run', 'logs', '耗时.tsv');
export const runLogDir = () => dataPath('run', '运行记录');
