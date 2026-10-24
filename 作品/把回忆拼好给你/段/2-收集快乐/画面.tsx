// 2-收集快乐 的画面：门这个机位（场/2-门口/门口.tsx 的 门口画布 + 第8句.ts 的 第8句镜头，N = 16），段首从屋顶上面的天往下摇到门口；屋后开着远景（地点/屋后远景.tsx：
// 同第 6、7 句那片地和那层云，云洞接着第 7 句末开大），下摇时远景的相机跟着仰、眼睛从高处降回来，樱花林上面那条云带沉到林子后面。
// 不画太阳（第 7 句末那一镜也没有太阳：7000 刻的太阳在头顶偏南，朝北看不见）。
// 小木屋开着门，后墙照片墙挂着三张、第四只框空着，她左手拿着光柱破云立在空框前面，推进框里；你、苦力怕、她头顶的气泡，外面整片后期；符文歌词一起过后期。
// 谁在哪、什么姿势、镜头和调子全在 编排.ts，这里只按它画。哈气那一帧（歌曲帧 667）同静帧「门口哈气」（核对-门口哈气）再加顶上的歌词。全片不描边。
import React from 'react';
import { useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { Creeper } from '@库/生物/苦力怕.tsx';
import { 女仆气泡, 女仆气泡锚高 } from '@库/界面/女仆气泡.tsx';
import { 画幅 } from '../../分镜.ts';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 地图画片, 照片墙格们 } from '../../地点/照片墙.tsx';
import { 门口 } from '../../地点/门口小木屋.tsx';
import { 正交顶面, type 门口取景 } from '../../场/2-门口/参数.ts';
import { 门口画布 } from '../../场/2-门口/门口.tsx';
import { 第8句镜头N } from '../../场/2-门口/第8句.ts';
import { 第8句云 } from '../../场/2-门口/第8句云.ts';
import { 哈气酒狐 } from '../../场/2-门口/第8句炸毛.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 第8句照片们 } from '../../特效/照片画.ts';
import { 她态, 你态, 取景在, 墙上几张, 气泡态, 照片态, 苦力怕态, 落定, 调子在, 远景升在, 歌曲帧 } from './编排.ts';
import 段 from './段.ts';
import 挂照片声 from 'asset:音效/把回忆拼好给你/entity.glow_item_frame.add_item.1';
import 哈气声 from 'asset:音效/把回忆拼好给你/entity.cat.hiss.1';

const 宽 = 画幅.宽, 高 = 画幅.高;
const 站 = 门口.站排y;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 歌曲帧(0)));
/** 照片墙一格 64 个地图像素：N = 16 是 4 的倍数，一个地图像素正好 4 个成片像素（特效/地图画.ts） */
const 照片墙边长 = 64;
const 新照片 = 第8句照片们[3]!;

const 角色们: React.FC<{ f: number }> = ({ f }) => {
  const 她 = 她态(f);
  const 你 = 你态(f);
  // 不传 sec、两臂外摆清零（同 场/2-门口/哈气.tsx：原版站着两臂的轻晃会让胳膊斜着）
  const 你姿 = { ...stevePose([你.x, 站, 0], 你.yaw, { headYaw: 你.headYaw, scale: 你.倍数 }), armRRoll: 0, armLRoll: 0 };
  const 怕 = 苦力怕态(f);
  const 照片 = 照片态(f);
  return (
    <>
      <贴图像素对齐 锚={你姿.loc as V3}>
        <Steve pose={你姿} />
      </贴图像素对齐>
      <贴图像素对齐 锚={她.loc}>
        <哈气酒狐
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
      {照片 && <地图画片 画={新照片} 边长={照片墙边长} 角={照片.角} 边={照片.边} />}
      <贴图像素对齐 锚={怕.loc}>
        <Creeper pose={怕} />
      </贴图像素对齐>
    </>
  );
};

const 气泡: React.FC<{ f: number; 取景: 门口取景 }> = ({ f, 取景 }) => {
  const 泡 = 气泡态(f);
  if (!泡) return null;
  const 锚 = 侧投影(取景, 宽, 高, 正交顶面)(泡.x, 女仆气泡锚高(), 站);
  return <女仆气泡 锚={锚} 缩放={第8句镜头N} 文字={泡.字} 字体={像素字} 锚对齐={第8句镜头N} />;
};

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 取景 = 取景在(f);
  const 调 = 调子在(f);
  const 墙 = 照片墙格们([...第8句照片们.slice(0, 墙上几张(f)), null].slice(0, 4));
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <音效轨 src={挂照片声} 资产="音效/把回忆拼好给你/entity.glow_item_frame.add_item.1" 段={段} />
      <音效轨 src={哈气声} 资产="音效/把回忆拼好给你/entity.cat.hiss.1" 段={段} />
      <整片后期 调色={调.调色} 种子={歌曲帧(f)}>
        <门口画布
          门开
          照片墙={墙}
          照片墙边长={照片墙边长}
          远景={{ 落定, 升: 远景升在(f), 云: 第8句云(歌曲帧(f)) }}
          调子={调}
          取景={取景}
          弧={null}
          叠层={<气泡 f={f} 取景={取景} />}
        >
          <角色们 f={f} />
        </门口画布>
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 调.描边 }} />
      </整片后期>
    </>
  );
};

export default 画面;
