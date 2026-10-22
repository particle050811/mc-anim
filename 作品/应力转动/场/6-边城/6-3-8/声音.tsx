// 6-3-8、6-3-10 的声音：一条时间线（编排.ts）上的两个窗口，声音先按编排帧排、再换成成片帧（跳下城墙那一截跳切，落在跳掉那截里的不放），每段放自己那一截（同 6-2-1/声音.tsx、6-3-下坠/声音.tsx）。没有配乐（全章配乐只有飞行那一首，6-3-1 里渐弱完了）。
// 台词：只有 6-3-8 黄叛「上次抢劫我们城市的家伙又来了，我们快追！」（id 6-3-8-黄叛-又出现了，台词轨原样放；其余台词用户 10-12 全删）。开口帧照 编排.ts 的 `lineStartFrame`（时长按 `huangLineSec` 估）。
// 音效（照 1.20.1，规则见 src/音效/游戏音效.tsx；听者 = 镜头）：
// - 脚步：Entity.move 每走 1 / 0.6 格 playStepSound，城墙走道、池沿、城里地面都是 STONE → block.stone.step，volume 0.15、pitch 1；脚踩着地才响（空中、水里、跳进竖井后没有）。按各人跑过的路排步点。
//   镜头多半离得超过 16 格，照游戏放（用户 10-11 嫌脚步声太假，成片的脚步由 AI 生成）。坑口跑得比原版快得多（精英 30、卫兵 20 米/秒），照游戏一秒要响一二十下，
//   所以坑口按画面上的步子响：一个步态周期两步（模型/角色/跑步.ts 的 `runStride`）。
// - 落水：Entity.doWaterSplashEffect，玩家音量 = min(1, √(0.2vx² + vy² + 0.2vz²) × 0.2)（速度按格/刻），不到 0.25 放 entity.player.splash、到了放 entity.player.splash.high_speed，
//   音高 1 + (随机 − 随机) × 0.4。从城墙掉下来都是 0.35 上下 → high_speed。水里蹚着走的划水声（entity.player.swim，音量 = 速度 × 0.35 再乘衰减）太小，不加。
// - 跳下镜：起跳前在走道上跑的脚步照游戏衰减；落水镜：每人一声落水都在镜里（跳下镜末尾到落水镜开头之间没人落水）。
// - 游戏里没有声音、所以不加：挥手、点头；起跳；跳进竖井后掉到古城。卫兵放下望远镜（SPYGLASS_STOP_USING）照理听不见，也不加。
import React from 'react';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { runStride } from '@库/角色/跑步.ts';
import { chaseSpeed } from '../../../地点/古城4x/布局/强者.ts';
import { LineTrack } from '../../../配音/台词轨.tsx';
import { borderTownPos } from '../../../地点/主世界116.ts';
import { fallPool } from '../../../地点/边城/布局/共用.ts';
import type { PoolJump } from '../../../地点/边城/6-3-8/编排/落水.ts';
import * as choreo from '../../../地点/边城/6-3-8/编排.ts';

const vanillaStepLen = 1 / 0.6;

