// 第 14 句末到第 15 句开头（合屏到位 48.26 – 风散开 49.75）门这个机位的一整帧：合好的门口空着，半拍后你上线出现在告示牌旁（核查 10-24：她走、合屏、你来一件一件来），
//   抬头看长高的樱花林（约 0.4 秒），转去摇响牌上她挂的寻风之铃，樱花风卷起来盖满画面。
// 按歌曲帧画（分镜 的时间轴），站位、动作、铃、调子见 第15句.ts，像素密度、取景用 参数.ts 的 整屏镜头（N = 10，主会话 10-24 定），白天同第 8 句（白天刻）。
// 布景接 2-归隐 合屏到位那一帧：门开着、屋里空了，照片墙上四张夏天的照片亮着、合照格空着（照片方案），身后是开满的樱花林，
//   第 14 句碎纸变成的樱花瓣顺着风斜着往左下飘（纸花.ts，风在转向铃起停、摇铃停住）、她走的粒子还没散（归隐.tsx 的 她走的粒子），都按歌上的秒算，接缝一样。
// 层次（从下往上）：门口画布（天、三维的屋子和你、铃）→ 飘的花瓣 → 樱花风 → 左下原版聊天栏「Steve加入了游戏」（原版界面画在粒子上面，花瓣不盖它）；
// 外面整片后期（调色跟着樱花风从褪色回到夏日白天）。
// 歌词由段画面从 叠层 传进来，叠在整片后期里面（同 2-归隐）。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { clamp01, sample } from '@engine/anim/anim.ts';
import { Outline as OutlineGroup } from '@engine/三渲二/描边.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import type { ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { lerpTone } from '@engine/三渲二/调子.ts';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { fps, aspect } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import { sideProjection } from '../../地点/侧剖面.tsx';
import { SignPixelText } from '../../地点/告示牌字.tsx';
import { photoWallCells } from '../../地点/照片墙.tsx';
import { entrance } from '../../地点/门口小木屋.tsx';
import { outline as defaultOutline } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { line15ChatWidth } from '../../界面/聊天栏宽.ts';
import { line8Photos } from '../../特效/照片画.ts';
import { SakuraWind } from '../../特效/樱花风.tsx';
import type { SakuraWindMoment } from '../../特效/樱花风参数.ts';
import { signRows, dayTick, fullScreenShot, orthoTop } from './参数.ts';
import { ForestDoorCanvas } from './林间门口.tsx';
import { LiYingWalkParticles, HangingBell } from './归隐.tsx';
import { photoWallEdge } from './归隐参数.ts';
import { PaperLayer } from './纸花层.tsx';
import { colorBackRange, youX, youFacing, youHead, yourRightArm, bell, bellSwing } from './第15句.ts';

const mainCutEvents = { ...lyricEvents, ...mainCutLine15Events };

const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
const events = mainCutEvents;

/** 樱花风的时间轴：摇铃起风，风散开（转场）那一拍整屏盖住。隐世之境那一镜接着用同一个 */
export const bellWind: SakuraWindMoment = { 起: events.ringBell.秒, full: events.windClears.秒 };

/** 「Steve加入了游戏」那一行进聊天栏以后过了多少刻（原版聊天按刻走）：歌曲帧 → 刻 */
export const joinGameTick = (frame: number) => ((frame - events.rejoinGame.帧) / fps) * 20;

/** 原版聊天栏的缩放：2560×1440 下原版自动选的界面尺寸 6（同 场/2-隐世之境 对视那一帧，同一行字跨镜头一样大）；聊天宽也同那一帧（界面/聊天栏宽.ts） */
export const chatScale = 6;

/** 左下的原版聊天栏，只有「Steve加入了游戏」一行（帧：歌曲帧） */
export const JoinGameChat: React.FC<{ 帧: number }> = ({ 帧: frame }) => (
  <PixelChatBar
    lines={[{ text: 'Steve加入了游戏', color: yellow, startTick: 0 }]}
    刻={joinGameTick(frame)}
    缩放={chatScale}
    字体={pixelFont}
    宽={aspect.宽}
    高={aspect.高}
    chatWidth={line15ChatWidth}
  />
);

