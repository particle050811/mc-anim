// 第 8 句哈气的她：MagicalWineFoxEx 外面再叠两样作品这边新画的（不改 库/角色 的魔法酒狐：已有段的画面、指纹不动，尾巴那一处归 样片-第15句 那一路）。
// 主会话 10-24 美术定稿（五家看图评审：手机上看不出哈气）：
// 1. 大张的嘴：嘴至少两个贴图像素高的暗块。她的眼睛离下巴只有一格，原来的哈气嘴（1.5 格高、里面一格玫红）放不大，
//    新嘴往下巴底下多张开一格（像下巴掉下来），里面填贴图里最暗的那格近黑（06040e），粉边、两颗小白牙照原来的。
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
import { MagicalWineFoxEx, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 魔法酒狐一格 } from '@库/角色/魔法酒狐新动作.ts';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel;
const 骨 = new Map(MODEL.bones.map((b) => [b.name, b]));
const 链 = (name: string) => {
  const out: string[] = [];
  for (let n: string | undefined = name; n; n = 骨.get(n)?.parent) out.unshift(n);
  return out;
};
/** 只为变换对得上的祖先骨骼（不带方块） */
const 空骨 = (names: Iterable<string>): BedrockBone[] => [...new Set(names)].map((n) => ({ ...骨.get(n)!, cubes: undefined }));

// ---------- 炸毛的尾巴 ----------
const 尾巴骨 = ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'];
/** 叠的两份绕自己中心转几度；尺寸各轴乘几（x 是尾巴的宽、朝镜头，y、z 在侧面里：压扁一边、拉长一边，转过去以后两头的尖伸出剪影）。
 *  照原尺寸只转不拉长时尖角都藏在尾巴里面，剪影还是光滑的月牙（Agent 暂定，出静帧看过） */
const 炸开角 = 35;
const 炸开尺 = [0.9, 0.55, 1.35] as const;
/** 尾巴材质亮度（乘在贴图上）：定稿说尾巴和裙子一个颜色（Fable），提亮一档（Agent 暂定） */
export const 尾巴提亮 = 1.18;

/** 只绕 x 转的方块：再叠两份，中心放在原方块转完以后的中心、绕它自己转 ±炸开角（换算照 基岩模型.tsx 的 cube 变换：渲染坐标绕 x 转 −θ） */
const 炸开 = (c: BedrockCube): BedrockCube[] => {
  const r = c.rotation ?? [0, 0, 0];
  if (r[1] || r[2]) return [c];
  const p = c.pivot ?? [0, 0, 0];
  const 中 = c.origin.map((o, i) => o + c.size[i]! / 2);
  const φ = -rad(r[0]);
  const dy = 中[1]! - p[1]!, dz = 中[2]! - p[2]!;
  const 转中: V3 = [中[0]!, p[1]! + dy * Math.cos(φ) - dz * Math.sin(φ), p[2]! + dy * Math.sin(φ) + dz * Math.cos(φ)];
  const 尺 = c.size.map((s, i) => s * 炸开尺[i]!) as V3;
  const 份 = (s: number): BedrockCube => ({
    ...c,
    origin: 转中.map((x, i) => x - 尺[i]! / 2) as V3,
    size: 尺,
    pivot: 转中,
    rotation: [r[0] + s * 炸开角, 0, 0],
  });
  return [c, 份(-1), 份(1)];
};

const 尾巴模型: BedrockModel = {
  ...MODEL,
  bones: [
    ...空骨(链('Tail').slice(0, -1)),
    ...尾巴骨.map((n) => {
      const b = 骨.get(n)!;
      return { ...b, cubes: b.cubes?.flatMap(炸开) };
    }),
  ],
};

