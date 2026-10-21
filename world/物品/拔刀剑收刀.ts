// 6-1-2 收刀：刀由鞘约束着插进去（用户 10-13 放大看到原来的收刀是刀横着穿过身体、从侧面穿进鞘里）。
// 原收刀（史诗战斗 uchigatana_scrap 关键帧）刀和鞘轴线没对上；方块人手臂只有 9 像素、握持点到刀尖 21 像素，照真人把刀尖递到鞘口够不着。
// 照用户给的参考（AI 生成的收刀）分四步：
// 1. 迎刀：左手把鞘绕腰上挂点转成往左后方横出去，鞘口朝右、往前带一点、顺轴线往后抽一点，鞘口离右手正好一把刀长；
// 2. 找鞘口：刀从甩刀收势（新版先横在身体右侧停一下）经身前翻过来，刀尖落进鞘口、刀身顺着鞘轴线横在肚子前；
// 3. 入鞘：刀沿鞘的弧线（同一个弯度）滑进去直到护手贴住鞘口；最后一截手够不着，右手顺着刀柄滑到柄头推进去；
// 4. 松手：鞘连着刀转回腰上原角度，右手松开回到按刀（原版入鞘后马上松，新版按着刀柄说一阵台词再松）。
// 找鞘口、入鞘两段刀由鞘带着画（位置精确），两手用两骨解析 IK 去追刀柄、鞘口。
// 全部在髋坐标系（骨架 hip 插槽：脚底为原点、腰在 z=12、单位像素，跟着转身和前倾、不跟胸扭转）里算；纯函数，只看剧情帧和当帧姿态。
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { bladeInHand, FigurePose, handMatrix, hipMatrix } from '../角色/骨架.tsx';
import { bladeCenterY, KATANA_DIMS as 尺, SHEATH_HANG_QUAT, SHEATHED_BLADE, sheathCenterY } from './拔刀剑.tsx';

const ss = (x: number) => { const clamped = Math.min(1, Math.max(0, x)); return clamped * clamped * (3 - 2 * clamped); };
const vec3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const figureHeight = 1.875;

// 节奏（剧情帧）：起 = 收刀开始（刀从甩刀收势的姿势动起来）；侧 = 刀横到身体右侧、停住的起止（只有新版有）；对口 = 刀尖进鞘口；
// 入鞘 = 护手贴住鞘口（放收刀声）；松 = 右手松开、鞘转回腰上的起止
export type SheathTiming = { start: number; side?: [number, number]; tipIn: number; sheathed: number; release: [number, number] };
// 原版：时间照原来的 uchigatana_scrap（剧情帧 139 刀从前上方落下、147 入鞘，下一帧娜迦自毁，见 编排.ts 的 `sheathConstraint`、`DIS`），只把刀和鞘对上
export const originalTiming: SheathTiming = { start: 139, tipIn: 142.5, sheathed: 147, release: [147, 153] };

const sheathMount = vec3(-5.3, 1.6, 12.6);
// 迎刀：鞘口挪到这里（往前 2.8、往上 0.8，右手按到柄头时小臂才不贴进肚子）、再顺轴线往鞘尾抽 1.5（缩短右手要够的距离），
// 鞘口朝 `receiveDir`（从鞘口指向右手）。右手在 `tipInGrip`（右肩右前下方，胸扭转 15～25° 时伸直能到）
const receiveMouth = vec3(-5.3, 4.4, 13.4);
const tipInGrip = vec3(12.5, 6.5, 19.5);
const receiveDir = tipInGrip.clone().sub(receiveMouth).normalize();
const pullBack = 1.5;
// 刀身横在肚子前不碰身体（离胸口最近约 0.3 像素，在对口那帧身体右前角）；鞘尾离地（6-1-2 的实际姿态）迎刀时约 4 像素，鞘从腰上转过来的半路最低、约 3.4 像素。刀和鞘的弯是同一段圆弧
const arcRadius = 尺.arcR;
const bladeLen = 尺.tipZ - 尺.tsubaZ; // 18.6：刀尖在鞘口 → 护手贴鞘口
// 对口那一刻刀尖已进鞘口多少：握点到鞘口差一点不到一把刀长
const tipInDepth = bladeLen + 尺.tsubaZ - receiveMouth.clone().addScaledVector(receiveDir, -pullBack).distanceTo(tipInGrip);
// 新版刀先横在身体右侧（参考的第一拍）：握点在右腰外侧，刀尖朝右、略朝前、水平（世界坐标），刀背朝上
const sideGrip = vec3(11, 0.5, 16);
const sideDir = vec3(1, 0.35, -0.05).normalize();

