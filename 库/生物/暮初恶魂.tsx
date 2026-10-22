// 暮初恶魂（暮色森林 1.20.1-4.3.2508 的 `UrGhast`，幽冥高塔塔顶的 boss）：模型、贴图、缩放、触手动作都照抄 mod jar（npm run 取材 -- 暮初恶魂）。
// 依据（javap 反汇编）：
// - 用哪套模型：`TFClientSetup` 按 Jappa 材质包判断，jar 里没有 jappa_models.marker，所以默认是 `UrGhastRenderer` + `UrGhastModel`（模型层 NEW_UR_GHAST，对应 `UrGhastModel.create`）。
// - `UrGhastModel.create()`：16 像素见方的身体（body，偏移 y=8）+ 9 条触手，每条 4 节（tentacle_i → _extension → _extension_2 → _tip，每节 3×4×3 像素，第一节 3×5×3），
//   根部按编号 switch 摆（`makeTentacle`：0～4 在底面，5～8 在左右两侧斜着伸出，带 zRot ±45°/±60°）。贴图 64×32 三张：towerboss.png（闭眼，没有目标）、towerboss_openeyes.png（睁眼，盯着目标）、
//   towerboss_fire.png（红眼张嘴，蓄力喷火时 attackTimer>10，或死亡时）——`UrGhastRenderer.getTextureLocation`。
// - 缩放：`CarminiteGhastRenderer.scale`，ghastScale = 24（`TFClientSetup` 传的 8 是影子半径）：f = 蓄力刻数/20（`GhastguardAttackGoal` 的 attackTimer：看见目标后每刻 +1，到 20 喷火球并回到 -40），
//   f = 1/(f⁵·2+1)，竖直缩放 (24+f)/2、水平缩放 (24+1/f)/2。平时 f=1 → 整体 12.5 倍；喷火那一刻竖直 12.17、水平 13.5（压扁鼓起）。
//   缩放绕脚底做（scale 之后才平移 -1.501），所以身体中心在脚底上方 12.5 格，顶面 18.76 格；触手垂直挂下来时最低到脚底以下约 6 格（碰撞箱 14×18）。
// - `setupAnim`：`TFGhastModel` 先让身体跟着视线转，`UrGhastModel` 再给每条触手按时间摆：f9 = (刻 + i×9)/2，四节 xRot 依次 = 0.2+cos(f9×0.3335)×0.15、0.1+cos(f9×0.4445)×0.2、
//   0.1+cos(f9×0.5555)×0.25、0.1+cos(f9×0.6665)×0.3，第一节 yRot = 0.4×sin(f9×0.3)（前面按走路幅度算的那组 xRot 被覆盖，不生效）。
// - 渲染层：构造里都没加层，`ShieldLayer`、`IceLayer` 也不带。不是多部件实体，没有发光层、半透明层。游戏里另有、这里没做的：发脾气阶段身上往下掉 BOSS_TEAR 眼泪粒子；喷的火球是另一个实体（`UrGhastFireball`）。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y（同 贴图方盒.tsx、巫妖.tsx），单位格。
import React from 'react';
import { EntityModel, type EntityModelData, findPart } from '../../engine/model/实体模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/暮初恶魂';
import skinClosed from 'asset:贴图/角色/暮初恶魂/闭眼';
import skinFire from 'asset:贴图/角色/暮初恶魂/喷火';
import skinOpen from 'asset:贴图/角色/暮初恶魂/睁眼';

const MODEL = (raw as unknown as { models: Record<string, EntityModelData> }).models.暮初恶魂;
const TEX = { 闭眼: png(skinClosed), 睁眼: png(skinOpen), 喷火: png(skinFire) };
export type UrGhastFace = keyof typeof TEX;

