// anim voice list|check|gen|use|lip|backends：配音链。作品的 台词.toml 是唯一人写的源；候选进 <数据根>/run/草稿/配音/，成品登记成私有资产，
// 每句的运行时数据写成 <作品根>/台词/<id>.ts（句模块），段只引自己用的几句。步骤：写 台词.toml 一句 → gen 出候选 → 试听挑一个 → use 定稿（登记、写回、出口型）。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 配置, 数据根 } from '../环境/配置.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 相对代码根 } from '../环境/路径.ts';
import { 旧台词改名, 旧表资产, 读旧配音表 } from '../适配器/旧项目/配音表.ts';
import { 登记入库 } from '../资产/命令.ts';
import { 作品资产表目录, 读两侧资产表 } from '../资产/资产表.ts';
import { 作品资产锁路径, 字节路径, 读资产锁, 资产锁路径, type 资产锁 } from '../资产/资产锁.ts';
import { 过放行闸, 过渲染闸 } from '../闸/闸.ts';
import { 列句模块, 句模块目录, 句模块路径, 写句模块文本, 读句模块 } from './句模块.ts';
import { 跑配音py } from './python.ts';
import { 改台词字段, 念的字, 配音文本哈希, 读作品台词, type 作品台词, type 台词行 } from './台词表.ts';
import { 候选目录, 句问题, 成品sha, 手修可用, 拼句, 读候选说明, wav秒数, type 候选说明, type 字们, type 测量 } from './配音.ts';

const 台词文件 = () => path.join(作品根(), '台词.toml');
const 两锁 = (): 资产锁 => ({ ...读资产锁(资产锁路径()), ...读资产锁(作品资产锁路径(作品根())) });
const 读表 = (): 作品台词 => {
  const t = 读作品台词(台词文件());
  if (!t) throw new Error(`${相对代码根(台词文件())} 不存在：这部作品还没有台词表`);
  return t;
};
const 选行 = (表: 作品台词, 前缀们: string[], 要配音 = false) => {
  const 行们 = 表.台词.filter((t) => !前缀们.length || 前缀们.some((p) => t.id.startsWith(p)));
  if (前缀们.length && !行们.length) throw new 用法错误(`台词.toml 里没有以 ${前缀们.join('、')} 开头的台词`);
  return 要配音 ? 行们.filter((t) => t.配音) : 行们;
};
const 成品文件 = (行: 台词行, 锁: 资产锁) => 字节路径(锁[行.配音!]!, 数据根());

/** 后端的本机设置：程序位置取 anim 配置，其余取 台词.toml 的 [配音.后端参数.<后端>] */
const 后端配置 = (表: 作品台词, 名: string): Record<string, unknown> => {
  const 本机: Record<string, Record<string, unknown>> = {
    'firered-本机': { 目录: 配置('firered') },
    'indextts2-本机': { 目录: 配置('indextts') },
    'gpt-sovits': { 地址: 配置('gpt_sovits') },
  };
  return { ...(本机[名] ?? {}), ...(表.配音.后端参数[名] ?? {}) };
};

type 后端信息 = { 名: string; 说明: string; 本机: boolean; 云端: boolean; 付费: boolean; 缺: string[] };

// ---------- lip：字 → 嘴 → 句模块 ----------

type 出句选项 = { 重对齐?: boolean; 从旧表?: boolean; 新测量?: Map<string, 测量> };

