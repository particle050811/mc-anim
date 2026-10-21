// F3+B 碰撞箱线框，照 1.20.1 `EntityRenderDispatcher.renderHitbox`：
// - 白框：实体的 AABB，12 条棱；红框：只有 LivingEntity 才有，眼高处一个扁盒子 (minX, 眼高−0.01, minZ) ~ (maxX, 眼高+0.01, maxZ)；
// - 蓝线：所有实体都有，从 (实体位置 + 眼高) 沿视线方向画 2 格长。
// - 线宽：游戏里 `RenderSystem.lineWidth(max(2.5, 窗口宽 / 1920 × 2.5))` 像素，着色器把线展开成屏幕空间等宽的四边形。这里用 three 的 `LineSegments2`，宽度默认按画布宽度照游戏算。线有深度测试、不受光、不做色调映射。
//
// 拔刀剑（SlashBlade Resharped 1.9.65）的斩击实体，查 jar 的结论（反编译加 javap 核对）：
// - 刀在鞘里时第一刀走 combo_a1，clickAction 是 `AttackManager.doSlash`(roll −10°)，生成 `EntitySlashEffect`（继承原版 Projectile）。
//   碰撞箱：sized(3.0, 3.0)，没有覆写，所以是原版 3×3×3 正方体，轴对齐、不跟着朝向转。位置（碰撞箱底面中心）= 玩家脚底 + (0, 眼高×0.75, 0) + 视线×0.3；yRot = 玩家 yRot、xRot = 0。
//   寿命：lifetime 10，第 11 刻才移除，F3+B 的框显示约 0.55 秒。F3+B：不是 LivingEntity，没有红框；蓝线从框底往上 2.55 格出发，沿 yRot 水平画 2 格。
//   画面上真正看得见的是斩击月牙（`SlashEffectRenderer` + jar 里 assets/slashblade/model/util/slash.obj、slash.png），比这个框宽得多；搬过来的 斩击月牙.tsx 已删（6-4-3 挡箭改画夜幕刀光），要用从 Git 历史里找（连同 package.json 里导模型的 export:斩击月牙 命令）。
// - 挡箭：这个框不参与判定（`EntitySlashEffect` 不 isPickable）。两条路径，范围一样：
//   A. 斩击实体在 tickCount 为偶数时（第 2、4、6、8、10 刻）调 `AttackManager.areaAttack`；
//   B. 按住右键时，物品每刻 `ArrowReflector.doTicks`，拔刀后 6 刻（约 0.3 秒）内每刻都挡。
//   范围（`TargetSelector.getReflectableEntitiesWithinAABB`）：reach = entity_reach 属性 − 1；Forge 默认 3，主手拿拔刀剑再加 2.5（`ReachModifier.BladeReach`），生存模式 reach = 4.5 格。
//   粗选盒 = 玩家碰撞箱沿视线挪 reach×0.5、再各向外扩 reach+1，精筛 = 投射物离玩家脚底 < reach。不是自己射的投射物都算。
//   选中的投射物交给 `ArrowReflector.doReflect`：攻击者是 LivingEntity（玩家一定是）时方向直接取玩家视线 `getLookAngle`，以 3.5 格/刻、0.2 散布重新射出去，箭变成暴击箭，位置不变、射手不变。
//   弹开不需要命中判定、不看伤害，只要在范围里，所以是「无条件地」挡开。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { V3 } from '../../engine/model/parts.tsx';

// 游戏里的几种实体尺寸（EntityType.sized / getEyeHeight）
export const HITBOX = {
  player: { w: 0.6, h: 1.8, eye: 1.62 },
  arrow: { w: 0.5, h: 0.5, eye: 0.13 },
  slash: { w: 3.0, h: 3.0, eye: 2.55 }, // EntitySlashEffect，非生物
};

// 12 条棱（每条两个端点）
const boxEdges = (minCorner: V3, maxCorner: V3): number[] => {
  const [x0, y0, z0] = minCorner;
  const [x1, y1, z1] = maxCorner;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return edges.flatMap(([i, j]) => [...corners[i], ...corners[j]]);
};

const Lines: React.FC<{ pts: number[]; color: string; width: number; opacity: number }> = ({ pts, color, width, opacity }) => {
  const size = useThree((s) => s.size);
  const obj = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    const material = new LineMaterial({ color, linewidth: width, transparent: opacity < 1, opacity, depthTest: true, depthWrite: opacity >= 1 });
    material.toneMapped = false;
    const segments = new LineSegments2(geometry, material);
    segments.frustumCulled = false;
    return segments;
  }, [color]);
  obj.geometry.setPositions(pts);
  const mat = obj.material as LineMaterial;
  mat.linewidth = width;
  mat.opacity = opacity;
  mat.transparent = opacity < 1;
  mat.depthWrite = opacity >= 1;
  mat.resolution.set(size.width, size.height);
  return <primitive object={obj} />;
};

