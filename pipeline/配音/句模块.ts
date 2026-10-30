// 句模块：<作品根>/台词/<台词 id>.ts，一句一个，由 anim voice 生成（进 Git，别手改），默认导出 engine/audio/台词句.ts 的 台词句。
// 段只 import 自己用的几句，加一句、改一句不让别的段过期。文本是确定的：同样的数据写出同样的字节（anim voice check 比这个）。
import fs from 'node:fs';
import path from 'node:path';
import type { 台词句 } from '../../engine/audio/台词句.ts';

export const 句模块目录 = (作品根: string) => path.join(作品根, '台词');
export const 句模块路径 = (作品根: string, id: string) => path.join(句模块目录(作品根), `${id}.ts`);

const 开头 = 'const 句: 台词句 = ';
const 结尾 = ';\nexport default 句;\n';

// 键的顺序固定；字、嘴一项一行，好看 diff
const 键序: readonly (keyof 台词句)[] = ['id', '角色', '念', '配音', '成品sha', '开口', '有声长', '时长', '文件秒数', '手修', '字', '嘴'];

export const 写句模块文本 = (句: 台词句): string => {
  const 行们: string[] = [];
  for (const k of 键序) {
    const v = 句[k];
    if (v === undefined) continue;
    if (k === '字' || k === '嘴') {
      const 项们 = (v as readonly unknown[]).map((x) => `    ${JSON.stringify(x)},`);
      行们.push(`  ${JSON.stringify(k)}: [`, ...项们, '  ],');
    } else 行们.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  }
  return [
    `// 由 anim voice 生成，别手改：改 作品的 台词.toml 后跑 anim voice lip ${句.id}（换配音跑 anim voice use）。`,
    "import type { 台词句 } from '@engine/audio/台词句.ts';",
    '',
    `${开头}{`,
    ...行们,
    `}${结尾}`,
  ].join('\n');
};

/** 句模块的数据（只认本工具写的格式） */
export const 解析句模块 = (t: string, 名 = '句模块'): 台词句 => {
  const a = t.indexOf(开头);
  const b = t.lastIndexOf(结尾);
  if (a < 0 || b < 0) throw new Error(`${名} 不是 anim voice 写的句模块（找不到「${开头}」）`);
  // 每项一行、行尾逗号；JSON 字符串里不会有换行，按「逗号 + 换行 + 收括号」去掉尾逗号不会误伤字符串
  return JSON.parse(t.slice(a + 开头.length, b).replace(/,\n(\s*[\]}])/g, '\n$1')) as 台词句;
};

/** 读回句模块；没有这个文件返回 null */
export const 读句模块 = (file: string): 台词句 | null => (fs.existsSync(file) ? 解析句模块(fs.readFileSync(file, 'utf8'), file) : null);

export const 列句模块 = (作品根: string): string[] => {
  const d = 句模块目录(作品根);
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3)).sort() : [];
};
