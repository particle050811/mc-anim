// anim new work / new seg 的模板：两部作品逐字相同的 清单.ts 尾部、注册.tsx、index.ts 不再手抄，新作品照这里生成（旧的两份不动）。
// 新段一律是段框架的窗口段：段.ts 不写段键（段键只在目录名和清单里），画面.tsx 用 定义画面 / use段，声音照 cue 自动放。
// 生成的两份声音文件先写成「没有 cue」的样子（和 anim cues 对空 cue 段生成的一字不差），新段立刻能加载、能渲。
import fs from 'node:fs';
import path from 'node:path';
import { soundUrlFile, soundUrlText, soundTableFile, soundTableText } from './生成.ts';
import { placeholderFileName, segDirPlaceholderText } from './注册目录.ts';

const nameChar = '[A-Za-z0-9\\u4e00-\\u9fff]';
const isWorkNameValid = (workName: string) => new RegExp(`^${nameChar}+$`).test(workName);

const writeNewFile = (file: string, contentText: string, written: string[]) => {
  if (fs.existsSync(file)) throw new Error(`${file} 已经有了，不覆盖`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contentText, 'utf8');
  written.push(file);
};

const writeEmptySoundTable = (segDir: string, written: string[]) => {
  writeNewFile(path.join(segDir, soundTableFile), soundTableText({ 资产: {}, 台词: {} }), written);
  writeNewFile(path.join(segDir, soundUrlFile), soundUrlText([], {}), written);
};

export const manifestTemplate = (firstSeg: string) => `// 段清单：进成片的段按剪辑顺序排，anim film、注册.tsx 都读它（唯一顺序表）。纯数据。
// 段键是永久身份（<章>-<段名>），目录名、Composition id、母版缓存都用它；核对段（键以 核对- 开头）放 核对/，不进章节编号。
import type { ManifestEntry } from '@engine/段/清单条目.ts';
import { manifestTools } from '@engine/段/清单工具.ts';
export type { ManifestEntry };

export const manifest: readonly ManifestEntry[] = [
  { 键: '${firstSeg}', 章: '核对' },
];

export const { segDir, segmentName, 编号: segmentCode } = manifestTools(manifest);
`;

// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量，所以每部作品各有一份（内容和 作品/应力转动/注册.tsx 一样）
export const registryTemplate = `// 本作品所有 Composition 的登记（通用部分在 注册工厂.tsx）：加段不用改这里。
// webpackContext 的参数 webpack 要在打包时读出来，只能就地写字面量；只扫 段/、核对/ 两层，不扫作品根下别的目录。
import { makeRegistry } from '@engine/段/注册工厂.tsx';
import { manifest, segDir } from './清单.ts';

export const registration = makeRegistry({
  manifest,
  segDir,
  模块: {
    段: import.meta.webpackContext('./段', { recursive: true, regExp: /^\\.\\/[^/]+\\/(段\\.ts|画面\\.tsx|叠层[^/]*\\.tsx)$/ }),
    核对: import.meta.webpackContext('./核对', { recursive: true, regExp: /^\\.\\/[^/]+\\/(段\\.ts|画面\\.tsx|叠层[^/]*\\.tsx)$/ }),
  },
});
`;

export const indexTemplate = `import { registerRoot } from 'remotion';
import { registration } from './注册.tsx';

registerRoot(registration);
`;

const pictureTemplate = (note: string) => `// ${note}
import { AbsoluteFill } from 'remotion';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(seg, soundUrl, () => {
  const { 秒: sec, 段: thisSegment } = useSeg(seg);
  return <AbsoluteFill style={{ background: '#000', color: '#fff', fontSize: 48, justifyContent: 'center', alignItems: 'center' }}>{\`\${sec.toFixed(2)} / \${thisSegment.秒} 秒\`}</AbsoluteFill>;
});
`;

