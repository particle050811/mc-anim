// 基地工坊（基地工坊.tsx）每种方块摆在哪几格，纯数据、不带 React 和 three。渲染照它摆 InstancedMesh，
// 工具/游戏取材/基地窗户.ts 照它在片场存档摆窗户和四周的墙，两边读同一份格子，窗户位置才对得上。坐标见 基地工坊.tsx 文件头。

// 格子：[x, y, z]（方块最小角）或 [x, y, z, 绕 Z 转的度数]
export type Cell = number[];

export const X0 = -7, X1 = 6, Y0 = -8, Y1 = 8; // 墙所在的格子
export const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// 风车：轮毂（安山机壳）在北山墙外两格，帆在 y = 10 那一层；四片帆各 2 格宽、5 格长
export const WIND = { hub: [-1, 10, 10] as [number, number, number], rpm: 8 };

// 玻璃不在这里摆成方块：窗户是游戏画好、mcai mesh 导出的网格（基地工坊.tsx 的 窗户），这里只记窗户占哪几格（部件名「玻璃」）
export const LAYOUT = (() => {
  const cellsByPart: Record<string, Cell[]> = {};
  const put = (part: string, c: Cell) => (cellsByPart[part] ??= []).push(c);
  // 地板、天花板
  for (const x of range(X0, X1)) for (const y of range(Y0, Y1)) {
    put('云杉木板', [x, y, -1]);
    put('云杉木板', [x, y, 6]);
  }
  // 墙：角上和每隔几格一根云杉原木柱；底下一圈磨制安山岩，上面云杉木板；东墙 z 1～3 开窗
  const pillarY = new Set([Y0, -4, 0, 4, Y1]);
  const pillarX = new Set([X0, -3, 2, X1]);
  const wall = (x: number, y: number, pillar: boolean, window: (z: number) => boolean) => {
    for (const z of range(0, 5)) {
      if (pillar) put('云杉原木', [x, y, z]);
      else if (window(z)) put('玻璃', [x, y, z]);
      else put(z === 0 ? '磨制安山岩' : '云杉木板', [x, y, z]);
    }
  };
  for (const y of range(Y0, Y1)) {
    wall(X0, y, pillarY.has(y), () => false);
    wall(X1, y, pillarY.has(y), (z) => z >= 1 && z <= 3);
  }
  for (const x of range(X0 + 1, X1 - 1)) {
    wall(x, Y0, pillarX.has(x), (z) => z >= 1 && z <= 3);
    wall(x, Y1, pillarX.has(x), () => false);
  }
  // 北墙正中一对门（x -1、0，z 0～1）：先把墙上这四格拿掉
  const door = new Set(['-1,8,0', '-1,8,1', '0,8,0', '0,8,1']);
  for (const k of Object.keys(cellsByPart)) cellsByPart[k] = cellsByPart[k].filter((c) => !door.has(`${c[0]},${c[1]},${c[2]}`));
  put('云杉门下', [-1, 8, 0]);
  put('云杉门上', [-1, 8, 1]);
  put('云杉门下右', [0, 8, 0]);
  put('云杉门上右', [0, 8, 1]);
  // 西墙的门（用户 10-12：房间至少给一个出口，扫帚直接从门飞出去）：开在出发朝向（6-2-5 航线起头，西北偏西约 69°）上，过西墙时 y ≈ 2.5。
  // y 1～3、z 0～2 拿空（3 宽 3 高，人坐扫帚上飞过头顶离门楣 0.35 格），两边是原有的云杉原木柱（y 0、4），门楣那排（z 3）换成去皮云杉横梁。不装门板：原版门只有 2 格高飞不过去
  const westDoor = (c: Cell) => c[0] === X0 && c[1] >= 1 && c[1] <= 3 && c[2] >= 0 && c[2] <= 3;
  for (const k of Object.keys(cellsByPart)) cellsByPart[k] = cellsByPart[k].filter((c) => !westDoor(c));
  for (const y of [1, 2, 3]) put('去皮云杉横梁', [X0, y, 3, 90]);
  // ---------- 外观 ----------
  // 双坡屋顶：屋脊沿南北（y），每升一层往里收一格，西坡楼梯朝东、东坡朝西（转 180°），南北各挑出一格（y -9～9）
  for (let k = 0; k <= 7; k++)
    for (const y of range(Y0 - 1, Y1 + 1)) {
      put('铜瓦楼梯', [X0 - 1 + k, y, 7 + k]);
      put('铜瓦楼梯', [X1 + 1 - k, y, 7 + k, 180]);
    }
  // 山墙（y = -8、8）：云杉木板填满屋顶下面的三角，最下一道去皮云杉横梁，正中一根去皮云杉立柱；南山墙开一扇 2×2 的小窗
  for (let k = 0; k <= 6; k++)
    for (const x of range(X0 + k, X1 - k))
      for (const y of [Y0, Y1]) {
        const mid = x === -1 || x === 0;
        let part = k === 0 ? '去皮云杉横梁' : mid ? '去皮云杉立柱' : '云杉木板';
        if (y === Y0 && mid && (k === 2 || k === 3)) part = '玻璃';
        put(part, [x, y, 7 + k]);
      }
  // 檐下一圈横梁（z 6，墙外一格），烟囱占的两格让开
  const chimney = (x: number, y: number) => (x === -9 || x === -8) && (y === -6 || y === -5);
  for (const y of range(Y0 - 1, Y1 + 1))
    for (const x of [X0 - 1, X1 + 1]) if (!chimney(x, y)) put('去皮云杉横梁', [x, y, 6, 90]);
  for (const x of range(X0, X1))
    for (const y of [Y0 - 1, Y1 + 1]) put('去皮云杉横梁', [x, y, 6]);
  // 勒脚：墙外一圈磨制安山岩台阶（门前、烟囱让开）
  for (const y of range(Y0 - 1, Y1 + 1)) for (const x of [X0 - 1, X1 + 1]) if (!chimney(x, y) && !(x === X0 - 1 && y >= 1 && y <= 3)) put('磨制安山岩台阶', [x, y, 0]);
  for (const x of range(X0, X1)) for (const y of [Y0 - 1, Y1 + 1]) if (!(y === Y1 + 1 && (x === -1 || x === 0))) put('磨制安山岩台阶', [x, y, 0]);
  // 门上的雨棚（铜瓦台阶）和两盏灯笼
  for (const x of range(-2, 1)) put('铜瓦台阶', [x, Y1 + 1, 2]);
  put('灯笼', [-2, Y1 + 1, 1]);
  put('灯笼', [1, Y1 + 1, 1]);
  // 烟囱：西墙外 2×2，砖砌，z 0～12，z 10 一圈安山机壳，伸出屋檐 5 格；檐口在这两格让开。
  // 放西墙南段 y -6～-5（墙里是两台安山机壳）：开门后扫帚出门的路离 y 4～5 只有十几厘米
  for (const x of [-9, -8])
    for (const y of [-6, -5]) {
      for (let z = 0; z <= 12; z++) put(z === 10 ? '安山机壳' : '砖块', [x, y, z]);
    }
  // 北山墙上的风车轴承（帆在 WindmillSails 里画，跟着时间转）
  put('风车轴承', [WIND.hub[0], WIND.hub[1] - 1, WIND.hub[2]]);
  // 横梁：南北各一根，贴着天花板
  for (const x of range(X0 + 1, X1 - 1)) {
    put('云杉横梁', [x, -4, 5]);
    put('云杉横梁', [x, 4, 5]);
  }
  // 西墙下的机器和杂物（x = -6 一列）。西墙 y 1～3 开了门，门口原有的书架、木桶、箱子都挪开了
  for (const y of [-6, -5, 5, 6]) put('安山机壳', [-6, y, 0]);
  put('安山机壳', [-6, -6, 1]);
  put('安山机壳', [-6, 6, 1]);
  put('木桶', [-6, -7, 0]);
  put('工作台', [-6, -3, 0]);
  put('木桶', [-6, -2, 0]);
  for (const y of [-1, 0]) for (const z of [0, 1]) put('书架', [-6, y, z]);
  // 桌子：两根栅栏柱 + 上半格台阶当桌面
  for (const x of [1, 2]) {
    put('栅栏柱', [x, -3, 0]);
    put('云杉台阶', [x, -3, 0]);
  }
  // 灯笼（挂在天花板下）
  put('灯笼', [-3, 1, 5]);
  put('灯笼', [2, -2, 5]);
  // 屋檐在烟囱那两格让开
  cellsByPart['铜瓦楼梯'] = cellsByPart['铜瓦楼梯'].filter((c) => !(chimney(c[0], c[1]) && c[2] <= 8));
  return cellsByPart;
})();
