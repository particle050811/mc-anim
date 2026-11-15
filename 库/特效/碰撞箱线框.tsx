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

// 游戏里的几种实体尺寸（EntityType.sized / getEyeHeight）
export const HITBOX = {
  player: { w: 0.6, h: 1.8, eye: 1.62 },
  arrow: { w: 0.5, h: 0.5, eye: 0.13 },
  slash: { w: 3.0, h: 3.0, eye: 2.55 }, // EntitySlashEffect，非生物
};

