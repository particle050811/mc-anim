// 剃刀风。出处 goety 2.5.60.6：RazorWindSpell、RazorWind（SlashProjectile）、RazorWindRenderer；原版 PlayerCloudParticle。
// - 一片平躺着往前飞的月牙：PoseStack YP(yaw) · XP(−pitch)，在 y = −0.1 画一张边长 = 碰撞箱宽（半径 × 2）的方片，贴图 slash/1～4；
//   先用 entityCutoutNoCull alpha 0.5 画一遍，再用加色（wraith）画一遍。半径每刻 + 0.12。贴图游戏里每 6 个渲染帧换一张，这里按 60 帧算成每 0.1 秒一张。
// - 每刻沿宽度每 0.25 格放一颗 cloud。
// 没核：起始半径 = 0.3 + 法术的 radius 属性，默认 radius 没翻到，这里当 0；第二遍加色层换帧带的偏移量。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 单位, 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 度 } from '../零件/实体.tsx';
import { 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import { 各刻, 箭角 } from '../零件/甲/共用.ts';
import { 平片, type 角 } from '../零件/甲/平片.tsx';
import { 云, 云类 } from '../零件/甲/原版粒子.ts';
import 元, { 剃刀风终刻, 剃刀风道 } from './razor_wind.元.ts';
import 斩1 from 'asset:贴图/法术/goety/entity/projectiles/slash/1';
import 斩2 from 'asset:贴图/法术/goety/entity/projectiles/slash/2';
import 斩3 from 'asset:贴图/法术/goety/entity/projectiles/slash/3';
import 斩4 from 'asset:贴图/法术/goety/entity/projectiles/slash/4';

const 斩图 = [斩1, 斩2, 斩3, 斩4].map(png);
const 半径 = (刻: number) => 0.3 + 0.12 * 刻;

const 剃刀风: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 道 = 剃刀风道(起点, 目标);
  const 终 = 剃刀风终刻(起点, 目标);
  const 向 = 弹道方向(道, 0);
  // 宽度方向：水平、和飞行方向垂直
  const 横 = 单位([-向[1], 向[0], 0]);
  const r = rng(种子 * 11 + 3);
  const 云们: 粒子出生[] = 各刻(1, Math.min(刻, 终)).flatMap((n) => {
    const [p, 半] = [道(n), 半径(n)];
    return Array.from({ length: Math.floor((半 * 2) / 0.25) + 1 }, (_, k) => 云(r, n, [p[0] + 横[0] * (k * 0.25 - 半), p[1] + 横[1] * (k * 0.25 - 半), p[2]]));
  });
  const { yaw, pitch } = 箭角(向);
  const h = 半径(刻);
  const 角们: [角, 角, 角, 角] = [
    [-h, -0.1, -h, 0, 1],
    [h, -0.1, -h, 1, 1],
    [h, -0.1, h, 1, 0],
    [-h, -0.1, h, 0, 0],
  ];
  const 图 = 斩图[Math.floor(秒 * 10) % 4]!;
  return (
    <>
      <贴图粒子 类={云类} 出生们={云们} 秒={秒} />
      {刻 < 终 && (
        <MC空间 位={弹道位置(道, 刻)}>
          <group rotation={[0, 度(yaw), 0]}>
            <group rotation={[度(-pitch), 0, 0]}>
              <平片 角们={角们} 图={图} 混合="半透明" 透明度={0.5} />
              <平片 角们={角们} 图={图} 混合="加色" 透明度={0.5} />
            </group>
          </group>
        </MC空间>
      )}
    </>
  );
};

export default 定义法术演出(元, 剃刀风);
