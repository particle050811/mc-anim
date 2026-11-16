// 袍摆让腿（用户 11-11「跳舞这里衣服穿模了」）：娘化亚波伦的长袍下摆是挂在 DownBody 下的一圈硬片（Skirt → 前 FrontSkirt、后 BackSkirt、
// 左右 LeftSkirt/RightSkirt，每片三节，到脚踝上面），不跟腿走；手摆的腿一叉开、一提膝，腿就从侧片、前片里戳出来。
// 包里的 walk、run 是把 FrontSkirt、BackSkirt 绕腰上的轴往前后甩（rot x 跟着腿摆），侧片两份副本挂在前后片下面跟着张开（RightSkirt2、RightSkirt3）；
// 这里照这个路子，按这一刻腿的方盒算出每组最少要甩多少：
//   侧：LeftSkirt 三份副本、前后两角（bone30、bone131）绕 Z 往外张；张开后前后正中那片（bone27、bone128）横向放宽、平移，盖住和两角之间的缝；
//   前、后：FrontSkirt、BackSkirt 绕 X 往前、往后甩（同 walk）。
// 判据：腿方盒表面的采样点落在某片的范围里（沿片面的两个方向），就不许越过这片的外表面（留 外留 像素）。最少角用二分找，结果只看姿势表、和取帧顺序无关。
// 骨骼的算式同 engine/model/基岩正解.ts（测试里对过）；这里自己算是为了一帧里反复换一组的转角时只重算这一组下面的骨骼。
import * as THREE from 'three';
import type { BedrockBone, BedrockCube, BonePose } from '@engine/model/基岩模型.tsx';

type BoneTable = Readonly<Record<string, BonePose>>;
type BoneModel = { bones: readonly BedrockBone[] };

const radPerDeg = Math.PI / 180;
/** 腿上的点离片的外表面至少这么远（像素）才算盖住 */
const outerMargin = 0.15;
/** 正中片和两角在下摆处至少叠这么宽（像素）；站着时叠得比这窄的，照站着的 */
const overlapCap = 1;
/** 一组最多甩多少度（再多也不找了，按最大的算） */
const maxAngle = 75;

/** 一根骨骼相对父骨骼的矩阵（同 基岩正解.ts 的 骨骼矩阵 里每一节） */
const localMatrix = (bone: BedrockBone, parentPivot: readonly number[], p: BonePose | undefined): THREE.Matrix4 => {
  const s = p?.scale ?? 1;
  const sv = typeof s === 'number' ? [s, s, s] : s;
  const rest = bone.rotation ?? [0, 0, 0];
  const ar = p?.rot ?? [0, 0, 0];
  const ap = p?.pos ?? [0, 0, 0];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(-(bone.pivot[0] - parentPivot[0]!) - ap[0]!, bone.pivot[1] - parentPivot[1]! + ap[1]!, bone.pivot[2] - parentPivot[2]! + ap[2]!),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-(rest[0] + ar[0]!) * radPerDeg, -(rest[1] + ar[1]!) * radPerDeg, (rest[2] + ar[2]!) * radPerDeg, 'ZYX')),
    new THREE.Vector3(sv[0], sv[1], sv[2]),
  );
};

/** 方盒在自己骨骼坐标里的范围 [min, max]（原点 = pivot，X 取负，同 描边面），计 inflate */
const boxRange = (bone: BedrockBone, c: BedrockCube): [THREE.Vector3, THREE.Vector3] => {
  const f = c.inflate ?? 0;
  const [o, s] = [c.origin, c.size];
  return [
    new THREE.Vector3(-(o[0] + s[0]) + bone.pivot[0] - f, o[1] - bone.pivot[1] - f, o[2] - bone.pivot[2] - f),
    new THREE.Vector3(-o[0] + bone.pivot[0] + f, o[1] + s[1] - bone.pivot[1] + f, o[2] + s[2] - bone.pivot[2] + f),
  ];
};

