// anim assets 材质包：按这部作品选用的材质包（资产锁.ts 读材质包选用：ANIM_PACKS > <作品根>/材质包.toml）建覆盖层锁。
// 材质包是标准 Java 版资源包 zip，登记成资产 材质包/<名>（assets/registry/材质包.toml，许可不许分发的 可见性 私有，字节只在数据根 私有/）。
// 换哪些：方块图集（贴图/场景/关键帧/方块表，按 数据/场景/关键帧/方块表 的 贴图名 一格一格换）；sourcing/extract.toml 里照搬 jar 里原版贴图的产物
// （照搬贴图：方块、物品、粒子、天空、实体和角色皮肤、选择世界界面；模组的、自己画的、2D 歌词点阵用的银河字母不换）；包里有 colormap 的，群系色表（数据/场景/关键帧/群系色）。
// 出图交给 py/anim_py/材质包覆盖.py（只读 zip、不解压、不执行包里的东西）。分辨率（用户 11-02 要 32x 原样上屏、顺便兼容 64x）：见 放大上限，
// 本作品 像素N 6 → 最多 2 倍（32x 原样，64x、128x 盒子平均缩到 32x）；方块图集一格跟着变大（engine/voxel/真实方块图集.ts 按竖条宽取格边长），
// 包里没有的原版贴图最近邻放大到同一格。换后的字节按最严的可见性入库：有私有包 → 私有/，否则 store/。
import spawn from 'cross-spawn';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';
import { 读清单 } from '../取材/清单.ts';
import { jar路径 } from '../取材/提取.ts';
import { 读两侧资产表 } from './资产表.ts';
import { 入库, 材质包锁路径, 解析资产, 读作品资产锁, 读材质包选用, type 材质包锁, type 资产锁, type 锁条目 } from './资产锁.ts';

const 图集id = '贴图/场景/关键帧/方块表';
const 方块表id = '数据/场景/关键帧/方块表';
const 群系色id = '数据/场景/关键帧/群系色';
const 原版jar = 'client-1.20.1';
/** 照搬的原版贴图都换（模组的贴图不在 minecraft 命名空间下，不换）；colormap 另走群系色 */
const 可换前缀 = 'assets/minecraft/textures/';
const 不换包内前缀 = ['assets/minecraft/textures/colormap/'];
/** 这几类 id 不换：2D 界面（像素聊天栏、女仆界面、歌词点阵用的银河字母）照自己的点阵画，点不随材质包变细；贴图/镜头/ 是应力转动单镜头的。
 *  界面里只换消费处核过、按贴图尺寸取像素的（选择世界界面，场/2-选择世界/画界面.ts） */
const 不换id前缀 = ['贴图/界面/', '贴图/镜头/'];
const 界面可换 = new Set(['贴图/界面/世界选择', '贴图/界面/选项背景']);
/** 照原版尺寸（不放大）：云的贴图一个像素是天上 12 格一块云，放大了云的形状就变了（地点/原版云层.tsx 按像素读） */
const 原尺寸id = new Set(['贴图/场景/天空/clouds']);

/** 材质包最多放大几倍（相对原版 16 像素一格，2 的幂）。用户 11-02：32x 原样上屏、以后的 64x 也要兼容。
 *  三渲二正交机位一个原版贴图像素 = 像素N 个成片像素、顶面一个贴图像素 = 正交顶面 个像素高（画风.ts）；放大 倍 倍后一个贴图像素是 像素N ÷ 倍，
 *  要整像素（画风原则 3：像素一样大、不糊）就得 倍 同时整除 像素N 和 正交顶面。本作品 6、2 → 2：32x 原样，64x、128x 缩到 32x（6 ÷ 4 = 1.5 像素）。
 *  封顶（一格最多几个贴图像素，16 = 原版尺寸）再往下压；作品没有 画风.ts 的 像素N 就不放大 */
