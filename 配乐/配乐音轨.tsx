// 放歌：照 段.ts 里这首歌的 cue 在母版里出声，帧、帧数、入点秒、逐帧增益都取 cue，母版和 cue（成片截接、剪辑包读的）就对得上。
// 用法：画面里放 <配乐音轨 song={原声} 段={段} />（段 = 本段 段.ts 的默认导出）。
// 不 import 作品/应力转动/配乐/配乐音轨.tsx（作品之间不互相 import）；也不乘 engine/audio/混音.ts 的 musicVolume，那是应力转动配乐垫底的总线，这里歌是主音轨，增益全在 cue 里。
// 和 engine/audio 的声音组件一样用 @remotion/media 的 Audio，不用 remotion 自带的。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import type { Song } from '@engine/audio/曲目.ts';
import { useFirstVisibleFrame, useSfxLog } from '@engine/audio/音效清单.ts';
import { tagSrc } from '@engine/audio/同源区分.ts';
import { cue增益, type 段定义, type 资产cue, type 声音cue } from '@engine/段/段定义.ts';

const 放一条: React.FC<{ song: Song; cue: 资产cue }> = ({ song, cue }) => {
  const { fps } = useVideoConfig();
  const 记 = useSfxLog('配乐清单');
  const 外露 = useFirstVisibleFrame();
  if ((cue.速率 ?? 1) !== 1 || cue.循环) throw new Error(`${cue.资产} 第 ${cue.帧} 帧的 cue 变速或循环了，配乐音轨不支持`);
  const 入点秒 = cue.入点秒 ?? 0;
  const 增益 = (f: number) => cue增益(cue, f);
  记({ 名: cue.名, 文件: song.文件, from: cue.帧, 帧数: cue.帧数, 入点秒, 速率: 1, 循环: false, gainAt: 增益 });
  // 外面的 Sequence 带 trimBefore 时声音从 外露 那帧才露出来，Remotion 给 volume 的帧从露出来那帧数起（见 音效清单.ts）
  const 跳 = Math.max(0, 外露 - cue.帧);
  // cue 的入点秒是 ffmpeg 解这份文件的时间；fileOffsetSec 只补 Remotion 解码的早晚，cue 不动
  return (
    <Sequence from={cue.帧} durationInFrames={cue.帧数} layout="none">
      {/* 同一首歌叠几条时按起帧区分，不然叠着的那几帧只剩一条（同源区分.ts） */}
      <Audio src={tagSrc(song.音频, `起${cue.帧}`)} trimBefore={(入点秒 + song.fileOffsetSec) * fps} volume={(f) => 增益(f + 跳)} />
    </Sequence>
  );
};

/** 段里资产是 song.文件 的 cue 全放出来；一条都没有就报错（放了组件却没写 cue，成片和剪辑包里会没有这首歌） */
export const 配乐音轨: React.FC<{ song: Song; 段: 段定义 }> = ({ song, 段 }) => {
  const 条们 = (段.声音 ?? []).filter((c: 声音cue): c is 资产cue => c.资产 === song.文件);
  if (!条们.length) throw new Error(`段.ts 里没有放 ${song.文件} 的 cue`);
  return (
    <>
      {条们.map((c) => (
        <放一条 key={c.帧} song={song} cue={c} />
      ))}
    </>
  );
};
