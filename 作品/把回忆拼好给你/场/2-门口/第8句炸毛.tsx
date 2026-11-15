// 第 8 句哈气的她：MagicalWineFoxEx 外面再叠两样作品这边新画的（不改 库/角色 的魔法酒狐：已有段的画面、指纹不动，尾巴那一处归 样片-第15句 那一路）。
// 主会话 10-24 美术定稿（五家看图评审：手机上看不出哈气）：
// 1. 哈气的脸：嘴至少两个贴图像素高的暗块。她的眼睛离下巴只有一格，原来的哈气嘴（1.5 格高、里面一格玫红）放不大：
//    眼睛眯成「> <」让出眼睛那块的下半，嘴往下巴底下再张开两格多（像下巴掉下来），里面填贴图里最暗的那格近黑（06040e），粉边、两颗小白牙。
// 2. 炸毛的尾巴：原尾巴藏掉，这里照模型原样再画一条（同一张贴图、同一条骨骼链、同一张姿势表），每块方块再叠两份绕自己中心转 ±炸开角 的，
//    剪影上多出一圈尖角（定稿：剪影带锯齿、炸开）；材质提亮一档（定稿：比裙子浅一档，和身子分开）。
// 坐标照模型文件（x 往她右手边是负，正面 −Z，Y 朝上），换算同 库/角色/魔法酒狐新动作组件.tsx 的叠加模型。
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { rad } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { type BedrockBone, type BedrockCube, type BedrockModel, BedrockModelView, type BonePose } from '@engine/model/基岩模型.tsx';
import { png } from '@engine/model/贴图.ts';
import { MAGICAL_WINE_FOX } from '@库/角色/魔法酒狐.tsx';
import { MagicalWineFoxEx, magicalWineFoxExBones, type MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { magicalWineFoxCellSize } from '@库/角色/魔法酒狐新动作.ts';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel;
const boneByName = new Map(MODEL.bones.map((b) => [b.name, b]));
const chain = (name: string) => {
  const out: string[] = [];
  for (let n: string | undefined = name; n; n = boneByName.get(n)?.parent) out.unshift(n);
  return out;
};
/** 只为变换对得上的祖先骨骼（不带方块） */
const emptyBones = (names: Iterable<string>): BedrockBone[] => [...new Set(names)].map((n) => ({ ...boneByName.get(n)!, cubes: undefined }));

// ---------- 炸毛的尾巴 ----------
const tailBones = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];
/** 叠的两份绕自己中心转几度；尺寸各轴乘几（x 是尾巴的宽、朝镜头，y、z 在侧面里：压扁一边、拉长一边，转过去以后两头的尖伸出剪影）。
 *  照原尺寸只转不拉长时尖角都藏在尾巴里面，剪影还是光滑的月牙（Agent 暂定，出静帧看过） */
const burstAngle = 35;
const burstScale = [0.9, 0.55, 1.35] as const;
/** 尾巴材质亮度（乘在贴图上）：定稿说尾巴和裙子一个颜色（Fable），提亮一档（Agent 暂定） */
export const tailBrighten = 1.18;

/** 只绕 x 转的方块：再叠两份，中心放在原方块转完以后的中心、绕它自己转 ±炸开角（换算照 基岩模型.tsx 的 cube 变换：渲染坐标绕 x 转 −θ） */
const burstCube = (c: BedrockCube): BedrockCube[] => {
  const r = c.rotation ?? [0, 0, 0];
  if (r[1] || r[2]) return [c];
  const p = c.pivot ?? [0, 0, 0];
  const center = c.origin.map((o, i) => o + c.size[i]! / 2);
  const φ = -rad(r[0]);
  const dy = center[1]! - p[1]!, dz = center[2]! - p[2]!;
  const turnCenter: V3 = [center[0]!, p[1]! + dy * Math.cos(φ) - dz * Math.sin(φ), p[2]! + dy * Math.sin(φ) + dz * Math.cos(φ)];
  const size = c.size.map((s, i) => s * burstScale[i]!) as V3;
  const shard = (s: number): BedrockCube => ({
    ...c,
    origin: turnCenter.map((x, i) => x - size[i]! / 2) as V3,
    size: size,
    pivot: turnCenter,
    rotation: [r[0] + s * burstAngle, 0, 0],
  });
  return [c, shard(-1), shard(1)];
};

