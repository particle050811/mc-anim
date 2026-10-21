// 追兵：黄叛（Speed•Bow，弓箭手）、刘心忠（Villager•Magic，法师打扮、用唤魔法术），第六章 6-3、6-4 追李樱的两人。
// 骨架和李樱同一套（骨架.tsx，32 像素高）；外观是 Minecraft 皮肤式贴图方盒（lib/贴图方盒.tsx 的 `TexBox`，1 像素 = 模型 1 像素），里层 + 凸出 0.25～0.5 像素的外层。
// 贴图由 npm run 取材 -- 追兵皮肤（工具/游戏取材/追兵皮肤.py）生成，依据写在脚本开头：
// - 黄叛：玩家体型（宽手臂，1.875 格），贴图 追兵.贴图/黄叛.png 是 64×64 皮肤，按 设定/角色/黄叛/黄叛三视图.png 取色；背箭袋（黄叛箭袋.png，插三支 模型/物品/箭.tsx），左手握 模型/物品/弓.tsx。
// - 刘心忠：村民体型（头 8×10×8、长鼻子，身高约 1.95 格）。头和鼻子照抄原版村民贴图，兜帽长袍等按 设定/角色/刘心忠/刘心忠三视图.png 取色；法杖用铁魔法的匠师之杖（模型/物品/匠师之杖.tsx，用户 10-12 定）。
// 坐标和李樱一样：原点在脚底，面朝 +Y，右手在 +X。插槽里 1 = 1 像素。
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { TexBox } from '../../engine/model/贴图方盒.tsx';
import { png, type Png } from '../../engine/model/贴图.ts';
import { Arrow } from '../物品/箭.tsx';
import { HeldBow, type BowTexture } from '../物品/弓.tsx';
import { ArtificerCane, ARTIFICER_CANE_GRIP_Y } from '../物品/匠师之杖.tsx';
import { bladeInHand, Figure, type FigurePose, standPose, handMatrix } from './骨架.tsx';
import { riderFeet, VANILLA_RIDE } from '../生物/幽灵马.tsx';
import huangPanPng from 'asset:贴图/角色/追兵/黄叛';
import quiverPng from 'asset:贴图/角色/追兵/黄叛箭袋';
import liuXinzhongPng from 'asset:贴图/角色/追兵/刘心忠';

const HP_TEX = png(huangPanPng);
const QUIVER_TEX = png(quiverPng);
const LX_TEX = png(liuXinzhongPng);

// 皮肤方盒：`TexBox` 的正面朝 -Y、右手在 -X，骨架插槽里正面朝 +Y、右手在 +X，绕 Z 转 180° 对上。
// px = [宽, 高, 深]（像素），uv = 展开图左上角，grow = 外层每边凸出多少像素（原版帽子层 0.5、其余外层 0.25）
// 受伤变红（7-3-3 刘心忠被音波打中用）：外面包一层 `HurtContext` = true，里面的皮肤方盒照原版变红（`TexBox` 的 hurt）
export const HurtContext = React.createContext(false);
const Skin: React.FC<{ tex: Png; px: [number, number, number]; uv: [number, number]; p: V3; grow?: number; emissive?: number }> = ({ tex, px, uv, p: pos, grow = 0, emissive }) => {
  const hurt = React.useContext(HurtContext);
  return (
    <group position={pos} rotation={[0, 0, Math.PI]}>
      <TexBox tex={tex} px={px} uv={uv} s={[px[0] + 2 * grow, px[2] + 2 * grow, px[1] + 2 * grow]} alphaTest={grow > 0 ? 0.5 : 0} emissive={emissive} hurt={hurt} />
    </group>
  );
};

