// 作品渲染时对导入地形的改动（作品/<名>/地点/地形改动.ts 汇总的挖框、整平）要落在世界声明的 [[烘焙.保真]] 盒里：
// 可见变换（docs/世界.md「可见变换」）只让这些盒碰到的区段原样，挖开别处会露出换过的石头、填实的腔。
// 登记的包版本做过可见变换的，它 包.json 记的 可见 要盖住声明（声明加了盒、换了填充，要回存档重烘）。
// 暮色地标的挖框按网格头（JSON 资产）算，所以 JSON 资产按资产锁换成数据根里真的字节打包执行；字节不在就跳过，不拿占位算。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { esbuild别名插件, 非代码loader } from '../资产/esbuild插件.ts';
import { 作品资产锁路径, 字节路径, 读资产锁 } from '../资产/资产锁.ts';
import { 数据根 as 配置数据根 } from '../环境/配置.ts';
import { 解析声明, type 世界声明 } from '../世界/声明.ts';
import { 成记录, 记录盖住, type 可见记录 } from '../世界/烘焙/可见.ts';
import type { 报告, 检查上下文 } from './上下文.ts';

type 盒 = { from: number[]; to: number[] };
type 平 = { x0: number; z0: number; nx: number; nz: number };
type 改动 = { 名: string; 包: string; 挖: 盒[]; 平: 平[] };

const 登记文件 = (c: 检查上下文) => c.作品路径('地点/地形改动.ts');

/** 打包执行登记文件：asset: 换成数据根里的 JSON；缺字节返回 null（错误照抛） */
const 载入 = async (c: 检查上下文, 数据根: string): Promise<改动[] | null> => {
  const 锁 = { ...读资产锁(path.join(c.根, 'assets', '资产锁')), ...读资产锁(作品资产锁路径(c.绝对(c.作品目录))) };
  let 缺 = '';
  const out = await build({
    entryPoints: [c.绝对(登记文件(c))],
    absWorkingDir: c.根,
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    loader: { ...非代码loader, '.json': 'json' },
    logLevel: 'silent',
    plugins: [
      esbuild别名插件(c.根),
      {
        name: '真资产',
        setup(b) {
          b.onResolve({ filter: /^asset:/ }, (a) => ({ path: a.path.slice('asset:'.length), namespace: '真资产' }));
          b.onLoad({ filter: /.*/, namespace: '真资产' }, (a) => {
            const l = 锁[a.path], f = l && 字节路径(l, 数据根);
            if (!l) return { errors: [{ text: `资产锁里没有 asset:${a.path}` }] };
            // 贴图、音频同 宽松资产插件 给个字符串：挖框、整平用不到它们，真要解码会在执行时报错，不会悄悄算错
            if (l.后缀 !== '.json') return { contents: `export default ${JSON.stringify(`asset:${a.path}`)};`, loader: 'js' };
            if (!fs.existsSync(f!)) { 缺 ||= a.path; return { contents: 'export default null;', loader: 'js' }; }
            return { contents: fs.readFileSync(f!, 'utf8'), loader: 'json' };
          });
        },
      },
    ],
  });
  if (缺) return null;
  const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-地形改动-'));
  try {
    const f = path.join(目录, '登记.mjs');
    fs.writeFileSync(f, out.outputFiles[0]!.text, 'utf8');
    return ((await import(pathToFileURL(f).href)) as { 地形改动: 改动[] }).地形改动;
  } finally {
    fs.rmSync(目录, { recursive: true, force: true });
  }
};

const 声明们 = (c: 检查上下文): 世界声明[] => {
  const 目录 = c.绝对('sourcing/worlds');
  if (!fs.existsSync(目录)) return [];
  return fs.readdirSync(目录).filter((f) => f.endsWith('.toml') && !f.endsWith('.编辑.toml')).map((f) => 解析声明(fs.readFileSync(path.join(目录, f), 'utf8'), f.slice(0, -5), `sourcing/worlds/${f}`));
};

