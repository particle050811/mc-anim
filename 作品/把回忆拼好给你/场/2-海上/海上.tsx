// 第 4 句（段 2-日落划船）的整帧画法，段和核对段共用：眼睛特写（眼.tsx）→ 抖动叠化 → 日落的海（天.tsx 在后、三渲二画布透明在前：海面、船、你、她）→ 浪（浪.tsx）。
// 两个镜头各包自己的整片后期（眼睛是白天那套、海是日落那套），叠化时一格一格换，不混色。歌词不在这里画：段的画面在最上面叠符文歌词，照片帧不带。
// 不描边（规矩 不描边，用户 10-24）：画布的描边跟 画风.ts 的全片开关走，段里不自己开。
// 谁在哪、镜头在哪全在 编排.ts，这里只按它画。
import React from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 平涂 } from '@engine/三渲二/平涂.tsx';
import { 插调子 } from '@engine/三渲二/调子.ts';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 原版船 } from '@库/物品/船.tsx';
import { 骑乘腿臂 } from '@库/物品/船原版.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { magicalWineFoxBoatBones } from '@库/角色/魔法酒狐坐船.ts';
import { 画布调子 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 人船日落, 叠化格, 海调子名, 眼调子名 } from './参数.ts';
import { 她位, 你位, 叠化, 浪进, 海机位, 游戏刻, 照片帧, 秒, 船态, 页 } from './编排.ts';
import { 日落天 } from './天.tsx';
import { 海面 } from './海面.tsx';
import { 日落浪 } from './浪.tsx';
import { 眼睛特写 } from './眼.tsx';

const 全屏: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: 页.宽, height: 页.高, overflow: 'hidden' };

/** 船和人乘的色调（见 参数.ts 人船日落） */
const 人船色调 = 插调子(色板.夏日白天, 色板[海调子名], 人船日落).色调;

/** 海上这一镜（不带后期、浪）：天、海、船和船上的两个人 */
export const 海上镜头: React.FC<{ 歌曲帧: number }> = ({ 歌曲帧: g }) => {
  const 机 = 海机位(g);
  const t = 画布调子(海调子名);
  const 船 = 船态(g);
  const 你 = 你位(g);
  const 她 = 她位(g);
  const s = 秒(g);
  return (
    <div style={全屏}>
      <日落天 机={机} 刻={游戏刻(g)} 宽={页.宽} 高={页.高} />
      <三渲二画布 宽={页.宽} 高={页.高} 机位={{ 种: '透视', ...机 }} 色调={t.色调} 描边={t.描边}>
        <海面 眼={机.眼} 船={船} 秒={s} 色调={t.色调} />
        <平涂 色调={人船色调}>
          <原版船 loc={船.loc} yaw={船.yaw} 桨={船.桨} />
          <Steve pose={骑乘腿臂(stevePose(你.loc, 你.yaw, { sec: s }))} />
          <MagicalWineFox pose={{ ...standPose(她.loc), yaw: 她.yaw }} 姿势="站" 骨骼={magicalWineFoxBoatBones} 看={她.看} 表情="微笑" 秒={s} />
        </平涂>
      </三渲二画布>
    </div>
  );
};

// 4×4 Bayer 阵：叠化到 k 时，阵值 < 16k 的格换成海
const 拜耳 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 眼睛那层还留着的格子（CSS clip-path） */
const 留下的格 = (k: number) => {
  const s = 叠化格;
  const 段们: string[] = [];
  for (let y = 0; y * s < 页.高; y++)
    for (let x = 0; x * s < 页.宽; x++) if (拜耳[(y % 4) * 4 + (x % 4)]! >= k * 16) 段们.push(`M${x * s} ${y * s}h${s}v${s}h${-s}Z`);
  return `path('${段们.join('') || 'M0 0Z'}')`;
};

export type 日落划船画面属性 = {
  歌曲帧: number;
  /** 画不画浪（照片帧不画） */
  浪?: boolean;
  /** 整片后期（核对时可以关掉比） */
  后期?: boolean;
};

/** 一整帧（1280×720，不带歌词），放在 position 不是 static 的容器里 */
export const 日落划船画面: React.FC<日落划船画面属性> = ({ 歌曲帧: g, 浪 = true, 后期 = true }) => {
  const k = 叠化(g);
  const 进 = 浪 ? 浪进(g) : 0;
  return (
    <div style={全屏}>
      {k > 0 && (
        <整片后期 调色={后期 ? 色板[海调子名].调色 : null} 种子={g}>
          <海上镜头 歌曲帧={g} />
          {进 > 0 && <日落浪 进={进} 宽={页.宽} 高={页.高} />}
        </整片后期>
      )}
      {k < 1 && (
        <div style={{ ...全屏, clipPath: k > 0 ? 留下的格(k) : undefined }}>
          <整片后期 调色={后期 ? 色板[眼调子名].调色 : null} 种子={g}>
            <眼睛特写 歌曲帧={g} />
          </整片后期>
        </div>
      )}
    </div>
  );
};

/** 第 8 句第二张照片（日落划船）的那一帧：拉远到位以后、浪起之前，不带歌词和浪，后期照常 */
export const 日落划船照片: React.FC<{ 后期?: boolean }> = ({ 后期 = true }) => <日落划船画面 歌曲帧={照片帧} 浪={false} 后期={后期} />;
