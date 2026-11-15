// 扑龙蛋照片核对的画面：场/2-末地 的 末地镜头 定在 照片-扑龙蛋 那一帧（段内帧，颗粒种子同片子里那一帧），按视图表换一项。
import type React from 'react';
import { EndShot } from '../../场/2-末地/镜头.tsx';
import { events } from '../../场/2-末地/编排.ts';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return <EndShot f={events.photoEggPounce} clean={v.clean} />;
};

export default picture;