type SkirtPiece = {
  bone: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** 片最薄的那个轴（0、1、2）、朝外是正还是负 */
  axis: 0 | 1 | 2;
  outerSign: 1 | -1;
  /** 腿上的点最多能越过外表面多少（像素）：一般是 −外留；站着时就已经越过一点的片（左大腿根比左侧片宽约 0.1 像素），照站着时的放宽，站姿不改 */
  容: number;
};
type ClothGroup = { name: string; hinges: string[]; 片们: SkirtPiece[] };
type LegBase = {
  表: ReadonlyMap<string, BedrockBone>;
  /** 祖先 坐标 ← 名 的骨骼坐标（名 坐标里的点乘上它得到 祖先 坐标） */
  相对: (ancestor: string, boneName: string, t: BoneTable) => THREE.Matrix4;
  legPoints: readonly (readonly { bone: string; points: THREE.Vector3[] }[])[];
};

/** 这一刻腿在 Skirt 坐标里的采样点（腿不受袍摆影响，一帧算一次） */
const posedLegPoints = (prep: LegBase, t: BoneTable): THREE.Vector3[] => {
  const worldPoints: THREE.Vector3[] = [];
  // Skirt 和腿的共同祖先是 DownBody：都换到 DownBody 坐标再换进 Skirt
  const skirt = prep.相对('DownBody', 'Skirt', t).invert();
  for (const legPoints of prep.legPoints)
    for (const { bone: boneName, points: points } of legPoints) {
      const m = skirt.clone().multiply(prep.相对('DownBody', boneName, t));
      for (const p of points) worldPoints.push(p.clone().applyMatrix4(m));
    }
  return worldPoints;
};

/** 腿上每个点越过这片外表面多少像素（点不在这片范围里给 −∞） */
const pointOvershoots = (prep: LegBase, skirtPiece: SkirtPiece, t: BoneTable, points: readonly THREE.Vector3[]): number[] => {
  const inv = prep.相对('Skirt', skirtPiece.bone, t).invert();
  const face = skirtPiece.outerSign > 0 ? skirtPiece.max.getComponent(skirtPiece.axis) : skirtPiece.min.getComponent(skirtPiece.axis);
  const q = new THREE.Vector3();
  return points.map((p) => {
    q.copy(p).applyMatrix4(inv);
    for (const a of [0, 1, 2] as const) {
      if (a === skirtPiece.axis) continue;
      const v = q.getComponent(a);
      if (v < skirtPiece.min.getComponent(a) || v > skirtPiece.max.getComponent(a)) return -Infinity;
    }
    return skirtPiece.outerSign * (q.getComponent(skirtPiece.axis) - face);
  });
};

/**
 * 这一组里腿穿出来、没被盖住的点：越过了某片的外表面，同组也没有别的片把它包在里面（侧片三份副本叠在一起、正中和两角边上叠着，
 * 一份歪开了另一份还盖着就不算露）。返回 [点号, 片号, 越过多少]
 */
const exposedPoints = (prep: LegBase, group: ClothGroup, t: BoneTable, points: readonly THREE.Vector3[]): [number, number, number][] => {
  const crossings = group.片们.map((skirtPiece) => pointOvershoots(prep, skirtPiece, t, points));
  const exposed: [number, number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    let covered = false;
    let pierce: [number, number, number] | undefined;
    group.片们.forEach((skirtPiece, j) => {
      const v = crossings[j]![i]!;
      if (v === -Infinity) return;
      if (v > skirtPiece.容) {
        if (!pierce || v > pierce[2]) pierce = [i, j, v];
      } else covered = true;
    });
    if (pierce && !covered) exposed.push(pierce);
  }
  return exposed;
};
const pokeCount = (prep: LegBase, group: ClothGroup, t: BoneTable, points: readonly THREE.Vector3[]): number => exposedPoints(prep, group, t, points).length;

/** 前、后正中那一串（顶节、下摆节）和左右两角的下摆节 */
const midGroups = [
  ['bone27', 'bone29', 'bone32', 'bone127'],
  ['bone128', 'bone130', 'bone133', 'bone136'],
] as const;
/** 正中片下摆的左右边、两角下摆朝里的那条边（模型 x，像素；Skirt 坐标的 x 取负就是模型 x） */
const hemEdge = (prep: LegBase, t: BoneTable, [, midBottom, leftCornerBottom, rightCornerBottom]: (typeof midGroups)[number]) => {
  const xs = (boneName: string) => {
    const b = prep.表.get(boneName)!;
    const [a, z] = boxRange(b, b.cubes![0]!);
    const m = prep.相对('Skirt', boneName, t);
    return [0, 1, 2, 3].map((k) => -new THREE.Vector3(k & 1 ? z.x : a.x, a.y, k & 2 ? z.z : a.z).applyMatrix4(m).x);
  };
  const midHemXs = xs(midBottom);
  return { midLeft: Math.max(...midHemXs), midRight: Math.min(...midHemXs), leftInner: Math.min(...xs(leftCornerBottom)), rightInner: Math.max(...xs(rightCornerBottom)) };
};

