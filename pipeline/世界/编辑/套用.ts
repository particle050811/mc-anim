// 把编辑集套到一个区域的列段上（区域源 的变换），照游戏执行这串命令后的结果：按步骤先后，后一步看得到前一步的改动。
// clone 读的是「执行到这一步之前」的世界，源可能在别的区域：按步算一次源快照（从原样的区域起、套上之前的步），记住复用。
// 只改方块状态；群系不动（clone、fill 在游戏里也不搬群系）。区块没生成完（列段里没这一列）的格跳过、记一条警告。
// 没有一步碰到的区域原样返回同一个对象：不改地形的包烘出来的字节和不套编辑时一样。
import { 列号, 摊开列, 起点表, type 解开的列段 } from '../列段.ts';
import type { 区域源 } from '../区域源.ts';
import { 体积, type 盒, type 步 } from './命令.ts';
import type { 编辑集 } from './编辑文件.ts';
import { 匹配, type 方块状态 } from './方块状态.ts';
import { 变换位置, 变换状态, 格下标 } from './结构.ts';

const 未知 = 0xffffffff;
/** 一步 clone 的源快照最多这么多格（游戏 clone 上限 32768，这里放宽到 6400 万，免得一次吃光内存） */
export const 快照上限 = 64 * 1024 * 1024;

const 盖列 = (b: 盒, x: number, z: number) => x >= b.x1 && x <= b.x2 && z >= b.z1 && z <= b.z2;
const 盖区域 = (b: 盒, rx: number, rz: number) => b.x2 >= rx * 512 && b.x1 <= rx * 512 + 511 && b.z2 >= rz * 512 && b.z1 <= rz * 512 + 511;

export class 编辑套用器 {
  readonly 编辑: 编辑集;
  private 原样源: Pick<区域源, '区域'>;
  /** 全局状态表：各区域的状态号先换成这里的号再套 */
  private 表: string[] = [];
  private 号 = new Map<string, number>();
  private 空气: number;
  private 快照们 = new Map<number, Uint32Array>();
  private 匹配缓存 = new Map<string, Map<number, boolean>>();
  private 结构号 = new Map<number, Uint32Array>();
  private 足迹 = new Map<number, Int32Array>();
  private 区域映 = new WeakMap<解开的列段, number[]>();
  /** 套用时碰到的问题（同一句只记一次） */
  readonly 警告 = new Set<string>();

  constructor(编辑: 编辑集, 原样源: Pick<区域源, '区域'>) {
    this.编辑 = 编辑;
    this.原样源 = 原样源;
    this.空气 = this.记('minecraft:air');
  }

  private 记(s: string) {
    let i = this.号.get(s);
    if (i === undefined) {
      i = this.表.push(s) - 1;
      this.号.set(s, i);
    }
    return i;
  }

  private 合(要: 方块状态, g: number, 键: string) {
    let m = this.匹配缓存.get(键);
    if (!m) this.匹配缓存.set(键, (m = new Map()));
    let v = m.get(g);
    if (v === undefined) m.set(g, (v = 匹配(要, this.表[g]!)));
    return v;
  }

  private 映(r: 解开的列段) {
    let m = this.区域映.get(r);
    if (!m) this.区域映.set(r, (m = r.状态表.map((s) => this.记(s))));
    return m;
  }

  /** 原样世界里一列（全局号，下标 y − y底）；没数据返回 null */
  private 原样列(x: number, z: number): { 格: Uint32Array; y底: number } | null {
    const r = this.原样源.区域(x >> 9, z >> 9);
    if (!r) return null;
    const c = 摊开列(r, 列号(r.rx, r.rz, x, z));
    if (!c) return null;
    const 映 = this.映(r);
    const 格 = new Uint32Array(c.状态.length);
    for (let i = 0; i < 格.length; i++) 格[i] = 映[c.状态[i]!]!;
    return { 格, y底: r.y底 };
  }

  /** 第 i 步 clone 的源快照：执行到第 i 步之前的世界里源盒的方块（全局号，格下标的顺序；没数据的格是 未知） */
  private 快照(i: number): Uint32Array {
    const 有 = this.快照们.get(i);
    if (有) return 有;
    const s = this.编辑.步[i]!;
    if (s.种 !== 'clone') throw new Error('只有 clone 有源快照');
    const b = s.源;
    if (体积(b) > 快照上限) throw new Error(`${s.出处}：clone 的源盒 ${体积(b)} 格，超过 ${快照上限}`);
    const sx = b.x2 - b.x1 + 1, sy = b.y2 - b.y1 + 1, sz = b.z2 - b.z1 + 1;
    const out = new Uint32Array(sx * sy * sz).fill(未知);
    let 缺列 = 0, 首个: [number, number] | null = null;
    for (let z = b.z1; z <= b.z2; z++)
      for (let x = b.x1; x <= b.x2; x++) {
        const c = this.原样列(x, z);
        if (!c) {
          缺列++;
          首个 ??= [x, z];
          continue;
        }
        this.套列(c.格, c.y底, x, z, i);
        for (let y = b.y1; y <= b.y2; y++) {
          const k = y - c.y底;
          if (k >= 0 && k < c.格.length) out[((y - b.y1) * sz + (z - b.z1)) * sx + (x - b.x1)] = c.格[k]!;
        }
      }
    // 一步只记一条（源盒大时逐列记会刷出成千上万行）
    if (首个) this.警告.add(`${s.出处}：clone 的源有 ${缺列} 列区块没生成（第一列在 (${首个[0]}, ${首个[1]})），按没有方块处理（不复制）`);
    this.快照们.set(i, out);
    return out;
  }

