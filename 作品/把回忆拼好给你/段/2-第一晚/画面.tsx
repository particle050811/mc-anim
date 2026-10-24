// 2-第一晚 的画面：场/2-第一晚/剖面画布.tsx（天 + 三渲二地形）里放你、僵尸、苦力怕、裂纹、破坏粒子、掉落物和封顶后洞里的暗，
// 上面叠原版聊天栏（窄成 聊天宽）、死亡画面，最上面符文歌词；都包在整片后期里，调子跟着天亮从夜插到夏日白天。谁在哪、什么姿势全在 编排.ts，这里只按它画。
// 角色、生物、掉落物各包一组描边；裂纹、粒子、洞里的暗不描边。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { stevePose, vanillaWalk } from '@库/角色/史蒂夫.tsx';
import { Creeper, CREEPER } from '@库/生物/苦力怕.tsx';
import { Zombie, ZOMBIE, type ZombiePose, zombieLookAt } from '@库/生物/僵尸.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { collectBreakParticles, spawnBlockBreak } from '@库/特效/方块破坏粒子.tsx';
import { type Particle, ParticleQuads, particleTexture } from '@库/特效/粒子面片.tsx';
import { fps, 画幅 } from '../../分镜.ts';
import { 剖面画布 } from '../../场/2-第一晚/剖面画布.tsx';
import { 僵尸, 地层, 掉落物, 死亡消息们, 界面缩放, 粒子色, 聊天宽, 苦力怕, 史蒂夫倍数, 重生关帧, 音效们 } from '../../场/2-第一晚/参数.ts';
import { 近景地形, 远景地形 } from '../../场/2-第一晚/地形.ts';
import { 第一晚史蒂夫 } from '../../场/2-第一晚/史蒂夫.tsx';
import { 死亡画面 } from '../../场/2-第一晚/死亡画面.tsx';
import { 地上泥土, 泥土贴图 } from '../../场/2-第一晚/泥土块.tsx';
import { 裂纹 } from '../../场/2-第一晚/裂纹.tsx';
import { 第一晚像素字 } from '../../场/2-第一晚/像素字.ts';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 原声 } from '../../配乐/原声.ts';
import { 音效轨 } from '../../声音/音效轨.tsx';
import {
  事,
  坑态,
  天刻,
  快进起,
  掉落物们,
  歌曲帧,
  歌秒,
  洞暗,
  生物秒,
  碎们,
  聊天刻,
  聊天行们,
  裂纹态,
  调子,
  走到,
  镜头,
  史蒂夫态,
  死亡画面态,
} from './编排.ts';
import 段 from './段.ts';
import 摔声 from 'asset:音效/entity.player.big_fall';
import 死声 from 'asset:音效/entity.player.hurt.1';
import 点声 from 'asset:音效/ui.button.click';
import 挖声一 from 'asset:音效/block.grass.break.2';
import 挖声二 from 'asset:音效/block.gravel.break.1';
import 挖声三 from 'asset:音效/block.gravel.break.2';
import 放声 from 'asset:音效/block.gravel.break.3';
import 天窗声 from 'asset:音效/block.gravel.break.4';
import 僵尸声 from 'asset:音效/把回忆拼好给你/entity.zombie.ambient.2';

const 宽 = 画幅.宽, 高 = 画幅.高;
/** 原版玩家站着的眼高（格） */
const 眼高 = 1.62;
const 音源: Record<keyof typeof 音效们, string> = { 摔: 摔声, 死: 死声, 点: 点声, 挖一: 挖声一, 挖二: 挖声二, 挖三: 挖声三, 填土: 放声, 挖开天窗: 天窗声, 僵尸: 僵尸声 };
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

// ---------- 封顶后洞里的暗：盖在坑的剖面上（x −0.5～0.5、z −3～−1），你也在它后面 ----------
const 暗材质 = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const 洞口: { 中: V3; 高: number } = { 中: [0, -0.001, (地层.石顶 + 1 + 地层.草) / 2], 高: 地层.草 - (地层.石顶 + 1) };
const 洞里暗: React.FC<{ 不透明: number }> = ({ 不透明 }) => {
  if (!(不透明 > 0)) return null;
  暗材质.opacity = 不透明;
  return (
    <mesh position={洞口.中} rotation={[Math.PI / 2, 0, 0]} material={暗材质}>
      <planeGeometry args={[1, 洞口.高]} />
    </mesh>
  );
};

