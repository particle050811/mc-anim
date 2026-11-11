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
import { 断曜流光, 断曜流光显示 } from '../物品/断曜流光.tsx';
import { 晋升之环 } from '../物品/晋升之环.tsx';
import { type 盔甲网格, type 神灵金件, 神灵金全套, use神灵金盔甲料 } from '../物品/神灵金盔甲.tsx';
import { 默认外观, type 装备外观 } from '../物品/装备外观.ts';
import { 弯肢, type 弯层, 方盒三角 } from './弯肢.tsx';
import { type 三角, 顶点表转三角 } from './弯折.ts';
import { 关节, 关节根矩阵, 网格分节 } from './史蒂夫关节.ts';

// 四肢：本体部件、外层部件、关节、角度取 pose 的哪个字段。弯折的角绕部件的 +x：膝往后折是正，肘往前折是负
const 肢们 = [
  { 部件: 'right_arm', 外层: 'right_sleeve', 关节: 关节.肘, 号: -1, 角: 'elbowR' },
  { 部件: 'left_arm', 外层: 'left_sleeve', 关节: 关节.肘, 号: -1, 角: 'elbowL' },
  { 部件: 'right_leg', 外层: 'right_pants', 关节: 关节.膝, 号: 1, 角: 'kneeR' },
  { 部件: 'left_leg', 外层: 'left_pants', 关节: 关节.膝, 号: 1, 角: 'kneeL' },
] as const;
const 肢部件名 = new Set<string>(肢们.flatMap((肢) => [肢.部件, 肢.外层]));
// 四肢的方盒拿掉的模型（部件还在，装备照旧挂）
const 去肢 = (p: EntityPart): EntityPart => ({ ...p, cubes: 肢部件名.has(p.name) ? [] : p.cubes, children: p.children.map(去肢) });
const 无肢模型: EntityModelData = { ...STEVE_MODEL, root: 去肢(STEVE_MODEL.root) };
// 每根肢体的皮肤面：本体和外层的方盒合在一起（steveParts 里外层和本体是同一份姿态）
const 皮肤三角 = Object.fromEntries(
  肢们.map((肢) => [肢.部件, 方盒三角([...(findPart(STEVE_MODEL.root, 肢.部件)?.cubes ?? []), ...(findPart(STEVE_MODEL.root, 肢.外层)?.cubes ?? [])], STEVE_MODEL.texSize[0]!, STEVE_MODEL.texSize[1]!)]),
) as Record<(typeof 肢们)[number]['部件'], 三角[]>;
const 甲三角表 = new WeakMap<readonly number[], 三角[]>();
const 甲三角 = (顶点: readonly number[]) => {
  let 三 = 甲三角表.get(顶点);
  if (!三) 甲三角表.set(顶点, (三 = 顶点表转三角(顶点)));
  return 三;
};

export type 史蒂夫装备 = {
  /** 穿哪几件神灵金甲，不给 = 全套，[] = 不穿 */
  盔甲?: readonly 神灵金件[];
  /** 盔甲和剑带不带附魔光泽，不给 = 带 */
  附魔?: boolean;
  /** 右手拿不拿断曜流光，不给 = 拿 */
  剑?: boolean;
  /** 戴不戴晋升之环，不给 = 戴 */
  环?: boolean;
  /** 神灵金套和剑用哪套外观，不给 = 旧版 */
  外观?: 装备外观;
  /** 右手换成别的东西（已经包好 HeldItem 的节点，比如弓）；给了就不画剑 */
  右手?: React.ReactNode;
  /** 左手拿的东西（已经包好 HeldItem left 的节点，比如盾、图腾） */
  左手?: React.ReactNode;
};

/** 秒：附魔光泽滚动、光环自转的时钟（段里传段内秒；游戏里这两样都按系统时间走，和人的动作无关）。
 *  pose 里的 elbowR / elbowL / kneeR / kneeL 是肘、膝的角（度）。
 *  改部件：steveParts 出来的原版部件表再改一道（举盾、拉弓、挥剑这类直接按原版部件转角写的姿势，见 角色/史蒂夫反应.ts）。
 *  受伤：原版受伤、死亡的变红 0～1，只红皮肤（原版盔甲层、手里的东西都不套受伤色） */
export const 装备史蒂夫: React.FC<{
  pose: StevePose;
  秒: number;
  装备?: 史蒂夫装备;
  改部件?: (部件: Record<string, PartPose>) => Record<string, PartPose>;
  受伤?: number;
}> = ({ pose, 秒, 装备 = {}, 改部件, 受伤 }) => {
  const { 盔甲 = 神灵金全套, 附魔 = true, 剑 = true, 环 = true, 外观 = 默认外观, 右手, 左手 } = 装备;
  const { 材质: 甲材质, 网格 } = use神灵金盔甲料(盔甲, 附魔 ? 秒 : undefined, 外观);
  // 和 EntityModel 给头、身用的是同一份材质（参数一样）
  const 皮材质 = entityMaterial(STEVE_SKIN, { emissive: 0, opacity: 1, alphaTest: 0.1, hurt: 受伤 ?? 0 });
  const 甲 = (m: 盔甲网格) => <mesh key={m.键} geometry={m.几何} material={甲材质} castShadow receiveShadow />;
  const 挂甲 = (骨: string) => 网格.filter((m) => m.骨 === 骨).map(甲);
  const 手里: Record<string, React.ReactNode> = {
    right_arm:
      右手 ??
      (剑 ? (
        <HeldItem t={断曜流光显示[外观].thirdperson_righthand}>
          <断曜流光 外观={外观} 光泽秒={附魔 ? 秒 : undefined} />
        </HeldItem>
      ) : null),
    left_arm: 左手,
  };
  const attach: Record<string, React.ReactNode> = {
    head: (
      <>
        {挂甲('head')}
        {环 && <晋升之环 秒={秒} />}
      </>
    ),
    body: 挂甲('body'),
  };
  for (const 肢 of 肢们) {
    const 块 = 网格.filter((m) => m.骨 === 肢.部件).map((m) => ({ m, 节: 网格分节(m.顶点, 肢.关节.切) }));
    const 层: 弯层[] = [{ 键: '皮', 三角: 皮肤三角[肢.部件], 材质: 皮材质 }, ...块.filter((b) => b.节 === '弯').map((b) => ({ 键: b.m.键, 三角: 甲三角(b.m.顶点), 材质: 甲材质 }))];
    attach[肢.部件] = (
      <弯肢
        切={肢.关节.切}
        铰z={肢.关节.铰z}
        角={(肢.号 * (pose[肢.角] ?? 0) * Math.PI) / 180}
        层={层}
        上节={块.filter((b) => b.节 === '上').map((b) => 甲(b.m))}
        下节={
          <>
            {块.filter((b) => b.节 === '下').map((b) => 甲(b.m))}
            {手里[肢.部件]}
          </>
        }
      />
    );
  }
  const 部件 = 改部件 ? 改部件(steveParts(pose)) : steveParts(pose);
  return (
    <group matrix={关节根矩阵(pose)} matrixAutoUpdate={false}>
      <EntityModel model={无肢模型} tex={STEVE_SKIN} pose={部件} attach={attach} hurt={受伤} />
    </group>
  );
};
