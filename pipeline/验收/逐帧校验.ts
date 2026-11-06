// anim verify 逐帧：每帧 PNG 算 sha 存成一份有名字的记录（run/逐帧校验/<作品>/<名>/<段键>.tsv），之后再渲一次比，列出不同的帧。方便对比最终结果（用户 10-31 定）。
// 和 anim verify 的分工：verify 比认可版的抽样帧、有阈值、可 accept；这里每帧都比、按字节、没有阈值，不写母版，不碰段签和认可。
// 全程只打包一次（开会话，用完删包），每段过一次渲染闸，并发 1；同一页面按帧号升序连着渲、声音开着，参数和切片那遍一样（带字幕、帧号是输出帧），走法和 renderMedia 出切片一样。
// 同一批帧才能比：隔开的帧在同一页面连出，和连续渲或单帧出不保证相同（docs/渲染性能.md「同一帧的像素取决于之前渲过哪些帧」）。所以 --比 永远照基准存的帧渲，给了 --帧 也只是渲到那里为止，前面的帧不省。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 用法错误 } from '../cli/参数.ts';
import { 作品名, 作品根 } from '../环境/作品.ts';
import { 提交状态 } from '../环境/路径.ts';
import { 数据根, 逐帧校验目录 } from '../环境/配置.ts';
import type { 段信息 } from '../清单/清单.ts';
import { 过渲染闸 } from '../闸/闸.ts';
import { 补字节并报 } from '../资产/随仓库.ts';
import { 逐组照材质包 } from '../资产/资产锁.ts';
import { 预计耗时, type 运行记录 } from '../运行记录/记录.ts';
import { 记阶段 } from '../运行记录/阶段.ts';
import { 明细收集 } from '../运行记录/渲染明细.ts';
import { 等求解缓存写完 } from '../渲/求解缓存收集.ts';
import { 同页出帧, 开会话, 找组合, 渲染标签, 缺的本机地形, 静帧文件 } from '../渲/渲.ts';
import { 段渲染环境 } from '../渲/地形注入.ts';
import { 记已量帧 } from '../渲/地形用量.ts';
import { 段产物们 } from '../渲/段产物.ts';
import type { 渲染参数表 } from '../渲/设置.ts';
import { 全部段 } from '../清单/清单.ts';

const 级别 = '视频' as const;
// 4K 的真画面 PNG 都上 MB，几十 KB 只能是纯色或接近纯色；只提醒不拦，段里本来可能有黑场
const 纯色嫌疑字节 = 64 * 1024;
const 列出的不同帧最多 = 20;
const 第一帧约秒 = 15;

export type 帧校验 = { sha: string; 字节: number };
export type 校验记录 = { 段: string; 段帧数: number; 指纹: string; 提交: string; 帧: Map<number, 帧校验> };