// ---------- 大张的嘴 ----------
// 网格同 魔法酒狐新动作组件.tsx 的哈气嘴：横线 y = 脸的下沿 + k/4 格，竖线在脸正中那一格的中线两边 ± i/4 格；脸的正面在 z = −1.66958，几层依次往前一点
const 中 = 0.70064;
const 脸底 = 28.36648;
const 四分 = 魔法酒狐一格 / 4;
const 正面 = (u: number, v: number, w = 1, h = 1): BedrockCube['uv'] => ({ north: { uv: [u, v], uv_size: [w, h] } });
// 纯色块只取这一格的中间（边上外插不到旁边的格子）
const 纯色 = (u: number, v: number) => 正面(u + 0.25, v + 0.25, 0.5, 0.5);
const 粉 = 纯色(14, 124);
const 近黑 = 纯色(194, 3);
const 白 = 纯色(67, 0);
const 片 = (x0: number, y0: number, x1: number, y1: number, z: number, uv: BedrockCube['uv']): BedrockCube => ({ origin: [x0, y0, z], size: [x1 - x0, y1 - y0, 0.05], uv });
const 横条 = (k: number, 半宽: number, z: number, uv: BedrockCube['uv']) => 片(中 - 半宽 * 四分, 脸底 + k * 四分, 中 + 半宽 * 四分, 脸底 + (k + 1) * 四分, z, uv);
const 方格 = (k0: number, k1: number, i0: number, i1: number, z: number, uv: BedrockCube['uv']) =>
  片(中 + i0 * 四分, 脸底 + k0 * 四分, 中 + i1 * 四分, 脸底 + k1 * 四分, z, uv);
/** 自下往上每行（k 从 −4 起，下巴底下一格开始）的半宽（四分之一格）：粉的外形；暗的里面收一圈，k −3～4 八行 = 两格高。
 *  上两行夹在两眼之间（两眼内侧相距 ±1.26，约 ±5.6 个四分之一格） */
const 嘴下 = -4;
const 嘴外形 = [3, 5, 6, 6, 6, 6, 6, 5, 5, 4];
const 嘴里面 = [0, 3, 5, 5, 5, 5, 5, 4, 4, 0];
const 大嘴骨: BedrockBone = {
  name: 'mcanim第8句大嘴',
  parent: 'Mouth',
  pivot: 骨.get('Mouth')!.pivot,
  cubes: [
    ...嘴外形.map((w, i) => 横条(嘴下 + i, w, -1.68, 粉)),
    ...嘴里面.flatMap((w, i) => (w ? [横条(嘴下 + i, w, -1.69, 近黑)] : [])),
    方格(3, 5, -3, -2, -1.7, 白),
    方格(3, 5, 2, 3, -1.7, 白),
  ],
};
const 嘴模型: BedrockModel = { ...MODEL, bones: [...空骨(链('Mouth')), 大嘴骨] };

const 藏: BonePose = { scale: 0 };

/** 提亮：这条尾巴自己的模型自己一份材质（基岩模型.tsx 按模型缓存），乘上 尾巴提亮；平涂在 useFrame 里派生材质时连颜色一起复制 */
const 提亮: React.FC<{ 倍: number; children: React.ReactNode }> = ({ 倍, children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if ((o as THREE.Mesh).isMesh && m?.color) m.color.setScalar(倍);
    });
  });
  return <group ref={ref}>{children}</group>;
};

export type 哈气酒狐属性 = 魔法酒狐新动作Props & {
  /** 换上大张的嘴（只在表情是 哈气 时）；默认开 */
  大嘴?: boolean;
  /** 换上炸毛提亮的尾巴（只在姿势是 哈气 时）；默认开 */
  炸毛尾?: boolean;
};

/** 用法同 MagicalWineFoxEx；姿势 哈气、表情 哈气 时换嘴、换尾巴 */
export const 哈气酒狐: React.FC<哈气酒狐属性> = ({ 大嘴 = true, 炸毛尾 = true, ...p }) => {
  const 嘴 = 大嘴 && p.表情 === '哈气';
  const 尾 = 炸毛尾 && p.姿势 === '哈气';
  if (!嘴 && !尾) return <MagicalWineFoxEx {...p} />;
  const 表 = magicalWineFoxExBones(p);
  const 改 = { ...p.骨骼, ...(嘴 ? { mcanim哈气嘴: 藏 } : {}), ...(尾 ? { Tail: 藏 } : {}) };
  return (
    <>
      <MagicalWineFoxEx {...p} 骨骼={改} />
      <group position={p.pose.loc as V3} rotation={[0, 0, rad(p.pose.yaw ?? 0)]}>
        <group rotation={[rad(p.pose.pitch), 0, 0]} scale={[1, 1, p.pose.squash]}>
          {尾 && (
            <提亮 倍={尾巴提亮}>
              <BedrockModelView model={尾巴模型} scale={MAGICAL_WINE_FOX.scale} pose={表} />
            </提亮>
          )}
          {嘴 && <BedrockModelView model={嘴模型} scale={MAGICAL_WINE_FOX.scale} pose={表} />}
        </group>
      </group>
    </>
  );
};