export const 放大上限 = (画风文本: string | null, 封顶?: number): { 倍: number; 依据: string } => {
  const 取 = (名: string) => {
    const m = 画风文本 ? new RegExp(`export const ${名} = (\\d+)`).exec(画风文本) : null;
    return m ? Number(m[1]) : undefined;
  };
  const N = 取('像素N');
  const 顶 = 取('正交顶面');
  const 最大公约 = (a: number, b: number): number => (b ? 最大公约(b, a % b) : a);
  let 倍 = 1;
  let 依据 = '作品没有 画风.ts 的 像素N，不放大';
  if (N) {
    const g = 顶 ? 最大公约(N, 顶) : N;
    倍 = g & -g; // 整除 g 的最大 2 的幂
    依据 = `像素N ${N}${顶 ? `、正交顶面 ${顶}` : ''} → 最多 ${倍} 倍（${16 * 倍}x）`;
  }
  if (封顶 !== undefined) {
    const c = Math.max(1, Math.floor(封顶 / 16));
    if (c < 倍) {
      倍 = 2 ** Math.floor(Math.log2(c));
      依据 += `，封顶 ${封顶} → ${16 * 倍}x`;
    }
  }
  return { 倍, 依据 };
};

export type 照搬 = { 包内: string; 组: string };
/** extract.toml 里照搬 jar 里一张贴图的产物：id → 包内路径（assets/<ns>/textures/...png）和组（同一步导出的一组，材质包放大时一组一样大）。
 *  认这几种：「导出模型」的 名=路径、单写路径（产物名 = 文件名）、路径里带 *（按 锁ids 里有的 id 展开）、导出到单个文件；
 *  「导出实体模型」--贴图 后面的 名=路径（一张时产物是 <模型>.png，几张时是 <模型>.<名>.png） */
export const 照搬贴图 = (取材表文本: string, 锁ids: Iterable<string> = []): Map<string, 照搬> => {
  const t = parse(取材表文本) as { 取材?: { 名称?: string; 步骤?: unknown[][]; 产物?: Record<string, string> }[] };
  const ids = [...锁ids];
  const 出 = new Map<string, 照搬>();
  for (const r of t.取材 ?? []) {
    (r.步骤 ?? []).forEach((s, 第) => {
      if (typeof s[2] !== 'string') return;
      const 组 = `${r.名称 ?? '?'}#${第}`;
      const 产物 = Object.entries(r.产物 ?? {});
      if (s[0] === '导出实体模型') {
        const i = s.indexOf('--贴图');
        if (i < 0) return;
        const 贴图们 = [] as [string, string][];
        for (const a of s.slice(i + 1)) {
          if (a === '--动画') break;
          const m = typeof a === 'string' ? /^([^=]+)=(assets\/.+\.png)$/.exec(a) : null;
          if (m) 贴图们.push([m[1]!, m[2]!]);
        }
        const 干 = s[2].replace(/\.json$/, '');
        const 文件们 = new Map(贴图们.map(([名, 路]) => [贴图们.length === 1 ? `${干}.png` : `${干}.${名}.png`, 路]));
        for (const [id, 文件] of 产物) if (文件们.has(文件)) 出.set(id, { 包内: 文件们.get(文件)!, 组 });
        return;
      }
      if (s[0] !== '导出模型') return;
      const 目录 = s[2];
      const 对 = new Map<string, string>();
      const 通配们: string[] = [];
      for (const a of s.slice(3)) {
        if (typeof a !== 'string') continue;
        const m = /^([^=]+)=(assets\/.+\.png)$/.exec(a);
        if (m) 对.set(m[1]!, m[2]!);
        else if (/^assets\/.+\.png$/.test(a)) {
          if (a.includes('*')) 通配们.push(a);
          else 对.set(path.posix.basename(a, '.png'), a);
        }
      }
      const 按名 = (名: string) => {
        if (对.has(名)) return 对.get(名);
        for (const g of 通配们) {
          const 式 = new RegExp('^' + path.posix.basename(g, '.png').split('*').map((x) => x.replace(/[.+?^$()|[\]\\{}]/g, '\\$&')).join('.*') + '$');
          if (式.test(名)) return `${path.posix.dirname(g)}/${名}.png`;
        }
        return undefined;
      };
      for (const [id式, 文件式] of 产物) {
        // 导出到单个文件（第三项是 .png、只给一张）：产物就是这个文件
        if (文件式 === 目录 && 对.size === 1 && !通配们.length) {
          出.set(id式, { 包内: [...对.values()][0]!, 组 });
          continue;
        }
        if (!文件式.startsWith(`${目录}/`) || !文件式.endsWith('.png')) continue;
        const 名式 = 文件式.slice(目录.length + 1, -'.png'.length);
        if (名式 === '*' && id式.endsWith('/*')) {
          const 前 = id式.slice(0, -1);
          const 名们 = new Set([...对.keys(), ...ids.filter((x) => x.startsWith(前) && !x.slice(前.length).includes('/')).map((x) => x.slice(前.length))]);
          for (const 名 of 名们) {
            const 路 = 按名(名);
            if (路) 出.set(前 + 名, { 包内: 路, 组 });
          }
        } else if (!名式.includes('*')) {
          const 路 = 按名(名式);
          if (路) 出.set(id式, { 包内: 路, 组 });
        }
      }
    });
  }
  return 出;
};