// ---------- 角色 ----------
const 你: React.FC<{ f: number }> = ({ f }) => {
  const s = 史蒂夫态(f);
  // 远景画面上沿 z 10.75：还在上面的时候不画
  if (s.z > 12) return null;
  const 姿 = stevePose([s.x, 0.5, s.z], s.yaw, { sec: 歌秒(f), headPitch: s.头, crouch: s.蹲 ? 1 : 0, holdR: s.拿土, scale: 史蒂夫倍数 });
  return (
    <描边>
      <贴图像素对齐 锚={姿.loc as V3}>
        <第一晚史蒂夫 pose={姿} 出手={s.出手} 倒={s.倒} 红={s.红} 拿土={s.拿土} />
      </贴图像素对齐>
    </描边>
  );
};

const 生物们: React.FC<{ f: number }> = ({ f }) => {
  const 秒 = 生物秒(f);
  const s = 史蒂夫态(f);
  // 僵尸：填土那一刻走到坑东边；之前有目标（举着手、头看着你），封顶以后丢了目标接着往左晃
  const 盯 = f >= 事.点重生 + 重生关帧 && f < 事.填土;
  let 僵: ZombiePose = {
    loc: [走到(f, 僵尸.到坑边x, 事.填土, ZOMBIE.speed.wander), 0.5, 0],
    yaw: 僵尸.朝向,
    ...vanillaWalk(ZOMBIE.speed.wander, 秒),
    aggressive: 盯,
    sec: 秒,
  };
  if (盯) 僵 = zombieLookAt(僵, [s.x, 0.5, s.z + 眼高], false);
  const 怕 = { loc: [走到(f, 苦力怕.快进起x, 快进起, CREEPER.speed.wander), 0.5, 0] as V3, yaw: 苦力怕.朝向, ...vanillaWalk(CREEPER.speed.wander, 秒) };
  return (
    <>
      <描边>
        <贴图像素对齐 锚={僵.loc}>
          <Zombie pose={僵} />
        </贴图像素对齐>
      </描边>
      <描边>
        <贴图像素对齐 锚={怕.loc}>
          <Creeper pose={怕} />
        </贴图像素对齐>
      </描边>
    </>
  );
};

const 掉的土: React.FC<{ f: number }> = ({ f }) => (
  <>
    {掉落物们(f).map((p, i) => (
      <描边 key={i}>
        <地上泥土 位={p.位} 转={p.转} 大小={掉落物.大小} />
      </描边>
    ))}
  </>
);

/** 聊天栏：原版设置里把宽度调窄到 聊天宽（底板宽 = 聊天宽 + 12），超出的那截剪掉 */
const 聊天: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: ((聊天宽 + 12) * 界面缩放) / 成片倍数, height: 高, overflow: 'hidden' }}>
    <像素聊天栏 lines={聊天行们} 刻={聊天刻(f)} 缩放={界面缩放} 字体={第一晚像素字} />
  </div>
);

const 画面: React.FC = () => {
  const f = useCurrentFrame();
  const t = 调子(f);
  const 镜 = 镜头(f);
  const 裂 = 裂纹态(f);
  const 死 = 死亡画面态(f);
  return (
    <>
      <配乐音轨 song={原声} 段={段} />
      {(Object.keys(音源) as (keyof typeof 音效们)[]).map((名) => (
        <音效轨 key={名} src={音源[名]} 资产={音效们[名].资产} 段={段} />
      ))}
      <整片后期 调色={t.调色} 种子={歌曲帧(f)}>
        <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden' }}>
          <剖面画布 镜={镜} 刻={天刻(f)} 调子={t} 地形={镜 === '远' ? 远景地形 : 近景地形(坑态(f))}>
            <生物们 f={f} />
            <你 f={f} />
            <掉的土 f={f} />
            {裂 && <裂纹 格={裂.格} 级={裂.级} />}
            <粒子 f={f} 色调={t.色调} />
            <洞里暗 不透明={洞暗(f)} />
          </剖面画布>
          <聊天 f={f} />
          {死 && <死亡画面 态={死} 死因={死亡消息们[2]} />}
        </div>
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: t.描边 }} />
      </整片后期>
    </>
  );
};

export default 画面;
