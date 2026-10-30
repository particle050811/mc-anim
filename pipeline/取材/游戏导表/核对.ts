// 游戏导出的群系色表、方块表（mcai biomes / blocks）和手写表（数据/场景/关键帧/群系色、方块表，sourcing/extract/关键帧方块.py 出的）逐项比。
// 只读、只出报告：迁移期不拿导出表替换手写表（会改画面），报告给新章节选表、给手写规则找错用。
// 群系：定值逐项比；随位置变的，拿现行规则（engine/voxel/群系色.ts 的 grassColor、foliageColor、waterColor，喂手写表）在导出表的采样点上算，和游戏给的比。
// 方块：手写表的键（属性只写一部分）按「属性都对上、其余取默认状态的值」对到导出表的完整状态，再比标志各位、染色路、面（面按贴图名比，顶点从最小的角起头，不管手写表的起头）。

export type 群系条目 = { 草: string; 叶: string; 水: string; 草修饰?: string; 叶修饰?: string; 采样?: { 草?: string[]; 叶?: string[]; 水?: string[] } };
export type 群系表 = { 群系: Record<string, 群系条目>; 采样点?: [number, number][] };
/** 现行规则：颜色是 0xRRGGBB 整数 */
export type 求色 = { 草: (群系: string, x: number, z: number) => number; 叶: (群系: string, x: number, z: number) => number; 水: (群系: string) => number };

const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

export type 群系报告 = {
  手写数: number;
  导出数: number;
  只在导出: string[];
  只在手写: string[];
  定值不同: { 群系: string; 项: string; 手写: string; 导出: string }[];
  修饰不同: { 群系: string; 项: string; 手写?: string; 导出?: string }[];
  规则核对: { 群系: string; 项: string; 点数: number; 不同: number; 例: { x: number; z: number; 规则: string; 游戏: string }[]; 出错?: string }[];
};

export const 核对群系 = (导出: 群系表, 手写: 群系表, 规则?: 求色): 群系报告 => {
  const 新 = 导出.群系, 旧 = 手写.群系;
  const 共有 = Object.keys(旧).filter((k) => k in 新).sort();
  const r: 群系报告 = {
    手写数: Object.keys(旧).length,
    导出数: Object.keys(新).length,
    只在导出: Object.keys(新).filter((k) => !(k in 旧)).sort(),
    只在手写: Object.keys(旧).filter((k) => !(k in 新)).sort(),
    定值不同: [],
    修饰不同: [],
    规则核对: [],
  };
  for (const id of 共有) {
    const a = 旧[id]!, b = 新[id]!;
    for (const 项 of ['草', '叶', '水'] as const) if (a[项] !== b[项]) r.定值不同.push({ 群系: id, 项, 手写: a[项], 导出: b[项] });
    for (const 项 of ['草修饰', '叶修饰'] as const) if (a[项] !== b[项]) r.修饰不同.push({ 群系: id, 项, 手写: a[项], 导出: b[项] });
  }
  const 点 = 导出.采样点 ?? [];
  if (规则 && 点.length) {
    for (const id of 共有) {
      const b = 新[id]!;
      for (const 项 of ['草', '叶', '水'] as const) {
        const 游戏 = b.采样?.[项] ?? 点.map(() => b[项]);
        const 行: 群系报告['规则核对'][number] = { 群系: id, 项, 点数: 点.length, 不同: 0, 例: [] };
        try {
          点.forEach(([x, z], i) => {
            const c = hex(项 === '草' ? 规则.草(id, x, z) : 项 === '叶' ? 规则.叶(id, x, z) : 规则.水(id));
            if (c !== 游戏[i]) {
              行.不同++;
              if (行.例.length < 3) 行.例.push({ x, z, 规则: c, 游戏: 游戏[i]! });
            }
          });
        } catch (e) {
          行.出错 = (e as Error).message;
        }
        if (行.不同 || 行.出错) r.规则核对.push(行);
      }
    }
  }
  return r;
};

