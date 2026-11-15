// 验证片唯一的一段：第一人称固定机位，魔法酒狐坐在隐世之境一楼主厅的地毯上，玩家右键递蛋糕、驯服、微笑推镜、咔哒定格成拍立得。
// 照片里的东西都按定格后的 fs 画：世界画布（一楼、一楼灯光、她、驯服爱心），上面叠手画布，再上面是原版聊天栏；歌词是浮层，不定格、不跟着缩。
// 事件帧全从 分镜 取（段内帧 = 歌曲帧 − 段起），摆位、视角、视线、种子这些 Agent 暂定的数在场参数，这里不写帧号。
// 原版的东西按刻走（20 刻一秒）：手从右键那一帧起数，聊天栏、爱心从驯服那一帧起数。她的尾巴、环转、眨眼按歌上的秒走（场时间线就是歌）。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { sample, sampleV, type VKey } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { FirstPersonCanvas, FirstPersonHand, type HandScript, handTimeline, viewAngles } from '@库/角色/第一人称.tsx';
import { LiYingFirstPersonArm } from '@库/角色/李樱第一人称.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { magicalWineFoxBlinkAt } from '@库/角色/魔法酒狐动作.ts';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { FirstPersonRig, eyePos } from '../../地点/机位.tsx';
import { firstFloor, FirstFloorLighting, HiddenWorldFloor } from '../../地点/隐世之境一楼.tsx';
import { polaroidStyle, cameraRig, lyricStyle, heartSeed, chatScale, fov, sightAngles } from '../../场/1-隐世之境一楼/参数.ts';
import { tamedChatLines } from '../../场/1-隐世之境一楼/聊天.ts';
import { fps, legacyFrameSec, lineAt } from '../../分镜/时间.ts';
import { segClock, segEventFrames, type EventName } from '../../分镜/验证片.ts';
import { Lyrics, type LyricLine } from '../../界面/歌词.tsx';
import { Polaroid } from '../../特效/拍立得.tsx';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';
import { rad, clamp01 } from '@engine/core/数学.ts';

const segKey = '1-一如既往';
const startFrame = segClock(segKey).起帧;
const eventFrames = segEventFrames(segKey);
const eventEntries = (Object.entries(eventFrames) as [EventName, number][]).sort((a, b) => a[1] - b[1]);

/** 打开就在画面上叠帧号、事件表和四个要卡的事件的大字（节点 1 核卡点用的），成片关着 */
const checkpoint = false;

// 这一段唱第 13–15 句，每句从开口（前导音，没有就是句首）淡入，第 15 句在咔哒定格时淡出
const lyricLines: readonly LyricLine[] = [
  { text: lineAt(13).text, 入: eventFrames.line13VocalIn },
  { text: lineAt(14).text, 入: eventFrames.line14VocalIn },
  { text: lineAt(15).text, 入: eventFrames.line15VocalIn },
];

/** 段内帧 → 从某个事件那一帧起数的原版刻（可带小数） */
const elapsedTick = (f: number, startFrame: number) => ((f - startFrame) / fps) * 20;

// 摆位（网格本地坐标，Z 朝上）：她坐在模板里那只女仆的位置（脚底在地毯顶面）、面朝南（yaw 180），玩家站在她南边
const addVec = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const liYingLoc = firstFloor.maid;
const liYingPose = { ...standPose(liYingLoc), yaw: 180 };
const eye = eyePos(addVec(liYingLoc, cameraRig.playerOffset));
const startLook = addVec(liYingLoc, cameraRig.看);
const endLook = addVec(liYingLoc, cameraRig.pushLimitLook);

// 推镜：微笑推镜到咔哒定格缓入缓出，只收世界那一遍的视角（原版拉近时手那一遍固定 70° 不变）。
// 视角按放大倍数的对数插值，推起来是匀匀地放大；看点跟着从起看挪到她脸上
const pushProgress = (fs: number) => sample([[eventFrames.smilePushIn, 0], [eventFrames.clickFreeze, 1]], fs);
const halfFovTan = (angleDeg: number) => Math.tan(rad(angleDeg) / 2);
const pushFov = (p: number) => (2 * Math.atan(halfFovTan(fov) * (halfFovTan(cameraRig.pushLimitFov) / halfFovTan(fov)) ** p) * 180) / Math.PI;
const pushLook = (p: number): V3 => [0, 1, 2].map((i) => startLook[i]! + (endLook[i]! - startLook[i]!) * p) as V3;

// 女仆的碰撞箱 0.6 × 1.5（TLM `EntityMaid.TYPE`，坐下不变），爱心照它从脚底往上放
const hearts = tamingHearts(liYingLoc, 0.6, 1.5, 0, heartSeed);
const chatLines = tamedChatLines(0);

