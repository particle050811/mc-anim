// 蛋糕方块：原版放在地上那块没吃过的整蛋糕（block/cake.json，一个 14×8×14 像素的方盒），按「手里拿普通方块」的拿法拿在手里。
// 原版游戏里手里的蛋糕其实是平面图（item/cake.json 的 parent 是 item/generated，见 蛋糕.tsx）；用户 11-02 要正片两次喂蛋糕换成立体的
// （「我记得原版就有蛋糕方块的建模 用贴图总感觉有点简陋」），所以照草方块这类方块物品拿：显示变换取 block/block.json（cake.json 自己没有 parent、没有 display）。
// 几何取模型 json 的面片（取材配方「蛋糕方块」），贴图一张张照搬，材质包覆盖层换得了（uv 是 0～1，高清贴图照样对得上）；一起导出的图集不用。
// 物品坐标同 物品贴图.tsx：中心在原点、Y 朝上、+Z 朝南，方块边长 1；外面套 HeldItem / FirstPersonHand 加显示变换。
// 受光材质同 场/2-第一晚/泥土块.tsx（Lambert、最近邻取样），三渲二平涂按朝向乘面明暗、乘色调。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BlockModelData } from '../../engine/model/方块模型.tsx';
import type { ItemTransform } from '../../engine/model/物品贴图.tsx';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import { png, type Png } from '../../engine/model/贴图.ts';
import 模型数据 from 'asset:模型/物品/蛋糕方块';
import 底图 from 'asset:贴图/物品/蛋糕方块/cake_bottom';
import 侧图 from 'asset:贴图/物品/蛋糕方块/cake_side';
import 顶图 from 'asset:贴图/物品/蛋糕方块/cake_top';

/** client 1.20.1 block/block.json 的 display（草方块这类方块物品都继承它）。物品贴图.tsx 的 DISPLAY 不加：改那个模块，import 它的段全部过期。
 *  第一人称原样用正好转 45°，侧面在平涂里会出竖条噪点，要偏一点（见 作品/把回忆拼好给你/场/2-隐世之境/重逢.tsx 的 蛋糕拿法） */
export const 方块显示 = {
  thirdperson_righthand: { rotation: [75, 45, 0], translation: [0, 2.5, 0], scale: [0.375, 0.375, 0.375] },
  firstperson_righthand: { rotation: [0, 45, 0], translation: [0, 0, 0], scale: [0.4, 0.4, 0.4] },
} satisfies Record<string, ItemTransform>;

const 数据 = 模型数据 as unknown as BlockModelData;
/** 按贴图名（模型 json 里 textures 的 key 最后一段） */
const 贴图: Readonly<Record<string, Png>> = { cake_bottom: png(底图), cake_side: png(侧图), cake_top: png(顶图) };

/** 面片（方块模型.tsx 的格式：方块占 X 0..1、Y −1..0、Z 0..1，Z 朝上、北 = +Y）换到物品坐标：减去中心，(X, Y, Z) → (X, Z, −Y)。按贴图分组 */
const 建几何 = () => {
  const 组 = new Map<number, { pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
  for (const q of 数据.parts['蛋糕']!.quads) {
    if (!组.has(q[0]!)) 组.set(q[0]!, { pos: [], nor: [], uv: [], idx: [] });
    const b = 组.get(q[0]!)!;
    const base = b.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const [x, y, z] = [q[1 + k * 3]! - 0.5, q[2 + k * 3]! + 0.5, q[3 + k * 3]! - 0.5];
      b.pos.push(x, z, -y);
      b.uv.push(q[13 + k * 2]!, q[14 + k * 2]!);
      b.nor.push(q[21]!, q[23]!, -q[22]!);
    }
    // 四个角从外面看是顺时针（左上、右上、右下、左下），three 的正面要逆时针，同 方块模型.tsx
    b.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return [...组].map(([ti, b]) => {
    const 名 = 数据.textures[ti]!.key.split('/').at(-1)!;
    const tex = 贴图[名];
    if (!tex) throw new Error(`蛋糕方块的模型用到贴图「${名}」，没有导出：见取材配方 蛋糕方块`);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.idx);
    return { g, tex };
  });
};

/** 整块蛋糕，物品坐标 */
export const 蛋糕方块: React.FC = () => {
  const 块 = useMemo(建几何, []);
  return (
    <group>
      {块.map(({ g, tex }, i) => (
        <mesh key={i} geometry={g}>
          <meshLambertMaterial map={entityTexture(tex)} alphaTest={0.5} />
        </mesh>
      ))}
    </group>
  );
};
