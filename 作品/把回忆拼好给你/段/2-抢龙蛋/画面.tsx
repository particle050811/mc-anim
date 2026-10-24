// 2-抢龙蛋 的画面：场/2-末地/镜头.tsx 的 末地镜头 按段内帧画，配原声。
// 段首接第 4 句那道浪（场/2-海上/浪.tsx）往上退：浪照第 4 句的画法包在日落那套整片后期里（接缝那一帧和第 4 句末一样），退完就不画。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 画幅 } from '../../分镜.ts';
import { 色板 } from '../../色板.ts';
import { 海调子名 } from '../../场/2-海上/参数.ts';
import { 日落浪 } from '../../场/2-海上/浪.tsx';
import { 末地镜头 } from '../../场/2-末地/镜头.tsx';
import { 歌曲帧, 浪进 } from '../../场/2-末地/编排.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import 段 from './段.ts';

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 进 = 浪进(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <末地镜头
        f={f}
        盖层={
          进 < 2 ? (
            <整片后期 调色={色板[海调子名].调色} 种子={歌曲帧(f)}>
              <日落浪 进={进} 宽={画幅.宽} 高={画幅.高} />
            </整片后期>
          ) : undefined
        }
      />
    </>
  );
};

export default 画面;
