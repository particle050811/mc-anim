// 第 4 句（段 2-日落划船）的整帧画法，段和核对段共用：眼睛特写（段从 场/2-祭坛 接过来画，见 日落划船画面 的 眼睛）→ 叠化 → 日落的海
// （天.tsx 在后、三渲二画布透明在前：海面、船、你、她）→ 浪（浪.tsx）。
// 两个镜头各包自己的整片后期（眼睛是白天那套、海是日落那套），叠化默认按 4×4 Bayer 阵一格一格换成海，不混色（像素画的做法，同 main 上原来的抖动叠化；
// 只是 眼化日 挪早了，叠化从 1/4 秒拉长到 0.46 秒）；别的画法见 参数.ts 的 叠化样式名。
// 歌词不在这里画：段的画面在最上面叠符文歌词，照片帧不带。
// 不描边（规矩 不描边，用户 10-24）：画布的描边跟 画风.ts 的全片开关走，段里不自己开。
// 谁在哪、镜头在哪全在 编排.ts，这里只按它画。
// 光影按段开（默认.ts 的 光影段，照片里的这一镜跟着本段开），这里只给太阳方向和海平面：海面在世界高度 0。
import React, { useId } from 'react';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { FlatShade } from '@engine/三渲二/平涂.tsx';
import { lerpTone } from '@engine/三渲二/调子.ts';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { VanillaBoat } from '@库/物品/船.tsx';
import { ridingLimbs } from '@库/物品/船原版.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { magicalWineFoxBoatBones } from '@库/角色/魔法酒狐坐船.ts';
import { shadingBySeg } from '../../默认.ts';
import { canvasTone } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { brightnessDissolve, personBoatSunset, crossfadeCell, blurAmounts, seaSunset, seaToneName, eyeToneName, grainCell, type CrossfadeStyleName, type WaveStyleName } from './参数.ts';
import { herPos, youPos, crossfade, sunDirection, segKey, surgeIn, seaCameraRig, gameTick, photoFrame, toSec, BoatState, pageSize } from './编排.ts';
import { SunsetSky } from './天.tsx';
import { SeaSurface } from './海面.tsx';
import { SeaFloorBlocks, shouldDrawSeabed } from './海底.tsx';
import { SunsetWave } from './浪.tsx';

const fullscreen: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: pageSize.宽, height: pageSize.高, overflow: 'hidden' };

/** 船和人、海面乘的色调（见 参数.ts 人船日落、海日落） */
const personBoatTone = lerpTone(palette.夏日白天, palette[seaToneName], personBoatSunset).tint;
const seaTone = lerpTone(palette.夏日白天, palette[seaToneName], seaSunset).tint;

/** 海上这一镜（不带后期、浪）：天、海、船和船上的两个人 */
export const SeaShot: React.FC<{ songFrame: number }> = ({ songFrame: g }) => {
  const rig = seaCameraRig(g);
  const t = canvasTone(seaToneName);
  const boat = BoatState(g);
  const you = youPos(g);
  const liYing = herPos(g);
  const s = toSec(g);
  return (
    <div style={fullscreen}>
      <SunsetSky 机={rig} 刻={gameTick(g)} 宽={pageSize.宽} 高={pageSize.高} />
      <ToonCanvas
        宽={pageSize.宽}
        高={pageSize.高}
        cameraRig={{ 种: '透视', ...rig }}
        tint={t.tint}
        outline={t.outline}
        shading={shadingBySeg[segKey] ?? null}
        shadingScene={{ timeOfDay: '日落', sun: sunDirection(gameTick(g)), 海平面: 0 }}
      >
        <SeaSurface 机={rig} 宽={pageSize.宽} 高={pageSize.高} 船={boat} 刻={s * 20} tint={seaTone} />
        <FlatShade tint={personBoatTone}>
          {shouldDrawSeabed() && <SeaFloorBlocks />}
          <VanillaBoat loc={boat.loc} yaw={boat.yaw} oar={boat.oar} />
          <Steve pose={ridingLimbs(stevePose(you.loc, you.yaw, { sec: s }))} />
          <MagicalWineFox pose={{ ...standPose(liYing.loc), yaw: liYing.yaw }} stancePose="站" skeleton={magicalWineFoxBoatBones} 看={liYing.看} expression="微笑" 秒={s} />
        </FlatShade>
      </ToonCanvas>
    </div>
  );
};

// 4×4 Bayer 阵：叠化到 k 时，阵值 < 16k 的格换成海
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 眼睛那层还留着的格子（CSS clip-path） */
const keptCells = (k: number) => {
  const s = crossfadeCell;
  const segments: string[] = [];
  for (let y = 0; y * s < pageSize.高; y++)
    for (let x = 0; x * s < pageSize.宽; x++) if (bayer[(y % 4) * 4 + (x % 4)]! >= k * 16) segments.push(`M${x * s} ${y * s}h${s}v${s}h${-s}Z`);
  return `path('${segments.join('') || 'M0 0Z'}')`;
};

