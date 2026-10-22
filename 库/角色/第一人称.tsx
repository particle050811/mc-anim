// 原版第一人称的手（1.20.1 ItemInHandRenderer、PlayerRenderer.renderHand，javap 核过）：手里有东西时只画物品，空手才画手臂；
// 右键挥一下 6 刻；手里换了东西，旧的先降下去，降到底才换成新的，再按攻击冷却升上来。
// 手画在单独一张透明画布里，叠在世界画布上面：相机固定竖直视角 70°（GameRenderer.getFov 手那一遍不跟 FOV 设置、不跟拉近走），
// 不接世界的阴影、雾和 ScreenAo，也不会被墙挡住。站着不动、视角不转时原版的手不晃，走路晃动、受伤抖动这里不做。
// 只做主手在右的右手；要左手就把下面各处的 i（右 1、左 −1）取反、物品显示变换传 left。
// 画布里的世界坐标就是原版手那一遍的视图坐标：相机在原点朝 −Z，Y 朝上、X 朝右，单位格。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React, { createContext } from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { ItemDisplay, type ItemTransform } from '../../engine/model/物品贴图.tsx';

/** client 1.20.1 item/generated.json 的 firstperson_righthand。
 *  不加进 物品贴图.tsx 的 DISPLAY：改那个模块，import 它的段全部过期 */
export const FIRSTPERSON_GENERATED: ItemTransform = { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] };

/** 手那一遍的竖直视角（度）和近裁剪面（格），照 GameRenderer.renderItemInHand */
export const HAND_FOV = 70;
export const HAND_NEAR = 0.05;

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const RX = (deg: number) => new THREE.Matrix4().makeRotationX(rad(deg));
const RY = (deg: number) => new THREE.Matrix4().makeRotationY(rad(deg));
const RZ = (deg: number) => new THREE.Matrix4().makeRotationZ(rad(deg));
const chain = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4());

/** 拿着东西时物品的变换：renderArmWithItem 普通物品那一支（挥手平移 → applyItemArmTransform → applyItemArmAttackTransform），
 *  外面再套物品的 firstperson 显示变换。swing：挥手进度 0..1（getAttackAnim）；equip：原版的 equippedProgress，0 = 举到位、1 = 完全放下 */
export const itemInHandMatrix = (swing: number, equip: number) => {
  const r = Math.sqrt(swing);
  const a = Math.sin(swing * swing * Math.PI);
  const b = Math.sin(r * Math.PI);
  return chain(
    T(-0.4 * b, 0.2 * Math.sin(r * 2 * Math.PI), -0.2 * Math.sin(swing * Math.PI)),
    T(0.56, -0.52 - 0.6 * equip, -0.72),
    RY(45 - 20 * a),
    RZ(-20 * b),
    RX(-80 * b),
    RY(-45),
  );
};

/** 空手时原版右臂部件的坐标系（renderPlayerArm → renderHand → ModelPart），单位像素：
 *  肩关节转轴为原点，手臂沿 +Y 往下（实体模型坐标 y 朝下）、面朝 −Z，宽手臂的方块占 x −3..1、y −2..10、z −2..2 */
export const playerArmMatrix = (swing: number, equip: number) => {
  const r = Math.sqrt(swing);
  const a = Math.sin(swing * swing * Math.PI);
  const b = Math.sin(r * Math.PI);
  return chain(
    T(0.64 - 0.3 * b, -0.6 - 0.6 * equip + 0.4 * Math.sin(r * 2 * Math.PI), -0.72 - 0.4 * Math.sin(swing * Math.PI)),
    RY(45),
    RY(70 * b),
    RZ(-20 * a),
    T(-1, 3.6, 3.5),
    RZ(120),
    RX(200),
    RY(-135),
    T(5.6, 0, 0),
    // ModelPart：右臂 PartPose 在 (−5, 2, 0)；renderHand 调 setupAnim(0,…)，bobModelPart 给 zRot 加 0.1 弧度，xRot 随后清零
    T(-5 / 16, 2 / 16, 0),
    new THREE.Matrix4().makeRotationZ(0.1),
    new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16),
  );
};

