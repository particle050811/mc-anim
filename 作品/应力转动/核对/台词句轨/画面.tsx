// 两句台词各一个色块当嘴（句口型 的 open、width 直接换算成高、宽），时间轴上标出每句从开口到说完的帧；第 6 帧黄叛开口、第 36 帧李樱开口。
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { LineCueTrack } from '@engine/audio/台词句轨.tsx';
import { lineFrames, type LineCue } from '@engine/audio/台词句.ts';
import { sentenceLip } from '@库/角色/句口型.ts';
import dieLine from '../../台词/7-黄叛-受死.ts';
import slipAwayLine from '../../台词/7-李樱-溜了.ts';
import dieWav from 'asset:配音/7-黄叛-受死';
import slipAwayWav from 'asset:配音/7-李樱-溜了';
import { snapToFrame } from '@engine/段/按时取值.ts';
import { useCurrentSec } from '@engine/段/时间.tsx';

const lineCues: readonly LineCue[] = [
  { 句: dieLine, frame: 6 },
  { 句: slipAwayLine, frame: 36 },
];
const sounds = { [dieLine.id]: dieWav, [slipAwayLine.id]: slipAwayWav };

const picture: React.FC = () => {
  // 句模块的帧是 1/24 秒一格
  const fps = 24;
  const frame = snapToFrame(useCurrentSec() * fps);
  const { width, durationInFrames, fps: frameRate } = useVideoConfig();
  // 时间轴一格 1/24 秒：段长折成格数做分母
  const pxPerFrame = (width - 160) / ((durationInFrames / frameRate) * fps);
  return (
    <AbsoluteFill style={{ background: '#1b1d22', color: '#eee', fontFamily: 'sans-serif' }}>
      <LineCueTrack lineCues={lineCues} sound={sounds} />
      {lineCues.map(({ 句: sentence, frame: lineStartFrame }, i) => {
        const mouth = sentenceLip(lineCues, sentence.character, frame, fps);
        const left = 200 + i * 520;
        return (
          <div key={sentence.id}>
            <div style={{ position: 'absolute', left: left, top: 90, fontSize: 40 }}>{sentence.character}</div>
            <div style={{ position: 'absolute', left: left, top: 150, fontSize: 30, color: '#aab' }}>{sentence.spoken}</div>
            <div style={{ position: 'absolute', left: left, top: 220, width: 240, height: 180, background: '#d9b38c', borderRadius: 12 }}>
              <div
                style={{
                  position: 'absolute', left: '50%', top: '50%', background: '#3a1a1a', borderRadius: 8,
                  width: 120 * (mouth?.width ?? 1), height: Math.max(4, 120 * (mouth?.open ?? 0)), transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
            <div
              style={{
                position: 'absolute', left: 80 + lineStartFrame * pxPerFrame, top: 520 + i * 40, height: 28,
                width: lineFrames(sentence, fps) * pxPerFrame, background: i ? '#6fa8dc' : '#e06666',
              }}
            />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 80 + frame * pxPerFrame, top: 500, width: 4, height: 110, background: '#e8c547' }} />
      <div style={{ position: 'absolute', left: 80, top: 640, fontSize: 28 }}>核对-台词句轨 · 第 {frame} 帧</div>
    </AbsoluteFill>
  );
};

export default picture;
