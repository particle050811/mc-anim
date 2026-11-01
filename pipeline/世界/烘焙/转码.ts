// anim world 转码：把现有地形包（格式 1）转成现行格式。只写新版本目录（版本是内容指纹），旧目录一个字节不动；转完逐格比过才登记。
// 转的结果和拿同一个存档重新 anim world bake 字节相同（区段先后、包.json 的写法都一样），所以换格式不用回去烘存档。
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { 载入体素库 } from '../体素库.ts';
import { 发布, 新暂存, 版本目录, 登记, 登记条目, 读地形表 } from '../版本.ts';
import { 块文件们, 块格式 } from './读区段.ts';
import type { 转码活, 转码果 } from './转码工人.ts';

const 工人们干 = async (活们: 转码活[], 线程: number, 进度: (完: number, 总: number) => void) => {
  const 剩 = [...活们], 果们: 转码果[] = [];
  await Promise.all(
    Array.from({ length: Math.min(线程, 活们.length) }, () =>
      new Promise<void>((好, 坏) => {
        const w = new Worker(new URL('./转码工人.ts', import.meta.url));
        const 下一个 = () => {
          const 活 = 剩.shift();
          if (活) return w.postMessage(活);
          void w.terminate();
          好();
        };
        w.on('error', 坏);
        w.on('message', (m: { 好了?: true; 错?: string; 果?: 转码果 }) => {
          if (m.错) {
            void w.terminate();
            return 坏(new Error(m.错));
          }
          if (m.果) {
            果们.push(m.果);
            进度(果们.length, 活们.length);
          }
          下一个();
        });
      }),
    ),
  );
  return 果们;
};

const 合计 = (果们: 转码果[]) => 果们.reduce((a, b) => ({ 区段: a.区段 + b.区段, 旧字节: a.旧字节 + b.旧字节, 新字节: a.新字节 + b.新字节, 格: a.格 + b.格, 非空气格: a.非空气格 + b.非空气格, 解毫秒: a.解毫秒 + b.解毫秒 }), { 区段: 0, 旧字节: 0, 新字节: 0, 格: 0, 非空气格: 0, 解毫秒: 0 });

/** 旧目录（格式 1）→ 新目录（现行格式）：块文件、包.json、缺失.tsv */
export const 转码目录 = async (旧: string, 新: string, 线程: number, 进度: (完: number, 总: number) => void = () => {}) => {
  const 库 = await 载入体素库();
  await 工人们干(块文件们(旧).map((名) => ({ 动作: '转' as const, 旧, 新, 名 })), 线程, 进度);
  const info = JSON.parse(fs.readFileSync(path.join(旧, '包.json'), 'utf8')) as { 版本: number };
  fs.writeFileSync(path.join(新, '包.json'), JSON.stringify({ ...info, 版本: 库.区段包.formatVersion }));
  fs.copyFileSync(path.join(旧, '缺失.tsv'), path.join(新, '缺失.tsv'));
};

/** 从磁盘上两边各解一遍逐格比，不一样抛错；包.json 除版本外也要一样。旧、新可以是任何格式的包 */
export const 逐格比目录 = async (旧: string, 新: string, 线程: number, 进度: (完: number, 总: number) => void = () => {}) => {
  const 名们 = 块文件们(旧);
  if (JSON.stringify(块文件们(新)) !== JSON.stringify(名们)) throw new Error('两边的块文件不一样');
  const 读 = (d: string) => ({ ...(JSON.parse(fs.readFileSync(path.join(d, '包.json'), 'utf8')) as object), 版本: 0 });
  if (JSON.stringify(读(旧)) !== JSON.stringify(读(新))) throw new Error('包.json 除版本外不一样');
  return 合计(await 工人们干(名们.map((名) => ({ 动作: '比' as const, 旧, 新, 名 })), 线程, 进度));
};

export type 转码选项 = { 从?: string; 不登记?: boolean; 线程: number; 日志: (s: string) => void };

export const 转码包 = async (包: string, o: 转码选项) => {
  const 表 = 读地形表().包;
  const 旧版本 = o.从 ?? 表[包]?.版本;
  if (!旧版本) throw new Error(`地形包 ${包} 没登记，用 --从 <版本> 指定转哪一版`);
  const 旧 = 版本目录(包, 旧版本);
  if (!fs.existsSync(旧)) throw new Error(`没有 ${旧}`);
  const 名们 = 块文件们(旧);
  if (!名们.length) throw new Error(`${旧} 里没有块文件，不是区段格式的包（主世界-116-远景 是整文件的高度、群系网格，不用转）`);
  const 头 = new Uint8Array(16);
  const fd = fs.openSync(path.join(旧, 名们[0]!), 'r');
  fs.readSync(fd, 头, 0, 16, 0);
  fs.closeSync(fd);
  const 格式 = 块格式(头);
  if (格式 !== 1) throw new Error(`${包}/${旧版本} 已经是格式 ${格式}，不用转`);

  const 暂存 = 新暂存(包);
  const 进度 = (做: string) => (完: number, 总: number) => {
    if (完 === 总 || 完 % 10 === 0) o.日志(`  ${做} ${完}/${总} 个块文件`);
  };
  let 版本: string, dir: string, 已有: boolean;
  try {
    const t0 = performance.now();
    await 转码目录(旧, 暂存.dir, o.线程, 进度('转'));
    o.日志(`  转完 ${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
    ({ 版本, 目录: dir, 已有 } = 发布(包, 暂存.dir));
  } finally {
    暂存.放();
  }

  const 果 = await 逐格比目录(旧, dir, o.线程, 进度('逐格比'));
  const 比例 = ((100 * 果.新字节) / 果.旧字节).toFixed(1);
  o.日志(`${包}：${旧版本} → ${版本}${已有 ? '（这一版已经有了）' : ''}`);
  o.日志(`  ${名们.length} 个块文件、${果.区段} 个区段、${果.格} 格（非空气 ${果.非空气格}）逐格相同`);
  o.日志(`  区段字节 ${果.旧字节} → ${果.新字节}（${比例}%），平均解一个区段 ${(果.解毫秒 / 果.区段).toFixed(3)} 毫秒（工人并行时测的，机器忙时偏大）`);

  const 原 = 表[包];
  const 要登记 = !o.不登记 && 原 !== undefined;
  if (要登记 && 原.版本 !== 版本) {
    const 来源 = `${原.来源}；anim world 转码 从 ${旧版本} 转成逐格预测压缩（docs/决策/0011-地形压缩.md）`;
    const 条目 = await 登记条目(包, 版本, { 来源, 许可: 原.许可, 可见性: 原.可见性, ...(原.说明 ? { 说明: 原.说明 } : {}) });
    登记(包, 条目);
    o.日志('  已登记进 assets/地形版本.json，要随代码提交');
  } else if (!要登记) o.日志(`  没登记（${o.不登记 ? '--不登记' : '这个包不在 assets/地形版本.json 里'}）`);
  return { 包, 旧版本, 版本, 目录: dir, 块文件: 名们.length, ...果 };
};