const prepCache = new WeakMap<BoneModel, ReturnType<typeof prepareGeometry>>();
const prepareGeometry = (g: BoneModel) => {
  const boneMap = new Map(g.bones.map((b) => [b.name, b]));
  const childrenByParent = new Map<string, BedrockBone[]>();
  for (const b of g.bones) if (b.parent) childrenByParent.set(b.parent, [...(childrenByParent.get(b.parent) ?? []), b]);
  const descendants = (boneName: string): BedrockBone[] => (childrenByParent.get(boneName) ?? []).flatMap((b) => [b, ...descendants(b.name)]);
  /** 从 祖先（不含）到 名 这一串骨骼 */
  const bonesOf = (ancestor: string, boneName: string): BedrockBone[] => {
    const chain: BedrockBone[] = [];
    for (let b = boneMap.get(boneName); b && b.name !== ancestor; b = b.parent ? boneMap.get(b.parent) : undefined) chain.unshift(b);
    return chain;
  };
  const relativeTo = (ancestor: string, boneName: string, t: BoneTable): THREE.Matrix4 => {
    const m = new THREE.Matrix4();
    let parentPivot: readonly number[] = boneMap.get(ancestor)!.pivot;
    for (const b of bonesOf(ancestor, boneName)) {
      m.multiply(localMatrix(b, parentPivot, t[b.name]));
      parentPivot = b.pivot;
    }
    return m;
  };
  // 腿：大腿、小腿、脚上所有方盒，表面按 4×4×4 的格子取点
  const legPoints = ['LeftLeg', 'RightLeg'].map((rootName) =>
    [boneMap.get(rootName)!, ...descendants(rootName)].flatMap((b) =>
      (b.cubes ?? []).map((c) => {
        const [a, z] = boxRange(b, c);
        const points: THREE.Vector3[] = [];
        const n = 3;
        for (let i = 0; i <= n; i++)
          for (let j = 0; j <= n; j++)
            for (let k = 0; k <= n; k++) {
              if (![i, j, k].some((v) => v === 0 || v === n)) continue;
              points.push(new THREE.Vector3(a.x + ((z.x - a.x) * i) / n, a.y + ((z.y - a.y) * j) / n, a.z + ((z.z - a.z) * k) / n));
            }
        return { bone: b.name, points: points };
      }),
    ),
  );
  // 片：静止姿势下最薄的轴，朝外 = 离腰的竖轴远的那一边
  const skirtPieces = (roots: string[], exclude?: string[]): SkirtPiece[] => {
    const removedNames = new Set((exclude ?? []).flatMap((n) => [n, ...descendants(n).map((b) => b.name)]));
    return roots
      .flatMap((r) => [boneMap.get(r)!, ...descendants(r)])
      .filter((b) => !removedNames.has(b.name))
      .flatMap((b) =>
        (b.cubes ?? []).map((c): SkirtPiece => {
          const [min, max] = boxRange(b, c);
          const size = [max.x - min.x, max.y - min.y, max.z - min.z];
          const axis = size.indexOf(Math.min(...size)) as 0 | 1 | 2;
          const m = relativeTo('Skirt', b.name, {});
          const center = min.clone().add(max).multiplyScalar(0.5);
          const centerS = center.clone().applyMatrix4(m);
          // 腰的竖轴上同高的那一点：Skirt 坐标的原点在 Skirt 的 pivot (0, 23.85, 0.1)，DownBody 的竖轴在 x = 0、z = −0.1
          const axisPoint = new THREE.Vector3(0, centerS.y, -0.1).applyMatrix4(m.clone().invert());
          return { bone: b.name, min, max, axis, outerSign: center.getComponent(axis) > axisPoint.getComponent(axis) ? 1 : -1, 容: -outerMargin };
        }),
      );
  };
  const groups = {
    前: { name: '前', hinges: ['FrontSkirt'], 片们: skirtPieces(['FrontSkirt'], ['LeftSkirt2', 'RightSkirt2']) },
    后: { name: '后', hinges: ['BackSkirt'], 片们: skirtPieces(['BackSkirt'], ['LeftSkirt3', 'RightSkirt3']) },
    左: { name: '左', hinges: ['LeftSkirt', 'LeftSkirt2', 'LeftSkirt3', 'bone30', 'bone131'], 片们: skirtPieces(['LeftSkirt', 'LeftSkirt2', 'LeftSkirt3']) },
    右: { name: '右', hinges: ['RightSkirt', 'RightSkirt2', 'RightSkirt3', 'bone125', 'bone134'], 片们: skirtPieces(['RightSkirt', 'RightSkirt2', 'RightSkirt3']) },
  } satisfies Record<string, ClothGroup>;
  // 每根铰往外甩用哪个转角通道、正负：前后片绕 X，侧片、两角绕 Z；试转一度，这一串下摆那节离腰的竖轴远了就是往外
  const channels = new Map<string, { axis: 0 | 2; sign: 1 | -1 }>();
  for (const group of Object.values(groups))
    for (const hinge of group.hinges) {
      const axis = group.name === '前' || group.name === '后' ? 0 : 2;
      let bottomBone = boneMap.get(hinge)!;
      while (childrenByParent.get(bottomBone.name)?.length) bottomBone = childrenByParent.get(bottomBone.name)![0]!;
      const offAxis = (angle: number) => {
        const r = [0, 0, 0];
        r[axis] = angle;
        const p = new THREE.Vector3().applyMatrix4(relativeTo('Skirt', bottomBone.name, { [hinge]: { rot: r } }));
        return Math.hypot(p.x, p.z);
      };
      channels.set(hinge, { axis, sign: offAxis(1) > offAxis(-1) ? 1 : -1 });
    }
  const legBottom: LegBase = { 表: boneMap, 相对: relativeTo, legPoints };
  const restPoints = posedLegPoints(legBottom, {});
  for (const group of Object.values(groups)) for (const skirtPiece of group.片们) skirtPiece.容 = Math.max(-outerMargin, Math.max(...pointOvershoots(legBottom, skirtPiece, {}, restPoints)) + 0.01);
  const staticOverlap = midGroups.map((group) => {
    const e = hemEdge(legBottom, {}, group);
    return { left: Math.min(overlapCap, e.midLeft - e.leftInner), right: Math.min(overlapCap, e.rightInner - e.midRight) };
  });
  return { ...legBottom, groups, channels, staticOverlap };
};
type Prep = ReturnType<typeof prepareGeometry>;

