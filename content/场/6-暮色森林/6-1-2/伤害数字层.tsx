// 6-1-2 斩娜迦的界面层：汇流来世的伤害数字（用户 10-10）和 Jade 的娜迦血量框（用户 10-20：显出加强十倍后的 2500 血）。
// 伤害数字是游戏界面，和字幕、思索界面一样只叠进完整参考视频，不进给 Seedance 的单段参考（字交给视频模型会被画坏）：
// 这里是一层透明底画面，和 6-1-2-斩娜迦 同宽高、同帧数、同机位，帧对帧叠上去，只画界面。
// props 和 6-1-2-斩娜迦 同一套（缺省 = 动作改进.ts 的 正式），机位、打击停顿都调 娜迦参考模型.tsx 的 `nagaShotCam`；
// 数字在斩中那一帧（打击停顿第一帧）生成，定格那 3 帧里照常上飘（界面不跟着世界定格）。画法、寿命照抄汇流来世，见 模型/界面/伤害数字.tsx。
// 只在收刀那一镜（2b）里画（用户 10-19 定：俯拍 2c 里数字挤在画面上沿看不清，要放在下一镜被斩开那一截的切口上面）。
// 切到 2b 时数字已飘了 8 帧，原版寿命 30 刻还剩约 28 帧（1.2 秒），不用加长。
//
// 伤害怎么算（一刀斩断，数字不能小于娜迦剩余血量）：
// 1. 娜迦的血：暮色森林 4.3.2508 的 Naga 属性 MAX_HEALTH 120，非简单难度加“Difficulty Health Boost”（困难 +130；原文第 1 章自己是极限模式，锁困难）= 250；
//    原文第 6 章“boss们数值加强了十倍甚至九倍”，按十倍 = 2500。这是娜迦第一次挨刀，剩余血量就是 2500。
// 2. 李樱攻击伤害：玩家底数 1 + 枯石大刀（SlashBlade 1.9.65 koseki.json attack_base 5，ItemSlashBlade.getAttributeModifiers 给 attack_base + 精炼 − 1 = 4，精炼按 0；
//    力量附魔只在幻影剑上加，迅冲斩不吃）+ 机霸境 +20（原文第 4 章境界）；机妹境、机师境各 +100%，层层保留相乘：(1 + 4 + 20) × 2 × 2 = 100。
// 3. 迅冲斩（拔刀剑 rapid_slash）：第 2～5 刻各一刀倍率 0.44，第 7 刻收尾一刀 0.44 且是暴击斩（EntitySlashEffect × 1.1）。
//    每刀走 AttackHelper.calculateTotalDamage：(攻击伤害 + 横扫 0 + 集中评价 0 + 附魔 0) × 倍率 × 拔刀剑伤害属性 1 × 配置 1，跳劈再 × 1.5
//    （isCriticalHit 要下落距离 > 0、不着地、不疾跑：他从 36 格高的滞空点俯冲下来）。原文机技境、大机技境让跳劈伤害翻倍、翻四倍，再 × 2 × 4。
//    每刀 100 × 0.44 × 1.5 × 8 = 528，收尾 100 × 0.484 × 1.5 × 8 = 580.8。
// 4. 游戏里 0.35 秒出 5 刀，漫剧里 120 米/秒一闪而过，5 刀压成穿过脖子的这一刀，所以出一个数字、按 5 刀合计：4 × 528 + 580.8 = 2692.8 ≥ 2500，一刀斩断。
//    娜迦没有护甲，刀光罩住头（本体），不按身体节转给本体的 2/3 算；单算一刀（528）斩不断。
// 5. 颜色：严格照 jar，拔刀剑自己的跳劈不会让它变红（金色普通字）；这一刀是空中下劈、参考图也是深红大字，按暴击画。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { rad } from '../../../../engine/anim/anim.ts';
import { GAME_NAGA } from '../../../../world/角色/娜迦实机.tsx';
import { DamageNumberLayer, damageNumberAnchor, makePerspectiveCamera } from '../../../../world/界面/伤害数字.tsx';
import { JadeTooltip, jadeScalePerWidth } from '../../../../world/界面/Jade.tsx';
import { courtyardToWorld, nagaShotCam, type NagaShotProps } from './娜迦参考模型.tsx';
import { nagaWarp } from './动作改进.ts';
import * as choreo from './编排.ts';

// ---------- 伤害 ----------
export const nagaHealth = (120 + 130) * 10; // 困难（极限模式）× 原文的十倍
const attackDamage = (1 + (5 - 1) + 20) * 2 * 2; // 玩家底数 + 枯石大刀 + 机霸境，× 机妹境 × 机师境
const jumpCritMult = 1.5 * 2 * 4; // 原版跳劈 × 机技境 × 大机技境
const rapidSlashMults = [0.44, 0.44, 0.44, 0.44, 0.44 * 1.1]; // 第 2、3、4、5 刻和第 7 刻（暴击斩）
export const nagaSlashDamage = rapidSlashMults.reduce((sum, mult) => sum + attackDamage * mult * jumpCritMult, 0); // 2692.8
if (nagaSlashDamage < nagaHealth) throw new Error(`斩娜迦伤害 ${nagaSlashDamage} 小于娜迦血量 ${nagaHealth}，一刀斩不断`);
export const nagaSlashCrit = true;

