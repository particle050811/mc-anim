// 2-初入 的画面：开头接着 2-选择世界 钻进图标，图标里的旧照片一格一格透掉，露出垫在下面的新世界（场/2-新世界，透视三渲二）；
// 钻完只剩新世界：聊天栏一行黄字「Steve加入了游戏」，你小小一个站在平原上，远处地平线上一点粉（樱花林）。你朝那边走几步停下、转身低头，
// 镜头跟着往前、往下落到地面高度，聊天行淡掉，你和镜头之间的地一排排撤掉，露出你脚下的地面剖面；第 2 句（2-第一晚）同一个镜头接着拍（天在第 2 句里才黑）。
// 调子跟着透掉的比例从现实回暖到新世界的下午。
import type React from 'react';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { aspect } from '../../分镜/时间.ts';
import { segmentWindow } from '../../分镜/正片开场.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { line15ChatWidth } from '../../界面/聊天栏宽.ts';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { SelectWorld } from '../../场/2-选择世界/选择世界.tsx';
import { drillInFraming, drillInProgress, drillInAlpha, threshold } from '../../场/2-选择世界/编排.ts';
import { oldIcon } from '../../场/2-选择世界/图标源.ts';
import { chatOverlay } from '../../场/2-新世界/参数.ts';
import { youAt, peeledRows, skyTickAt, newWorldShadingScene, chatTickAt } from '../../场/2-新世界/编排.ts';
import { NewWorld } from '../../场/2-新世界/世界.tsx';
import { shadingBySeg } from '../../默认.ts';
import { gradeAt, drillDone, shotAt } from './编排.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { use当前帧 } from '../../当前帧.ts';

const startFrame = segmentWindow('2-初入').起帧;
const width = aspect.宽, height = aspect.高;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));

const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
/** 系统消息：加入游戏（黄），聊天栏的钟从这一刻起算 */
const chatLines = [{ text: 'Steve加入了游戏', color: yellow, startTick: 0 }];
/** 剖面那一格还没挖 */
const notDug = { dugCount: 0, dirtCovered: false };

const picture: React.FC = () => {
  const songFrame = startFrame + use当前帧();
  const tone = gradeAt(songFrame);
  const sample = youAt(songFrame);
  const youPose = stevePose(sample.feet, sample.facing, { sec: sample.秒, limbSwing: sample.swing, stride: sample.stride, headPitch: sample.头 });
  const { q } = drillInProgress(songFrame);
  const alpha = drillInAlpha(q);
  return (
    <>
      <FilmPost grade={tone.grade} 种子={songFrame}>
        {/* 光影照 默认.ts 的 光影段（甲版不开，乙版开 Agent 建议的） */}
        <shadingScope.Provider value={{ shading: shadingBySeg['2-初入'], shadingScene: newWorldShadingScene }}>
          <NewWorld cameraRig={shotAt(songFrame)} 你={youPose} tint={tone.tint} 刻={skyTickAt(songFrame)} section={{ pit: notDug, peeled: peeledRows(songFrame) }} 宽={width} 高={height} />
        </shadingScope.Provider>
        {songFrame < drillDone && (
          <SelectWorld 状态={{ framing: drillInFraming(q), pointAt: 0, selected: true, frameCursor: false, cursor: null, iconMap: oldIcon, iconSeeThrough: (i, j) => threshold(i, j) < alpha }} 宽={width} 高={height} />
        )}
        <PixelChatBar lines={chatLines} 刻={chatTickAt(songFrame)} 缩放={chatOverlay.缩放} 字体={pixelFont} 宽={width} 高={height} chatWidth={line15ChatWidth} />
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: tone.outlineColor }} />
      </FilmPost>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
