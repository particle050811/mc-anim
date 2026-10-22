// 台词口型：口型表（旧项目 工具/配音/口型.py 按字对齐算的 Rhubarb 嘴型 A～F、X）对到画面上。口型表、台词表是作品的资产，
// 由作品传进 做口型（作品的 配音/口型.ts 绑好后导出 mouthAt、withTalkNod），本文件不 import 任何资产。
// 用法：mouthAt(句们, '李樱', 帧) → { open, width }，这时没在说话返回 undefined（九胡说话时要藏起平常的 ω 嘴，得分得清）。句们就是传给 <LineTrack 句们> 的那份（帧 = 这句开口落在这段的第几帧），
// 只看这个角色的句子（台词都说出口、都动嘴，用户 10-20 把内心独白全改成了说出口）。角色怎么画张嘴见 李樱.tsx、九胡.tsx 的 `嘴`；脸上没嘴的用 `withTalkNod`。
// 不在几个嘴型之间硬切（用户 10-15 嫌切来切去），换形时张开、宽窄都连续过渡：张嘴快、合嘴慢。
// 不引 台词轨.tsx（它带 Remotion 的音频组件），编排.ts 这种纯函数文件也能用。

// open：张开多少（0 闭，1 张到最大）；width：嘴宽是平常的几倍（嘟嘴窄、大张略宽）
export type Mouth = { open: number; width: number };
export const CLOSED: Mouth = { open: 0, width: 1 };
// Rhubarb 嘴型（github.com/DanielSWolf/rhubarb-lip-sync 的 README 有图）→ 方块脸上的张开和宽窄
export const MOUTH_SHAPES: Record<string, Mouth> = {
  X: CLOSED, // 静音、放松
  A: { open: 0, width: 0.9 }, // 闭唇 m b p
  B: { open: 0.3, width: 1 }, // 微张、咬着牙 大多数辅音、i
  C: { open: 0.6, width: 1 }, // 半张 e
  D: { open: 1, width: 1.1 }, // 大张 a
  E: { open: 0.55, width: 0.75 }, // 略圆 o er
  F: { open: 0.3, width: 0.55 }, // 嘟嘴 u ü w
};
const OPEN_S = 0.06; // 张嘴的过渡时长
const CLOSE_S = 0.09; // 合嘴的过渡时长
const LEAD_S = 0.03; // 嘴比声音略早到位，看着才对得上

type Cue = { id: string; 帧: number };
/** 口型表：句 id → 嘴型关键帧 [文件里的秒, 嘴型]；台词表只用 角色、开口 */
export type 口型数据 = { 口型: Readonly<Record<string, { 嘴: [number, string][] }>>; 台词: Readonly<Record<string, { 角色: string; 开口: number }>> };

const mix = (a: Mouth, b: Mouth, k: number): Mouth => ({ open: a.open + (b.open - a.open) * k, width: a.width + (b.width - a.width) * k });
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// 某一时刻（音频文件里的秒数）的嘴：从上一个嘴型过渡到当前这个；上一次过渡没走完就从当时的样子接着走
const sample = (keys: [number, string][], t: number): Mouth => {
  let from = CLOSED;
  let to = CLOSED;
  let start = 0;
  const progress = (at: number) => ease((at - start) / (to.open > from.open ? OPEN_S : CLOSE_S));
  for (const [keyStart, shape] of keys) {
    if (keyStart > t) break;
    from = mix(from, to, progress(keyStart));
    to = MOUTH_SHAPES[shape];
    start = keyStart;
  }
  return mix(from, to, progress(t));
};

export const mouthAt = ({ 口型: cuesById, 台词: lines }: 口型数据, cues: readonly Cue[], role: string, frame: number, fps = 24): Mouth | undefined => {
  for (const { id, 帧: lineFrame } of cues) {
    const entry = cuesById[id];
    if (!entry || lines[id].角色 !== role) continue;
    const t = (frame - lineFrame) / fps + lines[id].开口 + LEAD_S;
    const keys = entry.嘴;
    if (t < 0 || t >= keys[keys.length - 1][0] + CLOSE_S) continue;
    return sample(keys, t);
  }
  return undefined;
};

// 脸上没嘴的人（刘心忠村民脸、黄叛全盔）说话时头随字轻点（用户 10-20）：嘴的开合按快（0.05 秒）、慢（0.2 秒）两种平滑，
// 两者的差是一个个字的起伏，当点头；慢的给一点整体低头，再慢（0.5 秒）的差给按句子的左右晃。用法同 mouthAt，pose 要有 headPitch（负 = 低头）、headYaw（度）
const NOD_PITCH = 12; // 度：每个字点一下
const NOD_DIP = 2; // 度：说话时整体低一点
const NOD_YAW = 8;
const smoothedOpen = (数据: 口型数据, cues: readonly Cue[], role: string, frame: number, fps: number, tau: number) => {
  let sum = 0;
  let weights = 0;
  for (let back = 0; back < 1.5 * fps; back += 0.25) {
    const w = Math.exp(-back / fps / tau);
    sum += w * (mouthAt(数据, cues, role, frame - back, fps)?.open ?? 0);
    weights += w;
  }
  return sum / weights;
};
export const withTalkNod = <P extends { headPitch: number; headYaw: number }>(数据: 口型数据, pose: P, cues: readonly Cue[], role: string, frame: number, fps = 24): P => {
  const slow = smoothedOpen(数据, cues, role, frame, fps, 0.2);
  if (slow === 0) return pose;
  const fast = smoothedOpen(数据, cues, role, frame, fps, 0.05);
  const slower = smoothedOpen(数据, cues, role, frame, fps, 0.5);
  return { ...pose, headPitch: pose.headPitch - NOD_PITCH * (fast - slow) - NOD_DIP * slow, headYaw: pose.headYaw + NOD_YAW * (slow - slower) };
};

/** 绑好一部作品的口型表、台词表（资产 数据/配音/口型、数据/配音/台词表 的内容），返回用法同上、不带表参数的 mouthAt、withTalkNod */
export const 做口型 = (口型表: unknown, 台词表: unknown) => {
  const 数据 = { 口型: 口型表, 台词: 台词表 } as 口型数据;
  return {
    mouthAt: (cues: readonly Cue[], role: string, frame: number, fps?: number) => mouthAt(数据, cues, role, frame, fps),
    withTalkNod: <P extends { headPitch: number; headYaw: number }>(pose: P, cues: readonly Cue[], role: string, frame: number, fps?: number) => withTalkNod(数据, pose, cues, role, frame, fps),
  };
};
