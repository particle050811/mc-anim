// 巨人（暮色森林 1.20.1-4.3.2508 的 `GiantMiner` 巨人矿工、`ArmoredGiant` 武装巨人，住在高地上空的云中小屋里）：模型、缩放、手持物、盔甲都照抄游戏（npm run 取材 -- 巨人）。
// 依据（javap 反汇编）：
// - 渲染器：两种巨人都用 `TFGiantRenderer`：模型是原版 PlayerModel（宽手臂 PLAYER / 细手臂 PLAYER_SLIM），`scale()` 整体放大 4 倍，影子 1.8。站直 8 格高，碰撞箱 2.4×7.2。
// - 贴图（重要）：`TFGiantRenderer.getTextureLocation` 先看配置 giantSkinUUIDs（取材客户端里是空的），为空时用「当前镜头实体」（看着它的那个玩家）自己的皮肤，slim 就换细手臂模型；
//   镜头实体不是玩家时用 steve.png。所以巨人长得和看它的玩家一模一样，只是 4 倍大（实机核对过：两个巨人都是取材账号的皮肤）。
//   这里提供两种：史蒂夫（宽手臂）、取材账号（Prism 缓存里拷来的，SLIM 细手臂）。用户 10-02 定默认用史蒂夫：一眼看得出是巨人怪物，Seedance 也不会把 4 倍大的李樱和李樱本人搞混。换皮肤传 皮肤={{ tex, slim }}。
// - 模型：`PlayerModel.createMesh`（m_170825_，导出工具直接执行字节码）= 人形 7 件 + 外层 jacket/袖子/裤子（膨胀 0.25）+ ear、cloak（巨人不画，这里藏掉）。细手臂 3 像素宽、肩高 2.5。
// - 动作：`PlayerModel.setupAnim` → `HumanoidModel.setupAnim`：头随视线；手按走路摆 cos(步×0.6662+π)×步幅；腿 cos(步×0.6662)×1.4×步幅，yRot/zRot ±0.005；不蹲时手臂肩高一律设成 2；
//   手随时间轻晃（`AnimationUtils.bobModelPart`）；攻击时身子扭 sin(√t·2π)×0.2、出手的手往下劈（`setupAttackAnimation`）。袖子、裤子、外套 copyFrom 对应部件，帽子层 copyFrom 头。巨人 armPose 一直是 EMPTY，手照常摆。
// - 手持物（`TFGiantRenderer$GiantItemInHandLayer`）：在手臂坐标里（细手臂先把肩往外挪 0.5 像素）绕 X 转 -90°、绕 Y 转 180°，平移 (±1/16, 0, -0.5)，缩小到 1/4，再套 giant_tool_base 的 thirdperson 变换
//   （rotation [0,-90,55]、translation [-0.1,24,-5.5]、scale 4.25——原版读模型时 scale 夹到 ±4、translation 夹到 ±5 格，实际是 4）。贴图就是原版石镐、石剑。巨人矿工拿 giant_pickaxe，武装巨人拿 giant_sword。
// - 盔甲：`TFGiantRenderer` 加了 `HumanoidArmorLayer`（内层膨胀 0.5，外层 1.0，贴图 64×32）。武装巨人穿一整套铁甲：头盔 / 胸甲 / 靴子画外层（iron_layer_1），护腿画内层的身子和两腿（iron_layer_2）；各部件姿势照抄巨人身上的。巨人矿工不穿。
// - 别的渲染层：`ShieldLayer`、`IceLayer` 平时不显示。不是多部件实体，没有发光层。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y（同 贴图方盒.tsx、巫妖.tsx），单位格。
import React from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { EntityModel, type EntityModelData, type PartPose } from '../../engine/model/实体模型.tsx';
import { ItemDisplay, ItemSprite, type ItemTransform } from '../../engine/model/物品贴图.tsx';
import { type Png, pngDir } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/巨人';
import { 资产目录 } from '../../engine/core/资产目录.ts';
// 待迁移（私有资产）：取材账号皮肤私有（正式段用史蒂夫皮肤），公开构建怎么去掉这张还没定
import 资_0 from 'asset:贴图/角色/巨人/取材账号';
import 资_1 from 'asset:贴图/角色/巨人/史蒂夫';
import 资_2 from 'asset:贴图/角色/巨人/石剑';
import 资_3 from 'asset:贴图/角色/巨人/石镐';
import 资_4 from 'asset:贴图/角色/巨人/铁甲1';
import 资_5 from 'asset:贴图/角色/巨人/铁甲2';

