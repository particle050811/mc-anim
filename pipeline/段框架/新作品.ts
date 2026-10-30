// anim new work / new seg 的模板：两部作品逐字相同的 清单.ts 尾部、注册.tsx、index.ts 不再手抄，新作品照这里生成（旧的两份不动）。
// 新段一律是段框架的窗口段：段.ts 不写段键（段键只在目录名和清单里），画面.tsx 用 定义画面 / use段，声音照 cue 自动放。
// 生成的两份声音文件先写成「没有 cue」的样子（和 anim cues 对空 cue 段生成的一字不差），新段立刻能加载、能渲。
import fs from 'node:fs';
import path from 'node:path';
import { 声音地址文件, 声音地址文本, 声音表文件, 声音表文本 } from './生成.ts';
import { 占位文件名, 段目录占位文本 } from './注册目录.ts';

const 名字符 = '[A-Za-z0-9\\u4e00-\\u9fff]';
const 作品名合法 = (名: string) => new RegExp(`^${名字符}+$`).test(名);

const 写新文件 = (文件: string, 文本: string, 写了: string[]) => {
  if (fs.existsSync(文件)) throw new Error(`${文件} 已经有了，不覆盖`);
  fs.mkdirSync(path.dirname(文件), { recursive: true });
  fs.writeFileSync(文件, 文本, 'utf8');
  写了.push(文件);
};

const 空声音文件 = (目录: string, 写了: string[]) => {
  写新文件(path.join(目录, 声音表文件), 声音表文本({ 资产: {}, 台词: {} }), 写了);
  写新文件(path.join(目录, 声音地址文件), 声音地址文本([], {}), 写了);
};

export const 清单模板 = (首段: string) => `// 段清单：进成片的段按剪辑顺序排，anim render、anim film、注册.tsx 都读它（唯一顺序表）。纯数据。
// 段键是永久身份（<章>-<段名>），目录名、Composition id、母版缓存都用它；核对段（键以 核对- 开头）放 核对/，不进章节编号。
import type { 清单条目 } from '@engine/段/清单条目.ts';
import { 清单工具 } from '@engine/段/清单工具.ts';
export type { 清单条目 };

export const 清单: readonly 清单条目[] = [
  { 键: '${首段}', 章: '核对' },
];

export const { 段目录, 段名, 编号 } = 清单工具(清单);
`;

// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量，所以每部作品各有一份（内容和 作品/应力转动/注册.tsx 一样）
export const 注册模板 = `// 本作品所有 Composition 的登记（通用部分在 注册工厂.tsx）：加段不用改这里。
// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量；只扫 段/、核对/ 两层，不扫作品根下别的目录。
import { 做注册 } from '@engine/段/注册工厂.tsx';
import { 清单, 段目录 } from './清单.ts';

export const 注册 = 做注册({
  清单,
  段目录,
  模块: {
    段: import.meta.webpackContext('./段', { recursive: true, regExp: /^\\.\\/[^/]+\\/(段\\.ts|画面\\.tsx|叠层[^/]*\\.tsx)$/ }),
    核对: import.meta.webpackContext('./核对', { recursive: true, regExp: /^\\.\\/[^/]+\\/(段\\.ts|画面\\.tsx|叠层[^/]*\\.tsx)$/ }),
  },
});
`;

export const index模板 = `import { registerRoot } from 'remotion';
import { 注册 } from './注册.tsx';

registerRoot(注册);
`;

const 画面模板 = (说明: string) => `// ${说明}
import { AbsoluteFill } from 'remotion';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

export default 定义画面(段, 声音, () => {
  const { 帧, 段: 本段 } = use段(段);
  return <AbsoluteFill style={{ background: '#000', color: '#fff', fontSize: 48, justifyContent: 'center', alignItems: 'center' }}>{\`\${帧} / \${本段.帧数}\`}</AbsoluteFill>;
});
`;

