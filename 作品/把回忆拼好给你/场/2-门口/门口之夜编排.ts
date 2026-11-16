// 第 9–11 句谁在哪、什么姿势、手里拿什么、牌上写到哪：按歌曲帧算，画法在 门口之夜画布.tsx。纯模块（测试读）。
// 你：一直站在牌子和门中间、面朝西：匹配剪进来拿着树苗低头看那一格 → 种下 → 空手看着牌子写字（牌子早就立着）→ 镜头拉开、整个人进画以后换上烟花火箭，
// 每发低头右键放出、抬头跟着火箭看炸开。
// 她：第 8 句末态（闭眼歪头笑）匹配剪进来，睁眼转头看你种树、看牌子，镜头跟火箭走起抬头看天，一直仰头看烟花，炸开那一下笑开。
// 她身子朝镜头、头往左上转 30° 看烟花（头不取 90° 的整数倍）：烟花在画面左边，身子转过去就看不见脸；头转过 50° 帽檐就把脸盖住（第8句.ts 量过），
// 收到 30°、仰 20°，脸露在帽檐下面（静帧定稿：看清优先）。
import { addWave, waveProgress } from '@库/角色/挥手.ts';
import { rocketPos, burstPoint, burstSec } from '@库/特效/烟花.ts';
import { fps, oneFrameSec, legacyFrameSec } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第9至11句.ts';
import { youStand, herStand, swapRocketSec, fireworks, signFace, signLinesAt, plantSec, saplingX, standRowY } from './门口之夜参数.ts';
import { clamp01, lerp } from '@engine/core/数学.ts';

const toSec = (frame: number) => frame / fps;
const events = mainCutEvents;

// ---------- 你 ----------
export type HeldItem = '树苗' | '烟花火箭' | null;
export type YouState = { x: number; yaw: number; headPitch: number; held: HeldItem; wave: number };

/** 放出前多久低头对着地面、放出后抬头跟着火箭看（看到炸完再过多久低头准备下一发） */
const bowBeforeSec = 0.25;
const lookBurstDoneSec = 0.4;
/** 抬头最多 50°、低头最多 40°（原版能到 ±90°；侧身仰、俯太多，头像折断了） */
const maxPitch = 50;
const maxLookDown = -40;
const eyeHeight = 1.62;

/** 头对着场景里一点的俯仰（侧身站，只看 x、z；度，负 = 低头） */
const pitchDir = (x: number, z: number) => {
  const d = Math.abs(x - youStand);
  return Math.max(maxLookDown, Math.min(maxPitch, (Math.atan2(z - eyeHeight, Math.max(0.3, d)) * 180) / Math.PI));
};
/** 低头看地上那一格的顶面中心 */
const lookAtGround = (x: number) => pitchDir(x, 0);

export const YouState = (frame: number): YouState => {
  const s = toSec(frame);
  // 原版连着右键：前一下挥过一半，后一下重新挥（LivingEntity.swing）
  const waveAt = (t: number) => waveProgress(s - t);
  const firstFirework = fireworks[0]!;
  // 换上火箭以前手里是什么：树苗（种下以前）或空手。火箭拿早了会从牌子特写的右边戳进来（核查 10-24），等镜头拉开、你整个人进画再换
  const held: HeldItem = s >= swapRocketSec ? '烟花火箭' : s < plantSec ? '树苗' : null;
  if (s < firstFirework.launchSec - bowBeforeSec) {
    // 种树苗（低头看那一格）→ 写字（看着牌面）
    const headPitch = s < plantSec ? lookAtGround(saplingX) : pitchDir(signFace.x, signFace.z);
    return { x: youStand, yaw: 90, headPitch: headPitch, held, wave: waveAt(plantSec) };
  }
  // 放烟花：每发放出前低头、放出时挥手、之后抬头看火箭和炸开
  let headPitch = lookAtGround(firstFirework.位[0]);
  let waveEnd = 0;
  for (const firework of fireworks) {
    const fireSec = firework.launchSec;
    const blastSec = burstSec(firework);
    if (s >= fireSec - bowBeforeSec && s < fireSec) headPitch = lookAtGround(firework.位[0]);
    else if (s >= fireSec && s < blastSec) {
      const p = rocketPos(firework, s);
      if (p) headPitch = Math.max(lookAtGround(firework.位[0]), pitchDir(p[0], p[2]));
    } else if (s >= blastSec && s < blastSec + lookBurstDoneSec) {
      const [x, , z] = burstPoint(firework);
      headPitch = pitchDir(x, z);
    }
    waveEnd = Math.max(waveEnd, waveAt(fireSec));
  }
  // 最后一发炸完一直仰着看（定格成照片）
  const lastFirework = fireworks[fireworks.length - 1]!;
  if (s >= burstSec(lastFirework)) {
    const [x, , z] = burstPoint(lastFirework);
    headPitch = pitchDir(x, z);
  }
  return { x: youStand, yaw: 90, headPitch: headPitch, held, wave: waveEnd };
};

