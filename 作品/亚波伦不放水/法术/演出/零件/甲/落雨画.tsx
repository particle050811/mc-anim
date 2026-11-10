// 画落雨的一群箭形弹和头顶的雾云。每颗生出来时在生位放一片雾云（FoggyCloudParticle，尺寸 1.5、速 6：很快就散）。
import React from 'react';
import type { Png } from '@engine/model/贴图.ts';
import type { 色 } from '../材质.ts';
import { 弹道位置, 弹道方向 } from '../弹道.ts';
import { 雾云 } from './爆.tsx';
import { 箭形 } from './箭形.tsx';
import type { 落雨弹 } from './落雨.ts';

export const 落雨们: React.FC<{ 弹们: readonly 落雨弹[]; 秒: number; 图: Png; 雾色: 色; 种子: number }> = ({ 弹们, 秒, 图, 雾色, 种子 }) => {
  const 刻 = 秒 * 20;
  return (
    <>
      {弹们.map((弹, i) => {
        const t = 刻 - 弹.出刻;
        return t >= 0 && t < 弹.飞刻 ? <箭形 key={i} 位={弹道位置(弹.道, t)} 向={弹道方向(弹.道, t)} 图={图} /> : null;
      })}
      <雾云 出生们={弹们.map((弹, i) => ({ 刻: 弹.出刻, 位: 弹.生位, 色: 雾色, 尺寸: 1.5, 速: 6, 种子: 种子 * 101 + i }))} 刻={刻} />
    </>
  );
};
