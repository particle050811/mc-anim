// 2-抢龙蛋 的画面：场/2-末地/镜头.tsx 的 末地镜头 按段内帧画，配原声。
// 段首接第 4 句那道浪（场/2-海上/浪.tsx）往上退：浪照第 4 句的画法包在日落那套整片后期里（接缝那一帧和第 4 句末一样），退完就不画。
import React from 'react';
import { 光影范围 } from '@engine/三渲二/画布.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 画幅 } from '../../分镜/时间.ts';
import { 色板 } from '../../色板.ts';
import { 浪样式, 海调子名 } from '../../场/2-海上/参数.ts';
import { 日落浪 } from '../../场/2-海上/浪.tsx';
import { 末地镜头 } from '../../场/2-末地/镜头.tsx';
import { 歌曲帧, 浪进 } from '../../场/2-末地/编排.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 光影段 } from '../../默认.ts';
import 段 from './段.ts';
import { use当前帧 } from '../../当前帧.ts';

const 画面: React.FC = () => {
  const f = use当前帧();
  const 进 = 浪进(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      {/* 光影照 默认.ts 的 光影段（只照末地，退场的浪不是三渲二） */}
      <光影范围.Provider value={{ 光影: 光影段['2-抢龙蛋'] }}>
        <末地镜头
          f={f}
          盖层={
            进 < 2 ? (
              <整片后期 调色={色板[海调子名].调色} 种子={歌曲帧(f)}>
                <日落浪 进={进} 宽={画幅.宽} 高={画幅.高} 样式={浪样式} />
              </整片后期>
            ) : undefined
          }
        />
      </光影范围.Provider>
    </>
  );
};

export default 画面;
