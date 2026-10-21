// 结构：分层方向（engine ← world ← content/场 ← content/段 ← 注册.tsx）、段不互引、场只接上一场的 末态.ts、不许引 核对/、
// pipeline 只 import 纯模块、纯模块闭包无 react/three/remotion、getInputProps 只在 content/设置.ts、渲染代码里不许有
// Math.random、Date.now、相对路径引的资产、写死的路径或主机名。依赖边取自 esbuild metafile（真实打包用到的），不用文本 grep。
import os from 'node:os';
import { 读内容 } from '../内容.ts';
import { 代码后缀, 是渲染代码, 是纯模块, 是测试或声明, type 报告, type 检查上下文 } from '../上下文.ts';
import { 点路径, 行号, 解析, 遍历, ts } from '../语法.ts';

type 层名 = 'engine' | 'world' | 'content公共' | '场' | '段' | '注册' | '核对' | 'pipeline' | '其他';
type 层 = { 名: 层名; 键?: string };

/** 级数小的在左边：只能往级数小（或相等）的方向 import */
const 级: Partial<Record<层名, number>> = { engine: 0, world: 1, content公共: 2, 场: 3, 段: 4, 注册: 5 };

export const 分层 = (p: string): 层 => {
  if (p.startsWith('engine/')) return { 名: 'engine' };
  if (p.startsWith('world/')) return { 名: 'world' };
  const m = /^content\/(场|段|核对)\/([^/]+)\//.exec(p);
  if (m) return { 名: m[1] as '场' | '段' | '核对', 键: m[2] };
  if (p === 'content/注册.tsx' || p === 'content/index.ts') return { 名: '注册' };
  if (p.startsWith('content/')) return { 名: 'content公共' };
  if (p.startsWith('pipeline/')) return { 名: 'pipeline' };
  return { 名: '其他' };
};

const 是渲染层 = (l: 层) => l.名 in 级 || l.名 === '核对';
const 禁包 = (包: string) => ['react', 'react-dom', 'three', 'remotion'].includes(包) || 包.startsWith('@remotion/');
export const 二进制资产后缀 = /\.(png|jpe?g|webp|gif|ogg|wav|mp3|m4a|flac|bin|ttf|otf|woff2?|mp4|mkv|mov|glb|gltf)$/i;

const 名字 = (l: 层) => (l.键 ? `${l.名}/${l.键}` : l.名);

export const 查分层 = async (c: 检查上下文, 报: 报告) => {
  const 图 = await c.依赖图();
  for (const e of 图.错误) 报.错(`打包失败，依赖图不全：${e}`);
  const 内容 = await 读内容(c);
  const 场序 = '场序' in 内容 ? 内容.场序 : null;

  for (const [从, 边们] of 图.边) {
    const a = 分层(从);
    for (const e of 边们) {
      if (e.外部) continue;
      const 到 = e.到;
      const b = 分层(到);
      if (b.名 === '核对' && !(a.名 === '核对' && a.键 === b.键)) {
        报.错(`不许引用 核对/：${从} → ${到}（核对可以引任何东西，反过来不行）`, 从);
        continue;
      }
      if (a.名 === 'pipeline') {
        if (是渲染层(b) && !是纯模块(到)) 报.错(`pipeline 只许 import 纯模块（清单.ts、段.ts、时间线.ts、末态.ts…）：${从} → ${到}`, 从);
        continue;
      }
      if (!是渲染层(a)) continue; // remotion.config.ts 这类配置、工具脚本
      if (b.名 === 'pipeline' || (b.名 === '其他' && 代码后缀.test(到))) {
        报.错(`渲染代码不许 import 管线和工具代码：${从} → ${到}`, 从);
        continue;
      }
      if (a.名 === '核对' || b.名 === '其他') continue; // 核对可以引任何东西；其他 是进 Git 的数据文件（json）
      if (a.名 === '段' && b.名 === '段' && a.键 !== b.键) {
        报.错(`段不许引用别的段：${从} → ${到}（两段共用的东西往下放到场或 world/）`, 从);
        continue;
      }
      if (a.名 === '场' && b.名 === '场' && a.键 !== b.键) {
        const 上一场 = 场序 && a.键 ? 场序[场序.indexOf(a.键) - 1] : undefined;
        if (!(到 === `content/场/${b.键}/末态.ts` && 上一场 === b.键)) {
          报.错(`场只许引用上一场的 末态.ts：${从} → ${到}${上一场 ? `（上一场是 ${上一场}）` : '（清单里排不出上一场）'}`, 从);
        }
        continue;
      }
      if (级[b.名]! > 级[a.名]!) 报.错(`分层方向反了：${名字(a)} 不能引用 ${名字(b)}（${从} → ${到}；只能 engine ← world ← 场 ← 段 ← 注册）`, 从);
    }
  }

  // 纯模块的闭包
  for (const 纯 of c.文件().filter(是纯模块)) {
    if (!图.边.has(纯)) continue;
    const 来自 = new Map<string, string>([[纯, '']]);
    const 队 = [纯];
    const 已报 = new Set<string>();
    const 链 = (f: string) => {
      const r = [f];
      while (来自.get(r[0]!)) r.unshift(来自.get(r[0]!)!);
      return r.join(' → ');
    };
    while (队.length) {
      const f = 队.shift()!;
      for (const id of 图.资产.get(f) ?? []) 报.错(`纯模块的闭包里不能有 asset:（pipeline 在 Node 里直接执行它）：${链(f)} → asset:${id}`, 纯);
      for (const e of 图.边.get(f) ?? []) {
        if (e.外部) {
          if (禁包(e.到) && !已报.has(e.到)) {
            已报.add(e.到);
            报.错(`纯模块的闭包里不能有 ${e.到}：${链(f)} → ${e.到}`, 纯);
          }
        } else if (二进制资产后缀.test(e.到)) {
          报.错(`纯模块的闭包里不能有资产文件：${链(f)} → ${e.到}`, 纯);
        } else if (!来自.has(e.到)) {
          来自.set(e.到, f);
          队.push(e.到);
        }
      }
    }
  }

  // 渲染代码用相对路径 import 资产文件
  for (const [从, 边们] of 图.边) {
    if (!是渲染代码(从)) continue;
    for (const e of 边们) if (!e.外部 && 二进制资产后缀.test(e.到)) 报.错(`资产要写 asset:<id> 引用，不用相对路径：${从} → ${e.到}`, 从);
  }
};