  /** place 第 i 步：世界列 (x, z) 对应结构里哪一列（结构 x + z·宽），不在结构里是 −1 */
  private 结构列(i: number, x: number, z: number) {
    const s = this.编辑.步[i]!;
    if (s.种 !== 'place') return -1;
    let f = this.足迹.get(i);
    const w = s.盒.x2 - s.盒.x1 + 1;
    if (!f) {
      f = new Int32Array(w * (s.盒.z2 - s.盒.z1 + 1)).fill(-1);
      const [ex, , ez] = s.结构.大小;
      for (let a = 0; a < ex; a++)
        for (let c = 0; c < ez; c++) {
          const [dx, dz] = 变换位置(a, c, s.旋转, s.镜像);
          f[(s.位置[2] + dz - s.盒.z1) * w + (s.位置[0] + dx - s.盒.x1)] = a + c * ex;
        }
      this.足迹.set(i, f);
    }
    return f[(z - s.盒.z1) * w + (x - s.盒.x1)]!;
  }

  /** place 第 i 步：结构调色（变换过的状态的全局号，结构空位是 未知） */
  private 结构调色(i: number) {
    let g = this.结构号.get(i);
    if (g) return g;
    const s = this.编辑.步[i]!;
    if (s.种 !== 'place') throw new Error('只有 place 有结构');
    const 缓 = new Map<string, number>();
    g = new Uint32Array(s.结构.格.length);
    s.结构.格.forEach((st, k) => {
      if (st === null) return void (g![k] = 未知);
      let v = 缓.get(st);
      if (v === undefined) 缓.set(st, (v = this.记(变换状态(st, s.旋转, s.镜像))));
      g![k] = v;
    });
    this.结构号.set(i, g);
    return g;
  }

  /** 把前 到 步（不含）里碰到列 (x, z) 的步按顺序套到这一列上 */
  private 套列(格: Uint32Array, y底: number, x: number, z: number, 到: number) {
    const y顶 = y底 + 格.length - 1;
    const 越界 = (s: 步, lo: number, hi: number) => {
      if (lo < y底 || hi > y顶) this.警告.add(`${s.出处}：y ${lo}～${hi} 超出世界高度 ${y底}～${y顶}，超出的部分不管`);
    };
    for (let i = 0; i < 到; i++) {
      const s = this.编辑.步[i]!;
      if (!盖列(s.盒, x, z)) continue;
      const lo = Math.max(s.盒.y1, y底), hi = Math.min(s.盒.y2, y顶);
      越界(s, s.盒.y1, s.盒.y2);
      switch (s.种) {
        case 'fill':
        case 'setblock': {
          const v = this.记(s.状态);
          const b = s.盒;
          const 边列 = x === b.x1 || x === b.x2 || z === b.z1 || z === b.z2;
          for (let y = lo; y <= hi; y++) {
            const k = y - y底;
            if (s.种 === 'fill' && (s.模式 === 'hollow' || s.模式 === 'outline')) {
              const 边 = 边列 || y === b.y1 || y === b.y2;
              if (边) 格[k] = v;
              else if (s.模式 === 'hollow') 格[k] = this.空气;
            } else if (s.模式 === 'keep') {
              if (格[k] === this.空气) 格[k] = v;
            } else if (s.种 === 'fill' && s.过滤) {
              if (this.合(s.过滤, 格[k]!, `${i}`)) 格[k] = v;
            } else 格[k] = v;
          }
          break;
        }
        case 'clone': {
          const 快 = this.快照(i);
          const b = s.源;
          const sx = b.x2 - b.x1 + 1, sz = b.z2 - b.z1 + 1;
          const 要复制 = (g: number) => g !== 未知 && (s.遮罩 === 'replace' || (s.遮罩 === 'masked' ? g !== this.空气 : this.合(s.过滤!, g, `${i}`)));
          // move：先把源里搬走的格清成空气，目标再覆盖上去（和游戏一样，重叠处以目标为准）
          if (s.移动 && 盖列(b, x, z))
            for (let y = Math.max(b.y1, y底); y <= Math.min(b.y2, y顶); y++) if (要复制(快[((y - b.y1) * sz + (z - b.z1)) * sx + (x - b.x1)]!)) 格[y - y底] = this.空气;
          const [dx, dy, dz] = s.偏移;
          const t: 盒 = { x1: b.x1 + dx, y1: b.y1 + dy, z1: b.z1 + dz, x2: b.x2 + dx, y2: b.y2 + dy, z2: b.z2 + dz };
          if (!盖列(t, x, z)) break;
          for (let y = Math.max(t.y1, y底); y <= Math.min(t.y2, y顶); y++) {
            const g = 快[((y - t.y1) * sz + (z - t.z1)) * sx + (x - t.x1)]!;
            if (要复制(g)) 格[y - y底] = g;
          }
          break;
        }
        case 'place': {
          const c = this.结构列(i, x, z);
          if (c < 0) break;
          const 色 = this.结构调色(i);
          const ex = s.结构.大小[0];
          const a = c % ex, cz = (c - a) / ex;
          for (let y = lo; y <= hi; y++) {
            const g = 色[格下标(s.结构, a, y - s.位置[1], cz)]!;
            if (g !== 未知) 格[y - y底] = g;
          }
          break;
        }
      }
    }
  }

