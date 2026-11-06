// 2-雷雨 的画面：场/2-雷雨/画面.tsx 的 雷雨画面 按歌曲帧画（和 2-拨开阴霾 是同一个镜头），配原声、闷雷、雨声。
import type React from 'react';
import { 光影范围 } from '@engine/三渲二/画布.tsx';
import { 段窗口 } from '../../分镜/正片第6到7句.ts';
import { 光影段 } from '../../默认.ts';
import { 雷雨画面 } from '../../场/2-雷雨/画面.tsx';
import { 定义画面 } from '@engine/段/段画面.tsx';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';
import { use当前帧 } from '../../当前帧.ts';

const 起帧 = 段窗口('2-雷雨').起帧;

const 画面: React.FC = () => {
  const f = use当前帧();
  return (
    <>
      {/* 光影照 默认.ts 的 光影段 */}
      <光影范围.Provider value={{ 光影: 光影段['2-雷雨'] }}>
        <雷雨画面 帧={起帧 + f} />
      </光影范围.Provider>
    </>
  );
};

export default 定义画面(段, 声音地址, 画面);