export const UR_GHAST = {
  scale: 12.5, // 平时的整体缩放（ghastScale 24，f=1 时 (24+1)/2）
  bodySize: 12.5, // 身体边长（16 像素 × 12.5 / 16）
  bodyCenter: 12.5, // 身体中心离脚底
  top: 18.76, // 身体顶面离脚底
  hitbox: [14, 18], // 碰撞箱 宽、高
  tentacles: 9,
  debris: ['#f2f2f2', '#d8d8d8', '#9a3a3a', '#6e2a2a'], // 碎屑配色（取自贴图：白、红色裂纹）
};

// 触手每节的名字（模型里 tentacle_i 下面依次套 _extension、_extension_2、_tip）
const SEG = (i: number) => [`tentacle_${i}`, `tentacle_${i}_extension`, `tentacle_${i}_extension_2`, `tentacle_${i}_tip`];
// 触手根部原本的 zRot（5～8 号斜着伸出的那几条），setupAnim 只改 xRot、yRot，zRot 要保留
const BASE_Z = Array.from({ length: UR_GHAST.tentacles }, (_, i) => findPart(MODEL.root, `tentacle_${i}`)!.pose.rot[2]);

// `CarminiteGhastRenderer.scale`：蓄力 0～1（attackTimer / 20）→ [水平, 竖直] 缩放
export const urGhastScale = (charge = 0) => {
  const f0 = Math.max(0, charge);
  const squash = 1 / (f0 ** 5 * 2 + 1);
  return [(24 + 1 / squash) / 2, (24 + squash) / 2];
};

// 秒：游戏时间（触手摆动）；头偏 / 头仰：视线角（弧度，整个身子跟着转；头仰正 = 往下看）；蓄力：0～1，attackTimer/20（>0.5 换喷火的脸，=1 那一刻喷火球、身子压扁鼓起最厉害）；
// 表情：不给就按游戏规则——蓄力过半是 喷火，否则 睁眼（打 boss 时它一直盯着人；没有目标才是 闭眼）；发光：受击时闪白（0～1）；受伤：受伤 / 死亡时变红（0～1，同巫妖）
export const UrGhast: React.FC<{ 秒: number; 头偏?: number; headPitch?: number; charge?: number; face?: UrGhastFace; opacity?: number; hitFlash?: number; 受伤?: number }> = ({
  秒: sec,
  头偏: headYaw = 0,
  headPitch = 0,
  charge: charge = 0,
  face: faceOverride,
  opacity = 1,
  hitFlash = 0,
  受伤: hurt = 0,
}) => {
  const age = sec * 20;
  const pose: Record<string, { rot: number[] }> = { body: { rot: [headPitch, headYaw, 0] } };
  for (let i = 0; i < UR_GHAST.tentacles; i++) {
    const f9 = (age + i * 9) / 2;
    const [rootSeg, ext1Seg, ext2Seg, tipSeg] = SEG(i);
    pose[rootSeg] = { rot: [0.2 + Math.cos(f9 * 0.3335) * 0.15, 0.4 * Math.sin(f9 * 0.3), BASE_Z[i]] };
    pose[ext1Seg] = { rot: [0.1 + Math.cos(f9 * 0.4445) * 0.2, 0, 0] };
    pose[ext2Seg] = { rot: [0.1 + Math.cos(f9 * 0.5555) * 0.25, 0, 0] };
    pose[tipSeg] = { rot: [0.1 + Math.cos(f9 * 0.6665) * 0.3, 0, 0] };
  }
  const [sxz, sy] = urGhastScale(charge);
  const face: UrGhastFace = faceOverride ?? (charge > 0.5 ? '喷火' : '睁眼');
  return (
    // 缩放绕脚底：实体坐标 Z 朝上，所以竖直缩放放在 Z 上
    <group scale={[sxz, sxz, sy]}>
      <EntityModel model={MODEL} tex={TEX[face]} pose={pose} opacity={opacity} emissive={Math.round(hitFlash * 10) / 10} hurt={hurt} />
    </group>
  );
};