const project = sideProjection(fullScreenShot.framing, aspect.宽, aspect.高, orthoTop);
const bellCenter: V3 = [bell.hangPoint[0], bell.hangPoint[1], bell.hangPoint[2] - bell.hangLength];
/** 铃心在画面上的位置（页面坐标）：樱花风从这里起 */
export const bellInPicture = project(bellCenter[0], bellCenter[2], bellCenter[1]);

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** 你这一刻的姿势（秒：歌上的秒） */
const youPose = (sec: number) => {
  const turnToBellSec = events.turnToBell.秒;
  const shakeStart = events.ringBell.秒;
  // 头：看树 → 转向铃时转去看铃（0.15 秒转过去）→ 摇铃后 0.1 秒起抬头看风（0.2 秒）
  const lerpGaze = (a: [number, number], b: [number, number], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  let headPose = youHead.lookTree as number[];
  if (sec >= turnToBellSec) headPose = lerpGaze(youHead.lookTree, youHead.lookBell, smoothstep(clamp01((sec - turnToBellSec) / 0.15)));
  if (sec >= shakeStart + 0.1) headPose = lerpGaze(youHead.lookBell, youHead.lookWind, smoothstep(clamp01((sec - shakeStart - 0.1) / 0.2)));
  // 右胳膊：转向铃起抬到铃上（摇铃那一刻到位），摇铃时晃几下，之后放下
  const raise = smoothstep(clamp01((sec - turnToBellSec) / (shakeStart - turnToBellSec)));
  const lowerProgress = smoothstep(clamp01((sec - shakeStart - yourRightArm.swaySec) / yourRightArm.putDownSec));
  const raiseAmount = raise * (1 - lowerProgress);
  const sway = sec >= shakeStart && sec < shakeStart + yourRightArm.swaySec ? Math.sin((sec - shakeStart) * yourRightArm.swayFreq * Math.PI * 2) * yourRightArm.swayAmp : 0;
  const p = stevePose([youX, entrance.standRowY, 0], youFacing, { sec: sec, scale: 1, headPitch: headPose[0], headYaw: headPose[1] });
  return { ...p, armR: p.armR + yourRightArm.reachBell.lift * raiseAmount, armRRoll: p.armRRoll + yourRightArm.reachBell.rollDeg * raiseAmount + sway };
};

/** 铃绕挂点摆的角（度，正 = 铃往画面右边甩）：摇铃时被手往左一拨，之后衰减着摆 */
const bellAngle = (sec: number) => {
  const t = sec - events.ringBell.秒;
  if (t < 0) return 0;
  return -bellSwing.amplitude * Math.sin((t / bellSwing.periodSec) * Math.PI * 2) * bellSwing.damping ** t;
};

/** 这一帧的调子：上线时还是第 14 句末的褪色（回色.起），樱花风卷起来以后颜色跟着回来，盖满时到夏日白天 */
export const bellShakeTone = (frame: number) => {
  const restoreMix = colorBackRange.起 + (colorBackRange.止 - colorBackRange.起) * sample([[bellWind.起, 0], [bellWind.full, 1]], frame / fps);
  return lerpTone(palette.褪色, palette.夏日白天, restoreMix);
};

export type BellShakePictureProps = {
  /** 歌曲帧 */
  帧: number;
  outline?: boolean;
  withPost?: boolean;
  /** 盖在最上面、整片后期里面的东西（符文歌词），页面坐标 1280×720 */
  叠层?: React.ReactNode;
  /** 整片后期颗粒的种子，不给 = 当前帧号；段里给歌曲帧 */
  种子?: number;
  /** 光影的样式（段里传 默认.ts 的 光影段[段键]），只开门口这边（见 门口.tsx 的 门口画布）；不给 = 不开 */
  shading?: ShadingOptions | null;
};

/** 一整帧（1280×720 页面），自己铺满 */
export const ShakeBellPicture: React.FC<BellShakePictureProps> = ({ 帧: frame, outline = defaultOutline.开, withPost = true, 叠层: overlay, 种子: seed, shading }) => {
  const sec = frame / fps;
  const tone = bellShakeTone(frame);
  const you = youPose(sec);
  return (
    <FilmPost grade={withPost ? tone.grade : null} 种子={seed}>
      <ForestDoorCanvas
        宽={aspect.宽}
        高={aspect.高}
        {...fullScreenShot}
        刻={dayTick}
        tone={tone}
        shading={shading}
        doorOpen
        treeProgress={1}
        hasSign
        signText={<SignPixelText lines={signRows} />}
        photoWall={photoWallCells(line8Photos, null)}
        photoWallEdge={photoWallEdge}
        叠层={
          <>
            <PaperLayer 秒={sec} />
            <SakuraWind 秒={sec} windTime={bellWind} 源={bellInPicture} />
            <JoinGameChat 帧={frame} />
          </>
        }
      >
        <HangingBell 角={bellAngle(sec)} />
        <LiYingWalkParticles 秒={sec} />
        {frame >= events.rejoinGame.帧 && (
          <OutlineGroup 开={outline}>
            <TexturePixelAlign 锚={you.loc as V3}>
              <Steve pose={you} />
            </TexturePixelAlign>
          </OutlineGroup>
        )}
      </ForestDoorCanvas>
      {overlay}
    </FilmPost>
  );
};
