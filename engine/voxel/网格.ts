// 网格（纯函数，不碰 three）：一个区段的方块（lib/体素/生成.ts 的 `VoxelGrid`）→ 几何。方块的面、贴图、染色路查 lib/真实方块表.ts，画法见 lib/体素/材质.ts。
// 以格为单位：第 L 级一格 2^L 米，画的时候整块放大，一格还是铺一整张贴图（Voxy 远处也是）。
// 照 Voxy（voxy/src/main/java/me/cortex/voxy/client/core/rendering/building/RenderDataFactory.java、util/ScanMesher2D.java）做：
// - 面剔除：贴着整格不透明方块的面不画；同种的水挨着水不画（Voxy 的 cullsSame）。树叶第 0 级照游戏「高品质」（叶子之间的面都画），粗级照 Voxy 画成实心树叶（叶子之间、被叶子挡住的面都剔掉）。
// - 区段边上（挨着 apron，即相邻区段同一级的格子）按 apron 剔得掉的面（贴着实心的侧面）另放「裙边」四组，别的面照常剔。
//   裙边画不画每帧按邻居定（lib/体素/世界.tsx）：这一侧同一级的邻居这一帧也在画，裙边就藏在它的地面底下，不画；邻居是另一级或不在画，照旧画，免得交界漏缝。
//   为什么要藏：裙边是竖墙，从高处往下看几乎侧对镜头；three 的对数深度在片元着色器写 gl_FragDepth，开 MSAA 时一个像素里各采样点共用像素中心的深度，
//   侧对镜头的墙把深度外推到像素中心，会比挡在它前面的地面还近，抢走几个采样点，于是 6-3 从高空往下看时第 1 级区段边上有一条条 1 像素的土色直线（关对数深度、关 MSAA 或不画裙边都没了）。
// - 贪心合并：同一平面上挨着的整格面，贴图、叠加层、染色、类别都一样的，按行扫再往下一行并成长方形（ScanMesher2D），uv 跟着拉长、贴图按格平铺（着色器里取 fract）。
// - 按朝向分组：+x -x +y -y +z -z 和「不沿轴」（花草的十字面）七组，再加 +x -x +y -y 四组裙边，画的时候背对镜头的整组不画（Voxy 按区段、按朝向剔除）。
// - 按材质分：实心、镂空（第 0 级的树叶等）、实心树叶（粗级）、水、花草（不挡光的小东西，屏幕 AO 里不挡也不压，见 lib/体素/材质.ts）。
// - 面朝向亮度不烤进顶点（不照 Voxy 的 computeDirectionalFaceTint）：明暗全交给灯算，和导出网格（lib/方块网格.tsx）一致（用户 10-04 定）。
// - 环境光遮蔽不在网格里：照 Voxy 用屏幕空间的（lib/体素/屏幕AO.tsx），网格不算顶点 AO，四个角一样亮，合并得更多。
import { voxelFromState, blockProps, faceTable, faceStride } from './真实方块表.ts';
import type { VoxelGrid } from './生成.ts';

const { full: FULL, leaf: LEAF, layer: CLS, tint: TINT, spin: SPIN, offset: OFFS, plant: PLANT } = blockProps;
const FACES = faceTable;

// 一组面（同一种材质）：每个顶点 位置 xyz（相对体素块原点、以格为单位 × 64，Int16）、uv（× 16，Int16）、
// 贴图（底层号 + 4096 × 乘染色 + 8192 × 随机转；叠加层，65535 = 没有；另一面的贴图号 + 4096 × 乘染色：侧面存这块方块的顶面、顶面存它的侧面，65535 = 没有，远处两面按它混成一样的颜色，见 lib/体素/材质.ts 的 台阶并色；空着）、颜色（染色 rgb，sRGB 字节；第 4 个字节空着，顶点属性按 4 字节对齐）。
// 面按朝向排好：段[g]～段[g + 1] 是第 g 组（+x -x +y -y +z -z 不沿轴，再是 +x -x +y -y 的裙边，见文件头）
export type FaceGroup = { n: number; pos: Int16Array; uv: Int16Array; tex: Uint16Array; col: Uint8Array; 段: number[] };
export type SectionMesh = { 实心: FaceGroup; 镂空: FaceGroup; 实心树叶: FaceGroup; 水: FaceGroup; 花草: FaceGroup; 面数: number };
export const posScale = 64;
export const groupCount = 11;
export const skirtGroupStart = 7; // 第 裙边起 + d 组是朝 d（0～3：+x -x +y -y）的裙边
export const uvScale = 16;