/** 给这些句子出句模块：字取 口型手修 > （不重对齐时）旧句模块或旧表 > 对齐器；测量取 新测量 > 旧句模块（同一版成品）> 旧表 */
const 出句模块 = async (表: 作品台词, 行们: 台词行[], o: 出句选项) => {
  const 锁 = 两锁();
  const 旧表 = o.从旧表 ? 读旧配音表(作品根(), 锁, 数据根()) : null;
  const 备: { 行: 台词行; sha: string; 测量: 测量; 文件秒数: number; 字?: 字们; 手修: boolean; 旧?: string }[] = [];
  for (const 行 of 行们) {
    const sha = 成品sha(行, 锁);
    if (!sha) throw new Error(`${行.id}：配音「${行.配音}」不在资产锁里`);
    const 文件秒数 = wav秒数(fs.readFileSync(成品文件(行, 锁)));
    const 旧句 = 读句模块(句模块路径(作品根(), 行.id));
    const 同版 = 旧句?.成品sha === sha ? 旧句 : null;
    const 旧 = 旧表?.get(行.id);
    const 测量 = o.新测量?.get(行.id) ?? (同版 ? { 开口: 同版.开口, 有声长: 同版.有声长, 时长: 同版.时长 } : 旧 ? { 开口: 旧.台词.开口, 有声长: 旧.台词.有声长, 时长: 旧.台词.时长 } : null);
    if (!测量) throw new Error(`${行.id}：没有这版成品的测量（开口、有声长、时长），先 anim voice use 定稿`);
    let 字: 字们 | undefined;
    const 手修 = 手修可用(行, sha);
    if (行.口型手修?.字 && !手修) console.error(`${行.id}：口型手修 绑的成品不是现在这版，不用它，照常对齐（重标后改 口型手修.成品sha）`);
    if (手修) 字 = 行.口型手修!.字!;
    else if (!o.重对齐 && 同版 && !同版.手修 && 同版.念 === 念的字(行)) 字 = 同版.字 as 字们;
    else if (!o.重对齐 && 旧?.口型 && 旧.口型.文 === 念的字(行) && 旧.口型.时长 === 文件秒数) 字 = 旧.口型.字;
    备.push({ 行, sha, 测量, 文件秒数, 字, 手修, ...(旧 ? { 旧: 旧.旧id } : {}) });
  }
  const 要对齐 = 备.filter((b) => !b.字);
  if (要对齐.length) {
    const 锁2 = 锁;
    const 句们 = 要对齐.map((b) => ({ id: b.行.id, wav: 成品文件(b.行, 锁2), 念: 念的字(b.行), 语言: b.行.语言 ?? '中文' }));
    console.error(`对齐 ${句们.length} 句（Qwen3-ForcedAligner，CPU）…`);
    const 结果 = await 过放行闸(() => 跑配音py<Record<string, 字们>>('对齐', { 目录: 配置('对齐器'), 句: 句们 }));
    for (const b of 要对齐) b.字 = 结果[b.行.id]!;
  }
  const 嘴们 = await 跑配音py<Record<string, [number, string][]>>('嘴', { 句: 备.map((b) => ({ id: b.行.id, 念: 念的字(b.行), 时长: b.文件秒数, 字: b.字 })) });
  fs.mkdirSync(句模块目录(作品根()), { recursive: true });
  let toml = fs.readFileSync(台词文件(), 'utf8');
  const 写了: string[] = [];
  for (const b of 备) {
    const 句 = 拼句(b.行, { 成品sha: b.sha, 测量: b.测量, 文件秒数: b.文件秒数, 字: b.字!, 手修: b.手修, 嘴: 嘴们[b.行.id]! });
    const f = 句模块路径(作品根(), b.行.id);
    const 文本 = 写句模块文本(句);
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== 文本) {
      fs.writeFileSync(f, 文本);
      写了.push(f);
    }
    toml = 改台词字段(toml, b.行.id, { 开口: 句.开口, 口型: { 成品sha: b.sha } });
    console.log(`${b.行.id}：${b.手修 ? '手修' : b.字 && 要对齐.includes(b) ? '对齐' : '沿用'}的字 ${句.字.length} 个，嘴 ${句.嘴.map((x) => x[1]).join('')}`);
  }
  if (toml !== fs.readFileSync(台词文件(), 'utf8')) fs.writeFileSync(台词文件(), toml);
  return 写了;
};

// ---------- check ----------

