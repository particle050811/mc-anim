// 起步的画面：黑底上数秒
import { AbsoluteFill } from 'remotion';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

export default definePicture(seg, soundUrl, () => {
  const { sec: sec, segment: thisSegment } = useSeg(seg);
  return <AbsoluteFill style={{ background: '#000', color: '#fff', fontSize: 48, justifyContent: 'center', alignItems: 'center' }}>{`${sec.toFixed(2)} / ${thisSegment.sec} 秒`}</AbsoluteFill>;
});
