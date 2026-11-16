// layers 规则：pipeline 内部分层、engine/core 不引别的 engine 子目录、任何循环引用（连只有类型的），以及只有类型的边再过一遍结构规则的渲染分层。
// 起因：用户 11-16 问「为什么会有循环引入」：pipeline 内部没有分层约定，下层模块顺手引上层，环就长出来了；esbuild 图又擦掉类型导入，只靠类型的环查不到。
// 引用图见 ../引用图.ts（源码级，含 import type）；渲染层（engine ← 库 ← 作品）的方向规则仍在 结构.ts，这里只补类型边。
import type { CheckContext, CheckReport } from '../../源码/上下文.ts';
import { buildRefGraph, cyclesOf } from '../引用图.ts';
import { edgeIssue, readSceneOrder } from './结构.ts';

/**
 * pipeline 的层，从下往上；上层可以引下层和同层，下层不许引上层（import type 也算）。
 * 每项是 pipeline/ 下的目录（带 /）或单个文件，按最长前缀匹配；任何目录下名叫 命令.ts 的文件（cli/命令.ts 除外）都是入口层。
 * 新目录要先登记在这里，没登记的报错。
 */
export const pipelineLayers: { layer: string; paths: string[]; why: string }[] = [
  { layer: '基础', paths: ['环境/', 'cli/参数.ts'], why: '路径、子进程、收尾、去重、参数解析：谁都要用，自己不依赖管线的任何业务' },
  { layer: '闸', paths: ['闸/'], why: '资源闸和调度：重任务都要先过闸，闸只依赖基础' },
  { layer: '记录', paths: ['运行记录/', 'cli/命令.ts'], why: '运行记录；cli/命令.ts 的 Command 类型带运行记录，所以和它同层' },
  { layer: '资产', paths: ['资产/', '清单/'], why: '资产表、资产锁、作品清单的读取：只读声明，不渲染、不取材' },
  { layer: '素材', paths: ['取材/', '配音/', '世界/'], why: '取材、配音、世界：生产资产字节，用资产表登记' },
  { layer: '源码', paths: ['源码/'], why: '读仓库源码和作品内容（检查上下文、清单内容、台词表）：检查、分发、段框架都要读' },
  { layer: '零件', paths: ['合成/', '段框架/'], why: '字幕、混音这些合成零件和段框架生成：被渲染和出片用' },
  { layer: '分发', paths: ['分发/'], why: '随仓库、缺字节、发布锁：决定哪些字节跟仓库走，指纹要读' },
  { layer: '指纹', paths: ['指纹/'], why: '段指纹：渲染前判断过没过期' },
  {
    layer: '渲',
    paths: ['渲/', '资产/webpack.ts'],
    why: '调 Remotion 渲静帧、渲段。资产/webpack.ts 是打包配置，要引 指纹/求解指纹.ts，按职责属于渲；但它的路径和全文进每个段的指纹（指纹.ts 的 bundleRuleFiles），一挪全片过期，所以留在原处、按文件登记在这一层。下回 webpack.ts 本来就要改时搬进 渲/，删掉这一项',
  },
  { layer: '验收', paths: ['验收/'], why: '段签、认指纹、逐帧校验：拿渲出来的东西比' },
  { layer: '缓存', paths: ['缓存/'], why: '缓存回收：要知道哪些切片还被段签、成片引着' },
  { layer: '出片', paths: ['出片/'], why: '渲段、拼成片：唯一的出片路，用到上面所有层' },
  { layer: '工具', paths: ['检查/', '预览/', '适配器/', '改名/', '迁移/'], why: '检查、预览、平台适配、改名、迁移：站在管线顶上看全局，管线本身不引它们' },
  { layer: '入口', paths: ['cli/'], why: '命令行入口和各目录的 命令.ts：只有 cli 引它们' },
];

const entryLayer = '入口';
const layerRank = new Map(pipelineLayers.map((l, i) => [l.layer, i]));
const layerPaths = pipelineLayers.flatMap((l) => l.paths.map((p) => ({ prefix: `pipeline/${p}`, layer: l.layer }))).sort((a, b) => b.prefix.length - a.prefix.length);

/** pipeline 文件在哪层、算哪个模块（查模块间的环用）；不是 pipeline 文件返回 null，没登记返回 layer undefined */
export const pipelineSlot = (file: string): { layer: string | undefined; unit: string } | null => {
  if (!file.startsWith('pipeline/')) return null;
  if (file.endsWith('/命令.ts') && file !== 'pipeline/cli/命令.ts') return { layer: entryLayer, unit: file };
  const hit = layerPaths.find((x) => (x.prefix.endsWith('/') ? file.startsWith(x.prefix) : file === x.prefix));
  if (hit) return { layer: hit.layer, unit: hit.prefix };
  const parts = file.split('/');
  return { layer: undefined, unit: parts.length > 2 ? `${parts[0]}/${parts[1]}/` : file };
};

/**
 * 已知例外。每条写清为什么留、什么时候删；对应的边或环没了就报「例外过期」，逼着删。
 */
export const knownCycles: { files: string[]; why: string }[] = [
  {
    files: ['作品/应力转动/地点/边城/6-3-2/转场.ts', '作品/应力转动/地点/边城/6-3-下坠/编排/机位.ts'],
    why: '6-3-2 转场推完的镜头要接上下坠的俯冲跟拍（机位.ts 取 diveCam），转场又用下坠机位的 Cam 类型；这两处属于 场/段 的东西还压在 地点/边城 下面，另有人在改。地点/ 搬回各自的 场/段 目录时把 Cam 类型和共用的镜头算式拆到下层，删掉这一条',
  },
];
export const knownCoreEdges: { from: string; to: string; why: string }[] = [
  {
    from: 'engine/core/拼段.tsx',
    to: 'engine/段/时间.tsx',
    why: '拼段要按秒换帧，用的是段框架的 useFrameRate，按职责该放 engine/段/；引它的 5 个段和 6-1 的 分段.tsx 正在别的分支上改第 6、7 章，等那边合并后把 拼段.tsx 搬进 engine/段/、改掉这几处 import，删掉这一条',
  },
];