const 核对 = async (表: 作品台词, 行们: 台词行[], 对旧表: boolean): Promise<string[]> => {
  const 锁 = 两锁();
  const 问题: string[] = [];
  const 有句: { 行: 台词行; 句: NonNullable<ReturnType<typeof 读句模块>> }[] = [];
  for (const 行 of 行们) {
    const f = 句模块路径(作品根(), 行.id);
    const 句 = 读句模块(f);
    for (const x of 句问题(行, 锁, 句)) 问题.push(`${行.id}：${x}`);
    if (!句) continue;
    if (fs.readFileSync(f, 'utf8') !== 写句模块文本(句)) 问题.push(`${行.id}：句模块被手改过（格式不是 anim voice 写的；改 台词.toml 后 anim voice lip）`);
    const 字节 = 行.配音 && 锁[行.配音] ? 字节路径(锁[行.配音]!, 数据根()) : null;
    if (字节 && fs.existsSync(字节) && wav秒数(fs.readFileSync(字节)) !== 句.文件秒数) 问题.push(`${行.id}：句模块的 文件秒数 ${句.文件秒数} 和成品不符`);
    有句.push({ 行, 句 });
  }
  const 表里 = new Set(表.台词.map((t) => t.id));
  for (const id of 列句模块(作品根())) if (!表里.has(id)) 问题.push(`台词/${id}.ts：台词.toml 里没有这一句（删掉，或把这句写回 台词.toml）`);
  // 嘴由字确定地算出：重算一遍逐项比
  if (有句.length) {
    const 嘴们 = await 跑配音py<Record<string, [number, string][]>>('嘴', { 句: 有句.map(({ 句 }) => ({ id: 句.id, 念: 句.念, 时长: 句.文件秒数, 字: 句.字 })) });
    for (const { 句 } of 有句) if (JSON.stringify(嘴们[句.id]) !== JSON.stringify(句.嘴)) 问题.push(`${句.id}：按字重算的嘴和句模块里的不一样（口型规则或 pypinyin 变了？）`);
  }
  if (对旧表) {
    const 旧表 = 读旧配音表(作品根(), 锁, 数据根());
    for (const { 行, 句 } of 有句) {
      const 旧 = 旧表.get(行.id);
      if (!旧) {
        问题.push(`${行.id}：旧表里没有这一句`);
        continue;
      }
      const 比 = (名: string, a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b) && 问题.push(`${行.id}：${名} 句模块 ${JSON.stringify(a)}，旧表 ${JSON.stringify(b)}`);
      比('角色', 句.角色, 旧.台词.角色);
      比('念', 句.念, 旧.台词.合成 ?? 旧.台词.字);
      比('开口', 句.开口, 旧.台词.开口);
      比('有声长', 句.有声长, 旧.台词.有声长);
      比('时长', 句.时长, 旧.台词.时长);
      if (!旧.口型) 问题.push(`${行.id}：旧口型表里没有这一句`);
      else {
        比('口型的字', 句.字, 旧.口型.字);
        比('嘴', 句.嘴, 旧.口型.嘴);
        比('文件秒数', 句.文件秒数, 旧.口型.时长);
      }
    }
  }
  return 问题;
};

// ---------- gen / use ----------

const 参考 = (表: 作品台词, 行: 台词行, 锁: 资产锁) => {
  const 音 = 表.音色[行.角色];
  const id = 行.合成?.参考 ?? 音?.参考;
  const 逐字稿 = 行.合成?.逐字稿 ?? 音?.逐字稿;
  if (!id || !逐字稿) throw new Error(`${行.id}：没有 ${行.角色} 的音色参考（台词.toml 写 [音色."${行.角色}"] 参考 = "<资产 id>"、逐字稿 = "…"，或这句的 合成.参考、合成.逐字稿）`);
  if (!锁[id]) throw new Error(`${行.id}：音色参考「${id}」不在资产锁里`);
  return { id, 文件: 字节路径(锁[id]!, 数据根()), 逐字稿 };
};

