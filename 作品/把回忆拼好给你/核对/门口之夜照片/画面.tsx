// 门口之夜照片的画面：门口之夜画布停在 第11句照片 那一帧、不画气泡；第 0 帧原样，第 1 帧包夜的整片后期（颗粒种子 = 那一帧的歌曲帧，同成片）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 色板 } from '../../色板.ts';
import { 照片帧 } from '../../场/2-门口/门口之夜参数.ts';
import { 门口之夜画布 } from '../../场/2-门口/门口之夜画布.tsx';

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 图 = <门口之夜画布 帧={照片帧} 气泡={false} />;
  return <AbsoluteFill style={{ background: '#000' }}>{f === 0 ? 图 : <整片后期 调色={色板.夜.调色} 种子={照片帧}>{图}</整片后期>}</AbsoluteFill>;
};

export default 画面;