// ---------- 方块表 ----------
export type 方块条目 = [number, string | null, ...number[]];
export type 方块表 = { 贴图: string[]; 面组: unknown[][][]; 方块: Record<string, 方块条目>; 附加?: { 不画?: string[] } };

export const 拆状态 = (s: string) => {
  const i = s.indexOf('[');
  if (i < 0) return { 方块: s, 属性: {} as Record<string, string> };
  const 属性: Record<string, string> = {};
  for (const kv of s.slice(i + 1, -1).split(',')) {
    if (!kv) continue;
    const [k, v] = kv.split('=');
    属性[k!] = v!;
  }
  return { 方块: s.slice(0, i), 属性 };
};

/** 导出表按方块分的状态（表里的顺序，第一个是默认状态） */
export const 按方块分 = (表: 方块表) => {
  const m = new Map<string, { 键: string; 属性: Record<string, string> }[]>();
  for (const 键 of Object.keys(表.方块)) {
    const { 方块, 属性 } = 拆状态(键);
    let l = m.get(方块);
    if (!l) m.set(方块, (l = []));
    l.push({ 键, 属性 });
  }
  return m;
};

/** 手写表的键 → 导出表的状态：手写键写了的属性都要一样；其余属性优先取和默认状态（导出表里该方块第一个状态）一样的 */
export const 对应状态 = (手写键: string, 分: ReturnType<typeof 按方块分>): string | undefined => {
  const { 方块, 属性 } = 拆状态(手写键);
  const l = 分.get(方块);
  if (!l) return undefined;
  const 合 = l.filter((s) => Object.entries(属性).every(([k, v]) => s.属性[k] === v));
  if (!合.length) return undefined;
  const 默认 = l[0]!.属性;
  return (合.find((s) => Object.entries(s.属性).every(([k, v]) => k in 属性 || 默认[k] === v)) ?? 合[0]!).键;
};

type 面 = (string | number)[];

/** 一个面换成比较用的文本：贴图号换贴图名，四个角（xyz + uv）从最小的那个角起头、绕向不变 */
export const 标准面 = (f: 面, 贴图: string[], 带朝向 = true) => {
  const 角: number[][] = [];
  for (let i = 0; i < 4; i++) 角.push([...(f.slice(6 + i * 3, 9 + i * 3) as number[]), ...(f.slice(18 + i * 2, 20 + i * 2) as number[])]);
  let 起 = 0;
  for (let i = 1; i < 4; i++) if (比角(角[i]!, 角[起]!) < 0) 起 = i;
  const 转 = [...角.slice(起), ...角.slice(0, 起)];
  const 叠 = (f[3] as number) >= 0 ? 贴图[f[3] as number] : '';
  return JSON.stringify([带朝向 ? f[0] : '', f[1], 贴图[f[2] as number], 叠, f[4], f[5], 转]);
};
const 比角 = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};
/** 只看几何：四个角的位置排好序 */
const 几何 = (f: 面) => {
  const 角: string[] = [];
  for (let i = 0; i < 4; i++) 角.push((f.slice(6 + i * 3, 9 + i * 3) as number[]).join(','));
  return 角.sort().join(';');
};

const 面们 = (表: 方块表, 条目: 方块条目) => (条目.slice(2) as number[]).flatMap((g) => 表.面组[g] as 面[]);
const 同多重集 = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

export const 标志位 = { 类: 3, 满: 4, 遮: 8, 光: 16, 转: 32, 偏: 64 } as const;
const 取位 = (flags: number, 名: keyof typeof 标志位) => (名 === '类' ? ['solid', 'cutout', 'translucent', 'liquid'][flags & 3]! : (flags & 标志位[名]) !== 0 ? '是' : '否');