// ---------- 黄叛 ----------
// 原版 64×64 皮肤的展开图位置（里层、外层）
const HP_UV = {
  head: [0, 0], hat: [32, 0], body: [16, 16], jacket: [16, 32],
  armR: [40, 16], sleeveR: [40, 32], armL: [32, 48], sleeveL: [48, 48],
  legR: [0, 16], pantsR: [0, 32], legL: [16, 48], pantsL: [0, 48],
} as const satisfies Record<string, [number, number]>;
const hp = (k: keyof typeof HP_UV, px: [number, number, number], p: V3, grow = 0) => <Skin tex={HP_TEX} px={px} uv={HP_UV[k]} p={p} grow={grow} />;

// 箭袋：斜挎在背上（3×12×2 像素），袋口插三支原版箭（缩到 0.6 倍才放得进袋口）
const ARROW_DOWN: V3 = [0, 0, -1];
const Quiver: React.FC = () => (
  <group position={[1.5, -2.6, 18]} rotation={[0, 0.5, 0]}>
    <Skin tex={QUIVER_TEX} px={[3, 12, 2]} uv={[0, 0]} p={[0, 0, 0]} />
    <group scale={16 * 0.6}>
      {([[-0.03, 0.02, 0.06], [0.03, -0.02, 0.09], [0.0, 0.0, 0.12]] as V3[]).map((q, i) => (
        <Arrow key={i} p={[q[0], q[1], 6 / (16 * 0.6) - 0.675 + q[2]]} dir={ARROW_DOWN} />
      ))}
    </group>
  </group>
);

// 弓：用哪张弓的贴图（拉弓的三档自带搭着的箭，见 弓.tsx 的 弓态）
export const HuangPan: React.FC<{ pose: FigurePose; 弓?: BowTexture }> = ({ pose, 弓: bowTex = '弓' }) => (
  <Figure
    pose={pose}
    height={1.875}
    head={
      <>
        {hp('head', [8, 8, 8], [0, 0, 4])}
        {hp('hat', [8, 8, 8], [0, 0, 4], 0.5)}
      </>
    }
    torso={
      <>
        {hp('body', [8, 12, 4], [0, 0, 18])}
        {hp('jacket', [8, 12, 4], [0, 0, 18], 0.25)}
        <Quiver />
      </>
    }
    armR={
      <>
        {hp('armR', [4, 12, 4], [0, 0, -4])}
        {hp('sleeveR', [4, 12, 4], [0, 0, -4], 0.25)}
      </>
    }
    armL={
      <>
        {hp('armL', [4, 12, 4], [0, 0, -4])}
        {hp('sleeveL', [4, 12, 4], [0, 0, -4], 0.25)}
      </>
    }
    legR={
      <>
        {hp('legR', [4, 12, 4], [0, 0, -6])}
        {hp('pantsR', [4, 12, 4], [0, 0, -6], 0.25)}
      </>
    }
    legL={
      <>
        {hp('legL', [4, 12, 4], [0, 0, -6])}
        {hp('pantsL', [4, 12, 4], [0, 0, -6], 0.25)}
      </>
    }
    // 左手握弓：照原版第三人称左手拿物品（ItemInHandLayer + bow.json 的 thirdperson_lefthand），弓身怎么摆全由手臂姿势定
    handL={<HeldBow texture={bowTex} />}
  />
);

// 拉弓（6-4-3 风矢）：照原版 `HumanoidModel.setupAnim` 的 BOW_AND_ARROW 摆两臂：拿弓的手 yRot = 0.1 + 头的左右、另一只手 yRot = −0.1 − 0.4 + 头的左右，两臂 xRot = −π/2 + 头的俯仰。
//   原版右手持弓，黄叛左手持弓，左右镜像；原版 yRot 正 = 往右，这里 `armYaw` 正 = 往左，号反过来。
// draw 0～1：从垂手站着过渡到拉满；头的转向、俯仰按度给（headYaw 正 = 往左、headPitch 负 = 低头，同 `FigurePose`）
export const drawBowPose = (loc: V3, yaw: number, headYaw: number, headPitch: number, draw = 1): FigurePose => {
  const k = Math.min(1, Math.max(0, draw));
  const deg = 180 / Math.PI;
  return {
    ...standPose(loc),
    yaw,
    headYaw,
    headPitch,
    armL: (90 + headPitch) * k,
    armLYaw: (-0.1 * deg + headYaw) * k,
    armLRoll: 0,
    armR: (90 + headPitch) * k,
    armRYaw: (0.5 * deg + headYaw) * k,
    armRRoll: 0,
  };
};

