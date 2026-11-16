// 本片的史蒂夫（用户 11-10 定）：穿附魔的神灵金全套、右手拿断曜流光、头后戴晋升之环。模型、皮肤、姿势的算法用 库/角色/史蒂夫.tsx 的原版史蒂夫，
// 这里照 Steve 组件的写法把装备挂到各部件上（Steve 不收 attach，所以外面那层根矩阵 + EntityModel 在这里重写了一遍）。
// 用户 11-10 定：史蒂夫要改绑骨骼、加关节，不再完全照原版（「连关节都没有，导致动作僵硬」）。两臂加肘、两腿加膝：
//   四肢的方盒（连外层的袖子、裤子）从模型里拿掉，改由 弯肢（角色/弯肢.tsx）在各自的部件上画，穿在腿上的甲、靴子跟着折，手里的东西跟前臂走；
//   角度是 pose 的 elbowR / elbowL / kneeR / kneeL（度，约定见 角色/史蒂夫关节.ts），都是 0 时和原版一模一样；髋高换成认膝的 关节根矩阵。
// 各件的出处见 物品/神灵金盔甲.tsx、物品/断曜流光.tsx、物品/晋升之环.tsx。姿势用 stevePose / steveLookAt，手里有剑时传 holdR: true。
// 神灵金套和剑默认用旧版外观（用户 11-10 定「用旧版本的，新版本建模很丑」；两套的来历见 物品/装备外观.ts），新版留着，传 外观: '新版' 切回；晋升之环只有一套。
// 剑也带附魔光效（用户 11-10 定「加一下附魔光泽」），和盔甲一起由 附魔 开关。
import React from 'react';
import { EntityModel, type EntityModelData, type EntityPart, entityMaterial, findPart } from '@engine/model/实体模型.tsx';
import { HeldItem } from '@engine/model/物品贴图.tsx';
import type { PartPose } from '@engine/model/实体模型.tsx';
import { STEVE_MODEL, STEVE_SKIN, type StevePose, steveParts } from '@库/角色/史蒂夫.tsx';
import { Valettein, valetteinDisplay } from '../物品/断曜流光.tsx';
import { AscensionHalo } from '../物品/晋升之环.tsx';
import { type ArmorMesh, type ApocalyptiumPiece, apocalyptiumFullSet, useApocalyptiumArmorMaterials } from '../物品/神灵金盔甲.tsx';
import { defaultAppearance, type EquipAppearance } from '../物品/装备外观.ts';
import { BendLimb, type BendLayer, boxTriangles } from './弯肢.tsx';
import { type Triangle, vertexTableToTriangles } from './弯折.ts';
import { type JointPose, joints, jointRootMatrix, meshSection } from './史蒂夫关节.ts';

/** 腕的转轴过手里拿东西的那一点（部件坐标，像素）：ItemInHandLayer 的 (1/16, 2/16, −10/16) 格换到手臂部件里 */
const gripPoint = [-1, 10, -2] as const;
/** 剑绕握点转 腕 度（角色/剑招.ts；正 = 剑尖往前臂延长线那边压） */
const Wrist: React.FC<{ angleDeg: number; children: React.ReactNode }> = ({ angleDeg, children }) =>
  angleDeg === 0 ? (
    <>{children}</>
  ) : (
    <group position={[...gripPoint]}>
      <group rotation={[(angleDeg * Math.PI) / 180, 0, 0]}>
        <group position={[-gripPoint[0], -gripPoint[1], -gripPoint[2]]}>{children}</group>
      </group>
    </group>
  );

// 四肢：本体部件、外层部件、关节、角度取 pose 的哪个字段。弯折的角绕部件的 +x：膝往后折是正，肘往前折是负
const limbs = [
  { partName: 'right_arm', outerLayer: 'right_sleeve', joint: joints.elbow, sign: -1, angle: 'elbowR' },
  { partName: 'left_arm', outerLayer: 'left_sleeve', joint: joints.elbow, sign: -1, angle: 'elbowL' },
  { partName: 'right_leg', outerLayer: 'right_pants', joint: joints.knee, sign: 1, angle: 'kneeR' },
  { partName: 'left_leg', outerLayer: 'left_pants', joint: joints.knee, sign: 1, angle: 'kneeL' },
] as const;
const limbPartNames = new Set<string>(limbs.flatMap((limb) => [limb.partName, limb.outerLayer]));
// 四肢的方盒拿掉的模型（部件还在，装备照旧挂）
const stripLimbs = (p: EntityPart): EntityPart => ({ ...p, cubes: limbPartNames.has(p.name) ? [] : p.cubes, children: p.children.map(stripLimbs) });
const noLimbModel: EntityModelData = { ...STEVE_MODEL, root: stripLimbs(STEVE_MODEL.root) };
// 每根肢体的皮肤面：本体和外层的方盒合在一起（steveParts 里外层和本体是同一份姿态）
const skinTriangles = Object.fromEntries(
  limbs.map((limb) => [limb.partName, boxTriangles([...(findPart(STEVE_MODEL.root, limb.partName)?.cubes ?? []), ...(findPart(STEVE_MODEL.root, limb.outerLayer)?.cubes ?? [])], STEVE_MODEL.texSize[0]!, STEVE_MODEL.texSize[1]!)]),
) as Record<(typeof limbs)[number]['partName'], Triangle[]>;
const armorTriCache = new WeakMap<readonly number[], Triangle[]>();
const armorTriangles = (vertices: readonly number[]) => {
  let triangles = armorTriCache.get(vertices);
  if (!triangles) armorTriCache.set(vertices, (triangles = vertexTableToTriangles(vertices)));
  return triangles;
};