const addRotate = (t: BoneTable, boneName: string, axis: number, angle: number): BonePose => {
  const r = [...(t[boneName]?.rot ?? [0, 0, 0])];
  r[axis] = r[axis]! + angle;
  return { ...t[boneName], rot: r };
};

/** 给一组的各铰都往外甩 角 度 */
const swing = (prep: Prep, group: ClothGroup, t: BoneTable, angle: number): BoneTable => {
  if (angle === 0) return t;
  const pose: Record<string, BonePose> = { ...t };
  for (const hinge of group.hinges) {
    const c = prep.channels.get(hinge)!;
    pose[hinge] = addRotate(t, hinge, c.axis, c.sign * angle);
  }
  return pose;
};

/** 前后正中那片（bone27 一串、bone128 一串）横向放宽、平移，下摆两边和甩开的两角至少叠 静叠 那么宽；两角张得不多时不动 */
const correctMid = (prep: Prep, t: BoneTable): BoneTable => {
  let corrected: Record<string, BonePose> | undefined;
  midGroups.forEach((group, i) => {
    const pivotIdx = group[0];
    const { midLeft, midRight, leftInner, rightInner } = hemEdge(prep, t, group);
    const targetLeft = Math.max(midLeft, leftInner + prep.staticOverlap[i]!.left);
    const targetRight = Math.min(midRight, rightInner - prep.staticOverlap[i]!.right);
    if (targetLeft - midLeft < 1e-6 && midRight - targetRight < 1e-6) return;
    // 绕 pivot（模型 x = 0）横向缩放 w、再平移 d：[中右, 中左] → [要右, 要左]
    const w = (targetLeft - targetRight) / (midLeft - midRight);
    const d = targetLeft - midLeft * w;
    corrected ??= { ...t };
    const p = t[pivotIdx]?.pos ?? [0, 0, 0];
    corrected[pivotIdx] = { ...t[pivotIdx], scale: [w, 1, 1], pos: [p[0]! + d, p[1]!, p[2]!] };
  });
  return corrected ?? t;
};

