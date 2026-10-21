// 城里：街区沿街摆殖民地蓝图房子、院子和树、公园、广场、街上的路灯喷泉岗亭。
import type { BlockName } from '../方块.ts';
import { VoxelGrid } from '../体素.ts';
import { footprint, HouseGrid, placeBlueprint, blueprintTable, turnsToFace, type BlueprintName } from '../蓝图.ts';
import { mainStreetX, mainStreetY, streetsX, streetsY, plazaHalf, ri, pick, blockOf, type Rng } from './共用.ts';

// ---------- 房子：殖民地的建筑蓝图（蓝图.ts） ----------
// 用户 10-05 定：房子参考殖民地 mod 建好看些。整栋用殖民地自带蓝图（工具/游戏取材/殖民地蓝图.py 导出），沿街排、正门朝街，镜像一半，同种换朝向用。
// 分区：广场四周公共建筑和商铺；靠城墙一圈兵营、箭塔、仓库等夹民居；其余民居掺作坊商铺。
// 竖井口路口（见文件头）四角的街区只放 15 米以下的房子：6-3-5、6-3-6 镜头从高处斜看路口，高楼会挡。
export const dwellings: BlueprintName[] = ['橡木民居3', '橡木民居5', '橡木别居4', '云杉民居3', '云杉民居5', '云杉别居4', '深橡民居4', '深橡别居5', '运河楼橡木', '运河楼橡木4'];
export const workshops: BlueprintName[] = ['铁匠铺云杉', '铁匠铺深橡', '染坊云杉', '石匠铺深橡', '建筑工坊云杉', '送货站橡木', '面包房橡木', '厨房橡木'];
export const publicBuildings: BlueprintName[] = ['市政厅橡木', '医院云杉', '学校深橡', '酒馆云杉', '面包房橡木', '厨房橡木', '花店橡木', '运河楼橡木', '橡木民居5', '云杉民居5'];
export const defenses: BlueprintName[] = ['兵营要塞', '兵营云杉', '箭塔要塞', '箭塔要塞别式', '箭塔深橡', '仓库橡木', '仓库深橡', '小马厩', '铁匠铺深橡'];
const yardProps: BlueprintName[] = ['水井', '小水井', '木料车', '带篷马车'];
export const crossingBlockMaxHeight = 15;

type BlueprintPool = { main: BlueprintName[]; secondary: BlueprintName[]; mainRatio: number; maxHeight?: number };

