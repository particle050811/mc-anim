// 边城的城墙、塔楼、城门（一格一格搭进体素网格）。
import type { Shape } from '../方块.ts';
import { VoxelGrid } from '../体素.ts';
import { BORDER_TOWN, W2, D2, T2, wallHeight, innerBounds, mod, blockOf, fallPool, type Facing } from './共用.ts';

// ---------- 城墙、塔楼、城门 ----------
// 样式照殖民地「要塞」（fortress）自己搭（它的 walls 蓝图只有十来米高，放不进 28 米的墙）：圆石勒脚 + 两道磨制安山岩腰线（z 14、26）+ 墙垛下托座；
// 城外每 40 格一道大扶壁、城里每 20 格一道小扶壁；外墙每 8 格一道箭孔；四角塔楼加深板岩四坡尖顶，墙中塔楼平顶；城门尖拱 + 半截铁闸门 + 蓝底黄边长旗（和卫兵披风同色）。
// 6-3-4 那段（北墙 x 16～64）城外不加任何挑出来的东西：卫兵在垛口往下看，镜头贴墙外飞（见 镜头/6-3-下坠/编排.ts 的 `HOVER0`，y 207.8）。
// 墙垛：外沿那一排，按世界坐标每 4 格两格墙垛（坐标除以 4 余 1、2 的格子），两层石砖 + 一层下半砖压顶（顶面 30.5）
const isMerlon = (c: number) => mod(c, 4) === 1 || mod(c, 4) === 2;
// 塔楼顶上一圈的墙垛：两头的角上两格，中间一格墙垛一格缺口，左右对称
const isTowerMerlon = (edgeIdx: number, edgeLen: number) => {
  const k = Math.min(edgeIdx, edgeLen - 1 - edgeIdx);
  return k < 2 || k % 2 === 1;
};
const inGuardSection = (x: number) => x >= 16 && x < 64;