class FaceBuffer {
  n = 0;
  // 组可能一直为空；第一次写入才分配，避免为没有用到的材质、朝向清零大数组。
  pos = new Int16Array(0);
  uv = new Int16Array(0);
  tex = new Uint16Array(0);
  col = new Uint8Array(0);
  grow() {
    const capacity = this.pos.length ? this.pos.length / 12 * 2 : 256;
    const pos = new Int16Array(capacity * 12), uv = new Int16Array(capacity * 8);
    const tex = new Uint16Array(capacity * 16), col = new Uint8Array(capacity * 16);
    pos.set(this.pos);
    uv.set(this.uv);
    tex.set(this.tex);
    col.set(this.col);
    this.pos = pos;
    this.uv = uv;
    this.tex = tex;
    this.col = col;
  }
  // 四个角（从外面看逆时针）、uv、贴图、染色
  push(corners: ArrayLike<number>, uv: ArrayLike<number>, t0: number, t1: number, red: number, green: number, blue: number, otherTex: number) {
    if ((this.n + 1) * 12 > this.pos.length) this.grow();
    const vertexBase = this.n * 4;
    for (let k = 0; k < 4; k++) {
      this.pos[(vertexBase + k) * 3] = Math.round(corners[k * 3] * posScale);
      this.pos[(vertexBase + k) * 3 + 1] = Math.round(corners[k * 3 + 1] * posScale);
      this.pos[(vertexBase + k) * 3 + 2] = Math.round(corners[k * 3 + 2] * posScale);
      this.uv[(vertexBase + k) * 2] = Math.round(uv[k * 2] * uvScale);
      this.uv[(vertexBase + k) * 2 + 1] = Math.round(uv[k * 2 + 1] * uvScale);
      this.tex[(vertexBase + k) * 4] = t0;
      this.tex[(vertexBase + k) * 4 + 1] = t1;
      this.tex[(vertexBase + k) * 4 + 2] = otherTex;
      const colorAt = (vertexBase + k) * 4;
      this.col[colorAt] = red;
      this.col[colorAt + 1] = green;
      this.col[colorAt + 2] = blue;
      this.col[colorAt + 3] = 255;
    }
    this.n++;
  }
}
const packFaceGroup = (bs: FaceBuffer[]): FaceGroup => {
  const faceCount = bs.reduce((s, b) => s + b.n, 0);
  const out: FaceGroup = { n: faceCount, pos: new Int16Array(faceCount * 12), uv: new Int16Array(faceCount * 8), tex: new Uint16Array(faceCount * 16), col: new Uint8Array(faceCount * 16), 段: [0] };
  let at = 0;
  for (const buffer of bs) {
    if (buffer.n) {
      out.pos.set(buffer.pos.subarray(0, buffer.n * 12), at * 12);
      out.uv.set(buffer.uv.subarray(0, buffer.n * 8), at * 8);
      out.tex.set(buffer.tex.subarray(0, buffer.n * 16), at * 16);
      out.col.set(buffer.col.subarray(0, buffer.n * 16), at * 16);
    }
    at += buffer.n;
    out.段.push(at);
  }
  return out;
};

// 和 `keyGrid` 一样只作同步调用的暂存区；合组仍复制到独立数组，后续区段不会覆盖已返回的网格。保留各组的容量，省掉每个区段重新分配的开销。
const bufferSets = Array.from({ length: 5 }, () => Array.from({ length: groupCount }, () => new FaceBuffer()));

