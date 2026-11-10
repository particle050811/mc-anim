// 神灵金胸甲背后的披风：启示录（RevelationFix 4.9）的 ArmorCapeState（布料模拟）和 ApocalyptiumCapeRenderer（出面）照反编译移植，纯计算、不碰 three。
// 5 列 × 15 行的节点，坐标在 body 部件里（模型像素，y 朝下，z 朝后），第 0 行钉在肩上。
// 每刻（ArmorCapeState.update，armorCollision 为空的那条路，胸甲走的就是它）：第 1 行起每个节点
//   位置 += (位置 − 上一刻) × 0.88 + 力 × (行 / 14) + (静止 − 位置) × 0.012，力 = (加速度 x, 加速度 y + 0.12, 加速度 z)；
//   再 10 轮：所有边拉回原长（一端钉住就全由另一端让），然后每个节点 |x| < 6.5、0 < y < 28 时 z 不小于 3.4，再被胸甲的碰撞三角形往后顶出 0.15。
// 游戏里用 float，这里是 double，末几位有差。只做了站着不动（加速度全 0）跑到稳的样子；跟着走、转身的摆动还没接。
export type 披风数据 = { 列: number; 行: number; 接缝行: number; 静止: number[]; 正面UV: number[][]; 背面UV: number[][]; 碰撞: number[] };

const 顶胸甲 = (点: number[], i: number, 三角: readonly number[]) => {
  const x = 点[i]!;
  const y = 点[i + 1]!;
  let 后 = 点[i + 2]!;
  for (let t = 0; t < 三角.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = 三角.slice(t, t + 9) as [number, number, number, number, number, number, number, number, number];
    if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || y < Math.min(ay, by, cy) || y > Math.max(ay, by, cy)) continue;
    const 行列式 = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / 行列式;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / 行列式;
    const w = 1 - u - v;
    if (!(u >= -1e-5) || !(v >= -1e-5) || !(w >= -1e-5)) continue;
    后 = Math.max(后, u * az + v * bz + w * cz + 0.15);
  }
  点[i + 2] = 后;
};

/** 布料状态：静止 是构造时过了一遍胸甲碰撞的静止网格；刻() 走一刻，加速度不给就是站着不动 */
export const 建披风 = (d: 披风数据) => {
  const 列 = d.列;
  const 钉 = 列 * 3; // 第 0 行的分量数，下标小于它的节点不动
  const 总 = d.列 * d.行 * 3;
  if (d.静止.length !== 总) throw new Error('披风：静止网格的长度不对');
  const 静止 = [...d.静止];
  for (let i = 0; i < 总; i += 3) 顶胸甲(静止, i, d.碰撞);
  const 边: { a: number; b: number; 长: number }[] = [];
  const 加边 = (a: number, b: number) => 边.push({ a, b, 长: Math.hypot(静止[a]! - 静止[b]!, 静止[a + 1]! - 静止[b + 1]!, 静止[a + 2]! - 静止[b + 2]!) });
  for (let 行 = 0; 行 < d.行; 行++)
    for (let c = 0; c < 列; c++) {
      const i = (行 * 列 + c) * 3;
      if (c > 0) 加边(i, i - 3);
      if (行 > 0) 加边(i, i - 钉);
      if (行 > 0 && c > 0) 加边(i, i - 钉 - 3);
      if (行 > 0 && c < 列 - 1) 加边(i, i - 钉 + 3);
      if (行 > 1) 加边(i, i - 钉 * 2);
      if (c > 1) 加边(i, i - 6);
    }
  let 位置 = [...静止];
  let 上刻 = [...静止];
  const 刻 = (加速度: readonly [number, number, number] = [0, 0, 0], 阻尼 = 0.88) => {
    for (let i = 钉; i < 总; i += 3) {
      const 权 = Math.floor(i / 钉) / (d.行 - 1);
      for (let 轴 = 0; 轴 < 3; 轴++) {
        const 现 = 位置[i + 轴]!;
        const 惯性 = (现 - 上刻[i + 轴]!) * 阻尼;
        上刻[i + 轴] = 现;
        const 力 = 加速度[轴]! + (轴 === 1 ? 0.12 : 0);
        位置[i + 轴] = 现 + 惯性 + 力 * 权 + (静止[i + 轴]! - 现) * 0.012;
      }
    }
    for (let 轮 = 0; 轮 < 10; 轮++) {
      for (const { a, b, 长 } of 边) {
        const dx = 位置[b]! - 位置[a]!;
        const dy = 位置[b + 1]! - 位置[a + 1]!;
        const dz = 位置[b + 2]! - 位置[a + 2]!;
        const 距 = Math.hypot(dx, dy, dz);
        const 钉a = a < 钉;
        const 钉b = b < 钉;
        if (距 < 1e-5 || (钉a && 钉b)) continue;
        const k = (距 - 长) / 距 / (钉a || 钉b ? 1 : 2);
        if (!钉a) {
          位置[a] = 位置[a]! + dx * k;
          位置[a + 1] = 位置[a + 1]! + dy * k;
          位置[a + 2] = 位置[a + 2]! + dz * k;
        }
        if (!钉b) {
          位置[b] = 位置[b]! - dx * k;
          位置[b + 1] = 位置[b + 1]! - dy * k;
          位置[b + 2] = 位置[b + 2]! - dz * k;
        }
      }
      for (let i = 钉; i < 总; i += 3) {
        if (d.碰撞.length > 0 && Math.abs(位置[i]!) < 6.5 && 位置[i + 1]! > 0 && 位置[i + 1]! < 28) 位置[i + 2] = Math.max(3.4, 位置[i + 2]!);
        顶胸甲(位置, i, d.碰撞);
      }
    }
  };
  /** 画的时候用的节点（ArmorCapeState.sample 在整刻上的值：当前位置再过一遍胸甲碰撞，连第 0 行） */
  const 取 = () => {
    const 出 = [...位置];
    for (let i = 0; i < 总; i += 3) 顶胸甲(出, i, d.碰撞);
    return 出;
  };
  const 重置 = () => {
    位置 = [...静止];
    上刻 = [...静止];
  };
  return { 静止, 边, 刻, 取, 重置, 位置: () => 位置 };
};

