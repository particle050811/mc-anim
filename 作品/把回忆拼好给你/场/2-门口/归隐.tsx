// 第 14 句「也为你骗自己放下」的一帧（1280×720 整页，按歌曲帧画）：一个镜头，分屏 → 同一台机位连续拉开成整屏（接 2-摇铃 第一帧）。
// 左屏（服务器，门口小木屋，身后是她种的樱花林，花瓣零零星星往下飘，起风以后同一阵风斜着往左下吹）：她在告示牌旁挂上寻风之铃（挂铃）→ 转身朝东穿过开着的门走到照片墙前
//   → 手按合照、打一下框、合照落进手里、那一格变成微亮的空框 → 转过来低头看着合照 → 她消失 那一拍带着合照传送走（原版末影人瞬移的紫色粒子）。
// 右屏（现实）：教学楼下你站着 → 纸飘下 起风，一楼、二楼的窗里往外扔撕碎的纸、楼上落下碎纸，你仰头看；碎纸先往下落、再被风越吹越往左，斜着往左下飘过分屏线到她那边，
//   一边飘一边一档档变成樱花瓣（用户 10-25「应该横向飘过去 以便转场 飘过去的时候 颜色和形状都渐渐变成樱花的样子」「落路线怎么是直着向左的 至少应该是斜着向左吧」）。
// 合屏（合屏起 → 合屏到位）：左屏本来就是整屏画面往左挪了 合屏前偏 格的左半边，画面往右挪回整屏镜头、分屏线带着现实那半推出画面右边；
//   这时飘着的已经全是樱花瓣，顺着风接进 2-摇铃；合屏到位那一帧和 2-摇铃 第一帧一样（门开着、屋里空了、合照格空着）。
// 分寸都在 归隐参数.ts、现实/楼下布局.ts、纸花.ts；她每一帧的样子在 归隐她.ts。调色、质感的分层同 时差分屏.tsx。
// 用法：段里 <归隐画面 帧={歌曲帧} 种子={歌曲帧} 叠层={歌词} />。
import type React from 'react';
import { clamp01, rad } from '@engine/anim/anim.ts';
import { DISPLAY } from '@engine/model/物品贴图.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import type { ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { lerpTone, type Grade } from '@engine/三渲二/调子.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFoxEx, type HeldItem } from '@库/角色/魔法酒狐新动作组件.tsx';
import { PortalParticles } from '@库/特效/传送粒子.tsx';
import { fps, aspect } from '../../分镜/时间.ts';
import { segmentWindow, events as mainCutEvents } from '../../分镜/正片第13至14句.ts';
import { SignPixelText } from '../../地点/告示牌字.tsx';
import { photoWallCells, HandHeldMapArt } from '../../地点/照片墙.tsx';
import { entrance } from '../../地点/门口小木屋.tsx';
import { groupPhoto } from '../../特效/合照.ts';
import { line8Photos } from '../../特效/照片画.ts';
import { WindBell } from '../../物品/寻风之铃.tsx';
import { MoonBellLily } from '../../物品/月铃兰.tsx';
import { RealCanvas } from '../../现实/画布.tsx';
import { Downstairs } from '../../现实/楼下.tsx';
import { headUpSec, headUpDelaySec, youHead, downstairsSkyColor, downstairsTopFace } from '../../现实/楼下布局.ts';
import { outline as defaultOutline } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { signRows, fullScreenShot, dayTick, defaultSkyArc } from './参数.ts';
import { ForestDoorCanvas } from './林间门口.tsx';
import { flowerScale } from './分屏参数.ts';
import { liYingAt, type LiYingState } from './归隐她.ts';
import { colorBackRange, bell } from './第15句.ts';
import { PaperLayer } from './纸花层.tsx';
import {
  teleport,
  splitLineX,
  photoStandPos,
  mergeProgress,
  groupPhotoHandheldScale,
  retreatCount,
  retreatLayout,
  hangBellSwing,
  hangBellFacing,
  serverCenterX,
  photoWallEdge,
  fadeStart,
  fadeEnd,
  downstairsFraming,
} from './归隐参数.ts';

const events = mainCutEvents;
const segWindow = segmentWindow('2-归隐');

// ---------- 她 ----------
const originalDisplay = DISPLAY.generated.thirdperson_righthand;
const scaleBy = (k: number) => ({ ...originalDisplay, scale: (originalDisplay.scale ?? [1, 1, 1]).map((v) => v * k) as [number, number, number] });
const flowerItem = <MoonBellLily />;

