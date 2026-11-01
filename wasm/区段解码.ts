// 区段解码（AssemblyScript，编成 WASM）：逐格预测压缩的解码半边。格式和编码半边见 pipeline/世界/烘焙/区段编码.ts，两边逐条对应，改一边必须改另一边，并升 engine/voxel/区段包.ts 的格式版本。
// 不在 tsconfig 的 include 里（AssemblyScript 的类型 tsc 不认）。编译和写回：anim world 解码器（docs/决策/0011-地形压缩.md）。
// 内存由 engine/voxel/区段解码.ts 排，这里只收指针；这个模块没有静态数据、不分配。
// 算法：自适应二进制区间编码（LZMA 那一种，算法公开），这里是自己写的，没有拷第三方代码。
const 边: i32 = 34, 列数: i32 = 边 * 边;
const 移: u32 = 4; // 概率每次往命中的方向挪 1/16
const 偏p2: usize = 768, 偏p3: usize = 1536, 偏跳: usize = 2304, 偏列: usize = 2688, 表字节: usize = 2742;

let range: u32 = 0, code: u32 = 0, at: usize = 0;

// @ts-ignore
@inline function bit(ps: usize, i: i32): i32 {
  const a = ps + (<usize>i << 1);
  const p = <u32>load<u16>(a);
  const bound = (range >>> 11) * p;
  let o: i32;
  if (code < bound) {
    range = bound;
    store<u16>(a, <u16>(p + ((2048 - p) >> 移)));
    o = 0;
  } else {
    code -= bound;
    range -= bound;
    store<u16>(a, <u16>(p - (p >> 移)));
    o = 1;
  }
  while (range < 0x1000000) {
    code = (code << 8) | <u32>load<u8>(at++);
    range <<= 8;
  }
  return o;
}
// @ts-ignore
@inline function 取(p: usize, i: i32): i32 {
  return <i32>load<u16>(p + (<usize>i << 1));
}
// @ts-ignore
@inline function 存(p: usize, i: i32, v: i32): void {
  store<u16>(p + (<usize>i << 1), <u16>v);
}

// 入、入长：编码流；表：初值表；工：表的工作拷贝；树：色板号的概率；cm、跑：列优先的格子和每格往下同值几格，都是 列数·nz 个 u16；数、号、长：解出来的行程。
// 返回行程数；流读过头或没读完（截断、错位、坏字节）返回 −1
export function 解(入: usize, 入长: i32, 表: usize, 工: usize, 树: usize, cm: usize, 跑: usize, 数: usize, 号: usize, 长: usize, nz: i32, 色板项: i32, L: i32): i32 {
  at = 入;
  range = 0xffffffff;
  code = 0;
  for (let i = 0; i < 4; i++) code = (code << 8) | <u32>load<u8>(at++);
  memory.copy(工, 表, 表字节);
  const p1 = 工, p2 = 工 + 偏p2, p3 = 工 + 偏p3, 跳 = 工 + 偏跳, 列 = 工 + 偏列;
  let 位: i32 = 1;
  while ((1 << 位) < 色板项) 位++;
  for (let i = 0, n = 1 << 位; i < n; i++) 存(树, i, 1024);
  const l = L == 0 ? 0 : L <= 2 ? 1 : 2, 偏 = l * 128;
  let 上次错: i32 = 0, 上列: i32 = 2;
  for (let c = 0; c < 列数; c++) {
    const base = c * nz, 有W = c % 边 > 0, 有N = c >= 边;
    const bW = 有W ? base - nz : 有N ? base - 边 * nz : -1, bN = 有N ? base - 边 * nz : bW;
    let 整 = false, 源: i32 = 0;
    if (bW >= 0) {
      const 境 = 上列 + 3 * l;
      if (!bit(列, 境)) {
        源 = bW;
        整 = true;
        上列 = 0;
      } else if (bN != bW) {
        if (!bit(列, 境 + 9)) {
          源 = bN;
          整 = true;
          上列 = 1;
        }
      }
      if (!整) 上列 = 2;
    }
    if (整) {
      memory.copy(cm + (<usize>base << 1), cm + (<usize>源 << 1), <usize>nz << 1);
      memory.copy(跑 + (<usize>base << 1), 跑 + (<usize>源 << 1), <usize>nz << 1);
      continue;
    }
    let k = nz - 1, 禁 = nz;
    while (k >= 0) {
      const 顶 = k == nz - 1;
      const W = bW >= 0 ? 取(cm, bW + k) : 0, N = bN >= 0 ? 取(cm, bN + k) : 0;
      const U = 顶 ? W : 取(cm, base + k + 1);
      if (k < 禁 && U == W && U == N) {
        const mW = bW >= 0 ? 取(跑, bW + k) : k + 1, mN = bN >= 0 ? 取(跑, bN + k) : k + 1;
        const m = mW < mN ? mW : mN;
        if (m >= 2) {
          const 桶 = 31 - clz<i32>(m);
          const 境 = (桶 > 7 ? 7 : 桶) | (U == 0 ? 8 : 0) | (上次错 << 4) | (顶 ? 32 : 0);
          if (!bit(跳, 境 + 64 * l)) {
            for (let j = 0; j < m; j++) 存(cm, base + k - j, U);
            k -= m;
            上次错 = 0;
            continue;
          }
          禁 = k - m + 1;
        }
      }
      const W变 = !顶 && bW >= 0 && 取(cm, bW + k) != 取(cm, bW + k + 1) ? 1 : 0;
      const N变 = !顶 && bN >= 0 && 取(cm, bN + k) != 取(cm, bN + k + 1) ? 1 : 0;
      const ctx = 偏 + (W变 | (N变 << 1) | (W == U ? 4 : 0) | (N == U ? 8 : 0) | (W == N ? 16 : 0) | (上次错 << 5) | (U == 0 ? 64 : 0));
      if (!bit(p1, ctx)) {
        存(cm, base + k, U);
        上次错 = 0;
        k--;
        continue;
      }
      上次错 = 1;
      if (W != U) {
        if (!bit(p2, ctx)) {
          存(cm, base + k, W);
          k--;
          continue;
        }
      }
      if (N != U && N != W) {
        if (!bit(p3, ctx)) {
          存(cm, base + k, N);
          k--;
          continue;
        }
      }
      let n: i32 = 1;
      for (let i = 位 - 1; i >= 0; i--) n = (n << 1) | bit(树, n);
      存(cm, base + k, n - (1 << 位));
      k--;
    }
    存(跑, base, 1);
    for (let z = 1; z < nz; z++) 存(跑, base + z, 取(cm, base + z) == 取(cm, base + z - 1) ? 取(跑, base + z - 1) + 1 : 1);
  }
  if (at != 入 + <usize>入长) return -1;
  // 列优先转回行程：每列从上往下
  let w: i32 = 0;
  for (let c = 0; c < 列数; c++) {
    const base = c * nz, w0 = w;
    let k = nz - 1;
    while (k >= 0) {
      const p = 取(cm, base + k);
      const n = 取(跑, base + k);
      存(号, w, p);
      存(长, w, n);
      w++;
      k -= n;
    }
    存(数, c, w - w0);
  }
  return w;
}
