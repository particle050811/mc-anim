// 区段解码（AssemblyScript，编成 WASM）：逐格预测压缩的解码半边。格式和编码半边见 pipeline/世界/烘焙/区段编码.ts，两边逐条对应，改一边必须改另一边，并升 engine/voxel/区段包.ts 的格式版本。
// 不在 tsconfig 的 include 里（AssemblyScript 的类型 tsc 不认）。编译和写回：anim world 解码器（docs/决策/0011-地形压缩.md）。
// 内存由 engine/voxel/区段解码.ts 排，这里只收指针；这个模块没有静态数据、不分配。
// 算法：自适应二进制区间编码（LZMA 那一种，算法公开），这里是自己写的，没有拷第三方代码。
const sectionSide: i32 = 34, columnCount: i32 = sectionSide * sectionSide;
// 空间概率按 1/32 更新；字面值显式传 4，按 1/16 更新。
const offsetPlane2: usize = 768, offsetPlane3: usize = 1536, offsetJump: usize = 2304, offsetColumn: usize = 2688, tableBytes: usize = 2742;

let range: u32 = 0, code: u32 = 0, at: usize = 0;

// @ts-ignore
@inline function bit(ps: usize, i: i32, shift: u32 = 5): i32 {
  const a = ps + (<usize>i << 1);
  const p = <u32>load<u16>(a);
  const bound = (range >>> 11) * p;
  let o: i32;
  if (code < bound) {
    range = bound;
    store<u16>(a, <u16>(p + ((2048 - p) >> shift)));
    o = 0;
  } else {
    code -= bound;
    range -= bound;
    store<u16>(a, <u16>(p - (p >> shift)));
    o = 1;
  }
  while (range < 0x1000000) {
    code = (code << 8) | <u32>load<u8>(at++);
    range <<= 8;
  }
  return o;
}
// @ts-ignore
@inline function readAt(p: usize, i: i32): i32 {
  return <i32>load<u16>(p + (<usize>i << 1));
}
// @ts-ignore
@inline function writeNode(p: usize, i: i32, v: i32): void {
  store<u16>(p + (<usize>i << 1), <u16>v);
}

