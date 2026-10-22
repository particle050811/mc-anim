// 原版生物死亡（1.20.1，照 client jar 反汇编）：倒下、变红、20 刻后化成白烟。恼鬼、监守者、幽灵马都用这一套。
// - 倒下：`LivingEntityRenderer.setupRotations`，deathTime > 0 时在转身（Ry(180 − 身体朝向)）之后再 Rz(f × 90°)，f = min(1, √((deathTime + pt − 1) / 20 × 1.6))——第 1 刻开始倒，第 13.5 刻倒平。
//   Rz 绕实体前后方向的轴，正角让头顶转向实体左手边。这里的实体坐标（同 lib/实体模型.tsx）正面 −Y、右手 −X，所以绕 Y 轴转 +f×90°，头顶倒向 +X。
// - 变红：`getOverlayCoords`，hurtTime > 0 或 deathTime > 0 时用 `OverlayTexture` 的受伤行（贴图往纯红拉 30.2%）。用 EntityModel 的 `受伤`（场景光和 `mcLight` 两种材质都支持，在 sRGB 数值上拉红再乘光照）。
//   发光层（监守者的生物发光、心脏等）不跟着变红。
// - 化烟：`LivingEntity.tickDeath`，deathTime 到 20 刻实体移除、放实体事件 60 → `makePoofParticles`（20 个 poof，见 原版粒子.tsx 的 死亡烟雾）。
// 音效：各生物自己的死亡声（entity.vex.death、entity.warden.death、entity.horse.death）在死的那一刻放。
import React from 'react';

export const vanillaDeath = { toppleFlatTick: 13.5, poofTick: 20, 红: 1 - 0xb2 / 255 };

// 死后 秒 时倒下的角度（弧度）
export const vanillaToppleAngle = (secSinceDeath: number) => {
  const toppleProgress = ((secSinceDeath * 20 - 1) / 20) * 1.6;
  return toppleProgress <= 0 ? 0 : Math.min(1, Math.sqrt(toppleProgress)) * (Math.PI / 2);
};

// 把 children（原点在脚底、实体坐标）照原版倒下；死后秒 不给或 < 0 不倒
export const VanillaTopple: React.FC<{ secSinceDeath?: number; children: React.ReactNode }> = ({ secSinceDeath, children }) =>
  secSinceDeath === undefined || secSinceDeath < 0 ? <>{children}</> : <group rotation={[0, vanillaToppleAngle(secSinceDeath), 0]}>{children}</group>;
