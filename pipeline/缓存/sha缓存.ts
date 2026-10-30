// 按（路径、大小、修改时间）记文件的 sha256，文件没动就不重算：cache gc 只看不删时每次要比约 30 GB 同大小的母版。
// 缓存文件放 <数据根>/cache/sha缓存.json，键是相对 根 的路径（/ 分隔），换机器、换数据根位置不失效。
// 只是缓存：坏了、删了就从头算。存的时候先合并磁盘上别的进程这期间写进去的条目，再去掉文件已经不在的。
// 改了内容却保持大小和修改时间不变的（手动 touch -r）认不出来；anim 自己写文件都是新建再改名，修改时间一定变。
import fs from 'node:fs';
import path from 'node:path';
import { 文件sha } from './去重.ts';

export type sha条目 = { 大小: number; 改于: number; sha: string };
type 文件格式 = { 版本: 1; 文件: Record<string, sha条目> };

const 读文件 = (file: string): Record<string, sha条目> => {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as 文件格式;
    if (j.版本 === 1 && j.文件 && typeof j.文件 === 'object') return j.文件;
  } catch {
    // 没有或坏了就从头算
  }
  return {};
};

export class sha缓存 {
  readonly 文件: string;
  readonly 根: string;
  private 条目: Record<string, sha条目>;
  private 新记 = new Map<string, sha条目>();
  /** 这次命中、现算的个数和字节（报告提速用） */
  readonly 统计 = { 命中: 0, 命中字节: 0, 现算: 0, 现算字节: 0 };

  constructor(file: string, 根: string) {
    this.文件 = file;
    this.根 = 根;
    this.条目 = 读文件(file);
  }

  键(p: string) {
    return path.relative(this.根, p).split(path.sep).join('/');
  }

  /** 缓存里这个文件的 sha（大小、修改时间都对得上才算）；st 不给就现 stat */
  取(p: string, st: fs.Stats = fs.statSync(p)): string | undefined {
    const e = this.条目[this.键(p)];
    return e && e.大小 === st.size && e.改于 === st.mtimeMs ? e.sha : undefined;
  }

  记(p: string, st: fs.Stats, sha: string) {
    const e = { 大小: st.size, 改于: st.mtimeMs, sha };
    this.条目[this.键(p)] = e;
    this.新记.set(this.键(p), e);
  }

  /** 取不到就现算并记下 */
  async 算(p: string, st: fs.Stats = fs.statSync(p)): Promise<string> {
    const 有 = this.取(p, st);
    if (有) {
      this.统计.命中++;
      this.统计.命中字节 += st.size;
      return 有;
    }
    const sha = await 文件sha(p);
    this.统计.现算++;
    this.统计.现算字节 += st.size;
    this.记(p, st, sha);
    return sha;
  }

  /** 写回：磁盘上现有的 + 这次新记的，去掉文件已经不在的；原子改名 */
  存() {
    const 合 = { ...读文件(this.文件), ...Object.fromEntries(this.新记) };
    for (const k of Object.keys(合)) if (!fs.existsSync(path.join(this.根, ...k.split('/')))) delete 合[k];
    fs.mkdirSync(path.dirname(this.文件), { recursive: true });
    const tmp = `${this.文件}.写入中-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ 版本: 1, 文件: 合 } satisfies 文件格式) + '\n', 'utf8');
    fs.renameSync(tmp, this.文件);
    this.条目 = 合;
    this.新记.clear();
  }
}
