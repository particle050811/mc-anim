// 门口之夜照片的画面：门口之夜画布停在 照片帧（第11句照片 后 5 帧，见 门口之夜参数.ts）；第 0 帧原样，第 1 帧包夜的整片后期（颗粒种子 = 那一帧的歌曲帧，同成片），
// 第 2 帧是存档图标放大 20 倍（1280 成片像素见方）。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 色板 } from '../../色板.ts';
import { 照片帧 } from '../../场/2-门口/门口之夜参数.ts';
import { 门口之夜画布 } from '../../场/2-门口/门口之夜画布.tsx';
import { 门口之夜图标 } from '../../场/2-门口/门口之夜照片.tsx';

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 图 = <门口之夜画布 帧={照片帧} />;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {f === 0 ? 图 : f === 1 ? <整片后期 调色={色板.夜.调色} 种子={照片帧}>{图}</整片后期> : <门口之夜图标 边={1280} />}
    </AbsoluteFill>
  );
};

export default 画面;
