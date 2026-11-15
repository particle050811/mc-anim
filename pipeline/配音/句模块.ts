// 句模块：<作品根>/台词/<台词 id>.ts，一句一个，由 anim voice 生成（进 Git，别手改），默认导出 engine/audio/台词句.ts 的 台词句。
// 段只 import 自己用的几句，加一句、改一句不让别的段过期。文本是确定的：同样的数据写出同样的字节（anim voice check 比这个）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LineSentence } from '../../engine/audio/台词句.ts';

export const sentenceDir = (workRoot: string) => path.join(workRoot, '台词');
export const sentencePath = (workRoot: string, id: string) => path.join(sentenceDir(workRoot), `${id}.ts`);

const moduleHead = 'const 句: 台词句 = ';
const moduleTail = ';\nexport default 句;\n';

// 键的顺序固定；字、嘴一项一行，好看 diff
const keyOrder: readonly (keyof LineSentence)[] = ['id', '角色', '念', '配音', '成品sha', '开口', '有声长', '时长', '文件秒数', '手修', '字', '嘴'];

export const writeSentenceText = (sentence: LineSentence): string => {
  const lines: string[] = [];
  for (const k of keyOrder) {
    const v = sentence[k];
    if (v === undefined) continue;
    if (k === '字' || k === '嘴') {
      const items = (v as readonly unknown[]).map((x) => `    ${JSON.stringify(x)},`);
      lines.push(`  ${JSON.stringify(k)}: [`, ...items, '  ],');
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  // 校验码是数据的哈希：手改了数据却没改它，anim check 就认出来（格式对得上也认得出）
  const checksum = crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex').slice(0, 12);
  return [
    `// 由 anim voice 生成（校验 ${checksum}），别手改：改 作品的 台词.toml 后跑 anim voice lip ${sentence.id}（换配音跑 anim voice use）。`,
    "import type { 台词句 } from '@engine/audio/台词句.ts';",
    '',
    `${moduleHead}{`,
    ...lines,
    `}${moduleTail}`,
  ].join('\n');
};

/** 句模块的数据（只认本工具写的格式） */
export const parseSentenceModule = (t: string, sourceName = '句模块'): LineSentence => {
  const a = t.indexOf(moduleHead);
  const b = t.lastIndexOf(moduleTail);
  if (a < 0 || b < 0) throw new Error(`${sourceName} 不是 anim voice 写的句模块（找不到「${moduleHead}」）`);
  // 每项一行、行尾逗号；JSON 字符串里不会有换行，按「逗号 + 换行 + 收括号」去掉尾逗号不会误伤字符串
  return JSON.parse(t.slice(a + moduleHead.length, b).replace(/,\n(\s*[\]}])/g, '\n$1')) as LineSentence;
};

/** 读回句模块；没有这个文件返回 null */
export const readSentenceModule = (file: string): LineSentence | null => (fs.existsSync(file) ? parseSentenceModule(fs.readFileSync(file, 'utf8'), file) : null);

export const listSentenceModules = (workRoot: string): string[] => {
  const d = sentenceDir(workRoot);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3)).sort() : [];
};
