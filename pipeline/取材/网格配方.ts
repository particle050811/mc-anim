// anim extract --补网格配方 [--写]：资产锁里有、却没有哪条配方产出的场景网格（网格/<名>/头），按网格头里的 dim、from、to、origin、markers
// 反填一条 mcai 配方，标「不重导」：只记下是从哪个维度、哪块范围导的，下回要重导、或照着导一块相邻的，有据可查。
// 锁里那一版是旧项目当时导的，存档、mcai 都变过，按这条重导字节对不上（docs/迁移.md「旧网格不重导」），所以这类配方 anim extract 不跑。
// 头里有「取材」（新 mcai 导的，记了原样参数）就照抄参数，不再按 from/to 反推。
import fs from 'node:fs';
import { 字节路径, type 资产锁 } from '../资产/资产锁.ts';
import type { 资产条目 } from '../资产/资产表.ts';
import { 展开产物, type 取材清单, type 步骤 } from './清单.ts';

type 三 = [number, number, number];
export type 网格头 = { dim: string; from: 三; to: 三; origin: 三; markers?: Record<string, unknown>; 取材?: { 参数?: Record<string, unknown> } };

export const 不重导原因 =
  '步骤按网格头（dim、from、to、origin、markers）反填，只记范围；锁里是旧项目导的那一版，当时的存档、mcai 都变了，重导字节对不上（docs/迁移.md 旧网格不重导）';

/** 一块网格：基 id（网格/<名>）、头、产物（id → 暂存目录里的文件）、属于哪一侧的锁 */
export type 待补网格 = { 基: string; 头: 网格头; 产物: Record<string, string>; 作品?: string };

const 头id = /^(网格\/.+)\/头$/;

/** 配方里已经产出的 id（通配按锁展开） */
export const 配方产物ids = (q: 取材清单, 锁: 资产锁) => new Set([...q.条目.values()].flatMap((e) => 展开产物(e.产物, 锁).对.map(([id]) => id)));

/** mcai mesh 的 out（不带扩展名）：照资产表 旧路径（参考模型库/<out>.json）；没有就 src/模型/场景/<名，/ 换 ->.网格 */
export const 网格输出 = (基: string, 旧路径?: string) => {
  const m = 旧路径 && /^参考模型库\/(.+)\.json$/.exec(旧路径);
  return m ? m[1]! : `src/模型/场景/${基.slice('网格/'.length).replaceAll('/', '-')}.网格`;
};

/**
 * 锁里有头、没有配方产出的网格。锁们：[锁, 作品名?]，共用锁不写作品名；读头要字节在库里（不在的跳过并报出来）。
 * 表：资产表条目（取 旧路径 定 out）。
 */
export const 缺配方网格 = (
  q: 取材清单,
  锁们: [资产锁, string | undefined][],
  表: Map<string, Pick<资产条目, '旧路径'>>,
  读头 = (e: 资产锁[string]) => JSON.parse(fs.readFileSync(字节路径(e), 'utf8')) as 网格头,
): { 网格: 待补网格[]; 读不到: string[] } => {
  const 全锁 = Object.assign({}, ...锁们.map(([l]) => l)) as 资产锁;
  const 有了 = 配方产物ids(q, 全锁);
  const 网格: 待补网格[] = [];
  const 读不到: string[] = [];
  for (const [锁, 作品] of 锁们) {
    for (const id of Object.keys(锁).sort()) {
      const m = 头id.exec(id);
      if (!m || 有了.has(id)) continue;
      const 基 = m[1]!;
      let 头: 网格头;
      try {
        头 = 读头(锁[id]!);
      } catch {
        读不到.push(id);
        continue;
      }
      const out = 网格输出(基, 表.get(id)?.旧路径);
      const 产物: Record<string, string> = {};
      for (const [部, 后缀] of [['图集', '.png'], ['头', '.json'], ['顶点', '.bin']] as const) if (锁[`${基}/${部}`]) 产物[`${基}/${部}`] = out + 后缀;
      网格.push({ 基, 头, 产物, ...(作品 ? { 作品 } : {}) });
    }
  }
  return { 网格, 读不到 };
};

const 坐标 = (v: readonly number[]) => v.join(',');

/** 一块网格的两步：镜头挪到范围正上方、切到那个维度，再 mesh */
export const 网格步骤 = (g: 待补网格): 步骤[] => {
  const { dim, from, to, origin } = g.头;
  const out = g.产物[`${g.基}/头`]!.replace(/\.json$/, '');
  const 中 = [(Math.min(from[0], to[0]) + Math.max(from[0], to[0]) + 1) / 2, Math.min(Math.max(from[1], to[1]) + 30, 300), (Math.min(from[2], to[2]) + Math.max(from[2], to[2]) + 1) / 2];
  const 原参数 = g.头.取材?.参数;
  const 参数 = 原参数
    ? Object.entries(原参数).map(([k, v]) => `${k}=${String(v)}`)
    : [`from=${坐标(from)}`, `to=${坐标(to)}`, `origin=${坐标(origin)}`, ...(Object.keys(g.头.markers ?? {}).length ? [`mark=${Object.keys(g.头.markers!).sort().join(',')}`] : [])];
  return [
    ['mcai', 'cam', `pos=${坐标(中)}`, 'pitch=90', 'yaw=180', `dim=${dim}`],
    ['mcai', 'mesh', ...参数, `out=${out}`],
  ];
};

/** 按 网格/<第一段> 分组：古城4x/东1、古城4x/北2… 合成一条「古城4x网格」；名字撞了已有条目加「（反填）」；作品锁里的另起一条 */
export const 分组 = (网格们: readonly 待补网格[], 已有名: ReadonlySet<string>): Map<string, 待补网格[]> => {
  const 组 = new Map<string, 待补网格[]>();
  for (const g of 网格们) {
    let 名 = `${g.基.split('/')[1]}网格`;
    if (已有名.has(名)) 名 += '（反填）';
    if (g.作品 && 组.get(名)?.some((x) => x.作品 !== g.作品)) 名 += `（${g.作品}）`;
    组.set(名, [...(组.get(名) ?? []), g]);
  }
  return 组;
};

const 引 = (s: string) => JSON.stringify(s);

/** 一条配方的 TOML 文本（和 extract.toml 里手写的同一种写法） */
export const 网格配方文本 = (名: string, 网格们: readonly 待补网格[]) => {
  const 作品 = 网格们[0]?.作品;
  const 行 = [
    '[["取材"]]',
    `"名称" = ${引(名)}`,
    '"需要" = []',
    '"要开游戏" = true',
    ...(作品 ? [`"作品" = ${引(作品)}`] : []),
    `"不重导" = ${引(不重导原因)}`,
    '"公开版" = "不提取"  # 网格走 Release、图集走「网格图集」',
    '"步骤" = [',
    ...网格们.flatMap((g) => 网格步骤(g).map((s) => `  [${s.map((a) => 引(a as string)).join(', ')}],`)),
    ']',
    '["取材"."产物"]',
    ...网格们.flatMap((g) => Object.entries(g.产物).map(([k, v]) => `${引(k)} = ${引(v)}`)),
  ];
  return 行.join('\n') + '\n';
};

/** 整段追加文本：一个小标题加各条配方 */
export const 补网格配方文本 = (组: Map<string, 待补网格[]>) =>
  `\n# 地标网格（anim extract --补网格配方 按网格头反填，不重导：只记范围，不跑）\n` + [...组].map(([名, gs]) => `\n${网格配方文本(名, gs)}`).join('');
