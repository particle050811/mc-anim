// 世界声明 sourcing/worlds/<世界>.toml：一个存档里的一个维度，从头生成它要的东西（服务端、种子、模组、数据包、预生成范围），
// 和从它烘出哪些地形包（区域范围、场景原点）。同名的 <世界>.编辑.toml 是编辑层（编辑/）。字段说明见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 配置 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 维度区域目录 } from './存档.ts';

export type 区域范围 = { RX: [number, number]; RZ: [number, number] };
export type 包声明 = {
  名: string;
  /** 只烘这些区域（两端都含）；不写 = 存档里这个维度的全部区域文件 */
  区域?: 区域范围;
  /** [ox, oy, oz]；不写用 烘焙.原点 */
  原点: [number, number, number];
  来源?: string;
  /** false = 这个包不套编辑层（默认套） */
  套编辑: boolean;
  /** false = 烘了也不登记进 assets/地形版本.json（演示、试验用的包；登记会让所有用地形的段过期） */
  登记: boolean;
};
/** 矩形写 两角，或 中心 加 半边；走廊写 折线、半宽，可选 去掉（已在别的矩形块里的区块不重复生成）。怎么算区块见 预生成/范围.ts */
export type 预生成块 = {
  名: string;
  形状: '矩形' | '走廊';
  两角?: [number, number, number, number];
  中心?: [number, number];
  半边?: [number, number];
  折线?: [number, number][];
  半宽?: number;
  去掉?: string[];
  依据?: string;
};
export type 世界声明 = {
  名称: string;
  文件: string;
  服务端: string;
  存档: string;
  维度: string;
  /** 包.json 的 维度：主世界 / 暮色 … */
  包维度: string;
  种子?: string;
  Forge?: string;
  模组: string[];
  另需模组文件: string[];
  数据包: string[];
  预生成: { 区域文件范围?: 区域范围; 区块数?: number; 块: 预生成块[] };
  包: 包声明[];
};

export const 世界目录 = () => path.join(代码根(), 'sourcing', 'worlds');
export const 声明文件 = (名: string) => path.join(世界目录(), `${名}.toml`);
export const 编辑文件 = (名: string) => path.join(世界目录(), `${名}.编辑.toml`);

export const 列出世界 = () =>
  fs.existsSync(世界目录())
    ? fs
        .readdirSync(世界目录())
        .filter((f) => f.endsWith('.toml') && !f.endsWith('.编辑.toml'))
        .map((f) => f.slice(0, -'.toml'.length))
        .sort()
    : [];

/** 维度 id → 包.json 的 维度 和默认 oy（场景 z = 0 对应的游戏 y） */
const 已知维度: Record<string, { 包维度: string; oy: number }> = {
  'minecraft:overworld': { 包维度: '主世界', oy: 64 },
  'twilightforest:twilight_forest': { 包维度: '暮色', oy: 0 },
};