export type 体检 = { 名: string; pack_format: unknown; supported_formats: unknown; 统计: Record<string, number>; 例: Record<string, string[]> };
export type 出图结果 = {
  产物: { id: string; 文件: string; 换: number; 共: number }[];
  图集缺: number;
  图集不合: { 名: string; 包: string; 原因: string }[];
  单张缺: string[];
  单张原版放大: string[];
  单张不合: { id: string; 包: string; 原因: string }[];
  图集格: Record<string, number>;
  缩放: Record<string, number>;
  各包贡献: Record<string, number>;
  体检: 体检[];
  群系色?: { 改: number; 色图来自: string[]; 例: Record<string, [string, string]> };
};

const 跑出图 = (请求: object, 出目录: string): 出图结果 => {
  const f = path.join(出目录, '请求.json');
  fs.writeFileSync(f, JSON.stringify({ ...请求, 出目录 }));
  const 脚本 = path.join(代码根(), 'py', 'anim_py', '材质包覆盖.py');
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  delete env.VIRTUAL_ENV;
  const r = spawn.sync('uv', ['run', '-q', '--no-project', '--with', 'pillow==13.0.0', 'python', '-I', 脚本, f], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`材质包覆盖.py 失败（退出码 ${r.status}）：${String(r.stdout ?? '').slice(-500)}`);
  return JSON.parse(String(r.stdout).trim().split('\n').at(-1)!) as 出图结果;
};

/** OptiFine、models、blockstates、shaders 这些兼容层不认的东西，按包列成警告 */
export const 警告们 = (体检们: 体检[]) =>
  体检们.flatMap((t) => {
    const w: string[] = [];
    if (t.pack_format != null && t.pack_format !== 15 && !/\b15\b/.test(JSON.stringify(t.supported_formats ?? ''))) w.push(`${t.名}：pack_format ${String(t.pack_format)}，不是 1.20.1 的 15，个别贴图可能改过名`);
    for (const [k, n] of Object.entries(t.统计)) {
      const 例 = (t.例[k] ?? []).slice(0, 2).join('、');
      if (k.startsWith('OptiFine/')) w.push(`${t.名}：${k} ${n} 个文件不支持（如 ${例}）`);
      else if (k === 'models/block' || k === 'blockstates') w.push(`${t.名}：${k} 覆盖 ${n} 个没用上（方块形状照原版方块表；如 ${例}）`);
      else if (k === 'shaders') w.push(`${t.名}：core shaders ${n} 个不支持`);
    }
    return w;
  });