// 右键在第 0 刻；第 1 刻手里的蛋糕被吃掉（生存模式，客户端这时收到物品栏更新），空手再按换手升上来
const handScript: HandScript = { start: '蛋糕', swings: [0], changes: [{ tick: 1, to: null }] };

// 窗外露出来的天，同 核对-隐世之境一楼
const skyColor = '#9fc4ff';

// 视线（演绎）：驯服前看蛋糕 → 驯服起抬头看你 → 第 14 句轻轻别开 → 第 15 句转回来看你，之后一直看你（推镜只收视角，机位不动，看你的角度不变）。
// 每段转头都是缓入缓出，停着的时候不动
const lookAtYou = magicalWineFoxLookAt(liYingPose, eye);
const gazeKeys: VKey[] = [
  [eventFrames.tame, sightAngles.蛋糕],
  [eventFrames.lookUpDone, lookAtYou],
  [eventFrames.gazeAway, lookAtYou],
  [eventFrames.gazeAwayDone, sightAngles.lookAway],
  [eventFrames.gazeBack, sightAngles.lookAway],
  [eventFrames.gazeBackDone, lookAtYou],
];
const herGaze = (fs: number) => sampleV(gazeKeys, fs) as [number, number];

/** 段内帧 → 歌上的秒（定格以后跟着 fs 停住） */
const songSec = (f: number) => (startFrame + f) / fps;
// 手放的三次眨眼，每次是游戏眨眼曲线开头那 0.25 秒
const blinkStartSec = [eventFrames.firstBlink, eventFrames.secondBlink, eventFrames.thirdBlink].map(songSec);

/** 魔法酒狐：帽子、背后法杖和三个环、发光照游戏原样（组件默认）；开头无嘴，微笑推镜那一帧硬切成微笑（游戏里换嘴也是硬切） */
const WineFox: React.FC<{ fs: number }> = ({ fs }) => {
  const sec = songSec(fs);
  return (
    <MagicalWineFox
      pose={liYingPose}
      看={herGaze(fs)}
      expression={fs < eventFrames.smilePushIn ? '无' : '微笑'}
      blink={magicalWineFoxBlinkAt(sec, blinkStartSec)}
      秒={sec}
    />
  );
};

const World: React.FC<{ fs: number; 看: V3; fov: number }> = ({ fs, 看: lookAt, fov: v }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
      <color attach="background" args={[skyColor]} />
      <FirstPersonRig 眼={eye} 看={lookAt} fov={v} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <FirstFloorLighting />
        <HiddenWorldFloor />
        <WineFox fs={fs} />
        <HeartParticles spawns={hearts} 刻={elapsedTick(fs, eventFrames.tame)} />
      </group>
    </ThreeCanvas>
  );
};

const Hand: React.FC<{ fs: number; 看: V3 }> = ({ fs, 看: lookAt }) => {
  const { width, height } = useVideoConfig();
  const h = handTimeline(elapsedTick(fs, eventFrames.rightClick), handScript);
  return (
    <FirstPersonCanvas width={width} height={height} view={viewAngles(eye, lookAt)}>
      <FirstPersonHand
        held={h.item === '蛋糕' ? <ItemSprite layers={CAKE} emissive={0} shadow={false} /> : null}
        arm={<LiYingFirstPersonArm />}
        swing={h.swing}
        equip={h.equip}
      />
    </FirstPersonCanvas>
  );
};

// 照片里的画面：f 是定格后的 fs，定格以后每帧都画定格那一刻
const Photo: React.FC<{ f: number }> = ({ f }) => {
  const p = pushProgress(f);
  const lookAt = pushLook(p);
  return (
    <AbsoluteFill>
      <World fs={f} 看={lookAt} fov={pushFov(p)} />
      <Hand fs={f} 看={lookAt} />
      <ChatOverlay lines={chatLines} 刻={elapsedTick(f, eventFrames.tame)} s={chatScale} />
    </AbsoluteFill>
  );
};

// 下面两个是 核卡点 打开时才画的标注
const bigCaptionEvents: readonly { 名: EventName; 字: string }[] = [
  { 名: 'rightClick', 字: '右键' },
  { 名: 'tame', 字: '聊天栏' },
  { 名: 'smilePushIn', 字: '微笑推镜' },
  { 名: 'clickFreeze', 字: '咔哒定格' },
];
const bigCaptionNames = new Set<EventName>(bigCaptionEvents.map((x) => x.名));
/** 事件名从事件那一帧起留多久（1 秒）；大字之后再用几秒淡掉（24 fps 时 6 帧） */
const captionHoldFrames = fps;
const bigFadeOutSec = legacyFrameSec(6);

