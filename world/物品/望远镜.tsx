// 望远镜：原版 minecraft:spyglass（1.17 起有），边城卫兵举着往城墙下看（原文第 6 章「每个人都配备了望远镜」）。
// 照抄 1.20.1 客户端 jar 的 item/spyglass_in_hand（npm run 取材 -- 望远镜）：两节铜管（细的 2×5 像素是目镜、粗的 2.2×6.2 像素是物镜，底面是镜片），贴图 spyglass_model。
// 用的时候游戏不按手持画，而是贴在眼睛前面（PlayerItemInHandLayer.renderArmWithSpyglass：挂在头上、往用镜那只手一侧偏 2.5 像素，
// 套 spyglass_in_hand 的 head 显示变换 translation [0,0,-16]、rotation [90,0,0]、scale 1.6，再乘头部物品的 0.625），目镜贴眼睛、物镜顺着视线朝前，长约 0.7 格。
// 坐标：BlockModel 的局部坐标（格，方块中心在原点），镜筒沿 Z 竖着（细的目镜那节在上）。挂到眼睛前面的摆法见 角色/卫兵.tsx。
import React from 'react';
import { BlockModel, BlockModelData } from '../../engine/model/方块模型.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/物品/望远镜';
import atlas from 'asset:贴图/物品/望远镜';

const DATA = raw as unknown as BlockModelData;
const ATLAS = png(atlas);
export const Spyglass: React.FC = () => <BlockModel data={DATA} atlas={ATLAS} part="望远镜" />;
