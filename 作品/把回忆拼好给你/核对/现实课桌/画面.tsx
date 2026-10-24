// 现实课桌核对的画面：左半 640×720 放现实画布（现实课桌，取景同第 13 句分屏右屏），右半中灰、左上角写视图名。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 画幅 } from '../../分镜.ts';
import { 现实画布 } from '../../现实/画布.tsx';
import { 现实课桌 } from '../../现实/课桌.tsx';
import { 分屏N, 现实取景 } from '../../场/2-门口/分屏参数.ts';
import { 正交顶面 } from '../../画风.ts';
import { 视图们 } from './视图.ts';

const 左宽 = 画幅.宽 / 2;

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 左宽, height: 画幅.高, overflow: 'hidden' }}>
        <现实画布 宽={左宽} 高={画幅.高} 取景={现实取景} 描边宽={分屏N}>
          <现实课桌 日历={v.日历} 飞={v.飞} 亮格={v.亮格} 斜={正交顶面 / 分屏N} />
        </现实画布>
      </div>
      <div style={{ position: 'absolute', left: 左宽 + 20, top: 16, color: '#f2f2f2', fontFamily: '"PingFang SC", sans-serif', fontSize: 20, lineHeight: 1.5 }}>
        <div>核对-现实课桌 · {v.名}</div>
        <div style={{ fontSize: 15, opacity: 0.75 }}>左半：第 13 句分屏右屏的取景（不过整片后期）</div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
