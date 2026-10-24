// 从魔法酒狐模型（车万女仆 1.5.3 winefox_magical，资产 模型/角色/魔法酒狐）里单拿出来用的两样：拿在手里的魔女帽、铺在脚下的魔法阵。
// 魔女帽：模型里 witchcap 那一枝（帽檐、帽身、帽尖、蝴蝶结、发光的帽圈和十字），连同它往上的祖先骨骼（不带方块，变换才对），同一张贴图；
//   ysmGlow 开头的骨骼照游戏满亮度（同 库/角色/魔法酒狐.tsx 的拆法）。她自己那份用 帽子={false} 藏帽子、露耳朵。
//   摆法：先当作站在原点、朝北的她戴着它，再整体挪到 位（帽檐底面中心 = witchcap 的 pivot）、转 朝向、歪 歪。
// 魔法阵：模型里平时藏着的 ysmGlowdamofazhen3（四瓣大阵，转 45°）、它四个方向的小环（ysmGlowmofazhen15～18）、中间的 ysmGlowmofazhen19，
//   在模型里是立在她身后、前后错开的几片；这里照它们的贴图、尺寸、相对位置平铺成一层，放在脚下转（演绎：游戏里施法时没有这个阵）。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { type BedrockBone, type BedrockModel, BedrockModelView, type BonePose } from '@engine/model/基岩模型.tsx';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import { png } from '@engine/model/贴图.ts';
import { MAGICAL_WINE_FOX } from '@库/角色/魔法酒狐.tsx';
import { magicalWineFoxBoneAt } from '@库/角色/魔法酒狐新动作组件.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const 度 = Math.PI / 180;
const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel;
const 父 = new Map(MODEL.bones.map((b) => [b.name, b.parent]));
const 发光骨 = (name: string) => name.startsWith('ysmGlow');

/** 根骨骼 根 那一枝（含自己）的骨骼名 */
const 一枝 = (根: string) => {
  const out = new Set<string>();
  for (const b of MODEL.bones) for (let n: string | undefined = b.name; n; n = 父.get(n)) if (n === 根) out.add(b.name);
  return out;
};

/** 只留 枝 里的方块（发光 = 只留 ysmGlow 骨骼的、否则只留不发光的），祖先骨骼留着、不带方块 */
const 拆 = (枝: Set<string>, 发光: boolean): BedrockModel => {
  const 留 = new Set<string>();
  for (const n of 枝) for (let m: string | undefined = n; m && !留.has(m); m = 父.get(m)) 留.add(m);
  const bones: BedrockBone[] = MODEL.bones
    .filter((b) => 留.has(b.name))
    .map((b) => (枝.has(b.name) && 发光骨(b.name) === 发光 ? b : { ...b, cubes: undefined }));
  return { ...MODEL, bones };
};

const 帽枝 = 一枝('witchcap');
const 帽身 = 拆(帽枝, false);
const 帽光 = 拆(帽枝, true);
/** witchcap3 在游戏里一直藏着（pre_parallel0） */
const 帽姿势: Record<string, BonePose> = { witchcap3: { scale: 0 } };
/** 站在原点、朝北的她戴着帽子时，帽檐底面中心（witchcap 的 pivot）在哪 */
const 帽檐原位 = magicalWineFoxBoneAt(standPose([0, 0, 0]), {}, 'witchcap');

// 发光那份换成满亮度材质（同 魔法酒狐.tsx 的 GlowLayer：每次提交都换，基岩模型.tsx 新挂的 mesh 拿的是受光材质）
const 满亮材质 = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>();
const 满亮: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const lit = (mesh.userData.受光材质 ??= mesh.material) as THREE.MeshStandardMaterial;
      if (!lit.map) return;
      let m = 满亮材质.get(lit.map);
      if (!m) 满亮材质.set(lit.map, (m = new THREE.MeshBasicMaterial({ map: lit.map, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false })));
      mesh.material = m;
    });
  });
  return <group ref={ref}>{children}</group>;
};

/** 帽子的摆法：位 = 帽檐底面中心（格）；朝向 = 帽子正面朝哪（同 FigurePose 的 yaw，180 = 朝南、朝剖面镜头）；
 *  歪 = 绕南北轴歪几度（正 = 东边低）；仰 = 帽子自己往后仰几度（正 = 前沿抬起，同头的俯仰） */
export type 帽摆 = { 位: V3; 朝向: number; 歪?: number; 仰?: number };

