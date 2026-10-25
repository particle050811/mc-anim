// 私有配乐按 cue 现取（渲染那头见 engine/audio/私有配乐.ts）：段.ts 的 cue 里资产 id 以 配乐/ 开头、资产锁里在 私有 库的，打包前在
// <数据根>/cache/私有配乐/<id> 备一份：私有/ 里有字节就拷（APFS 上是克隆），缺了写一份盖得住本作品所有这条 cue 的静音 wav，并报出来。
// public 目录的 私有配乐 链到这个目录（pipeline/渲/public目录.ts）。缺了不报错（docs/架构.md：配乐缺了换静音；配音缺了照样失败，不走这里）。
// 拷而不链：Windows 上建文件符号链接要管理员权限。同一个 id 各作品、各 worktree 要的是同一份（id 换了版本另起 id，见作品资产表 配乐.toml），
// 所以这个目录各处共用；内容对不上才原子替换。
// 指纹：闭包里有 engine/audio/私有配乐.ts 的段，把本段 cue 里的私有配乐记成 sha 或「缺:静音」（指纹/指纹.ts），补上字节或换了字节就过期。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { 资产cue, 段定义 } from '../../engine/段/段定义.ts';
import { 字节路径, type 资产锁, type 锁条目 } from './资产锁.ts';

export const 私有配乐模块 = 'engine/audio/私有配乐.ts';
export const 私有配乐目录 = (根: string) => path.join(根, 'cache', '私有配乐');
export const 缺字节 = '缺:静音';

const 静音采样率 = 48000;

/** 这条 cue 的资产是不是按 cue 现取的私有配乐 */
export const 是私有配乐 = (id: string, 锁: 资产锁) => id.startsWith('配乐/') && 锁[id]?.库 === '私有';

/** 一段 cue 里的私有配乐 → sha（数据根里有字节）或 缺:静音；没有就是空表 */
export const 段私有配乐 = (段: Pick<段定义, '声音'>, 锁: 资产锁, 根: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const c of 段.声音 ?? []) if (c.资产 !== undefined && 是私有配乐(c.资产, 锁)) out[c.资产] = fs.existsSync(字节路径(锁[c.资产]!, 根)) ? 锁[c.资产]!.sha256 : 缺字节;
  return out;
};

/** 一条 cue 放到文件第几秒为止（静音要盖住它） */
const cue止秒 = (c: 资产cue, fps: number) => (c.入点秒 ?? 0) + (c.帧数 * (c.速率 ?? 1)) / fps;

/** 单声道 16 位 PCM 的静音 wav（秒取整）：Remotion 混音时它是全零，和不放一样 */
export const 静音wav = (秒: number): Buffer => {
  const 样本 = Math.ceil(秒) * 静音采样率;
  const 数据 = 样本 * 2;
  const b = Buffer.alloc(44 + 数据);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + 数据, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // 单声道
  b.writeUInt32LE(静音采样率, 24);
  b.writeUInt32LE(静音采样率 * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(数据, 40);
  return b;
};

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const 文件sha = (f: string) => (fs.existsSync(f) ? sha(fs.readFileSync(f)) : null);

export type 缺了的配乐 = { id: string; 秒: number; 应在: string };

/**
 * 按这些段（一部作品的全部段）的 cue 备好 cache/私有配乐/<id>；返回缺字节、换成静音的。
 * 已经是想要的那份就不动；要换时先写临时文件再改名（别的渲染正在读也只会读到整份旧的或整份新的）。
 */
export const 备好私有配乐 = (段们: { 段: Pick<段定义, '声音' | 'fps'> }[], 锁: 资产锁, 根: string): 缺了的配乐[] => {
  const 要: Map<string, { 条目: 锁条目; 秒: number }> = new Map();
  for (const { 段 } of 段们) {
    for (const c of 段.声音 ?? []) {
      if (c.资产 === undefined || !是私有配乐(c.资产, 锁)) continue;
      const 旧 = 要.get(c.资产);
      要.set(c.资产, { 条目: 锁[c.资产]!, 秒: Math.max(旧?.秒 ?? 0, cue止秒(c, 段.fps)) });
    }
  }
  const 缺: 缺了的配乐[] = [];
  for (const [id, { 条目, 秒 }] of 要) {
    const 目标 = path.join(私有配乐目录(根), ...id.split('/'));
    const 源 = 字节路径(条目, 根);
    const 有 = fs.existsSync(源);
    // 静音多留 1 秒：cue 的帧数换成秒有小数，解码器读到文件尾前后可能多要几个样本
    const 静音 = 有 ? null : 静音wav(秒 + 1);
    if (!有) 缺.push({ id, 秒: Math.ceil(秒 + 1), 应在: 源 });
    const 想要 = 有 ? 条目.sha256 : sha(静音!);
    if (文件sha(目标) === 想要) continue;
    fs.mkdirSync(path.dirname(目标), { recursive: true });
    const tmp = `${目标}.写入中-${process.pid}`;
    try {
      if (有) fs.copyFileSync(源, tmp, fs.constants.COPYFILE_FICLONE);
      else fs.writeFileSync(tmp, 静音!);
      // 库里的字节是只读的，拷出来的跟着只读；Windows 上改名盖不掉只读文件，这里放开
      fs.chmodSync(tmp, 0o644);
      fs.renameSync(tmp, 目标);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  return 缺;
};

export const 缺配乐提示 = (x: 缺了的配乐) =>
  `私有配乐「${x.id}」的字节不在 ${x.应在}，这次换成 ${x.秒} 秒静音渲（补上字节后段指纹会变，再渲就带歌；怎么补见仓库根 README.md）`;