/** 起一部新作品：作品/<名>/ 下的 清单.ts、注册.tsx、index.ts、一个能渲的 核对-起步 段，和撑住 段/ 目录的 段/说明.md（注册目录.ts） */
export const 新作品 = (代码根: string, 名: string): string[] => {
  if (!作品名合法(名)) throw new Error(`作品名「${名}」只能用汉字、字母、数字`);
  const 根 = path.join(代码根, '作品', 名);
  if (fs.existsSync(根)) throw new Error(`作品/${名}/ 已经有了`);
  const 写了: string[] = [];
  写新文件(path.join(根, '清单.ts'), 清单模板('核对-起步'), 写了);
  写新文件(path.join(根, '注册.tsx'), 注册模板, 写了);
  写新文件(path.join(根, 'index.ts'), index模板, 写了);
  写新文件(path.join(根, '段', 占位文件名), 段目录占位文本, 写了);
  const 段目录 = path.join(根, '核对', '起步');
  写新文件(
    path.join(段目录, '段.ts'),
    `// 起步：新作品自带的核对段，确认能渲（anim new work 生成）。时间线就写在这里，正片的段用 场/<场键>/时间线.ts。
import { 定义场时间线, 窗口段 } from '@engine/段/窗口段.ts';
import 声音表 from './声音表.生成.ts';

const 线 = 定义场时间线({ 场: '核对', 事件: { 开始: { 在: { 秒: 0 } }, 结束: { 在: { 秒: 2 } } } });

export default 窗口段(线, { 起: '开始', 止: '结束', 声音表 });
`,
    写了,
  );
  写新文件(path.join(段目录, '画面.tsx'), 画面模板('起步的画面：黑底上数帧'), 写了);
  空声音文件(段目录, 写了);
  return 写了;
};

/** 在 清单.ts 的 清单 数组末尾加一行 */
export const 清单加一段 = (文本: string, 键: string, 章: number | '核对'): string => {
  const 起 = 文本.indexOf('export const 清单');
  const 止 = 起 < 0 ? -1 : 文本.indexOf('\n];', 起);
  if (止 < 0) throw new Error('清单.ts 里找不到 export const 清单 … ]; 这个数组，手动加');
  if (new RegExp(`键: '${键}'`).test(文本)) throw new Error(`清单里已经有 ${键}`);
  return `${文本.slice(0, 止)}\n  { 键: '${键}', 章: ${typeof 章 === 'number' ? 章 : `'核对'`} },${文本.slice(止)}`;
};

/** 本场已有的老段（定义段 写的，不是窗口段），清单顺序：段键、帧数，有 场窗口 的带起帧；fps、画幅不是默认的也带上 */
export type 场里老段 = { 键: string; 帧数: number; 起帧?: number; fps: number; 宽: number; 高: number };

/** 老场的场时间线：老段的帧数抄成数摆上来（engine/段/老段接续.ts；场不许 import 段），新段的起止事件接在最后一个老段后面 */
const 老场时间线模板 = (场: string, 老段: readonly 场里老段[], 起: string, 止: string) => {
  const 头 = 老段[0]!;
  const 格式 = [
    ...(头.fps !== 24 ? [`  fps: ${头.fps},`] : []),
    ...(头.宽 !== 1280 || 头.高 !== 720 ? [`  画幅: { 宽: ${头.宽}, 高: ${头.高} },`] : []),
  ];
  return `// ${场} 的场时间线：本场的老段（定义段 写的）一个不改，帧数抄过来按清单顺序首尾相接摆上，事件 <段键>.起、<段键>.止（engine/段/老段接续.ts）；
// 新段（窗口段）从这条线取窗口，跨段的声音写在 声音 里（只放进新段，老段照旧）。抄的帧数 anim check 和老段的 段.ts 对；老段中间有跳过的，给那一段写 起帧。纯模块。
import { 接老段 } from '@engine/段/老段接续.ts';

export default 接老段({
  场: '${场}',
${格式.join('\n')}${格式.length ? '\n' : ''}  老段: [
${老段.map((x) => `    { 键: '${x.键}', 帧数: ${x.帧数}${x.起帧 !== undefined ? `, 起帧: ${x.起帧}` : ''} },`).join('\n')}
  ],
  事件: {
    ${起}: { 在: { 接: '${老段.at(-1)!.键}.止' }, 依据: '暂定：接在本场最后一个老段后面' },
    ${止}: { 在: { 接: '${起}', 加秒: 3 }, 依据: '暂定' },
  },
});
`;
};

