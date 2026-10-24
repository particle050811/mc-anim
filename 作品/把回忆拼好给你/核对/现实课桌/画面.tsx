// 现实课桌核对的画面：左半 640×720 放现实课桌，右半是中灰占位（门机位那一屏由别的路做），右半左上角写视图名。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 画幅 } from '../../分镜.ts';
import { 现实课桌 } from '../../现实/课桌.tsx';
import { 视图们 } from './视图.ts';

const 左宽 = 画幅.宽 / 2;

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 左宽, height: 画幅.高, overflow: 'hidden' }}>
        <现实课桌 宽={左宽} 高={画幅.高} 翻页={v.翻页} 亮格={v.亮格} />
      </div>
      <div style={{ position: 'absolute', left: 左宽 + 20, top: 16, color: '#f2f2f2', fontFamily: '"PingFang SC", sans-serif', fontSize: 20, lineHeight: 1.5 }}>
        <div>核对-现实课桌 · {v.名}</div>
        <div style={{ fontSize: 15, opacity: 0.75 }}>右半：门机位占位（另一路做）</div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