/** 起一部新作品：作品/<名>/ 下的 清单.ts、注册.tsx、index.ts、一个能渲的 核对-起步 段，和撑住 段/ 目录的 段/说明.md（注册目录.ts） */
export const newWork = (codeRoot: string, workName: string): string[] => {
  if (!isWorkNameValid(workName)) throw new Error(`作品名「${workName}」只能用汉字、字母、数字`);
  const workRoot = path.join(codeRoot, '作品', workName);
  if (fs.existsSync(workRoot)) throw new Error(`作品/${workName}/ 已经有了`);
  const written: string[] = [];
  writeNewFile(path.join(workRoot, '清单.ts'), manifestTemplate('核对-起步'), written);
  writeNewFile(path.join(workRoot, '注册.tsx'), registryTemplate, written);
  writeNewFile(path.join(workRoot, 'index.ts'), indexTemplate, written);
  writeNewFile(path.join(workRoot, '段', placeholderFileName), segDirPlaceholderText, written);
  const segDir = path.join(workRoot, '核对', '起步');
  writeNewFile(
    path.join(segDir, '段.ts'),
    `// 起步：新作品自带的核对段，确认能渲（anim new work 生成）。时间线就写在这里，正片的段用 场/<场键>/时间线.ts。
import { defineSceneTimeline, windowSeg } from '@engine/段/窗口段.ts';
import soundTable from './声音表.生成.ts';

const timeline = defineSceneTimeline({ 场: '核对', 事件: { 开始: { 在: { 秒: 0 } }, 结束: { 在: { 秒: 2 } } } });

export default windowSeg(timeline, { 起: '开始', 止: '结束', soundTable });
`,
    written,
  );
  writeNewFile(path.join(segDir, '画面.tsx'), pictureTemplate('起步的画面：黑底上数秒'), written);
  writeEmptySoundTable(segDir, written);
  return written;
};

/** 在 清单.ts 的 manifest 数组末尾加一行 */
export const addSegToManifest = (text: string, segKey: string, chapter: number | '核对'): string => {
  const startIndex = text.indexOf('export const manifest');
  const endIndex = startIndex < 0 ? -1 : text.indexOf('\n];', startIndex);
  if (endIndex < 0) throw new Error('清单.ts 里找不到 export const manifest … ]; 这个数组，手动加');
  if (new RegExp(`键: '${segKey}'`).test(text)) throw new Error(`清单里已经有 ${segKey}`);
  return `${text.slice(0, endIndex)}\n  { 键: '${segKey}', 章: ${typeof chapter === 'number' ? chapter : `'核对'`} },${text.slice(endIndex)}`;
};

/** 本场已有的老段（定义段 写的，不是窗口段），清单顺序：段键、段长秒，有 场窗口 的带起秒；画幅不是默认的也带上 */
export type SceneLegacySeg = { 键: string; 秒: number; startSec?: number; 宽: number; 高: number };

/** 老场的场时间线：老段的段长抄成数摆上来（engine/段/老段接续.ts；场不许 import 段），新段的起止事件接在最后一个老段后面 */
const legacySceneTimelineTemplate = (scene: string, legacySegs: readonly SceneLegacySeg[], startEvent: string, endMark: string) => {
  const firstOldSeg = legacySegs[0]!;
  const frameSizeLines = firstOldSeg.宽 !== 1280 || firstOldSeg.高 !== 720 ? [`  aspect: { 宽: ${firstOldSeg.宽}, 高: ${firstOldSeg.高} },`] : [];
  return `// ${scene} 的场时间线：本场的老段（定义段 写的）一个不改，段长抄过来按清单顺序首尾相接摆上，事件 <段键>.起、<段键>.止（engine/段/老段接续.ts）；
// 新段（窗口段）从这条线取窗口，跨段的声音写在 声音 里（只放进新段，老段照旧）。抄的段长 anim check 和老段的 段.ts 对；老段中间有跳过的，给那一段写 起秒。纯模块。
import { continueOldSeg } from '@engine/段/老段接续.ts';

export default continueOldSeg({
  场: '${scene}',
${frameSizeLines.join('\n')}${frameSizeLines.length ? '\n' : ''}  legacySegs: [
${legacySegs.map((x) => `    { 键: '${x.键}', 秒: ${x.秒}${x.startSec !== undefined ? `, startSec: ${x.startSec}` : ''} },`).join('\n')}
  ],
  事件: {
    ${startEvent}: { 在: { after: '${legacySegs.at(-1)!.键}.止' }, 依据: '暂定：接在本场最后一个老段后面' },
    ${endMark}: { 在: { after: '${startEvent}', addSec: 3 }, 依据: '暂定' },
  },
});
`;
};

/**
 * 在作品里加一个窗口段：段目录、段.ts、画面.tsx、空声音文件，排进清单末尾。场时间线没有就建一条：
 * 本场没有老段时两个事件、先给 3 秒；有老段（老段，命令里照清单找出来）时用 接老段 把它们摆上去，新段接在后面。
 */
