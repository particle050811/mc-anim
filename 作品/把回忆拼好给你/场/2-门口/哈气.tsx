// 第 8 句哈气那一拍（三稿 27.80）：三个角色（三维，放进 门口画布 的 children）和她头顶的气泡（2D，放进 门口画布 的 叠层）。
// 站位、朝向、调子、取景（第8句镜头，N = 16）见 第8句.ts。角色都套 贴图像素对齐（只吸附脚底到像素网格）。她用 第8句炸毛.tsx 的 哈气酒狐（大张的嘴、炸毛的尾巴）。
// 她不画背后法杖：哈气时法杖竖在炸毛的尾巴前面，缩小了就是一根黑杠。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import type { MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { Creeper } from '@库/生物/苦力怕.tsx';
import { MaidBubble, bubbleAnchorHeight } from '@库/界面/女仆气泡.tsx';
import { sideProjection } from '../../地点/侧剖面.tsx';
import { entrance } from '../../地点/门口小木屋.tsx';
import { pixelFont } from '../../界面/像素字.ts';
import { orthoTop, type DoorFraming } from './参数.ts';
import { youHead, steveScale, puffLook, hissTail, hissFacing, hissBubbleText, puffPaws, hissStandPos, creeperStill } from './第8句.ts';
import { HissingWineFox } from './第8句炸毛.tsx';

const standY = entrance.standRowY;
const feetAt = (x: number): V3 => [x, standY, 0];

type StandPos = { 你: number; liYingX: number; 苦力怕: number };

export type HissRoleProps = {
  /** 盖在 哈气站位 上（脚底的 x，格） */
  standPos?: Partial<StandPos>;
  /** 盖在她的默认参数上（看 默认 哈气看）；骨骼 按骨骼名盖在 哈气爪、哈气尾 上。默认不给 秒：屏住气不呼吸 */
  liYing?: Partial<MagicalWineFoxExProps>;
  /** 盖在你的朝向、头转角（度，同 stevePose）、整体倍数（第8句.ts 的 史蒂夫倍数）上 */
  你?: { yaw?: number; headYaw?: number; scale?: number };
  /** 盖在苦力怕的朝向、头转角上（度，同 CreeperPose） */
  苦力怕?: { yaw?: number; headYaw?: number };
};

export const PuffCharacter: React.FC<HissRoleProps> = ({ standPos: standOverride, liYing, 你: youOverride, 苦力怕: creeperOverride }) => {
  const standPos = { ...hissStandPos, ...standOverride };
  // 不传 sec、两臂的 bobModelPart 外摆清零：原版站着两臂也绕 z 外摆 0～5.7°（sec = 0 时正好 5.7°），正交里胳膊边斜成台阶
  const you = {
    ...stevePose(feetAt(standPos.你), youOverride?.yaw ?? hissFacing.你, { headYaw: youOverride?.headYaw ?? youHead, scale: youOverride?.scale ?? steveScale }),
    armRRoll: 0,
    armLRoll: 0,
  };
  const liYingPose = { ...standPose(feetAt(standPos.liYingX)), yaw: hissFacing.liYingYaw };
  const creeper = { ...creeperStill, loc: feetAt(standPos.苦力怕), yaw: hissFacing.苦力怕, ...creeperOverride };
  return (
    <>
      <TexturePixelAlign 锚={you.loc as V3}>
        <Steve pose={you} />
      </TexturePixelAlign>
      <TexturePixelAlign 锚={liYingPose.loc as V3}>
        <HissingWineFox pose={liYingPose} stancePose="哈气" expression="哈气" 看={puffLook} backStaff={false} blink={0} {...liYing} skeleton={{ ...puffPaws, ...hissTail, ...liYing?.skeleton }} />
      </TexturePixelAlign>
      <TexturePixelAlign 锚={creeper.loc}>
        <Creeper pose={creeper} />
      </TexturePixelAlign>
    </>
  );
};

/** 她头顶的「˃ʍ˂」：锚在她脚底正上方 女仆气泡锚高 处（游戏里名牌的位置），一个气泡像素 = 一个方块贴图像素（取景的 N 个成片像素）。
 *  坐标是整屏 门口画布（1280×720、正交顶面）的页面坐标，取景 要和画布的同一个（第8句镜头 或别的）；她挪了位置就给 她x */
export const PuffBubble: React.FC<{ framing: DoorFraming; liYingX?: number }> = ({ framing, liYingX = hissStandPos.liYingX }) => {
  const N = framing.pxPerCell / 16;
  const anchor = sideProjection(framing, 1280, 720, orthoTop)(liYingX, bubbleAnchorHeight(), standY);
  return <MaidBubble 锚={anchor} 缩放={N} 文字={hissBubbleText} 字体={pixelFont} anchorAlign={N} />;
};
