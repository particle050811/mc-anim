// 注册.tsx 用 import.meta.webpackContext('./段' …) 收的目录：目录不在，webpack 打包直接报 Can't resolve './段'。
// git 不记空目录，新作品还没有正片段时 段/ 靠 段/说明.md 撑着（anim new work 建）；打包前和 anim check 都查，报人看得懂的错。
import fs from 'node:fs';
import path from 'node:path';

/** 注册.tsx 文本里 webpackContext 收的目录（相对作品根，不带 ./） */
export const 注册收的目录 = (注册文本: string): string[] =>
  [...注册文本.matchAll(/import\.meta\.webpackContext\(\s*['"]\.\/([^'"]+?)\/?['"]/g)].map((m) => m[1]!);

/** 新作品 段/ 下的占位文件：注册.tsx 的正则只收 段/<段键>/ 下的 段.ts、画面.tsx、叠层*.tsx，它不会被当成段 */
export const 占位文件名 = '说明.md';
export const 段目录占位文本 = `# 段/

正片的段放这里，一段一个目录：\`anim new seg <章>-<段名> --场 <场键>\`。

这个文件是给 git 记下 \`段/\` 目录用的：\`注册.tsx\` 用 \`import.meta.webpackContext('./段', …)\` 收这个目录，目录不在就打不了包（新 clone 下来的仓库里没有空目录）。
`;

/** 作品目录：作品/<名> 这样给人看的路径（作品可以登记在 作品/ 外） */
export const 缺目录提示 = (作品目录: string, 层: string) =>
  `${作品目录}/${层}/ 没有文件：注册.tsx 用 webpackContext 收这个目录，目录不在就打不了包（git 不记空目录，别处 clone 下来就没有）。` +
  `加一段（anim new seg），或建 ${作品目录}/${层}/${占位文件名} 占位`;

/** 作品根下 注册.tsx 收的目录里，本机不存在的那些 */
export const 缺的注册目录 = (作品根: string): string[] => {
  const 注册 = path.join(作品根, '注册.tsx');
  if (!fs.existsSync(注册)) return [];
  return 注册收的目录(fs.readFileSync(注册, 'utf8')).filter((d) => !fs.statSync(path.join(作品根, d), { throwIfNoEntry: false })?.isDirectory());
};