// 鞘相对挂点的变换（k = 0 挂在腰上 → 1 迎刀）：从佩刀挂法（刃口朝下）走最短转动横到身前，横着时刃口仍朝下、鞘尾往上翘（用户 10-18 画线定），鞘不绕自身轴翻
const sheathXform = (k: number) => {
  const restQuat = SHEATH_HANG_QUAT;
  const restAxis = vec3(0, 0, -1).applyQuaternion(restQuat); // 鞘口朝外的方向（鞘本地 -Z）
  const turnQuat = new THREE.Quaternion().setFromUnitVectors(restAxis, receiveDir);
  const quat = new THREE.Quaternion().slerp(turnQuat, k).multiply(restQuat);
  const offset = receiveMouth.clone().sub(sheathMount).addScaledVector(vec3(0, 0, 1).applyQuaternion(quat), pullBack).multiplyScalar(k);
  return new THREE.Matrix4().compose(offset, quat, vec3(1, 1, 1));
};
// 刀相对鞘：刀离完全入鞘还差 `outLen` 像素（0 = 护手贴鞘口）。完全入鞘 = 拔刀剑.tsx 的 `SHEATHED_BLADE`；往外拉 `outLen` = 绕鞘弧线圆心（鞘本地 (0, R, 0)）转 出/R
const bladeInSheath = (outLen: number) =>
  new THREE.Matrix4()
    .makeTranslation(0, arcRadius, 0)
    .multiply(new THREE.Matrix4().makeRotationX(outLen / arcRadius))
    .multiply(new THREE.Matrix4().makeTranslation(0, -arcRadius, 0))
    .multiply(SHEATHED_BLADE);

// 两骨解析 IK：让握持点（肩下 4 像素到肘、肘下 5 像素）落到 `target`（胸坐标系），肩在 `shoulder`；返回 [前摆角, roll, 肘]，两组解里挑离 `refAngles` 近的。手臂是 Ry(roll)·Rx(前摆)，肘绕 X 往前折；够不着就伸直指过去
const wrap = (a: number, ref: number) => a + 360 * Math.round((ref - a) / 360);
export const solveArm = (shoulder: THREE.Vector3, target: THREE.Vector3, refAngles: [number, number]): [number, number, number] => {
  const toTarget = target.clone().sub(shoulder);
  const dist = Math.min(8.999, Math.max(1.001, toTarget.length()));
  const elbowRad = Math.acos(Math.min(1, Math.max(-1, (dist * dist - 41) / 40)));
  const vy = 5 * Math.sin(elbowRad);
  const vz = -4 - 5 * Math.cos(elbowRad);
  const solve = (flip: number): [number, number] => {
    const roll = Math.atan2(toTarget.x, toTarget.z) + flip;
    const z2 = toTarget.x * Math.sin(roll) + toTarget.z * Math.cos(roll);
    const swingRad = Math.atan2(z2, toTarget.y) - Math.atan2(vz, vy);
    return [wrap((swingRad * 180) / Math.PI, refAngles[0]), wrap((roll * 180) / Math.PI, refAngles[1])];
  };
  const refDiff = (s: [number, number]) => Math.abs(s[0] - refAngles[0]) + Math.abs(s[1] - refAngles[1]);
  const solA = solve(0);
  const solB = solve(Math.PI);
  const best = refDiff(solA) <= refDiff(solB) ? solA : solB;
  return [best[0], best[1], (elbowRad * 180) / Math.PI];
};

