// 分阶段计时（still、render）：打包、开浏览器、读组合（getCompositions）、等闸、出帧、编码各花多久，看清时间花在哪。
// 写进这条命令运行记录的「阶段」字段，另追加到 run/logs/阶段耗时.tsv；耗时.tsv 的列不动（预计耗时还按它算）。
// 编码 = renderMedia 出完最后一帧到返回（Remotion 边出帧边编码，这里只剩收尾编码和混音）；派生段签 = render 渲完从 CRF1 派生段签（pipeline/段签/）；转存 = 转成压缩母版（渲/转码.ts）。
// 等后台 = 排着的段满了让下一段先等（记在那段的标签下）、batch 末尾等后台做完（记在 批:<作品>:<级别> 下）；派生段签、转存 默认在后台子进程里，和出帧同时跑，加总超过墙钟是正常的。
// 外层阶段包含里层（打包含备素材、webpack；派生段签含 段签：开头的几步），加总时别重复算。每帧明细见 渲染明细.ts。
import fs from 'node:fs';
import path from 'node:path';
import { 耗时表, 配置 } from '../环境/配置.ts';

export type 阶段名 =
  | '准备' | '算指纹' | '清旧' | '打包' | '备素材' | 'webpack' | '开浏览器' | '读组合' | '等求解缓存' | '等闸' | '出帧' | '编码' | '查帧数' | '派生段签' | '转存' | '删旧' | '等后台'
  | '段签：算字节' | '段签：扫母版' | '段签：存声音' | '段签：写入'
  | '取母版' | '取段签' | '取叠层' | '排字幕' | '做字幕层' | '拼声音' | '拉响度' | '压成片' | '写表' | '核对声音' | '分享版' | '写清单';
export type 阶段记录 = { 标签: string; 阶段: 阶段名; 开始: string; 秒: number };

const 表头 = '开始（UTC）\t标签\t阶段\t秒\t主机\tpid\n';
export const 阶段表 = () => path.join(path.dirname(耗时表()), '阶段耗时.tsv');

const utc = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const 单行 = (s: string) => s.replace(/[\t\r\n]+/g, ' ');

/** 记一个阶段：收进 收（运行记录的 阶段 字段），追加一行到阶段表；写表失败只提示，不影响渲染 */
export const 记阶段 = (收: 阶段记录[] | undefined, 标签: string, 阶段: 阶段名, 开始ms: number, 秒: number, 表 = 阶段表()): 阶段记录 => {
  const r: 阶段记录 = { 标签, 阶段, 开始: utc(开始ms), 秒: Number(秒.toFixed(2)) };
  收?.push(r);
  try {
    fs.mkdirSync(path.dirname(表), { recursive: true });
    const 行 = `${r.开始}\t${单行(标签)}\t${阶段}\t${r.秒.toFixed(2)}\t${单行(配置('主机'))}\t${process.pid}\n`;
    if (!fs.existsSync(表)) fs.writeFileSync(表, 表头 + 行, 'utf8');
    else fs.appendFileSync(表, 行, 'utf8');
  } catch (e) {
    console.error(`!! 阶段耗时没写成：${(e as Error).message}`);
  }
  return r;
};

export type 后台账目 = { 开始: string; 标签: string; 段数: number; 出帧: number; 派生段签: number; 转存: number; 限流: number; 等齐: number };

/**
 * 最近几批 render 的后台账：出帧和后台各花多少、出帧为后台多等了多少（anim 耗时 列）。从 批 的 准备 到 等后台 算一批。
 * 后台的行 pid 是子进程的，按这批渲过的标签和时间窗认；只有用过后台的批才有 等后台。
 */
export const 后台账 = (最多 = 3, 表 = 阶段表()): 后台账目[] => {
  if (!fs.existsSync(表)) return [];
  const 行 = fs.readFileSync(表, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => {
    const [开始 = '', 标签 = '', 阶段 = '', 秒 = '0', , pid = ''] = l.split('\t');
    return { 开始, 标签, 阶段, 秒: Number(秒), pid };
  });
  const 账: 后台账目[] = [];
  for (let i = 行.length - 1; i >= 0 && 账.length < 最多; i--) {
    const 尾 = 行[i]!;
    if (尾.阶段 !== '等后台' || !尾.标签.startsWith('批:')) continue;
    let 头 = i;
    while (头 > 0 && !(行[头]!.pid === 尾.pid && 行[头]!.标签.startsWith('批:') && 行[头]!.阶段 === '准备')) 头--;
    const 窗 = 行.slice(头, i + 1);
    const 自己 = 窗.filter((x) => x.pid === 尾.pid && x.标签.startsWith('render:'));
    const 段们 = new Set(自己.map((x) => x.标签));
    const 和 = (们: typeof 窗, 阶段: string) => 们.filter((x) => x.阶段 === 阶段).reduce((a, x) => a + x.秒, 0);
    const 后台行 = 窗.filter((x) => 段们.has(x.标签));
    账.push({ 开始: 行[头]!.开始, 标签: 尾.标签, 段数: 段们.size, 出帧: 和(自己, '出帧'), 派生段签: 和(后台行, '派生段签'), 转存: 和(后台行, '转存'), 限流: 和(自己, '等后台'), 等齐: 尾.秒 });
  }
  return 账;
};

/** 量 fn 这一段（抛错也记） */
export const 量阶段 = async <T>(收: 阶段记录[] | undefined, 标签: string, 阶段: 阶段名, fn: () => Promise<T>, 表?: string): Promise<T> => {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    记阶段(收, 标签, 阶段, t0, (Date.now() - t0) / 1000, 表);
  }
};

/** 一串挨着的步骤：每调一次记下从上一次调用到现在这段（长函数里不用把每步包成回调） */
export const 分段计时 = (收: 阶段记录[] | undefined, 标签: string, 表?: string) => {
  let 上 = Date.now();
  return (阶段: 阶段名) => {
    const now = Date.now();
    记阶段(收, 标签, 阶段, 上, (now - 上) / 1000, 表);
    上 = now;
  };
};

/** renderMedia 的 onProgress 记下出完最后一帧的时刻，返回后拆成 出帧、编码 两段 */
export const 出帧编码计时 = () => {
  let 出帧毫秒: number | null = null;
  return {
    onProgress: (p: { renderedDoneIn: number | null }) => {
      if (p.renderedDoneIn !== null) 出帧毫秒 = p.renderedDoneIn;
    },
    拆: (总毫秒: number) => {
      const 出帧 = Math.min(出帧毫秒 ?? 总毫秒, 总毫秒);
      return { 出帧秒: 出帧 / 1000, 编码秒: (总毫秒 - 出帧) / 1000 };
    },
  };
};

/** 一行给人看的小结：打包 12.3 秒、开浏览器 0.8 秒… */
export const 阶段小结 = (rs: readonly 阶段记录[]) => rs.map((r) => `${r.阶段} ${r.秒.toFixed(1)} 秒`).join('、');
