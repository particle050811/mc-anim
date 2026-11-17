// 读 Distant Horizons 的 LOD 库（立方区块版，表 FullDataCubic；存档里的 data/DistantHorizons.sqlite）：一个 (级, PosX, PosZ) 的各 PosY 行叠成 64 × 64 列。
// 这个分支没公开源码，格式是照库逆向、和 .mcr3d 读出的方块逐列对过的（docs/世界.md「DH 的 LOD 库」）：
// - 第 L 级一列 2^L 米见方，一个区段 64 × 64 列；竖直方向始终 1 格一档，一行管 min(64·2^L, 2048) 格高，PosY 是行号（y = PosY·行高 起）。
// - Mapping（zstd）：u32 大端条数，每条 Java UTF「<群系>_DH-BSW_<方块>_STATE_{属性:值}…」，空气是「<群系>_DH-BSW_AIR」。
// - Data（zstd）：内圈 62 × 62 列，下标 (x − 1)·62 + (z − 1)；四条边在 North（z = 0，按 x）、South（z = 63）、East（x = 63，按 z）、West（x = 0）AdjData 里，各 64 列。
//   每块依次：各列点数（varint）、全部点的「(映射号 << 2) | 标志」、全部点的高度（格数，一列从上往下，加起来 = 行高，空气也是点）。
// - 内圈的列是有损的：四周和上下都被挡住、看不见的格不单独记，并进它上面那个点（DH 的「看起来一样」压缩）。抽 423 个第 0 级区段数过：内圈的雪层 93% 连成 2～63 格的高段，
//   四条边（AdjData，没并）上雪层都只有 1 格、下面是草方块、泥土、石头。整格方块并了看不出来；雪层这类一格里只占一点的并了会画出几十层叠着的薄片，见 HIDDEN_BELOW。
// 取舍同 立方存档.ts：没存的行在地表上当空气、下当石头；第一格非空气在一行最顶上、而上面那行没存，就不知道地表，这一列不要。
// 只留地表往下 depth 格的细节（洞、矿在可见变换里本来就填掉），再往下并成一段石头，一直到 yFloor。
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';
import { stateString } from '../存档.ts';

const COLS = 64;
const UNDERGROUND_FILL = 'minecraft:stone';
// 第 0 级内圈里这些方块连成的高段，只有最上面一格是它，下面是并进来的看不见的格，换成右边的整格方块（方块 id，不带属性）。
// 只列「一格里只占一部分、又不会自己叠自己」的：换了不会错。栅栏、甘蔗、藤这类叠着的可能是真的，分不出来，照原样（多画几层看不见的，不影响画面）。
// 细雪例外：它真会叠（四条边上最高 5 格），但内圈 92% 是高段、最高 67 格，引擎又把它当不合并的材质逐格出面；下面换雪块看起来一样。
// 雪层换雪块不换石头：坡上一格一格的台阶会露出这一格的侧面，换石头雪坡上全是灰道；DH 自己也是整段按雪的颜色画。
// 第 1 级起（一列 2 米以上）连最上面那格也换，四条边也换：一格 2 米厚的地方画一片 1/8 格的雪没有意义，换成整格以后面能合并，地表高度也更接近（薄片贴在格子底上，比真实地表低大半格）。
const HIDDEN_BELOW: Record<string, string> = {
  'minecraft:snow': 'minecraft:snow_block',
  'minecraft:powder_snow': 'minecraft:snow_block',
  'minecraft:moss_carpet': 'minecraft:moss_block',
  'minecraft:dirt_path': 'minecraft:dirt',
  'minecraft:farmland': 'minecraft:dirt',
};
/** 一行管多少格高 */
export const dhRowSpan = (level: number) => Math.min(64 * 2 ** level, 2048);

/** 一个区段叠好的列：第 c 列（c = x·64 + z，区段内 0～63）的段是 start[c]～start[c+1]，从上往下；bottom 是段底（游戏 y，含），第一段的顶是 worldTop，最后一段的底是 yFloor。没数据的列段数 0 */
export type DhColumns = { start: Uint32Array; state: Uint16Array; biome: Uint16Array; bottom: Int32Array; /** 最高非空气格的 y；没数据 −2³¹ */ top: Int32Array };
export type DhReadOptions = { /** 最低读到哪（游戏 y，含） */ yFloor: number; /** 段的最高处（游戏 y，含）：比它高的不要 */ worldTop: number; /** 地表往下留多少格细节 */ depth: number };