export type 方块报告 = {
  状态数: { 手写: number; 导出: number };
  方块数: { 手写: number; 导出: number };
  贴图数: { 手写: number; 导出: number; 只在手写: string[]; 只在导出数: number };
  只在导出的方块: { 数: number; 按命名空间: Record<string, number>; 例: string[] };
  只在手写的方块: string[];
  手写状态对不上: string[];
  导出不画: string[];
  对上: number;
  面: { 一致: number; 只差朝向: number; 贴图不同: number; 其余不同: number; 几何不同: number; 例: Record<string, { 手写键: string; 导出键: string; 说明: string }[]> };
  标志不同: Record<string, { 数: number; 组合: Record<string, number>; 例: string[] }>;
  染色不同: { 数: number; 组合: Record<string, number>; 例: string[] };
  多出的状态: { 数: number; 按命名空间: Record<string, number>; 最多的方块: [string, number][] };
};

export const 核对方块 = (导出: 方块表, 手写: 方块表): 方块报告 => {
  const 分 = 按方块分(导出);
  const 手写方块 = new Set(Object.keys(手写.方块).map((k) => 拆状态(k).方块));
  const 不画 = new Set(导出.附加?.不画 ?? []);
  const 新贴图 = new Set(导出.贴图);
  const 旧贴图 = new Set(手写.贴图);
  const 只在导出方块 = [...分.keys()].filter((b) => !手写方块.has(b)).sort();
  const r: 方块报告 = {
    状态数: { 手写: Object.keys(手写.方块).length, 导出: Object.keys(导出.方块).length },
    方块数: { 手写: 手写方块.size, 导出: 分.size },
    贴图数: { 手写: 手写.贴图.length, 导出: 导出.贴图.length, 只在手写: 手写.贴图.filter((t) => !新贴图.has(t)), 只在导出数: 导出.贴图.filter((t) => !旧贴图.has(t)).length },
    只在导出的方块: { 数: 只在导出方块.length, 按命名空间: 数命名空间(只在导出方块), 例: 只在导出方块.slice(0, 40) },
    只在手写的方块: [...手写方块].filter((b) => !分.has(b) && !不画.has(b)).sort(),
    手写状态对不上: [],
    导出不画: [...手写方块].filter((b) => !分.has(b) && 不画.has(b)).sort(),
    对上: 0,
    面: { 一致: 0, 只差朝向: 0, 贴图不同: 0, 其余不同: 0, 几何不同: 0, 例: {} },
    标志不同: {},
    染色不同: { 数: 0, 组合: {}, 例: [] },
    多出的状态: { 数: 0, 按命名空间: {}, 最多的方块: [] },
  };
  const 用到 = new Set<string>();
  const 记例 = (类: string, 手写键: string, 导出键: string, 说明: string) => {
    const l = (r.面.例[类] ??= []);
    if (l.length < 12) l.push({ 手写键, 导出键, 说明 });
  };
  for (const [键, 旧条] of Object.entries(手写.方块)) {
    if (!分.has(拆状态(键).方块)) continue;
    const 新键 = 对应状态(键, 分);
    if (!新键) {
      r.手写状态对不上.push(键);
      continue;
    }
    用到.add(新键);
    r.对上++;
    const 新条 = 导出.方块[新键]!;
    for (const 名 of Object.keys(标志位) as (keyof typeof 标志位)[]) {
      const a = 取位(旧条[0], 名), b = 取位(新条[0], 名);
      if (a === b) continue;
      const s = (r.标志不同[名] ??= { 数: 0, 组合: {}, 例: [] });
      s.数++;
      s.组合[`${a}→${b}`] = (s.组合[`${a}→${b}`] ?? 0) + 1;
      if (s.例.length < 12) s.例.push(键);
    }
    if ((旧条[1] ?? null) !== (新条[1] ?? null)) {
      r.染色不同.数++;
      const k = `${旧条[1] ?? '不染'}→${新条[1] ?? '不染'}`;
      r.染色不同.组合[k] = (r.染色不同.组合[k] ?? 0) + 1;
      if (r.染色不同.例.length < 20) r.染色不同.例.push(`${键}：${k}`);
    }
    const 旧面 = 面们(手写, 旧条), 新面 = 面们(导出, 新条);
    if (同多重集(旧面.map((f) => 标准面(f, 手写.贴图)), 新面.map((f) => 标准面(f, 导出.贴图)))) r.面.一致++;
    else if (同多重集(旧面.map((f) => 标准面(f, 手写.贴图, false)), 新面.map((f) => 标准面(f, 导出.贴图, false)))) {
      r.面.只差朝向++;
      记例('只差朝向', 键, 新键, '');
    } else if (!同多重集(旧面.map(几何), 新面.map(几何))) {
      r.面.几何不同++;
      记例('几何不同', 键, 新键, `手写 ${旧面.length} 面、导出 ${新面.length} 面`);
    } else {
      const 贴 = (t: 方块表, fs: 面[]) => fs.map((f) => `${几何(f)}|${t.贴图[f[2] as number]}`);
      if (!同多重集(贴(手写, 旧面), 贴(导出, 新面))) {
        r.面.贴图不同++;
        const a = new Set(旧面.map((f) => 手写.贴图[f[2] as number])), b = new Set(新面.map((f) => 导出.贴图[f[2] as number]));
        记例('贴图不同', 键, 新键, `手写 ${[...a].join('、')}；导出 ${[...b].join('、')}`);
      } else {
        r.面.其余不同++;
        记例('其余不同', 键, 新键, 第一处不同(旧面.map((f) => 标准面(f, 手写.贴图, false)), 新面.map((f) => 标准面(f, 导出.贴图, false))));
      }
    }
  }
  const 多出 = Object.keys(导出.方块).filter((k) => !用到.has(k));
  r.多出的状态.数 = 多出.length;
  r.多出的状态.按命名空间 = 数命名空间(多出);
  const 按块 = new Map<string, number>();
  for (const k of 多出) 按块.set(拆状态(k).方块, (按块.get(拆状态(k).方块) ?? 0) + 1);
  r.多出的状态.最多的方块 = [...按块].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 15);
  return r;
};

