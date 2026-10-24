// 魔法酒狐的新动作组件：包在 魔法酒狐.tsx 的 MagicalWineFox 外面，不改它（已有段的画面和指纹不动）。
// 做法：照 魔法酒狐.tsx 的顺序自己拼出整张姿势表（隐藏表 → 坐姿表 → 法杖和环 → 帽子 → 新动作层 → 握持点 → 骨骼），整张当 骨骼 传进去；
// 新画的几块（认出你的眼睛多一排、哈气的嘴）和左手挂点放进「叠加模型」：同一张贴图、同一条骨骼链、同一张姿势表，所以和身体严丝合缝。
// 手里的东西照 TLM 1.5.3 的 GeckoLayerMaidHeld.renderArmWithItem（javap 反汇编）：挂在 Right/LeftHandLocator（RenderUtils.prepMatrixForLocator：
// 链上各骨骼整套变换，握持点只平移、转、缩，不移回 pivot），再平移 (0, −1/16, −0.1) 格、绕 X 转 −90°，
// 交给 ItemInHandRenderer 按 THIRD_PERSON_RIGHT/LEFT_HAND 套物品的显示变换。整个实体缩 0.65 时手里的东西一起缩。
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import type { V3 } from '../../engine/model/parts.tsx';
import { type BedrockBone, type BedrockCube, type BedrockModel, BedrockModelView, type BonePose } from '../../engine/model/基岩模型.tsx';
import { DISPLAY, ItemDisplay, type ItemTransform } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import type { FigurePose } from './骨架.tsx';
import { MAGICAL_WINE_FOX, MagicalWineFox, magicalWineFoxHatOffBones, magicalWineFoxHidden, magicalWineFoxSitBones, magicalWineFoxStaffBones } from './魔法酒狐.tsx';
import { magicalWineFoxExMotion, 夹头, 底姿势, 魔法酒狐一格, type 魔法酒狐全部表情, type 魔法酒狐新姿势 } from './魔法酒狐新动作.ts';
import raw from 'asset:模型/角色/魔法酒狐';
import skin from 'asset:贴图/角色/魔法酒狐/百花';

const MODEL = { ...(raw as unknown as object), texture: png(skin) } as unknown as BedrockModel;
const 骨 = new Map(MODEL.bones.map((b) => [b.name, b]));
const 链 = (name: string) => {
  const out: string[] = [];
  for (let n: string | undefined = name; n; n = 骨.get(n)?.parent) out.unshift(n);
  return out;
};

// ---------- 正向运动学：和 基岩模型.tsx 的 renderBone 同一套变换 ----------
const 度 = Math.PI / 180;
const 欧拉 = (r: number[]) => new THREE.Euler(-r[0]! * 度, -r[1]! * 度, r[2]! * 度, 'ZYX');
/** 骨骼 name 的坐标系在模型根坐标系里的矩阵（模型单位，Y 朝上、正面 −Z）；不算 name 自己的转角时 带自己 = false */
const 骨骼矩阵 = (表: Record<string, BonePose>, name: string, 带自己 = true) => {
  const m = new THREE.Matrix4();
  let 父 = [0, 0, 0];
  for (const n of 链(name)) {
    const b = 骨.get(n)!;
    const p = 表[n];
    const ap = p?.pos ?? [0, 0, 0];
    const ar = n === name && !带自己 ? [0, 0, 0] : (p?.rot ?? [0, 0, 0]);
    const rest = b.rotation ?? [0, 0, 0];
    const s = p?.scale ?? 1;
    const sv = typeof s === 'number' ? [s, s, s] : s;
    m.multiply(
      new THREE.Matrix4().compose(
        new THREE.Vector3(-(b.pivot[0] - 父[0]!) - ap[0]!, b.pivot[1] - 父[1]! + ap[1]!, b.pivot[2] - 父[2]! + ap[2]!),
        new THREE.Quaternion().setFromEuler(欧拉([rest[0] + ar[0]!, rest[1] + ar[1]!, rest[2] + ar[2]!])),
        new THREE.Vector3(sv[0], sv[1], sv[2]),
      ),
    );
    父 = b.pivot;
  }
  return m;
};
/** 模型根 → 场景：外层 group（脚底原点、yaw、pitch、squash）和 BedrockModelView 的根（转到 Z 朝上、缩 0.65/16） */
const 根矩阵 = (pose: FigurePose) =>
  new THREE.Matrix4()
    .makeTranslation(pose.loc[0]!, pose.loc[1]!, pose.loc[2]!)
    .multiply(new THREE.Matrix4().makeRotationZ(rad(pose.yaw ?? 0)))
    .multiply(new THREE.Matrix4().makeRotationX(rad(pose.pitch)))
    .multiply(new THREE.Matrix4().makeScale(1, 1, pose.squash))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeScale(MAGICAL_WINE_FOX.scale, MAGICAL_WINE_FOX.scale, MAGICAL_WINE_FOX.scale));

