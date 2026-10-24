// 2-第一晚 的画面：接着 2-初入 的地面剖面一镜不切（场/2-新世界 的 新世界：天、星星、地形、坑挖到哪），剖面里放你、掉落物、裂纹、破坏粒子和封顶后洞里的暗，
// 最上面符文歌词；都包在整片后期里，调子跟着天亮从夜插到夏日白天。谁在哪、什么姿势全在 编排.ts，这里只按它画。
// 不描边（用户 10-24 定全片不描边）。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { collectBreakParticles, spawnBlockBreak } from '@库/特效/方块破坏粒子.tsx';
import { type Particle, ParticleQuads, particleTexture } from '@库/特效/粒子面片.tsx';
import { fps, 画幅 } from '../../分镜.ts';
import { 地层, 掉落物, 粒子色, 音效们 } from '../../场/2-第一晚/参数.ts';
import { 第一晚史蒂夫 } from '../../场/2-第一晚/史蒂夫.tsx';
import { 地上泥土, 泥土贴图 } from '../../场/2-第一晚/泥土块.tsx';
import { 裂纹 } from '../../场/2-第一晚/裂纹.tsx';
import { 新世界 } from '../../场/2-新世界/世界.tsx';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 音效轨 } from '../../声音/音效轨.tsx';
import { 剥, 坑态, 天刻, 掉落物们, 歌曲帧, 歌秒, 洞暗, 碎们, 裂纹态, 调子, 镜头, 史蒂夫态 } from './编排.ts';
import 段 from './段.ts';
import 挖声一 from 'asset:音效/block.grass.break.2';
import 挖声二 from 'asset:音效/block.gravel.break.1';
import 挖声三 from 'asset:音效/block.gravel.break.2';
import 放声 from 'asset:音效/block.gravel.break.3';
import 天窗声 from 'asset:音效/block.gravel.break.4';

const 宽 = 画幅.宽, 高 = 画幅.高;
const 音源: Record<keyof typeof 音效们, string> = { 挖一: 挖声一, 挖二: 挖声二, 挖三: 挖声三, 填土: 放声, 挖开天窗: 天窗声 };
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 歌曲帧(0)));

// ---------- 破坏粒子：原版 TerrainParticle，草方块、泥土的粒子贴图都是泥土 ----------
const 泥土 = 泥土贴图();
const 粒子图 = particleTexture(泥土.px, 泥土.w, 泥土.h, 泥土);
const 碎粒们 = 碎们.map((c, i) => spawnBlockBreak([...c.格] as V3, [1, 1, 1], [0, 0, 1, 1], [1, 1, 1], 31 + i));
const 乘色 = (hex: string, k: number): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v * k) as [number, number, number];
};

const 粒子: React.FC<{ f: number; 色调: string }> = ({ f, 色调 }) => {
  const out: Particle[] = [];
  碎们.forEach((c, i) => collectBreakParticles(碎粒们[i]!, (f - c.帧) / fps, out));
  // 剖面外（y < 0）那排方块是切掉的，崩到那里的粒子会浮在剖面前面：不画（游戏里它们撞在那排方块上）
  const 色 = 乘色(色调, 粒子色);
  const 看得见 = out.filter((p) => p.p[1] >= 0.02).map((p) => ({ ...p, color: 色 }));
  return <ParticleQuads tex={粒子图} items={看得见} />;
};

// ---------- 封顶后洞里的暗：两层黑，都盖洞里那一截（x −0.5～0.5、坑底以上到填上的土底下）。前一层在坑的剖面上（y 0，你也在它后面），
// 后一层贴在后墙前面（y 1 前一点，你在它前面），后墙比你暗 ----------
const 暗材质们 = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
const 洞口中z = (地层.坑底 + 1 + 地层.草) / 2;
const 洞口高 = 地层.草 - (地层.坑底 + 1);
const 暗层们: readonly V3[] = [
  [0, -0.001, 洞口中z],
  [0, 0.99, 洞口中z],
];
const 洞里暗: React.FC<{ 暗: { 前: number; 后: number } }> = ({ 暗 }) => (
  <>
    {[暗.前, 暗.后].map((a, i) => {
      if (!(a > 0)) return null;
      暗材质们[i]!.opacity = a;
      return (
        <mesh key={i} position={暗层们[i]} rotation={[Math.PI / 2, 0, 0]} material={暗材质们[i]}>
          <planeGeometry args={[1, 洞口高]} />
        </mesh>
      );
    })}
  </>
);

// ---------- 你 ----------
const 你: React.FC<{ f: number }> = ({ f }) => {
  const s = 史蒂夫态(f);
  const 姿 = stevePose([s.x, 0.5, s.z], s.yaw, { sec: 歌秒(f), headPitch: s.头, crouch: s.蹲 ? 1 : 0, holdR: s.拿土 });
  return <第一晚史蒂夫 pose={姿} 出手={s.出手} 拿土={s.拿土} />;
};

const 掉的土: React.FC<{ f: number }> = ({ f }) => (
  <>
    {掉落物们(f).map((p, i) => (
      <地上泥土 key={i} 位={p.位} 转={p.转} 大小={掉落物.大小} />
    ))}
  </>
);

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const t = 调子(f);
  const 裂 = 裂纹态(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      {(Object.keys(音源) as (keyof typeof 音效们)[]).map((名) => (
        <音效轨 key={名} src={音源[名]} 资产={音效们[名].资产} 段={段} />
      ))}
      <整片后期 调色={t.调色} 种子={歌曲帧(f)}>
        <新世界 机位={镜头(f)} 你={null} 色调={t.色调} 刻={天刻(f)} 剖={{ 坑: 坑态(f), 剥: 剥(f) }} 宽={宽} 高={高}>
          <你 f={f} />
          <掉的土 f={f} />
          {裂 && <裂纹 格={裂.格} 级={裂.级} />}
          <粒子 f={f} 色调={t.色调} />
          <洞里暗 暗={洞暗(f)} />
        </新世界>
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: t.描边 }} />
      </整片后期>
    </>
  );
};

export default 画面;
