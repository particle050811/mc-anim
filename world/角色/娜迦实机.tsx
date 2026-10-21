// 娜迦（游戏实机）：照暮色森林 1.20.1-4.3.2508 的模型代码和贴图做，尺寸、贴图都是游戏原样。依据（mod jar 反汇编）：
// - `NagaModel`：头和每节身体都是 16×16×16 像素方盒，贴图 64×32；没有下颌牙齿几何体，脸画在贴图上。
// - `NagaRenderer`：头放大 2.01 倍并抬高，占脚底以上 1.0~3.0 格；眩晕时头垂下，占 0.35~2.37 格并前移 0.35 格。`NagaSegmentRenderer`：身体节放大 2 倍，占节位置以上 0~2.0 格。
// - `Naga`：满血 12 节，节数随血量减少；相邻两节中心距 2.0 格。碰撞箱 1.75×3.0。
// 头贴图三种状态：平常、冲撞（charging）、眩晕（dazed，游戏里是叠在平常贴图上的眼睑）。
// 受伤变红：头走 `MobRenderer`，身体节走 `TFPartRenderer.getPackedOverlay`，取头（本体）的 hurtTime / deathTime，所以哪节挨刀都是整条一起红（pose.hurt，红的样子见 lib/贴图方盒.tsx 的 `HURT_OVERLAY`）。
// 坐标：原点在脚底中心，脸朝 -Y，单位格。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import { V3 } from '../../engine/model/parts.tsx';
import { EntityTexture, TexBox } from '../../engine/model/贴图方盒.tsx';
import { pngDir } from '../../engine/model/贴图.ts';

const TEX = pngDir(import.meta.webpackContext('./娜迦实机.贴图', { regExp: /\.png$/ })) as Record<'head' | 'charging' | 'dazed' | 'segment', EntityTexture>;

export const GAME_NAGA = {
  headSize: 2.01,
  headBottom: 1.007, // 头底面离脚底的高度
  segmentSize: 2,
  segmentSpacing: 2,
  maxSegments: 12,
  hitbox: [1.75, 3.0], // 宽、高
  debris: ['#2f6b1a', '#3f8a22', '#1c3d10', '#57a02c'], // 碎屑配色：取自贴图的几种绿
};
const NAGA = GAME_NAGA;

export type GameNagaState = 'normal' | 'charging' | 'dazed';

export const GameNagaHead: React.FC<{ state?: GameNagaState; hurt?: boolean }> = ({ state = 'normal', hurt }) => {
  const dazed = state === 'dazed';
  const headSize = NAGA.headSize;
  // 眩晕：模型里多平移 (0, 1.075-0.75, 0.175) 再乘 2.01，即下降 0.653 格、前移 0.352 格
  const z = (dazed ? 0.354 : NAGA.headBottom) + headSize / 2;
  const y = dazed ? -0.352 : 0;
  return (
    <group position={[0, y, z]}>
      <TexBox tex={state === 'charging' ? TEX.charging : TEX.head} px={[16, 16, 16]} uv={[0, 0]} s={[headSize, headSize, headSize]} hurt={hurt} />
      {dazed && <TexBox tex={TEX.dazed} px={[16, 16, 16]} uv={[0, 0]} s={[headSize + 0.02, headSize + 0.02, headSize + 0.02]} alphaTest={0.5} hurt={hurt} />}
    </group>
  );
};

// 身体是一节节独立的方块，被斩开就是两节分开，断口露出来的仍是方块本身的绿色鳞片面，不加红色断面
// （方块生物没有血肉，红色断面也容易让生成的视频出现血液、过不了审核）
export const GameNagaSegment: React.FC<{ hurt?: boolean }> = ({ hurt }) => (
  <TexBox tex={TEX.segment} px={[16, 16, 16]} uv={[0, 0]} s={[NAGA.segmentSize, NAGA.segmentSize, NAGA.segmentSize]} p={[0, 0, NAGA.segmentSize / 2]} hurt={hurt} />
);

// yaw：绕 Z 的角度，0 = 脸朝 -Y；pitch：头绕自身中心的俯仰，负 = 抬头；scale：0 = 已消散；hurt：整条受伤 / 死亡变红（hurtTime 或 deathTime > 0）
export type GameNagaPose = {
  hurt?: boolean;
  head: { loc: number[]; yaw: number; pitch?: number; state?: GameNagaState; scale?: number };
  segs: { loc: number[]; yaw: number; scale?: number }[];
};

export const GameNaga: React.FC<{ pose: GameNagaPose }> = ({ pose }) => {
  const hz = NAGA.headBottom + NAGA.headSize / 2;
  const hs = pose.head.scale ?? 1;
  return (
    <>
      {pose.segs.map((s, i) =>
        (s.scale ?? 1) > 0 ? (
          <group key={i} position={s.loc as V3} rotation={[0, 0, rad(s.yaw)]} scale={s.scale ?? 1}>
            <GameNagaSegment hurt={pose.hurt} />
          </group>
        ) : null,
      )}
      {hs > 0 && (
        <group position={pose.head.loc as V3} rotation={[0, 0, rad(pose.head.yaw)]} scale={hs}>
          <group position={[0, 0, hz]} rotation={[rad(pose.head.pitch ?? 0), 0, 0]}>
            <group position={[0, 0, -hz]}>
              <GameNagaHead state={pose.head.state} hurt={pose.hurt} />
            </group>
          </group>
        </group>
      )}
    </>
  );
};

// 沿一条路径摆出整条娜迦：path(d) 给出离头 d 格处的平面位置，身体节每隔 2 格放一个，朝向指向前一节
export const nagaAlong = (path: (distFromHead: number) => [number, number], z = 0, segCount = NAGA.maxSegments, state?: GameNagaState): GameNagaPose => {
  const pts = Array.from({ length: segCount + 1 }, (_, i) => path(i * NAGA.segmentSpacing));
  // 脸朝 -Y 时 yaw=0；朝向 (dx, dy) 对应的 yaw = atan2(dx, -dy)
  const yawTo = (a: [number, number], b: [number, number]) => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  return {
    head: { loc: [pts[0][0], pts[0][1], z], yaw: yawTo(pts[1], pts[0]), state },
    segs: pts.slice(1).map((p, i) => ({ loc: [p[0], p[1], z], yaw: yawTo(p, pts[i]) })),
  };
};