/** 姿势表摆好以后，某根骨骼 pivot 在场景里的位置（格） */
export const magicalWineFoxBoneAt = (pose: FigurePose, 表: Record<string, BonePose>, name: string): V3 => {
  const p = new THREE.Vector3().applyMatrix4(根矩阵(pose).multiply(骨骼矩阵(表, name)));
  return [p.x, p.y, p.z];
};

/** 头对准场景里的 点 要的 Head 转角（相对头的父骨骼，按这个姿势真实的身体倾斜算），左右夹在 ±75° 里 */
const 对准 = (pose: FigurePose, 表: Record<string, BonePose>, 点: V3): number[] => {
  const m = 根矩阵(pose).multiply(骨骼矩阵(表, 'Head', false));
  const 头 = new THREE.Vector3().applyMatrix4(m);
  const 方向 = new THREE.Vector3(...点).sub(头).transformDirection(m.clone().invert());
  const [俯仰, 左右] = 夹头([Math.asin(THREE.MathUtils.clamp(方向.y, -1, 1)) / 度, -Math.atan2(方向.x, -方向.z) / 度]);
  return [-俯仰, -左右, 0];
};

// ---------- 手里的东西 ----------
/**
 * 拿在手里的东西。物品：物品空间里的内容（中心在原点、1 = 一格、贴图正面朝 +Z、上 = +Y，同 engine/model/物品贴图.tsx 的 ItemSprite）。
 * 显示：物品模型 json 的第三人称显示变换，默认 item/generated 的 thirdperson_righthand（左手照原版镜像）。
 * 朝向：'原样' = 握持点照姿势表（游戏里没有专门动作时就是这样，坐姿的握持点 TLM 自己转过）；
 *   给数就把握持点转到让物品在她身体坐标系里立着：偏 = 物品正面从她正前方往她左边转几度，倾 = 绕正面法线逆时针歪几度（从正面看），
 *   仰 = 顶端往正面那边倒几度。不给 = 立着、正面朝她正前方。显示 带转角（比如 item/handheld）也照样立着；
 *   朝向 只管转角，显示 的平移是在转过的握持点里挪的，所以换了 显示 东西离手的位置会跟着变。
 */
export type 手持物 = { 物品: React.ReactNode; 显示?: ItemTransform; 朝向?: '原样' | { 偏?: number; 倾?: number; 仰?: number } };

/**
 * 握持点（Right/LeftHandLocator）要转多少，物品才按 朝向 立在她身体坐标系里。
 * 物品的朝向链（TlmHeld）= 手 · 握 · Rx(−90°) · 显示转，令它等于 目标，解出 握 = 手⁻¹ · 目标 · 显示转⁻¹ · Rx(+90°)。
 */
const 握持转角 = (表: Record<string, BonePose>, 左: boolean, 显示: ItemTransform, 朝向: { 偏?: number; 倾?: number; 仰?: number }): number[] => {
  const 手 = new THREE.Quaternion();
  骨骼矩阵(表, 左 ? 'LeftHand' : 'RightHand').decompose(new THREE.Vector3(), 手, new THREE.Vector3());
  const 目标 = new THREE.Quaternion().setFromEuler(new THREE.Euler((朝向.仰 ?? 0) * 度, (180 + (朝向.偏 ?? 0)) * 度, (朝向.倾 ?? 0) * 度, 'YZX'));
  const [rx, ry, rz] = 显示.rotation ?? [0, 0, 0];
  const 显示转 = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx! * 度, (左 ? -ry! : ry!) * 度, (左 ? -rz! : rz!) * 度, 'XYZ'));
  const 握 = 手.invert().multiply(目标).multiply(显示转.invert()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  const e = new THREE.Euler().setFromQuaternion(握, 'ZYX');
  return [-e.x / 度, -e.y / 度, e.z / 度]; // 握持点没有自带转角
};

