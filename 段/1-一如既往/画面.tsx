// 验证片唯一的一段：第一人称固定机位，她坐在隐世之境一楼主厅的地毯上，玩家右键递蛋糕、驯服、微笑推镜、咔哒定格成拍立得。
// 魔法酒狐接上之前她先是灰盒（和 核对-隐世之境一楼 的灰盒一样大）。
// 照片里的东西都按定格后的 fs 画：世界画布（一楼、一楼灯光、她、驯服爱心），上面叠手画布，再上面是原版聊天栏；歌词是浮层，不定格、不跟着缩。
// 事件帧全从 分镜.ts 取（段内帧 = 歌曲帧 − 段起），摆位、视角、种子这些 Agent 暂定的数在场参数，这里不写帧号。
// 原版的东西按刻走（20 刻一秒）：手从右键那一帧起数，聊天栏、爱心从驯服那一帧起数。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp01, rad, sample } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { FirstPersonCanvas, FirstPersonHand, type HandScript, handTimeline, viewAngles } from '@库/角色/第一人称.tsx';
import { LiYingFirstPersonArm } from '@库/角色/李樱第一人称.tsx';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { 第一人称机位, 眼位 } from '../../地点/机位.tsx';
import { 一楼, 一楼灯光, 隐世之境一楼 } from '../../地点/隐世之境一楼.tsx';
import { 拍立得样式, 机位, 歌词样式, 爱心种子, 聊天缩放, 视角 } from '../../场/1-隐世之境一楼/参数.ts';
import { 驯服聊天行 } from '../../场/1-隐世之境一楼/聊天.ts';
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

/** 打开就在画面上叠帧号、事件表和四个要卡的事件的大字（节点 1 核卡点用的），成片关着 */
const 核卡点 = false;

// 这一段唱第 13–15 句，每句从开口（前导音，没有就是句首）淡入，第 15 句在咔哒定格时淡出
const 歌词行们: readonly 歌词行[] = [
  { 词: 第几句(13).词, 入: 事件帧.第13句开口 },
  { 词: 第几句(14).词, 入: 事件帧.第14句开口 },
  { 词: 第几句(15).词, 入: 事件帧.第15句开口 },
];

/** 段内帧 → 从某个事件那一帧起数的原版刻（可带小数） */
const 刻 = (f: number, 起: number) => ((f - 起) / fps) * 20;

// 摆位（网格本地坐标，Z 朝上）：她坐在模板里那只女仆的位置、面朝南，玩家站在她南边
const 加 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const 她 = 一楼.女仆;
const 眼 = 眼位(加(她, 机位.玩家));
const 起看 = 加(她, 机位.看);
const 终看 = 加(她, 机位.推到底看);

// 推镜：微笑推镜到咔哒定格缓入缓出，只收世界那一遍的视角（原版拉近时手那一遍固定 70° 不变）。
// 视角按放大倍数的对数插值，推起来是匀匀地放大；看点跟着从起看挪到她脸上
const 推镜进度 = (fs: number) => sample([[事件帧.微笑推镜, 0], [事件帧.咔哒定格, 1]], fs);
const 半张角 = (度: number) => Math.tan(rad(度) / 2);
const 推镜视角 = (p: number) => (2 * Math.atan(半张角(视角) * (半张角(机位.推到底视角) / 半张角(视角)) ** p) * 180) / Math.PI;
const 推镜看 = (p: number): V3 => [0, 1, 2].map((i) => 起看[i]! + (终看[i]! - 起看[i]!) * p) as V3;

// 女仆的碰撞箱 0.6 × 1.5（TLM `EntityMaid.TYPE`，坐下不变），爱心照它从脚底往上放
const 爱心 = tamingHearts(她, 0.6, 1.5, 0, 爱心种子);
const 聊天 = 驯服聊天行(0);

// 右键在第 0 刻；第 1 刻手里的蛋糕被吃掉（生存模式，客户端这时收到物品栏更新），空手再按换手升上来
const 手剧本: HandScript = { start: '蛋糕', swings: [0], changes: [{ tick: 1, to: null }] };

// 窗外露出来的天，同 核对-隐世之境一楼
const 天色 = '#9fc4ff';

/** 魔法酒狐接上之前的她：脚底在地毯顶面 */
const 灰盒她: React.FC = () => (
  <mesh position={[她[0], 她[1], 她[2] + 0.425]} castShadow receiveShadow>
    <boxGeometry args={[0.5, 0.5, 0.85]} />
    <meshStandardMaterial color="#b5b5b5" />
  </mesh>
);

const 世界: React.FC<{ fs: number; 看: V3; 视角: number }> = ({ fs, 看, 视角: v }) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} gl={{ antialias: true }}>
      <color attach="background" args={[天色]} />
      <第一人称机位 眼={眼} 看={看} 视角={v} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <一楼灯光 />
        <隐世之境一楼 />
        <灰盒她 />
        <HeartParticles spawns={爱心} 刻={刻(fs, 事件帧.驯服)} />
      </group>
    </ThreeCanvas>
  );
};

const 手: React.FC<{ fs: number; 看: V3 }> = ({ fs, 看 }) => {
  const { width, height } = useVideoConfig();
  const h = handTimeline(刻(fs, 事件帧.右键), 手剧本);
  return (
    <FirstPersonCanvas width={width} height={height} view={viewAngles(眼, 看)}>
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
const 照片: React.FC<{ f: number }> = ({ f }) => {
  const p = 推镜进度(f);
  const 看 = 推镜看(p);
  return (
    <AbsoluteFill>
      <世界 fs={f} 看={看} 视角={推镜视角(p)} />
      <手 fs={f} 看={看} />
      <ChatOverlay lines={聊天} 刻={刻(f, 事件帧.驯服)} s={聊天缩放} />
    </AbsoluteFill>
  );
};

// 下面两个是 核卡点 打开时才画的标注
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

// 核卡点的标注：按真实帧走，定格以后照常往下数
const 核卡点标注: React.FC = () => {
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
        <div>{键} · 核卡点</div>
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
          {核卡点 && <核卡点标注 />}
        </>
      }
    >
      {(fs) => <照片 f={fs} />}
    </拍立得>
    {核卡点 && <事件大字 />}
  </>
);

export default 画面;