const 第一处不同 = (a: string[], b: string[]) => {
  const sa = new Set(a), sb = new Set(b);
  const x = a.find((f) => !sb.has(f)), y = b.find((f) => !sa.has(f));
  return `手写 ${x ?? '（无）'}；导出 ${y ?? '（无）'}`;
};

const 数命名空间 = (ids: string[]) => {
  const m: Record<string, number> = {};
  for (const id of ids) {
    const ns = id.slice(0, id.indexOf(':'));
    m[ns] = (m[ns] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};

// ---------- 报告文本 ----------
export const 报告文本 = (群系?: 群系报告, 方块?: 方块报告) => {
  const l: string[] = ['# 游戏导表核对', ''];
  if (群系) {
    l.push('## 群系色', '');
    l.push(`手写 ${群系.手写数} 个群系，导出 ${群系.导出数} 个；只在导出 ${群系.只在导出.length} 个，只在手写 ${群系.只在手写.length} 个。`, '');
    if (群系.只在手写.length) l.push(`只在手写：${群系.只在手写.join('、')}`, '');
    if (群系.只在导出.length) l.push(`只在导出：${群系.只在导出.join('、')}`, '');
    l.push(`定值不同 ${群系.定值不同.length} 处${群系.定值不同.length ? '：' : '。'}`, '');
    for (const d of 群系.定值不同) l.push(`- ${d.群系} ${d.项}：手写 ${d.手写}，游戏 ${d.导出}`);
    if (群系.定值不同.length) l.push('');
    l.push(`修饰不同 ${群系.修饰不同.length} 处${群系.修饰不同.length ? '：' : '。'}`, '');
    for (const d of 群系.修饰不同) l.push(`- ${d.群系} ${d.项}：手写 ${d.手写 ?? '无'}，导出 ${d.导出 ?? '无'}`);
    if (群系.修饰不同.length) l.push('');
    l.push(`现行规则（engine/voxel/群系色.ts + 手写表）在采样点上和游戏不一样的 ${群系.规则核对.length} 项${群系.规则核对.length ? '：' : '。'}`, '');
    for (const d of 群系.规则核对) {
      l.push(`- ${d.群系} ${d.项}：${d.出错 ? `出错 ${d.出错}` : `${d.点数} 个点里 ${d.不同} 个不同，如 ${d.例.map((e) => `(${e.x}, ${e.z}) 规则 ${e.规则} 游戏 ${e.游戏}`).join('；')}`}`);
    }
    if (群系.规则核对.length) l.push('');
  }
  if (方块) {
    l.push('## 方块表', '');
    l.push(`状态：手写 ${方块.状态数.手写}，导出 ${方块.状态数.导出}（导出是全部状态里画得出来的）。方块：手写 ${方块.方块数.手写}，导出 ${方块.方块数.导出}。贴图：手写 ${方块.贴图数.手写}，导出 ${方块.贴图数.导出}。`, '');
    l.push(`手写表的键对上导出状态 ${方块.对上} 个；对不上的 ${方块.手写状态对不上.length} 个；导出里这个方块一个状态都不画的 ${方块.导出不画.length} 种；导出里没有的方块 ${方块.只在手写的方块.length} 种。`, '');
    if (方块.只在手写的方块.length) l.push(`导出里没有的方块：${方块.只在手写的方块.join('、')}`, '');
    if (方块.导出不画.length) l.push(`导出不画（游戏的方块渲染器不出面）：${方块.导出不画.join('、')}`, '');
    if (方块.手写状态对不上.length) l.push(`对不上的手写键（前 30）：${方块.手写状态对不上.slice(0, 30).join('、')}`, '');
    const m = 方块.面;
    l.push(`面：一致 ${m.一致}，只差朝向 ${m.只差朝向}，几何不同 ${m.几何不同}，几何一样贴图不同 ${m.贴图不同}，其余不同（uv、叠加层、染色、明暗、剔除）${m.其余不同}。`, '');
    for (const [类, es] of Object.entries(m.例)) {
      l.push(`${类}的例子：`, '');
      for (const e of es) l.push(`- ${e.手写键} → ${e.导出键}${e.说明 ? `：${e.说明}` : ''}`);
      l.push('');
    }
    l.push('标志位不同（手写→游戏）：', '');
    for (const [名, s] of Object.entries(方块.标志不同)) l.push(`- ${名} ${s.数} 个：${Object.entries(s.组合).map(([k, v]) => `${k} ${v}`).join('，')}；如 ${s.例.slice(0, 5).join('、')}`);
    l.push('');
    l.push(`染色路不同 ${方块.染色不同.数} 个：${Object.entries(方块.染色不同.组合).map(([k, v]) => `${k} ${v}`).join('，')}`, '');
    for (const e of 方块.染色不同.例) l.push(`- ${e}`);
    l.push('');
    const d = 方块.多出的状态;
    l.push(`导出多出的状态（手写表没有对应键的）${d.数} 个，按命名空间：${Object.entries(d.按命名空间).map(([k, v]) => `${k} ${v}`).join('，')}。最多的方块：${d.最多的方块.map(([k, v]) => `${k} ${v}`).join('，')}。`, '');
    l.push(`只在导出的方块 ${方块.只在导出的方块.数} 种，按命名空间：${Object.entries(方块.只在导出的方块.按命名空间).map(([k, v]) => `${k} ${v}`).join('，')}；如 ${方块.只在导出的方块.例.slice(0, 20).join('、')}`, '');
    l.push(`只在手写表的贴图 ${方块.贴图数.只在手写.length} 张${方块.贴图数.只在手写.length ? `：${方块.贴图数.只在手写.slice(0, 40).join('、')}` : ''}；只在导出的贴图 ${方块.贴图数.只在导出数} 张。`, '');
  }
  return l.join('\n') + '\n';
};