export const buildWalls = (grid: VoxelGrid) => {
  const wall = blockOf('石砖');
  const base = blockOf('圆石');
  const walk = blockOf('石砖', '下半');
  const cap = blockOf('石砖', '下半');
  const band = blockOf('磨制安山岩');
  const outerX = W2 + T2; // 243
  const outerY = D2 + T2; // 203
  // 四面墙（实心），墙脚两层圆石，两道腰线
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    grid.fill(x0, y0, 0, x1, y1, wallHeight, wall);
    grid.fill(x0, y0, 0, x1, y1, 2, base);
    grid.fill(x0, y0, 14, x1, y1, 15, band);
    grid.fill(x0, y0, 26, x1, y1, 27, band);
    grid.fill(x0, y0, wallHeight, x1, y1, wallHeight + 1, walk);
  };
  seg(-outerX, -outerY, outerX, -outerY + 6); // 南
  seg(-outerX, outerY - 6, outerX, outerY); // 北
  seg(-outerX, -outerY, -outerX + 6, outerY); // 西
  seg(outerX - 6, -outerY, outerX, outerY); // 东
  // 勒脚：城外一圈往外放一格的圆石（z 0～2），顶上一排石砖楼梯朝外收坡（城门洞前留空）
  for (let x = -outerX - 1; x <= outerX; x++) {
    if (Math.abs(x + 0.5) > 12) {
      grid.fill(x, outerY, 0, x + 1, outerY + 1, 2, base);
      grid.set(x, outerY, 2, blockOf('石砖', '梯南'));
    }
    grid.fill(x, -outerY - 1, 0, x + 1, -outerY, 2, base);
    grid.set(x, -outerY - 1, 2, blockOf('石砖', '梯北'));
  }
  for (let y = -outerY; y < outerY; y++) {
    grid.fill(outerX, y, 0, outerX + 1, y + 1, 2, base);
    grid.set(outerX, y, 2, blockOf('石砖', '梯西'));
    grid.fill(-outerX - 1, y, 0, -outerX, y + 1, 2, base);
    grid.set(-outerX - 1, y, 2, blockOf('石砖', '梯东'));
  }
  // 墙垛：南北墙外沿 y = ±202 那一排（北墙是 y 202～203），东西墙外沿 x = ±242 那一列
  for (let x = -outerX; x < outerX; x++) {
    if (!isMerlon(x)) continue;
    for (const y of [-outerY, outerY - 1]) {
      grid.fill(x, y, wallHeight, x + 1, y + 1, wallHeight + 2, wall);
      grid.set(x, y, wallHeight + 2, cap);
    }
  }
  for (let y = -outerY; y < outerY; y++) {
    if (!isMerlon(y)) continue;
    for (const x of [-outerX, outerX - 1]) {
      grid.fill(x, y, wallHeight, x + 1, y + 1, wallHeight + 2, wall);
      grid.set(x, y, wallHeight + 2, cap);
    }
  }
  // 墙垛下面一圈托座（倒放的石砖楼梯，挑出墙面一格），远看墙顶有一道檐线
  for (let x = -outerX; x < outerX; x++) {
    grid.set(x, outerY, wallHeight - 1, blockOf('石砖', '倒梯南'));
    grid.set(x, -outerY - 1, wallHeight - 1, blockOf('石砖', '倒梯北'));
  }
  for (let y = -outerY; y < outerY; y++) {
    grid.set(outerX, y, wallHeight - 1, blockOf('石砖', '倒梯西'));
    grid.set(-outerX - 1, y, wallHeight - 1, blockOf('石砖', '倒梯东'));
  }
  // 箭孔：外墙面每 8 格一道（1 格宽 2 格高，z 18～19），避开塔楼和城门
  const towerPositions = [-240, -80, 0, 80, 240];
  const near = (c: number, list: number[], r: number) => list.some((t) => Math.abs(c - t) < r);
  for (let pos = -236; pos <= 236; pos += 8) {
    if (near(pos, towerPositions, 10)) continue;
    for (const z of [18, 19]) {
      if (Math.abs(pos) > 24) grid.set(pos, outerY - 1, z, blockOf('暗'));
      grid.set(pos, -outerY, z, blockOf('暗'));
    }
  }
  for (let pos = -196; pos <= 196; pos += 8) {
    if (near(pos, towerPositions, 10)) continue;
    for (const z of [18, 19]) {
      grid.set(outerX - 1, pos, z, blockOf('暗'));
      grid.set(-outerX, pos, z, blockOf('暗'));
    }
  }
  // 登城的石阶：靠墙内侧，2 格宽，28 级，下面砌实
  const stoneStairs = (cells: (k: number) => [number, number][], dir: Facing) => {
    for (let k = 0; k < wallHeight; k++)
      for (const [x, y] of cells(k)) {
        grid.fill(x, y, 0, x + 1, y + 1, k, wall);
        grid.set(x, y, k, blockOf('石砖', `梯${dir}` as Shape));
      }
  };
  const IN = innerBounds;
  stoneStairs((k) => [[-140 + k, IN.y - 2], [-140 + k, IN.y - 1]], '东'); // 北墙西段，往东上
  stoneStairs((k) => [[140 - k, -IN.y], [140 - k, -IN.y + 1]], '西'); // 南墙东段，往西上
  stoneStairs((k) => [[-IN.x, -60 + k], [-IN.x + 1, -60 + k]], '北'); // 西墙，往北上
  stoneStairs((k) => [[IN.x - 2, 60 - k], [IN.x - 1, 60 - k]], '南'); // 东墙，往南上
  // 北墙东门楼旁的落水池：6-3-8 卫兵从走道内沿直接跳下来落水，不走楼梯（用户 10-19 定）。只搭池沿，水面另画（边城/水池.tsx）
  {
    const { x0, x1, y0, waterTop } = fallPool;
    grid.fill(x0 - 1, y0 - 1, 0, x1 + 1, y0, waterTop, wall); // 南
    grid.fill(x0 - 1, y0, 0, x0, IN.y, waterTop, wall); // 西
    grid.fill(x1, y0, 0, x1 + 1, IN.y, waterTop, wall); // 东
  }
  // 城里的小扶壁：贴着墙面的 2 格宽、1 格厚的石砖柱，顶上一级楼梯收头，每 20 格一根（避开塔楼、城门、石阶、落水池）
  const smallButtress = (x: number, y: number, dx: number, dy: number, top: number, cap: Shape) => {
    for (let k = 0; k < 2; k++) {
      const px = x + dx * k;
      const py = y + dy * k;
      grid.fill(px, py, 0, px + 1, py + 1, top, wall);
      grid.fill(px, py, 0, px + 1, py + 1, 2, base);
      grid.set(px, py, top, blockOf('石砖', cap));
    }
  };
  for (let pos = -230; pos <= 230; pos += 20) {
    if (!near(pos, towerPositions, 9) && Math.abs(pos) > 24 && !(pos >= -142 && pos <= -110) && !(pos >= fallPool.x0 - 2 && pos <= fallPool.x1)) smallButtress(pos, IN.y - 1, 1, 0, 24, '梯北'); // 北墙里面
    if (!near(pos, towerPositions, 9) && !(pos >= 110 && pos <= 142)) smallButtress(pos, -IN.y, 1, 0, 24, '梯南'); // 南墙里面
  }
  for (let pos = -190; pos <= 190; pos += 20) {
    if (!near(pos, towerPositions, 9) && !(pos >= -62 && pos <= -30)) smallButtress(-IN.x, pos, 0, 1, 24, '梯西'); // 西墙里面
    if (!near(pos, towerPositions, 9) && !(pos >= 30 && pos <= 62)) smallButtress(IN.x - 1, pos, 0, 1, 24, '梯东'); // 东墙里面
  }
  // 城外的大扶壁：3 格宽，下段（z 0～12）挑出 2 格、上段（到 z 22）挑出 1 格，每段顶上一排朝外的楼梯收分。
  // (x, y) 是贴墙那一格的西南角，(ox, oy) 是朝外的方向，(ax, ay) 是沿墙的方向
  const bigButtress = (x: number, y: number, ox: number, oy: number, ax: number, ay: number) => {
    const face = ox > 0 ? '西' : ox < 0 ? '东' : oy > 0 ? '南' : '北'; // 楼梯高的那半贴墙
    for (let k = 0; k < 3; k++)
      for (let outStep = 0; outStep < 2; outStep++) {
        const px = x + ax * k + ox * outStep;
        const py = y + ay * k + oy * outStep;
        const top = outStep === 0 ? 22 : 12;
        grid.fill(px, py, 0, px + 1, py + 1, top, wall);
        grid.fill(px, py, 0, px + 1, py + 1, 3, base);
        grid.set(px, py, top, blockOf('石砖', `梯${face}` as Shape));
      }
  };
  for (const pos of [-200, -160, -120, -40, 40, 120, 160, 200]) {
    if (!inGuardSection(pos) && !inGuardSection(pos + 2)) bigButtress(pos - 1, outerY, 0, 1, 1, 0); // 北墙外面（x 16～64 是 6-3-4 卫兵往下看的那一段，不放）
    bigButtress(pos - 1, -outerY - 1, 0, -1, 1, 0); // 南墙外面
  }
  for (const pos of [-160, -120, -80, -40, 40, 80, 120, 160]) {
    bigButtress(-outerX - 1, pos - 1, -1, 0, 0, 1); // 西墙外面
    bigButtress(outerX, pos - 1, 1, 0, 0, 1); // 东墙外面
  }
};