/** 空手时 arm 插槽的坐标系（playerArmMatrix：原版右臂部件坐标 → 画布）。手臂要按画布坐标算东西时读它（李樱的裁剪面） */
export const ArmFrame = createContext<THREE.Matrix4>(new THREE.Matrix4());

/** held：手里的物品，物品坐标（中心在原点，见 物品贴图.tsx），比如 <ItemSprite/>；为空时画 arm（空手的手臂，原版右臂部件坐标，单位像素）。
 *  display：物品的 firstperson 显示变换，平面物品用默认的 FIRSTPERSON_GENERATED */
export const FirstPersonHand: React.FC<{ held: React.ReactNode; arm?: React.ReactNode; swing: number; equip: number; display?: ItemTransform }> = ({
  held,
  arm,
  swing,
  equip,
  display = FIRSTPERSON_GENERATED,
}) => {
  if (held)
    return (
      <group matrix={itemInHandMatrix(swing, equip)} matrixAutoUpdate={false}>
        <ItemDisplay t={display}>{held}</ItemDisplay>
      </group>
    );
  if (!arm) return null;
  const frame = playerArmMatrix(swing, equip);
  return (
    <ArmFrame.Provider value={frame}>
      <group matrix={frame} matrixAutoUpdate={false}>
        {arm}
      </group>
    </ArmFrame.Provider>
  );
};

// ---------- 按刻推挥手和换手 ----------

/** 手里的东西：物品的键（只用来比是不是同一件），null = 空手 */
export type HandItem = string | null;
export type HandScript = {
  /** 开头手里拿的：已经举到位、冷却已满 */
  start: HandItem;
  /** 第几刻右键（LivingEntity.swing），整数 */
  swings?: readonly number[];
  /** 第几刻手里换成什么（客户端收到物品栏更新的那一刻），整数 */
  changes?: readonly { tick: number; to: HandItem }[];
  /** 攻击冷却（刻）= 20 ÷ 攻击速度；空手和蛋糕这类不是武器的都是 5 */
  cooldown?: number;
};
/** item：这一刻画的东西（换手降到底之前还是旧的）；swing、equip 同 FirstPersonHand */
export type HandState = { item: HandItem; swing: number; equip: number };

/** 第 tick 刻（可带小数，小数部分是两刻之间的 partialTick）手的样子：照原版逐刻模拟，再像渲染时那样在上一刻和这一刻之间插值，
 *  所以挥手要到右键后 1 刻才看得出动。一刻里的顺序照 Minecraft.tick：先处理右键，再 ItemInHandRenderer.tick，最后玩家 tick */
