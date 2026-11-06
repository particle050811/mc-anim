// 冒烟画面：8×8 色块按 png 内联 + fast-png 同步解码画成格子（和旧项目 lib/贴图.ts 同一条路），一条随帧移动的竖条让每帧不同，
// 第 0 帧、第 24 帧各放一次 1 秒的正弦音（ogg 资产，打包时解成 wav）。
import { Audio } from '@remotion/media';
import { decode } from 'fast-png';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import 色块 from 'asset:核对/冒烟色块';
import 音 from 'asset:核对/冒烟音';
import { 贴格 } from '@engine/段/按时取值.ts';
import { use设置 } from '@engine/段/设置.ts';
import { use当前秒, 秒Sequence } from '@engine/段/时间.tsx';

const 解码 = (uri: string) => {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const img = decode(bytes);
  if (img.channels !== 4 || img.depth !== 8) throw new Error(`冒烟色块不是 8 位 RGBA（channels=${img.channels}, depth=${img.depth}）`);
  return { w: img.width, h: img.height, px: img.data };
};
const 图 = 解码(色块);

const 格 = 40;

const 画面: React.FC = () => {
  // 段内第几格（一格 1/24 秒）；进度条的分母是段长折成的格数
  const frame = 贴格(use当前秒() * 24);
  const { width, durationInFrames: 帧数, fps: 帧率 } = useVideoConfig();
  const durationInFrames = (帧数 / 帧率) * 24;
  const { 级别 } = use设置();
  const 格子 = [];
  for (let y = 0; y < 图.h; y++) {
    for (let x = 0; x < 图.w; x++) {
      const i = (y * 图.w + x) * 4;
      格子.push(
        <div key={i} style={{ position: 'absolute', left: x * 格, top: y * 格, width: 格, height: 格, background: `rgb(${图.px[i]},${图.px[i + 1]},${图.px[i + 2]})` }} />,
      );
    }
  }
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <div style={{ position: 'absolute', left: 120, top: 200, width: 图.w * 格, height: 图.h * 格 }}>{格子}</div>
      <div style={{ position: 'absolute', left: (frame / durationInFrames) * width, top: 0, width: 8, height: '100%', background: '#e8c547' }} />
      <div style={{ position: 'absolute', left: 560, top: 280, color: '#eee', fontSize: 64, fontFamily: 'sans-serif' }}>
        核对-冒烟 · 第 {frame} 帧 · {级别}
      </div>
      <秒Sequence 起秒={0} 长秒={1}>
        <Audio src={音} />
      </秒Sequence>
      <秒Sequence 起秒={1} 长秒={1}>
        <Audio src={音} />
      </秒Sequence>
    </AbsoluteFill>
  );
};

export default 画面;
