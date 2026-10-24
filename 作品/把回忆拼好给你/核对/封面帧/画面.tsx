// 封面帧核对的画面：按视图表一帧画一个视图。片 的几帧整页就是成片那一帧，不写字；封面、竖版贴在左上角，视图名写在右边空着的黑地上。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 对视画面 } from '../../场/2-隐世之境/对视.tsx';
import { 对视取景 } from '../../场/2-隐世之境/对视参数.ts';
import { 封面安全区 } from '../../场/2-隐世之境/封面.ts';
import { 视图们 } from './视图.ts';

const 安全区层: React.FC<{ 宽: number; 高: number }> = ({ 宽: W, 高: H }) => {
  const { 四比三, 底边, 右下角 } = 封面安全区(W, H);
  const 遮 = 'rgba(0, 0, 0, 0.45)';
  const 禁 = 'rgba(255, 40, 40, 0.28)';
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 四比三.x0, height: H, background: 遮 }} />
      <div style={{ position: 'absolute', left: 四比三.x1, top: 0, width: W - 四比三.x1, height: H, background: 遮 }} />
      <div style={{ position: 'absolute', left: 0, top: 底边.y0, width: W, height: H - 底边.y0, background: 禁, borderTop: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: 右下角.x0, top: 右下角.y0, width: W - 右下角.x0, height: H - 右下角.y0, background: 禁, border: '2px dashed #ff5050' }} />
      <div style={{ position: 'absolute', left: 四比三.x0, top: 0, width: 四比三.x1 - 四比三.x0, height: H, boxSizing: 'border-box', border: '2px solid #ffe14d' }} />
    </div>
  );
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const { 宽, 高 } = 对视取景[v.版];
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <对视画面 版={v.版} 后期={v.后期} 大字={v.大字} />
      {v.安全区 && <安全区层 宽={宽} 高={高} />}
      {v.版 !== '片' && (
        <div style={{ position: 'absolute', left: 宽 + 16, top: 12, right: 12, fontFamily: uiFontFamily, fontSize: 18, lineHeight: 1.5, color: '#ffffff' }}>
          <div>核对-封面帧 · {v.名}</div>
          <div style={{ fontSize: 14, color: '#bbbbbb' }}>
            左上角 {宽 * 2}×{高 * 2}（成片像素）
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default 画面;