// 一个街区 [x0, x1)×[y0, y1)：四边沿街摆房子（南、北两排先摆，东、西两排填中间），房子之间隔 1～3 格的小巷；中间剩下的是院子（草地、树、水井、木料车）
export const cityBlock = (grid: VoxelGrid, houseGrid: HouseGrid, x0: number, y0: number, x1: number, y1: number, rand: Rng, pool: BlueprintPool) => {
  const width = x1 - x0;
  const blockDepth = y1 - y0;
  const occ = new Uint8Array(width * blockDepth);
  const free = (ax: number, ay: number, sizeX: number, sizeY: number) => {
    if (ax < x0 || ay < y0 || ax + sizeX > x1 || ay + sizeY > y1) return false;
    // 和已经摆下的房子之间至少隔一格
    for (let y = Math.max(y0, ay - 1); y < Math.min(y1, ay + sizeY + 1); y++)
      for (let x = Math.max(x0, ax - 1); x < Math.min(x1, ax + sizeX + 1); x++) if (occ[(y - y0) * width + (x - x0)]) return false;
    return true;
  };
  const mark = (ax: number, ay: number, sizeX: number, sizeY: number) => {
    for (let y = ay; y < ay + sizeY; y++) for (let x = ax; x < ax + sizeX; x++) occ[(y - y0) * width + (x - x0)] = 1;
  };
  const candidates = () => {
    const list = rand() < pool.mainRatio ? [...pool.main] : [...pool.secondary];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list.filter((n) => !pool.maxHeight || blueprintTable[n].尺寸[2] <= pool.maxHeight);
  };
  // 一排：side 是这排房子面朝的街（南排面朝南）；沿街从头摆到尾
  const placeRow = (side: '南' | '北' | '西' | '东') => {
    const alongX = side === '南' || side === '北';
    const len = alongX ? width : blockDepth;
    let offset = 0;
    while (offset < len - 6) {
      let placed = false;
      for (const name of candidates()) {
        const mirrored = rand() < 0.5;
        const rot = turnsToFace(name, side, mirrored);
        const [fx, fy] = footprint(name, rot);
        const along = alongX ? fx : fy;
        const depth = alongX ? fy : fx;
        if (along > len - offset || depth > (alongX ? blockDepth : width) - 2) continue;
        const ax = alongX ? x0 + offset : side === '西' ? x0 : x1 - depth;
        const ay = alongX ? (side === '南' ? y0 : y1 - depth) : y0 + offset;
        if (!free(ax, ay, fx, fy)) continue;
        placeBlueprint(houseGrid, name, ax, ay, 0, rot, mirrored);
        mark(ax, ay, fx, fy);
        offset += along + ri(rand, 1, 3);
        placed = true;
        break;
      }
      if (!placed) offset += 2;
    }
  };
  placeRow('南');
  placeRow('北');
  placeRow('西');
  placeRow('东');
  // 院子：没盖房子的地方铺草（比街面高半格），零星几棵树；大一点的院子里放一口井或一辆车
  let fx0 = x1, fy0 = y1, fx1 = x0, fy1 = y0;
  for (let y = y0 + 1; y < y1 - 1; y++)
    for (let x = x0 + 1; x < x1 - 1; x++) {
      if (occ[(y - y0) * width + (x - x0)]) continue;
      // 离房子一格以内不铺（房子自带的台阶、栅栏会伸出来一点）
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (occ[(y + dy - y0) * width + (x + dx - x0)]) { near = true; break; }
      if (near) continue;
      grid.set(x, y, 0, blockOf('草方块'));
      fx0 = Math.min(fx0, x); fy0 = Math.min(fy0, y); fx1 = Math.max(fx1, x + 1); fy1 = Math.max(fy1, y + 1);
    }
  if (fx1 - fx0 >= 9 && fy1 - fy0 >= 9 && rand() < 0.7) {
    const name = pick(rand, yardProps);
    const [sizeX, sizeY] = footprint(name, 0);
    const ax = Math.floor((fx0 + fx1 - sizeX) / 2);
    const ay = Math.floor((fy0 + fy1 - sizeY) / 2);
    if (free(ax, ay, sizeX, sizeY)) {
      placeBlueprint(houseGrid, name, ax, ay, 0, 0, rand() < 0.5);
      mark(ax, ay, sizeX, sizeY);
      // 小品的地面层（井台、车底下的草）和刚铺的草地在 z = 0 同一格，两个网格各画一块会闪：蓝图摆了东西的格子把草拿掉（同喷泉）
      for (let y = ay; y < ay + sizeY; y++) for (let x = ax; x < ax + sizeX; x++) if (houseGrid.c[houseGrid.idx(x, y, 0)]) grid.set(x, y, 0, 0);
    }
  }
  const trees = Math.min(5, Math.floor(((fx1 - fx0) * (fy1 - fy0)) / 120 + rand()));
  for (let t = 0; t < trees; t++) {
    const x = ri(rand, fx0 + 2, fx1 - 3);
    const y = ri(rand, fy0 + 2, fy1 - 3);
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (x + dx < x0 || x + dx >= x1 || y + dy < y0 || y + dy >= y1 || occ[(y + dy - y0) * width + (x + dx - x0)]) { ok = false; break; }
    if (ok && grid.get(x, y, 0)) oakTree(grid, x, y, 1, rand);
  }
};

// ---------- 树、院子 ----------
const oakTree = (grid: VoxelGrid, x: number, y: number, z0: number, rand: Rng) => {
  const height = ri(rand, 4, 6);
  const leaf = blockOf('橡树叶');
  for (let dz = height - 3; dz <= height; dz++) {
    const rad = dz >= height - 1 ? 1 : 2;
    for (let dx = -rad; dx <= rad; dx++)
      for (let dy = -rad; dy <= rad; dy++) {
        const corner = Math.abs(dx) === rad && Math.abs(dy) === rad;
        if (corner && (dz === height || rand() < 0.5)) continue;
        grid.put(x + dx, y + dy, z0 + dz, leaf);
      }
  }
  for (let dz = 0; dz < height; dz++) grid.set(x, y, z0 + dz, blockOf('橡木原木'));
};

