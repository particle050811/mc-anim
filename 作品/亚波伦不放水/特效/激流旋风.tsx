// 激流旋风：玩家在激流姿势（三叉戟激流、断曜流光冲刺）时身上套的那两层旋风。照 1.20.1 的 SpinAttackEffectLayer 原样做（CFR 反编译读的）：
// 一个 16 × 32 × 16 像素的方盒（贴图 trident_riptide.png 64 × 64，uv 从 0,0 起，entityCutoutNoCull：抠透明、不剔背面），画 i = 0、1、2 三层，
// 每层 poseStack 依次 YP(刻 × −(45 + 5i)) → 缩放 0.75i → 平移 (0, −0.2 + 0.6i, 0)。i = 0 缩放是 0，看不见；剩下两层一小一大套在人身上。
// 这一层画在人的模型空间里（转身、横躺、绕身子打转、玩家 0.9375 倍都在外面），所以这里给的是「身子没打转」的那个坐标系，打转的差在这里补：
// 外面人绕长轴 −75 度每刻，层自己再转 −(45 + 5i)（模型空间 y 朝下，翻过来是 +），合起来比不转的身子慢：每刻 −(30 − 5i) 度。
import React from 'react';
import { EntityModel, type EntityModelData } from '@engine/model/实体模型.tsx';
import { png } from '@engine/model/贴图.ts';
import 旋风图 from 'asset:贴图/法术/minecraft/entity/trident_riptide';

const 盒: EntityModelData = {
  texSize: [64, 64],
  root: { name: 'box', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [{ uv: [0, 0], from: [-8, -16, -8], size: [16, 32, 16], grow: [0, 0, 0], mirror: false }], children: [] },
};

/** 刻：开始转后第几刻（同人的 tickCount 相位）；放在人的脚底坐标系里（已经横躺、没打转），玩家缩放由外面给 */
export const 激流旋风: React.FC<{ 刻: number; 缩放?: number }> = ({ 刻, 缩放 = 0.9375 }) => {
  const tex = png(旋风图);
  return (
    <>
      {[1, 2].map((i) => {
        const 缩 = 0.75 * i;
        const 转 = (((30 - 5 * i) * 刻) / 180) * Math.PI;
        return <EntityModel key={i} model={盒} tex={tex} scale={缩放} pose={{ box: { offset: [0, 缩 * (-0.2 + 0.6 * i) * 16, 0], rot: [0, 转, 0], scale: [缩, 缩, 缩] } }} />;
      })}
    </>
  );
};
