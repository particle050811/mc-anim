// 2-第一晚 的画面：接着 2-初入 的地面剖面一镜不切（场/2-新世界 的 新世界：天、星星、地形、坑挖到哪），剖面里放你、掉落物、裂纹、破坏粒子、洞顶上走过的僵尸和洞里的暗，
// 最上面符文歌词；都包在整片后期里，调子跟着天亮从夜插到夏日白天。谁在哪、什么姿势全在 编排.ts，这里只按它画。
// 不描边（用户 10-24 定全片不描边）。
import type React from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { shadingScope } from '@engine/三渲二/画布.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { stevePose, vanillaWalk } from '@库/角色/史蒂夫.tsx';
import { Zombie, ZOMBIE } from '@库/生物/僵尸.tsx';
import { collectBreakParticles, spawnBlockBreak } from '@库/特效/方块破坏粒子.tsx';
import { type Particle, ParticleQuads, particleTexture } from '@库/特效/粒子面片.tsx';
import { fps, aspect } from '../../分镜/时间.ts';
import { groundLayers, drop, particleColor } from '../../场/2-第一晚/参数.ts';
import { FirstNightSteve } from '../../场/2-第一晚/史蒂夫.tsx';
import { GroundDirt, dirtTexture } from '../../场/2-第一晚/泥土块.tsx';
import { BlockCracks } from '../../场/2-第一晚/裂纹.tsx';
import { NewWorld } from '../../场/2-新世界/世界.tsx';
import { RuneLyric, runeLyricDefault } from '../../界面/符文歌词.tsx';
import { mainCutLyricLine } from '../../界面/符文歌词数据.ts';
import { shadingBySeg } from '../../默认.ts';
import { zombieState, stripAt, pitStateAt, skyTick, dropItems, toSongFrame, songSec, holeDark, shards, crackState, toneAt, shotAt, topWallDark, SteveState } from './编排.ts';
import { definePicture } from '@engine/段/段画面.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { useSnappedFrame } from '../../当前帧.ts';

const width = aspect.宽, height = aspect.高;
const lyricLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, toSongFrame(0)));

// ---------- 破坏粒子：原版 TerrainParticle，草方块、泥土的粒子贴图都是泥土 ----------
const dirtPng = dirtTexture();
const particleImage = particleTexture(dirtPng.px, dirtPng.w, dirtPng.h, dirtPng);
const shardParticles = shards.map((c, i) => spawnBlockBreak([...c.格] as V3, [1, 1, 1], [0, 0, 1, 1], [1, 1, 1], 31 + i));
const scaleColor = (hex: string, k: number): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v * k) as [number, number, number];
};

const ParticleField: React.FC<{ f: number; tint: string }> = ({ f, tint }) => {
  const out: Particle[] = [];
  shards.forEach((c, i) => collectBreakParticles(shardParticles[i]!, (f - c.帧) / fps, out));
  // 剖面外（y < 0）那排方块是切掉的，崩到那里的粒子会浮在剖面前面：不画（游戏里它们撞在那排方块上）
  const color = scaleColor(tint, particleColor);
  const visible = out.filter((p) => p.p[1] >= 0.02).map((p) => ({ ...p, color: color }));
  return <ParticleQuads tex={particleImage} items={visible} />;
};

// ---------- 洞里的暗：洞里两格（填上的土底下到坑底）各两层黑。前一层在坑的剖面上（y 0，你也在它后面），后一层贴在后墙前面（y 1 前一点，你在它前面），后墙比你暗；
// 天光照下来时两格从上往下一格一格退掉。另有一层盖后墙顶上那格（草方块朝洞里那面），洞顶开着时压一点，看得出那格是凹进去的 ----------
const blackMaterial = () => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const darkMaterials = [0, 1, 2, 3].map(blackMaterial);
const topWallMaterial = blackMaterial();
/** 第 格 格（0 在上）的中心 z：草那层底下一格起往下 */
const cellCenterZ = (cellDepth: number) => groundLayers.grassLayer - 0.5 - cellDepth;
const BlackPatch: React.FC<{ material: THREE.Material; 位: V3 }> = ({ material, 位: pos }) => (
  <mesh position={pos} rotation={[Math.PI / 2, 0, 0]} material={material}>
    <planeGeometry args={[1, 1]} />
  </mesh>
);
const HoleDark: React.FC<{ darkness: { 前: number; 后: number }[]; topY: number }> = ({ darkness, topY }) => {
  const pieces: React.ReactNode[] = [];
  darkness.forEach((darkCell, cellIndex) =>
    [darkCell.前, darkCell.后].forEach((a, sideLayer) => {
      if (!(a > 0)) return;
      const material = darkMaterials[cellIndex * 2 + sideLayer]!;
      material.opacity = a;
      pieces.push(<BlackPatch key={`${cellIndex}-${sideLayer}`} material={material} 位={[0, sideLayer === 0 ? -0.001 : 0.99, cellCenterZ(cellIndex)]} />);
    }),
  );
  if (topY > 0) {
    topWallMaterial.opacity = topY;
    pieces.push(<BlackPatch key="顶" material={topWallMaterial} 位={[0, 0.99, groundLayers.grassLayer + 0.5]} />);
  }
  return <>{pieces}</>;
};

// ---------- 洞顶上走过的僵尸（原版模型，朝东走） ----------
const Zombies: React.FC<{ f: number }> = ({ f }) => {
  const z = zombieState(f);
  if (!z) return null;
  return <Zombie pose={{ loc: [z.x, 0.5, 0], yaw: -90, ...vanillaWalk(ZOMBIE.speed.wander, z.walkSec), sec: songSec(f) }} />;
};

// ---------- 你 ----------
const You: React.FC<{ f: number }> = ({ f }) => {
  const s = SteveState(f);
  const pose = stevePose([s.x, 0.5, s.z], s.yaw, { sec: songSec(f), headPitch: s.头, crouch: s.crouching ? 1 : 0, holdR: s.holdingDirt });
  return <FirstNightSteve pose={pose} swing={s.swing} holdingDirt={s.holdingDirt} />;
};

const FallingDirt: React.FC<{ f: number }> = ({ f }) => (
  <>
    {dropItems(f).map((p, i) => (
      <GroundDirt key={i} 位={p.位} 转={p.转} 大小={drop.大小} />
    ))}
  </>
);

const picture: React.FC = () => {
  const f = useSnappedFrame();
  const t = toneAt(f);
  const crack = crackState(f);
  return (
    <>
      <FilmPost grade={t.grade} 种子={toSongFrame(f)}>
        {/* 光影照 默认.ts 的 光影段 */}
        <shadingScope.Provider value={{ shading: shadingBySeg['2-第一晚'] }}>
          <NewWorld cameraRig={shotAt(f)} 你={null} tint={t.tint} 刻={skyTick(f)} section={{ pit: pitStateAt(f), peeled: stripAt(f) }} 宽={width} 高={height}>
            <You f={f} />
            <FallingDirt f={f} />
            {crack && <BlockCracks 格={crack.格} 级={crack.级} />}
            <ParticleField f={f} tint={t.tint} />
            <Zombies f={f} />
            <HoleDark darkness={holeDark(f)} topY={topWallDark(f)} />
          </NewWorld>
        </shadingScope.Provider>
        <RuneLyric lines={lyricLines} 样式={{ ...runeLyricDefault, outlineColor: t.outlineColor }} />
      </FilmPost>
    </>
  );
};

export default definePicture(seg, soundUrl, picture);