// 核卡点的标注：按真实帧走，定格以后照常往下数
const CheckpointAnnotation: React.FC = () => {
  const f = useSnappedFrame();
  const { durationInFrames } = useVideoConfig();
  const songFrame = startFrame + f;
  const latest = eventEntries.filter(([, frame]) => frame <= f).at(-1);
  // 小字：不是大字的事件里最近的那一帧（同一帧有几个就都列出来）。放在歌词下面，定格以后不挡照片下白边的字
  const smallCaptionFrame = eventEntries.filter(([eventName, frame]) => !bigCaptionNames.has(eventName) && frame <= f).at(-1)?.[1];
  const smallCaptions = eventEntries.filter(([eventName, frame]) => !bigCaptionNames.has(eventName) && frame === smallCaptionFrame).map(([eventName]) => eventName);
  const nextEvent = eventEntries.find(([, frame]) => frame > f);
  return (
    <AbsoluteFill style={{ fontFamily: uiFontFamily, color: '#f2f2f2' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 118, textAlign: 'center', textShadow: '0 2px 6px #000' }}>
        {smallCaptionFrame !== undefined && f - smallCaptionFrame < captionHoldFrames ? (
          <div style={{ fontSize: 32, color: '#ffd84a' }}>
            {smallCaptions.join('、')}（f{smallCaptionFrame}）
          </div>
        ) : (
          <div style={{ fontSize: 24, color: '#cccccc' }}>{nextEvent ? `下一个：${nextEvent[0]}（f${nextEvent[1]}）` : '段尾'}</div>
        )}
      </div>
      <div style={{ position: 'absolute', left: 24, bottom: 52, fontSize: 20, lineHeight: 1.5, textShadow: '0 1px 3px #000' }}>
        <div>{segKey} · 核卡点</div>
        <div>
          段内 f{f} / {durationInFrames}　歌曲帧 {songFrame}　{(songFrame / fps).toFixed(3)} 秒
        </div>
      </div>
      <div style={{ position: 'absolute', right: 20, top: 20, fontSize: 15, lineHeight: 1.45, textAlign: 'right', textShadow: '0 1px 2px #000' }}>
        {eventEntries.map(([eventName, frame]) => (
          <div key={eventName} style={{ color: latest?.[0] === eventName ? '#ffd84a' : frame <= f ? '#8f8f8f' : '#f2f2f2' }}>
            f{frame} {eventName}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, bottom: 28, height: 16 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, background: '#777' }} />
        {eventEntries.map(([eventName, frame]) => (
          <div key={eventName} style={{ position: 'absolute', left: `${(frame / durationInFrames) * 100}%`, top: 0, width: 2, height: 16, background: '#bbb' }} />
        ))}
        <div style={{ position: 'absolute', left: `${(f / durationInFrames) * 100}%`, top: -4, width: 4, height: 24, background: '#ffd84a' }} />
      </div>
    </AbsoluteFill>
  );
};

// 四个要卡的事件的大字：从事件那一帧起留 1 秒再淡掉；头 2/24 秒反色、头 3/24 秒略放大，看得出正好落在哪一帧
const EventBigCaption: React.FC = () => {
  const f = useSnappedFrame();
  const onScreen = bigCaptionEvents
    .map((x) => ({ ...x, 帧: eventFrames[x.名], t: f - eventFrames[x.名] }))
    .filter((x) => x.t >= 0 && (x.t - captionHoldFrames) / fps < bigFadeOutSec);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', justifyContent: 'center', alignItems: 'center', gap: 14, fontFamily: uiFontFamily }}>
      {onScreen.map(({ 名: eventName, 字: bigText, 帧: frame, t }) => {
        const justArrived = t / fps < legacyFrameSec(2);
        return (
          <div
            key={eventName}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              padding: '2px 30px',
              borderRadius: 14,
              background: justArrived ? '#ffd84a' : 'rgba(20, 22, 26, 0.6)',
              color: justArrived ? '#202226' : '#ffd84a',
              opacity: 1 - clamp01(((t - captionHoldFrames) / fps + legacyFrameSec(1)) / bigFadeOutSec),
              transform: `scale(${sample([[0, 1.18], [legacyFrameSec(3), 1]], t / fps)})`,
            }}
          >
            <span style={{ fontSize: 104, fontWeight: 700, lineHeight: 1.2 }}>{bigText}</span>
            <span style={{ fontSize: 30 }}>{bigText === eventName ? '' : `${eventName} `}f{frame}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 原声放在拍立得外面：声音不跟画面定格
const picture: React.FC = () => (
  <>
    <Polaroid
      freezeFrame={eventFrames.clickFreeze}
      字="新存档的第一张"
      样式={polaroidStyle}
      overlay={
        <>
          <Lyrics lines={lyricLines} 样式={lyricStyle} 收={eventFrames.clickFreeze} />
          {checkpoint && <CheckpointAnnotation />}
        </>
      }
    >
      {(fs) => <Photo f={fs} />}
    </Polaroid>
    {checkpoint && <EventBigCaption />}
  </>
);

export default definePicture(seg, soundUrl, picture);