// 台阶并色用的「另一面」（见 面组 的贴图）：朝 d 的面配的贴图号 + 4096 × 乘染色。侧面（d 0～3）配顶面，顶面（d 4）配第一个侧面，别的 65535
// 体素号连续且方块表不变，用定长表替代每个输出面的 Map 查找；0 留给未计算，实际贴图号加一保存。
const otherFaceCache = new Uint32Array(FACES.length * 2);
const otherFaceTex = (voxel: number, dir: number) => {
  if (dir > 4) return 65535;
  const k = voxel * 2 + (dir === 4 ? 1 : 0);
  const cached = otherFaceCache[k];
  if (cached) return cached - 1;
  const faces = FACES[voxel];
  let t = 65535;
  for (let faceOff = 0; faceOff < faces.length; faceOff += faceStride)
    if (dir === 4 ? faces[faceOff] < 4 : faces[faceOff] === 4) {
      t = faces[faceOff + 2] + (faces[faceOff + 4] ? 4096 : 0);
      break;
    }
  otherFaceCache[k] = t + 1;
  return t;
};
// 每个朝向的面内两个轴（u 轴、v 轴）：合并时在面内按 u 行、v 列扫
const faceAxes = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]];
// 面内 UV 只由方块模型决定，不随区段、合并宽高改变；每种模型算一次，免去每个矩形找角和分配 du/dv。
// 用 Float64 保存差值，保持 JS 数值计算的精度和乘加顺序。
const mergedUvCache: Float64Array[] = [];
const buildMergedUv = (voxel: number) => {
  const faces = FACES[voxel];
  const table = new Float64Array(faces.length / faceStride * 6);
  for (let faceOff = 0; faceOff < faces.length; faceOff += faceStride) {
    if (!faces[faceOff + 29]) continue;
    const ua = faceAxes[faces[faceOff]][0], va = faceAxes[faces[faceOff]][1];
    let s00 = 0, s10 = 0, s01 = 0;
    for (let corner = 3; corner >= 0; corner--) {
      const cu = faces[faceOff + 6 + corner * 3 + ua], cv = faces[faceOff + 6 + corner * 3 + va];
      if (cu === 0 && cv === 0) s00 = corner;
      if (cu === 1 && cv === 0) s10 = corner;
      if (cu === 0 && cv === 1) s01 = corner;
    }
    const at = faceOff / faceStride * 6;
    table[at] = faces[faceOff + 18 + s00 * 2];
    table[at + 1] = faces[faceOff + 19 + s00 * 2];
    table[at + 2] = faces[faceOff + 18 + s10 * 2] - table[at];
    table[at + 3] = faces[faceOff + 19 + s10 * 2] - table[at + 1];
    table[at + 4] = faces[faceOff + 18 + s01 * 2] - table[at];
    table[at + 5] = faces[faceOff + 19 + s01 * 2] - table[at + 1];
  }
  mergedUvCache[voxel] = table;
  return table;
};
const hash3 = (x: number, y: number, z: number) => {
  let hash = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f);
  hash = Math.imul(hash ^ (hash >>> 13), 0x5bd1e995);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
};

// 合并用的格子（按朝向、按层）：键（0 = 这格没有能合并的面）和代表面（体素值、面号），用完清零，几块之间复用
let keyGrid = new Float64Array(0);
let faceGrid = new Int32Array(0);
// 记录各行曾写入的 u 范围，合并时不用把整块体积里的空格再扫六遍；行尾为 0 表示空行，扫描后重置供下个区段复用。
let rowStart = new Int32Array(0);
let rowEnd = new Int32Array(0);
const STONE = voxelFromState('minecraft:stone'); // 体素块下面当实心
const belowMask = FULL[STONE] | (LEAF[STONE] << 1) | (CLS[STONE] === 3 ? 4 : 0);

// 海面：液体的顶面按方块模型画在格子里 h 的高度（水是 14.222/16），第 L 级一格 2^L 米时顶面在 (k + h)·2^L，各级高低不一样，
// 相邻两级交界处水面错开、中间漏一道亮缝。
// 体素块给了 `水面`（海面的场景 z）时，跨着最上一格海水的那一格，液体顶面一律画在 水面 − 1 + h（和第 0 级一样高），各级海面齐平；
// 不给就照旧（湖、河这些不在海面上的水也照旧，粗格子里不知道真实水面在哪）
const liquidTop = (voxels: VoxelGrid, k: number, modelHeight: number) => {
  if (voxels.水面 === undefined || voxels.格 === 1) return k + modelHeight;
  const z0 = voxels.原点[2] + k * voxels.格;
  if (!(z0 <= voxels.水面 - 1 && voxels.水面 - 1 < z0 + voxels.格)) return k + modelHeight;
  return (voxels.水面 - 1 + modelHeight - voxels.原点[2]) / voxels.格;
};