// 四坡尖顶：从 (cx, cy) 为中心、半边长 R 的方框起往上收，每收一格升两层（下层整块、上层楼梯朝外，坡比 2:1，比楼梯直铺的 45° 陡，像殖民地要塞箭塔的尖顶），
// 深板岩瓦；顶上一根深色橡木的尖杆
const spireRoof = (grid: VoxelGrid, cx: number, cy: number, halfSize: number, z0: number) => {
  const roof = '深板岩瓦';
  let z = z0;
  for (let k = 0; halfSize - k >= 1; k++, z += 2) {
    const minX = cx - halfSize + k;
    const maxX = cx + halfSize - k - 1;
    const minY = cy - halfSize + k;
    const maxY = cy + halfSize - k - 1;
    // 下层：一圈整块，里面实心（看不见，只为了从下往上看不漏光）
    grid.fill(minX, minY, z, maxX + 1, maxY + 1, z + 1, blockOf(roof));
    if (maxX - minX >= 2) grid.fill(minX + 1, minY + 1, z, maxX, maxY, z + 1, blockOf('深色橡木木板'));
    // 上层：一圈朝外的楼梯
    for (let x = minX; x <= maxX; x++) {
      grid.set(x, minY, z + 1, blockOf(roof, '梯北'));
      grid.set(x, maxY, z + 1, blockOf(roof, '梯南'));
    }
    for (let y = minY + 1; y < maxY; y++) {
      grid.set(minX, y, z + 1, blockOf(roof, '梯东'));
      grid.set(maxX, y, z + 1, blockOf(roof, '梯西'));
    }
    if (maxX - minX >= 2) grid.fill(minX + 1, minY + 1, z + 1, maxX, maxY, z + 2, blockOf('深色橡木木板'));
  }
  grid.fill(cx - 1, cy - 1, z, cx, cy, z + 5, blockOf('深色橡木原木'));
};

