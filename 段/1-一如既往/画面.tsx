// 占位画面：灰色房间，她坐的位置放一个灰盒，第一人称固定机位；叠上帧号和 分镜.ts 的事件，用来核卡点。
// 歌词、拍立得定格已经接上；房子、酒狐、第一人称的手、聊天栏做好后逐个换掉灰盒和占位。
// 照片里只画 3D，按定格后的 fs 画；事件名、帧号、事件表、时间轴是核卡点用的标注，按真实帧走、不定格（照片里不留字）。
// 四个要卡的事件用大字，画在闪白上面，咔哒那一帧也看得见；其余事件用小字，和歌词一样画在照片上面、闪白下面。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp01, sample } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 第一人称机位, 眼位 } from '../../地点/机位.tsx';
import { 拍立得样式, 歌词样式, 视角 } from '../../场/1-隐世之境一楼/参数.ts';
import { fps, 段时钟, 段内事件帧, 第几句, type 事件名 } from '../../分镜.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 歌词, type 歌词行 } from '../../界面/歌词.tsx';
import { 拍立得 } from '../../特效/拍立得.tsx';
import 段 from './段.ts';

const 键 = '1-一如既往';
const 起帧 = 段时钟(键).场窗口.起帧;
const 事件帧 = 段内事件帧(键);
const 事件们 = (Object.entries(事件帧) as [事件名, number][]).sort((a, b) => a[1] - b[1]);

// 节点 1 给用户核卡点的四个事件。聊天栏弹出就是驯服那一下（爱心、两行消息同时出）
const 大字事件: readonly { 名: 事件名; 字: string }[] = [
  { 名: '右键', 字: '右键' },
  { 名: '驯服', 字: '聊天栏' },
  { 名: '微笑推镜', 字: '微笑推镜' },
  { 名: '咔哒定格', 字: '咔哒定格' },
];
const 大字名 = new Set<事件名>(大字事件.map((x) => x.名));
/** 事件名从事件那一帧起留多久；大字之后再用几帧淡掉 */
const 标注留帧 = fps;
const 大字淡出帧 = 6;

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

// 照片里的画面：f 是定格后的 fs。灰房间是静的还用不上，换成房子、酒狐、手以后都按它画
const 占位场景: React.FC<{ f: number }> = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#202226' }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
        <color attach="background" args={['#202226']} />
        <第一人称机位 眼={眼位(玩家脚)} 看={看} 视角={视角} />
        <房间 />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

// 核卡点的标注：按真实帧走，定格以后照常往下数
const 占位标注: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const 歌帧 = 起帧 + f;
  const 最近 = 事件们.filter(([, 帧]) => 帧 <= f).at(-1);
  // 小字：不是大字的事件里最近的那一帧（同一帧有几个就都列出来）。放在歌词下面，定格以后不挡照片下白边的字
  const 小字帧 = 事件们.filter(([名, 帧]) => !大字名.has(名) && 帧 <= f).at(-1)?.[1];
  const 小字们 = 事件们.filter(([名, 帧]) => !大字名.has(名) && 帧 === 小字帧).map(([名]) => 名);
  const 下一个 = 事件们.find(([, 帧]) => 帧 > f);
  return (
    <AbsoluteFill style={{ fontFamily: uiFontFamily, color: '#f2f2f2' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 118, textAlign: 'center', textShadow: '0 2px 6px #000' }}>
        {小字帧 !== undefined && f - 小字帧 < 标注留帧 ? (
          <div style={{ fontSize: 32, color: '#ffd84a' }}>
            {小字们.join('、')}（f{小字帧}）
          </div>
        ) : (
          <div style={{ fontSize: 24, color: '#cccccc' }}>{下一个 ? `下一个：${下一个[0]}（f${下一个[1]}）` : '段尾'}</div>
        )}
      </div>
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

// 四个要卡的事件的大字：从事件那一帧起留 1 秒再淡掉；头两帧反色、略放大，看得出正好落在哪一帧
const 事件大字: React.FC = () => {
  const f = useCurrentFrame();
  const 在显示 = 大字事件
    .map((x) => ({ ...x, 帧: 事件帧[x.名], t: f - 事件帧[x.名] }))
    .filter((x) => x.t >= 0 && x.t < 标注留帧 + 大字淡出帧);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', justifyContent: 'center', alignItems: 'center', gap: 14, fontFamily: uiFontFamily }}>
      {在显示.map(({ 名, 字, 帧, t }) => {
        const 刚到 = t < 2;
        return (
          <div
            key={名}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 18,
              padding: '2px 30px',
              borderRadius: 14,
              background: 刚到 ? '#ffd84a' : 'rgba(20, 22, 26, 0.6)',
              color: 刚到 ? '#202226' : '#ffd84a',
              opacity: 1 - clamp01((t - 标注留帧 + 1) / 大字淡出帧),
              transform: `scale(${sample([[0, 1.18], [3, 1]], t)})`,
            }}
          >
            <span style={{ fontSize: 104, fontWeight: 700, lineHeight: 1.2 }}>{字}</span>
            <span style={{ fontSize: 30 }}>{字 === 名 ? '' : `${名} `}f{帧}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// 原声放在拍立得外面：声音不跟画面定格
const 画面: React.FC = () => (
  <>
    <配乐音轨 song={原声} 段={段} />
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
    <事件大字 />
  </>
);

export default 画面;
