// 核对-真下界的画面：机位照视图表，地形、灯、雾都是 地点/真下界.tsx 的，这里只摆机位、加屏幕 AO、左上角写视图名。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckLabel, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { RealNether } from '../../地点/真下界.tsx';
import { aspect, views } from './视图.ts';
import { lightTables, viewCamera } from './地形视图.ts';

const picture: React.FC = () => {
  const v = useCheckView(views);
  const lightSetup = lightTables[v.光];
  return (
    <AbsoluteFill style={{ background: lightSetup.fog.色 }}>
      <CheckCanvas width={aspect.width} height={aspect.height} gl={{ logarithmicDepthBuffer: true }}>
        <CheckCamera {...viewCamera(v)} />
        <ScreenAo />
        <ZUp>
          <RealNether cameraPos={v.眼} 光={lightSetup} />
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name}>
        <div style={{ fontSize: 16 }}>{`眼 场景 ${v.眼.map((n) => n.toFixed(1)).join(', ')}；雾 ${lightSetup.fog.near}～${lightSetup.fog.far} 格`}</div>
      </CheckLabel>
    </AbsoluteFill>
  );
};

export default picture;