/**
 * 在作品里加一个窗口段：段目录、段.ts、画面.tsx、空声音文件，排进清单末尾。场时间线没有就建一条：
 * 本场没有老段时两个事件、先给 3 秒；有老段（老段，命令里照清单找出来）时用 接老段 把它们摆上去，新段接在后面。
 */
export const 新段 = (作品根: string, 键: string, o: { 场?: string; 起?: string; 止?: string; 老段?: readonly 场里老段[] }): string[] => {
  const 核对 = /^核对-(.+)$/.exec(键);
  const 正片 = /^(\d+)-(.+)$/.exec(键);
  if (!核对 && !正片) throw new Error(`段键要是 <章>-<段名> 或 核对-<名>：${键}`);
  const 段名 = (核对 ?? 正片)![核对 ? 1 : 2]!;
  if (!new RegExp(`^${名字符}+$`).test(段名)) throw new Error(`段名「${段名}」只能用汉字、字母、数字`);
  const 起 = o.起 ?? '开始';
  const 止 = o.止 ?? '结束';
  const 写了: string[] = [];
  const 目录 = path.join(作品根, ...(核对 ? ['核对', 段名] : ['段', 键]));
  if (fs.existsSync(目录)) throw new Error(`${目录} 已经有了`);
  let 线导入: string;
  if (核对) {
    线导入 = `import { 定义场时间线, 窗口段 } from '@engine/段/窗口段.ts';\nimport 声音表 from './声音表.生成.ts';\n\nconst 线 = 定义场时间线({ 场: '核对', 事件: { ${起}: { 在: { 秒: 0 } }, ${止}: { 在: { 秒: 3 } } } });\n`;
  } else {
    const 场 = o.场;
    if (!场) throw new Error('正片的段要给 --场 <场键>（同一场的段共用 场/<场键>/时间线.ts）');
    if (!new RegExp(`^\\d+-${名字符}+$`).test(场)) throw new Error(`场键要是 <章>-<场名>：${场}`);
    const 线文件 = path.join(作品根, '场', 场, '时间线.ts');
    if (!fs.existsSync(线文件) && o.老段?.length) 写新文件(线文件, 老场时间线模板(场, o.老段, 起, 止), 写了);
    else if (!fs.existsSync(线文件)) {
      写新文件(
        线文件,
        `// ${场} 的场时间线：本场的事件（秒、帧，或接在别的事件后面），本场各段按 [起事件, 止事件) 取窗口（engine/段/窗口段.ts）。纯模块。
import { 定义场时间线 } from '@engine/段/窗口段.ts';

export default 定义场时间线({
  场: '${场}',
  事件: {
    ${起}: { 在: { 秒: 0 }, 依据: '暂定' },
    ${止}: { 在: { 秒: 3 }, 依据: '暂定' },
  },
});
`,
        写了,
      );
    } else if (!/export default (定义场时间线|接老段)\(/.test(fs.readFileSync(线文件, 'utf8'))) {
      throw new Error(`${线文件} 不是 定义场时间线 或 接老段 做的（老写法的时间线），新段接不上；先给这场写一条 export default 定义场时间线(…)（老段要接上的用 接老段，见 docs/新段.md）`);
    }
    线导入 = `import { 窗口段 } from '@engine/段/窗口段.ts';\nimport 线 from '../../场/${场}/时间线.ts';\nimport 声音表 from './声音表.生成.ts';\n`;
  }
  写新文件(
    path.join(目录, '段.ts'),
    `// 段的窗口、声音 cue（放 音效和配乐、说 台词，每条只写一次；时长、峰值由 anim cues 生成进 声音表）。纯模块。
${线导入}
export default 窗口段(线, {
  起: '${起}',
  止: '${止}',
  声音表,
  声音: () => [],
});
`,
    写了,
  );
  写新文件(path.join(目录, '画面.tsx'), 画面模板('段的画面：use段() 取当前帧和事件的段内帧；声音由 定义画面 照 段.ts 的 cue 自动放'), 写了);
  空声音文件(目录, 写了);
  const 清单文件 = path.join(作品根, '清单.ts');
  fs.writeFileSync(清单文件, 清单加一段(fs.readFileSync(清单文件, 'utf8'), 键, 核对 ? '核对' : Number(正片![1])), 'utf8');
  写了.push(清单文件);
  return 写了;
};