/** 她（同 2-摇铃 的你一样大，1 倍；花照第 13 句放大 花倍，接着认得出是那枝月铃兰）。手里的花、合照总是正面朝镜头（偏 = 从她正前方往她左边转几度）：她转身朝东走时物品不侧过去变成一条线 */
const LiYing: React.FC<{ liYingState: LiYingState; 秒: number }> = ({ liYingState, 秒: sec }) => {
  const pos: V3 = [liYingState.x, entrance.standRowY, 0];
  const yawOffset = hangBellFacing - liYingState.yaw;
  const heldItem = (x: '花' | '合照' | null): HeldItem | undefined =>
    x === '花'
      ? { item: flowerItem, facing: { yawOffset }, display: scaleBy(flowerScale) }
      : x === '合照'
        ? { item: <HandHeldMapArt photo={groupPhoto} sideLength={photoWallEdge} />, facing: { yawOffset }, display: scaleBy(groupPhotoHandheldScale) }
        : undefined;
  return (
    <TexturePixelAlign 锚={pos}>
      <MagicalWineFoxEx
        pose={{ ...standPose(pos), yaw: liYingState.yaw }}
        stancePose="站"
        expression={liYingState.expression}
        看={liYingState.看}
        blink={0}
        秒={sec}
        rightHand={heldItem(liYingState.rightHand)}
        leftHand={heldItem(liYingState.leftHand)}
        skeleton={liYingState.skeleton}
      />
    </TexturePixelAlign>
  );
};

// ---------- 铃 ----------
/** 刚挂上的铃绕挂点摆的角（度）：挂铃那一刻碰一下，衰减着摆，合屏到位那一帧收到 0（2-摇铃 开头铃是静的，摇铃 才再摆） */
const hangBellAngle = (sec: number) => {
  const t = sec - events.挂铃.秒;
  if (t < 0) return 0;
  return hangBellSwing.amplitude * Math.sin((t / hangBellSwing.periodSec) * Math.PI * 2) * hangBellSwing.damping ** t * clamp01((events.合屏到位.秒 - sec) / 0.5);
};

/** 挂着的铃：正对镜头的物品薄片绕挂点（朝镜头的轴）摆，挂绳一个铃像素宽（2-摇铃 同一个，角各自算）。挂铃 以前在她手里（还没挂上，不画） */
export const HangingBell: React.FC<{ 角: number }> = ({ 角: angle }) => {
  const s = bell.大小;
  return (
    <group position={bell.hangPoint} rotation={[0, rad(-angle), 0]}>
      <mesh position={[0, 0, -(bell.hangLength - s / 2) / 2]}>
        <boxGeometry args={[s / 16, s / 16, bell.hangLength - s / 2]} />
        <meshStandardMaterial color="#5a3a22" roughness={1} />
      </mesh>
      <group position={[0, 0, -bell.hangLength]} rotation={[Math.PI / 2, 0, 0]} scale={s}>
        <WindBell />
      </group>
    </group>
  );
};

/** 她挂铃前手里的铃：同一个薄片，铃心放在挂点下 垂（她手伸到钉子那儿，手里的铃就在挂上以后那个位置；挂铃那一帧手松开、铃开始摆） */
const handBell = <HangingBell 角={0} />;

// ---------- 她走的粒子 ----------
/** 她消失 那一拍她站的地方冒的紫色传送粒子（原版末影人瞬移，body 那种）：2-摇铃 开头还在收拢、散掉，两段按同一个秒画 */
export const LiYingWalkParticles: React.FC<{ 秒: number }> = ({ 秒: sec }) => (
  <PortalParticles
    emitters={[
      {
        kind: 'body',
        at: [photoStandPos, entrance.standRowY, 0],
        w: 0.6,
        h: 1.8,
        t0: events.她消失.秒 - teleport.preTick / 20,
        t1: events.她消失.秒 + (teleport.releaseTick - teleport.preTick) / 20,
        rate: teleport.放,
        seed: teleport.种子,
        life: teleport.寿命,
      },
    ]}
    sec={sec}
    size={teleport.大小}
  />
);

// ---------- 调子 ----------
const neutralGrade: Grade = { 饱和: 1, 对比: 1, multiply: '#ffffff', lift: '#000000', 暗角: 0, 颗粒: 0 };
const gradeOnly = (t: Grade): Grade => ({ ...t, 暗角: 0, 颗粒: 0 });
/** 合屏到位（同 2-摇铃 开头）：褪色往夏日白天回 1/3 */
export const mergedTone = lerpTone(palette.褪色, palette.夏日白天, colorBackRange.起);
/** 她那边的调子（歌曲帧）：第 13 句末那样一路褪到合屏到位那样 */
export const leftToneAt = (frame: number) =>
  frame >= events.合屏到位.帧
    ? mergedTone
    : lerpTone(palette.夏日白天, palette.褪色, fadeStart + (fadeEnd - fadeStart) * clamp01((frame - segWindow.起帧) / (events.合屏到位.帧 - segWindow.起帧)));

/** 你在楼下这一帧的头：纸飘下 后 仰头迟秒 起仰起来 */
const youHeadAt = (frame: number): [number, number] => {
  const t = clamp01(((frame - events.纸飘下.帧) / fps - headUpDelaySec) / headUpSec);
  const k = t * t * (3 - 2 * t);
  return [youHead.low[0] + (youHead.up[0] - youHead.low[0]) * k, youHead.low[1] + (youHead.up[1] - youHead.low[1]) * k];
};