const tailModel: BedrockModel = {
  ...MODEL,
  bones: [
    ...emptyBones(chain('Tail').slice(0, -1)),
    ...tailBones.map((n) => {
      const b = boneByName.get(n)!;
      return { ...b, cubes: b.cubes?.flatMap(burstCube) };
    }),
  ],
};

// ---------- 哈气的脸：眯成 > < 的眼睛、大张的嘴 ----------
// 网格同 魔法酒狐新动作组件.tsx 的哈气嘴：横线 y = 脸的下沿 + k/4 格，竖线在脸正中那一格的中线两边 ± i/4 格；脸的正面在 z = −1.66958，几层依次往前一点。
// 脸 7 格高（一格 = 魔法酒狐一格 0.9，换到方块上是 0.585 个贴图像素），眼睛占第 2、3 格，下巴到眼睛只有一格：
// 睁着眼的话嘴最多两格高（1.2 个贴图像素，成片 17 像素），缩到手机上 2.6 像素，看不出张嘴。
// 所以哈气时眼睛眯成「> <」（和头顶气泡「˃ʍ˂」一个样），眼睛那块的下半让给嘴：近黑的嘴里 15 行四分之一格（3.75 格 = 2.2 个贴图像素）高，
// 从下巴往下张开 9 行（像下巴掉下来），上沿挂两颗小白牙，外面一圈粉边（Agent 暂定）。第 8 句镜头（N = 16）里量过：头抬 18°、转 45° 以后
// 近黑那块成片 33 像素高（2.06 个贴图像素），缩到手机竖屏宽是 5 像素的一个黑点。
const centerX = 0.70064;
const faceBottom = 28.36648;
const quarterCell = magicalWineFoxCellSize / 4;
const frontFaceUv = (u: number, v: number, w = 1, h = 1): BedrockCube['uv'] => ({ north: { uv: [u, v], uv_size: [w, h] } });
// 纯色块只取这一格的中间（边上外插不到旁边的格子）
const solidUv = (u: number, v: number) => frontFaceUv(u + 0.25, v + 0.25, 0.5, 0.5);
const pink = solidUv(14, 124);
const nearBlack = solidUv(194, 3);
const white = solidUv(67, 0);
const plate = (x0: number, y0: number, x1: number, y1: number, z: number, uv: BedrockCube['uv']): BedrockCube => ({ origin: [x0, y0, z], size: [x1 - x0, y1 - y0, 0.05], uv });
const horizontalStrip = (k: number, halfWidth: number, z: number, uv: BedrockCube['uv']) => plate(centerX - halfWidth * quarterCell, faceBottom + k * quarterCell, centerX + halfWidth * quarterCell, faceBottom + (k + 1) * quarterCell, z, uv);
const pixelRect = (k0: number, k1: number, i0: number, i1: number, z: number, uv: BedrockCube['uv']) =>
  plate(centerX + i0 * quarterCell, faceBottom + k0 * quarterCell, centerX + i1 * quarterCell, faceBottom + k1 * quarterCell, z, uv);

/** 嘴：自下往上每行（k 从 嘴下 起）的半宽（四分之一格）。粉的外形；暗的里面收一圈、上下各少一行。
 *  上沿到 k 7（眼睛那块的下半），下沿在下巴往下 嘴下 行 */
const mouthBottom = -9;
const mouthShape = [3, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 5];
const mouthInside = [0, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, 0];
/** 眯起的眼睛：两个三行的「>」「<」，每行半格高、四分之三格宽，上下两行在外、中间一行往里错两格（四分之一格），斜笔连着；尖朝鼻梁。
 *  眼睛（i ±5.6～±13.6，k 4～12）里偏下放，眉毛（k 11 起）压不住。笔画再细，四分之三侧脸里缩成几个点（Agent 暂定，出静帧看过） */
