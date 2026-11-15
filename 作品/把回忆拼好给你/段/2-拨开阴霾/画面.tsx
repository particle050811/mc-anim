// 2-拨开阴霾 的画面：场/2-雷雨/画面.tsx 的 雷雨画面 按歌曲帧画（接着 2-雷雨 那个镜头），配原声、信标声、雨声（接上一段放到雨停）。
import type React from 'react';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { segmentWindow } from '../../分镜/正片第6到7句.ts';
import { shadingBySeg } from '../../默认.ts';
import { StormPicture } from '../../场/2-雷雨/画面.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useCurrentFrame } from '../../当前帧.ts';

const startFrame = segmentWindow('2-拨开阴霾').起帧;

const picture: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {/* 光影照 默认.ts 的 光影段 */}
      <shadingScope.Provider value={{ shading: shadingBySeg['2-拨开阴霾'] }}>
        <StormPicture 帧={startFrame + f} />
      </shadingScope.Provider>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
