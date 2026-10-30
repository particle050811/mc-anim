// 两句台词各一个色块当嘴（句口型 的 open、width 直接换算成高、宽），时间轴上标出每句从开口到说完的帧；第 6 帧黄叛开口、第 36 帧李樱开口。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { 台词句轨 } from '@engine/audio/台词句轨.tsx';
import { 句帧数, type 台词句cue } from '@engine/audio/台词句.ts';
import { 句口型 } from '@库/角色/句口型.ts';
import 受死 from '../../台词/7-黄叛-受死.ts';
import 溜了 from '../../台词/7-李樱-溜了.ts';
import 受死声 from 'asset:配音/7-黄叛-受死';
import 溜了声 from 'asset:配音/7-李樱-溜了';

const 句们: readonly 台词句cue[] = [
  { 句: 受死, 帧: 6 },
  { 句: 溜了, 帧: 36 },
];
const 声音 = { [受死.id]: 受死声, [溜了.id]: 溜了声 };

const 画面: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, durationInFrames, fps } = useVideoConfig();
  const 每帧 = (width - 160) / durationInFrames;
  return (
    <AbsoluteFill style={{ background: '#1b1d22', color: '#eee', fontFamily: 'sans-serif' }}>
      <台词句轨 句们={句们} 声音={声音} />
      {句们.map(({ 句, 帧 }, i) => {
        const 嘴 = 句口型(句们, 句.角色, frame, fps);
        const 左 = 200 + i * 520;
        return (
          <div key={句.id}>
            <div style={{ position: 'absolute', left: 左, top: 90, fontSize: 40 }}>{句.角色}</div>
            <div style={{ position: 'absolute', left: 左, top: 150, fontSize: 30, color: '#aab' }}>{句.念}</div>
            <div style={{ position: 'absolute', left: 左, top: 220, width: 240, height: 180, background: '#d9b38c', borderRadius: 12 }}>
              <div
                style={{
                  position: 'absolute', left: '50%', top: '50%', background: '#3a1a1a', borderRadius: 8,
                  width: 120 * (嘴?.width ?? 1), height: Math.max(4, 120 * (嘴?.open ?? 0)), transform: 'translate(-50%, -50%)',
                }}
              />
            </div>
            <div
              style={{
                position: 'absolute', left: 80 + 帧 * 每帧, top: 520 + i * 40, height: 28,
                width: 句帧数(句, fps) * 每帧, background: i ? '#6fa8dc' : '#e06666',
              }}
            />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 80 + frame * 每帧, top: 500, width: 4, height: 110, background: '#e8c547' }} />
      <div style={{ position: 'absolute', left: 80, top: 640, fontSize: 28 }}>核对-台词句轨 · 第 {frame} 帧</div>
    </AbsoluteFill>
  );
};

export default 画面;