const 在里面 = (x0: number, z0: number, x1: number, z1: number, b: readonly number[]) => x0 >= b[0]! && z0 >= b[1]! && x1 <= b[2]! && z1 <= b[3]!;

export const 查地形改动 = async (c: 检查上下文, 报: 报告) => {
  if (!c.存在(登记文件(c))) return;
  const 数据根 = c.数据根 ?? 配置数据根();
  const 改动们 = await 载入(c, 数据根);
  if (!改动们) {
    报.跳过.push(`地形改动：数据根 ${数据根} 缺资产字节（anim assets pull），挖框、整平没核保真范围`);
    return;
  }
  const 世界们 = 声明们(c);
  const 版本表 = c.存在('assets/地形版本.json') ? (JSON.parse(c.读('assets/地形版本.json')) as { 包: Record<string, { 版本: string }> }).包 : {};
  let 处 = 0;
  for (const r of 改动们) {
    const w = 世界们.find((x) => x.包.some((b) => b.名 === r.包));
    if (!w) { 报.错(`地形改动「${r.名}」用的包 ${r.包} 没有世界声明（sourcing/worlds/），核不了保真范围`, 登记文件(c)); continue; }
    const 盒们 = w.可见.保真.map((x) => x.盒);
    const 框们: [string, number, number, number, number][] = [
      ...r.挖.map((b): [string, number, number, number, number] => [`挖框 ${JSON.stringify(b.from)}～${JSON.stringify(b.to)}`, Math.min(b.from[0]!, b.to[0]!), Math.min(b.from[2]!, b.to[2]!), Math.max(b.from[0]!, b.to[0]!), Math.max(b.from[2]!, b.to[2]!)]),
      ...r.平.map((f): [string, number, number, number, number] => [`整平罩 x ${f.x0}、z ${f.z0}、${f.nx}×${f.nz}`, f.x0, f.z0, f.x0 + f.nx - 1, f.z0 + f.nz - 1]),
    ];
    const 出界 = 框们.filter(([, x0, z0, x1, z1]) => !盒们.some((b) => 在里面(x0, z0, x1, z1, b)));
    处 += 框们.length;
    if (出界.length) 报.错(`地形改动「${r.名}」有 ${出界.length} 处不在 sourcing/worlds/${w.名称}.toml 的 [[烘焙.保真]] 盒里（可见变换会换掉那里埋着的格，挖开就露出来）：${出界.slice(0, 3).map((x) => x[0]).join('；')}。加盒以后要回存档重烘`, 登记文件(c));
  }
  // 登记的包版本做过可见变换的，记的设置要盖住声明
  const 包们 = new Set(改动们.map((r) => r.包));
  for (const 包 of 包们) {
    const w = 世界们.find((x) => x.包.some((b) => b.名 === 包)), 版本 = 版本表[包]?.版本;
    if (!w || !版本) continue;
    const f = path.join(数据根, 'terrain', 包, 版本, '包.json');
    if (!fs.existsSync(f)) { 报.跳过.push(`地形改动：${包} 版本 ${版本} 不在数据根，没核包记的可见变换`); continue; }
    const 记 = (JSON.parse(fs.readFileSync(f, 'utf8')) as { 可见?: 可见记录 }).可见;
    if (!记) { 报.信息.push(`${包}（${版本}）没做可见变换`); continue; }
    if (!记录盖住(记, 成记录({ 填充: w.可见.填充, 保真: w.可见.保真.map((x) => x.盒) }))) 报.错(`${包} 登记的版本 ${版本} 做可见变换时的设置没盖住 sourcing/worlds/${w.名称}.toml 现在的（填充 ${记.填充}、保真 ${记.保真.length} 个盒）：声明改过，要回存档重烘或 anim world 转码`, 'assets/地形版本.json');
  }
  报.信息.push(`地形改动 ${处} 处都核了保真范围`);
};
