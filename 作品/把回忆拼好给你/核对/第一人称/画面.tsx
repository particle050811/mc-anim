// 第一人称核对的画面：底下一张灰墙色的底，上面叠手画布，左上角写视图名和这一刻的 手里、挥手、放下。
// 灯的方向按 段/1-一如既往 占位机位的朝向（站在她南边 2.25 格、看她 0.7 格高处），亮度先用 1。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { FirstPersonCanvas, FirstPersonHand, HAND_FOV, type HandScript, handTimeline, viewAngles } from '@库/角色/第一人称.tsx';
import { LiYingFirstPersonArm } from '@库/角色/李樱第一人称.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { 眼位 } from '../../地点/机位.tsx';
import { 视图们, type 情形 } from './视图.ts';

const 剧本: Record<情形, HandScript> = {
  驯服: { start: '蛋糕', swings: [0], changes: [{ tick: 1, to: null }] },
  只挥手: { start: '蛋糕', swings: [0] },
  空手挥手: { start: null, swings: [0] },
};

const 朝向 = viewAngles(眼位([0, -2.25, 0]), [0, 0, 0.7]);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const { width, height } = useVideoConfig();
  const 手 = handTimeline(v.刻, 剧本[v.情形]);
  const 视角 = v.视角 ?? HAND_FOV;
  // 70° 的画面在放宽后的视角里占多大（竖直方向按正切比，横向同比例）
  const 框 = Math.tan(((HAND_FOV / 2) * Math.PI) / 180) / Math.tan(((视角 / 2) * Math.PI) / 180);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(#a7aeb5, #6c737a)', fontFamily: uiFontFamily }}>
      <FirstPersonCanvas width={width} height={height} view={朝向} fov={视角}>
        <FirstPersonHand
          held={手.item === '蛋糕' ? <ItemSprite layers={CAKE} emissive={0} shadow={false} /> : null}
          arm={<LiYingFirstPersonArm clip={v.裁剪 ?? true} />}
          swing={手.swing}
          equip={手.equip}
        />
      </FirstPersonCanvas>
      {框 < 1 && (
        <div
          style={{
            position: 'absolute',
            left: (width * (1 - 框)) / 2,
            top: (height * (1 - 框)) / 2,
            width: width * 框,
            height: height * 框,
            border: '2px dashed #ffd84a',
            boxSizing: 'border-box',
          }}
        />
      )}
      <div style={{ position: 'absolute', left: 24, top: 18, fontSize: 24, lineHeight: 1.5, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
        <div>核对-第一人称 · {v.名}</div>
        <div style={{ fontSize: 18 }}>
          {v.情形} 第 {v.刻} 刻 · 手里 {手.item ?? '空手'} · 挥手 {手.swing.toFixed(3)} · 放下 {手.equip.toFixed(3)}
          {视角 !== HAND_FOV ? ` · 视角 ${视角}°（虚线框是 70° 的画面）` : ''}
          {v.裁剪 === false ? ' · 关掉裁剪' : ''}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
