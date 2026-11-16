// 合照核对的画面：按视图表一帧画一个视图，整页就是成片那一帧（不写视图名）。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { GroupPhotoPolaroid, GroupPhotoPrint, LeanPicture } from '../../场/2-隐世之境/合照.tsx';
import { eyeContactRig } from '../../场/2-隐世之境/对视.tsx';
import { ReunionPicture } from '../../场/2-隐世之境/重逢.tsx';
import { views, type View } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const SingleFrame: React.FC<{ v: View }> = ({ v }) => {
  const frame = v.frame ?? 0;
  switch (v.kind) {
    case '照片':
      return <GroupPhotoPrint withPost={v.withPost ?? true} />;
    case '拍立得':
      return <GroupPhotoPolaroid withPost={v.withPost ?? true} />;
    case '重逢':
      return <ReunionPicture frame={frame} bubbleText={v.bubbleText} cameraRig={v.coverRig ? eyeContactRig('片') : undefined} withPost={v.withPost ?? true} />;
    case '靠肩':
      return <LeanPicture frame={frame} showBubble={v.showBubble} fade={v.fade} cameraRig={v.cameraRig} windowView={v.windowView} withPost={v.withPost ?? true} />;
  }
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#000000' }}>
      <SingleFrame v={v} />
    </AbsoluteFill>
  );
};

export default picture;
