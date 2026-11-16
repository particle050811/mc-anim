// 封面帧核对的画面：按视图表一帧画一个视图。成片画幅（片）的几帧铺满、不写字；B站封面、竖版贴在左上角，视图名写在右边空着的黑地上。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { EyeContactPicture } from '../../场/2-隐世之境/对视.tsx';
import { eyeContactFraming } from '../../场/2-隐世之境/对视参数.ts';
import { coverSafeArea } from '../../场/2-隐世之境/封面.ts';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const SafeAreaLayer: React.FC<{ width: number; height: number }> = ({ width: W, height: H }) => {
  const { fourThreeRect, bottomEdge, bottomRight } = coverSafeArea(W, H);
  const dimColor = 'rgba(0, 0, 0, 0.45)';
  const forbidden = 'rgba(255, 40, 40, 0.28)';
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: fourThreeRect.x0, height: H, background: dimColor }} />
      <div style={{ position: 'absolute', left: fourThreeRect.x1, top: 0, width: W - fourThreeRect.x1, height: H, background: dimColor }} />
      <div style={{ position: 'absolute', left: 0, top: bottomEdge.y0, width: W, height: H - bottomEdge.y0, background: forbidden, borderTop: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: bottomRight.x0, top: bottomRight.y0, width: W - bottomRight.x0, height: H - bottomRight.y0, background: forbidden, border: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: fourThreeRect.x0, top: 0, width: fourThreeRect.x1 - fourThreeRect.x0, height: H, boxSizing: 'border-box', border: '2px solid #ffe14d' }} />
    </div>
  );
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const { width: width, height: height } = eyeContactFraming[v.版];
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <EyeContactPicture 版={v.版} withPost={v.withPost} bigText={v.bigText} showBubble={v.char} showChat={v.char} />
      {v.safeArea && <SafeAreaLayer width={width} height={height} />}
      {v.版 !== '片' && (
        <div style={{ position: 'absolute', left: width + 16, top: 12, right: 12, fontFamily: uiFontFamily, fontSize: 18, lineHeight: 1.5, color: '#ffffff' }}>
          <div>核对-封面帧 · {v.name}</div>
          <div style={{ fontSize: 14, color: '#bbbbbb' }}>
            左上角 {width * 2}×{height * 2}（成片像素）
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default picture;