const 生成 = async (表: 作品台词, 行们: 台词行[], p: ReturnType<typeof 解析参数>, 记录: Parameters<命令['跑']>[1]) => {
  const 锁 = 两锁();
  const 后端名 = p.值['--后端'] ?? 表.配音.后端;
  const 种子们 = p.值['--种子'] ? p.值['--种子'].split(',').map(Number) : null;
  const 请求: Record<string, unknown>[] = [];
  const 说明们 = new Map<string, Omit<候选说明, '参数'>>();
  for (const 行 of 行们) {
    const r = 参考(表, 行, 锁);
    const 目录 = 候选目录(数据根(), 作品名(), 行.id);
    for (const 种子 of 种子们 ?? 行.合成?.种子 ?? 表.配音.种子) {
      const 输出 = path.join(目录, `${后端名}-种子${种子}.wav`);
      请求.push({
        id: 行.id, 念: 念的字(行), 语言: 行.语言 ?? '中文', 参考音频: r.文件, 参考逐字稿: r.逐字稿, 种子, 输出,
        语气: 行.语气 ?? '', 语气参考: p.值['--语气参考'] ? path.resolve(p.值['--语气参考']) : (行.合成?.语气参考 ? 字节路径(锁[行.合成.语气参考]!, 数据根()) : ''),
        语气强度: p.值['--强度'] ? Number(p.值['--强度']) : (行.合成?.强度 ?? null), 参数: 行.合成?.参数 ?? {},
      });
      说明们.set(输出, { 后端: 后端名, 种子, 参考: r.id, 念: 念的字(行), 时间: new Date().toISOString() });
    }
  }
  const 配 = 后端配置(表, 后端名);
  if (p.开关.has('--dry-run')) {
    const d = await 跑配音py<{ 缺: string[]; 描述: unknown[] }>('合成', { 后端: 后端名, 配置: 配, 请求, 只描述: true });
    for (const x of d.描述) console.log(JSON.stringify(x, null, 1));
    console.log(`dry-run：${后端名} ${请求.length} 个候选，没合成。${d.缺.length ? `真跑前要补：${d.缺.join('；')}` : '这台机器上能跑'}`);
    return 0;
  }
  const 信息 = (await 跑配音py<后端信息[]>('后端', { 配置: { [后端名]: 配 } })).find((b) => b.名 === 后端名);
  if (!信息) throw new 用法错误(`没有 TTS 后端「${后端名}」（anim voice backends 看有哪些）`);
  if (信息.付费 && !p.开关.has('--允许付费')) throw new 用法错误(`${后端名} 按次收费，确实要用加 --允许付费（先 --dry-run 看请求）`);
  if (信息.云端 && !p.开关.has('--允许云端') && !p.开关.has('--允许付费')) throw new 用法错误(`${后端名} 要把参考音频和台词发到外部服务，确实要用加 --允许云端`);
  if (信息.缺.length) throw new Error(`${后端名} 在这台机器上跑不了：${信息.缺.join('；')}`);
  const 跑 = () => 跑配音py<{ id: string; 种子: number; 输出: string; 成功: boolean; 说明: string; 参数: Record<string, unknown> }[]>('合成', { 后端: 后端名, 配置: 配, 请求 });
  // 本机模型吃 GPU 和十几 GB 统一内存，和渲染一样排队；云端的不占本机
  const 结果 = 信息.本机 ? await 过渲染闸(跑) : await 跑();
  let 坏 = 0;
  for (const r of 结果) {
    const 说明 = 说明们.get(r.输出);
    if (r.成功 && 说明) fs.writeFileSync(r.输出.replace(/\.wav$/i, '.json'), JSON.stringify({ ...说明, 参数: r.参数 }, null, 1) + '\n');
    if (r.成功) 记录.产物.push(r.输出);
    else 坏++;
    console.log(`${r.id} 种子 ${r.种子}：${r.成功 ? r.输出 : '失败'}${r.说明 ? `（${r.说明}）` : ''}`);
  }
  console.log(`候选在 ${path.dirname(结果[0]?.输出 ?? 候选目录(数据根(), 作品名(), ''))}；试听挑一个后 anim voice use <id> <候选.wav>`);
  return 坏 ? 1 : 0;
};

