// 从魔法酒狐模型（车万女仆 1.5.3 winefox_magical，资产 模型/角色/魔法酒狐）里单拿出来用的魔法阵：
//   模型里平时藏着的 ysmGlowdamofazhen3（四瓣大阵，转 45°）、它四个方向的小环（ysmGlowmofazhen15～18）、中间的 ysmGlowmofazhen19，
//   在模型里是立在她身后、前后错开的几片；这里照它们的贴图、尺寸、相对位置平铺成一层，放在脚下转（演绎：游戏里施法时没有这个阵）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import type { BedrockModel } from '@engine/model/基岩模型.tsx';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import { png } from '@engine/model/贴图.ts';
import { MAGICAL_WINE_FOX } from '@库/角色/魔法酒狐.tsx';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const 度 = Math.PI / 180;
const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel;

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