/** 站着不动的披风：从静止网格起跑 刻数 刻（默认 400 刻 = 20 秒，量过 200 刻后每刻挪动不到 0.001 像素） */
export const 披风站定 = (d: 披风数据, 刻数 = 400): number[] => {
  const 布 = 建披风(d);
  for (let i = 0; i < 刻数; i++) 布.刻();
  return 布.取();
};

/**
 * 节点 → 顶点表（库/角色/网格盔甲.tsx 的格式：每顶点 x y z u v 法线，四个一面），照 ApocalyptiumCapeRenderer.render：
 * 每格出背面（朝后，背面UV）和正面（朝身子，正面UV）两个面，各沿节点法线挪 0.02 像素；接缝行以上用第 0 幅 uv、以下用第 1 幅，四角双线性插值
 */
export const 披风顶点表 = (d: 披风数据, 节点: readonly number[]): number[] => {
  const { 列, 行 } = d;
  const 法线 = new Array<number>(节点.length).fill(0);
  const 累 = (a: number, b: number, c: number) => {
    const [A, B, C] = [a * 3, b * 3, c * 3];
    const ux = 节点[B]! - 节点[A]!;
    const uy = 节点[B + 1]! - 节点[A + 1]!;
    const uz = 节点[B + 2]! - 节点[A + 2]!;
    const vx = 节点[C]! - 节点[A]!;
    const vy = 节点[C + 1]! - 节点[A + 1]!;
    const vz = 节点[C + 2]! - 节点[A + 2]!;
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const p of [A, B, C]) for (let k = 0; k < 3; k++) 法线[p + k] = 法线[p + k]! + n[k]!;
  };
  const 每格 = (f: (a: number, b: number, c: number, e: number, 行号: number) => void) => {
    for (let r = 0; r < 行 - 1; r++)
      for (let c = 0; c < 列 - 1; c++) {
        const a = r * 列 + c;
        f(a, a + 1, a + 1 + 列, a + 列, r);
      }
  };
  每格((a, b, c, e) => {
    累(a, b, c);
    累(a, c, e);
  });
  for (let p = 0; p < 法线.length; p += 3) {
    const 长 = Math.hypot(法线[p]!, 法线[p + 1]!, 法线[p + 2]!);
    if (长 > 1e-5) for (let k = 0; k < 3; k++) 法线[p + k] = 法线[p + k]! / 长;
    else [法线[p], 法线[p + 1], 法线[p + 2]] = [0, 0, 1];
  }
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  const 出: number[] = [];
  const 顶点 = (节: number, uv: readonly number[], 幅: number, 侧: number) => {
    const s = (节 % 列) / (列 - 1);
    const 起 = 幅 === 0 ? 0 : d.接缝行;
    const 止 = 幅 === 0 ? d.接缝行 : 行 - 1;
    const t = (Math.floor(节 / 列) - 起) / (止 - 起);
    const u = lerp(t, lerp(s, uv[0]!, uv[2]!), lerp(s, uv[4]!, uv[6]!));
    const v = lerp(t, lerp(s, uv[1]!, uv[3]!), lerp(s, uv[5]!, uv[7]!));
    const p = 节 * 3;
    const n = [法线[p]! * 侧, 法线[p + 1]! * 侧, 法线[p + 2]! * 侧];
    出.push(节点[p]! + n[0]! * 0.02, 节点[p + 1]! + n[1]! * 0.02, 节点[p + 2]! + n[2]! * 0.02, u, v, n[0]!, n[1]!, n[2]!);
  };
  每格((a, b, c, e, r) => {
    const 幅 = r < d.接缝行 ? 0 : 1;
    for (const 节 of [a, b, c, e]) 顶点(节, d.背面UV[幅]!, 幅, 1);
    for (const 节 of [e, c, b, a]) 顶点(节, d.正面UV[幅]!, 幅, -1);
  });
  return 出;
};