// 方形塔楼：14 米见方、高 36；顶上挑出一圈托座，平台 16 米见方，一圈墙垛；四面开箭孔，两道腰线。
// 尖顶的（四角）：平台上缩进两格砌一段塔身（四面开窗），再起四坡尖顶
export const buildTower = (grid: VoxelGrid, cx: number, cy: number, hasSpire: boolean) => {
  const top = BORDER_TOWN.tower; // 36
  const wall = blockOf('石砖');
  grid.fill(cx - 7, cy - 7, 0, cx + 7, cy + 7, top, wall);
  grid.fill(cx - 8, cy - 8, 0, cx + 8, cy + 8, 3, blockOf('圆石')); // 勒脚：比塔身大一圈
  for (let edge = -8; edge < 8; edge++) {
    grid.set(cx + edge, cy - 8, 3, blockOf('石砖', '梯北'));
    grid.set(cx + edge, cy + 7, 3, blockOf('石砖', '梯南'));
    grid.set(cx - 8, cy + edge, 3, blockOf('石砖', '梯东'));
    grid.set(cx + 7, cy + edge, 3, blockOf('石砖', '梯西'));
  }
  for (const z of [14, 26]) grid.fill(cx - 7, cy - 7, z, cx + 7, cy + 7, z + 1, blockOf('磨制安山岩'));
  // 托座：塔身外面一圈倒楼梯（四个角是上半砖）
  for (let edge = -7; edge < 7; edge++) {
    grid.set(cx + edge, cy - 8, top - 1, blockOf('石砖', '倒梯北'));
    grid.set(cx + edge, cy + 7, top - 1, blockOf('石砖', '倒梯南'));
    grid.set(cx - 8, cy + edge, top - 1, blockOf('石砖', '倒梯东'));
    grid.set(cx + 7, cy + edge, top - 1, blockOf('石砖', '倒梯西'));
  }
  for (const [x, y] of [[cx - 8, cy - 8], [cx + 7, cy - 8], [cx - 8, cy + 7], [cx + 7, cy + 7]]) grid.set(x, y, top - 1, blockOf('石砖', '上半'));
  // 平台
  grid.fill(cx - 8, cy - 8, top, cx + 8, cy + 8, top + 1, wall);
  // 墙垛
  for (let edge = 0; edge < 16; edge++) {
    if (!isTowerMerlon(edge, 16)) continue;
    for (const [x, y] of [[cx - 8 + edge, cy - 8], [cx - 8 + edge, cy + 7], [cx - 8, cy - 8 + edge], [cx + 7, cy - 8 + edge]]) {
      grid.fill(x, y, top + 1, x + 1, y + 1, top + 3, wall);
      grid.set(x, y, top + 3, blockOf('石砖', '下半'));
    }
  }
  // 箭孔：每面正中一道，1 格宽 2 格高，三层
  for (const z of [9, 18, 29])
    for (let dz = 0; dz < 2; dz++) {
      grid.set(cx, cy - 7, z + dz, blockOf('暗'));
      grid.set(cx - 1, cy + 6, z + dz, blockOf('暗'));
      grid.set(cx - 7, cy - 1, z + dz, blockOf('暗'));
      grid.set(cx + 6, cy, z + dz, blockOf('暗'));
    }
  if (hasSpire) {
    // 塔身：平台上缩进两格（12 米见方）再砌 7 米，四面各开两扇窗，顶上一道腰线；尖顶挑出塔身一格，高 14 米，尖杆顶在 z 约 63
    const z0 = top + 1;
    grid.fill(cx - 6, cy - 6, z0, cx + 6, cy + 6, z0 + 7, wall);
    grid.fill(cx - 6, cy - 6, z0 + 6, cx + 6, cy + 6, z0 + 7, blockOf('磨制安山岩'));
    for (const z of [z0 + 2, z0 + 3])
      for (const offset of [-3, 2]) {
        grid.set(cx + offset, cy - 6, z, blockOf('窗'));
        grid.set(cx + offset, cy + 5, z, blockOf('窗'));
        grid.set(cx - 6, cy + offset, z, blockOf('窗'));
        grid.set(cx + 5, cy + offset, z, blockOf('窗'));
      }
    spireRoof(grid, cx, cy, 7, z0 + 7);
  }
};