/** 建覆盖层：按给的选用（默认环境变量或作品的 "包"），返回覆盖层锁、写到哪、报告 */
export const 建材质包覆盖 = (作品根: string, 选 = 读材质包选用(作品根)) => {
  if (!选.包.length) throw new Error(`这部作品没选用材质包：在 ${path.join(作品根, '材质包.toml')} 写 "包" = ["材质包/<名>"]，或试样时前面带 ANIM_PACKS=<名>`);
  const 锁 = 读作品资产锁(作品根, { 包: [], 来自: '无' }); // 原版锁：覆盖层只照原版建
  const 表 = 读两侧资产表(作品根).条目;
  const 包们 = 选.包.map((id) => {
    const e = 表.get(id);
    if (!e || e.类别 !== '材质包') throw new Error(`${id} 没在资产表登记成 类别 = "材质包"（assets/registry/材质包.toml），先登记、anim assets add ${id} <包.zip>`);
    return { id, 名: id.slice('材质包/'.length), 可见性: e.可见性, 许可: e.许可, 条目: 锁[id]!, zip: 解析资产(id, 锁).文件 };
  });
  const 方块表 = JSON.parse(fs.readFileSync(解析资产(方块表id, 锁).文件, 'utf8')) as { 贴图: string[] };
  const 单张 = [...照搬贴图(fs.readFileSync(path.join(代码根(), 'sourcing', 'extract.toml'), 'utf8'), Object.keys(锁))]
    .filter(([id, { 包内 }]) => id in 锁 && id.startsWith('贴图/') && (界面可换.has(id) || !不换id前缀.some((q) => id.startsWith(q))) && 包内.startsWith(可换前缀) && !不换包内前缀.some((q) => 包内.startsWith(q)))
    .map(([id, { 包内, 组 }]) => ({ id, 原图: 解析资产(id, 锁).文件, 包内, 组, ...(原尺寸id.has(id) ? { 倍上限: 1 } : {}) }));
  const 画风 = path.join(作品根, '画风.ts');
  const 上限 = 放大上限(fs.existsSync(画风) ? fs.readFileSync(画风, 'utf8') : null, 选.封顶);
  const jar = jar路径(读清单(), 原版jar);
  if (!fs.existsSync(jar)) throw new Error(`原版 jar 不在 ${jar}（群系色要它的色图和群系温度湿度）：anim extract --下载`);
  const 出目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
  try {
    const 结果 = 跑出图(
      {
        包们: 包们.map((p) => ({ zip: p.zip, 名: p.名 })),
        原版jar: jar,
        倍上限: 上限.倍,
        图集: [{ id: 图集id, 原图: 解析资产(图集id, 锁).文件, 贴图名: 方块表.贴图, 格: 16 }],
        单张,
        群系: { id: 群系色id, 原表: 解析资产(群系色id, 锁).文件 },
      },
      出目录,
    );
    const 库 = 包们.some((p) => p.可见性 === '私有') ? '私有' : 'store';
    const 覆盖: Record<string, 锁条目> = {};
    for (const p of 结果.产物) {
      const 条目 = 入库(p.文件, 库);
      if (条目.sha256 !== 锁[p.id]!.sha256) 覆盖[p.id] = 条目;
    }
    const 盖: 材质包锁 = {
      包: 包们.map((p) => ({ id: p.id, sha256: p.条目.sha256 })),
      ...(选.封顶 !== undefined ? { 封顶: 选.封顶 } : {}),
      覆盖: Object.fromEntries(Object.keys(覆盖).sort().map((k) => [k, 覆盖[k]!])) as 资产锁,
      报告: {
        许可: Object.fromEntries(包们.map((p) => [p.id, `${p.许可}（${p.可见性}）`])),
        分辨率: { 规则: 上限.依据, 方块图集格: 结果.图集格[图集id] ?? 16 },
        方块图集: { 换: 结果.产物.find((x) => x.id === 图集id)?.换 ?? 0, 共: 方块表.贴图.length, 包里没有: 结果.图集缺, 不合: 结果.图集不合.length },
        单张: { 共: 单张.length, 换: 结果.产物.filter((x) => x.id !== 图集id && x.id !== 群系色id && x.换 > 0).length, 包里没有: 结果.单张缺.length, 包里没有但同组放大: 结果.单张原版放大, 不合: 结果.单张不合 },
        缩放: 结果.缩放,
        各包贡献: 结果.各包贡献,
        群系色: 结果.群系色 ?? null,
        警告: 警告们(结果.体检),
      },
    };
    const 锁文件 = 材质包锁路径(作品根, 选);
    fs.mkdirSync(path.dirname(锁文件), { recursive: true });
    fs.writeFileSync(锁文件, JSON.stringify(盖, null, 2) + '\n', 'utf8');
    return { 选, 包们, 盖, 结果, 锁文件 };
  } finally {
    fs.rmSync(出目录, { recursive: true, force: true });
  }
};