/** TLM 的手持：挂在握持点坐标系里（模型单位）。外层乘 16 换成格，物品跟着实体一起缩 */
export const TlmHeld: React.FC<{ 物: 手持物; 左?: boolean }> = ({ 物, 左 }) => (
  <group scale={16}>
    <group position={[0, -0.0625, -0.1]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ItemDisplay t={物.显示 ?? DISPLAY.generated.thirdperson_righthand} left={左}>
          {物.物品}
        </ItemDisplay>
      </group>
    </group>
  </group>
);

// ---------- 叠加模型：新画的方块 ----------
// 认出你：眼皮抬一格以后，下面补一排——眼白取眼皮贴图的下排，虹膜取虹膜贴图的下格（淡紫），挂在各自骨骼下，眨眼时一起压扁。
// 只画正面（north）。虹膜那块是发光的（ysmGlow 开头，同游戏里的虹膜）。
// 坑：原来眼皮、虹膜方块的下沿，开抗锯齿时会取到贴图下一行（虹膜下面是 f0b9de 粉、左眼皮下面是 ab468a 玫红），
// 以前挨着皮肤看不出，补了一排以后成了横穿眼睛的一条细线。所以补的这排往上多盖 补盖（和被盖住的那行同色），放在原方块前面一点，
// UV 上下各往格子里收 1/4 格：补块自己的上下沿再怎么外插也取不出这一格。
const 格 = 魔法酒狐一格;
const 正面 = (u: number, v: number, w = 1, h = 1): BedrockCube['uv'] => ({ north: { uv: [u, v], uv_size: [w, h] } });
const 片 = (x0: number, y0: number, x1: number, y1: number, z: number, uv: BedrockCube['uv']): BedrockCube => ({ origin: [x0, y0, z], size: [x1 - x0, y1 - y0, 0.05], uv });
const 眼底 = 29.26648; // 眼皮方块的下沿
const 补盖 = 0.1;
const 补前 = 0.002;
const 补块 = (x0: number, 宽: number, z: number, u: number, v: number, w: number): BedrockCube =>
  ({ origin: [x0, 眼底 - 格, z - 补前], size: [宽, 格 + 补盖, 0.9], uv: 正面(u, v + 0.25, w, 0.5) });
const 眼补: BedrockBone[] = [
  { name: 'mcanim右眼补', parent: 'RightEyelid', pivot: 骨.get('RightEyelid')!.pivot, cubes: [补块(-2.35936, 1.8, -1.67858, 79, 87, 2)] },
  { name: 'mcanim左眼补', parent: 'LeftEyelid', pivot: 骨.get('LeftEyelid')!.pivot, cubes: [补块(1.96064, 1.8, -1.67858, 123, 2, 2)] },
  { name: 'ysmGlowmcanim右虹膜补', parent: 'ysmGlowRightEyelidBase', pivot: 骨.get('ysmGlowRightEyelidBase')!.pivot, cubes: [补块(-1.93186, 1.26, -1.71458, 127, 73, 1)] },
  { name: 'ysmGlowmcanim左虹膜补', parent: 'ysmGlowLeftEyelidBase', pivot: 骨.get('ysmGlowLeftEyelidBase')!.pivot, cubes: [补块(2.07314, 1.26, -1.71458, 127, 73, 1)] },
];

// 新画的嘴：照模型自己画嘴的办法（脸上没画嘴，嘴是贴在脸前面的几块平片，嘴里取嘴用的粉 f1b4b3），坐标是模型文件里的（x 往她右手边是负），
// 脸的正面在 z = −1.66958，几层依次往前一点点免得打架。
// 对格：模型自带的几种嘴比贴图一格还细、也不对格；新嘴的边一律落在脸的格线上再细分成四分之一格（一格 0.9 的 1/4）：
// 横线 y = 脸的下沿 28.36648 + k/4 格，竖线在中线 x = 0.70064（正好是脸正中那一格的中线）两边 ± i/4 格。
// 认出你：抿着的一小道（一格宽、1/4 格高，正好是脸正中那一格的宽），不哭也不笑（Agent 暂定：不画嘴脸太空，画了哪种现成的嘴都带情绪）。
// 哈气：比惊讶（jingya，约 2.3 格宽、1.3 格高）更大：下窄、中间最宽的大张嘴，1/4 格的粉边，里面填她衣服上的玫红 ab468a（贴图里现成的颜色），
// 上沿挂两颗小白牙（Agent 暂定）。下沿就是下巴（嘴张到底）；最宽那两行在眼睛下面，上两行收窄夹在两眼之间（两眼内侧相距 ±1.26）。
const 中 = 0.70064;
const 脸底 = 28.36648;
const 四分 = 魔法酒狐一格 / 4;
// 纯色块只取这一格的中间（同眼补的坑：边上外插不到旁边的格子）
const 纯色 = (u: number, v: number) => 正面(u + 0.25, v + 0.25, 0.5, 0.5);
const 粉 = 纯色(14, 124);
const 玫红 = 纯色(123, 3);
const 白 = 纯色(67, 0);
/** 第 k0～k1 条横线之间、中线两边各 半宽 个四分之一格 */
const 横条 = (k0: number, k1: number, 半宽: number, z: number, uv: BedrockCube['uv']) =>
  片(中 - 半宽 * 四分, 脸底 + k0 * 四分, 中 + 半宽 * 四分, 脸底 + k1 * 四分, z, uv);
/** 第 k0～k1 条横线之间、中线右边第 i0～i1 条竖线（负的在她右手边） */
const 方格 = (k0: number, k1: number, i0: number, i1: number, z: number, uv: BedrockCube['uv']) =>
  片(中 + i0 * 四分, 脸底 + k0 * 四分, 中 + i1 * 四分, 脸底 + k1 * 四分, z, uv);
const 认出你嘴: BedrockBone = {
  name: 'mcanim认出你嘴',
  parent: 'Mouth',
  pivot: 骨.get('Mouth')!.pivot,
  cubes: [横条(2, 3, 2, -1.68, 粉)],
};
// 哈气嘴自下往上每行的半宽（四分之一格）：粉的外形 3、4、6、6、5、5；玫红是外形往里收一圈 → 2、3、4、4（第 1～4 行）
const 哈气外形 = [3, 4, 6, 6, 5, 5];
const 哈气里面 = [0, 2, 3, 4, 4, 0];
const 哈气嘴: BedrockBone = {
  name: 'mcanim哈气嘴',
  parent: 'Mouth',
  pivot: 骨.get('Mouth')!.pivot,
  cubes: [
    ...哈气外形.map((w, k) => 横条(k, k + 1, w, -1.68, 粉)),
    ...哈气里面.flatMap((w, k) => (w ? [横条(k, k + 1, w, -1.69, 玫红)] : [])),
    方格(3, 5, -3, -2, -1.7, 白),
    方格(3, 5, 2, 3, -1.7, 白),
  ],
};
const 新骨骼 = [...眼补, 认出你嘴, 哈气嘴];
const 新骨骼名 = new Set(新骨骼.map((b) => b.name));

// 叠加模型 = 新骨骼 + 它们和左手握持点的祖先链（链上不带方块，只为变换对得上）。和 魔法酒狐.tsx 一样拆成受光、发光两份。
const 叠加 = (发光: boolean): BedrockModel => {
  const 要 = new Set<string>(发光 ? [] : 链('LeftHandLocator')); // 左手的东西挂在受光那份上
  for (const b of 新骨骼) if (b.name.startsWith('ysmGlow') === 发光) for (const n of 链(b.parent!)) 要.add(n);
  const bones: BedrockBone[] = [
    ...MODEL.bones.filter((b) => 要.has(b.name)).map((b) => ({ ...b, cubes: undefined })),
    ...新骨骼.filter((b) => b.name.startsWith('ysmGlow') === 发光),
  ];
  return { ...MODEL, bones };
};
const 叠加受光 = 叠加(false);
const 叠加发光 = 叠加(true);

// 发光那份：同 魔法酒狐.tsx 的 GlowLayer（它没导出），换成不受光、不过色调映射的贴图原色材质
const 满亮度材质 = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>();
const 满亮度: React.FC<{ 亮: boolean; children: React.ReactNode }> = ({ 亮, children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const lit = (mesh.userData.受光材质 ??= mesh.material) as THREE.MeshStandardMaterial;
      if (!亮 || !lit.map) return void (mesh.material = lit);
      let mat = 满亮度材质.get(lit.map);
      if (!mat) 满亮度材质.set(lit.map, (mat = new THREE.MeshBasicMaterial({ map: lit.map, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false })));
      mesh.material = mat;
    });
  });
  return <group ref={ref}>{children}</group>;
};