// ---------- 刘心忠 ----------
// 贴图布局（128×64），和 工具/游戏取材/追兵皮肤.py 的 LX_UV 一致。头、鼻子在原版 VillagerModel 的位置（0,0、24,0）
const LX_UV = {
  head: [0, 0], nose: [24, 0], hood: [32, 0], body: [64, 0], skirt: [92, 0], staff: [124, 0],
  armR: [0, 20], armL: [16, 20], legR: [32, 20], legL: [48, 20], sleeveR: [64, 20], sleeveL: [80, 20], belt: [96, 20],
  gem: [0, 40], collar: [8, 40], prong: [24, 40],
} as const satisfies Record<string, [number, number]>;
const lx = (k: keyof typeof LX_UV, px: [number, number, number], p: V3, grow = 0, emissive?: number) => (
  <Skin tex={LX_TEX} px={px} uv={LX_UV[k]} p={p} grow={grow} emissive={emissive} />
);

// 右手拿匠师之杖（模型/物品/匠师之杖.tsx，握持点在原点、杖头沿插槽 +Z）。杖头一直朝上、不倒拿：骨架.tsx 的 `bladeInHand` 按每帧的肩、肘、扭转倒算手腕，杖在身体坐标系的方向由这里定（6-3、6-4 所有镜头共用）。
//   用户 10-12 两次指出杖拿法不对（倒拿；杖身竖直时贴右臂，走路手后摆整根杖穿过胳膊、肩膀从兜帽后冒出来），所以改成 `liuHoldStaff` + `liuStaffQuat`：
//   右臂不往后甩、手不往身前收、杖身往前倾 30°（杖头在前上方离开胳膊和身子；举过头顶时反过来往后仰）。
// 杖往前倾多少度（身体坐标系里杖头往前为正）：手臂在腰以下（armR ≤ 40）时 30°；往上举慢慢收到竖直（armR 90）；举过头顶（armR 140 以上）后仰 5°。
//   30° 是量出来的：杖和胳膊夹角要到 40° 左右才离开胳膊（半宽 2、杖半粗 0.5），`liuHoldStaff` 把右臂最往后压在 10°～20°，30 + 10 = 40。
//   举过头顶时再前倾杖尾会戳回胳膊和头（6-3-10），仰多了杖身又从头顶横过（6-3-8）；工具/追兵/持杖核对.ts 扫过 0～30° 和杖侧 −12～8°，后仰 5°、杖侧 0 最好。
const smoothstep = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
// 身子前倾（跑步 pitch −15～−18°）时，腰以下那 30° 按世界竖直算（扣掉身子前倾，不然杖斜到 45°，俯拍像端长枪）；举起来后跟着身子走
export const liuStaffLean = (armR: number, pitch = 0) => (30 + pitch) * (1 - smoothstep((armR - 40) / 50)) - 5 * smoothstep((armR - 90) / 50);
// 拿着杖的右臂（`LiuXinzhong` 每帧先过这一道，别的骨骼不动，各段编排不用改）：
// - 不往后甩：走跑的摆臂（`walkPose`、`runPose`）右臂会后摆到 −36°、−50°，杖再怎么前倾也贴着胳膊。拄杖走路的人拿杖手基本不摆，所以 armR 低于 `armFloor` 的部分只留 15%，往前摆、举杖照旧。
//   `armFloor` = 20° 减身子前倾（站着 20°，跑步前倾 15° 时 35°），身子前倾时杖在身体坐标系倾得少（见 `liuStaffLean`），胳膊得更往前才拉得开那 40°。
// - 手不往身前收：手臂在腰以下时 roll 最多 6°（6-4-7 挥手开头收尾 roll 收到 15°，杖尾会戳进下摆和大腿）；举到 80° 以上不管。
// - 不弯肘：刘心忠胳膊是整根 4×4×12 方盒（没有前臂部件），弯肘只会把握点挪到胳膊外，杖悬空飘着，所以拿杖这只手一律不弯肘。
export const liuHoldStaff = (pose: FigurePose): FigurePose => {
  const armFloor = 20 - Math.min(0, pose.pitch);
  const armR = pose.armR < armFloor ? armFloor - (armFloor - pose.armR) * 0.15 : pose.armR;
  const belowWaist = 1 - smoothstep((armR - 40) / 40);
  const armRRoll = pose.armRRoll > 6 ? pose.armRRoll - (pose.armRRoll - 6) * belowWaist : pose.armRRoll;
  return { ...pose, armR, armRRoll, elbowR: 0 };
};
// 刘心忠的身高（格），`Figure` 和 `liuStaffQuat` 共用
export const liuHeight = 1.95;
// 杖尖在握点下面多少像素（匠师之杖 y −15 是杖尖）
const staffTailPx = ARTIFICER_CANE_GRIP_Y + 15;
// 杖尖最低到哪（格，相对脚底）：0 = 刚好点地；低于 `tipTolerance`（半厘米内算点地）才再往前倾
const tipMargin = 0;
const tipTolerance = -0.005;
// 右手插槽里杖的朝向（四元数），pose 是过了 `liuHoldStaff` 的：先按 `liuStaffLean` 摆（杖侧 = 杖头往右手外侧偏出前后竖直面多少度，负 = 往头顶收）；杖尖扎进地里（跑步前倾、手比垂手低）就再往前倾到刚好点地。脚底按 pose.loc 高度算
export const liuStaffQuat = (pose: FigurePose, staffSide = 0): THREE.Quaternion => {
  const handMat = handMatrix(pose, liuHeight, 'R');
  const tipWorld = (q: THREE.Quaternion) => new THREE.Vector3(0, 0, -staffTailPx).applyQuaternion(q).applyMatrix4(handMat);
  // bladeInHand 的角：0 = 朝上、270 = 朝前，往前倾是负的
  const staffQuatAt = (lean: number) => bladeInHand(pose, -lean, staffSide, 'R');
  const baseLean = liuStaffLean(pose.armR, pose.pitch);
  const q0 = staffQuatAt(baseLean);
  const tipHeight = (q: THREE.Quaternion) => tipWorld(q).z - pose.loc[2];
  if (tipHeight(q0) >= tipTolerance) return q0;
  let lo = baseLean;
  let hi = 90;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (tipHeight(staffQuatAt(mid)) >= tipMargin) hi = mid;
    else lo = mid;
  }
  return staffQuatAt(hi);
};
// 左手：左手插槽里拿的东西（6-3-10 的铁链，模型/物品/铁链.tsx 的 `HeldChain`），不给就空着。
// pose 是编排给的原姿势，右臂先过 `liuHoldStaff`；右手给了别的东西（7-4-3 写报告时拿羽毛笔、成书）就不拿杖，右臂照编排原样。受伤：true = 原版受伤变红
type LiuXinzhongProps = { pose: FigurePose; leftHand?: React.ReactNode; 右手?: React.ReactNode; staffSide?: number; 受伤?: boolean };
export const LiuXinzhong: React.FC<LiuXinzhongProps> = (p) =>
  p.受伤 ? (
    <HurtContext.Provider value>
      <LiuXinzhongBody {...p} pose={p.右手 ? p.pose : liuHoldStaff(p.pose)} />
    </HurtContext.Provider>
  ) : (
    <LiuXinzhongBody {...p} pose={p.右手 ? p.pose : liuHoldStaff(p.pose)} />
  );