type Angles = { 前: number; 后: number; 左: number; 右: number };
const compose = (prep: Prep, t: BoneTable, angles: Angles): BoneTable => {
  let x: BoneTable = t;
  for (const k of ['左', '右', '前', '后'] as const) x = swing(prep, prep.groups[k], x, angles[k]);
  return correctMid(prep, x);
};

/** 别的组照 角 摆着，这一组最少甩几度就不被穿出（0 = 本来就没穿；到 最大角 还穿就给 最大角） */
const minAngle = (prep: Prep, k: keyof Angles, t: BoneTable, angles: Angles, points: readonly THREE.Vector3[]): number => {
  const group = prep.groups[k];
  const tryAngle = (a: number) => pokeCount(prep, group, compose(prep, t, { ...angles, [k]: a }), points) > 0;
  if (!tryAngle(0)) return 0;
  if (tryAngle(maxAngle)) return maxAngle;
  let [lo, hi] = [0, maxAngle];
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (tryAngle(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
};

/**
 * 给合好的姿势表（动画 + 手摆的姿势），返回袍摆各骨骼要盖上去的姿势（只含改了的骨骼；转角加在表里原有的上面）、各组甩的角度、还剩几片被穿出。
 * 两侧和前后互相牵连（侧片副本挂在前后片下，两角跟着侧片张），轮流解几遍，直到都不穿或者解满 4 轮。
 */
export const hemYieldLeg = (g: BoneModel, t: BoneTable): { bonePose: Record<string, BonePose>; angle: Angles; remain: number } => {
  let prep = prepCache.get(g);
  if (!prep) prepCache.set(g, (prep = prepareGeometry(g)));
  const points = posedLegPoints(prep, t);
  const angles: Angles = { 前: 0, 后: 0, 左: 0, 右: 0 };
  const remainingPokes = () => Object.values(prep.groups).reduce((s, group) => s + pokeCount(prep, group, compose(prep, t, angles), points), 0);
  for (let iteration = 0; iteration < 4; iteration++) {
    for (const k of ['左', '右', '前', '后'] as const) angles[k] = minAngle(prep, k, t, angles, points);
    if (remainingPokes() === 0) break;
  }
  const merged = compose(prep, t, angles);
  const bonePose: Record<string, BonePose> = {};
  for (const [boneName, p] of Object.entries(merged)) if (p !== t[boneName]) bonePose[boneName] = p;
  return { bonePose, angle: angles, remain: remainingPokes() };
};

/** 核对用：照 袍摆让腿 解出来的样子，列出还露在外面的腿上的点（哪一组、越过哪一片、越过多少像素、点在 Skirt 坐标里的位置） */
export const hemPierceDetails = (g: BoneModel, t: BoneTable): { group: string; bone: string; overshoot: number; points: number[] }[] => {
  const r = hemYieldLeg(g, t);
  const prep = prepCache.get(g)!;
  const merged = compose(prep, t, r.angle);
  const points = posedLegPoints(prep, t);
  return Object.values(prep.groups).flatMap((group) => exposedPoints(prep, group, merged, points).map(([i, j, v]) => ({ group: group.name, bone: group.片们[j]!.bone, overshoot: v, points: points[i]!.toArray() })));
};

/** 测试用：祖先 坐标 ← 名 的骨骼坐标（本文件自己的骨骼算式，和 基岩正解.ts 对） */
export const relativeMatrix = (g: BoneModel, ancestor: string, boneName: string, t: BoneTable): THREE.Matrix4 => {
  let prep = prepCache.get(g);
  if (!prep) prepCache.set(g, (prep = prepareGeometry(g)));
  return prep.相对(ancestor, boneName, t);
};