// 细颗粒溶解：每颗一个固定的随机门槛（同一颗每帧一样），叠化到 k 时门槛 < k 的颗换成海；一行里连着留下的颗并成一个矩形，路径短一些
const threshold = (i: number, j: number) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const remainingClip = (k: number) => {
  const s = grainCell;
  const segments: string[] = [];
  for (let y = 0; y * s < pageSize.高; y++) {
    let startIndex = -1;
    for (let x = 0; x * s <= pageSize.宽; x++) {
      const keep = x * s < pageSize.宽 && threshold(x, y) >= k;
      if (keep && startIndex < 0) startIndex = x;
      else if (!keep && startIndex >= 0) {
        segments.push(`M${startIndex * s} ${y * s}h${(x - startIndex) * s}v${s}h${-(x - startIndex) * s}Z`);
        startIndex = -1;
      }
    }
  }
  return `path('${segments.join('') || 'M0 0Z'}')`;
};

/** 按亮度溶解的 SVG 滤镜：透明度 = (亮度 − 门槛) ÷ 边宽，夹在 0～1；门槛随 k 从 起 − 边宽 走到 止 */
const brightnessFilter = (id: string, k: number) => {
  const { 起: start, 止: end, edgeWidth } = brightnessDissolve;
  const t = start - edgeWidth + k * (end - start + edgeWidth);
  const s = 1 / edgeWidth;
  const colorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0.2126 * s, 0.7152 * s, 0.0722 * s, 0, -t * s].map((v) => +v.toFixed(6)).join(' ');
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }}>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={colorMatrix} />
      </filter>
    </svg>
  );
};

/** 叠化到 k 时眼睛那层、海那层各加什么样式（按亮度溶解另带一个 SVG 滤镜，id 是 滤镜id） */
const crossfadeLayerStyle = (blendStyle: CrossfadeStyleName, k: number, filterId: string): { 眼: React.CSSProperties; 海: React.CSSProperties } => {
  if (k <= 0 || k >= 1) return { 眼: {}, 海: {} };
  switch (blendStyle) {
    case '按亮度溶解':
      return { 眼: { filter: `url(#${filterId})` }, 海: {} };
    case '交叉淡化':
      return { 眼: { opacity: 1 - k }, 海: {} };
    case '模糊溶解':
      return { 眼: { opacity: 1 - k, filter: `blur(${(k * blurAmounts.眼).toFixed(3)}px)` }, 海: { filter: `blur(${((1 - k) * blurAmounts.海).toFixed(3)}px)` } };
    case '细颗粒溶解':
      return { 眼: { clipPath: remainingClip(k) }, 海: {} };
    default:
      return { 眼: { clipPath: keptCells(k) }, 海: {} };
  }
};

export type SunsetRowingPictureProps = {
  songFrame: number;
  /** 眼睛特写那一镜（不带后期）：第 3 句祭坛的画面接着往她右眼里推（段把 场/2-祭坛 的 祭坛画面 配上 编排.ts 的 眼机位 传进来；
   *  场之间不能互引，所以这里不自己画）。「海平线」以后用不着，照片帧不用给 */
  eyeView?: (songFrame: number) => React.ReactNode;
  /** 画不画浪（照片帧不画） */
  waveOn?: boolean;
  /** 整片后期（核对时可以关掉比） */
  withPost?: boolean;
  /** 匹配剪辑的画法（参数.ts 的 叠化样式名），不给 = 方格 */
  crossfadeStyle?: CrossfadeStyleName;
  /** 浪的画法（参数.ts 的 浪样式名），不给 = 像素 */
  waveStyle?: WaveStyleName;
};

/** 一整帧（1280×720，不带歌词），放在 position 不是 static 的容器里 */
export const SunsetRowingPicture: React.FC<SunsetRowingPictureProps> = ({ songFrame: g, eyeView, waveOn = true, withPost = true, crossfadeStyle = '方格', waveStyle = '像素' }) => {
  const k = crossfade(g);
  const waveIn = waveOn ? surgeIn(g) : 0;
  const filterId = `ld${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const layerStyle = crossfadeLayerStyle(crossfadeStyle, k, filterId);
  const seaLayer = (
    <FilmPost grade={withPost ? palette[seaToneName].grade : null} 种子={g}>
      <SeaShot songFrame={g} />
      {waveIn > 0 && <SunsetWave waveIn={waveIn} 宽={pageSize.宽} 高={pageSize.高} 样式={waveStyle} />}
    </FilmPost>
  );
  return (
    <div style={fullscreen}>
      {k > 0 && (layerStyle.海.filter ? <div style={{ ...fullscreen, ...layerStyle.海 }}>{seaLayer}</div> : seaLayer)}
      {k > 0 && k < 1 && crossfadeStyle === '按亮度溶解' && brightnessFilter(filterId, k)}
      {k < 1 && eyeView && (
        <div style={{ ...fullscreen, ...layerStyle.眼 }}>
          <FilmPost grade={withPost ? palette[eyeToneName].grade : null} 种子={g}>
            {eyeView(g)}
          </FilmPost>
        </div>
      )}
    </div>
  );
};

/** 第 8 句第二张照片（日落划船）的那一帧：拉远到位以后、浪起之前，不带歌词和浪，后期照常 */
export const SunsetRowingPhoto: React.FC<{ withPost?: boolean }> = ({ withPost = true }) => <SunsetRowingPicture songFrame={photoFrame} waveOn={false} withPost={withPost} />;
