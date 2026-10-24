// 第 15 句隐世之境这一镜（封面帧、正片）她手里的月铃兰。主会话 10-24 美术定稿：月铃兰读成机械爪或螺栓（Opus、Gemini）——
// 铃铛提亮到接近白，去掉花内部的描边、只留外轮廓，转一下让铃铛朝下垂，衬在深色背景上、不叠在头发上。所以不用组件的握持（物品/月铃兰.tsx 那枝不动）：
// - 立着、正面朝镜头（贴图的上是世界的上，铃铛挂在弯茎底下自然往下垂），握点放在她右手握持点上，手抬到哪花跟到哪（对视.tsx 摆手）；
// - 不进 engine 的描边（镂空的缝里会描出一圈圈暗线，就是读成爪子的那些线）：外轮廓自己画（铃兰轮廓.ts），镂空里透出后面；
// - 里面再套一层平涂：色调白、各面一样亮，画出来就是贴图原色（铃铛 #fff、#e7e7e7、#d8d8d8），挤出的侧面不压暗。
// 大小同 TLM 第三人称拿着的 item/generated：实体 0.65 × 显示 0.55 = 0.3575 格。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { 平涂 } from '@engine/三渲二/平涂.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 月铃兰层 } from '../../物品/月铃兰.tsx';
import { 外轮廓 } from './铃兰轮廓.ts';

/** 整张贴图多大（格） */
const 大 = 0.65 * 0.55;
/** 握点：茎上第 13 行那一格（物品空间，贴图中心为原点、上 = +Y），拳头握在这里，下面露一小截茎 */
const 握点: [number, number] = [8.5 / 16 - 0.5, 0.5 - 13.5 / 16];
/** 外轮廓：贴图一格细分 8 小格，往外扩 2 小格（封面帧上约 7 成片像素，和 engine 描边的 6 差不多粗），四周留 1 格 */
const 轮廓参数 = { 细分: 8, 宽: 2, 边: 1 };
const 各面一样亮 = { 顶: 1, 南北: 1, 东西: 1, 底: 1 };

const 轮廓贴图 = (色: string) => {
  const tex = 月铃兰层[0]!.tex;
  const { 宽: W, 高: H, 环 } = 外轮廓(tex.px, tex.w, tex.h, 轮廓参数.细分, 轮廓参数.宽, 轮廓参数.边);
  const n = parseInt(色.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const px = new Uint8Array(W * H * 4);
  // DataTexture 第一行在下（flipY 关着），环的第一行在上：倒过来填
  for (let Y = 0; Y < H; Y++)
    for (let X = 0; X < W; X++) {
      if (!环[Y * W + X]) continue;
      const i = ((H - 1 - Y) * W + X) * 4;
      px.set([...rgb, 255], i);
    }
  const t = new THREE.DataTexture(px, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};

/** 朝向：物品的 +Z（贴图正面）对着 眼，+Y 尽量朝世界的上（场景 Z 朝上）；再绕正面那根轴歪 歪 度（正 = 顶往她右手边歪） */
const 朝向 = (在: V3, 眼: V3, 歪: number) => {
  const z = new THREE.Vector3(眼[0] - 在[0], 眼[1] - 在[1], 眼[2] - 在[2]).normalize();
  const x = new THREE.Vector3(0, 0, 1).cross(z).normalize();
  const y = z.clone().cross(x);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (歪 * Math.PI) / 180));
};

/**
 * 她手里的月铃兰，场景坐标（Z 朝上）：握点在 在（她右手握持点），正面朝 眼。轮廓色 用这一镜调子的描边色，不给就不画外轮廓（全片不描边时）。
 * 放在她的 描边 组里也不描（里面自己关掉），外轮廓自己画。
 */
export const 亮月铃兰: React.FC<{ 在: V3; 眼: V3; 歪?: number; 轮廓色?: string }> = ({ 在, 眼, 歪 = 0, 轮廓色 }) => {
  const 轮廓 = useMemo(() => (轮廓色 ? 轮廓贴图(轮廓色) : null), [轮廓色]);
  const 轮廓大 = 大 * ((16 + 2 * 轮廓参数.边) / 16);
  const q = 朝向(在, 眼, 歪);
  return (
    <group position={在} quaternion={q}>
      <group scale={大} position={[-握点[0] * 大, -握点[1] * 大, 0]}>
        <描边 开={false}>
          <平涂 色调="#ffffff" 面明暗={各面一样亮}>
            <ItemSprite layers={月铃兰层} emissive={0} shadow={false} />
          </平涂>
          {/* 外轮廓贴在正面前面一点点（挤出厚 1/16，正面在 +1/32） */}
          {轮廓 && (
            <mesh position={[0, 0, 1 / 32 + 0.004]} scale={轮廓大 / 大}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial map={轮廓} alphaTest={0.5} toneMapped={false} />
            </mesh>
          )}
        </描边>
      </group>
    </group>
  );
};