const MODELS = (raw as unknown as { models: Record<'宽' | '细' | '内甲' | '外甲', EntityModelData> }).models;
const TEX = pngDir(资产目录({ './取材账号.png': 资_0, './史蒂夫.png': 资_1, './石剑.png': 资_2, './石镐.png': 资_3, './铁甲1.png': 资_4, './铁甲2.png': 资_5 })) as Record<'史蒂夫' | '取材账号' | '铁甲1' | '铁甲2' | '石剑' | '石镐', Png>;

export const GIANT = {
  scale: 4,
  height: 8, // 头顶离脚底
  chest: 5.5, // 胸口高度
  hitbox: [2.4, 7.2],
  debris: ['#8a8a8a', '#c8c8c8', '#6b4a2b', '#3a3a3a'], // 碎屑配色（铁甲灰白、石器灰、木柄）——皮肤颜色随看的人变，不取
};

export type GiantKind = '矿工' | '武装';
export type GiantSkin = '史蒂夫' | '取材账号' | { tex: Png; slim: boolean };
const skinOf = (s: GiantSkin) => (s === '史蒂夫' ? { tex: TEX.史蒂夫, slim: false } : s === '取材账号' ? { tex: TEX.取材账号, slim: true } : s);

// giant_tool_base.json 的 thirdperson 显示变换（scale 4.25 被原版夹到 4）
const GIANT_TOOL: Record<'right' | 'left', ItemTransform> = {
  right: { rotation: [0, -90, 55], translation: [-0.1, 24, -5.5], scale: [4, 4, 4] },
  left: { rotation: [0, 90, -55], translation: [-0.1, 24, -3.5], scale: [4, 4, 4] },
};

// 巨人手里的东西：照 `GiantItemInHandLayer.renderArmWithItem`。挂在手臂部件里（部件坐标是像素，所以外面乘 16）
export const GiantHeldItem: React.FC<{ tex: Png; left?: boolean }> = ({ tex, left }) => (
  <group scale={16}>
    <group rotation={[rad(-90), rad(180), 0, 'XYZ']}>
      <group position={[(left ? -1 : 1) / 16, 0, -0.5]}>
        <group scale={0.25}>
          <ItemDisplay t={left ? GIANT_TOOL.left : GIANT_TOOL.right} left={left}>
            <ItemSprite layers={[{ tex }]} />
          </ItemDisplay>
        </group>
      </group>
    </group>
  </group>
);

// `HumanoidModel.setupAnim`（不蹲、不骑、不游泳、手里的姿势 EMPTY）。秒：游戏时间（手轻晃）；步 / 步幅：走路（limbSwing / limbSwingAmount，步幅 0～1）；攻击：0～1（右手往下劈）；头偏 / 头仰：视线角（弧度，头仰正 = 低头）
export const giantPose = (sec: number, opts: { limbSwing?: number; stride?: number; attack?: number; headYaw?: number; headPitch?: number } = {}) => {
  const PI = Math.PI;
  const age = sec * 20;
  const ls = opts.limbSwing ?? 0;
  const la = opts.stride ?? 0;
  const t = opts.attack ?? 0;
  const head = { x: opts.headPitch ?? 0, y: opts.headYaw ?? 0 };
  const body = { y: 0 };
  const rightArm = { x: Math.cos(ls * 0.6662 + PI) * 2 * la * 0.5, y: 0, z: 0, px: -5, pz: 0 };
  const leftArm = { x: Math.cos(ls * 0.6662) * 2 * la * 0.5, y: 0, z: 0, px: 5, pz: 0 };
  if (t > 0) {
    // setupAttackAnimation（右手是主手）
    body.y = Math.sin(Math.sqrt(t) * PI * 2) * 0.2;
    rightArm.pz = Math.sin(body.y) * 5;
    rightArm.px = -Math.cos(body.y) * 5;
    leftArm.pz = -Math.sin(body.y) * 5;
    leftArm.px = Math.cos(body.y) * 5;
    rightArm.y += body.y;
    leftArm.y += body.y;
    leftArm.x += body.y;
    let swingEase = 1 - t;
    swingEase *= swingEase;
    swingEase *= swingEase;
    swingEase = 1 - swingEase;
    const f1 = Math.sin(swingEase * PI);
    const f2 = Math.sin(t * PI) * -(head.x - 0.7) * 0.75;
    rightArm.x -= f1 * 1.2 + f2;
    rightArm.y += body.y * 2;
    rightArm.z += Math.sin(t * PI) * -0.4;
  }
  // bobModelPart：右手 +1、左手 -1
  rightArm.z += Math.cos(age * 0.09) * 0.05 + 0.05;
  rightArm.x += Math.sin(age * 0.067) * 0.05;
  leftArm.z -= Math.cos(age * 0.09) * 0.05 + 0.05;
  leftArm.x -= Math.sin(age * 0.067) * 0.05;
  const legR = { rot: [Math.cos(ls * 0.6662) * 1.4 * la, 0.005, 0.005], offset: [-1.9, 12, 0] };
  const legL = { rot: [Math.cos(ls * 0.6662 + PI) * 1.4 * la, -0.005, -0.005], offset: [1.9, 12, 0] };
  const armR = { rot: [rightArm.x, rightArm.y, rightArm.z], offset: [rightArm.px, 2, rightArm.pz] };
  const armL = { rot: [leftArm.x, leftArm.y, leftArm.z], offset: [leftArm.px, 2, leftArm.pz] };
  const hd = { rot: [head.x, head.y, 0], offset: [0, 0, 0] };
  const bd = { rot: [0, body.y, 0], offset: [0, 0, 0] };
  const pose: Record<string, PartPose> = {
    head: hd,
    hat: hd,
    body: bd,
    jacket: bd,
    right_arm: armR,
    right_sleeve: armR,
    left_arm: armL,
    left_sleeve: armL,
    right_leg: legR,
    right_pants: legR,
    left_leg: legL,
    left_pants: legL,
    ear: { hide: true },
    cloak: { hide: true },
  };
  return pose;
};

