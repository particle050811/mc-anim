// 第 4 句（段 2-日落划船）的整帧画法，段和核对段共用：眼睛特写（段从 场/2-祭坛 接过来画，见 日落划船画面 的 眼睛）→ 叠化 → 日落的海
// （天.tsx 在后、三渲二画布透明在前：海面、船、你、她）→ 浪（浪.tsx）。
// 两个镜头各包自己的整片后期（眼睛是白天那套、海是日落那套），叠化默认按 4×4 Bayer 阵一格一格换成海，不混色（像素画的做法，同 main 上原来的抖动叠化；
// 只是 眼化日 挪早了，叠化从 1/4 秒拉长到 0.46 秒）；别的画法见 参数.ts 的 叠化样式名。
// 歌词不在这里画：段的画面在最上面叠符文歌词，照片帧不带。
// 不描边（规矩 不描边，用户 10-24）：画布的描边跟 画风.ts 的全片开关走，段里不自己开。
// 谁在哪、镜头在哪全在 编排.ts，这里只按它画。
// 光影按段开（默认.ts 的 光影段，照片里的这一镜跟着本段开），这里只给太阳方向和海平面：海面在世界高度 0。
import React, { useId } from 'react';
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
import { 光影段 } from '../../默认.ts';
import { 画布调子 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 亮度溶解, 人船日落, 叠化格, 模糊, 海日落, 海调子名, 眼调子名, 颗粒格, type 叠化样式名, type 浪样式名 } from './参数.ts';
import { 她位, 你位, 叠化, 太阳方向, 段键, 浪进, 海机位, 游戏刻, 照片帧, 秒, 船态, 页 } from './编排.ts';
import { 日落天 } from './天.tsx';
import { 海面 } from './海面.tsx';
import { 日落浪 } from './浪.tsx';

const 全屏: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: 页.宽, height: 页.高, overflow: 'hidden' };

/** 船和人、海面乘的色调（见 参数.ts 人船日落、海日落） */
const 人船色调 = 插调子(色板.夏日白天, 色板[海调子名], 人船日落).色调;
const 海色调 = 插调子(色板.夏日白天, 色板[海调子名], 海日落).色调;

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
      <三渲二画布
        宽={页.宽}
        高={页.高}
        机位={{ 种: '透视', ...机 }}
        色调={t.色调}
        描边={t.描边}
        光影={光影段[段键] ?? null}
        光影场={{ 时段: '日落', 太阳: 太阳方向(游戏刻(g)), 海平面: 0 }}
      >
        <海面 机={机} 宽={页.宽} 高={页.高} 船={船} 刻={s * 20} 色调={海色调} />
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

// 细颗粒溶解：每颗一个固定的随机门槛（同一颗每帧一样），叠化到 k 时门槛 < k 的颗换成海；一行里连着留下的颗并成一个矩形，路径短一些
const 门槛 = (i: number, j: number) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const 留下的颗 = (k: number) => {
  const s = 颗粒格;
  const 段们: string[] = [];
  for (let y = 0; y * s < 页.高; y++) {
    let 起 = -1;
    for (let x = 0; x * s <= 页.宽; x++) {
      const 留 = x * s < 页.宽 && 门槛(x, y) >= k;
      if (留 && 起 < 0) 起 = x;
      else if (!留 && 起 >= 0) {
        段们.push(`M${起 * s} ${y * s}h${(x - 起) * s}v${s}h${-(x - 起) * s}Z`);
        起 = -1;
      }
    }
  }
  return `path('${段们.join('') || 'M0 0Z'}')`;
};

/** 按亮度溶解的 SVG 滤镜：透明度 = (亮度 − 门槛) ÷ 边宽，夹在 0～1；门槛随 k 从 起 − 边宽 走到 止 */
const 亮度滤镜 = (id: string, k: number) => {
  const { 起, 止, 边宽 } = 亮度溶解;
  const t = 起 - 边宽 + k * (止 - 起 + 边宽);
  const s = 1 / 边宽;
  const 阵 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0.2126 * s, 0.7152 * s, 0.0722 * s, 0, -t * s].map((v) => +v.toFixed(6)).join(' ');
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }}>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={阵} />
      </filter>
    </svg>
  );
};

