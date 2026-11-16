// 神灵金胸甲背后的披风：启示录（RevelationFix 4.9）的 ArmorCapeState（布料模拟）和 ApocalyptiumCapeRenderer（出面）照反编译移植，纯计算、不碰 three。
// 5 列 × 15 行的节点，坐标在 body 部件里（模型像素，y 朝下，z 朝后），第 0 行钉在肩上。
// 每刻（ArmorCapeState.update，armorCollision 为空的那条路，胸甲走的就是它）：第 1 行起每个节点
//   位置 += (位置 − 上一刻) × 0.88 + 力 × (行 / 14) + (静止 − 位置) × 0.012，力 = (加速度 x, 加速度 y + 0.12, 加速度 z)；
//   再 10 轮：所有边拉回原长（一端钉住就全由另一端让），然后每个节点 |x| < 6.5、0 < y < 28 时 z 不小于 3.4，再被胸甲的碰撞三角形往后顶出 0.15。
// 游戏里用 float，这里是 double，末几位有差。只做了站着不动（加速度全 0）跑到稳的样子；跟着走、转身的摆动还没接。
export type CapeData = { 列: number; 行: number; 接缝行: number; 静止: number[]; 正面UV: number[][]; 背面UV: number[][]; 碰撞: number[] };

const pushOutChestplate = (verts: number[], i: number, triangles: readonly number[]) => {
  const x = verts[i]!;
  const y = verts[i + 1]!;
  let backZ = verts[i + 2]!;
  for (let t = 0; t < triangles.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.slice(t, t + 9) as [number, number, number, number, number, number, number, number, number];
    if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || y < Math.min(ay, by, cy) || y > Math.max(ay, by, cy)) continue;
    const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / determinant;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / determinant;
    const w = 1 - u - v;
    if (!(u >= -1e-5) || !(v >= -1e-5) || !(w >= -1e-5)) continue;
    backZ = Math.max(backZ, u * az + v * bz + w * cz + 0.15);
  }
  verts[i + 2] = backZ;
};

/** 布料状态：静止 是构造时过了一遍胸甲碰撞的静止网格；刻() 走一刻，加速度不给就是站着不动 */
export const buildCape = (d: CapeData) => {
  const cols = d.列;
  const pinnedCount = cols * 3; // 第 0 行的分量数，下标小于它的节点不动
  const flatLength = d.列 * d.行 * 3;
  if (d.静止.length !== flatLength) throw new Error('披风：静止网格的长度不对');
  const restPositions = [...d.静止];
  for (let i = 0; i < flatLength; i += 3) pushOutChestplate(restPositions, i, d.碰撞);
  const edges: { a: number; b: number; length: number }[] = [];
  const addEdge = (a: number, b: number) => edges.push({ a, b, length: Math.hypot(restPositions[a]! - restPositions[b]!, restPositions[a + 1]! - restPositions[b + 1]!, restPositions[a + 2]! - restPositions[b + 2]!) });
  for (let row = 0; row < d.行; row++)
    for (let c = 0; c < cols; c++) {
      const i = (row * cols + c) * 3;
      if (c > 0) addEdge(i, i - 3);
      if (row > 0) addEdge(i, i - pinnedCount);
      if (row > 0 && c > 0) addEdge(i, i - pinnedCount - 3);
      if (row > 0 && c < cols - 1) addEdge(i, i - pinnedCount + 3);
      if (row > 1) addEdge(i, i - pinnedCount * 2);
      if (c > 1) addEdge(i, i - 6);
    }
  let positions = [...restPositions];
  let prevTick = [...restPositions];
  const tick = (acceleration: readonly [number, number, number] = [0, 0, 0], damping = 0.88) => {
    for (let i = pinnedCount; i < flatLength; i += 3) {
      const heightWeight = Math.floor(i / pinnedCount) / (d.行 - 1);
      for (let axis = 0; axis < 3; axis++) {
        const current = positions[i + axis]!;
        const inertia = (current - prevTick[i + axis]!) * damping;
        prevTick[i + axis] = current;
        const force = acceleration[axis]! + (axis === 1 ? 0.12 : 0);
        positions[i + axis] = current + inertia + force * heightWeight + (restPositions[i + axis]! - current) * 0.012;
      }
    }
    for (let ring = 0; ring < 10; ring++) {
      for (const { a, b, length: restLength } of edges) {
        const dx = positions[b]! - positions[a]!;
        const dy = positions[b + 1]! - positions[a + 1]!;
        const dz = positions[b + 2]! - positions[a + 2]!;
        const distance = Math.hypot(dx, dy, dz);
        const pinnedA = a < pinnedCount;
        const pinnedB = b < pinnedCount;
        if (distance < 1e-5 || (pinnedA && pinnedB)) continue;
        const k = (distance - restLength) / distance / (pinnedA || pinnedB ? 1 : 2);
        if (!pinnedA) {
          positions[a] = positions[a]! + dx * k;
          positions[a + 1] = positions[a + 1]! + dy * k;
          positions[a + 2] = positions[a + 2]! + dz * k;
        }
        if (!pinnedB) {
          positions[b] = positions[b]! - dx * k;
          positions[b + 1] = positions[b + 1]! - dy * k;
          positions[b + 2] = positions[b + 2]! - dz * k;
        }
      }
      for (let i = pinnedCount; i < flatLength; i += 3) {
        if (d.碰撞.length > 0 && Math.abs(positions[i]!) < 6.5 && positions[i + 1]! > 0 && positions[i + 1]! < 28) positions[i + 2] = Math.max(3.4, positions[i + 2]!);
        pushOutChestplate(positions, i, d.碰撞);
      }
    }
  };
  /** 画的时候用的节点（ArmorCapeState.sample 在整刻上的值：当前位置再过一遍胸甲碰撞，连第 0 行） */
  const sample = () => {
    const adjusted = [...positions];
    for (let i = 0; i < flatLength; i += 3) pushOutChestplate(adjusted, i, d.碰撞);
    return adjusted;
  };
  const reset = () => {
    positions = [...restPositions];
    prevTick = [...restPositions];
  };
  return { 静止: restPositions, edges, 刻: tick, 取: sample, reset, 位置: () => positions };
};

