// 区段的方块数据（`VoxelGrid`）、来源接口（`VoxelSource`），和粗格子合并的规则。方块是真实方块表（lib/真实方块表.ts）的体素值，
// 区段由来源从烘焙好的区段包解出来（lib/体素/导入地形.ts），交给 lib/体素/网格.ts 出几何。
//
// 第 L 级一格边长 2^L 米。粗格子里是什么方块照 Voxy 的 Mipper（common/world/other/Mipper.java）原样来（用户 10-03）：
// 先比不透明度（`blockProps.不透明`：整格不透明的和树叶 15、水 1、花草 0），再按位序取最大——位序是 8 个子格的编号 x·4 + y·2 + z
// （游戏坐标，y 朝上、z 朝南），所以偏向东、上、南。粗格子里只要有一个非空气方块这格就不是空气，所以远处地面、树冠往上胀，水和地面同格时露出水底。
// 区段包烘焙（工具/导入/烘焙/）时一级级合并用 `mergeKey`；`mergeBlocks` 给核对工具一次合并到底。
import { blockProps } from './真实方块表.ts';
import type { TerrainSampler } from './地表.ts';
import type { SectionId } from './区段.ts';

export type RGB = [number, number, number];
export type VoxelSource = {
  采样: TerrainSampler; // 只给 `pickSections` 估镜头到区段的距离
  // 区段：这一块的方块，null = 包里没有（没生成的区块），画成空的；只在 `prefetch` 取齐后调。
  // 预取：这一帧要用的区段，没取到的开始取，返回取齐的 Promise；都在手上返回 undefined（体素世界据此决定同步建还是先等）
  区段: (section: SectionId) => VoxelGrid | null;
  prefetch?: (qs: SectionId[]) => Promise<void> | undefined;
};
// 色板：体素值 + 染色（sRGB 0～255，游戏在 sRGB 上乘染色；不染色的方块是白色）
export type PaletteEntry = { v: number; c: RGB };
// 一个区段的方块：nx × ny × nz 格，x、y 两边各多一圈 apron（下标 0 和 n-1，邻区段的格子），z 从 0 起；
// 格：一格边长（米）；原点：下标 (1, 1, 0) 那一格的最小角的世界坐标；vox：色板号（0 = 空气），下标 (z * ny + y) * nx + x。
// z = 0 以下当实心，nz 以上当空气
// 水面（可选）：海面高度（场景 z，最上一格海水的上表面，主世界 −1）。给了的话，跨着海面那一格的液体顶面画在真实的海面上（见 lib/体素/网格.ts）
// 挖空（可选）：导入地形挖地标时整列挖空的列（下标 y * nx + x，1 = 挖之前有方块、挖完一块不剩），见 lib/体素/导入地形.ts 的 建地形
export type VoxelGrid = { nx: number; ny: number; nz: number; 格: number; 原点: [number, number, number]; vox: Uint16Array; 色板: PaletteEntry[]; 水面?: number; 挖空?: Uint8Array };

const { opaque: OPAQ, leaf: LEAF } = blockProps;
// 位序：一个数的各位隔两位摊开（第 b 位放到第 3b 位），三个轴交错成粗格子里的位序
const SPREAD = new Uint32Array(64).map((_, num) => {
  let spread = 0;
  for (let bit = 0; bit < 6; bit++) spread |= ((num >> bit) & 1) << (3 * bit);
  return spread;
});
// 同一位置时的先后（原木盖过树叶）
const prioOther = 1;
const prioLeaves = 0;
// 比较的键：粗格子里 (lx, ly, lz)（场景坐标，格子里的偏移）那一块，键大的当代表；op 是不透明度，先 是同一位置的先后。0 留给"没有方块"。区段包的烘焙（工具/导入/烘焙.ts）一级级合并也用它
export const mergeKey = (op: number, L: number, lx: number, ly: number, lz: number, prio: number) =>
  ((((op << (3 * L)) | (SPREAD[lx] << 2) | (SPREAD[lz] << 1) | SPREAD[(1 << L) - 1 - ly]) << 2) | prio) + 1;
// 一组方块按同样规则合并到 g 米（g = 2^k）的格子里，每格只留一块代表。
// 对齐：格子边界在坐标 -对齐 + g 的整数倍处。代表方块的坐标、体素值是真的
export type BlockGroup = { n: number; x: Int32Array; y: Int32Array; z: Int32Array; v: Uint16Array };
export const mergeBlocks = (blocks: BlockGroup, cellM: number, ax: number, ay: number, az: number): BlockGroup => {
  const level = Math.log2(cellM);
  const at = new Map<number, number>();
  const key: number[] = [];
  const pick: number[] = [];
  for (let i = 0; i < blocks.n; i++) {
    const alignedX = blocks.x[i] + ax, alignedY = blocks.y[i] + ay, alignedZ = blocks.z[i] + az;
    const cx = Math.floor(alignedX / cellM), cy = Math.floor(alignedY / cellM), cz = Math.floor(alignedZ / cellM);
    const voxel = blocks.v[i];
    const k = mergeKey(OPAQ[voxel], level, alignedX - cx * cellM, alignedY - cy * cellM, alignedZ - cz * cellM, LEAF[voxel] ? prioLeaves : prioOther);
    const cellKey = ((cx + 4096) * 8192 + (cy + 4096)) * 8192 + (cz + 4096);
    const slot = at.get(cellKey);
    if (slot === undefined) {
      at.set(cellKey, key.length);
      key.push(k);
      pick.push(i);
    } else if (k > key[slot]) {
      key[slot] = k;
      pick[slot] = i;
    }
  }
  const count = pick.length;
  const out: BlockGroup = { n: count, x: new Int32Array(count), y: new Int32Array(count), z: new Int32Array(count), v: new Uint16Array(count) };
  pick.forEach((i, k) => {
    out.x[k] = blocks.x[i];
    out.y[k] = blocks.y[i];
    out.z[k] = blocks.z[i];
    out.v[k] = blocks.v[i];
  });
  return out;
};
