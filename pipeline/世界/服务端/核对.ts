// 开服前、开服后的核对：世界里的数据包要的模组类在不在 mods/ 的 jar 里，覆盖别人的包有没有启用、排在被盖的包之上。
// 旧项目 取材服务端.py 只认取材 mod 的生成时修整（mcai:region / mcai:edit），这里写成一张表，以后加别的「数据包要靠模组才读得进」照样加一行。
import fs from 'node:fs';
import path from 'node:path';
import { 只读zip } from './zip.ts';

/** 数据包 data/ 下的文件：相对路径（data/…）→ 读内容 */
export const 包条目 = (src: string): Map<string, () => Buffer> => {
  const o = new Map<string, () => Buffer>();
  if (fs.statSync(src).isDirectory()) {
    const 走 = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) 走(f);
        else o.set(path.relative(src, f).split(path.sep).join('/'), () => fs.readFileSync(f));
      }
    };
    if (fs.existsSync(path.join(src, 'data'))) 走(path.join(src, 'data'));
  } else if (src.endsWith('.zip')) {
    const z = new 只读zip(src);
    for (const n of z.名们()) if (n.startsWith('data/') && !n.endsWith('/')) o.set(n, () => z.读(n));
  }
  return o;
};

/** 世界 datapacks/ 里的数据包（zip，或带 pack.mcmeta 的目录），按名字排（服务端也按 id 排序加载） */
export const 世界数据包 = (存档: string) => {
  const d = path.join(存档, 'datapacks');
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .sort()
    .filter((n) => (n.endsWith('.zip') && fs.statSync(path.join(d, n)).isFile()) || fs.existsSync(path.join(d, n, 'pack.mcmeta')))
    .map((n) => ({ 名: n, 路径: path.join(d, n) }));
};

export type 模组要求 = {
  名: string;
  /** 数据包里有没有用到 */
  用到: (条目: Map<string, () => Buffer>) => boolean;
  /** mods/ 里哪个 jar 要有哪个类 */
  jar: RegExp;
  类: string;
  /** 用到它的包要排在它覆盖的包之上（后加载的盖前面的） */
  要盖住别人: boolean;
  缺了: string;
};

export const 模组要求表: 模组要求[] = [
  {
    名: '生成时修整',
    用到: (e) => [...e].some(([k, r]) => /^data\/[^/]+\/worldgen\/density_function\/.+\.json$/.test(k) && /"mcai:(edit|region)"/.test(r().toString('utf8'))),
    jar: /^mcai-.*\.jar$/,
    类: 'mcai/terrain/TerrainTypes.class',
    要盖住别人: true,
    缺了: '取材 mod 没有修整（mcai:region、mcai:edit）：专用服务端读不进修整包会起不来。anim mcai build 装上含修整的 jar（别的分支 build 的可能不含）',
  },
];

/** 开服前：世界用到的数据包要的模组类都在吗；返回问题列表和要盖住别人的包 */
export const 开服前核对 = (服务端目录: string, 存档: string) => {
  const 问题: string[] = [];
  const 要盖: string[] = [];
  const mods = path.join(服务端目录, 'mods');
  const jars = fs.existsSync(mods) ? fs.readdirSync(mods).filter((n) => n.endsWith('.jar')) : [];
  for (const p of 世界数据包(存档)) {
    const e = 包条目(p.路径);
    for (const r of 模组要求表) {
      if (!r.用到(e)) continue;
      if (r.要盖住别人) 要盖.push(p.名);
      const 有 = jars.filter((n) => r.jar.test(n)).some((n) => new 只读zip(path.join(mods, n)).条目.has(r.类));
      if (!有) 问题.push(`数据包 ${p.名} 用到${r.名}，可 ${mods} 里没有含 ${r.类} 的 jar：${r.缺了}`);
    }
  }
  return { 问题, 要盖 };
};

/** 开服后：/datapack list enabled 那一行解析出启用的包（按加载顺序） */
export const 解析启用包 = (行: string) => [...行.matchAll(/\[(\S+) \(/g)].map((m) => m[1]!);

/** 要盖住别人的包启用了、并且排在和它有重叠文件的包之上 */
export const 排序核对 = (存档: string, 要盖: readonly string[], 启用: readonly string[]) => {
  const 问题: string[] = [];
  const 包们 = 世界数据包(存档);
  for (const 名 of 要盖) {
    const 我 = `file/${名}`;
    if (!启用.includes(我)) {
      问题.push(`数据包 ${我} 没有启用（启用的：${启用.join('、') || '无'}）`);
      continue;
    }
    const 我的 = new Set(包条目(path.join(存档, 'datapacks', 名)).keys());
    for (const p of 包们) {
      if (p.名 === 名) continue;
      const 别人 = `file/${p.名}`;
      if (!启用.includes(别人) || 启用.indexOf(别人) < 启用.indexOf(我)) continue;
      if ([...包条目(p.路径).keys()].some((k) => 我的.has(k))) 问题.push(`数据包 ${我} 排在 ${别人} 下面，覆盖的文件会被它盖回去`);
    }
  }
  return 问题;
};
