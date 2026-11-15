// 2-拼回 的画面：「选择世界」界面，最后构图同第 0 镜第一帧（平常取景，没有光标、没选中，搜索框拿着焦点闪「_」），能接回开头循环。
// 第一帧是咔哒那一下的整屏纯白，几帧就退（同第 11 句截图那一闪）；镜头从图标跟前往外拉回平常取景（开头钻进图标倒着走），
// 回色前界面是灰的，新合照的碎片（16 块）带着颜色跟着镜头一路吸进图标框、一块块拼上（碎片层只过调色，不再叠一遍暗角颗粒）。
// 片尾回色那一帧「啪」地回到现实的调子、碎片都已经拼进图标、图标弹一下，上次游玩换成这次重逢的时间。
// 白光盖在最上面（纯白，不被调色染蓝）。第 15 句在 片尾歌词收（咔哒那一帧）起退场，退在白里。
import type React from 'react';
import { AbsoluteFill } from 'remotion';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { segmentFrames } from '../../分镜/时间.ts';
import { events as mainCut15TailEvents } from '../../分镜/正片15尾.ts';
import { events as mainCutEndingEvents, segmentWindow } from '../../分镜/正片片尾.ts';
import { palette } from '../../色板.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { ShardLayer, SelectWorld } from '../../场/2-选择世界/选择世界.tsx';
import { boxCursorOn, endFraming, endBounce, outroWhiteAt, reunionRowTexts } from '../../场/2-选择世界/编排.ts';
import { newIcon, oldIcon } from '../../场/2-选择世界/图标源.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useCurrentFrame } from '../../当前帧.ts';

const mainCutEvents = { ...mainCut15TailEvents, ...mainCutEndingEvents };
const segMainCutEventFrames = (segKey: string) => segmentFrames(segmentWindow(segKey).起帧, mainCutEvents);

const startFrame = segmentWindow('2-拼回').起帧;
const events = segMainCutEventFrames('2-拼回');
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));
const tone = palette.现实;
/** 回色前：现实的调色把饱和拉到 0（白光里的界面是黑白的） */
const grayGrade = { ...tone.grade, saturation: 0 };
/** 碎片只过现实的调色（暗角、颗粒在下面那层整片后期里已经叠过一遍） */
const fragmentGrade = { ...tone.grade, 暗角: 0, 颗粒: 0 };

const picture: React.FC = () => {
  const f = useCurrentFrame();
  const isColorBack = f >= events.片尾回色;
  const whiteFade = outroWhiteAt(f);
  const framing = endFraming(f);
  return (
    <>
      <FilmPost grade={isColorBack ? tone.grade : grayGrade} 种子={startFrame + f}>
        <SelectWorld
          状态={{
            framing,
            pointAt: 0,
            selected: false,
            frameCursor: boxCursorOn(startFrame + f, startFrame),
            cursor: null,
            iconMap: isColorBack ? newIcon : oldIcon,
            iconBounce: endBounce(f, events.片尾回色),
            ...(isColorBack ? { rowTexts: reunionRowTexts } : {}),
          }}
        />
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: tone.outlineColor }} 收={events.片尾歌词收} />
      </FilmPost>
      {!isColorBack && (
        <FilmPost grade={fragmentGrade}>
          <ShardLayer f={f} 新={newIcon} framing={framing} />
        </FilmPost>
      )}
      {whiteFade > 0 && <AbsoluteFill style={{ background: `rgba(255,255,255,${whiteFade})` }} />}
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