/** 帽子自己坐标里的一点（帽子朝北时 x 东、y 北、z 上，格，从帽檐底面中心量）在场景里的位置：位 + 歪 · 朝向 · 仰 · 点（同 魔女帽 的嵌套） */
export const 帽上点 = ({ 位, 朝向, 歪 = 0, 仰 = 0 }: 帽摆, 点: readonly number[]): V3 => {
  const v = new THREE.Vector3(点[0], 点[1], 点[2])
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), 仰 * 度)
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), 朝向 * 度)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), 歪 * 度);
  return [位[0] + v.x, 位[1] + v.y, 位[2] + v.z];
};

/** 拿在手里的魔女帽（Z 朝上的场景内容） */
export const 魔女帽: React.FC<帽摆> = ({ 位, 朝向, 歪 = 0, 仰 = 0 }) => (
  <group position={位 as V3} rotation={[0, 歪 * 度, 0]}>
    <group rotation={[0, 0, 朝向 * 度]}>
      <group rotation={[仰 * 度, 0, 0]}>
        <group position={[-帽檐原位[0], -帽檐原位[1], -帽檐原位[2]]}>
          <BedrockModelView model={帽身} scale={MAGICAL_WINE_FOX.scale} pose={帽姿势} />
          <满亮>
            <BedrockModelView model={帽光} scale={MAGICAL_WINE_FOX.scale} pose={帽姿势} />
          </满亮>
        </group>
      </group>
    </group>
  </group>
);

// ---------- 魔法阵 ----------
/** 一片：贴图里的一块（u, v, 宽, 高，贴图像素）画成 边 模型像素见方，中心在 [x, y]（模型像素，阵心为原点），转 转 度，层 = 往上垫几层（防闪） */
type 阵片 = { u: number; v: number; w: number; h: number; 边: number; x: number; y: number; 转: number; 层: number };
// 尺寸、位置照模型（导出的 bones）：大阵 60.5 见方转 −45°；四个小环 22.3 见方，离阵心 28.4；小环里的方框 13.4 转 45°；中间环 29.16、方框 17.5 转 45°
const 阵片们: readonly 阵片[] = [
  { u: 191, v: 191, w: 65, h: 65, 边: 60.5, x: 0, y: 0, 转: -45, 层: 0 },
  ...([[0, 28.4], [28.4, 0], [0, -28.4], [-28.4, 0]] as const).flatMap(([x, y]) => [
    { u: 161, v: 50, w: 45, h: 45, 边: 22.3, x, y, 转: 0, 层: 1 },
    { u: 163, v: 97, w: 27, h: 27, 边: 13.4, x, y, 转: 45, 层: 2 },
  ]),
  { u: 161, v: 50, w: 45, h: 45, 边: 29.16, x: 0, y: 0, 转: 0, 层: 1 },
  { u: 163, v: 97, w: 27, h: 27, 边: 17.5, x: 0, y: 0, 转: 45, 层: 2 },
];
/** 魔法阵的半径（格）：小环外沿离阵心多远 */
export const 魔法阵半径 = (28.4 + 22.3 / 2) * MAGICAL_WINE_FOX.scale;

const 阵材质 = () => new THREE.MeshBasicMaterial({ map: entityTexture(MODEL.texture), alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false, fog: false });

/** 脚下的魔法阵：心 = 阵心（格，地面上）；转 = 整个阵转了几度；大小 = 0～1 展开 */
export const 魔法阵: React.FC<{ 心: V3; 转: number; 大小: number }> = ({ 心, 转, 大小 }) => {
  const mat = useMemo(阵材质, []);
  const 片们 = useMemo(
    () =>
      阵片们.map((p) => {
        const g = new THREE.PlaneGeometry(p.边, p.边);
        const tw = MODEL.texW, th = MODEL.texH;
        // PlaneGeometry 的 uv：左下 (0,0)、右上 (1,1)；贴图第一行是 v = 0（DataTexture 不翻）
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) {
          const a = uv.getX(k), b = uv.getY(k);
          uv.setXY(k, (p.u + a * p.w) / tw, (p.v + (1 - b) * p.h) / th);
        }
        return { p, g };
      }),
    [],
  );
  if (大小 <= 0) return null;
  const s = MAGICAL_WINE_FOX.scale * 大小;
  return (
    <group position={心 as V3} rotation={[0, 0, 转 * 度]} scale={[s, s, s]}>
      {片们.map(({ p, g }, k) => (
        <mesh key={k} geometry={g} material={mat} position={[p.x, p.y, 0.05 + p.层 * 0.08]} rotation={[0, 0, p.转 * 度]} renderOrder={5} />
      ))}
    </group>
  );
};