// ---------- 位置和时机 ----------
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
// 刀穿过脖子那一帧（CUT_FRAME，和受击变红同一刻）生成，在留在原地那半截的切口正上方（用户 10-19 定：「移动到切口处」）。
// 切口是第 2 节（断口后第一节，编排/娜迦.ts 的 CUT_I + 1）朝前那一面，取它停稳后的位置。
// 从切面中间（半节高）起飘：切到 2b 时已飘了 8 帧，正好浮在切口上方一点；照原版从碰撞箱顶起飘会顶到画面上沿。
// 游戏里身体节挨打转给本体（NagaSegment.hurt），数字其实冒在头上，但头往北窜出了 2b 的画面。
const cutSeg = choreo.naga(choreo.S2B).pose.segs[2];
const cutDir = rad(cutSeg.yaw - 90); // 身体节 yaw = 前进方向数学角 + 90
const cutFace = [cutSeg.loc[0] + Math.cos(cutDir) * GAME_NAGA.segmentSize / 2, cutSeg.loc[1] + Math.sin(cutDir) * GAME_NAGA.segmentSize / 2, cutSeg.loc[2]];
const anchor = damageNumberAnchor(toThree(courtyardToWorld(cutFace)), GAME_NAGA.segmentSize / 2, 117);
// 段内帧（Remotion 帧）：斩中在打击停顿之前，原版、正式版是同一帧
export const damageSpawnFrame = choreo.segFrame(choreo.CUT_FRAME);

// ---------- Jade 血量框 ----------
// 框画法、位置照 7-2-1（模型/界面/Jade.tsx，屏幕顶边正中）。照 Jade 只在够得着时出（用户 10-20：「怎么半空中就能看到这个血量显示了？落地切的时候才能看到血量显示才合理吧」）：
// 够得着 = 眼睛到娜迦碰撞箱（头或任一身体节）不超过拾取距离 + Jade 的额外距离（RayTracing.fire：MultiPlayerGameMode.getPickRange() 生存 4.5，
// 加 WailaConfig$ConfigGeneral.reachDistance，可调 0～20）。按默认 0 满血只在斩中前 1 帧；这里开满 20，切到俯拍斩击（S2C）第一帧正好够着，滞空、侧跟那一镜够不着。
// 斩中那一刻血掉到 0；娜迦头自毁（实体没了）框就消失。Jade 出现、消失约 2 帧淡入淡出。不画引线：俯拍、收刀两镜娜迦就在画面中间，框里有名字。
const jadeReach = 4.5 + 20;
const eyeHeight = 1.62;
const gapToBox = (p: number[], center: number[], half: number) => Math.hypot(...p.map((v, i) => Math.max(0, Math.abs(v - center[i]) - half)));
const nagaGap = (storyFrame: number) => {
  const ly = choreo.liyingLoc(storyFrame);
  const eye = [ly[0], ly[1], ly[2] + eyeHeight];
  const { head, segs } = choreo.naga(storyFrame).pose;
  const headZ = GAME_NAGA.headBottom + GAME_NAGA.headSize / 2;
  const segGaps = segs.map((s) => gapToBox(eye, [s.loc[0], s.loc[1], s.loc[2] + GAME_NAGA.segmentSize / 2], GAME_NAGA.segmentSize / 2));
  return Math.min(gapToBox(eye, [head.loc[0], head.loc[1], head.loc[2] + headZ], GAME_NAGA.headSize / 2), ...segGaps);
};
// 斩中前娜迦还没开始按 nagaWarp 停，原版、正式版同一帧
const jadeOnFrame = (() => {
  let f = choreo.S2;
  while (f < choreo.CUT_FRAME && nagaGap(f) > jadeReach) f++;
  return f;
})();
const headGoneFrames = new Map<boolean, number>();
const headGoneFrame = (motionV2: boolean) => {
  if (!headGoneFrames.has(motionV2)) {
    let f = choreo.CUT_FRAME;
    while (f < choreo.S3 && choreo.naga(motionV2 ? nagaWarp(f) : f).pose.head.scale !== 0) f++;
    headGoneFrames.set(motionV2, f);
  }
  return headGoneFrames.get(motionV2)!;
};
const jadeFadeFrames = 2;
const nagaJade = (storyFrame: number, motionV2: boolean) => {
  const fadeIn = (storyFrame - jadeOnFrame + 1) / jadeFadeFrames;
  const fadeOut = (headGoneFrame(motionV2) - storyFrame) / jadeFadeFrames;
  return { visibility: Math.max(0, Math.min(1, fadeIn, fadeOut)), health: storyFrame < choreo.CUT_FRAME ? nagaHealth : 0 };
};

export const NagaDamageLayer: React.FC<NagaShotProps> = (props) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const { f: storyFrame, cam: cam } = nagaShotCam(props, frame);
  const toWorld = (p: number[]) => toThree(courtyardToWorld(p));
  const camera = makePerspectiveCamera(cam.lens, toWorld(cam.pos), toWorld(cam.tgt), width, height);
  const ticks = ((frame - damageSpawnFrame) / fps) * 20;
  const jade = nagaJade(storyFrame, props.动作改进 ?? false);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {storyFrame >= choreo.S2B && storyFrame < choreo.S3 && (
        <DamageNumberLayer camera={camera} width={width} height={height} numbers={[{ damage: nagaSlashDamage, crit: nagaSlashCrit, anchor: anchor, ticks: ticks }]} />
      )}
      <JadeTooltip entity={{ name: '娜迦', health: jade.health, maxHealth: nagaHealth, mod: 'The Twilight Forest' }} s={jadeScalePerWidth * width} cx={width / 2} visibility={jade.visibility} />
    </AbsoluteFill>
  );
};