const HIDE: BonePose = { scale: 0 };

export type 魔法酒狐新动作Props = {
  pose: FigurePose;
  姿势?: 魔法酒狐新姿势;
  表情?: 魔法酒狐全部表情;
  /** 头相对身子的 [俯仰, 左右]（度，正 = 抬头、往左）；身子前倾的姿势已经把头抬平，[0, 0] 是平视正前方 */
  看?: [number, number];
  /** 头对准场景里这一点（格），按这个姿势真实的身体倾斜算；给了就不看 看 */
  看向?: V3;
  眨眼?: number | 'auto';
  秒?: number;
  右手?: 手持物;
  左手?: 手持物;
  /** 最后叠上的骨骼姿势，按骨骼整条替换 */
  骨骼?: Record<string, BonePose>;
  /** 手里东西的 朝向 按叠上 骨骼 以后的手臂算：骨骼 改了拿东西那条胳膊时给 true，东西才真照 朝向 立着。
   *  默认 false 照旧按叠 骨骼 之前的姿势算（坑：胳膊改了东西就跟着歪；出过片的段靠这个不变） */
  朝向按骨骼?: boolean;
  帽子?: boolean;
  背后法杖?: boolean;
  发光?: boolean;
};

/** 整张姿势表（组件内部用的同一张，外面要算挂点、对位时也能拿） */
export const magicalWineFoxExBones = (p: 魔法酒狐新动作Props): Record<string, BonePose> => {
  const { 姿势 = '站', 帽子 = true, 背后法杖 = true, 秒 } = p;
  const 底 = 底姿势(姿势);
  const 新 = magicalWineFoxExMotion({ 姿势, 表情: p.表情, 看: p.看, 眨眼: p.眨眼 ?? 'auto', 秒, 拿着: !!p.右手 });
  const 表: Record<string, BonePose> = {
    ...magicalWineFoxHidden,
    ...(底 === '坐' ? magicalWineFoxSitBones : {}),
    ...magicalWineFoxStaffBones(秒 ?? 0, 底),
    ...(帽子 ? {} : magicalWineFoxHatOffBones(秒 ?? 0)),
    ...(背后法杖 ? {} : { mofazhang2: HIDE }),
  };
  for (const [k, v] of Object.entries(新.骨骼)) 表[k] = { ...表[k], ...v }; // 按字段合并：坐姿表的裙摆缩放、位置留着
  if (p.看向) 表.Head = { ...表.Head, rot: 对准(p.pose, 表, p.看向) };
  for (const [手, 左] of [[p.右手, false], [p.左手, true]] as const) {
    if (!手 || 手.朝向 === '原样') continue;
    const 显示 = 手.显示 ?? DISPLAY.generated.thirdperson_righthand;
    表[左 ? 'LeftHandLocator' : 'RightHandLocator'] = { rot: 握持转角(p.朝向按骨骼 ? { ...表, ...p.骨骼 } : 表, 左, 显示, 手.朝向 ?? {}) };
  }
  for (const n of 新骨骼名) 表[n] = HIDE;
  if (新.叠加.眼睛加一排) for (const n of ['mcanim右眼补', 'mcanim左眼补', 'ysmGlowmcanim右虹膜补', 'ysmGlowmcanim左虹膜补']) 表[n] = {};
  if (新.叠加.认出你嘴) 表.mcanim认出你嘴 = {};
  if (新.叠加.哈气嘴) 表.mcanim哈气嘴 = {};
  return { ...表, ...p.骨骼 };
};