/** 站着不动的披风：从静止网格起跑 刻数 刻（默认 400 刻 = 20 秒，量过 200 刻后每刻挪动不到 0.001 像素） */
export const settleCape = (d: CapeData, tickCount = 400): number[] => {
  const cloth = buildCape(d);
  for (let i = 0; i < tickCount; i++) cloth.刻();
  return cloth.取();
};

/**
 * 节点 → 顶点表（库/角色/网格盔甲.tsx 的格式：每顶点 x y z u v 法线，四个一面），照 ApocalyptiumCapeRenderer.render：
 * 每格出背面（朝后，背面UV）和正面（朝身子，正面UV）两个面，各沿节点法线挪 0.02 像素；接缝行以上用第 0 幅 uv、以下用第 1 幅，四角双线性插值
 */
export const capeVertexTable = (d: CapeData, nodes: readonly number[]): number[] => {
  const { 列: cols, 行: rows } = d;
  const normals = new Array<number>(nodes.length).fill(0);
  const addTri = (a: number, b: number, c: number) => {
    const [A, B, C] = [a * 3, b * 3, c * 3];
    const ux = nodes[B]! - nodes[A]!;
    const uy = nodes[B + 1]! - nodes[A + 1]!;
    const uz = nodes[B + 2]! - nodes[A + 2]!;
    const vx = nodes[C]! - nodes[A]!;
    const vy = nodes[C + 1]! - nodes[A + 1]!;
    const vz = nodes[C + 2]! - nodes[A + 2]!;
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const p of [A, B, C]) for (let k = 0; k < 3; k++) normals[p + k] = normals[p + k]! + n[k]!;
  };
  const forEachCell = (f: (a: number, b: number, c: number, e: number, lineNo: number) => void) => {
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c;
        f(a, a + 1, a + 1 + cols, a + cols, r);
      }
  };
  forEachCell((a, b, c, e) => {
    addTri(a, b, c);
    addTri(a, c, e);
  });
  for (let p = 0; p < normals.length; p += 3) {
    const vecLength = Math.hypot(normals[p]!, normals[p + 1]!, normals[p + 2]!);
    if (vecLength > 1e-5) for (let k = 0; k < 3; k++) normals[p + k] = normals[p + k]! / vecLength;
    else [normals[p], normals[p + 1], normals[p + 2]] = [0, 0, 1];
  }
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  const verts: number[] = [];
  const emitVertex = (index: number, uv: readonly number[], uvIndex: number, sign: number) => {
    const s = (index % cols) / (cols - 1);
    const startRow = uvIndex === 0 ? 0 : d.接缝行;
    const endRow = uvIndex === 0 ? d.接缝行 : rows - 1;
    const t = (Math.floor(index / cols) - startRow) / (endRow - startRow);
    const u = lerp(t, lerp(s, uv[0]!, uv[2]!), lerp(s, uv[4]!, uv[6]!));
    const v = lerp(t, lerp(s, uv[1]!, uv[3]!), lerp(s, uv[5]!, uv[7]!));
    const p = index * 3;
    const n = [normals[p]! * sign, normals[p + 1]! * sign, normals[p + 2]! * sign];
    verts.push(nodes[p]! + n[0]! * 0.02, nodes[p + 1]! + n[1]! * 0.02, nodes[p + 2]! + n[2]! * 0.02, u, v, n[0]!, n[1]!, n[2]!);
  };
  forEachCell((a, b, c, e, r) => {
    const uvIndex = r < d.接缝行 ? 0 : 1;
    for (const index of [a, b, c, e]) emitVertex(index, d.背面UV[uvIndex]!, uvIndex, 1);
    for (const index of [e, c, b, a]) emitVertex(index, d.正面UV[uvIndex]!, uvIndex, -1);
  });
  return verts;
};