export const handTimeline = (tick: number, script: HandScript): HandState => {
  const swings = script.swings ?? [];
  const changes = script.changes ?? [];
  const cooldown = script.cooldown ?? 5;
  const ticks = [...swings, ...changes.map((c) => c.tick)];
  for (const k of ticks) if (!Number.isInteger(k)) throw new Error(`handTimeline 的事件要落在整数刻上，给的是 ${k}`);
  const now = Math.floor(tick);
  const partial = tick - now;
  let actual = script.start; // 玩家手里真正的东西
  let shown = script.start; // ItemInHandRenderer 正在画的
  let last = script.start; // Player.lastItemInMainHand
  let height = 1;
  let oHeight = 1;
  let strength = cooldown; // attackStrengthTicker，开头已经满了
  let swinging = false;
  let swingTime = 0;
  let attack = 0;
  let oAttack = 0;
  for (let k = ticks.length ? Math.min(...ticks) : now + 1; k <= now; k++) {
    if (swings.includes(k) && (!swinging || swingTime >= 3 || swingTime < 0)) {
      swingTime = -1;
      swinging = true;
    }
    for (const c of changes) if (c.tick === k) actual = c.to;
    // ItemInHandRenderer.tick：换了东西目标是 0，没换目标是 冷却³；每刻最多动 0.4；降到 0.1 以下才换成新的
    oHeight = height;
    const ready = Math.min(1, Math.max(0, (strength + 1) / cooldown));
    height += Math.min(0.4, Math.max(-0.4, (shown !== actual ? 0 : ready ** 3) - height));
    if (height < 0.1) shown = actual;
    // 玩家 tick：LivingEntity.updateSwingTime（6 刻一挥），然后 Player.tick 里攻击冷却加一、换了东西就清零
    oAttack = attack;
    if (swinging) {
      swingTime++;
      if (swingTime >= 6) {
        swingTime = 0;
        swinging = false;
      }
    } else swingTime = 0;
    attack = swingTime / 6;
    strength++;
    if (actual !== last) {
      strength = 0;
      last = actual;
    }
  }
  const dAttack = attack - oAttack;
  return {
    item: shown,
    swing: oAttack + (dAttack < 0 ? dAttack + 1 : dAttack) * partial,
    equip: 1 - (oHeight + (height - oHeight) * partial),
  };
};

// ---------- 手画布 ----------

/** 原版朝向（度）：yRot 0 朝南、180 朝北，xRot 正 = 低头。眼、看 用场景坐标（Z 朝上：x 东、y 北、z 上） */
export const viewAngles = (eye: V3, target: V3) => {
  const [mx, my, mz] = [target[0] - eye[0], target[2] - eye[2], eye[1] - target[1]];
  return { yRot: (Math.atan2(-mx, mz) * 180) / Math.PI, xRot: (Math.atan2(-my, Math.hypot(mx, mz)) * 180) / Math.PI };
};

// 原版实体光照（Lighting.setupLevel，原版世界坐标 Y 朝上、+Z 朝南）：两盏固定在世界里的方向光各 0.6，加 0.4 的环境光；
// 着色器里把和夹到 1 以内，这里不夹。灯光强度按 three 的物理单位乘 π。方向跟着玩家朝向转进视图坐标，俯仰、偏航变了手上的明暗跟着变
const LIGHTS = [new THREE.Vector3(0.2, 1, -0.7).normalize(), new THREE.Vector3(-0.2, 1, 0.7).normalize()];

const HandCamera: React.FC<{ fov: number }> = ({ fov }) => {
  const { camera, gl } = useThree();
  // 和世界画布一样用 NeutralToneMapping：李樱的顶点色是照它预先提亮的
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = fov;
  cam.near = HAND_NEAR;
  cam.far = 16;
  cam.position.set(0, 0, 0);
  cam.rotation.set(0, 0, 0);
  cam.up.set(0, 1, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

/** 透明的手画布，叠在世界画布上（默认贴页面左上角）。view：玩家朝向（viewAngles），只影响灯的方向；
 *  brightness：玩家所在格子的亮度（原版光照贴图乘在最后），对着屋里调；fov 只给核对时放宽了看画面外头用 */
export const FirstPersonCanvas: React.FC<{
  width: number;
  height: number;
  view?: { yRot: number; xRot: number };
  brightness?: number;
  fov?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ width, height, view = { yRot: 180, xRot: 0 }, brightness = 1, fov = HAND_FOV, style, children }) => {
  const toView = RX(view.xRot).multiply(RY(view.yRot + 180));
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true, alpha: true }} style={{ position: 'absolute', left: 0, top: 0, ...style }}>
      <HandCamera fov={fov} />
      <ambientLight intensity={0.4 * Math.PI * brightness} />
      {LIGHTS.map((dir, i) => (
        <directionalLight key={i} position={dir.clone().applyMatrix4(toView).toArray()} intensity={0.6 * Math.PI * brightness} />
      ))}
      {children}
    </ThreeCanvas>
  );
};