// 公园：整个街区是草地和树，四周一圈石砖矮墙
export const buildPark = (grid: VoxelGrid, x0: number, y0: number, x1: number, y1: number, rand: Rng) => {
  grid.fill(x0, y0, 0, x1, y1, 1, blockOf('草方块'));
  for (let x = x0; x < x1; x++) for (const y of [y0, y1 - 1]) grid.set(x, y, 1, blockOf('石砖', '下半'));
  for (let y = y0; y < y1; y++) for (const x of [x0, x1 - 1]) grid.set(x, y, 1, blockOf('石砖', '下半'));
  // 中间一条十字小路（砂砾）
  const cx = Math.floor((x0 + x1) / 2);
  const cy = Math.floor((y0 + y1) / 2);
  grid.fill(cx - 1, y0, 0, cx + 1, y1, 1, blockOf('砂砾'));
  grid.fill(x0, cy - 1, 0, x1, cy + 1, 1, blockOf('砂砾'));
  for (let t = 0; t < ((x1 - x0) * (y1 - y0)) / 70; t++) {
    const x = ri(rand, x0 + 3, x1 - 4);
    const y = ri(rand, y0 + 3, y1 - 4);
    if (Math.abs(x - cx) < 4 || Math.abs(y - cy) < 4) continue;
    if (grid.get(x, y, 1) || grid.get(x + 1, y, 2) || grid.get(x - 1, y, 2)) continue;
    oakTree(grid, x, y, 1, rand);
  }
};

// ---------- 广场 ----------
export const buildPlaza = (grid: VoxelGrid, rand: Rng) => {
  const half = plazaHalf;
  // 铺地：整块石砖（比街面高半格），一圈磨制安山岩的环带
  grid.fill(-half, -half, 0, half, half, 1, blockOf('石砖'));
  for (let x = -half; x < half; x++)
    for (let y = -half; y < half; y++) {
      const ringDist = Math.max(Math.abs(x + 0.5), Math.abs(y + 0.5));
      if ((ringDist > 13 && ringDist < 15) || (ringDist > 33 && ringDist < 35)) grid.set(x, y, 0, blockOf('磨制安山岩'));
    }
  // 传送石碑（Waystones 模组没装，用石砖柱子代替）：两级台座，2×2 的柱子（广场正中，高出地面 9 格），底和顶是錾制石砖
  grid.fill(-5, -5, 1, 5, 5, 2, blockOf('石砖', '下半'));
  grid.fill(-3, -3, 1, 3, 3, 2, blockOf('磨制安山岩'));
  grid.fill(-1, -1, 2, 1, 1, 10, blockOf('净石砖'));
  grid.fill(-1, -1, 2, 1, 1, 3, blockOf('錾制石砖'));
  grid.fill(-1, -1, 9, 1, 1, 10, blockOf('錾制石砖'));
  grid.fill(-1, -1, 10, 1, 1, 11, blockOf('石砖', '下半'));
  // 四角的树（草坛）
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * 25 - (sx < 0 ? 1 : 0);
    const cy = sy * 25 - (sy < 0 ? 1 : 0);
    grid.fill(cx - 2, cy - 2, 0, cx + 3, cy + 3, 1, blockOf('草方块'));
    for (let edge = -3; edge <= 3; edge++) {
      for (const [x, y] of [[cx + edge, cy - 3], [cx + edge, cy + 3], [cx - 3, cy + edge], [cx + 3, cy + edge]]) grid.set(x, y, 1, blockOf('石砖', '下半'));
    }
    oakTree(grid, cx, cy, 1, rand);
  }
  // 集市摊位：广场四个象限里各一排，木柱 + 羊毛顶棚（条纹），柜台是云杉台阶，摊边堆木桶、干草
  const awn: [BlockName, BlockName][] = [['红色羊毛', '白色羊毛'], ['黄色羊毛', '白色羊毛'], ['蓝色羊毛', '白色羊毛'], ['绿色羊毛', '白色羊毛'], ['橙色羊毛', '白色羊毛']];
  const stall = (x: number, y: number, along: 'X' | 'Y') => {
    const [sizeX, sizeY] = along === 'X' ? [5, 3] : [3, 5];
    for (const [px, py] of [[x, y], [x + sizeX - 1, y], [x, y + sizeY - 1], [x + sizeX - 1, y + sizeY - 1]]) grid.fill(px, py, 1, px + 1, py + 1, 4, blockOf('去皮橡木原木'));
    const [c1, c2] = pick(rand, awn);
    for (let i = 0; i < sizeX; i++)
      for (let j = 0; j < sizeY; j++) {
        const stripe = along === 'X' ? i % 2 : j % 2;
        grid.set(x + i, y + j, 4, blockOf(stripe ? c2 : c1));
      }
    if (along === 'X') for (let i = 1; i < sizeX - 1; i++) grid.set(x + i, y, 1, blockOf('云杉木板', '下半'));
    else for (let j = 1; j < sizeY - 1; j++) grid.set(x, y + j, 1, blockOf('云杉木板', '下半'));
    if (rand() < 0.7) grid.set(x + sizeX - 2, y + sizeY - 2, 1, blockOf(rand() < 0.5 ? '木桶' : '干草块'));
  };
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let k = 0; k < 3; k++) {
      const x = sx > 0 ? 17 + k * 6 : -22 - k * 6;
      const y = sy > 0 ? 30 : -33;
      stall(x, y, 'X');
      const x2 = sx > 0 ? 30 : -33;
      const y2 = sy > 0 ? 17 + k * 6 : -22 - k * 6;
      if (k < 2) stall(x2, y2, 'Y');
    }
  }
};