/** 太阳走的弧：整屏镜头那条（世界坐标，合屏时太阳跟着画面一起挪，不在天上滑） */
const fullScreenArc = defaultSkyArc(fullScreenShot.framing, aspect.宽, aspect.高);

export type RetreatPictureProps = {
  /** 歌曲帧（分镜 的时间轴） */
  帧: number;
  outline?: boolean;
  /** 整片后期开关（默认开） */
  withPost?: boolean;
  /** 整页那层颗粒的种子（整片后期），段里给歌曲帧 */
  种子?: number;
  /** 盖在最上面、整页质感里面的东西（符文歌词），页面坐标 1280×720 */
  叠层?: React.ReactNode;
  /** 光影的样式（段里传 默认.ts 的 光影段[段键]），只管她那边（门口）；不给 = 不开 */
  shading?: ShadingOptions | null;
  /** 现实那边的光影；不给 = 不开 */
  realShading?: ShadingOptions | null;
};

export const RetreatPicture: React.FC<RetreatPictureProps> = ({ 帧: frame, outline = defaultOutline.开, withPost = true, 种子: seed, 叠层: overlay, shading, realShading }) => {
  const sec = frame / fps;
  const liYingState = liYingAt(frame);
  const splitX = splitLineX(sec);
  const leftTone = leftToneAt(frame);
  const { rightWidth, lineWidth, lineColor } = retreatLayout;
  const width = aspect.宽;
  const height = aspect.高;
  const withGrade = (t: Grade, content: React.ReactNode) => (withPost ? <FilmPost grade={gradeOnly(t)}>{content}</FilmPost> : content);
  // 整页质感：分屏时两边的暗角、颗粒取平均，合屏时插到她那边的（合屏到位那一帧同 2-摇铃 的一层整片后期）
  const k = mergeProgress(sec);
  const 插 = (a: number, b: number) => a + (b - a) * k;
  const finishGrade: Grade = {
    ...neutralGrade,
    暗角: 插((palette.现实.grade.暗角 + leftTone.grade.暗角) / 2, leftTone.grade.暗角),
    颗粒: 插((palette.现实.grade.颗粒 + leftTone.grade.颗粒) / 2, leftTone.grade.颗粒),
  };
  const pageView = (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {/* 她那边：一整屏宽的画（取景中心 服务器中心x），只露分屏线左边 */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: splitX, height: height, overflow: 'hidden' }}>
        {withGrade(
          leftTone.grade,
          <ForestDoorCanvas
            宽={width}
            高={height}
            framing={{ 中心: [serverCenterX(sec), fullScreenShot.framing.中心[1]], pxPerCell: fullScreenShot.framing.pxPerCell }}
            outlineWidth={fullScreenShot.outlineWidth}
            刻={dayTick}
            arc={fullScreenArc}
            tone={leftTone}
            shading={shading}
            doorOpen
            treeProgress={1}
            hasSign
            signText={<SignPixelText lines={signRows} />}
            photoWall={photoWallCells(line8Photos, frame >= events.取照.帧 ? null : groupPhoto)}
            photoWallEdge={photoWallEdge}
            叠层={<PaperLayer 秒={sec} 宽={splitX} />}
          >
            {frame >= events.挂铃.帧 ? <HangingBell 角={hangBellAngle(sec)} /> : handBell}
            {liYingState && <LiYing liYingState={liYingState} 秒={sec} />}
            <LiYingWalkParticles 秒={sec} />
          </ForestDoorCanvas>,
        )}
      </div>
      {/* 现实那边：左沿贴着分屏线，合屏时跟着线推出画面 */}
      {splitX < width && (
        <div style={{ position: 'absolute', left: splitX, top: 0, width: width - splitX, height: height, overflow: 'hidden' }}>
          {withGrade(
            palette.现实.grade,
            <>
              <div style={{ position: 'absolute', left: 0, top: 0, width: rightWidth, height: height }}>
                <RealCanvas 宽={rightWidth} 高={height} framing={downstairsFraming} topDepth={downstairsTopFace} 天={downstairsSkyColor} outline={outline} outlineWidth={retreatCount} shading={realShading}>
                  <Downstairs 头={youHeadAt(frame)} 秒={sec} />
                </RealCanvas>
              </div>
              <PaperLayer 秒={sec} left={splitX} 宽={width - splitX} 取={(q) => q.种 === '纸'} />
            </>,
          )}
        </div>
      )}
      {splitX < width && <div style={{ position: 'absolute', left: splitX, top: 0, width: lineWidth, height: height, background: lineColor }} />}
      {overlay}
    </div>
  );
  return withPost ? (
    <FilmPost grade={finishGrade} 种子={seed}>
      {pageView}
    </FilmPost>
  ) : (
    pageView
  );
};
