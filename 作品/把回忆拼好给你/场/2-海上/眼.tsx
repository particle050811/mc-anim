// 第 4 句开头她眼睛的特写：三渲二透视，镜头正对她的脸往右眼里推（编排.ts 的 眼机位），接第 3 句「11.19 起推到她的眼睛」。
// 调子接第 3 句的白天（参数.ts 的 眼调子名），背景只铺天色：脸占满画面，第 3 句祭坛的布景露不出来。
// 不描边：脸比画面还大，描边一个贴图像素宽要几百像素，外轮廓也不在画里。她站着、微笑、睁着眼不眨（眨眼会把眼珠压扁，叠化时对不上太阳）。
import React from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { 色板 } from '../../色板.ts';
import { 眼调子名 } from './参数.ts';
import { 特写她, 眼机位, 页 } from './编排.ts';

export const 眼睛特写: React.FC<{ 歌曲帧: number }> = ({ 歌曲帧 }) => {
  const 机 = 眼机位(歌曲帧);
  const t = 色板[眼调子名];
  return (
    <三渲二画布 宽={页.宽} 高={页.高} 机位={{ 种: '透视', ...机, 近: 0.01 }} 天={t.天} 色调={t.色调} 描边={false}>
      <MagicalWineFox pose={{ ...standPose(特写她.loc), yaw: 特写她.yaw }} 姿势="站" 表情="微笑" 看={[0, 0]} 眨眼={0} />
    </三渲二画布>
  );
};