const LiuXinzhongBody: React.FC<LiuXinzhongProps> = ({ pose, leftHand, 右手: rightHand, staffSide }) => (
  <Figure
    pose={pose}
    height={liuHeight}
    head={
      <>
        {/* 村民的头 8 宽、10 高，鼻子 2×4×2 往前伸 2 像素（下沿和下巴齐，照设定图）；外面套一圈兜帽（凸出 0.5，正面开口露出脸） */}
        {lx('head', [8, 10, 8], [0, 0, 5])}
        {lx('nose', [2, 4, 2], [0, 5, 2])}
        {lx('hood', [8, 10, 8], [0, 0, 5], 0.5)}
      </>
    }
    torso={
      <>
        {/* 长袍：身子 8×12×6，腰带在腰上一圈，下摆 8×8×6 罩住大腿（底边金边） */}
        {lx('body', [8, 12, 6], [0, 0, 18])}
        {lx('belt', [8, 1, 6], [0, 0, 12.5], 0.3)}
        {lx('skirt', [8, 8, 6], [0, 0, 8], 0.25)}
      </>
    }
    armR={
      <>
        {lx('armR', [4, 12, 4], [0, 0, -4])}
        {lx('sleeveR', [4, 12, 4], [0, 0, -4], 0.3)}
      </>
    }
    armL={
      <>
        {lx('armL', [4, 12, 4], [0, 0, -4])}
        {lx('sleeveL', [4, 12, 4], [0, 0, -4], 0.3)}
      </>
    }
    legR={lx('legR', [4, 12, 4], [0, 0, -6])}
    legL={lx('legL', [4, 12, 4], [0, 0, -6])}
    handR={
      rightHand ?? (
        <group quaternion={liuStaffQuat(pose, staffSide)}>
          <ArtificerCane />
        </group>
      )
    }
    handL={leftHand}
  />
);