/**
 * 魔法酒狐（新动作版）。坐标同 魔法酒狐.tsx：原点在脚底、Z 朝上、朝向 +Y、右手在 +X；pose 只用 loc、yaw、pitch、squash。
 * 姿势、表情见 魔法酒狐新动作.ts；旧的表情（微笑、大笑、惊讶、难过、无）照旧能用。
 */
export const MagicalWineFoxEx: React.FC<魔法酒狐新动作Props> = (p) => {
  const 表 = magicalWineFoxExBones(p);
  const { 姿势 = '站', 帽子 = true, 背后法杖 = true, 发光 = true } = p;
  return (
    <>
      <MagicalWineFox
        pose={p.pose}
        姿势={底姿势(姿势)}
        骨骼={表}
        秒={p.秒}
        眨眼={p.眨眼}
        帽子={帽子}
        背后法杖={背后法杖}
        发光={发光}
        右手={p.右手 ? <TlmHeld 物={p.右手} /> : undefined}
      />
      <group position={p.pose.loc as V3} rotation={[0, 0, rad(p.pose.yaw ?? 0)]}>
        <group rotation={[rad(p.pose.pitch), 0, 0]} scale={[1, 1, p.pose.squash]}>
          <BedrockModelView
            model={叠加受光}
            scale={MAGICAL_WINE_FOX.scale}
            pose={表}
            attach={p.左手 ? { LeftHandLocator: <TlmHeld 物={p.左手} 左 /> } : undefined}
          />
          <满亮度 亮={发光}>
            <BedrockModelView model={叠加发光} scale={MAGICAL_WINE_FOX.scale} pose={表} />
          </满亮度>
        </group>
      </group>
    </>
  );
};
