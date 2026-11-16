// 门口之夜照片的画面：门口之夜画布停在 照片帧（第11句照片 后 5/24 秒，见 门口之夜参数.ts）；第 0 帧原样，第 1 帧包夜的整片后期（颗粒种子 = 那一帧歌曲帧，同成片），
// 第 2 帧是存档图标放大 20 倍（1280 成片像素见方）。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { useViewIndex } from '@engine/段/时间.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { palette } from '../../色板.ts';
import { photoFrame } from '../../场/2-门口/门口之夜参数.ts';
import { DoorNightCanvas } from '../../场/2-门口/门口之夜画布.tsx';
import { DoorwayNightIcon } from '../../场/2-门口/门口之夜照片.tsx';
import { fps } from '../../分镜/时间.ts';

const picture: React.FC = () => {
  const f = useViewIndex(fps);
  const imgEl = <DoorNightCanvas frame={photoFrame} />;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {f === 0 ? imgEl : f === 1 ? <FilmPost grade={palette.夜.grade} seed={photoFrame}>{imgEl}</FilmPost> : <DoorwayNightIcon side={1280} />}
    </AbsoluteFill>
  );
};

export default picture;
