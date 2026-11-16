// 2-抢龙蛋 的画面：场/2-末地/镜头.tsx 的 末地镜头 按段内帧画，配原声。
// 段首接第 4 句那道浪（场/2-海上/浪.tsx）往上退：浪照第 4 句的画法包在日落那套整片后期里（接缝那一帧和第 4 句末一样），退完就不画。
import React from 'react';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { aspect } from '../../分镜/时间.ts';
import { palette } from '../../色板.ts';
import { waveStyle, seaToneName } from '../../场/2-海上/参数.ts';
import { SunsetWave } from '../../场/2-海上/浪.tsx';
import { EndShot } from '../../场/2-末地/镜头.tsx';
import { toSongFrame, surgeIn } from '../../场/2-末地/编排.ts';
import { shadingBySeg } from '../../默认.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const waveIn = surgeIn(f);
  return (
    <>
      {/* 光影照 默认.ts 的 光影段（只照末地，退场的浪不是三渲二） */}
      <shadingScope.Provider value={{ shading: shadingBySeg['2-抢龙蛋'] }}>
        <EndShot
          f={f}
          overlay={
            waveIn < 2 ? (
              <FilmPost grade={palette[seaToneName].grade} seed={toSongFrame(f)}>
                <SunsetWave waveIn={waveIn} width={aspect.width} height={aspect.height} 样式={waveStyle} />
              </FilmPost>
            ) : undefined
          }
        />
      </shadingScope.Provider>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
