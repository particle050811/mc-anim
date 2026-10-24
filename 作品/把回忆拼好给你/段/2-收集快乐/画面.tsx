// 2-收集快乐 的画面：门这个机位整屏（场/2-门口/门口.tsx 的 门口画布 + 参数.ts 的 整屏镜头，N = 10），小木屋开着门、开着箱子，门外一丛高草，
// 她、你、苦力怕、手里的照片，她头顶的气泡，外面整片后期；歌词浮在最上面，不过后期。谁在哪、什么姿势全在 编排.ts，这里只按它画。
// 和静帧「门口哈气」（核对-门口哈气 定稿）同一套画法：三个角色各包一组描边，颗粒的种子用歌曲帧，哈气那一帧（歌曲帧 667）就是那张静帧再加门外那丛草。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { Creeper } from '@库/生物/苦力怕.tsx';
import { 女仆气泡, 女仆气泡锚高 } from '@库/界面/女仆气泡.tsx';
import { 画幅, 第几句 } from '../../分镜.ts';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 门口, 格原点 } from '../../地点/门口小木屋.tsx';
import { 正交顶面, 群系, 整屏镜头, 整屏镜头N } from '../../场/2-门口/参数.ts';
import { 门口画布 } from '../../场/2-门口/门口.tsx';
import { 门外草丛, 门外草丛排 } from '../../场/2-门口/门外草丛.ts';
import { 第8句调子 } from '../../场/2-门口/第8句.ts';
import { 歌词样式 } from '../../场/2-门口/第8句参数.ts';
import { 歌词 } from '../../界面/歌词.tsx';
import { 像素字 } from '../../界面/像素字.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 照片 } from '../../特效/照片.tsx';
import { 事, 她态, 你态, 气泡态, 照片态, 苦力怕态, 歌曲帧 } from './编排.ts';
import 段 from './段.ts';
import 纸声1 from 'asset:音效/item.book.page_turn.1';
import 纸声2 from 'asset:音效/item.book.page_turn.2';
import 纸声3 from 'asset:音效/item.book.page_turn.3';
import 哈气声 from 'asset:音效/把回忆拼好给你/entity.cat.hiss.1';

const 宽 = 画幅.宽, 高 = 画幅.高;
const 站 = 门口.站排y;

const 草丛: 方块[] = 门外草丛.flatMap(([状态, x]) => [
  { 状态: `${状态}[half=lower]`, 位: [x, 门外草丛排, 0] as V3 },
  { 状态: `${状态}[half=upper]`, 位: [x, 门外草丛排, 1] as V3 },
]);

const 角色们: React.FC<{ f: number }> = ({ f }) => {
  const 她 = 她态(f);
  const 你 = 你态(f);
  // 不传 sec、两臂外摆清零（同 场/2-门口/哈气.tsx：原版站着两臂的轻晃会让胳膊斜着）
  const 你姿 = { ...stevePose([你.x, 站, 0], 你.yaw, { headYaw: 你.headYaw, scale: 你.倍数 }), armRRoll: 0, armLRoll: 0 };
  const 怕 = 苦力怕态(f);
  const 照 = 照片态(f);
  return (
    <>
      <描边>
        <贴图像素对齐 锚={你姿.loc as V3}>
          <Steve pose={你姿} />
        </贴图像素对齐>
      </描边>
      <描边>
        <贴图像素对齐 锚={她.loc}>
          <MagicalWineFoxEx
            pose={{ ...standPose(她.loc), yaw: 她.yaw }}
            姿势={她.姿势}
            表情={她.表情}
            看={她.看}
            骨骼={她.骨骼}
            眨眼={她.眨眼}
            秒={她.秒}
            背后法杖={false}
          />
        </贴图像素对齐>
      </描边>
      <描边>
        <贴图像素对齐 锚={怕.loc}>
          <Creeper pose={怕} />
        </贴图像素对齐>
      </描边>
      {照 && (
        <描边>
          <照片 画={照.画} 底={照.底} 缩放={照.缩放} />
        </描边>
      )}
    </>
  );
};

const 气泡: React.FC<{ f: number }> = ({ f }) => {
  const 泡 = 气泡态(f);
  if (!泡) return null;
  const 锚 = 侧投影(整屏镜头.取景, 宽, 高, 正交顶面)(泡.x, 女仆气泡锚高(), 站);
  return <女仆气泡 锚={锚} 缩放={整屏镜头N} 文字={泡.字} 字体={像素字} 锚对齐={整屏镜头N} />;
};

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={纸声1} 资产="音效/item.book.page_turn.1" 段={段} />
      <音效轨 src={纸声2} 资产="音效/item.book.page_turn.2" 段={段} />
      <音效轨 src={纸声3} 资产="音效/item.book.page_turn.3" 段={段} />
      <音效轨 src={哈气声} 资产="音效/把回忆拼好给你/entity.cat.hiss.1" 段={段} />
      <整片后期 调色={第8句调子.调色} 种子={歌曲帧(f)}>
        <门口画布 门开 箱子开度={1} 调子={第8句调子} {...整屏镜头} 叠层={<气泡 f={f} />}>
          <方块拼搭 方块们={草丛} 原点={格原点} 群系={群系} 正面花草 />
          <角色们 f={f} />
        </门口画布>
      </整片后期>
      <歌词 行们={[{ 词: 第几句(8).词, 入: 事.第8句开口 }]} 样式={歌词样式} />
    </>
  );
};

export default 画面;