const squintRows = [5, 7, 9] as const;
const squint: BedrockCube[] = [-1, 1].flatMap((sign) =>
  squintRows.map((k0, r) => {
    const [i0, i1] = r === 1 ? [7, 10] : [9, 12];
    return sign < 0 ? pixelRect(k0, k0 + 2, -i1, -i0, -1.69, nearBlack) : pixelRect(k0, k0 + 2, i0, i1, -1.69, nearBlack);
  }),
);
const bigMouthBone: BedrockBone = {
  name: 'mcanim第8句大嘴',
  parent: 'Mouth',
  pivot: boneByName.get('Mouth')!.pivot,
  cubes: [
    ...mouthShape.map((w, i) => horizontalStrip(mouthBottom + i, w, -1.68, pink)),
    ...mouthInside.flatMap((w, i) => (w ? [horizontalStrip(mouthBottom + i, w, -1.69, nearBlack)] : [])),
    pixelRect(4, 7, -4, -3, -1.7, white),
    pixelRect(4, 7, 3, 4, -1.7, white),
    ...squint,
  ],
};
const mouthModel: BedrockModel = { ...MODEL, bones: [...emptyBones(chain('Mouth')), bigMouthBone] };

const hiddenPose: BonePose = { scale: 0 };

/** 提亮：这条尾巴自己的模型自己一份材质（基岩模型.tsx 按模型缓存），乘上 尾巴提亮；平涂在 useFrame 里派生材质时连颜色一起复制 */
const Brighten: React.FC<{ brightness: number; children: React.ReactNode }> = ({ brightness, children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if ((o as THREE.Mesh).isMesh && m?.color) m.color.setScalar(brightness);
    });
  });
  return <group ref={ref}>{children}</group>;
};

export type HissingWineFoxProps = MagicalWineFoxExProps & {
  /** 换上哈气的脸（大张的嘴、眯成 > < 的眼睛；只在表情是 哈气 时）；默认开 */
  bigMouth?: boolean;
  /** 换上炸毛提亮的尾巴（只在姿势是 哈气 时）；默认开 */
  bristleTail?: boolean;
};

/** 用法同 MagicalWineFoxEx；姿势 哈气、表情 哈气 时换嘴、换尾巴 */
export const HissingWineFox: React.FC<HissingWineFoxProps> = ({ bigMouth = true, bristleTail = true, ...p }) => {
  const hissMouth = bigMouth && p.expression === '哈气';
  const puffTail = bristleTail && p.stancePose === '哈气';
  if (!hissMouth && !puffTail) return <MagicalWineFoxEx {...p} />;
  const boneTable = magicalWineFoxExBones(p);
  // 哈气的脸：原来的哈气嘴、两只眼睛（眼皮连同下面挂的虹膜、高光）都藏掉，换成 嘴模型 里的大嘴和眯眼
  const skeletonOverride = { ...p.skeleton, ...(hissMouth ? { mcanim哈气嘴: hiddenPose, RightEyelid: hiddenPose, LeftEyelid: hiddenPose } : {}), ...(puffTail ? { Tail: hiddenPose } : {}) };
  return (
    <>
      <MagicalWineFoxEx {...p} skeleton={skeletonOverride} />
      <group position={p.pose.loc as V3} rotation={[0, 0, rad(p.pose.yaw ?? 0)]}>
        <group rotation={[rad(p.pose.pitch), 0, 0]} scale={[1, 1, p.pose.squash]}>
          {puffTail && (
            <Brighten brightness={tailBrighten}>
              <BedrockModelView model={tailModel} scale={MAGICAL_WINE_FOX.scale} pose={boneTable} />
            </Brighten>
          )}
          {hissMouth && <BedrockModelView model={mouthModel} scale={MAGICAL_WINE_FOX.scale} pose={boneTable} />}
        </group>
      </group>
    </>
  );
};