export type DhDb = {
  /** 状态串（同 存档.ts 的 stateString）、群系名：各区段共用的编号，0 号状态是空气 */
  states: string[];
  biomes: string[];
  /** 这一级有数据的区段 [PosX, PosZ] */
  sections(level: number): [number, number][];
  has(level: number, posX: number, posZ: number): boolean;
  read(level: number, posX: number, posZ: number, o: DhReadOptions): DhColumns | null;
  close(): void;
};

/** 「<方块>_STATE_{k:v}{k:v}」→ 状态串 */
export const dhStateString = (s: string) => {
  if (s === 'AIR') return 'minecraft:air';
  const cut = s.indexOf('_STATE_');
  if (cut < 0) return stateString(s);
  const props: Record<string, string> = {};
  for (const m of s.slice(cut + 7).matchAll(/\{([^:}]+):([^}]*)\}/g)) props[m[1]!] = m[2]!;
  return stateString(s.slice(0, cut), Object.keys(props).length ? props : undefined);
};

type Plane = { start: Uint32Array; id: Uint32Array; h: Uint32Array };
const parsePlane = (raw: Uint8Array, cols: number): Plane => {
  const b = zstdDecompressSync(raw);
  let p = 0;
  const varint = () => {
    let v = 0, shift = 1;
    for (;;) {
      if (p >= b.length) throw new Error('DH 数据块短了');
      const c = b[p++]!;
      v += (c & 127) * shift;
      if (c < 128) return v;
      shift *= 128;
    }
  };
  const start = new Uint32Array(cols + 1);
  for (let c = 0; c < cols; c++) start[c + 1] = start[c]! + varint();
  const total = start[cols]!;
  const id = new Uint32Array(total), h = new Uint32Array(total);
  for (let i = 0; i < total; i++) id[i] = varint() >>> 2;
  for (let i = 0; i < total; i++) h[i] = varint();
  return { start, id, h };
};