const handBladeMat = (pose: FigurePose, blade: number, side: number) =>
  new THREE.Matrix4()
    .copy(hipMatrix(pose, figureHeight))
    .invert()
    .multiply(handMatrix(pose, figureHeight, 'R'))
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(bladeInHand(pose, blade, side)));
const facingQuat = (dir: THREE.Vector3) => {
  const z = dir.clone().normalize();
  const y = vec3(0, 0, 1).addScaledVector(z, -z.z).normalize();
  const x = y.clone().cross(z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
};
// 两个刀位之间：握持点走二次贝塞尔（中间往 鼓 方向鼓出去），朝向分两段球面插值、经过 经（不给就直接插）
const lerpBlade = (fromMat: THREE.Matrix4, toMat: THREE.Matrix4, progress: number, bulge: THREE.Vector3, via?: THREE.Vector3) => {
  const pa = vec3(0, 0, 0).applyMatrix4(fromMat);
  const pb = vec3(0, 0, 0).applyMatrix4(toMat);
  const qa = new THREE.Quaternion().setFromRotationMatrix(fromMat);
  const qb = new THREE.Quaternion().setFromRotationMatrix(toMat);
  let quat: THREE.Quaternion;
  if (via) {
    const qm = new THREE.Quaternion().setFromUnitVectors(vec3(0, 0, 1).applyQuaternion(qb), via).multiply(qb);
    quat = progress < 0.5 ? qa.clone().slerp(qm, progress * 2) : qm.clone().slerp(qb, progress * 2 - 1);
  } else quat = qa.clone().slerp(qb, progress);
  const ctrl = pa.clone().add(pb).multiplyScalar(0.5).add(bulge);
  const pos = pa.clone().multiplyScalar((1 - progress) ** 2).add(ctrl.multiplyScalar(2 * progress * (1 - progress))).add(pb.clone().multiplyScalar(progress * progress));
  return new THREE.Matrix4().compose(pos, quat, vec3(1, 1, 1));
};

export type SheathResult = {
  sheath: THREE.Matrix4; // 鞘相对挂点
  blade?: THREE.Matrix4; // 刀相对鞘（刀由鞘带着画的那几帧）；没有就是刀在手里（照关键帧）或在鞘里
  bladeOut?: boolean; // 收刀这段里刀出没出鞘（盖掉关键帧的出鞘开关）
};

// 某一时刻的约束目标：鞘的变换、刀（髋坐标系，不在手上时没有）、右手握点和左手扶点（髋坐标系）、胸多拧的角度
const targetsAt = (frame: number, timing: SheathTiming, startBlade: THREE.Matrix4, pitch: number) => {
  const k = frame < timing.release[0] ? ss((frame - timing.start) / (timing.tipIn - timing.start)) : 1 - ss((frame - timing.release[0]) / (timing.release[1] - timing.release[0]));
  const sheath = sheathXform(k);
  const sheathInHip = new THREE.Matrix4().makeTranslation(sheathMount.x, sheathMount.y, sheathMount.z).multiply(sheath);
  let bladeInHip: THREE.Matrix4 | undefined;
  if (frame < timing.tipIn) {
    // 对口：刀尖已进鞘口 `tipInDepth`，鞘在迎刀位置（用 k = 1 的鞘算目标，到对口帧正好接上）
    const receiveSheathInHip = new THREE.Matrix4().makeTranslation(sheathMount.x, sheathMount.y, sheathMount.z).multiply(sheathXform(1));
    const tipInBlade = receiveSheathInHip.clone().multiply(bladeInSheath(bladeLen - tipInDepth));
    if (timing.side) {
      // 侧向按世界水平给（弓步前倾时髋坐标系是斜的，按髋坐标系给刀尖会扎地）
      const sideBlade = new THREE.Matrix4().compose(sideGrip, new THREE.Quaternion().setFromAxisAngle(vec3(1, 0, 0), -rad(pitch)).multiply(facingQuat(sideDir)), vec3(1, 1, 1));
      if (frame < timing.side[0]) bladeInHip = lerpBlade(startBlade, sideBlade, ss((frame - timing.start) / (timing.side[0] - timing.start)), vec3(3, 3, 0));
      else if (frame < timing.side[1]) bladeInHip = sideBlade;
      // 从右侧经身前翻过来：刀尖先朝前（按世界略朝上，不扫到弓步前伸的右腿、不戳地），再转到鞘口
      else bladeInHip = lerpBlade(sideBlade, tipInBlade, ss((frame - timing.side[1]) / (timing.tipIn - timing.side[1])), vec3(0, 4, 3), vec3(0, 1, 0.35).normalize().applyAxisAngle(vec3(1, 0, 0), -rad(pitch)));
    } else {
      // 原版：从甩刀收势（刀尖朝右上）经身前翻下来，握持点往右前方鼓出去，刀尖不从头上、身后绕
      bladeInHip = lerpBlade(startBlade, tipInBlade, ss((frame - timing.start) / (timing.tipIn - timing.start)), vec3(3, 6, 0), vec3(0, 1, 0));
    }
  } else if (frame < timing.sheathed) {
    const depth = tipInDepth + (bladeLen - tipInDepth) * ss((frame - timing.tipIn) / (timing.sheathed - timing.tipIn));
    bladeInHip = sheathInHip.clone().multiply(bladeInSheath(bladeLen - depth));
  }
  // 握持点离鞘口沿刀不到 6.4 像素时右手够不着，顺着刀柄往柄头滑（最多 3.3）；入鞘后按在柄头上
  const insertDepth = frame < timing.tipIn ? 0 : frame < timing.sheathed ? tipInDepth + (bladeLen - tipInDepth) * ss((frame - timing.tipIn) / (timing.sheathed - timing.tipIn)) : bladeLen;
  const gripSlide = Math.min(3.3, Math.max(0, 6.4 - (bladeLen + 尺.tsubaZ - insertDepth)));
  const gripPt = vec3(0, 0, -gripSlide).applyMatrix4(bladeInHip ?? sheathInHip.clone().multiply(bladeInSheath(0)));
  // 左手扶鞘：握在鞘口往里 3.3 像素、偏刀背一侧的鞘身上（握鞘口上刀尖进口会穿过手）
  const holdPt = vec3(0, 0.8, 3.3).applyMatrix4(sheathInHip);
  // 入鞘时胸往左多拧 25°（右肩送到前面）：不拧的话右臂伸直过去贴着肚子，小臂会插进身体
  const extraTwist = 25 * ss((frame - (timing.tipIn - 3)) / 3) * (1 - ss((frame - timing.release[0]) / (timing.release[1] - timing.release[0])));
  return { sheath: sheath, sheathInHip: sheathInHip, bladeInHip: bladeInHip, grip: gripPt, holdPt: holdPt, twist: extraTwist };
};

// pose：当帧姿态（会改手臂、胸扭转）；原姿：同一版动作不带收刀约束的姿态（[pose, blade, bladeSide]）
// IK 两组解在手经过肩膀高度时会换边，逐帧各挑各的会一帧翻过去，所以从收刀起点每半帧解一次、每次挑离上一次近的，一路接到当帧（只看帧号，确定性）
export const sheathConstraint = (pose: FigurePose, frame: number, timing: SheathTiming, rawPose: (t: number) => [FigurePose, number, number]): SheathResult => {
  if (frame <= timing.start || frame >= timing.release[1]) return { sheath: sheathXform(0) };
  const [p0, b0, s0] = rawPose(timing.start);
  const startBlade = handBladeMat(p0, b0, s0);
  let refR: [number, number] = [p0.armR, p0.armRRoll];
  let refL: [number, number] = [p0.armL, -p0.armLRoll];
  const solveAt = (framePose: FigurePose, t: number) => {
    const targets = targetsAt(t, timing, startBlade, framePose.pitch);
    const chestInv = new THREE.Matrix4().makeRotationZ(rad((framePose.twist ?? 0) + targets.twist)).invert();
    const rightSol = solveArm(vec3(6, 0, 22), targets.grip.clone().applyMatrix4(chestInv), refR);
    const leftSol = solveArm(vec3(-6, 0, 22), targets.holdPt.clone().applyMatrix4(chestInv), refL);
    refR = [rightSol[0], rightSol[1]];
    refL = [leftSol[0], leftSol[1]];
    return { g: targets, R: rightSol, L: leftSol };
  };
  for (let t = timing.start + 0.5; t < frame; t += 0.5) solveAt(rawPose(t)[0], t);
  const { g: targets, R: rightSol, L: leftSol } = solveAt(pose, frame);
  pose.twist = (pose.twist ?? 0) + targets.twist;
  pose.headYaw -= targets.twist;
  const wR = frame < timing.release[0] ? 1 : 1 - ss((frame - timing.release[0]) / (timing.release[1] - timing.release[0] - 1));
  pose.armR += (rightSol[0] - pose.armR) * wR;
  pose.armRRoll += (rightSol[1] - pose.armRRoll) * wR;
  pose.elbowR = (pose.elbowR ?? 0) + (rightSol[2] - (pose.elbowR ?? 0)) * wR;
  // 左手扶鞘（左臂的 roll 在骨架里取反：Figure 的 joint 里是 -armLRoll）
  const wL = frame < timing.release[0] ? ss((frame - timing.start) / (timing.tipIn - timing.start)) : 1 - ss((frame - timing.release[0]) / (timing.release[1] - timing.release[0] - 1));
  pose.armL += (leftSol[0] - pose.armL) * wL;
  pose.armLRoll += (-leftSol[1] - pose.armLRoll) * wL;
  pose.elbowL = (pose.elbowL ?? 0) + (leftSol[2] - (pose.elbowL ?? 0)) * wL;
  if (!targets.bladeInHip) return { sheath: targets.sheath, bladeOut: false };
  return { sheath: targets.sheath, blade: targets.sheathInHip.clone().invert().multiply(targets.bladeInHip), bladeOut: true };
};

// 核对用：刀身中心线上一点（出鞘坐标 z，像素；刀身往刀背 +Y 弯）在髋坐标系里的位置；刀在手里时按手算
export const bladePtInHip = (pose: FigurePose, blade: number, side: number, result: SheathResult, z: number): THREE.Vector3 => {
  const bladeMat = result.blade
    ? new THREE.Matrix4().makeTranslation(sheathMount.x, sheathMount.y, sheathMount.z).multiply(result.sheath).multiply(result.blade)
    : handBladeMat(pose, blade, side);
  return vec3(0, bladeCenterY(z), z).applyMatrix4(bladeMat);
};
export const sheathPtInHip = (r: SheathResult, p: THREE.Vector3) => p.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(sheathMount.x, sheathMount.y, sheathMount.z).multiply(r.sheath));
export const sheathArc = (s: number) => vec3(0, sheathCenterY(s), s); // 鞘中心线（鞘本地）