/** --帧：a-b（含两头）或 帧,帧,帧 */
export const 解析帧串 = (串: string): number[] => {
  const 范围 = /^(\d+)-(\d+)$/.exec(串);
  if (范围) {
    const [a, b] = [Number(范围[1]), Number(范围[2])];
    if (a > b) throw new 用法错误(`--帧 起点比终点大：${串}`);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  if (!/^\d+(,\d+)*$/.test(串)) throw new 用法错误(`--帧 写成 <起>-<止> 或 <帧>,<帧>：${串}`);
  return [...new Set(串.split(',').map(Number))].sort((x, y) => x - y);
};

/** 升序帧号写成 3、5-9、12 */
export const 帧号文本 = (帧们: readonly number[]) => {
  const 段们: string[] = [];
  for (let i = 0; i < 帧们.length; ) {
    let j = i;
    while (j + 1 < 帧们.length && 帧们[j + 1] === 帧们[j]! + 1) j++;
    段们.push(i === j ? String(帧们[i]) : `${帧们[i]}-${帧们[j]}`);
    i = j + 1;
  }
  return 段们.join('、');
};

export const 校验文件 = (名: string, 段键: string, 作品 = 作品名()) => path.join(逐帧校验目录(名, 作品), `${段键}.tsv`);

/** 先写临时名再改名：渲到一半被杀不留半份基准 */
export const 写校验记录 = (文件: string, r: 校验记录) => {
  fs.mkdirSync(path.dirname(文件), { recursive: true });
  const 帧行 = [...r.帧].sort((a, b) => a[0] - b[0]).map(([f, x]) => `${f}\t${x.sha}\t${x.字节}`);
  const tmp = `${文件}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, [`# 段\t${r.段}`, `# 段帧数\t${r.段帧数}`, `# 指纹\t${r.指纹}`, `# 提交\t${r.提交}`, '帧\tsha256\t字节', ...帧行, ''].join('\n'), 'utf8');
  fs.renameSync(tmp, 文件);
};

export const 读校验记录 = (文件: string): 校验记录 => {
  const r: 校验记录 = { 段: '', 段帧数: 0, 指纹: '', 提交: '', 帧: new Map() };
  for (const 行 of fs.readFileSync(文件, 'utf8').split('\n')) {
    if (!行 || 行.startsWith('帧\t')) continue;
    const 列 = 行.split('\t');
    if (行.startsWith('# ')) {
      const 键 = 列[0]!.slice(2);
      if (键 === '段') r.段 = 列[1]!;
      else if (键 === '段帧数') r.段帧数 = Number(列[1]);
      else if (键 === '指纹') r.指纹 = 列[1]!;
      else if (键 === '提交') r.提交 = 列[1]!;
      continue;
    }
    const 帧 = Number(列[0]);
    if (!Number.isInteger(帧) || !/^[0-9a-f]{64}$/.test(列[1] ?? '')) throw new Error(`${文件} 读不懂这一行：${行}`);
    r.帧.set(帧, { sha: 列[1]!, 字节: Number(列[2]) });
  }
  return r;
};

/**
 * 这段要渲哪些帧（基准帧要升序）。比的时候只渲基准里有的帧，给了 --帧 就从基准第一帧渲到要的最后一帧：
 * 一帧的结果取决于同页面在它之前渲过什么，和它之后的无关（实测 6-斩娜迦 0-85 和整段的前 86 帧、30,85 和 30,85,140 字节相同）。
 * 超出 是这段没有的帧，基准没有 是给了 --帧、基准没存的帧。
 */
export const 定要渲的帧 = (帧数: number, 给的: readonly number[] | null, 基准帧: readonly number[] | null) => {
  const 全 = 给的 ?? 基准帧 ?? Array.from({ length: 帧数 }, (_, i) => i);
  const 基准 = 基准帧 ? new Set(基准帧) : null;
  const 在段里 = 全.filter((f) => f < 帧数);
  const 能渲 = 在段里.filter((f) => !基准 || 基准.has(f));
  return {
    要渲: 基准帧 && 给的 && 能渲.length ? 基准帧.filter((f) => f <= Math.max(...能渲)) : 能渲,
    超出: 全.filter((f) => f >= 帧数),
    基准没有: 在段里.filter((f) => 基准 && !基准.has(f)),
  };
};

export const 比校验 = (基准: ReadonlyMap<number, 帧校验>, 这次: ReadonlyMap<number, 帧校验>) => {
  const 不同 = [...这次].filter(([f, x]) => 基准.get(f)?.sha !== x.sha).map(([f, x]) => ({ 帧: f, 基准: 基准.get(f)?.sha ?? '', 这次: x.sha })).sort((a, b) => a.帧 - b.帧);
  return { 相同: 这次.size - 不同.length, 不同 };
};

const 提交文本 = () => {
  const x = 提交状态();
  return x ? `${x.提交}${x.有改动 ? '+未提交改动' : ''}` : '不在 git 里';
};

type 一段 = { 段: 段信息; 帧: number[]; 基准: 校验记录 | null; 指纹: string; 地形: Record<string, string>; 帧数: number; 参数: 渲染参数表 };

export const 跑逐帧校验 = async (段们: readonly 段信息[], o: { 模式: '存' | '比'; 名: string; 帧: readonly number[] | null; 留图: string | null; 记录: 运行记录 }): Promise<number> => {
  const { 模式, 名, 记录 } = o;
  let 不过 = 0;
  let 留了 = 0;
  const 错 = (文本: string) => {
    不过++;
    记录.记('错误', 文本);
  };
  const 跳过: string[] = [];
  const 要的段 = 段们.filter((s) => {
    const 包 = 缺的本机地形(s);
    if (!包) return true;
    跳过.push(s.键);
    // 存过基准的段没渲到就是没比到，不能算过；没存过的段这台机器本来就比不了（章选择器存的时候也跳过了它）
    if (模式 === '比' && fs.existsSync(校验文件(名, s.键))) 错(`${s.键}：「${名}」里存过这段，但本机没有区段包 ${包}，没比到（anim world bake 烘出来才能渲）`);
    else console.log(`跳过 ${s.键}：本机没有区段包 ${包}（anim world bake 烘出来才能渲）`);
    return false;
  });
  // 不覆盖基准：存错了换个名，比的时候不会悄悄和新存的比
  if (模式 === '存') {
    const 已有 = 要的段.filter((s) => fs.existsSync(校验文件(名, s.键)));
    if (已有.length) throw new 用法错误(`「${名}」里已经有 ${已有.map((s) => s.键).join('、')}，不覆盖：换个名，或者选别的段`);
  }
  补字节并报(作品根(), 数据根());
  const 全部 = await 全部段();
  const 产物们 = await 段产物们(全部, 要的段, 级别);
  const 计划: 一段[] = [];
  for (const [i, s] of 要的段.entries()) {
    const 文件 = 校验文件(名, s.键);
    if (模式 === '比' && !fs.existsSync(文件)) {
      错(`${s.键}：「${名}」里没存过这段（${文件}），先 anim verify 逐帧 ${s.键} --存 ${名}`);
      continue;
    }
    const 基准 = 模式 === '比' ? 读校验记录(文件) : null;
    const 产物 = 产物们[i]!;
    const 帧数 = 产物.输出帧数;
    const { 要渲, 超出, 基准没有 } = 定要渲的帧(帧数, o.帧, 基准 ? [...基准.帧.keys()].sort((a, b) => a - b) : null);
    const 基准超出 = 超出.filter((f) => 基准?.帧.has(f));
    if (基准超出.length) 错(`${s.键}：段现在只有 ${帧数} 帧，基准存的这些帧没了：${帧号文本(基准超出)}`);
    else if (超出.length) console.log(`· ${s.键} 只有 ${帧数} 帧，不渲 ${帧号文本(超出)}`);
    if (基准没有.length) console.log(`· ${s.键}：基准没存这些帧，比不了：${帧号文本(基准没有)}`);
    if (o.帧 && 基准 && 要渲.some((f) => !o.帧!.includes(f))) console.log(`· ${s.键}：基准的帧是连着渲的，隔开渲比不了，这次连前面的帧一起渲、一起比：${帧号文本(要渲)}`);
    if (基准 && !o.帧 && 基准.段帧数 !== 帧数) 错(`${s.键}：存基准时段有 ${基准.段帧数} 帧，现在 ${帧数} 帧（切片前存的基准按编排帧，要重存）`);
    if (!要渲.length) {
      错(`${s.键}：没有能渲的帧`);
      continue;
    }
    计划.push({ 段: s, 帧: 要渲, 基准, 指纹: 产物.画面指纹.指纹, 地形: 产物.画面指纹.项.地形, 帧数, 参数: 产物.参数 });
  }
  // 开跑前查：不覆盖，也不和上次留的混在一起；比的时候哪帧不同渲完才知道，按可能写的算
  if (o.留图) {
    const 撞 = 计划.flatMap((x) => x.帧.map((f) => 静帧文件(o.留图!, x.段.键, f))).filter((f) => fs.existsSync(f));
    if (撞.length) throw new 用法错误(`--留图 ${o.留图} 里已经有 ${撞.length} 张这次可能写的 PNG（${path.basename(撞[0]!)} 等），不覆盖：换个空目录`);
    fs.mkdirSync(o.留图, { recursive: true });
  }
  if (计划.length) {
    const 估 = 计划.map((x) => {
      const 整段 = 预计耗时(渲染标签(x.段.键, 级别));
      if (整段 === null) return null;
      // 只渲一截时第一帧的读地形摊不到，单独加上
      return x.帧.length === x.帧数 ? 整段 : (整段 * x.帧.length) / x.帧数 + 第一帧约秒;
    });
    const 已知 = 估.filter((x): x is number => x !== null);
    console.log(`== 逐帧${模式} ${计划.length} 段、${计划.reduce((a, x) => a + x.帧.length, 0)} 帧${已知.length ? `；按耗时表预计约 ${Math.round(已知.reduce((a, b) => a + b, 0))} 秒${已知.length < 计划.length ? `（另 ${计划.length - 已知.length} 段没有记录）` : ''}` : ''}`);
    await 逐组照材质包(作品根(), 计划, (x) => x.段.键, (组) => 开会话(级别, async (h) => {
      for (const x of 组) {
        const 键 = x.段.键;
        const composition = 找组合(h, x.段, 全部);
        const 标签 = `逐帧校验:${作品名()}/${键}`;
        await 等求解缓存写完();
        const 排队起 = Date.now();
        const 这次 = new Map<number, 帧校验>();
        await 过渲染闸(async () => {
          const t0 = Date.now();
          记阶段(记录.阶段, 标签, '等闸', 排队起, (t0 - 排队起) / 1000);
          const 明细 = new 明细收集(标签);
          await 明细.包(() =>
            同页出帧({ ...h, 参数: x.参数 }, composition, x.帧, {
              打开声音: true,
              环境: 段渲染环境(键, x.地形),
              每帧: (png, f) => {
                const sha = crypto.createHash('sha256').update(png).digest('hex');
                这次.set(f, { sha, 字节: png.length });
                // 比的时候只留不同的帧：相同的和基准一样，整段的 PNG 又很占地方
                if (o.留图 && (!x.基准 || x.基准.帧.get(f)?.sha !== sha)) {
                  fs.writeFileSync(静帧文件(o.留图, 键, f), png, { flag: 'wx' });
                  留了++;
                }
                明细.帧完成(这次.size);
                if (这次.size % 100 === 0) console.error(`   ${键}：${这次.size}/${x.帧.length} 帧`);
              },
            }),
          );
          await 记已量帧(键, x.帧);
          记阶段(记录.阶段, 标签, '出帧', t0, (Date.now() - t0) / 1000);
          await 明细.写出(记录.阶段, { 指纹: x.指纹.slice(0, 16) });
        },undefined,{}, {种:'逐帧校验',作品:作品名(),段:键,帧数:x.帧.length,帧:x.帧.join(',').slice(0,60),用途:process.env.ANIM_PURPOSE??'核对'});
        const 小 = [...这次].filter(([, v]) => v.字节 < 纯色嫌疑字节).map(([f]) => f).sort((a, b) => a - b);
        if (小.length) 记录.记('警告', `${键}：这些帧的 PNG 不到 ${纯色嫌疑字节 / 1024} KB，可能是纯色，看一眼画面：${帧号文本(小)}`);
        if (模式 === '存') {
          const 文件 = 校验文件(名, 键);
          写校验记录(文件, { 段: 键, 段帧数: x.帧数, 指纹: x.指纹, 提交: 提交文本(), 帧: 这次 });
          记录.产物.push(文件);
          console.log(`✓ ${键}：${这次.size} 帧 → ${文件}`);
          continue;
        }
        const { 相同, 不同 } = 比校验(x.基准!.帧, 这次);
        const 代码 = x.基准!.指纹 === x.指纹 ? `段指纹和存基准时一样（${x.指纹.slice(0, 16)}）` : `段指纹变了（基准 ${x.基准!.指纹.slice(0, 16)}，现在 ${x.指纹.slice(0, 16)}）`;
        if (!不同.length) {
          console.log(`✓ ${键}：${相同} 帧全部相同；${代码}`);
          continue;
        }
        const 明细行 = 不同.slice(0, 列出的不同帧最多).map((d) => `第 ${d.帧} 帧：基准 ${d.基准.slice(0, 16)}，这次 ${d.这次.slice(0, 16)}`);
        错([`${键}：${这次.size} 帧里 ${不同.length} 帧不同（${帧号文本(不同.map((d) => d.帧))}）；${代码}`, ...明细行, ...(不同.length > 列出的不同帧最多 ? [`另 ${不同.length - 列出的不同帧最多} 帧`] : [])].join('\n    '));
      }
    }, 记录));
  }
  if (o.留图 && 留了) console.log(`${模式 === '比' ? '不同的帧' : 'PNG'}在 ${path.resolve(o.留图)}`);
  if (!计划.length && !不过) 错(`一段都没${模式}：选中的段本机都没有区段包`);
  const 跳过文本 = 跳过.length ? `；跳过 ${跳过.join('、')}，没${模式}` : '';
  console.log(不过 ? `\n${不过} 处没过${跳过文本}` : 模式 === '比' ? `\n${计划.length} 段都相同${跳过文本}` : `\n${计划.length} 段存好了，比的时候 --比 ${名}${跳过文本}`);
  return 不过 ? 1 : 0;
};
