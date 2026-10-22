// 孔道：镜头跟着扫帚钻墙洞、隧道时，镜头落在墙里的那几段路程，以及洞里镜头最多能往右（`侧`，正 = 扫帚右手边）挪多少、抬多高（`高`，相对扫帚杆）。镜头.ts 用它把镜头夹在洞口里。
// `a`：相对贯穿点的路程（米，和各段 编排.ts 的穿刺线 `a` 一致）。
// 墙按各段 编排.ts 的 `HOLE_BOXES` 算：扫帚杆中心的 y 落在墙的 y 范围（前后各放 0.6 米）里就是孔道。
import type { V3 } from '@engine/model/parts.tsx';
import * as lichChoreo from '../6-1-5/编排.ts';
import * as chainPierceChoreo from '../6-1-7/编排.ts';
import * as snowQueenChoreo from '../6-1-8/编排.ts';

type BoreSpan = { a: [number, number]; 侧: number; 高: [number, number] };
const yetiPathDist = (a: number) => chainPierceChoreo.yetiTimeAt(a) * chainPierceChoreo.speed;
// 扫帚杆中心 y 落在 `boxes` 的 y 范围里的 `a` 区间（按 0.05 米扫）
const scan = (center: (along: number) => V3, boxes: number[][], side: number, heightRange: [number, number]): BoreSpan[] => {
  const out: BoreSpan[] = [];
  let cur: [number, number] | null = null;
  for (let along = -40; along <= 40; along += 0.05) {
    const y = center(along)[1];
    const inside = boxes.some((b) => y >= b[1] - 0.6 && y <= b[4] + 0.6);
    if (inside && !cur) cur = [along, along];
    if (inside && cur) cur[1] = along;
    if (!inside && cur) {
      out.push({ a: cur, 侧: side, 高: heightRange });
      cur = null;
    }
  }
  if (cur) out.push({ a: cur, 侧: side, 高: heightRange });
  return out;
};

export const boreSources: Partial<Record<'巫妖' | '九头蛇' | '暮初恶魂' | '雪怪首领' | '冰雪女王' | '巨人', BoreSpan[]>> = {
  // 巫妖怪塔：北墙、南墙 + 副楼里的隧道 + 副楼出口（洞顺着穿刺线斜过去）。
  // 墙洞盒子里有两行是房间里挂画的那一行（室内，6-1-5/编排.ts 的跑位），不是墙，不算：算进去的话近景绕圈时镜头落进南墙那一行，
  // 侧移被一下夹回洞口宽，镜头一帧挪 1.8 米、视线甩 28°。
  巫妖: scan((a) => lichChoreo.broomLocal(a / lichChoreo.V), lichChoreo.HOLE_BOXES.filter((b) => !(b[1] >= -2.5 && b[4] <= 10.5)), 1.2, [0.4, 2.2]),
  // 雪怪洞窟：进洞前、出洞后的两条隧道（6-1-7/编排.ts 的雪怪隧道）。大厅里不夹（19 米高）。
  // `a` 是沿航线的路程（穿刺线的水平 `a` 按弧长换算）。进地那头往前多 8 米：扫帚钻进雪地那几帧镜头还在洞口外、
  // 视线擦着洞口上沿的雪（工具/一镜到底/收表.ts 量出来要收到 0.3 倍），先压低再跟进去
  雪怪首领: [
    { a: [yetiPathDist(chainPierceChoreo.yetiTunnels.enterGround) - 8, yetiPathDist(chainPierceChoreo.yetiTunnels.enterCave)], 侧: 1.2, 高: [0.3, 1.6] },
    { a: [yetiPathDist(chainPierceChoreo.yetiTunnels.exitCave), yetiPathDist(chainPierceChoreo.yetiTunnels.exitGround) + 1], 侧: 1.2, 高: [0.3, 1.6] },
  ],
  // 极光宫殿顶层：南墙、北墙。夹在侧 1.1、高 1.0，四周至少留 0.6 米（再大冰墙和洞顶会糊掉大半个画面）。
  冰雪女王: scan((a) => snowQueenChoreo.broomLocal(a / snowQueenChoreo.V), snowQueenChoreo.HOLE_BOXES, 1.1, [0.3, 1.0]),
  // 云中小屋：镜头不进屋（绕到屋外东边侧着看，见 镜头.ts 的 `nearCutaway`），没有孔道
};