// ---------- 街上：路灯、公园的喷泉、城门里的岗亭（也是殖民地的蓝图） ----------
// 路灯立在两条大街（南北大街 x ±12、东西大街 y ±6）的两边，每 24 格一盏，灯臂顺着街；横街路口前后 4 格、广场里不立（路口、广场要空着，
// 竖井口那个路口也因此不会有灯）。
export const streetProps = (grid: VoxelGrid, houseGrid: HouseGrid) => {
  const nearEastWestStreet = (y: number) => [...streetsY, mainStreetY].some(([lo, hi]) => y > lo - 5 && y < hi + 4);
  const nearNorthSouthStreet = (x: number) => [...streetsX, mainStreetX].some(([lo, hi]) => x > lo - 5 && x < hi + 4);
  const inPlaza = (x: number, y: number) => Math.abs(x) < plazaHalf + 3 && Math.abs(y) < plazaHalf + 3;
  for (let y = -180; y <= 176; y += 24) {
    if (nearEastWestStreet(y) || inPlaza(0, y)) continue;
    for (const x of [mainStreetX[0] + 1, mainStreetX[1] - 2]) placeBlueprint(houseGrid, '路灯', x, y - 1, 0, 1, false, true);
  }
  for (let x = -216; x <= 216; x += 24) {
    if (nearNorthSouthStreet(x) || inPlaza(x, 0)) continue;
    for (const y of [mainStreetY[0] + 1, mainStreetY[1] - 2]) placeBlueprint(houseGrid, '路灯', x - 1, y, 0, 0, false, true);
  }
  // 公园中间的十字小路正中放一座小喷泉
  for (const [x0, y0, x1, y1] of [[-146, -136, -98, -94], [148, 46, 192, 97]]) {
    const cx = Math.floor((x0 + x1) / 2);
    const cy = Math.floor((y0 + y1) / 2);
    grid.fill(cx - 3, cy - 3, 0, cx + 4, cy + 4, 1, 0); // 喷泉底下的草地、砂砾拿掉（两个网格同一格各画一块会闪）
    placeBlueprint(houseGrid, '喷泉', cx - 3, cy - 3, 0, 0, false);
  }
  // 北门里面，大街两边各一座岗亭（门朝街）
  placeBlueprint(houseGrid, '岗亭', mainStreetX[0], 176, 0, turnsToFace('岗亭', '东'), false);
  placeBlueprint(houseGrid, '岗亭', mainStreetX[1] - 4, 176, 0, turnsToFace('岗亭', '西'), false);
};
