// 2-空床 的画面：卧室侧剖面（场/2-卧室/卧室.tsx 的 卧室画布，N = 26），两张床、窗光，她一个人；外面整片后期，符文歌词（全片 15 行，按歌自己进出）浮在最上面、一起过后期。
// 开头几帧从 2-截图下线 最后的下线画面化进来（场/2-卧室/参数.ts 的 开场化帧）。
// 谁在哪、什么姿势、窗光哪一档、镜头挪到哪、屋外和后期怎么接 2-时差 全在 编排.ts，这里只按它画。全片不描边（用户 10-24 定）：她单独套一层平涂，色调比屋里提亮（编排.ts 的 她色调）。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 平涂 } from '@engine/三渲二/平涂.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFoxEx, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 帽子抬, 开场化帧, 戴帽子 } from '../../场/2-卧室/参数.ts';
import { 卧室画布 } from '../../场/2-卧室/卧室.tsx';
import { 门口之夜照片 } from '../../场/2-门口/门口之夜照片.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 光态, 后期调色, 她态, 她色调, 屋外态, 歌曲帧, 镜 } from './编排.ts';
import 段 from './段.ts';

const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 歌曲帧(0)));

/** 帽子整顶往上抬 帽子抬（同 场/2-隐世之境/对视.tsx 的做法），在组件摆好的 witchcap 上加 */
const 抬帽 = (p: 魔法酒狐新动作Props): BonePose => {
  const w = magicalWineFoxExBones(p).witchcap ?? {};
  const [px = 0, py = 0, pz = 0] = (w.pos as number[] | undefined) ?? [];
  return { ...w, pos: [px, py + 帽子抬, pz] };
};

const 她: React.FC<{ f: number; 色调: string }> = ({ f, 色调 }) => {
  const s = 她态(f);
  const p: 魔法酒狐新动作Props = {
    pose: { ...standPose(s.loc), yaw: s.yaw },
    姿势: '静站',
    表情: s.表情,
    看: s.看,
    眨眼: 0,
    帽子: 戴帽子,
    背后法杖: false,
    骨骼: s.骨骼,
  };
  return (
    <平涂 色调={色调}>
      <贴图像素对齐 锚={s.loc}>
        <MagicalWineFoxEx {...p} 骨骼={{ ...s.骨骼, ...(戴帽子 ? { witchcap: 抬帽(p) } : {}) }} />
      </贴图像素对齐>
    </平涂>
  );
};

/** 开头那几帧盖在卧室上的第 11 句末画面（照 2-截图下线 按歌曲帧接着画，最后一帧之后图标、聊天栏不动），不透明度两头慢地退到 0 */
const 下线余影: React.FC<{ f: number }> = ({ f }) => {
  if (f >= 开场化帧) return null;
  const t = (f + 1) / (开场化帧 + 1);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - t * t * (3 - 2 * t) }}>
      <门口之夜照片 帧={歌曲帧(f)} />
    </div>
  );
};

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const 光 = 光态(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      <整片后期 调色={后期调色(f)} 种子={歌曲帧(f)}>
        <卧室画布 调子={光.调子} 天={光.天} 光={光.光} 门外亮={光.门外亮} 屋外={屋外态(f)} 取景={镜(f)}>
          <她 f={f} 色调={她色调(光.调子.色调)} />
        </卧室画布>
        <下线余影 f={f} />
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 光.调子.描边 }} />
      </整片后期>
    </>
  );
};

export default 画面;