// min / max：碰撞箱两个角（场景坐标 Z 朝上）；opacity：整体透明度；eye：眼高（相对碰撞箱底面），给了就画蓝色视线；
// look：视线方向（场景坐标，会归一化），蓝线长 2 格，不给时朝南（−Y）；living：是不是 LivingEntity，是的话眼高处再画红框；lineWidth：像素，不给就照游戏按画布宽算
export const HitboxWire: React.FC<{ min: V3; max: V3; opacity?: number; eye?: number; look?: V3; living?: boolean; lineWidth?: number }> = ({
  min,
  max,
  opacity = 1,
  eye,
  look,
  living = false,
  lineWidth,
}) => {
  const size = useThree((s) => s.size);
  const width = lineWidth ?? Math.max(2.5, (size.width / 1920) * 2.5);
  if (opacity <= 0) return null;
  const white = boxEdges(min, max);
  const out = [<Lines key="w" pts={white} color="#ffffff" width={width} opacity={opacity} />];
  if (eye !== undefined) {
    const ez = min[2] + eye;
    if (living) out.push(<Lines key="r" pts={boxEdges([min[0], min[1], ez - 0.01], [max[0], max[1], ez + 0.01])} color="#ff0000" width={width} opacity={opacity} />);
    const cx = (min[0] + max[0]) / 2;
    const cy = (min[1] + max[1]) / 2;
    const lookVec = new THREE.Vector3(...(look ?? [0, -1, 0])).normalize().multiplyScalar(2);
    out.push(<Lines key="b" pts={[cx, cy, ez, cx + lookVec.x, cy + lookVec.y, ez + lookVec.z]} color="#0000ff" width={width} opacity={opacity} />);
  }
  return <>{out}</>;
};

// 拔刀剑斩击实体（EntitySlashEffect）的碰撞箱：给玩家脚底位置和视线方向（场景坐标），返回 HitboxWire 要的 min / max / eye / look。
// 位置 = 脚底 + (0, 0, 眼高 1.62 × 0.75 = 1.215) + 视线 × 0.3；箱子 3×3×3，以这个位置为底面中心。蓝线沿玩家的水平朝向（斩击实体 xRot = 0）
export const slashHitbox = (feet: V3, lookDir: V3, playerEyeHeight = HITBOX.player.eye) => {
  const lookUnit = new THREE.Vector3(...lookDir).normalize();
  const boxBase: V3 = [feet[0] + lookUnit.x * 0.3, feet[1] + lookUnit.y * 0.3, feet[2] + playerEyeHeight * 0.75 + lookUnit.z * 0.3];
  const halfWidth = HITBOX.slash.w / 2;
  const flat = new THREE.Vector3(lookUnit.x, lookUnit.y, 0);
  const look: V3 = flat.lengthSq() > 1e-8 ? (flat.normalize().toArray() as V3) : [0, -1, 0];
  return {
    min: [boxBase[0] - halfWidth, boxBase[1] - halfWidth, boxBase[2]] as V3,
    max: [boxBase[0] + halfWidth, boxBase[1] + halfWidth, boxBase[2] + HITBOX.slash.h] as V3,
    eye: HITBOX.slash.eye,
    look,
    living: false,
  };
};

// 斩击实体的寿命：第 11 刻移除（见文件头），按秒
export const slashLifeSec = 11 / 20;

// 拔刀剑真正用来挑出要弹开的投射物的范围（F3+B 看不到，给编排核对用）：盒子 = 玩家碰撞箱沿视线挪 reach×0.5 再各向外扩 reach+1；再要求投射物位置离玩家脚底 < reach。reach 默认 4.5。弹开后的方向永远是玩家视线（见文件头）
export const bladeReflectRange = (feet: V3, lookDir: V3, reach = 4.5) => {
  const shift = new THREE.Vector3(...lookDir).normalize().multiplyScalar(reach * 0.5);
  const halfExtent = HITBOX.player.w / 2 + reach + 1;
  return {
    min: [feet[0] + shift.x - halfExtent, feet[1] + shift.y - halfExtent, feet[2] + shift.z - reach - 1] as V3,
    max: [feet[0] + shift.x + halfExtent, feet[1] + shift.y + halfExtent, feet[2] + shift.z + HITBOX.player.h + reach + 1] as V3,
    sphereRadius: reach,
  };
};

export const entityHitbox = (p: V3, w: number, h: number) => ({
  min: [p[0] - w / 2, p[1] - w / 2, p[2]] as V3,
  max: [p[0] + w / 2, p[1] + w / 2, p[2] + h] as V3,
});
