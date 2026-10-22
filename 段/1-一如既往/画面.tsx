// 占位画面：灰色房间，她坐的位置放一个灰盒，第一人称固定机位；叠上帧号和 分镜.ts 的事件，用来核卡点。
// 歌词、拍立得定格已经接上；房子、酒狐、第一人称的手、聊天栏做好后逐个换掉灰盒和占位。
// 照片里画的（3D、中间的事件名）按定格后的 fs 画；帧号、事件表、时间轴是核卡点用的标注，和歌词一样不定格、画在照片上面。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 第一人称机位, 眼位 } from '../../地点/机位.tsx';
import { 拍立得样式, 歌词样式, 视角 } from '../../场/1-隐世之境一楼/参数.ts';
import { fps, 段时钟, 段内事件帧, 第几句, type 事件名 } from '../../分镜.ts';
import { 歌词, type 歌词行 } from '../../界面/歌词.tsx';
import { 拍立得 } from '../../特效/拍立得.tsx';

const 键 = '1-一如既往';
const 起帧 = 段时钟(键).场窗口.起帧;
const 事件帧 = 段内事件帧(键);
const 事件们 = (Object.entries(事件帧) as [事件名, number][]).sort((a, b) => a[1] - b[1]);

// 这一段唱第 13–15 句，每句从开口（前导音，没有就是句首）淡入，第 15 句在咔哒定格时淡出
const 歌词行们: readonly 歌词行[] = [
  { 词: 第几句(13).词, 入: 事件帧.第13句开口 },
  { 词: 第几句(14).词, 入: 事件帧.第14句开口 },
  { 词: 第几句(15).词, 入: 事件帧.第15句开口 },
];

// 占位的摆位（场景坐标，Z 朝上，原点是她坐的地方、地毯顶面）：她面朝南，玩家站在她南边 2.25 格、面朝北
const 她: V3 = [0, 0, 0];
const 玩家脚: V3 = [0, -2.25, 0];
const 看: V3 = [0, 0, 0.7];
const 房 = { 西: -4.5, 东: 4.5, 南: -4, 北: 4, 高: 4 };

const 盒: React.FC<{ 中: V3; 尺: V3; 色: string }> = ({ 中, 尺, 色 }) => (
  <mesh position={中}>
    <boxGeometry args={尺} />
    <meshStandardMaterial color={色} />
  </mesh>
);

const 房间: React.FC = () => {
  const 宽 = 房.东 - 房.西;
  const 深 = 房.北 - 房.南;
  const 中x = (房.东 + 房.西) / 2;
  const 中y = (房.北 + 房.南) / 2;
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, -3, 5]} intensity={1.6} />
      <盒 中={[中x, 中y, -0.05]} 尺={[宽, 深, 0.1]} 色="#8a8a8a" />
      <盒 中={[中x, 房.北 + 0.05, 房.高 / 2]} 尺={[宽, 0.1, 房.高]} 色="#9c9c9c" />
      <盒 中={[房.西 - 0.05, 中y, 房.高 / 2]} 尺={[0.1, 深, 房.高]} 色="#7b7b7b" />
      <盒 中={[房.东 + 0.05, 中y, 房.高 / 2]} 尺={[0.1, 深, 房.高]} 色="#7b7b7b" />
      <盒 中={[中x, 中y, 房.高 + 0.05]} 尺={[宽, 深, 0.1]} 色="#6a6a6a" />
      <盒 中={[她[0], 她[1], 她[2] + 0.425]} 尺={[0.5, 0.5, 0.85]} 色="#b5b5b5" />
    </group>
  );
};

// 照片里的画面：按 f 画（定格以后 f 停在定格帧）
const 占位场景: React.FC<{ f: number }> = ({ f }) => {
  const { width, height } = useVideoConfig();
  const 最近 = 事件们.filter(([, 帧]) => 帧 <= f).at(-1);
  const 下一个 = 事件们.find(([, 帧]) => 帧 > f);
  return (
    <AbsoluteFill style={{ background: '#202226', fontFamily: uiFontFamily, color: '#f2f2f2' }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <color attach="background" args={['#202226']} />
        <第一人称机位 眼={眼位(玩家脚)} 看={看} 视角={视角} />
        <房间 />
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', textShadow: '0 2px 6px #000' }}>
        {最近 && f - 最近[1] < fps ? (
          <div style={{ fontSize: 64, color: '#ffd84a' }}>
            {最近[0]}（f{最近[1]}）
          </div>
        ) : (
          <div style={{ fontSize: 28, color: '#cccccc' }}>{下一个 ? `下一个：${下一个[0]}（f${下一个[1]}）` : '段尾'}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// 核卡点的标注：按真实帧走，定格以后照常往下数
const 占位标注: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const 歌帧 = 起帧 + f;
  const 最近 = 事件们.filter(([, 帧]) => 帧 <= f).at(-1);
  return (
    <AbsoluteFill style={{ fontFamily: uiFontFamily, color: '#f2f2f2' }}>
      <div style={{ position: 'absolute', left: 24, bottom: 52, fontSize: 20, lineHeight: 1.5, textShadow: '0 1px 3px #000' }}>
        <div>{键} · 占位</div>
        <div>
          段内 f{f} / {durationInFrames}　歌曲帧 {歌帧}　{(歌帧 / fps).toFixed(3)} 秒
        </div>
      </div>
      <div style={{ position: 'absolute', right: 20, top: 20, fontSize: 15, lineHeight: 1.45, textAlign: 'right', textShadow: '0 1px 2px #000' }}>
        {事件们.map(([名, 帧]) => (
          <div key={名} style={{ color: 最近?.[0] === 名 ? '#ffd84a' : 帧 <= f ? '#8f8f8f' : '#f2f2f2' }}>
            f{帧} {名}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, bottom: 28, height: 16 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, background: '#777' }} />
        {事件们.map(([名, 帧]) => (
          <div key={名} style={{ position: 'absolute', left: `${(帧 / durationInFrames) * 100}%`, top: 0, width: 2, height: 16, background: '#bbb' }} />
        ))}
        <div style={{ position: 'absolute', left: `${(f / durationInFrames) * 100}%`, top: -4, width: 4, height: 24, background: '#ffd84a' }} />
      </div>
    </AbsoluteFill>
  );
};

const 画面: React.FC = () => (
  <拍立得
    定格帧={事件帧.咔哒定格}
    字="新存档的第一张"
    样式={拍立得样式}
    浮层={
      <>
        <歌词 行们={歌词行们} 样式={歌词样式} 收={事件帧.咔哒定格} />
        <占位标注 />
      </>
    }
  >
    {(fs) => <占位场景 f={fs} />}
  </拍立得>
);

export default 画面;
