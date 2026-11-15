// 隐世之境一楼主厅两扇门、地毯、地洞、东窗的位置（纯数据和纯函数，不 import react、three，测试也读）；画门的在 隐世之境主厅门.tsx。
// 门的来历、转法见那个文件头。坐标同 地点/隐世之境一楼.tsx（网格本地，Z 朝上：x 东、y 北、z 上）。
export type Box = [number, number, number, number, number, number];
export type Point2D = [number, number];
type Vec3 = [number, number, number];

/** 一扇门扇：面心范围（按面心严格在盒里算这扇门的面）、转轴（网格本地 x, y）、开到底时绕 +Z 转的角（度） */
export type Leaf = { 盒: Box; axis: Point2D; openAngle: number };
/** 门洞：光照进来的那个竖直长方形，底边从 a 到 b（网格本地 x, y）、高从 底 到 顶。开着的门扇占掉的那一条不算 */
export type DoorOpening = { a: Point2D; b: Point2D; bottom: number; topEdge: number };
export type Door = { leaves: readonly Leaf[]; opening: DoorOpening; /** 门洞那一格正中（地板顶面） */ 中: Vec3 };

// 盒的 z 上界停在 1.99：门顶面和门楣（活板门）底面同在 z 2，门顶面朝上、从门洞里抬头也看不见，留在一楼网格里；门楣底面朝下，也留。
// 北门两扇相接的 x 12 竖面两扇各拿一份，背面朝外的那份被剔除，不显
export const mainHallDoors: { westDoor: Door; northDoor: Door } = {
  westDoor: {
    // 关着：x 6～6.1875、y −11～−10；开着：x 6～7、y −10.1875～−10（贴门洞北沿，往屋里甩）
    leaves: [{ 盒: [5.99, -11.01, -0.01, 6.2, -9.99, 1.99], axis: [6.09375, -10.09375], openAngle: 90 }],
    opening: { a: [7, -10.1875], b: [7, -11], bottom: 0, topEdge: 2 },
    中: [6.5, -10.5, 0],
  },
  northDoor: {
    // 关着：y −7～−6.8125；开着：左扇贴西沿 x 11～11.1875、右扇贴东沿 x 12.8125～13（往院子里甩）
    leaves: [
      { 盒: [10.99, -7.01, -0.01, 12.01, -6.8, 1.99], axis: [11.09375, -6.90625], openAngle: 90 },
      { 盒: [11.99, -7.01, -0.01, 13.01, -6.8, 1.99], axis: [12.90625, -6.90625], openAngle: -90 },
    ],
    opening: { a: [11.1875, -7], b: [12.8125, -7], bottom: 0, topEdge: 2 },
    中: [12, -6.5, 0],
  },
};
export type DoorName = keyof typeof mainHallDoors;

export const mainHall = {
  /** 主厅地上那块地毯（模板 x 10～14、z 9～14 的地毯，顶面高 1/16）：门光的亮块落到这里要抬到地毯顶面 */
  carpet: { 框: [10, -15, 15, -9] as [number, number, number, number], 高: 1 / 16 },
  /** 主厅南头地板上的洞（模板 x 12～15、z 16，结构里就是空气，底下本来接另一块拼图结构）：网格下面是空的，从屋里看过去会透出天色 */
  floorHole: [12, -17, 16, -16] as [number, number, number, number],
  /** 东墙那扇窗（玻璃板在 x 17.5 那个面上）：y −14～−11、z 1～4 */
  eastWindow: { x: 17.5, y0: -14, y1: -11, bottom: 1, topEdge: 4 },
};

/** 门开到 开（0～1）时光还能穿过去的那段门洞（光的水平方向 光向 xy，从门外往屋里）：门扇没开到底时斜在门洞那一格里，
 *  挡住靠门轴那一截。按门扇底面四个角顺着光投到门洞底边上，门轴那头到投得最远的地方算挡住。开到底时就是 洞 本身；全挡住给 null */
export const openDoorOpening = (door: Door, openAmount: number, lightDir: readonly number[]): DoorOpening | null => {
  if (openAmount >= 1) return door.opening;
  const { a, b } = door.opening;
  const [ux, uy] = [b[0] - a[0], b[1] - a[1]];
  const [dx, dy] = [lightDir[0]!, lightDir[1]!];
  const cross2D = (px: number, py: number, qx: number, qy: number) => px * qy - py * qx;
  const baseCross = cross2D(ux, uy, dx, dy);
  // 点 p 顺着光落到门洞底边那条线上，在 a（0）到 b（1）的哪儿
  const project = (px: number, py: number) => cross2D(px - a[0], py - a[1], dx, dy) / baseCross;
  // 盒是按面心挑面用的，四边各多了一点：取到 1/16 格就是门扇本身
  const snap = (v: number) => Math.round(v * 16) / 16;
  let [lo, hi] = [0, 1];
  for (const { 盒: box, axis, openAngle } of door.leaves) {
    const t = (openAngle * openAmount * Math.PI) / 180;
    const [c, sn] = [Math.cos(t), Math.sin(t)];
    const edges = [
      [snap(box[0]), snap(box[1])],
      [snap(box[3]), snap(box[1])],
      [snap(box[3]), snap(box[4])],
      [snap(box[0]), snap(box[4])],
    ].map(([x, y]) => project(axis[0] + c * (x! - axis[0]) - sn * (y! - axis[1]), axis[1] + sn * (x! - axis[0]) + c * (y! - axis[1])));
    if (project(axis[0], axis[1]) < 0.5) lo = Math.max(lo, ...edges);
    else hi = Math.min(hi, ...edges);
  }
  if (hi - lo < 1e-3) return null;
  const pointAt = (u: number): Point2D => [a[0] + ux * u, a[1] + uy * u];
  return { ...door.opening, a: pointAt(lo), b: pointAt(hi) };
};