/** 资产表里没有这件就在作品资产表 <作品根>/资产表/配音.toml 末尾补一条（新配音只给这部作品用；私有） */
const 补登记 = (id: string, 来源: string, 许可: string) => {
  const { 条目 } = 读两侧资产表(作品根());
  if (条目.has(id)) return false;
  const f = path.join(作品资产表目录(作品根()), '配音.toml');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const 头 = fs.existsSync(f) ? '' : '# 作品资产表：配音成品和原件（anim voice use 补的条目，可手改 来源、许可、说明）。字段见 assets/README.md。\n';
  const 条 = ['', '[["资产"]]', `id = ${JSON.stringify(id)}`, '"类别" = "配音"', `"来源" = ${JSON.stringify(来源)}`, `"许可" = ${JSON.stringify(许可)}`, '"可见性" = "私有"', ''].join('\n');
  fs.appendFileSync(f, 头 + 条);
  return true;
};

const 定稿 = async (表: 作品台词, 行: 台词行, 候选: string, p: ReturnType<typeof 解析参数>, 记录: Parameters<命令['跑']>[1]) => {
  if (!fs.existsSync(候选)) throw new 用法错误(`没有 ${候选}`);
  // 第 6、7 章的旧段还从旧项目的两份表（数据/配音/台词表、口型）取开口、时长、嘴，换了成品它们不跟着变：声音和嘴会对不上
  if (!p.开关.has('--不管旧表') && [...旧台词改名(作品根()).values()].includes(行.id)) {
    throw new 用法错误(`${行.id} 还被旧段的 台词轨.tsx、配音/口型.ts 经旧表（${旧表资产.台词表}、${旧表资产.口型}）用着，换了成品旧段的开口、时长、嘴不跟着变；用到它的段改用句模块后再换，确实要换加 --不管旧表`);
  }
  const 说明 = 读候选说明(候选);
  const 来源 = 说明
    ? `手工:${说明.后端} 克隆 ${行.角色}（参考 ${说明.参考}），种子 ${说明.种子}${Object.keys(说明.参数).length ? `，${JSON.stringify(说明.参数)}` : ''}，anim voice gen 的候选里挑的`
    : `手工:${p.值['--来源'] ?? '现成的配音（anim voice use 拿进来的）'}`;
  const 成品 = path.join(候选目录(数据根(), 作品名(), 行.id), `成品-${path.basename(候选)}`);
  const 不裁 = p.开关.has('--不裁') || Boolean(行.合成?.不裁);
  const m = await 跑配音py<测量 & { 增益dB: number }>('成品', { 原件: 候选, 成品: 不裁 ? null : 成品, 不裁, 目标响度: 表.配音.目标响度, 峰值上限: 表.配音.峰值上限 });
  const 原件id = `配音/原件/${行.id}`;
  const 成品id = 行.配音 ?? `配音/${行.id}`;
  for (const [id, 源] of [[原件id, 来源], [成品id, `派生:${原件id}+anim voice use（裁静音、拉到 ${表.配音.目标响度} LUFS）`]] as const) {
    if (补登记(id, 源, 表.配音.许可)) console.log(`资产表补了 ${id}（${相对代码根(path.join(作品资产表目录(作品根()), '配音.toml'))}，私有）`);
  }
  const 替换 = p.开关.has('--替换');
  登记入库(原件id, 候选, { 作品根: 作品根(), 替换 });
  const { 条目 } = 登记入库(成品id, 不裁 ? 候选 : 成品, { 作品根: 作品根(), 替换 });
  let toml = fs.readFileSync(台词文件(), 'utf8');
  toml = 改台词字段(toml, 行.id, { 配音: 成品id, 开口: m.开口, 文本哈希: 配音文本哈希(行), 成品sha: 条目.sha256.slice(0, 12) });
  fs.writeFileSync(台词文件(), toml);
  console.log(`${行.id}：成品 ${条目.sha256.slice(0, 12)}，开口 ${m.开口} 秒、有声 ${m.有声长} 秒、共 ${m.时长} 秒，增益 ${m.增益dB} dB`);
  const 新表 = 读表();
  const 写了 = await 出句模块(新表, [新表.台词.find((t) => t.id === 行.id)!], { 新测量: new Map([[行.id, { 开口: m.开口, 有声长: m.有声长, 时长: m.时长 }]]) });
  记录.产物.push(...写了);
};

