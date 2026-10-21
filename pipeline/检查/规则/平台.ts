// 平台卫生：仓库里的路径在 Windows 上合法（不用 <>:"\|?* 和控制字符、不以点或空格结尾、不用 CON/NUL/COM1 这类保留名、
// 不靠大小写区分、Unicode 用 NFC）；结构层路径只用 ASCII（顶层目录、py/ 下的包、sourcing/mod/ 整棵树、verify/accepted/<平台>）；
// 代码里不开 shell（JS/TS 的 shell 选项、Python 的 shell=True），Python 不用 fcntl（Windows 没有）。
import { 代码后缀, type 报告, type 检查上下文 } from '../上下文.ts';
import { 属性名, 行号, 解析, 遍历, ts } from '../语法.ts';

const 保留名 = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

export const 名字毛病 = (名: string): string | null => {
  if (/[<>:"\\|?*\x00-\x1f]/.test(名)) return '有 Windows 不许的字符（<>:"\\|?* 或控制字符）';
  if (/[. ]$/.test(名)) return '以点或空格结尾（Windows 会吃掉）';
  if (保留名.test(名)) return '是 Windows 的保留设备名';
  if (名.normalize('NFC') !== 名) return '不是 NFC（Mac 上分解写法的中文，别的系统上会变成另一个名字）';
  return null;
};

/** 哪些路径段属于结构层、要求 ASCII：返回不合规的那一段 */
export const 结构层非ASCII = (p: string): string | null => {
  const 段 = p.split('/');
  const 非 = (s: string) => /[^\x20-\x7e]/.test(s);
  if (段.length > 1 && 非(段[0]!)) return 段[0]!;
  if (段.length === 1 && 非(段[0]!)) return 段[0]!; // 根目录下的文件
  if (段[0] === 'py' && 段.length > 2 && 非(段[1]!)) return 段[1]!;
  if (段[0] === 'sourcing' && 段[1] === 'mod') return 段.find(非) ?? null;
  if (段[0] === 'verify' && 段[1] === 'accepted' && 段.length > 3 && 非(段[2]!)) return 段[2]!;
  return null;
};

/** 只差大小写（含 NFC 归一）的路径：目录也算，a/X/1 和 a/x/2 在 Windows、Mac 上落在同一个目录里 */
export const 大小写冲突 = (路径们: readonly string[]) => {
  const 小写 = new Map<string, string>();
  const r: { 文件: string; 已有: string; 是文件: boolean }[] = [];
  for (const p of 路径们) {
    const 段 = p.split('/');
    for (let i = 1; i <= 段.length; i++) {
      const 原 = 段.slice(0, i).join('/');
      const k = 原.normalize('NFC').toLowerCase();
      const 已有 = 小写.get(k);
      if (已有 === undefined) 小写.set(k, 原);
      else if (已有 !== 原) {
        r.push({ 文件: p, 已有, 是文件: i === 段.length });
        break;
      }
    }
  }
  return r;
};

export const 平台 = async (c: 检查上下文, 报: 报告) => {
  for (const p of c.文件()) {
    for (const 名 of p.split('/')) {
      const 毛病 = 名字毛病(名);
      if (毛病) 报.错(`路径里的「${名}」${毛病}`, p);
    }
    const 非 = 结构层非ASCII(p);
    if (非) 报.错(`结构层路径要用英文 ASCII：「${非}」（场、段、资产这类实体名才用中文）`, p);
  }
  for (const x of 大小写冲突(c.文件())) 报.错(`和 ${x.已有} 只差大小写，Windows 和 Mac 上是同一个${x.是文件 ? '文件' : '目录'}`, x.文件);

  for (const p of c.文件()) {
    if (代码后缀.test(p) && !/\.d\.[cm]?ts$/.test(p)) {
      const 源 = c.读(p);
      if (!源.includes('shell')) continue;
      const sf = 解析(p, 源);
      遍历(sf, (n) => {
        if (ts.isPropertyAssignment(n) && 属性名(n.name) === 'shell' && n.initializer.kind !== ts.SyntaxKind.FalseKeyword) {
          报.错('不开 shell：子进程用数组参数（pipeline/环境/子进程.ts；Windows 的 .cmd 交给 cross-spawn）', p, 行号(sf, n));
        }
        if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'shell') 报.错('不开 shell：子进程用数组参数', p, 行号(sf, n));
      });
    } else if (p.endsWith('.py')) {
      c.读(p)
        .split('\n')
        .forEach((l, i) => {
          const 码 = l.replace(/#.*$/, '');
          if (/\bshell\s*=\s*(?!False\b)\w/.test(码)) 报.错('不开 shell：subprocess 用列表参数', p, i + 1);
          if (/^\s*(import\s+([\w.]+\s*,\s*)*fcntl\b|from\s+fcntl\s+import\b)/.test(码)) 报.错('不用 fcntl（Windows 没有）：锁用 O_EXCL 建文件，照 pipeline/闸/锁.ts', p, i + 1);
        });
    }
  }
};
