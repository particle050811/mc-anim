// 第 5 句末地这一镜的成片画法（段 2-抢龙蛋、核对-扑龙蛋照片 共用）：三渲二透视（平涂、不抗锯齿；描边照 画风.ts，全片关）、末地那套调子、整片后期，
// 上面叠一层 盖层（段首第 4 句那道浪往上退，段给）和符文歌词。谁在哪、什么样全在 编排.ts，这里只按段内帧 f 画。
// 歌词浮在最上面、不过后期：同前后两句（2-日落划船、2-收集快乐）的画法，接缝两边歌词颜色一样。
// 干净 = 不画歌词（第 8 句收的照片用：这一镜没有气泡、聊天栏，只差歌词）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { VanillaParticles } from '@库/特效/原版粒子.tsx';
import { fps, aspect } from '../../分镜/时间.ts';
import { segmentWindow } from '../../分镜/正片第5句.ts';
import { canvasTone, outline as defaultOutline } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { EndSet, DragonEgg } from './布景.tsx';
import { YouState, teleportParticles, frameToTick, LiYingState, cameraRig, toSongFrame, eggCell } from './编排.ts';
import { EndSky } from './末地天空.tsx';
import { EndPortal } from './末地传送门.tsx';
import { EndCharacter } from './角色.tsx';

const tone = palette.末地;
const width = aspect.宽, height = aspect.高;

/** 全片 15 句的符文歌词行（段内帧），样式照歌词艺术字定稿、描边色跟末地调子 */
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, segmentWindow('2-抢龙蛋').起帧));
const lyricStyle = { ...runeLyricDefault, outlineColor: tone.outlineColor };

/** 三渲二画布里的东西（场景坐标） */
export const EndScene: React.FC<{ f: number }> = ({ f }) => (
  <>
    <EndSky 眼={cameraRig(f).眼} />
    <EndSet />
    <EndPortal 刻={frameToTick(f)} />
    <DragonEgg 格={eggCell(f)} />
    <EndCharacter liYing={LiYingState(f)} 你={YouState(f)} outline={defaultOutline.开} />
    <VanillaParticles spawns={teleportParticles} 秒={f / fps} />
  </>
);

export type EndShotProps = {
  /** 段内帧 */
  f: number;
  /** 不画歌词 */
  clean?: boolean;
  /** 整片后期（只在核对里关，比较用） */
  withPost?: boolean;
  /** 叠在末地上面、歌词下面的一层（自带后期）；给了就把末地这层的暗角、颗粒去掉，由盖层那份整片后期管（不叠两遍） */
  overlay?: React.ReactNode;
};

/** 一整帧（1280×720 页面） */
export const EndShot: React.FC<EndShotProps> = ({ f, clean = false, withPost = true, overlay }) => (
  <AbsoluteFill>
    <FilmPost grade={withPost ? (overlay ? { ...tone.grade, 暗角: 0, 颗粒: 0 } : tone.grade) : null} 种子={toSongFrame(f)}>
      <ToonCanvas 宽={width} 高={height} cameraRig={cameraRig(f)} {...canvasTone('末地')}>
        <EndScene f={f} />
      </ToonCanvas>
    </FilmPost>
    {overlay}
    {!clean && <RuneLyric lines={lyricLines} 样式={lyricStyle} 帧={f} />}
  </AbsoluteFill>
);
