// 现实课桌核对的画面：左半 640×720 放现实画布（现实课桌 + 撕页手，取景、手的摆法同第 13 句分屏左屏），右半中灰、左上角写视图名。
import type React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { 画幅 } from '../../分镜.ts';
import { 现实画布 } from '../../现实/画布.tsx';
import { 现实课桌 } from '../../现实/课桌.tsx';
import { 像素空间 } from '../../现实/像素块.tsx';
import { 撕页手 } from '../../现实/撕页手.tsx';
import { 右取景, 左镜, 手到于, 手摆 } from '../../场/2-门口/分屏参数.ts';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 视图们 } from './视图.ts';

const 左宽 = 画幅.宽 / 2;

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 左宽, height: 画幅.高, overflow: 'hidden' }}>
        <现实画布 宽={左宽} 高={画幅.高} 取景={{ 中心: [左镜.x, v.镜 === '课表' ? 左镜.课表z : 左镜.桌面z], 每格: 右取景.每格 }}>
          <现实课桌 翻页={v.翻页} 亮格={v.亮格} />
          <像素空间 位={[0, 0, 0]}>
            <描边>
              <撕页手 到={手到于(v.翻页)} 摆={手摆} />
            </描边>
          </像素空间>
        </现实画布>
      </div>
      <div style={{ position: 'absolute', left: 左宽 + 20, top: 16, color: '#f2f2f2', fontFamily: '"PingFang SC", sans-serif', fontSize: 20, lineHeight: 1.5 }}>
        <div>核对-现实课桌 · {v.名}</div>
        <div style={{ fontSize: 15, opacity: 0.75 }}>左半：第 13 句分屏左屏的取景（不过整片后期）</div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