/** 你的 stevePose 参数之外再叠的挥手：画布里 加挥手(pose, 你态.挥) */
export { addWave };

// ---------- 她 ----------
export type LiYingExpression = '微笑' | '大笑';
/** 头：[俯仰, 左右, 歪]（度，正 = 抬头、往她的左边（画面右）、往她的左肩歪），画的时候换成 骨骼 Head 的 rot [−俯仰, −左右, 歪]（同 段/2-收集快乐/编排.ts 的得意歪头） */
export type LiYingState = { x: number; 头: readonly [number, number, number]; expression: LiYingExpression; blink: number | 'auto' };

/** 第 8 句末态的头（第8句参数.ts 的 得意看 [12, 30]、得意歪 14），闭着眼 */
const endHead = [12, 30, 14] as const;
/** 匹配剪进来先定住多久，再用多久睁眼转头（24 fps 时 4 帧、3 帧）；转头起的那一帧已经转了 1/24 秒 */
const holdSec = legacyFrameSec(4);
const turnHeadSec = legacyFrameSec(3);
/** 看你种树苗、看牌子、抬头看天、看烟花 */
const lookAtYou = [-8, -35, 0] as const;
const lookAtSign = [-6, -28, 0] as const;
const lookSky = [24, -30, 0] as const;
const lookFirework = [20, -30, 0] as const;
/** 炸开以后笑开多久（嘴张开，原尺寸看得出、手机上看不出，不当卖点） */
const bigLaughSec = 0.6;

const lerpHead = (a: readonly number[], b: readonly number[], t: number) => [0, 1, 2].map((i) => lerp(a[i]!, b[i]!, clamp01(t))) as unknown as readonly [number, number, number];

export const LiYingState = (frame: number): LiYingState => {
  const s = toSec(frame);
  /** 离事件那一帧几秒 */
  const secSince = (e: number) => (frame - e) / fps;
  const startFrame = events.nightfall.frame;
  if (secSince(startFrame) < holdSec) return { x: herStand, 头: endHead, expression: '微笑', blink: 1 };
  // 种树苗那会儿看你，镜头往牌子推起看牌子
  const lookSignFrame = events.pushToSign.frame;
  if (frame < lookSignFrame) {
    const t = (secSince(startFrame) - holdSec + oneFrameSec) / turnHeadSec;
    return { x: herStand, 头: lerpHead(endHead, lookAtYou, t), expression: '微笑', blink: t < 1 ? 1 - t : 'auto' };
  }
  const lookUpFrame = events.firework1Launch.frame;
  if (frame < lookUpFrame) return { x: herStand, 头: lerpHead(lookAtYou, lookAtSign, (secSince(lookSignFrame) + oneFrameSec) / turnHeadSec), expression: '微笑', blink: 'auto' };
  // 「抬头看天」：火箭放出时抬头；第一发炸开起看烟花
  const firstBurst = burstSec(fireworks[0]!);
  if (s < firstBurst) return { x: herStand, 头: lerpHead(lookAtSign, lookSky, (secSince(lookUpFrame) + oneFrameSec) / turnHeadSec), expression: '微笑', blink: 0 };
  const laughing = fireworks.some((firework) => s >= burstSec(firework) && s < burstSec(firework) + bigLaughSec);
  return { x: herStand, 头: lerpHead(lookSky, lookFirework, (s - firstBurst + oneFrameSec) / turnHeadSec), expression: laughing ? '大笑' : '微笑', blink: 0 };
};

// ---------- 摆设 ----------
/** 树苗种下没有；牌上四行写到哪（一个词一个词写，原版每行居中）。牌子一直立着 */
export const setupState = (frame: number) => {
  const s = toSec(frame);
  return { saplingPlaced: s >= plantSec, signLines: signLinesAt(s) };
};

export { standRowY };