export const buildGate = (grid: VoxelGrid) => {
  const wall = blockOf('石砖');
  const Yo = D2 + T2; // 203
  // 两座门楼：x ±12～±20、y 195～205，高 30，顶上一圈墙垛（顶面 32.5）
  for (const [x0, x1] of [[-20, -12], [12, 20]]) {
    grid.fill(x0, 195, 0, x1, 205, 30, wall);
    grid.fill(x0, 195, 0, x1, 205, 2, blockOf('圆石'));
    grid.fill(x0, 195, 14, x1, 205, 15, blockOf('磨制安山岩'));
    grid.fill(x0, 195, 26, x1, 205, 27, blockOf('磨制安山岩'));
    // 勒脚
    for (let x = x0 - 1; x <= x1; x++) {
      grid.fill(x, 205, 0, x + 1, 206, 2, blockOf('圆石'));
      grid.set(x, 205, 2, blockOf('石砖', '梯南'));
    }
    const ring: [number, number, number, number][] = [];
    for (let edge = 0; edge < 8; edge++) ring.push([x0 + edge, 195, edge, 8], [x0 + edge, 204, edge, 8]);
    for (let edge = 0; edge < 10; edge++) ring.push([x0, 195 + edge, edge, 10], [x1 - 1, 195 + edge, edge, 10]);
    for (const [x, y, edge, edgeLen] of ring) {
      if (!isTowerMerlon(edge, edgeLen)) continue;
      grid.fill(x, y, 30, x + 1, y + 1, 32, wall);
      grid.set(x, y, 32, blockOf('石砖', '下半'));
    }
    // 朝外的箭孔
    const cx = x0 < 0 ? -17 : 16;
    for (const z of [10, 20]) for (let dz = 0; dz < 2; dz++) grid.set(cx, 204, z + dz, blockOf('暗'));
    // 长旗：门楼外墙上挂一面（2 格宽、10 格长，蓝底，两边一道黄边，下面收成燕尾），挂在 z 16～25
    const bx = x0 < 0 ? -15 : 13;
    for (let z = 15; z <= 25; z++)
      for (let k = 0; k < 2; k++) {
        if (z === 15 && k === 0) continue; // 燕尾
        grid.set(bx + k, 205, z, blockOf(z === 25 || z === 16 ? '黄色羊毛' : '蓝色羊毛'));
      }
  }
  // 门洞：24 宽、20 高，上沿砌成尖拱（两边往中间一级级收）
  grid.fill(-12, Yo - 8, 0, 12, Yo, 20, 0);
  for (const [z, stepCount] of [[19, 6], [18, 4], [17, 3], [16, 2], [15, 1]])
    for (let k = 0; k < stepCount; k++) {
      grid.fill(-12 + k, Yo - 8, z, -11 + k, Yo, z + 1, wall);
      grid.fill(11 - k, Yo - 8, z, 12 - k, Yo, z + 1, wall);
    }
  // 拱券：门洞外沿一圈錾制石砖
  for (let x = -12; x < 12; x++) grid.set(x, Yo - 1, 20, blockOf('錾制石砖'));
  // 铁闸门：吊起一半，挂在门洞外沿往里一格的地方（z 14～19，下沿一排是尖齿）
  for (let x = -11; x < 11; x++)
    for (let z = 14; z < 20; z++) if (!grid.get(x, Yo - 2, z) && !(z === 14 && mod(x, 2))) grid.set(x, Yo - 2, z, blockOf('铁闸'));
  // 翻牌显示器：门楼上方朝北挂一块黑色混凝土的大板子（40×11），磨制黑石包边；贴在城墙外面那一层（y 203～204），两头搭在门楼顶上
  grid.fill(-21, Yo, 30, 21, Yo + 1, 44, blockOf('磨制黑石'));
  grid.fill(-20, Yo, 31, 20, Yo + 1, 43, blockOf('黑色混凝土'));
};
