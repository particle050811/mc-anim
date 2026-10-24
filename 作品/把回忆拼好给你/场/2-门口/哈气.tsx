// 第 8 句哈气那一拍（三稿 27.80）：三个角色（三维，放进 门口画布 的 children）和她头顶的气泡（2D，放进 门口画布 的 叠层）。
// 站位、朝向、调子见 第8句.ts。角色都套 贴图像素对齐（只吸附脚底到像素网格）；描边 开着时三个都描（苦力怕绿身子压在草地上，不描就糊成一片）。
// 她不画背后法杖：哈气时法杖竖在炸毛的尾巴前面，缩小了就是一根黑杠。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 描边 as 描 } from '@engine/三渲二/描边.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { Creeper } from '@库/生物/苦力怕.tsx';
import { 女仆气泡, 女仆气泡锚高 } from '@库/界面/女仆气泡.tsx';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 门口 } from '../../地点/门口小木屋.tsx';
import { 像素字 } from '../../界面/像素字.ts';
import { 正交顶面, type 门口取景 } from './参数.ts';
import { 哈气头, 哈气朝向, 哈气气泡字, 哈气看, 哈气爪, 哈气站位, 史蒂夫倍数, 苦力怕停步 } from './第8句.ts';

const 站 = 门口.站排y;
const 脚 = (x: number): V3 => [x, 站, 0];

export type 哈气角色属性 = {
  /** 歌上的秒（分镜.ts 的 正片事件.哈气.秒）：史蒂夫两臂的轻晃、她的法杖和尾巴按它取样 */
  秒: number;
  描边?: boolean;
  /** 盖在她的默认参数上（试别的头转角、爪子摆法用） */
  她?: Partial<魔法酒狐新动作Props>;
  /** 盖在你的朝向、头转角上（度，同 stevePose） */
  你?: { yaw?: number; headYaw?: number };
  /** 盖在苦力怕的头转角上（度，同 CreeperPose） */
  苦力怕头?: number;
};

export const 哈气角色: React.FC<哈气角色属性> = ({ 秒, 描边 = true, 她, 你: 你改, 苦力怕头 = 哈气头.苦力怕 }) => {
  const 你 = stevePose(脚(哈气站位.你), 你改?.yaw ?? 哈气朝向.你, { sec: 秒, scale: 史蒂夫倍数, headYaw: 你改?.headYaw ?? 哈气头.你 });
  const 她姿 = { ...standPose(脚(哈气站位.她)), yaw: 哈气朝向.她 };
  const 怕 = { loc: 脚(哈气站位.苦力怕), yaw: 哈气朝向.苦力怕, headYaw: 苦力怕头, ...苦力怕停步 };
  return (
    <描 开={描边}>
      <贴图像素对齐 锚={你.loc as V3}>
        <Steve pose={你} />
      </贴图像素对齐>
      <贴图像素对齐 锚={她姿.loc as V3}>
        <MagicalWineFoxEx pose={她姿} 姿势="哈气" 表情="哈气" 看={哈气看} 骨骼={哈气爪} 背后法杖={false} 眨眼={0} 秒={秒} {...她} />
      </贴图像素对齐>
      <贴图像素对齐 锚={怕.loc}>
        <Creeper pose={怕} />
      </贴图像素对齐>
    </描>
  );
};

/** 她头顶的「˃ʍ˂」：锚在她脚底正上方 女仆气泡锚高 处（游戏里名牌的位置），一个气泡像素 = 一个方块贴图像素（取景的 N 个成片像素）。
 *  坐标是整屏 门口画布（1280×720、正交顶面）的页面坐标，取景 要和画布的同一个 */
export const 哈气气泡: React.FC<{ 取景: 门口取景 }> = ({ 取景 }) => {
  const N = 取景.每格 / 16;
  const 锚 = 侧投影(取景, 1280, 720, 正交顶面)(哈气站位.她, 女仆气泡锚高(), 站);
  return <女仆气泡 锚={锚} 缩放={N} 文字={哈气气泡字} 字体={像素字} 锚对齐={N} />;
};