export const newSegment = (workRoot: string, segKey: string, o: { 场?: string; 起?: string; 止?: string; legacySegs?: readonly SceneLegacySeg[] }): string[] => {
  const verifyMatch = /^核对-(.+)$/.exec(segKey);
  const mainCut = /^(\d+)-(.+)$/.exec(segKey);
  if (!verifyMatch && !mainCut) throw new Error(`段键要是 <章>-<段名> 或 核对-<名>：${segKey}`);
  const segmentName = (verifyMatch ?? mainCut)![verifyMatch ? 1 : 2]!;
  if (!new RegExp(`^${nameChar}+$`).test(segmentName)) throw new Error(`段名「${segmentName}」只能用汉字、字母、数字`);
  const startEvent = o.起 ?? '开始';
  const endMark = o.止 ?? '结束';
  const written: string[] = [];
  const segDir = path.join(workRoot, ...(verifyMatch ? ['核对', segmentName] : ['段', segKey]));
  if (fs.existsSync(segDir)) throw new Error(`${segDir} 已经有了`);
  let timelineImport: string;
  if (verifyMatch) {
    timelineImport = `import { defineSceneTimeline, windowSeg } from '@engine/段/窗口段.ts';\nimport soundTable from './声音表.生成.ts';\n\nconst timeline = defineSceneTimeline({ 场: '核对', 事件: { ${startEvent}: { 在: { 秒: 0 } }, ${endMark}: { 在: { 秒: 3 } } } });\n`;
  } else {
    const scene = o.场;
    if (!scene) throw new Error('正片的段要给 --场 <场键>（同一场的段共用 场/<场键>/时间线.ts）');
    if (!new RegExp(`^\\d+-${nameChar}+$`).test(scene)) throw new Error(`场键要是 <章>-<场名>：${scene}`);
    const timelineFile = path.join(workRoot, '场', scene, '时间线.ts');
    if (!fs.existsSync(timelineFile) && o.legacySegs?.length) writeNewFile(timelineFile, legacySceneTimelineTemplate(scene, o.legacySegs, startEvent, endMark), written);
    else if (!fs.existsSync(timelineFile)) {
      writeNewFile(
        timelineFile,
        `// ${scene} 的场时间线：本场的事件（秒，或接在别的事件后面），本场各段按 [起事件, 止事件) 取窗口（engine/段/窗口段.ts）。纯模块。
import { defineSceneTimeline } from '@engine/段/窗口段.ts';

export default defineSceneTimeline({
  场: '${scene}',
  事件: {
    ${startEvent}: { 在: { 秒: 0 }, 依据: '暂定' },
    ${endMark}: { 在: { 秒: 3 }, 依据: '暂定' },
  },
});
`,
        written,
      );
    } else if (!/export default (defineSceneTimeline|continueOldSeg)\(/.test(fs.readFileSync(timelineFile, 'utf8'))) {
      throw new Error(`${timelineFile} 不是 定义场时间线 或 接老段 做的（老写法的时间线），新段接不上；先给这场写一条 export default defineSceneTimeline(…)（老段要接上的用 continueOldSeg，见 docs/新段.md）`);
    }
    timelineImport = `import { windowSeg } from '@engine/段/窗口段.ts';\nimport timeline from '../../场/${scene}/时间线.ts';\nimport soundTable from './声音表.生成.ts';\n`;
  }
  writeNewFile(
    path.join(segDir, '段.ts'),
    `// 段的窗口、声音 cue（放 音效和配乐、说 台词，每条只写一次；时长、峰值由 anim cues 生成进 声音表）。纯模块。
${timelineImport}
export default windowSeg(timeline, {
  起: '${startEvent}',
  止: '${endMark}',
  soundTable,
  声音: () => [],
});
`,
    written,
  );
  writeNewFile(path.join(segDir, '画面.tsx'), pictureTemplate('段的画面：use段() 取当前秒和事件的段内秒；声音由 定义画面 照 段.ts 的 cue 自动放'), written);
  writeEmptySoundTable(segDir, written);
  const manifestPath = path.join(workRoot, '清单.ts');
  fs.writeFileSync(manifestPath, addSegToManifest(fs.readFileSync(manifestPath, 'utf8'), segKey, verifyMatch ? '核对' : Number(mainCut![1])), 'utf8');
  written.push(manifestPath);
  return written;
};