/** 叠化到 k 时眼睛那层、海那层各加什么样式（按亮度溶解另带一个 SVG 滤镜，id 是 滤镜id） */
const 叠化层样式 = (样式: 叠化样式名, k: number, 滤镜id: string): { 眼: React.CSSProperties; 海: React.CSSProperties } => {
  if (k <= 0 || k >= 1) return { 眼: {}, 海: {} };
  switch (样式) {
    case '按亮度溶解':
      return { 眼: { filter: `url(#${滤镜id})` }, 海: {} };
    case '交叉淡化':
      return { 眼: { opacity: 1 - k }, 海: {} };
    case '模糊溶解':
      return { 眼: { opacity: 1 - k, filter: `blur(${(k * 模糊.眼).toFixed(3)}px)` }, 海: { filter: `blur(${((1 - k) * 模糊.海).toFixed(3)}px)` } };
    case '细颗粒溶解':
      return { 眼: { clipPath: 留下的颗(k) }, 海: {} };
    default:
      return { 眼: { clipPath: 留下的格(k) }, 海: {} };
  }
};

export type 日落划船画面属性 = {
  歌曲帧: number;
  /** 眼睛特写那一镜（不带后期）：第 3 句祭坛的画面接着往她右眼里推（段把 场/2-祭坛 的 祭坛画面 配上 编排.ts 的 眼机位 传进来；
   *  场之间不能互引，所以这里不自己画）。「海平线」以后用不着，照片帧不用给 */
  眼睛?: (歌曲帧: number) => React.ReactNode;
  /** 画不画浪（照片帧不画） */
  浪?: boolean;
  /** 整片后期（核对时可以关掉比） */
  后期?: boolean;
  /** 匹配剪辑的画法（参数.ts 的 叠化样式名），不给 = 方格 */
  叠化样式?: 叠化样式名;
  /** 浪的画法（参数.ts 的 浪样式名），不给 = 像素 */
  浪样式?: 浪样式名;
};

/** 一整帧（1280×720，不带歌词），放在 position 不是 static 的容器里 */
export const 日落划船画面: React.FC<日落划船画面属性> = ({ 歌曲帧: g, 眼睛, 浪 = true, 后期 = true, 叠化样式 = '方格', 浪样式 = '像素' }) => {
  const k = 叠化(g);
  const 进 = 浪 ? 浪进(g) : 0;
  const 滤镜id = `ld${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const 层 = 叠化层样式(叠化样式, k, 滤镜id);
  const 海 = (
    <整片后期 调色={后期 ? 色板[海调子名].调色 : null} 种子={g}>
      <海上镜头 歌曲帧={g} />
      {进 > 0 && <日落浪 进={进} 宽={页.宽} 高={页.高} 样式={浪样式} />}
    </整片后期>
  );
  return (
    <div style={全屏}>
      {k > 0 && (层.海.filter ? <div style={{ ...全屏, ...层.海 }}>{海}</div> : 海)}
      {k > 0 && k < 1 && 叠化样式 === '按亮度溶解' && 亮度滤镜(滤镜id, k)}
      {k < 1 && 眼睛 && (
        <div style={{ ...全屏, ...层.眼 }}>
          <整片后期 调色={后期 ? 色板[眼调子名].调色 : null} 种子={g}>
            {眼睛(g)}
          </整片后期>
        </div>
      )}
    </div>
  );
};

/** 第 8 句第二张照片（日落划船）的那一帧：拉远到位以后、浪起之前，不带歌词和浪，后期照常 */
export const 日落划船照片: React.FC<{ 后期?: boolean }> = ({ 后期 = true }) => <日落划船画面 歌曲帧={照片帧} 浪={false} 后期={后期} />;
