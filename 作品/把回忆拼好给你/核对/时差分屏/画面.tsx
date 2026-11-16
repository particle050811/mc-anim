// 时差分屏核对的画面：按视图表一帧画一个视图（场/2-门口/时差分屏.tsx）。帧号冻在视图的歌曲帧上，颗粒的种子和片子里同一帧一样，几张之间只差视图里写的那个变量。
// 不在画面上写字（看的就是成片那一帧），视图名看文件夹里的 00-说明.md。
import type React from 'react';
import { AbsoluteFill, Freeze } from 'remotion';
import { TimeLagSplit } from '../../场/2-门口/时差分屏.tsx';
import { views } from './视图.ts';
import { useCheckView } from '@engine/段/核对画面.tsx';

const picture: React.FC = () => {
  const v = useCheckView(views);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Freeze frame={v.frame}>
        <TimeLagSplit frame={v.frame} seed={v.frame} outline={v.outline} withPost={v.withPost} liYing={v.liYing} />
      </Freeze>
    </AbsoluteFill>
  );
};

export default picture;