// 实心树叶：树叶画成实心（粗级）
export const buildSectionMesh = (voxels: VoxelGrid, solidLeaves: boolean): SectionMesh => {
  const { nx, ny, nz, vox, 色板: palette } = voxels;
  const sz = nx * ny;
  const paletteSize = palette.length;
  const PV = new Uint16Array(paletteSize);
  const occlusionMask = new Uint8Array(paletteSize);
  for (let i = 0; i < paletteSize; i++) {
    PV[i] = palette[i].v;
    const voxel = PV[i];
    occlusionMask[i] = FULL[voxel] | (LEAF[voxel] << 1) | (CLS[voxel] === 3 ? 4 : 0);
  }
  // 这一块里用到的染色编号（合并的键里放编号，不放整个颜色）
  const tintIdx = new Int32Array(paletteSize).fill(-1);
  const tints: number[][] = [];
  const tintIdByRgb = new Map<number, number>();
  for (let i = 1; i < paletteSize; i++) {
    if (!TINT[PV[i]]) continue;
    const rgb = palette[i].c;
    const k = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let tintId = tintIdByRgb.get(k);
    if (tintId === undefined) {
      tintId = tints.length;
      tints.push(rgb);
      tintIdByRgb.set(k, tintId);
    }
    tintIdx[i] = tintId;
  }
  // 五种材质 × 组数 组（七组朝向、四组裙边）
  const bufs = bufferSets;
  for (const bs of bufs) for (const buffer of bs) buffer.n = 0;
  const apron = 1;
  // 邻居用线性下标偏移；边界在方块处算一次，避免每个面经闭包反复换算坐标、判断四条边。
  const neighborOffset = [1, -1, nx, -nx, sz, -sz];
  const Ni = nx - 2 * apron, Nj = ny - 2 * apron;
  const dims = [Ni, Nj, nz];
  const cells = 6 * Ni * Nj * nz;
  if (keyGrid.length < cells) {
    keyGrid = new Float64Array(cells);
    faceGrid = new Int32Array(cells);
  }
  const volume = Ni * Nj * nz;
  const dirBase = [0, volume, volume * 2, volume * 3, volume * 4, volume * 5];
  const rowCount = 2 * Ni * nz + 4 * Nj * nz;
  if (rowEnd.length < rowCount) {
    rowStart = new Int32Array(rowCount);
    rowEnd = new Int32Array(rowCount);
  }
  const dirRowBase = [0, Ni * nz, 2 * Ni * nz, 2 * Ni * nz + Nj * nz, 2 * Ni * nz + 2 * Nj * nz, 2 * Ni * nz + 3 * Nj * nz];
  const corners = new Float64Array(12);
  const uv = new Float64Array(8);
  let hasMergeable = false;
  for (let k = 0; k < nz; k++) {
    for (let j = apron; j < ny - apron; j++) {
      for (let i = apron; i < nx - apron; i++) {
        const idx = (k * ny + j) * nx + i;
        const pi = vox[idx];
        if (!pi) continue;
        const voxel = PV[pi];
        const leaf = LEAF[voxel] === 1;
        // 四周都是整格不透明方块的整格方块（地下）直接跳过
        if (FULL[voxel] && i > apron && i < nx - apron - 1 && j > apron && j < ny - apron - 1 && k + 1 < nz &&
          (occlusionMask[vox[idx - 1]] & 1) && (occlusionMask[vox[idx + 1]] & 1) && (occlusionMask[vox[idx - nx]] & 1) && (occlusionMask[vox[idx + nx]] & 1) &&
          (occlusionMask[vox[idx + sz]] & 1) && ((k === 0 ? belowMask : occlusionMask[vox[idx - sz]]) & 1)) continue;
        const faces = FACES[voxel];
        const nf = faces.length / faceStride;
        const ti = tintIdx[pi];
        const cr = ti >= 0 ? palette[pi].c[0] : 255, cg = ti >= 0 ? palette[pi].c[1] : 255, cb = ti >= 0 ? palette[pi].c[2] : 255;
        const renderLayer = CLS[voxel];
        const mi = renderLayer === 3 ? 3 : PLANT[voxel] ? 4 : leaf && solidLeaves ? 2 : renderLayer === 0 ? 0 : 1;
        const cullMask = 1 | (solidLeaves && (leaf || FULL[voxel] === 1) ? 2 : 0) | (renderLayer === 3 ? 4 : 0);
        const edgeDirs = (i === nx - apron - 1 ? 1 : 0) | (i === apron ? 2 : 0) | (j === ny - apron - 1 ? 4 : 0) | (j === apron ? 8 : 0);
        // 花草按位置水平偏移（OffsetType.XZ，±0.25 格）
        let dx = 0, dy = 0;
        if (OFFS[voxel]) {
          dx = Math.round((hash3(i + voxels.原点[0], j + voxels.原点[1], 7) - 0.5) * 0.5 * posScale) / posScale;
          dy = Math.round((hash3(i + voxels.原点[0], j + voxels.原点[1], 8) - 0.5) * 0.5 * posScale) / posScale;
        }
        for (let face = 0; face < nf; face++) {
          const faceOff = face * faceStride;
          const dir = faces[faceOff], cullDir = faces[faceOff + 1];
          // 裙边：朝着 apron、按 apron 剔得掉的侧面（只认朝向和剔面方向一致的，别的照常画）
          let isSkirt = false;
          if (cullDir < 6) {
            const nb = cullDir === 5 && k === 0 ? belowMask : cullDir === 4 && k + 1 === nz ? 0 : occlusionMask[vox[idx + neighborOffset[cullDir]]];
            if (nb & cullMask) {
              // apron 不参与剔面；同向的侧面只归裙边，非同向面照常留下。上下仍分别当空气、石头。
              if (!(edgeDirs & (1 << cullDir))) continue;
              isSkirt = dir === cullDir;
            }
          }
          const group = isSkirt ? skirtGroupStart + dir : dir;
          const t0 = faces[faceOff + 2] + (faces[faceOff + 4] ? 4096 : 0) + (SPIN[voxel] && (dir === 4 || dir === 5) ? 8192 : 0);
          const t1 = faces[faceOff + 3] < 0 ? 65535 : faces[faceOff + 3];
          // 能合并的：整格面、不偏移
          if (faces[faceOff + 29] && !dx && !dy) {
            const uCell = dir < 2 ? j - apron : i - apron;
            const rowInDir = dir < 2 ? (i - apron) * nz + k : dir < 4 ? (j - apron) * nz + k : k * Nj + j - apron;
            const cell = dirBase[dir] + rowInDir * (dir < 2 ? Nj : Ni) + uCell;
            const row = dirRowBase[dir] + rowInDir;
            if (!rowEnd[row] || uCell < rowStart[row]) rowStart[row] = uCell;
            if (uCell >= rowEnd[row]) rowEnd[row] = uCell + 1;
            // 键：贴图、叠加层、染色、类别、是不是裙边都一样才并（数值放得下 53 位：14 + 12 + 12 + 3 + 1 + 1）
            const tk = (faces[faceOff + 4] || t1 !== 65535) && ti >= 0 ? ti : 4095;
            keyGrid[cell] = ((((t0 * 4096 + (t1 === 65535 ? 4095 : t1)) * 4096 + tk) * 8 + mi) * 2 + (isSkirt ? 1 : 0)) * 2 + 1;
            faceGrid[cell] = voxel * 64 + face;
            hasMergeable = true;
            continue;
          }
          // 角的顺序反过来（数据里从外面看是顺时针，three 的正面要逆时针）
          for (let corner = 0; corner < 4; corner++) {
            const srcCorner = 3 - corner;
            corners[corner * 3] = i - apron + dx + faces[faceOff + 6 + srcCorner * 3];
            corners[corner * 3 + 1] = j - apron + dy + faces[faceOff + 7 + srcCorner * 3];
            corners[corner * 3 + 2] = renderLayer === 3 && dir === 4 ? liquidTop(voxels, k, faces[faceOff + 8 + srcCorner * 3]) : k + faces[faceOff + 8 + srcCorner * 3];
            uv[corner * 2] = faces[faceOff + 18 + srcCorner * 2];
            uv[corner * 2 + 1] = faces[faceOff + 19 + srcCorner * 2];
          }
          bufs[mi][group].push(corners, uv, t0, t1, cr, cg, cb, otherFaceTex(voxel, dir));
        }
      }
    }
  }
  // 合并：每个朝向、每一层，按 u 方向连成一段，再往 v 方向一行行加长（ScanMesher2D）
  if (hasMergeable)
    for (let dir = 0; dir < 6; dir++) {
      const ua = faceAxes[dir][0], va = faceAxes[dir][1];
      const uSize = dims[ua], Vn = dims[va], sliceCount = dims[dir >> 1];
      for (let slice = 0; slice < sliceCount; slice++) {
        const base = dirBase[dir] + slice * uSize * Vn;
        const rowBase = dirRowBase[dir] + slice * Vn;
        for (let vv = 0; vv < Vn; vv++) {
          const row = rowBase + vv, rowEndU = rowEnd[row];
          if (!rowEndU) continue;
          rowEnd[row] = 0;
          for (let uu = rowStart[row]; uu < rowEndU; uu++) {
            const c0 = base + vv * uSize + uu;
            const key = keyGrid[c0];
            if (!key) continue;
            let width = 1;
            while (uu + width < uSize && keyGrid[c0 + width] === key) width++;
            let height = 1;
            grow: while (vv + height < Vn) {
              const rowCell = c0 + height * uSize;
              for (let t = 0; t < width; t++) if (keyGrid[rowCell + t] !== key) break grow;
              height++;
            }
            for (let t = 0; t < height; t++) {
              const rowCell = c0 + t * uSize;
              for (let x = 0; x < width; x++) keyGrid[rowCell + x] = 0;
            }
            // 代表面：左下那格的面，按它的角和 uv 推出整块的角和 uv（贴图每格重复，uv 按格数拉长）
            const vf = faceGrid[c0];
            const faces = FACES[vf >> 6];
            const faceOff = (vf & 63) * faceStride;
            const normalAxis = dir >> 1;
            const isLiquidTop = dir === 4 && CLS[vf >> 6] === 3;
            const uvTable = mergedUvCache[vf >> 6] || buildMergedUv(vf >> 6), at = (vf & 63) * 6;
            const u0 = uvTable[at], v0 = uvTable[at + 1];
            const du0 = uvTable[at + 2], du1 = uvTable[at + 3], dv0 = uvTable[at + 4], dv1 = uvTable[at + 5];
            for (let corner = 0; corner < 4; corner++) {
              const srcCorner = 3 - corner;
              const cu = faces[faceOff + 6 + srcCorner * 3 + ua], cv = faces[faceOff + 6 + srcCorner * 3 + va];
              corners[corner * 3 + normalAxis] = isLiquidTop ? liquidTop(voxels, slice, faces[faceOff + 8 + srcCorner * 3]) : slice + faces[faceOff + 6 + srcCorner * 3 + normalAxis];
              corners[corner * 3 + ua] = uu + cu * width;
              corners[corner * 3 + va] = vv + cv * height;
              uv[corner * 2] = u0 + du0 * cu * width + dv0 * cv * height;
              uv[corner * 2 + 1] = v0 + du1 * cu * width + dv1 * cv * height;
            }
            // 这些字段全在低 29 位，用无符号位运算解码；高位贴图号仍用除法，不能截成 32 位。
            const lowBits = key >>> 0;
            const skirtBit = (lowBits >>> 1) & 1;
            const mi = (lowBits >>> 2) & 7;
            const tk = (lowBits >>> 5) & 4095;
            const t1k = (lowBits >>> 17) & 4095;
            const t0 = Math.floor(key / (32 * 4096 * 4096));
            const tc = tk < 4095 ? tints[tk] : null;
            bufs[mi][skirtBit ? skirtGroupStart + dir : dir].push(corners, uv, t0, t1k === 4095 ? 65535 : t1k, tc ? tc[0] : 255, tc ? tc[1] : 255, tc ? tc[2] : 255, otherFaceTex(vf >> 6, dir));
            uu += width - 1;
          }
        }
      }
    }
  const groups = bufs.map(packFaceGroup);
  return { 实心: groups[0], 镂空: groups[1], 实心树叶: groups[2], 水: groups[3], 花草: groups[4], 面数: groups.reduce((s, x) => s + x.n, 0) };
};

// 一组面里，从镜头看得到正面的那几组朝向：盒子 [x0, y0, z0, x1, y1, z1] 是这块网格的范围（场景坐标）。
// 裙边[d]：朝 d（+x -x +y -y）那一侧要不要画裙边（同一级的邻居不在画才要，见文件头）；不给就都画
export const visibleDirs = (box: number[], camPos: number[], skirtVisible?: boolean[]) => {
  const visible = [camPos[0] > box[0], camPos[0] < box[3], camPos[1] > box[1], camPos[1] < box[4], camPos[2] > box[2], camPos[2] < box[5], true];
  for (let dir = 0; dir < 4; dir++) visible.push(visible[dir] && (!skirtVisible || skirtVisible[dir]));
  return visible;
};