// 细手臂的 `translateToHand` 先把肩往外挪 0.5 像素再转：在手臂坐标里等于挪 R⁻¹·(0.5, 0, 0)
const slimHandShift = (rot: number[]) => {
  const invRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'ZYX')).invert();
  const shift = new THREE.Vector3(0.5, 0, 0).applyQuaternion(invRot);
  return [shift.x, shift.y, shift.z] as [number, number, number];
};

// 种类：矿工（巨人镐，不穿甲）/ 武装（巨人剑 + 一整套铁甲）；皮肤：见文件头；其余同 giantPose；发光：受击时闪白（0～1）；受伤：原版受伤 / 死亡时的变红（0～1，同巫妖）
export const Giant: React.FC<{
  sec: number;
  kind?: GiantKind;
  skin?: GiantSkin;
  limbSwing?: number;
  stride?: number;
  attack?: number;
  headYaw?: number;
  headPitch?: number;
  holdTool?: boolean;
  opacity?: number;
  hitFlash?: number;
  hurt?: number;
}> = ({ sec: sec, kind: kind = '矿工', skin: skinSpec = '史蒂夫', holdTool: holdTool = true, opacity = 1, hitFlash = 0, hurt: hurt = 0, ...poseOpts }) => {
  const skin = skinOf(skinSpec);
  const pose = giantPose(sec, poseOpts);
  const em = Math.round(hitFlash * 10) / 10;
  const tool = kind === '武装' ? TEX.石剑 : TEX.石镐;
  const item = <GiantHeldItem tex={tool} />;
  const attach = holdTool ? { right_arm: skin.slim ? <group position={slimHandShift(pose.right_arm.rot!)}>{item}</group> : item } : undefined;
  return (
    <group scale={GIANT.scale}>
      <EntityModel model={skin.slim ? MODELS.细 : MODELS.宽} tex={skin.tex} pose={pose} attach={attach} opacity={opacity} emissive={em} hurt={hurt} />
      {kind === '武装' && (
        <>
          {/* 头盔、胸甲、靴子：外层模型全部部件，iron_layer_1 */}
          <EntityModel model={MODELS.外甲} tex={TEX.铁甲1} pose={pose} opacity={opacity} emissive={em} hurt={hurt} />
          {/* 护腿：内层模型的身子和两腿，iron_layer_2 */}
          <EntityModel
            model={MODELS.内甲}
            tex={TEX.铁甲2}
            pose={{ ...pose, head: { hide: true }, hat: { hide: true }, right_arm: { hide: true }, left_arm: { hide: true } }}
            opacity={opacity}
            emissive={em} hurt={hurt}
          />
        </>
      )}
    </group>
  );
};