const 数对 = (v: unknown, 何: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger)) throw new Error(`${何} 要写两个整数`);
  return [v[0], v[1]];
};
const 范围 = (v: unknown, 何: string): 区域范围 | undefined => {
  if (v === undefined) return undefined;
  const o = v as Record<string, unknown>;
  const r = { RX: 数对(o.RX, `${何}.RX`), RZ: 数对(o.RZ, `${何}.RZ`) };
  if (r.RX[0] > r.RX[1] || r.RZ[0] > r.RZ[1]) throw new Error(`${何} 要小的在前`);
  return r;
};
const 字符串组 = (v: unknown, 何: string): string[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${何} 要是字符串数组`);
  return v;
};

export const 解析声明 = (文本: string, 名: string, 文件 = `${名}.toml`): 世界声明 => {
  const d = parse(文本) as Record<string, unknown>;
  const 错 = (s: string) => new Error(`${文件}：${s}`);
  try {
    if (d.名称 !== 名) throw 错(`名称 要和文件名一致（${名}）`);
    const 维度 = d.维度;
    if (typeof 维度 !== 'string' || !维度.includes(':')) throw 错('维度 要写成 命名空间:名字');
    if (typeof d.服务端 !== 'string') throw 错('要写 服务端（游戏环境 ANIM_GAME 下的服务端目录名）');
    const 已知 = 已知维度[维度];
    const 烘 = (d.烘焙 ?? {}) as Record<string, unknown>;
    const 包维度 = typeof 烘.包维度 === 'string' ? 烘.包维度 : 已知?.包维度;
    if (!包维度) throw 错(`维度 ${维度} 不认识，要在 [烘焙] 写 包维度（包.json 的 维度）`);
    const 原点于 = (v: unknown, 何: string): [number, number, number] | undefined => {
      if (v === undefined) return undefined;
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isInteger)) throw 错(`${何} 要写 [ox, oy, oz] 三个整数`);
      if (v[0] % 2048 || v[2] % 2048) throw 错(`${何} 的 ox、oz 要是 2048 的整数倍`);
      return [v[0], v[1], v[2]];
    };
    const 默认原点 = 原点于(烘.原点, '烘焙.原点');
    const 包们 = ((烘.包 ?? []) as Record<string, unknown>[]).map((b, i): 包声明 => {
      if (typeof b.名 !== 'string' || !b.名) throw 错(`烘焙.包 第 ${i + 1} 个要写 名`);
      const 原点 = 原点于(b.原点, `包 ${b.名} 的 原点`) ?? 默认原点;
      if (!原点) throw 错(`包 ${b.名} 没有原点（写在 [烘焙] 原点 或包里）`);
      if (已知 && 原点[1] !== 已知.oy) throw 错(`包 ${b.名} 的 oy 是 ${原点[1]}，${维度} 一律 ${已知.oy}（engine 按这个换竖直坐标）`);
      return { 名: b.名, 区域: 范围(b.区域, `包 ${b.名} 的 区域`), 原点, 来源: typeof b.来源 === 'string' ? b.来源 : undefined, 套编辑: b.套编辑 !== false, 登记: b.登记 !== false };
    });
    const 重名 = 包们.map((b) => b.名).filter((n, i, a) => a.indexOf(n) !== i);
    if (重名.length) throw 错(`包重名：${重名.join('、')}`);
    const 预 = (d.预生成 ?? {}) as Record<string, unknown>;
    const 块们 = ((预.块 ?? []) as Record<string, unknown>[]).map((k, i): 预生成块 => {
      const 何 = `预生成.块 第 ${i + 1} 个`;
      if (typeof k.名 !== 'string') throw 错(`${何} 要写 名`);
      const 依据 = typeof k.依据 === 'string' ? k.依据 : undefined;
      const 形状 = k.形状 ?? (k.折线 !== undefined ? '走廊' : '矩形');
      if (形状 === '走廊') {
        const 线 = k.折线;
        if (!Array.isArray(线) || 线.length < 2) throw 错(`${何}（${k.名}）是走廊，折线 要写至少两个 [x, z]`);
        const 折线 = 线.map((p, j) => 数对(p, `${何}.折线 第 ${j + 1} 点`));
        if (typeof k.半宽 !== 'number' || !(k.半宽 > 0)) throw 错(`${何}（${k.名}）是走廊，要写 半宽（米，正数）`);
        return { 名: k.名, 形状, 折线, 半宽: k.半宽, 去掉: 字符串组(k.去掉, `${何}.去掉`), 依据 };
      }
      if (形状 !== '矩形') throw 错(`${何} 的 形状 只认 矩形、走廊`);
      const 两角 = k.两角 as number[] | undefined;
      if (两角 !== undefined && (!Array.isArray(两角) || 两角.length !== 4 || !两角.every(Number.isInteger))) throw 错(`${何} 的 两角 要写 [x1, z1, x2, z2]`);
      if (!两角 && (k.中心 === undefined || k.半边 === undefined)) throw 错(`${何} 要写 两角，或 中心 加 半边（走廊写 折线、半宽）`);
      return { 名: k.名, 形状, 两角: 两角 as 预生成块['两角'], 中心: k.中心 === undefined ? undefined : 数对(k.中心, `${何}.中心`), 半边: k.半边 === undefined ? undefined : 数对(k.半边, `${何}.半边`), 依据 };
    });
    const 块名 = 块们.map((k) => k.名);
    const 块重名 = 块名.filter((n, i) => 块名.indexOf(n) !== i);
    if (块重名.length) throw 错(`预生成块重名：${块重名.join('、')}`);
    for (const k of 块们) for (const n of k.去掉 ?? []) if (!块们.some((b) => b.名 === n && b.形状 === '矩形')) throw 错(`走廊 ${k.名} 的 去掉 写了 ${n}，没有这个矩形块`);
    return {
      名称: 名,
      文件,
      服务端: d.服务端,
      存档: typeof d.存档 === 'string' ? d.存档 : 名,
      维度,
      包维度,
      种子: d.种子 === undefined ? undefined : String(d.种子),
      Forge: typeof d.Forge === 'string' ? d.Forge : undefined,
      模组: 字符串组(d.模组, '模组'),
      另需模组文件: 字符串组(d.另需模组文件, '另需模组文件'),
      数据包: 字符串组(d.数据包, '数据包'),
      预生成: { 区域文件范围: 范围(预.区域文件范围, '预生成.区域文件范围'), 区块数: typeof 预.区块数 === 'number' ? 预.区块数 : undefined, 块: 块们 },
      包: 包们,
    };
  } catch (e) {
    if ((e as Error).message.startsWith(文件)) throw e;
    throw 错((e as Error).message);
  }
};

export const 读声明 = (名: string): 世界声明 => {
  const f = 声明文件(名);
  if (!fs.existsSync(f)) throw new Error(`没有世界声明 ${path.relative(代码根(), f)}；有的：${列出世界().join('、') || '（无）'}`);
  return 解析声明(fs.readFileSync(f, 'utf8'), 名, path.relative(代码根(), f));
};

/** 存档的世界目录：--存档 给了就用它，否则 <ANIM_GAME>/<服务端>/<存档> */
export const 存档目录 = (w: 世界声明, 覆盖?: string) => (覆盖 ? path.resolve(覆盖) : path.isAbsolute(w.存档) ? w.存档 : path.join(配置('游戏'), w.服务端, w.存档));
export const 区域目录 = (w: 世界声明, 覆盖?: string) => path.join(存档目录(w, 覆盖), 维度区域目录(w.维度));

/** 包在世界声明里吗；不给名字且只有一个包就是它 */
export const 选包 = (w: 世界声明, 名?: string) => {
  if (名) {
    const b = w.包.find((x) => x.名 === 名);
    if (!b) throw new Error(`世界 ${w.名称} 没声明包 ${名}；有：${w.包.map((x) => x.名).join('、') || '（无）'}`);
    return [b];
  }
  return w.包;
};
