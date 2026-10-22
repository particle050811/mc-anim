// 边城的体素格子：像在游戏里搭城一样一格一格放方块（布局.ts），再把同一种方块连成的一片合并成长方体（渲染.ts 一个长方体画成一个实例）。
// 坐标：城的局部坐标（原点在城中心的地面，Z 朝上，北 = +Y），格 (x, y, z) 占 [x, x+1]×[y, y+1]×[z, z+1]，1 格 = 1 米。
// 贴图按世界坐标铺（每格一张，渲染.ts），所以合并成多大的长方体，看上去都还是一格一格的方块。
import { entryOf, type Shape } from './方块.ts';

export class VoxelGrid {
  readonly x0: number;
  readonly y0: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly c: Uint8Array;
  constructor(x0: number, x1: number, y0: number, y1: number, nz: number) {
    this.x0 = x0;
    this.y0 = y0;
    this.nx = x1 - x0;
    this.ny = y1 - y0;
    this.nz = nz;
    this.c = new Uint8Array(this.nx * this.ny * nz);
  }
  private at(x: number, y: number, z: number) {
    const i = x - this.x0;
    const j = y - this.y0;
    if (i < 0 || j < 0 || z < 0 || i >= this.nx || j >= this.ny || z >= this.nz) return -1;
    return (z * this.ny + j) * this.nx + i;
  }
  get(x: number, y: number, z: number) {
    const k = this.at(x, y, z);
    return k < 0 ? 0 : this.c[k];
  }
  set(x: number, y: number, z: number, id: number) {
    const k = this.at(x, y, z);
    if (k >= 0) this.c[k] = id;
  }
  // 只在空气里放（屋檐伸到邻居家时不覆盖人家的墙）
  put(x: number, y: number, z: number, id: number) {
    const k = this.at(x, y, z);
    if (k >= 0 && this.c[k] === 0) this.c[k] = id;
  }
  // 填满 [x0, x1)×[y0, y1)×[z0, z1)
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, z, id);
  }
}

// 长方体：[x0, y0, z0, 大小 x, y, z, 方块编号]（方块编号对应 方块表 里的名字，渲染时查贴图）
export type Cuboid = [number, number, number, number, number, number, number];

// 贪心合并：同一种方块、同一种形状连成的一片合成一个长方体。
// 整块三个方向都合并；台阶只在水平面里合并（上下叠的两层台阶中间是空的）；楼梯只顺着一排合并（朝南北的沿 X、朝东西的沿 Y），
// 一排楼梯画成两个长方体（下面的半块 + 高的那半）
export const mergeCuboids = (grid: VoxelGrid, blockIdOf: (name: string) => number): Cuboid[] => {
  const { nx, ny, nz, c: cells } = grid;
  const done = new Uint8Array(cells.length);
  const out: Cuboid[] = [];
  const same = (k: number, id: number) => cells[k] === id && !done[k];
  for (let z = 0; z < nz; z++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k0 = (z * ny + j) * nx + i;
        const id = cells[k0];
        if (!id || done[k0]) continue;
        const { blocks: block, shape: shape } = entryOf(id);
        const kind: 'box' | 'slab' | 'rowX' | 'rowY' = shape === '全' ? 'box' : shape === '下半' || shape === '上半' ? 'slab' : /[北南]/.test(shape) ? 'rowX' : 'rowY';
        // 沿 X
        let sizeX = 1;
        if (kind !== 'rowY') while (i + sizeX < nx && same(k0 + sizeX, id)) sizeX++;
        // 沿 Y（整行都一样才往前长）
        let sizeY = 1;
        if (kind === 'box' || kind === 'slab' || kind === 'rowY')
          grow: while (j + sizeY < ny) {
            const kr = k0 + sizeY * nx;
            for (let dx = 0; dx < sizeX; dx++) if (!same(kr + dx, id)) break grow;
            sizeY++;
          }
        // 沿 Z（整个矩形都一样才往上长）
        let sizeZ = 1;
        if (kind === 'box')
          up: while (z + sizeZ < nz) {
            const kl = k0 + sizeZ * nx * ny;
            for (let dy = 0; dy < sizeY; dy++) for (let dx = 0; dx < sizeX; dx++) if (!same(kl + dy * nx + dx, id)) break up;
            sizeZ++;
          }
        for (let t = 0; t < sizeZ; t++) for (let dy = 0; dy < sizeY; dy++) done.fill(1, k0 + t * nx * ny + dy * nx, k0 + t * nx * ny + dy * nx + sizeX);
        const x = grid.x0 + i;
        const y = grid.y0 + j;
        const blockId = blockIdOf(block);
        for (const part of splitShape(shape, x, y, z, sizeX, sizeY, sizeZ)) out.push([...part, blockId] as Cuboid);
      }
  return out;
};

// 一种形状的一片 → 几个长方体 [x0, y0, z0, sx, sy, sz]
const splitShape = (shape: Shape, x: number, y: number, z: number, sizeX: number, sizeY: number, sizeZ: number): number[][] => {
  switch (shape) {
    case '全':
      return [[x, y, z, sizeX, sizeY, sizeZ]];
    case '下半':
      return [[x, y, z, sizeX, sizeY, 0.5]];
    case '上半':
      return [[x, y, z + 0.5, sizeX, sizeY, 0.5]];
  }
  const upsideDown = shape.startsWith('倒');
  const full = upsideDown ? [x, y, z + 0.5, sizeX, sizeY, 0.5] : [x, y, z, sizeX, sizeY, 0.5]; // 整片的那半
  const zh = upsideDown ? z : z + 0.5; // 另外半层
  const dir = shape.slice(-1);
  const half =
    dir === '北' ? [x, y + 0.5, zh, sizeX, 0.5, 0.5] : dir === '南' ? [x, y, zh, sizeX, 0.5, 0.5] : dir === '东' ? [x + 0.5, y, zh, 0.5, sizeY, 0.5] : [x, y, zh, 0.5, sizeY, 0.5];
  return [full, half];
};
