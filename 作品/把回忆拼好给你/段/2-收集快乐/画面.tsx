// 2-收集快乐 的画面：门这个机位（场/2-门口/门口.tsx 的 门口画布 + 第8句.ts 的 第8句镜头，N = 16），整句一个取景不动；屋后开着远景（地点/屋后远景.tsx：
// 同第 6、7 句那片地和那层云，云洞已经开到头，那圈云远远地压在樱花林上沿、淡在雾里；光影开 Photon 云时天和云换成第 7 句那层 Photon 雨云，见 第8句云.ts 的 第8句光影场）。
// 不画太阳（第 7 句末那一镜也没有太阳：7000 刻的太阳在头顶偏南，朝北看不见）。
// 小木屋开着门，后墙照片墙挂着三张、第四只框空着，她左手拿着光柱破云立在空框前面，推进框里；你、苦力怕、她头顶的气泡，外面整片后期；符文歌词一起过后期。
// 谁在哪、什么姿势、镜头和调子全在 编排.ts，这里只按它画。哈气那一帧（正片事件 哈气，60 fps 时歌曲帧 1668）同静帧「门口哈气」（核对-门口哈气）再加顶上的歌词。
// 颗粒种子 = 歌曲帧。全片不描边。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { Creeper } from '@库/生物/苦力怕.tsx';
import { MaidBubble, bubbleAnchorHeight } from '@库/界面/女仆气泡.tsx';
import { aspect } from '../../分镜/时间.ts';
import { sideProjection } from '../../地点/侧剖面.tsx';
import { MapArtCard, photoWallCells } from '../../地点/照片墙.tsx';
import { entrance } from '../../地点/门口小木屋.tsx';
import { orthoTop, type DoorFraming } from '../../场/2-门口/参数.ts';
import { DoorCanvas } from '../../场/2-门口/门口.tsx';
import { line8ShotCount } from '../../场/2-门口/第8句.ts';
import { line8Cloud, line8ShadingScene } from '../../场/2-门口/第8句云.ts';
import { HissingWineFox } from '../../场/2-门口/第8句炸毛.tsx';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { shadingBySeg } from '../../默认.ts';
import { line8Photos } from '../../特效/照片画.ts';
import { LiYingState, youState, framing, wallPhotoCount, bubbleState, photoState, creeperPose, gradeAt, toSongFrame } from './编排.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const width = aspect.宽, height = aspect.高;
const standY = entrance.standRowY;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, toSongFrame(0)));
/** 照片墙一格 64 个地图像素：N = 16 是 4 的倍数，一个地图像素正好 4 个成片像素（特效/地图画.ts） */
const photoWallEdge = 64;
const newPhoto = line8Photos[3]!;

const Characters: React.FC<{ f: number }> = ({ f }) => {
  const liYing = LiYingState(f);
  const you = youState(f);
  // 不传 sec、两臂外摆清零（同 场/2-门口/哈气.tsx：原版站着两臂的轻晃会让胳膊斜着）
  const youPose = { ...stevePose([you.x, standY, 0], you.yaw, { headYaw: you.headYaw, scale: you.scale }), armRRoll: 0, armLRoll: 0 };
  const creeper = creeperPose(f);
  const photo = photoState(f);
  return (
    <>
      <TexturePixelAlign 锚={youPose.loc as V3}>
        <Steve pose={youPose} />
      </TexturePixelAlign>
      <TexturePixelAlign 锚={liYing.loc}>
        <HissingWineFox
          pose={{ ...standPose(liYing.loc), yaw: liYing.yaw }}
          stancePose={liYing.stancePose}
          expression={liYing.expression}
          看={liYing.看}
          skeleton={liYing.skeleton}
          blink={liYing.blink}
          秒={liYing.秒}
          backStaff={false}
        />
      </TexturePixelAlign>
      {photo && <MapArtCard photo={newPhoto} sideLength={photoWallEdge} 角={photo.角} side={photo.side} />}
      <TexturePixelAlign 锚={creeper.loc}>
        <Creeper pose={creeper} />
      </TexturePixelAlign>
    </>
  );
};

const CollectHappyBubble: React.FC<{ f: number; framing: DoorFraming }> = ({ f, framing }) => {
  const bubble = bubbleState(f);
  if (!bubble) return null;
  const anchor = sideProjection(framing, width, height, orthoTop)(bubble.x, bubbleAnchorHeight(), standY);
  return <MaidBubble 锚={anchor} 缩放={line8ShotCount} 文字={bubble.字} 字体={pixelFont} anchorAlign={line8ShotCount} />;
};

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const tone = gradeAt(f);
  const photoWall = photoWallCells([...line8Photos.slice(0, wallPhotoCount(f)), null].slice(0, 4));
  return (
    <>
      <FilmPost grade={tone.grade} 种子={toSongFrame(f)}>
        <DoorCanvas
          shading={shadingBySeg['2-收集快乐']}
          shadingScene={line8ShadingScene}
          doorOpen
          photoWall={photoWall}
          photoWallEdge={photoWallEdge}
          远景={{ clouds: line8Cloud(toSongFrame(f)) }}
          tone={tone}
          framing={framing}
          arc={null}
          叠层={<CollectHappyBubble f={f} framing={framing} />}
        >
          <Characters f={f} />
        </DoorCanvas>
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: tone.outlineColor }} />
      </FilmPost>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