export const checkLayering = async (c: CheckContext, report: CheckReport) => {
  const graph = buildRefGraph(c);
  const fileExists = (p: string) => graph.edges.has(p);

  // 1. pipeline 分层方向
  const unitEdges = new Map<string, Set<string>>();
  const unknownDirs = new Set<string>();
  for (const [from, edges] of graph.edges) {
    const a = pipelineSlot(from);
    if (!a) continue;
    if (a.layer === undefined) unknownDirs.add(a.unit);
    for (const e of edges) {
      const b = pipelineSlot(e.to);
      if (!b || a.layer === undefined || b.layer === undefined) continue;
      if (layerRank.get(b.layer)! > layerRank.get(a.layer)!) {
        report.错(`pipeline 分层方向反了：${a.layer} 层不能引 ${b.layer} 层（${from}:${e.line} → ${e.to}${e.kind === 'type' ? '，只引类型也算' : ''}）。往下挪代码，或把两边都要的拆成下层的小模块（分层表在 pipeline/检查/规则/分层.ts）`, from);
      }
      if (a.unit !== b.unit) (unitEdges.get(a.unit) ?? unitEdges.set(a.unit, new Set()).get(a.unit)!).add(b.unit);
    }
  }
  for (const d of unknownDirs) report.错(`${d} 不在 pipeline 分层表里：先在 pipeline/检查/规则/分层.ts 的 pipelineLayers 登记它在哪层（pipeline/ 下不放散文件，放进某个目录）`, d);

  // 2. pipeline 模块（目录）之间的环：同层可以互引文件，但目录之间不许绕成环
  for (const scc of cyclesOf(unitEdges.keys(), (u) => unitEdges.get(u) ?? [])) {
    const via = scc.flatMap((u) =>
      [...graph.edges]
        .filter(([f]) => pipelineSlot(f)?.unit === u)
        .flatMap(([f, es]) => es.filter((e) => e.to !== f && scc.includes(pipelineSlot(e.to)?.unit ?? '') && pipelineSlot(e.to)!.unit !== u).map((e) => `${f}:${e.line} → ${e.to}`)),
    );
    report.错(`pipeline 模块之间成环：${scc.join(' ↔ ')}（${via.join('；')}）`);
  }

  // 3. engine/core 是最底层，不许引别的 engine 子目录
  const coreEdgesSeen = new Set<string>();
  for (const [from, edges] of graph.edges) {
    if (!from.startsWith('engine/core/')) continue;
    for (const e of edges) {
      if (!e.to.startsWith('engine/') || e.to.startsWith('engine/core/')) continue;
      const known = knownCoreEdges.find((k) => k.from === from && k.to === e.to);
      if (known) coreEdgesSeen.add(`${from}→${e.to}`);
      else report.错(`engine/core 是最底层，不许引别的 engine 子目录：${from}:${e.line} → ${e.to}（把要用的东西挪进 core，或把这个文件挪出 core）`, from);
    }
  }
  for (const k of knownCoreEdges) {
    if (fileExists(k.from) && !coreEdgesSeen.has(`${k.from}→${k.to}`)) report.错(`例外过期：${k.from} 已经不引 ${k.to}，删掉 分层.ts 的 knownCoreEdges 里这一条`, k.from);
  }

  // 4. 文件级的环（engine、库、pipeline、本作品，连只有类型的引用）
  const next = (f: string) => (graph.edges.get(f) ?? []).map((e) => e.to).filter((t) => graph.edges.has(t));
  const cyclesSeen = new Set<number>();
  for (const scc of cyclesOf(graph.edges.keys(), next)) {
    const known = knownCycles.findIndex((k) => k.files.length === scc.length && k.files.every((f) => scc.includes(f)));
    if (known >= 0) {
      cyclesSeen.add(known);
      continue;
    }
    const inner = scc.flatMap((f) => (graph.edges.get(f) ?? []).filter((e) => scc.includes(e.to)).map((e) => `${f}:${e.line} → ${e.to}${e.kind === 'type' ? '（类型）' : ''}`));
    report.错(`循环引用：${scc.join(' ↔ ')}（${inner.join('；')}）。把两边都要的东西拆到一个下层的小文件，或把引用方向理顺`, scc[0]);
  }
  knownCycles.forEach((k, i) => {
    if (k.files.every(fileExists) && !cyclesSeen.has(i)) report.错(`例外过期：${k.files.join(' ↔ ')} 已经不成环，删掉 分层.ts 的 knownCycles 里这一条`, k.files[0]);
  });

  // 5. 只有类型的边，再过一遍结构规则的渲染分层（esbuild 图里没有它们）
  const depGraph = await c.depGraph();
  const sceneOrder = await readSceneOrder(c);
  for (const [from, edges] of graph.edges) {
    const valueTargets = new Set((depGraph.edges.get(from) ?? []).map((e) => e.dest));
    for (const e of edges) {
      if (e.kind !== 'type' || valueTargets.has(e.to)) continue;
      const issue = edgeIssue(c, from, e.to, sceneOrder, true);
      if (issue) report.错(`只引类型也算：${issue}`, from);
    }
  }
};
