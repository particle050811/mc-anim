// 7-4-3 报告的声音：只用游戏原声（src/音效/，规则见 游戏音效.tsx），没有台词、没有配乐。听者是镜头。
// - 写字：原版写字没有声音（BookEditScreen 打字是界面里的事），用户 10-20 嫌书页镜「画面很干」要加：借制图师干活的声音
//   entity.villager.work_cartographer（制图台画地图的 drawmap1～3，笔划纸的沙沙声），音量、音高照 Villager.playWorkSound（1、getVoicePitch）。
//   笔在纸上的每一截（编排.ts 的 writingRuns，一行一截）从起笔放起，一声放完接下一声，这一行写完就淡掉；换行前的停顿、落款后停住读的时候没声。中档
// - 坑口：原版强者跳起跳没有声音；落地是一声脚步（Entity.playStepSound，落在城的石半砖上：block.stone.step，volume 0.15）。卫兵往后让的那一步同样是脚步。
// - 合书：右手掀起左页那一下一声翻页（item.book.page_turn，原版翻书页的声音），左半本倒下来合上的那一刻（编排.ts 的 bookLandFrame）一声 item.book.put（原版合上书 / 放上讲台那一声，close_put1～2）。
// - 卫兵上前接书、退回、转身往南：每一步一声木地板脚步（block.wood.step，Entity.playStepSound 的 volume 0.15），在那一步的中间。
import React from 'react';
import { rng, type V3 } from '../../../engine/model/parts.tsx';
import { GameSoundTrack, randomPitch, resolveSound, type SoundCue } from '../../../engine/audio/游戏音效.tsx';
import * as choreo from '../../场/7-收场/7-4-3/编排.ts';
import * as pit from '../../场/7-收场/7-4-3/坑口.ts';

const FPS = choreo.FPS;
const bookPos = choreo.roomToWorld(choreo.bookOnDesk);

const writingSounds = (): SoundCue[] => {
  const rand = rng(7413);
  const runs = choreo.writingRuns();
  return runs.flatMap(([f0, f1], line) => {
    const cues: SoundCue[] = [];
    for (let f = f0; f < f1 - 4; ) {
      const cue: SoundCue = { 名: line === runs.length - 1 ? '落款' : `写字${line + 1}`, 事件: 'entity.villager.work_cartographer', 帧: f, 位置: bookPos, 音量: 1, 音高: randomPitch.voice(rand(), rand()), 选: rand(), 档: '中', 止帧: f1 + 3 };
      cues.push(cue);
      f += resolveSound(cue).durationSec * FPS;
    }
    return cues;
  });
};

export const sounds: SoundCue[] = (() => {
  const rand = rng(7403);
  return [
    { 名: '刘心忠落地', 事件: 'block.stone.step', 帧: Math.round(pit.landFrame.刘), 位置: pit.leaperPose('刘', pit.landFrame.刘)!.loc as V3, 音量: 0.15, 音高: 1, 选: rand() },
    { 名: '黄叛落地', 事件: 'block.stone.step', 帧: Math.round(pit.landFrame.黄), 位置: pit.leaperPose('黄', pit.landFrame.黄)!.loc as V3, 音量: 0.15, 音高: 1, 选: rand() },
    ...pit.guardSteps().map((g) => ({ 名: `卫兵${g.i}后退`, 事件: 'block.stone.step', 帧: g.帧, 位置: g.位置, 音量: 0.15, 音高: 1, 选: rand() })),
    // 合书是写完报告的那一下、这段没有台词和配乐，中档；卫兵转身的脚步照游戏规则
    { 名: '合书', 事件: 'item.book.put', 帧: choreo.bookLandFrame, 位置: bookPos, 音量: 1, 音高: 1, 选: rand(), 档: '中' },
    ...choreo.guardSteps.map(([f0, f1], i) => ({
      名: ['卫兵上前', '卫兵退步', '卫兵转身'][i], 事件: 'block.wood.step', 帧: Math.round((f0 + f1) / 2), 位置: choreo.roomToWorld(choreo.guardPos), 音量: 0.15, 音高: 1, 选: rand(),
    })),
    // 写字、掀页用自己的随机数，上面各声挑的文件不变
    ...writingSounds(),
    { 名: '掀页', 事件: 'item.book.page_turn', 帧: choreo.pinchEnd, 位置: bookPos, 音量: 1, 音高: 1, 选: rng(7423)(), 档: '中' },
  ];
})();

export const ReportSound: React.FC = () => <GameSoundTrack sounds={sounds} listener={(f) => choreo.camAt(f).pos} />;