// 走 / 跑的步态（两人共用）：phase 是走过的距离换算的相位（弧度），amp 0～1
export const walkPose = (loc: V3, yaw: number, phase: number, amp: number, lean = 0): FigurePose => {
  const sw = 45 * Math.sin(phase) * amp;
  return {
    loc,
    pitch: -lean,
    squash: 1,
    headPitch: lean * 0.6,
    headYaw: 0,
    legR: sw,
    legL: -sw,
    kneeR: Math.max(0, -sw) * 0.8 + 10 * amp,
    kneeL: Math.max(0, sw) * 0.8 + 10 * amp,
    armR: -sw * 0.8,
    armRRoll: 4,
    armL: sw * 0.8,
    armLRoll: 4,
    yaw,
  };
};

// 骑马坐姿（7-4-1 加）：照原版 `HumanoidModel.setupAnim` 的 riding——两腿 xRot −81°、yRot ±18°（骨架.tsx 的 `legRYaw` / `legLYaw`），两臂 xRot −36°（去拉缰绳），身子头不动。
// 脚底 = 幽灵马.tsx 的 `riderFeet`（马脚底 + 骑乘高 0.85 格，马起跳人立时往后上挪），ground 0（原版骑马模型不下沉）。
// horse：马脚底（场景坐标）、yaw（同 `FigurePose`，正 = 往左）、人立量（各镜头 horseState 用 `steedRear` 算的）。o 里的字段盖在原版姿势上（前倾、回头、举杖等由编排加）。
export const ridePose = (horse: { p: V3; yaw: number; 人立?: { 骑手: number } }, o: Partial<FigurePose> = {}): FigurePose => ({
  ...standPose(riderFeet(horse.p, horse.yaw, horse.人立?.骑手 ?? 0)),
  ground: 0,
  yaw: horse.yaw,
  legR: -VANILLA_RIDE.legXRot,
  legL: -VANILLA_RIDE.legXRot,
  legRYaw: VANILLA_RIDE.legYRot,
  legLYaw: VANILLA_RIDE.legYRot,
  armR: -VANILLA_RIDE.armXRot,
  armL: -VANILLA_RIDE.armXRot,
  armRRoll: 0,
  armLRoll: 0,
  ...o,
});