export type SteveEquip = {
  /** 穿哪几件神灵金甲，不给 = 全套，[] = 不穿 */
  armor?: readonly ApocalyptiumPiece[];
  /** 盔甲和剑带不带附魔光泽，不给 = 带 */
  enchanted?: boolean;
  /** 右手拿不拿断曜流光，不给 = 拿 */
  剑?: boolean;
  /** 戴不戴晋升之环，不给 = 戴 */
  hasRing?: boolean;
  /** 神灵金套和剑用哪套外观，不给 = 旧版 */
  appearance?: EquipAppearance;
  /** 右手换成别的东西（已经包好 HeldItem 的节点，比如弓）；给了就不画剑 */
  rightHand?: React.ReactNode;
  /** 左手拿的东西（已经包好 HeldItem left 的节点，比如盾、图腾） */
  leftHand?: React.ReactNode;
};

/** 秒：附魔光泽滚动、光环自转的时钟（段里传段内秒；游戏里这两样都按系统时间走，和人的动作无关）。
 *  pose 里的 elbowR / elbowL / kneeR / kneeL 是肘、膝的角（度），腕R 是剑的腕（度）。
 *  改部件：steveParts 出来的原版部件表再改一道（举盾、拉弓、挥剑这类直接按原版部件转角写的姿势，见 角色/史蒂夫反应.ts）。
 *  受伤：原版受伤、死亡的变红 0～1，只红皮肤（原版盔甲层、手里的东西都不套受伤色） */
export const EquippedSteve: React.FC<{
  pose: JointPose;
  sec: number;
  equipment?: SteveEquip;
  editParts?: (poses: Record<string, PartPose>) => Record<string, PartPose>;
  hurt?: number;
}> = ({ pose, sec: sec, equipment = {}, editParts, hurt }) => {
  const { armor = apocalyptiumFullSet, enchanted = true, 剑: sword = true, hasRing = true, appearance = defaultAppearance, rightHand, leftHand } = equipment;
  const { material: armorMaterial, grid: meshes } = useApocalyptiumArmorMaterials(armor, enchanted ? sec : undefined, appearance);
  // 和 EntityModel 给头、身用的是同一份材质（参数一样）
  const skinMaterial = entityMaterial(STEVE_SKIN, { emissive: 0, opacity: 1, alphaTest: 0.1, hurt: hurt ?? 0 });
  const armorMesh = (m: ArmorMesh) => <mesh key={m.key} geometry={m.geometry} material={armorMaterial} castShadow receiveShadow />;
  const hangArmor = (boneName: string) => meshes.filter((m) => m.bone === boneName).map(armorMesh);
  const handItems: Record<string, React.ReactNode> = {
    right_arm:
      rightHand ??
      (sword ? (
        <Wrist angleDeg={pose.wristR ?? 0}>
          <HeldItem t={valetteinDisplay[appearance].thirdperson_righthand}>
            <Valettein appearance={appearance} glintSec={enchanted ? sec : undefined} />
          </HeldItem>
        </Wrist>
      ) : null),
    left_arm: leftHand,
  };
  const attach: Record<string, React.ReactNode> = {
    head: (
      <>
        {hangArmor('head')}
        {hasRing && <AscensionHalo sec={sec} />}
      </>
    ),
    body: hangArmor('body'),
  };
  for (const limb of limbs) {
    const limbMeshes = meshes.filter((m) => m.bone === limb.partName).map((m) => ({ m, 节: meshSection(m.顶点, limb.joint.cut) }));
    const armorLayers: BendLayer[] = [{ key: '皮', triangles: skinTriangles[limb.partName], material: skinMaterial }, ...limbMeshes.filter((b) => b.节 === '弯').map((b) => ({ key: b.m.key, triangles: armorTriangles(b.m.顶点), material: armorMaterial }))];
    attach[limb.partName] = (
      <BendLimb
        cut={limb.joint.cut}
        hingeZ={limb.joint.hingeZ}
        angle={(limb.sign * (pose[limb.angle] ?? 0) * Math.PI) / 180}
        layers={armorLayers}
        upperPart={limbMeshes.filter((b) => b.节 === '上').map((b) => armorMesh(b.m))}
        lowerPart={
          <>
            {limbMeshes.filter((b) => b.节 === '下').map((b) => armorMesh(b.m))}
            {handItems[limb.partName]}
          </>
        }
      />
    );
  }
  const poses = editParts ? editParts(steveParts(pose)) : steveParts(pose);
  return (
    <group matrix={jointRootMatrix(pose)} matrixAutoUpdate={false}>
      <EntityModel model={noLimbModel} tex={STEVE_SKIN} pose={poses} attach={attach} hurt={hurt} />
    </group>
  );
};