const 写死路径 = [/^\/(Users|home|Volumes|private|tmp|opt|var|mnt|root)\//, /^[A-Za-z]:[\\/]/, /^\\\\[^\\]+\\/, /^~\//];
// XML 命名空间（document.createElementNS）只是标识符，不连网，不算主机名
const 命名空间 = /^http:\/\/www\.w3\.org\//;
const 主机 = [/\b(https?|wss?|ftp|file):\/\//i, /^localhost(:\d+)?$/i, /\blocalhost:\d+/i, /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/];

export const 写死了 = (s: string, 本机名 = os.hostname()): string | null => {
  if (写死路径.some((r) => r.test(s))) return '写死的路径';
  if (!命名空间.test(s) && 主机.some((r) => r.test(s))) return '写死的主机或网址';
  if (本机名.length >= 4 && s.includes(本机名)) return '写死的本机名';
  if (/^\.{1,2}\/.*\.[A-Za-z0-9]+$/.test(s) && 二进制资产后缀.test(s)) return '相对路径的资产';
  return null;
};

// 资产目录({ './a.png': 资_0 }) 的键只是查表用的名字（和 webpackContext 的键同形，见 engine/core/资产目录.ts），不是要加载的路径
const 是资产目录键 = (n: ts.Node) => {
  const 属性 = n.parent;
  if (!ts.isPropertyAssignment(属性) || 属性.name !== n || !ts.isObjectLiteralExpression(属性.parent)) return false;
  const 调用 = 属性.parent.parent;
  return ts.isCallExpression(调用) && ts.isIdentifier(调用.expression) && 调用.expression.text === '资产目录';
};

export const 查代码 = (c: 检查上下文, 报: 报告, 本机名 = os.hostname()) => {
  for (const p of c.文件()) {
    if (!代码后缀.test(p) || /\.d\.[cm]?ts$/.test(p)) continue;
    const 渲染 = 是渲染代码(p);
    const 源 = c.读(p);
    if (!渲染 && !源.includes('getInputProps')) continue;
    const sf = 解析(p, 源);
    遍历(sf, (n) => {
      if (ts.isIdentifier(n) && n.text === 'getInputProps' && p !== 'content/设置.ts') {
        报.错('getInputProps 只能在 content/设置.ts 里用（别处从 use设置() 取渲染设置）', p, 行号(sf, n));
      }
      if (!渲染 || 是测试或声明(p)) return;
      if (ts.isPropertyAccessExpression(n)) {
        const 路 = 点路径(n)?.join('.');
        if (路 === 'Math.random' || 路 === 'Date.now') 报.错(`渲染代码里不许用 ${路}（同一帧每次渲出来要一样；要随机用固定种子）`, p, 行号(sf, n));
      }
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        if (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)) return; // import 来源由依赖图查
        if (是资产目录键(n)) return;
        const 毛病 = 写死了(n.text, 本机名);
        if (毛病) 报.错(`渲染代码里有${毛病}：${JSON.stringify(n.text.slice(0, 80))}（路径从数据源和资产 id 取）`, p, 行号(sf, n));
      }
    });
  }
};

export const 结构 = async (c: 检查上下文, 报: 报告) => {
  await 查分层(c, 报);
  查代码(c, 报);
};
