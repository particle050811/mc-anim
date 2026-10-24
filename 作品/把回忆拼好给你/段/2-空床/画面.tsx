// 2-空床 的画面：卧室侧剖面（场/2-卧室/卧室.tsx 的 卧室画布，N = 22），两张床、窗光，她一个人；外面整片后期，符文歌词（全片 15 行，按歌自己进出）浮在最上面、一起过后期。
// 谁在哪、什么姿势、窗光哪一档、镜头挪到哪全在 编排.ts，这里只按它画。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 戴帽子 } from '../../场/2-卧室/参数.ts';
import { 卧室画布 } from '../../场/2-卧室/卧室.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 光态, 她态, 歌曲帧, 镜 } from './编排.ts';
import 段 from './段.ts';

const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 歌曲帧(0)));

const 她: React.FC<{ f: number }> = ({ f }) => {
  const s = 她态(f);
  return (
    <描边>
      <贴图像素对齐 锚={s.loc}>
        <MagicalWineFoxEx pose={{ ...standPose(s.loc), yaw: s.yaw }} 姿势="静站" 表情={s.表情} 看={s.看} 骨骼={s.骨骼} 眨眼={0} 帽子={戴帽子} 背后法杖={false} />
      </贴图像素对齐>
    </描边>
  );
};

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 光 = 光态(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <整片后期 调色={光.调子.调色} 种子={歌曲帧(f)}>
        <卧室画布 调子={光.调子} 天={光.天} 光={光.光} 取景={镜(f)}>
          <她 f={f} />
        </卧室画布>
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 光.调子.描边 }} />
      </整片后期>
    </>
  );
};

export default 画面;