// 入、入长：编码流；表：初值表；工：表的工作拷贝；树：色板号的概率；cm、跑：列优先的格子和每格往下同值几格，都是 列数·nz 个 u16；数、号、长：解出来的行程。
// 返回行程数；流读过头或没读完（截断、错位、坏字节）返回 −1
export function decodeSection(inPtr: usize, inLength: i32, tablePtr: usize, workPtr: usize, treeOff: usize, cm: usize, runOffset: usize, countsOffset: usize, idsOffset: usize, runLengthsPtr: usize, nz: i32, paletteSize: i32, L: i32, pal: usize, classmap: usize, weights: usize, scratch: usize, classes: i32, stride: i32): i32 {
  at = inPtr;
  range = 0xffffffff;
  code = 0;
  for (let i = 0; i < 4; i++) code = (code << 8) | <u32>load<u8>(at++);
  memory.copy(workPtr, tablePtr, <usize>(classes * 2742));
  const p1 = workPtr, p2 = workPtr + offsetPlane2, p3 = workPtr + offsetPlane3, jumpOffset = workPtr + offsetJump, colOffset = workPtr + offsetColumn;
  let bits: i32 = 1;
  while ((1 << bits) < paletteSize) bits++;
  const nodes: i32 = 1 << bits;
  const local = scratch + (<usize>nodes << 3);
  for (let v = 0; v < paletteSize; v++) store<u8>(local + <usize>v, load<u8>(classmap + <usize>load<u16>(pal + (<usize>v << 2))));
  for (let c = 0; c < classes; c++) {
    for (let v = 0; v < nodes; v++) {
      let w: u32 = 0;
      if (v < paletteSize) {
        const s: i32 = load<u16>(pal + (<usize>v << 2));
        w = s < stride ? <u32>load<u16>(weights + (<usize>(c * stride + s) << 1)) : 1;
      }
      store<u32>(scratch + (<usize>(nodes + v) << 2), w);
    }
    for (let i = nodes - 1; i > 0; i--) {
      const a = load<u32>(scratch + (<usize>i << 3)), b = load<u32>(scratch + (<usize>i << 3) + 4);
      store<u32>(scratch + (<usize>i << 2), a + b);
      const p: i32 = a + b ? <i32>(<f64>a / <f64>(a + b) * 2048.0 + 0.5) : 1024;
      writeNode(treeOff, c * nodes + i, min<i32>(2033, max<i32>(15, p)));
    }
  }
  const l = L == 0 ? 0 : L <= 2 ? 1 : 2, ctxOffset = l * 128;
  let lastMiss: i32 = 0, prevCol: i32 = 2;
  for (let c = 0; c < columnCount; c++) {
    const base = c * nz, hasWest = c % sectionSide > 0, hasNorth = c >= sectionSide;
    const bW = hasWest ? base - nz : hasNorth ? base - sectionSide * nz : -1, bN = hasNorth ? base - sectionSide * nz : bW;
    let isWhole = false, srcBlock: i32 = 0;
    if (bW >= 0) {
      const ctx = prevCol + 3 * l;
      if (!bit(colOffset, ctx)) {
        srcBlock = bW;
        isWhole = true;
        prevCol = 0;
      } else if (bN != bW) {
        if (!bit(colOffset, ctx + 9)) {
          srcBlock = bN;
          isWhole = true;
          prevCol = 1;
        }
      }
      if (!isWhole) prevCol = 2;
    }
    if (isWhole) {
      memory.copy(cm + (<usize>base << 1), cm + (<usize>srcBlock << 1), <usize>nz << 1);
      memory.copy(runOffset + (<usize>base << 1), runOffset + (<usize>srcBlock << 1), <usize>nz << 1);
      continue;
    }
    let k = nz - 1, limit = nz;
    while (k >= 0) {
      const isTop = k == nz - 1;
      const W = bW >= 0 ? readAt(cm, bW + k) : 0, N = bN >= 0 ? readAt(cm, bN + k) : 0;
      const U = isTop ? W : readAt(cm, base + k + 1);
      if (k < limit && U == W && U == N) {
        const mW = bW >= 0 ? readAt(runOffset, bW + k) : k + 1, mN = bN >= 0 ? readAt(runOffset, bN + k) : k + 1;
        const m = mW < mN ? mW : mN;
        if (m >= 2) {
          const bucket = 31 - clz<i32>(m);
          const ctx = (bucket > 7 ? 7 : bucket) | (U == 0 ? 8 : 0) | (lastMiss << 4) | (isTop ? 32 : 0);
          if (!bit(jumpOffset, ctx + 64 * l + 1371 * <i32>load<u8>(local + <usize>U))) {
            for (let j = 0; j < m; j++) writeNode(cm, base + k - j, U);
            k -= m;
            lastMiss = 0;
            continue;
          }
          limit = k - m + 1;
        }
      }
      const westChanged = !isTop && bW >= 0 && readAt(cm, bW + k) != readAt(cm, bW + k + 1) ? 1 : 0;
      const northChanged = !isTop && bN >= 0 && readAt(cm, bN + k) != readAt(cm, bN + k + 1) ? 1 : 0;
      const ctx = ctxOffset + (westChanged | (northChanged << 1) | (W == U ? 4 : 0) | (N == U ? 8 : 0) | (W == N ? 16 : 0) | (lastMiss << 5) | (U == 0 ? 64 : 0));
      if (!bit(p1, ctx + 1371 * <i32>load<u8>(local + <usize>U))) {
        writeNode(cm, base + k, U);
        lastMiss = 0;
        k--;
        continue;
      }
      lastMiss = 1;
      if (W != U) {
        if (!bit(p2, ctx + 1371 * <i32>load<u8>(local + <usize>W))) {
          writeNode(cm, base + k, W);
          k--;
          continue;
        }
      }
      if (N != U && N != W) {
        if (!bit(p3, ctx + 1371 * <i32>load<u8>(local + <usize>N))) {
          writeNode(cm, base + k, N);
          k--;
          continue;
        }
      }
      let n: i32 = 1;
      for (let i = bits - 1; i >= 0; i--) n = (n << 1) | bit(treeOff, n + nodes * <i32>load<u8>(local + <usize>U), 4);
      writeNode(cm, base + k, n - (1 << bits));
      k--;
    }
    writeNode(runOffset, base, 1);
    for (let z = 1; z < nz; z++) writeNode(runOffset, base + z, readAt(cm, base + z) == readAt(cm, base + z - 1) ? readAt(runOffset, base + z - 1) + 1 : 1);
  }
  if (at != inPtr + <usize>inLength) return -1;
  // 列优先转回行程：每列从上往下
  let w: i32 = 0;
  for (let c = 0; c < columnCount; c++) {
    const base = c * nz, w0 = w;
    let k = nz - 1;
    while (k >= 0) {
      const p = readAt(cm, base + k);
      const n = readAt(runOffset, base + k);
      writeNode(idsOffset, w, p);
      writeNode(runLengthsPtr, w, n);
      w++;
      k -= n;
    }
    writeNode(countsOffset, c, w - w0);
  }
  return w;
}
