// 6-4-6、6-4-7 的振动链（古城4x）：追兵落地、刹步、6-4-7 那一「踩」发出的振动 → 8 格内的感测体 → 感测体咔嗒 → 8 格内的尖啸体 → 尖啸（第三、四次）。
// 两次尖啸都真有振动链，不是照脚本叫：这里照 1.20.1 逐个算，粒子、咔嗒、尖啸都按算出来的画和放。
// 规则（同 ../6-4-3/编排.ts 的 声音链、../../模型/特效/振动粒子.tsx 文件头，javap 核过的那几条）：
// - 振动发在实体的位置（脚底）；感测体的监听位置是方块正中心，距离 ≤ 8 格才收；飞 floor(距离) 刻，到了才激活。
// - 路上有羊毛（occludes_vibration_signals）就挡：两头取所在格的格心连线（VibrationSystem.Listener.isOccluded），世界里原有的羊毛
//   + 李樱垫的羊毛。羊毛表是 工具/古城4x布局/导出追兵振动方块.py 从新世界方块读的（振动方块.json）。
// - 感测体在路上有振动、或者激活（30 刻）+ 冷却（10 刻）期间不收新的。
// - 感测体激活时在自己身上发 sculk_sensor_tendrils_clicking，8 格内的尖啸体收（同样飞 floor(距离) 刻、挡羊毛）；收到时警告不在 10 秒冷却里就尖啸，
//   警告随即进冷却（WardenSpawnTracker，原版每个玩家各记各的，这里照脚本当一份算）。冷却里的尖啸体收到也不叫。
// - 落地发 hit_ground、走一步发 step；站在羊毛上的不发（这两人不垫羊毛）。起跳本身不发振动。
// 时钟：秒，从 6-4-5 第 0 帧起（追兵钟，见 走位.ts）。
import type { V3 } from '../../../../engine/model/parts.tsx';
import { G4 } from '../../../../world/地点/古城4x.tsx';
import { vanilla, type BlockPos } from '../../../../world/地点/古城4x/布局.ts';
import blockData资产 from 'asset:碎块/镜头/6-4-6/振动方块';
const blockData = blockData资产 as unknown as any; // 迁移：类型待补

type VibrationEvent = { 名: string; t: number; p: V3 }; // p：场景坐标（脚底）
export type Vibration = { from: V3; to: V3; t: number; 到: number; 收: string };
const tickSec = 1 / 20;
const posKey = (b: number[]) => b.join(',');
const cellCenter = ([x, y, z]: number[]): V3 => G4(x + 0.5, y + 0.5, z + 0.5);
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const toGame = (p: V3): V3 => [p[0] - 720, p[2] - 50, 240 - p[1]];

const worldWool = new Set((blockData.羊毛 as number[][]).map(posKey));
export const sensorCells: BlockPos[] = blockData.感测体 as BlockPos[];
export const shriekerCells: BlockPos[] = blockData.尖啸体 as BlockPos[];
// 两点（场景坐标）连线上有没有羊毛：两头取格心，0.02 格一步（同 工具/古城4x布局/方块.py 的 挡振动）
const isOccluded = (start: V3, end: V3, placedWool: Set<string>) => {
  const startCell = toGame(start).map((v) => Math.floor(v) + 0.5);
  const endCell = toGame(end).map((v) => Math.floor(v) + 0.5);
  const steps = Math.floor(Math.hypot(endCell[0] - startCell[0], endCell[1] - startCell[1], endCell[2] - startCell[2]) / 0.02) + 2;
  for (let i = 1; i < steps - 1; i++) {
    const k = i / (steps - 1);
    const cell = [0, 1, 2].map((j) => Math.floor(startCell[j] + (endCell[j] - startCell[j]) * k));
    const kk = posKey(cell);
    if (worldWool.has(kk) || placedWool.has(kk)) return true;
  }
  return false;
};

