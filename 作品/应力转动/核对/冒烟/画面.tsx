// 冒烟画面：8×8 色块按 png 内联 + fast-png 同步解码画成格子（和旧项目 lib/贴图.ts 同一条路），一条随帧移动的竖条让每帧不同，
// 第 0 帧、第 24 帧各放一次 1 秒的正弦音（ogg 资产，打包时解成 wav）。
import { Audio } from '@remotion/media';
import { decode } from 'fast-png';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import smokeBlockPng from 'asset:核对/冒烟色块';
import smokeWav from 'asset:核对/冒烟音';
import { snapToFrame } from '@engine/段/按时取值.ts';
import { useSettings } from '@engine/段/设置.ts';
import { useCurrentSec, SecondSequence } from '@engine/段/时间.tsx';

const decodeImage = (uri: string) => {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const img = decode(bytes);
  if (img.channels !== 4 || img.depth !== 8) throw new Error(`冒烟色块不是 8 位 RGBA（channels=${img.channels}, depth=${img.depth}）`);
  return { w: img.width, h: img.height, px: img.data };
};
const img = decodeImage(smokeBlockPng);

const cellPx = 40;

const picture: React.FC = () => {
  // 段内第几格（一格 1/24 秒）；进度条的分母是段长折成的格数
  const frame = snapToFrame(useCurrentSec() * 24);
  const { width, durationInFrames: frameCount, fps: frameRate } = useVideoConfig();
  const durationInFrames = (frameCount / frameRate) * 24;
  const { 级别: level } = useSettings();
  const cells = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      cells.push(
        <div key={i} style={{ position: 'absolute', left: x * cellPx, top: y * cellPx, width: cellPx, height: cellPx, background: `rgb(${img.px[i]},${img.px[i + 1]},${img.px[i + 2]})` }} />,
      );
    }
  }
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <div style={{ position: 'absolute', left: 120, top: 200, width: img.w * cellPx, height: img.h * cellPx }}>{cells}</div>
      <div style={{ position: 'absolute', left: (frame / durationInFrames) * width, top: 0, width: 8, height: '100%', background: '#e8c547' }} />
      <div style={{ position: 'absolute', left: 560, top: 280, color: '#eee', fontSize: 64, fontFamily: 'sans-serif' }}>
        核对-冒烟 · 第 {frame} 帧 · {level}
      </div>
      <SecondSequence startSec={0} 长秒={1}>
        <Audio src={smokeWav} />
      </SecondSequence>
      <SecondSequence startSec={1} 长秒={1}>
        <Audio src={smokeWav} />
      </SecondSequence>
    </AbsoluteFill>
  );
};

export default picture;
