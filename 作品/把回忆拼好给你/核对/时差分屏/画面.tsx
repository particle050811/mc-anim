// 时差分屏核对的画面：按视图表一帧画一个视图（场/2-门口/时差分屏.tsx）。帧号冻在视图的歌曲帧上，颗粒的种子和片子里同一帧一样，几张之间只差视图里写的那个变量。
// 不在画面上写字（看的就是成片那一帧），视图名看文件夹里的 00-说明.md。
import type React from 'react';
import { AbsoluteFill, Freeze, useCurrentFrame } from 'remotion';
import { 时差分屏 } from '../../场/2-门口/时差分屏.tsx';
import { 视图们 } from './视图.ts';

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Freeze frame={v.帧}>
        <时差分屏 帧={v.帧} 描边={v.描边} 后期={v.后期} 她={v.她} />
      </Freeze>
    </AbsoluteFill>
  );
};

export default 画面;