export type ChainResult = {
  vibrations: Vibration[];
  激活: Map<string, number>; // 感测体（格的键）→ 激活的秒
  尖啸们: { 体: BlockPos; p: V3; t: number }[]; // p：尖啸体底面中心（场景）
  收到不叫: { 体: BlockPos; t: number }[]; // 冷却里收到的
};
// 事件们按时间排好；冷却到：上一次尖啸 + 10 秒（追兵钟）；垫的：李樱垫的羊毛（羊毛条目 [x, 站立面 y, z] = 羊毛方块所在格）
export const computeChain = (events: VibrationEvent[], cooldownUntil: number, placedWool: BlockPos[]): ChainResult => {
  const placedSet = new Set(placedWool.map(posKey));
  const busyUntil = new Map<string, number>();
  const activatedAt = new Map<string, number>();
  const vibrations: Vibration[] = [];
  const clicks: { b: BlockPos; t: number }[] = [];
  for (const event of [...events].sort((a, b) => a.t - b.t)) {
    for (const sensor of sensorCells) {
      const to = cellCenter(sensor);
      const distance = dist(event.p, to);
      if (distance > vanilla.vibrationRange || event.t < (busyUntil.get(posKey(sensor)) ?? -Infinity) || isOccluded(event.p, to, placedSet)) continue;
      const arriveSec = event.t + Math.floor(distance) * tickSec;
      vibrations.push({ from: event.p, to, t: event.t, 到: arriveSec, 收: `感测体 ${posKey(sensor)}（${event.名}）` });
      busyUntil.set(posKey(sensor), arriveSec + 40 * tickSec);
      activatedAt.set(posKey(sensor), arriveSec);
      clicks.push({ b: sensor, t: arriveSec });
    }
  }
  // 咔嗒 → 尖啸体：每个尖啸体按到达先后收（叫的那 90 刻里不收），警告不在冷却里就叫
  const receipts: { shrieker: BlockPos; t: number; from: V3; emitT: number }[] = [];
  for (const shrieker of shriekerCells) {
    const to = cellCenter(shrieker);
    let callingUntil = -Infinity;
    for (const click of [...clicks].sort((a, b) => a.t - b.t)) {
      const from = cellCenter(click.b);
      const distance = dist(from, to);
      if (distance > vanilla.vibrationRange || isOccluded(from, to, placedSet)) continue;
      const arriveSec = click.t + Math.floor(distance) * tickSec;
      if (arriveSec < callingUntil) continue;
      receipts.push({ shrieker: shrieker, t: arriveSec, from, emitT: click.t });
      callingUntil = arriveSec + vanilla.shriekResponseTicks * tickSec;
    }
  }
  receipts.sort((a, b) => a.t - b.t);
  const shrieks: ChainResult['尖啸们'] = [];
  const silentReceipts: ChainResult['收到不叫'] = [];
  let cooldownEnd = cooldownUntil;
  for (const receipt of receipts) {
    vibrations.push({ from: receipt.from, to: cellCenter(receipt.shrieker), t: receipt.emitT, 到: receipt.t, 收: `尖啸体 ${posKey(receipt.shrieker)}` });
    if (receipt.t >= cooldownEnd) {
      shrieks.push({ 体: receipt.shrieker, p: G4(receipt.shrieker[0] + 0.5, receipt.shrieker[1], receipt.shrieker[2] + 0.5), t: receipt.t });
      cooldownEnd = receipt.t + vanilla.warningCooldownSec;
    } else silentReceipts.push({ 体: receipt.shrieker, t: receipt.t });
  }
  return { vibrations, 激活: activatedAt, 尖啸们: shrieks, 收到不叫: silentReceipts };
};

// 网格里画死的感测体藏掉、换成会抖的（同 ../6-4-3/编排.ts 的 感测体HIDE：底座侧面、顶面和触须分两个盒子藏）
export const sensorHideBoxes = (bs: BlockPos[]): number[][] =>
  bs.flatMap(([x, y, z]) => {
    const lo = G4(x, y, z + 1);
    const hi = G4(x + 1, y + 1, z);
    return [
      [lo[0] - 0.005, lo[1] - 0.005, lo[2] + 0.1, hi[0] + 0.005, hi[1] + 0.005, lo[2] + 0.4],
      [lo[0] + 0.01, lo[1] + 0.01, lo[2] + 0.4, hi[0] - 0.01, hi[1] - 0.01, hi[2] - 0.001],
    ];
  });
export const sensorBaseCenter = ([x, y, z]: BlockPos): V3 => G4(x + 0.5, y, z + 0.5);
export const cellKey = posKey;
