// 粉色教堂核对的画面：教堂网格加它自己的灯，视图表在 视图.ts。天空是一块纯色（整合包里教堂在飞升后的独立空间，天是什么样没核实，Agent 暂定淡蓝）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckLabel, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import { GirlYaBoLun, stand } from '../../角色/娘化亚波伦.tsx';
import { church, ChurchLighting, PinkChurch } from '../../地点/粉色教堂.tsx';
import { aspect, views } from './视图.ts';

const skyColor = '#b4cfff';


const picture: React.FC = () => {
  const v = useCheckView(views);
  return (
    <AbsoluteFill style={{ background: skyColor }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={skyColor}>
        <CheckCamera eye={v.眼} target={v.看} fov={v.fov} up={v.上} far={512} />
        <ZUp>
          <ChurchLighting />
          <PinkChurch />
          {v.yaBoLun && <GirlYaBoLun pose={{ loc: church.dancePos, yaw: 180 }} sec={0.5} act={stand} />}
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name} note={v.note} />
    </AbsoluteFill>
  );
};

export default picture;