const storySounds: SoundCue[] = (() => {
  const rand = rng(6380);
  const out: SoundCue[] = [];
  // 卫兵放下望远镜：镜头离他们 15 格上下，照游戏衰减听不见，不放（用户 10-18：照理听不到就别弄）。随机数照旧一人取一次，脚步挑的文件不变
  choreo.卫兵位置.forEach(() => rand());
  // 脚步：按 1/96 秒逐步积水平路程，过了 步长 就响一步（切坑那一刻重新起算，相位取一个不落在切点上的固定值）
  const footfalls = (name: string, posAt: (t: number) => V3 | null, startSec: number, endSec: number, stepLen = vanillaStepLen) => {
    const dt = 1 / 96;
    let walked = 0.37 * stepLen;
    let prev: V3 | null = null;
    let stepCount = 0;
    for (let t = startSec; t < endSec; t += dt) {
      const pos = posAt(t);
      if (pos && prev) {
        walked += Math.hypot(pos[0] - prev[0], pos[1] - prev[1]);
        if (walked >= stepLen) {
          walked -= stepLen;
          out.push({ 名: `${name}跑步${++stepCount}`, 事件: 'block.stone.step', 帧: t * choreo.FPS, 位置: pos, 音量: 0.15, 音高: 1, 选: rand() });
        }
      }
      prev = pos;
    }
  };
  // 跳下内沿以后：空中、水里不算步；上了池沿、到了路上脚踩着地才算（编排/落水.ts 的段落 + 脚底贴着池沿顶或路面）
  const onGround = (jump: PoolJump, t: number) => {
    if (t < jump.takeoffSec || t >= choreo.cues.切坑) return true;
    const sample = jump.at(t);
    return (sample.phase === '岸上' || sample.phase === '路上') && (Math.abs(sample.pos[2] - fallPool.waterTop) < 1e-3 || Math.abs(sample.pos[2] - 0.5) < 1e-3);
  };
  const guardFeet = (i: number) => (t: number): V3 | null => {
    const guard = choreo.guardPoseAt(t, i);
    if (!guard.present || !onGround(choreo.guardPoolJump(i), t)) return null;
    return [borderTownPos[0] + guard.pos[0], borderTownPos[1] + guard.pos[1], borderTownPos[2] + guard.pos[2]];
  };
  // 落水声
  const jumps: [string, PoolJump][] = [['刘心忠', choreo.leaderPoolJump('刘')], ['黄叛', choreo.leaderPoolJump('黄')], ...choreo.卫兵位置.map((_, i): [string, PoolJump] => [`${i} 号卫兵`, choreo.guardPoolJump(i)])];
  const splashRand = rng(6381);
  for (const [name, jump] of jumps) {
    const [vx, vy, vz] = jump.entry.vel; // 城的局部：z 朝上
    const volume = Math.min(1, Math.sqrt(0.2 * vx * vx + vz * vz + 0.2 * vy * vy) * 0.2);
    const pitch = 1 + (splashRand() - splashRand()) * 0.4;
    const pos: V3 = [borderTownPos[0] + jump.entry.pos[0], borderTownPos[1] + jump.entry.pos[1], borderTownPos[2] + jump.entry.pos[2]];
    out.push({ 名: `${name}落水`, 事件: volume < 0.25 ? 'entity.player.splash' : 'entity.player.splash.high_speed', 帧: jump.entry.sec * choreo.FPS, 位置: pos, 音量: volume, 音高: pitch, 选: splashRand() });
  }
  choreo.卫兵位置.forEach((_, i) => {
    footfalls(`${i} 号卫兵`, guardFeet(i), 0, choreo.cues.切坑);
    footfalls(`${i} 号卫兵坑口`, guardFeet(i), choreo.cues.切坑, choreo.lastSec, runStride(chaseSpeed.卫兵) / 2);
  });
  for (const [name, stateAt, who, takeoffSec] of [['刘心忠', choreo.liuXinzhongState, '刘', choreo.cues.刘入井], ['黄叛', choreo.huangPanState, '黄', choreo.cues.黄入井]] as const) {
    const jump = choreo.leaderPoolJump(who);
    footfalls(`${name}上岸`, (t) => { const loc = stateAt(t).pose.loc; return onGround(jump, t) ? [loc[0], loc[1], loc[2]] : null; }, jump.takeoffSec, choreo.cues.切坑);
    footfalls(name, (t) => { const loc = stateAt(t).pose.loc; return [loc[0], loc[1], loc[2]]; }, choreo.cues.切坑, takeoffSec, runStride(chaseSpeed.精英) / 2);
  }
  return out;
})();

// 编排帧 → 成片帧（全局）
export const sounds: SoundCue[] = storySounds.flatMap((sound) => {
  const frame = choreo.cutFrameOf(sound.帧);
  return frame === undefined ? [] : [{ ...sound, 帧: frame }];
});

const listener = (H: number) => choreo.camPose(choreo.frameToSec(Math.min(Math.max(H, 0), choreo.lastFrame))).pos;

export const PursuerSound: React.FC<{ segment: choreo.SegmentName }> = ({ segment: segment }) => {
  const { 起: start } = choreo.segmentTable[segment];
  return (
    <>
      <GameSoundTrack sounds={sounds} listener={listener} startFrame={start} frameCount={choreo.segmentFrames(segment)} />
      <LineTrack 句们={choreo.lineCuesBySegment[segment]} />
    </>
  );
};