export const 配音命令: Record<string, 命令> = {
  voice: {
    用法: 'voice list [前缀…] | check [前缀…] [--对旧表] | gen <id…> [--后端 名] [--种子 a,b] [--语气参考 wav] [--强度 x] [--dry-run] [--允许云端] [--允许付费] | use <id> <候选.wav> [--不裁] [--替换] [--不管旧表] [--来源 说明] | lip [前缀…] [--重对齐] [--从旧表] | backends',
    说明: '配音链：台词.toml 一句 → gen 出候选（run/草稿/配音/）→ use 定稿（裁静音拉响度、登记私有资产、写回 台词.toml、出句模块 台词/<id>.ts）；lip 重出口型；check 核对配音、句模块、口型可复现',
    跑: async (args, 记录) => {
      const [动作, ...余] = args;
      const p = 解析参数(余, {
        开关: ['--对旧表', '--dry-run', '--允许云端', '--允许付费', '--不裁', '--替换', '--不管旧表', '--重对齐', '--从旧表'],
        值: ['--后端', '--种子', '--语气参考', '--强度', '--来源'],
      });
      if (动作 === 'backends') {
        const 表 = 读作品台词(台词文件());
        const 名们 = ['firered-本机', 'firered-魔搭', 'indextts2-本机', 'indextts2-runninghub', 'gpt-sovits', 'openai-speech'];
        const 信息们 = await 跑配音py<后端信息[]>('后端', { 配置: Object.fromEntries(名们.map((n) => [n, 表 ? 后端配置(表, n) : {}])) });
        for (const b of 信息们) {
          const 标 = [b.本机 ? '本机' : '', b.云端 ? '云端' : '', b.付费 ? '付费' : ''].filter(Boolean).join('、');
          console.log(`${b.名}${表?.配音.后端 === b.名 ? '（本作品默认）' : ''}  [${标}]  ${b.说明}\n    ${b.缺.length ? '缺：' + b.缺.join('；') : '能跑'}`);
        }
        return 0;
      }
      const 表 = 读表();
      if (动作 === 'list') {
        const 锁 = 两锁();
        let 有问题 = 0;
        for (const 行 of 选行(表, p.位置)) {
          const 问题 = 句问题(行, 锁, 读句模块(句模块路径(作品根(), 行.id)));
          if (问题.length) 有问题++;
          const 配 = !行.配音 ? '没配音' : 问题.length ? '要处理' : '齐';
          console.log(`${行.id}  ${配}  ${念的字(行).slice(0, 24)}${问题.map((x) => `\n    ${x}`).join('')}`);
        }
        console.log(`${选行(表, p.位置).length} 句，${有问题} 句要处理`);
        return 0;
      }
      if (动作 === 'check') {
        const 问题 = await 核对(表, 选行(表, p.位置, true), p.开关.has('--对旧表'));
        for (const x of 问题) console.log(x);
        console.log(问题.length ? `${问题.length} 处不对` : `${选行(表, p.位置, true).length} 句的配音、句模块、口型都对得上${p.开关.has('--对旧表') ? '，和旧表一致' : ''}`);
        return 问题.length ? 1 : 0;
      }
      if (动作 === 'lip') {
        const 写了 = await 出句模块(表, 选行(表, p.位置, true), { 重对齐: p.开关.has('--重对齐'), 从旧表: p.开关.has('--从旧表') });
        记录.产物.push(...写了);
        console.log(`写了 ${写了.length} 个句模块（${相对代码根(句模块目录(作品根()))}）`);
        return 0;
      }
      if (动作 === 'gen') {
        if (!p.位置.length) throw new 用法错误('要给台词 id（或前缀）');
        return 生成(表, 选行(表, p.位置), p, 记录);
      }
      if (动作 === 'use') {
        const [id, 候选] = p.位置;
        if (!id || !候选) throw new 用法错误('要给 <台词 id> <候选.wav>');
        const 行 = 表.台词.find((t) => t.id === id);
        if (!行) throw new 用法错误(`台词.toml 里没有 ${id}`);
        await 定稿(表, 行, path.resolve(候选), p, 记录);
        return 0;
      }
      throw new 用法错误(`voice 后面要跟 list、check、gen、use、lip 或 backends`);
    },
  },
};
