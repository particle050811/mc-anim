// 乔雷夫：边城新的城主，国王姬机亲自任命（原文第 8 章开头「边城新的领导者」，名字按后续剧情，见 正篇/07-监守者之怒/脚本规划.md）。
// 没有设定图，7-4-4 只拍背影和手，所以先用占位：原版玩家体型（PlayerModel 宽手臂，身高 1.875 格），皮肤是原版默认皮肤史蒂夫
// 换一身深色长袖外套、深色裤子（贴图 乔雷夫.png，工具/游戏取材/乔雷夫皮肤.py 生成）。以后有了设定图照 追兵.tsx 的黄叛重做贴图。
// 骨架和坐标同 追兵.tsx：原点在脚底，面朝 +Y，右手在 +X，插槽里 1 = 1 像素；皮肤方盒里层 + 外层（凸出 0.25，帽子层 0.5），和原版两层一样。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { TexBox } from '@engine/model/贴图方盒.tsx';
import { png } from '@engine/model/贴图.ts';
import { Figure, type FigurePose } from '@库/角色/骨架.tsx';
import skinPng from 'asset:贴图/角色/乔雷夫';

const TEX = png(skinPng);
export const qiaoLeifuHeight = 1.875;

const UV = {
  head: [0, 0], hat: [32, 0], body: [16, 16], jacket: [16, 32],
  armR: [40, 16], sleeveR: [40, 32], armL: [32, 48], sleeveL: [48, 48],
  legR: [0, 16], pantsR: [0, 32], legL: [16, 48], pantsL: [0, 48],
} as const satisfies Record<string, [number, number]>;

// 皮肤方盒：TexBox 的正面朝 -Y、右手在 -X，骨架插槽里正面朝 +Y、右手在 +X，绕 Z 转 180° 对上（同 追兵.tsx）
const skinBox = (k: keyof typeof UV, px: [number, number, number], p: V3, grow = 0) => (
  <group position={p} rotation={[0, 0, Math.PI]}>
    <TexBox tex={TEX} px={px} uv={UV[k]} s={[px[0] + 2 * grow, px[2] + 2 * grow, px[1] + 2 * grow]} alphaTest={grow > 0 ? 0.5 : 0} />
  </group>
);

export const QiaoLeifu: React.FC<{ pose: FigurePose; rightHand?: React.ReactNode; leftHand?: React.ReactNode }> = ({ pose, rightHand: rightHand, leftHand }) => (
  <Figure
    pose={pose}
    height={qiaoLeifuHeight}
    head={
      <>
        {skinBox('head', [8, 8, 8], [0, 0, 4])}
        {skinBox('hat', [8, 8, 8], [0, 0, 4], 0.5)}
      </>
    }
    torso={
      <>
        {skinBox('body', [8, 12, 4], [0, 0, 18])}
        {skinBox('jacket', [8, 12, 4], [0, 0, 18], 0.25)}
      </>
    }
    armR={
      <>
        {skinBox('armR', [4, 12, 4], [0, 0, -4])}
        {skinBox('sleeveR', [4, 12, 4], [0, 0, -4], 0.25)}
      </>
    }
    armL={
      <>
        {skinBox('armL', [4, 12, 4], [0, 0, -4])}
        {skinBox('sleeveL', [4, 12, 4], [0, 0, -4], 0.25)}
      </>
    }
    legR={
      <>
        {skinBox('legR', [4, 12, 4], [0, 0, -6])}
        {skinBox('pantsR', [4, 12, 4], [0, 0, -6], 0.25)}
      </>
    }
    legL={
      <>
        {skinBox('legL', [4, 12, 4], [0, 0, -6])}
        {skinBox('pantsL', [4, 12, 4], [0, 0, -6], 0.25)}
      </>
    }
    handR={rightHand}
    handL={leftHand}
  />
);