  /** 套到一个区域上：返回新的列段（没被碰到就是原对象） */
  套(r: 解开的列段): 解开的列段 {
    const 步们 = this.编辑.步.map((s, i) => [s, i] as const).filter(([s]) => 盖区域(s.盒, r.rx, r.rz));
    if (!步们.length) return r;
    // 要改的列：各步盒在本区域里的范围
    const 改 = new Uint8Array(512 * 512);
    for (const [s] of 步们) {
      const x1 = Math.max(s.盒.x1, r.rx * 512) - r.rx * 512, x2 = Math.min(s.盒.x2, r.rx * 512 + 511) - r.rx * 512;
      const z1 = Math.max(s.盒.z1, r.rz * 512) - r.rz * 512, z2 = Math.min(s.盒.z2, r.rz * 512 + 511) - r.rz * 512;
      for (let z = z1; z <= z2; z++) 改.fill(1, z * 512 + x1, z * 512 + x2 + 1);
    }
    const 映 = this.映(r);
    const 状态表 = [...r.状态表];
    const 回 = new Map<number, number>(映.map((g, k) => [g, k]));
    const 回号 = (g: number) => {
      let k = 回.get(g);
      if (k === undefined) {
        k = 状态表.push(this.表[g]!) - 1;
        回.set(g, k);
      }
      return k;
    };
    const 段数 = new Uint16Array(r.段数);
    const 状态: number[] = [], 底: number[] = [], 群系: number[] = [];
    let 没数据 = 0;
    for (let col = 0; col < 512 * 512; col++) {
      const s0 = r.runStarts[col]!, e0 = r.runStarts[col + 1]!;
      if (!改[col] || s0 === e0) {
        if (改[col]) 没数据++;
        for (let k = s0; k < e0; k++) (状态.push(r.状态[k]!), 底.push(r.底[k]!), 群系.push(r.群系[k]!));
        continue;
      }
      const c = 摊开列(r, col)!;
      const 格 = new Uint32Array(c.状态.length);
      for (let k = 0; k < 格.length; k++) 格[k] = 映[c.状态[k]!]!;
      this.套列(格, r.y底, r.rx * 512 + (col & 511), r.rz * 512 + (col >> 9), this.编辑.步.length);
      // 从顶往下重新并段
      let n = 0;
      for (let k = 格.length - 1; k >= 0; k--) {
        const st = 回号(格[k]!), bi = c.群系[k]!;
        if (k < 格.length - 1 && st === 回号(格[k + 1]!) && bi === c.群系[k + 1]) {
          底[底.length - 1] = r.y底 + k;
          continue;
        }
        状态.push(st), 底.push(r.y底 + k), 群系.push(bi);
        n++;
      }
      if (n > 0xffff) throw new Error(`r.${r.rx}.${r.rz} 列 ${col} 套完编辑有 ${n} 段，放不进 u16`);
      段数[col] = n;
    }
    if (没数据) this.警告.add(`r.${r.rx}.${r.rz}：编辑碰到的 ${没数据} 列区块没生成，跳过`);
    if (状态表.length > 65536) throw new Error(`r.${r.rx}.${r.rz} 套完编辑方块状态超过 65536 种`);
    return { ...r, 状态表, 段数, 状态: Uint16Array.from(状态), 底: Int16Array.from(底), 群系: Uint8Array.from(群系), runStarts: 起点表(段数) };
  }
}
