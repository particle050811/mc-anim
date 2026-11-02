// anim assets 材质包：按这部作品选用的材质包（资产锁.ts 读材质包选用：ANIM_PACKS > <作品根>/材质包.toml）建覆盖层锁。
// 材质包是标准 Java 版资源包 zip，登记成资产 材质包/<名>（assets/registry/材质包.toml，许可不许分发的 可见性 私有，字节只在数据根 私有/）。
// 换哪些：方块图集（贴图/场景/关键帧/方块表，按 数据/场景/关键帧/方块表 的 贴图名 一格一格换）；sourcing/extract.toml 里「导出模型」一步
// 照搬 jar 里一张原版贴图的产物（方块、物品、粒子、天空、告示牌、箱子；角色皮肤、界面图标、字体不换）；包里有 colormap 的，群系色表（数据/场景/关键帧/群系色）。
// 出图交给 py/anim_py/材质包覆盖.py（只读 zip、不解压、不执行包里的东西）；分辨率一律规整到原版尺寸（一个 16x 贴图像素 = 成片 像素N 个像素，
// 图集也只认 16 像素一格，见 engine/voxel/真实方块图集.ts），32x、64x 盒子平均缩。换后的字节按最严的可见性入库：有私有包 → 私有/，否则 store/。
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
/** 照搬的原版贴图里，只换这几类（包内路径前缀） */
const 可换前缀 = ['block/', 'item/', 'particle/', 'environment/', 'entity/signs/', 'entity/chest/'].map((p) => `assets/minecraft/textures/${p}`);
/** 这几类 id 不换：2D 界面的图标（像素聊天栏、女仆界面）留原版，兼容层先只管 3D 场景；贴图/镜头/ 是应力转动单镜头的 */
const 不换id前缀 = ['贴图/界面/', '贴图/镜头/'];

/** extract.toml 里「导出模型」照搬一张贴图的产物：id → 包内路径（assets/minecraft/textures/...png） */
export const 照搬贴图 = (取材表文本: string): Map<string, string> => {
  const t = parse(取材表文本) as { 取材?: { 步骤?: unknown[][]; 产物?: Record<string, string> }[] };
  const 出 = new Map<string, string>();
  for (const r of t.取材 ?? []) {
    for (const s of r.步骤 ?? []) {
      if (s[0] !== '导出模型' || typeof s[2] !== 'string') continue;
      const 目录 = s[2];
      const 对 = new Map<string, string>();
      for (const a of s.slice(3)) {
        const m = typeof a === 'string' ? /^([^=]+)=(assets\/.+\.png)$/.exec(a) : null;
        if (m) 对.set(m[1]!, m[2]!);
      }
      for (const [id式, 文件式] of Object.entries(r.产物 ?? {})) {
        // 导出到单个文件（第三项是 .png、只给一张）：产物就是这个文件
        if (文件式 === 目录 && 对.size === 1) {
          出.set(id式, [...对.values()][0]!);
          continue;
        }
        if (!文件式.startsWith(`${目录}/`) || !文件式.endsWith('.png')) continue;
        const 名式 = 文件式.slice(目录.length + 1, -'.png'.length);
        if (名式.includes('*')) {
          for (const [k, p] of 对) if (id式.includes('*')) 出.set(id式.replace('*', k), p);
        } else if (对.has(名式)) 出.set(id式, 对.get(名式)!);
      }
    }
  }
  return 出;
};

export type 体检 = { 名: string; pack_format: unknown; supported_formats: unknown; 统计: Record<string, number>; 例: Record<string, string[]> };
export type 出图结果 = {
  产物: { id: string; 文件: string; 换: number; 共: number }[];
  图集缺: number;
  图集不合: { 名: string; 包: string; 原因: string }[];
  单张缺: string[];
  单张不合: { id: string; 包: string; 原因: string }[];
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

/** 建覆盖层：按当前选用（环境变量或作品的 材质包.toml），返回覆盖层锁、写到哪、报告 */
export const 建材质包覆盖 = (作品根: string) => {
  const 选 = 读材质包选用(作品根);
  if (!选.包.length) throw new Error(`这部作品没选用材质包：在 ${path.join(作品根, '材质包.toml')} 写 "包" = ["材质包/<名>"]，或试样时前面带 ANIM_PACKS=<名>`);
  const 锁 = 读作品资产锁(作品根, { 包: [], 来自: '无' }); // 原版锁：覆盖层只照原版建
  const 表 = 读两侧资产表(作品根).条目;
  const 包们 = 选.包.map((id) => {
    const e = 表.get(id);
    if (!e || e.类别 !== '材质包') throw new Error(`${id} 没在资产表登记成 类别 = "材质包"（assets/registry/材质包.toml），先登记、anim assets add ${id} <包.zip>`);
    return { id, 名: id.slice('材质包/'.length), 可见性: e.可见性, 许可: e.许可, 条目: 锁[id]!, zip: 解析资产(id, 锁).文件 };
  });
  const 方块表 = JSON.parse(fs.readFileSync(解析资产(方块表id, 锁).文件, 'utf8')) as { 贴图: string[] };
  const 单张 = [...照搬贴图(fs.readFileSync(path.join(代码根(), 'sourcing', 'extract.toml'), 'utf8'))]
    .filter(([id, p]) => id in 锁 && id.startsWith('贴图/') && !不换id前缀.some((q) => id.startsWith(q)) && 可换前缀.some((q) => p.startsWith(q)))
    .map(([id, p]) => ({ id, 原图: 解析资产(id, 锁).文件, 包内: p }));
  const jar = jar路径(读清单(), 原版jar);
  if (!fs.existsSync(jar)) throw new Error(`原版 jar 不在 ${jar}（群系色要它的色图和群系温度湿度）：anim extract --下载`);
  const 出目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
  try {
    const 结果 = 跑出图(
      {
        包们: 包们.map((p) => ({ zip: p.zip, 名: p.名 })),
        原版jar: jar,
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
      覆盖: Object.fromEntries(Object.keys(覆盖).sort().map((k) => [k, 覆盖[k]!])) as 资产锁,
      报告: {
        许可: Object.fromEntries(包们.map((p) => [p.id, `${p.许可}（${p.可见性}）`])),
        方块图集: { 换: 结果.产物.find((x) => x.id === 图集id)?.换 ?? 0, 共: 方块表.贴图.length, 包里没有: 结果.图集缺, 不合: 结果.图集不合.length },
        单张: { 共: 单张.length, 包里没有: 结果.单张缺.length, 不合: 结果.单张不合 },
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
