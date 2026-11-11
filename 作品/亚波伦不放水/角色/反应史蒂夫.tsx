// 会做反应的史蒂夫：史蒂夫反应.ts 算出来的姿势交给 装备史蒂夫 画，按状态换手里的东西（剑、弓、盾、图腾），死了照原版倒下。
// 弓、盾、图腾都是原版的（弓照 库/物品/弓.tsx 的 display，盾见 物品/盾.tsx，图腾是 item/generated）；破碎之环是启示录的物品，也是 item/generated。
// 激流姿势（史蒂夫反应.ts）：绕脚底横躺、绕身子长轴打转，外面套旋风（特效/激流旋风.tsx）。和游戏不一样：整个人往上抬 0.3 格（碰撞箱 0.6 高的一半），
// 游戏里贴地转的时候人是从脚底横躺下去的，半个身子埋进地里，片里看着像钻地。
// 倒下：LivingEntityRenderer.setupRotations 在转身之后绕前后轴转，头顶倒向他的左手边（库/特效/原版死亡.tsx）；这里包在最外层，绕脚底转。
// 待迁移（私有资产）：破碎之环是启示录的（保留所有权益），只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import React from 'react';
import * as THREE from 'three';
import { DISPLAY, HeldItem, ItemSprite } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import { BOW_DISPLAY } from '@库/物品/弓.tsx';
import { 盾, 盾显示 } from '../物品/盾.tsx';
import { 激流旋风 } from '../特效/激流旋风.tsx';
import { type 史蒂夫装备, 装备史蒂夫 } from './史蒂夫装备.tsx';
import { type 史蒂夫状态, 史蒂夫反应, type 弓贴图 } from './史蒂夫反应.ts';
import 弓图 from 'asset:贴图/物品/弓/弓';
import 弓拉0图 from 'asset:贴图/物品/弓/弓拉0';
import 弓拉1图 from 'asset:贴图/物品/弓/弓拉1';
import 弓拉2图 from 'asset:贴图/物品/弓/弓拉2';
import 图腾图 from 'asset:贴图/法术/minecraft/item/totem_of_undying';
import 破碎之环图 from 'asset:贴图/物品/破碎之环';

const 弓图表: Record<弓贴图, string> = { 弓: 弓图, 弓拉0: 弓拉0图, 弓拉1: 弓拉1图, 弓拉2: 弓拉2图 };

/** 物品空间里的不死图腾（item/generated） */
export const 不死图腾: React.FC = () => <ItemSprite layers={[{ tex: png(图腾图) }]} />;
/** 物品空间里的弓 */
export const 弓: React.FC<{ 贴图?: 弓贴图 }> = ({ 贴图 = '弓' }) => <ItemSprite layers={[{ tex: png(弓图表[贴图]) }]} />;

/** 状态：这一刻在干什么（史蒂夫反应.ts）；光泽秒：附魔光泽、光环自转的时钟，不给 = 状态.秒；装备：穿什么（右手、左手由状态定，这里给了也不用） */
export const 反应史蒂夫: React.FC<{ 状态: 史蒂夫状态; 光泽秒?: number; 装备?: Omit<史蒂夫装备, '右手' | '左手' | '剑'> }> = ({ 状态, 光泽秒, 装备 }) => {
  const r = 史蒂夫反应(状态);
  if (!r.在) return null;
  const 右手 =
    r.右手 === '弓' ? (
      <HeldItem t={BOW_DISPLAY.thirdperson_righthand}>
        <弓 贴图={r.弓贴图} />
      </HeldItem>
    ) : r.右手 === '环' ? (
      // 破碎之环是 item/generated 的平面物品，拿法同图腾
      <HeldItem t={DISPLAY.generated.thirdperson_righthand}>
        <ItemSprite layers={[{ tex: png(破碎之环图) }]} />
      </HeldItem>
    ) : undefined;
  const 左手 =
    r.左手 === '盾' ? (
      <HeldItem t={盾显示[r.举盾 ? '举盾' : '平时'].thirdperson_lefthand} left>
        <盾 />
      </HeldItem>
    ) : r.左手 === '图腾' ? (
      // generated.json 没写左手，原版拿右手那份镜像
      <HeldItem t={DISPLAY.generated.thirdperson_righthand} left>
        <不死图腾 />
      </HeldItem>
    ) : undefined;
  const 人 = <装备史蒂夫 pose={r.pose} 秒={光泽秒 ?? 状态.秒} 装备={{ ...装备, 剑: r.右手 === '剑', 右手, 左手 }} 改部件={r.改部件} 受伤={r.受伤} />;
  if (r.激流) return <激流中 pose={r.pose} 激流={r.激流}>{人}</激流中>;
  if (r.倒角 === 0) return 人;
  const [x, y, z] = r.pose.loc as [number, number, number];
  const 转身 = ((r.pose.yaw ?? 0) * Math.PI) / 180;
  // 人的本地坐标：正面 +Y、右手 +X；头顶倒向左手边（−X）= 绕 +Y 转 −角
  const 倒 = new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeRotationZ(转身))
    .multiply(new THREE.Matrix4().makeRotationY(-r.倒角))
    .multiply(new THREE.Matrix4().makeRotationZ(-转身))
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
  return (
    <group matrix={倒} matrixAutoUpdate={false}>
      {人}
    </group>
  );
};

/** 激流姿势：人的本地坐标正面 +Y、头顶 +Z。绕右手轴（+X）转 −(90 − 仰角) 头就倒向视线方向，再绕长轴打转（打转放在横躺里面）。权 < 1 是收势：横躺、打转、抬高都按比例收回 */
const 激流中: React.FC<{ pose: { loc: number[]; yaw?: number }; 激流: NonNullable<ReturnType<typeof 史蒂夫反应>['激流']>; children: React.ReactNode }> = ({ pose, 激流: 流, children }) => {
  const [x, y, z] = pose.loc as [number, number, number];
  const 权 = 流.权 ?? 1;
  const 转身 = ((pose.yaw ?? 0) * Math.PI) / 180;
  const 躺 = (-(90 - 流.仰角) * 权 * Math.PI) / 180;
  const 旋 = ((-75 * 流.刻 * 权) * Math.PI) / 180;
  const 躺矩阵 = new THREE.Matrix4()
    .makeTranslation(x, y, z + 0.3 * 权)
    .multiply(new THREE.Matrix4().makeRotationZ(转身))
    .multiply(new THREE.Matrix4().makeRotationX(躺));
  const 人矩阵 = 躺矩阵
    .clone()
    .multiply(new THREE.Matrix4().makeRotationZ(旋))
    .multiply(new THREE.Matrix4().makeRotationZ(-转身))
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
  return (
    <>
      <group matrix={人矩阵} matrixAutoUpdate={false}>
        {children}
      </group>
      {权 >= 1 && (
        <group matrix={躺矩阵} matrixAutoUpdate={false}>
          <激流旋风 刻={流.刻} />
        </group>
      )}
    </>
  );
};
