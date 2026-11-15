// 现实课桌核对的画面：左半 640×720 放现实画布（现实课桌，取景同第 13 句分屏右屏），右半中灰、左上角写视图名。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { aspect } from '../../分镜/时间.ts';
import { RealCanvas } from '../../现实/画布.tsx';
import { RealDesk } from '../../现实/课桌.tsx';
import { splitScreenCount, realFraming } from '../../场/2-门口/分屏参数.ts';
import { orthoTop } from '../../画风.ts';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const leftWidth = aspect.宽 / 2;

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: leftWidth, height: aspect.高, overflow: 'hidden' }}>
        <RealCanvas 宽={leftWidth} 高={aspect.高} framing={realFraming} outlineWidth={splitScreenCount}>
          <RealDesk calendar={v.calendar} flyPages={v.flyPages} litCells={v.litCells} oblique={orthoTop / splitScreenCount} />
        </RealCanvas>
      </div>
      <div style={{ position: 'absolute', left: leftWidth + 20, top: 16, color: '#f2f2f2', fontFamily: '"PingFang SC", sans-serif', fontSize: 20, lineHeight: 1.5 }}>
        <div>核对-现实课桌 · {v.名}</div>
        <div style={{ fontSize: 15, opacity: 0.75 }}>左半：第 13 句分屏右屏的取景（不过整片后期）</div>
      </div>
    </AbsoluteFill>
  );
};

export default picture;