export const openDhDb = (file: string): DhDb => {
  // 库是 WAL 模式，只读打开要 immutable=1（不然找不到 -wal、-shm 就报打不开）
  const url = pathToFileURL(file);
  url.searchParams.set('immutable', '1');
  const db = new DatabaseSync(url as unknown as string, { readOnly: true });
  const states = ['minecraft:air'];
  const stateIds = new Map([['minecraft:air', 0]]);
  const biomes: string[] = [];
  const biomeIds = new Map<string, number>();
  const intern = (list: string[], ids: Map<string, number>, key: string) => {
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = list.push(key) - 1));
    return id;
  };
  const fill = intern(states, stateIds, UNDERGROUND_FILL);
  // 状态号 → 高段里它下面换成的状态号（HIDDEN_BELOW），−1 = 不换；状态是边读边编号的，查到哪补到哪
  const hiddenBelow: number[] = [];
  const hiddenBelowOf = (state: number) => {
    let v = hiddenBelow[state];
    if (v === undefined) {
      const name = states[state]!;
      const cut = name.indexOf('[');
      const to = HIDDEN_BELOW[cut < 0 ? name : name.slice(0, cut)];
      v = hiddenBelow[state] = to === undefined ? -1 : intern(states, stateIds, to);
    }
    return v;
  };
  // 行表一次读进来：(级, PosX, PosZ) → 有哪些 PosY（从高到低）
  const rowsBySection = new Map<string, number[]>();
  const sectionsByLevel = new Map<number, [number, number][]>();
  for (const r of db.prepare('select DetailLevel l, PosX x, PosZ z, PosY y from FullDataCubic order by DetailLevel, PosX, PosZ, PosY desc').iterate() as Iterable<{ l: number; x: number; z: number; y: number }>) {
    const k = `${r.l},${r.x},${r.z}`;
    let ys = rowsBySection.get(k);
    if (!ys) {
      rowsBySection.set(k, (ys = []));
      let list = sectionsByLevel.get(r.l);
      if (!list) sectionsByLevel.set(r.l, (list = []));
      list.push([r.x, r.z]);
    }
    ys.push(r.y);
  }
  const rowQuery = db.prepare('select Data d, Mapping m, NorthAdjData n, SouthAdjData s, EastAdjData e, WestAdjData w from FullDataCubic where DetailLevel = ? and PosX = ? and PosY = ? and PosZ = ?');
  // 同一份 Mapping 很多行共用（整行石头、整行空气）
  const mappingCache = new Map<string, { state: Uint16Array; biome: Uint16Array }>();
  const parseMapping = (raw: Uint8Array) => {
    const key = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('latin1');
    let m = mappingCache.get(key);
    if (m) return m;
    const b = zstdDecompressSync(raw);
    const n = b.readUInt32BE(0);
    m = { state: new Uint16Array(n), biome: new Uint16Array(n) };
    let p = 4;
    for (let i = 0; i < n; i++) {
      const len = b.readUInt16BE(p);
      const s = b.toString('utf8', p + 2, p + 2 + len);
      p += 2 + len;
      const cut = s.indexOf('_DH-BSW_');
      if (cut < 0) throw new Error(`DH 映射串不认识：${s}`);
      m.biome[i] = intern(biomes, biomeIds, s.slice(0, cut));
      m.state[i] = intern(states, stateIds, dhStateString(s.slice(cut + 8)));
    }
    if (mappingCache.size > 4096) mappingCache.clear();
    mappingCache.set(key, m);
    return m;
  };

  const read = (level: number, posX: number, posZ: number, o: DhReadOptions): DhColumns | null => {
    const ys = rowsBySection.get(`${level},${posX},${posZ}`);
    if (!ys) return null;
    const span = dhRowSpan(level);
    const n = COLS * COLS;
    // 每列的进度：0 还没碰到非空气，1 在地表下面，2 完了（到深度或到底），3 不知道地表
    const phase = new Uint8Array(n);
    const top = new Int32Array(n).fill(-(2 ** 31));
    const lastState = new Int32Array(n).fill(-1), lastBiome = new Int32Array(n);
    const lastPoint = new Int32Array(n).fill(-1); // 这一列上一个点在库里的状态号（换成整格方块之前的），−1 = 没有或隔了没存的行
    // 段先按列各攒各的（链在一起），最后按列排好
    let cap = 1 << 16, count = 0;
    let runState = new Uint16Array(cap), runBiome = new Uint16Array(cap), runBottom = new Int32Array(cap), runPrev = new Int32Array(cap);
    const tail = new Int32Array(n).fill(-1), runCount = new Uint16Array(n);
    const push = (c: number, state: number, biome: number, bottom: number) => {
      if (lastState[c] === state && lastBiome[c] === biome) {
        runBottom[tail[c]!] = bottom;
        return;
      }
      if (count === cap) {
        cap *= 2;
        const grow = <T extends Uint16Array | Int32Array>(a: T): T => {
          const g = new (a.constructor as new (n: number) => T)(cap);
          g.set(a);
          return g;
        };
        (runState = grow(runState)), (runBiome = grow(runBiome)), (runBottom = grow(runBottom)), (runPrev = grow(runPrev));
      }
      runState[count] = state;
      runBiome[count] = biome;
      runBottom[count] = bottom;
      runPrev[count] = tail[c]!;
      tail[c] = count++;
      runCount[c]!++;
      lastState[c] = state;
      lastBiome[c] = biome;
    };
    let open = n; // 还没完的列数
    let prevRowBottom = Infinity; // 上一行的底 y；Infinity = 还没读过行
    for (const posY of ys) {
      if (!open) break;
      const rowBottom = posY * span, rowTop = rowBottom + span - 1;
      if (rowBottom > o.worldTop) continue;
      if (rowTop < o.yFloor) break;
      const row = rowQuery.get(level, posX, posY, posZ) as { d: Uint8Array; m: Uint8Array; n: Uint8Array | null; s: Uint8Array | null; e: Uint8Array | null; w: Uint8Array | null } | undefined;
      if (!row?.d || !row.m) continue;
      const mapping = parseMapping(row.m);
      const contiguous = prevRowBottom === rowTop + 1;
      // merged：内圈的列（看不见的格并进了上面那个点，见文件头）
      const walk = (plane: Plane, planeCol: number, c: number, merged: boolean) => {
        let ph = phase[c]!;
        if (ph >= 2) return;
        // 上面缺了几行：地表下面的补石头
        if (ph === 1 && !contiguous) {
          const floor = Math.max(o.yFloor, top[c]! - o.depth);
          lastPoint[c] = -1;
          if (rowTop < floor) {
            push(c, fill, 0, o.yFloor);
            phase[c] = 2;
            open--;
            return;
          }
          push(c, fill, 0, rowTop + 1);
        }
        let y = rowTop;
        for (let i = plane.start[planeCol]!, end = plane.start[planeCol + 1]!; i < end; i++) {
          const bottom = y - plane.h[i]! + 1;
          const state = mapping.state[plane.id[i]!]!;
          if (ph === 0) {
            if (state) {
              // 第一格非空气：上面要有存着的空气（这一行里，或紧挨着的上一行）
              if (y === rowTop && !contiguous) {
                ph = 3;
                break;
              }
              if (y <= o.worldTop) {
                ph = 1;
                top[c] = y;
                if (y < o.worldTop) push(c, 0, 0, y + 1);
              }
            }
          }
          if (ph === 1) {
            const floor = Math.max(o.yFloor, top[c]! - o.depth);
            const biome = state ? mapping.biome[plane.id[i]!]! : 0;
            let put = state;
            const below = state && (merged || level > 0) ? hiddenBelowOf(state) : -1;
            if (below >= 0) {
              // 粗的级整段换；第 0 级接着上一个点还是它（跨行）的整段都是并进来的，不然最上面一格是它、下面的换掉
              if (level > 0 || lastPoint[c] === state) put = below;
              else if (bottom < y && y > floor) {
                push(c, state, biome, y);
                put = below;
              }
            }
            lastPoint[c] = state;
            if (bottom <= floor) {
              push(c, put, biome, floor);
              if (floor > o.yFloor) push(c, fill, 0, o.yFloor);
              ph = 2;
              break;
            }
            push(c, put, biome, bottom);
          }
          y = bottom - 1;
        }
        if (ph >= 2) open--;
        phase[c] = ph;
      };
      const inner = parsePlane(row.d, 62 * 62);
      for (let x = 1; x < 63; x++) for (let z = 1; z < 63; z++) walk(inner, (x - 1) * 62 + z - 1, x * COLS + z, true);
      if (row.w) {
        const plane = parsePlane(row.w, COLS);
        for (let z = 0; z < COLS; z++) walk(plane, z, z, false);
      }
      if (row.e) {
        const plane = parsePlane(row.e, COLS);
        for (let z = 0; z < COLS; z++) walk(plane, z, 63 * COLS + z, false);
      }
      // 四个角在东西两条边里读过了
      if (row.n) {
        const plane = parsePlane(row.n, COLS);
        for (let x = 1; x < 63; x++) walk(plane, x, x * COLS, false);
      }
      if (row.s) {
        const plane = parsePlane(row.s, COLS);
        for (let x = 1; x < 63; x++) walk(plane, x, x * COLS + 63, false);
      }
      prevRowBottom = rowBottom;
    }
    // 排成按列的；地表下面没读到底的补一段石头到底
    const start = new Uint32Array(n + 1);
    for (let c = 0; c < n; c++) {
      if (phase[c] === 1 && runBottom[tail[c]!]! > o.yFloor) push(c, fill, 0, o.yFloor);
      start[c + 1] = start[c]! + (phase[c] === 1 || phase[c] === 2 ? runCount[c]! : 0);
    }
    const total = start[n]!;
    if (!total) return null;
    const out: DhColumns = { start, state: new Uint16Array(total), biome: new Uint16Array(total), bottom: new Int32Array(total), top };
    for (let c = 0; c < n; c++) {
      if (start[c + 1] === start[c]) {
        top[c] = -(2 ** 31);
        continue;
      }
      let at = start[c + 1]! - 1;
      for (let r = tail[c]!; r >= 0; r = runPrev[r]!, at--) {
        out.state[at] = runState[r]!;
        out.biome[at] = runBiome[r]!;
        out.bottom[at] = runBottom[r]!;
      }
    }
    return out;
  };

  return {
    states,
    biomes,
    sections: (level) => sectionsByLevel.get(level) ?? [],
    has: (level, posX, posZ) => rowsBySection.has(`${level},${posX},${posZ}`),
    read,
    close: () => db.close(),
  };
};
