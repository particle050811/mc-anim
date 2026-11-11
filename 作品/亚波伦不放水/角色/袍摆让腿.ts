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

type 表 = Readonly<Record<string, BonePose>>;
type 几何 = { bones: readonly BedrockBone[] };

const 度 = Math.PI / 180;
/** 腿上的点离片的外表面至少这么远（像素）才算盖住 */
const 外留 = 0.15;
/** 正中片和两角在下摆处至少叠这么宽（像素）；站着时叠得比这窄的，照站着的 */
const 叠 = 1;
/** 一组最多甩多少度（再多也不找了，按最大的算） */
const 最大角 = 75;

/** 一根骨骼相对父骨骼的矩阵（同 基岩正解.ts 的 骨骼矩阵 里每一节） */
const 局部 = (骨: BedrockBone, 父轴心: readonly number[], p: BonePose | undefined): THREE.Matrix4 => {
  const s = p?.scale ?? 1;
  const sv = typeof s === 'number' ? [s, s, s] : s;
  const 静 = 骨.rotation ?? [0, 0, 0];
  const ar = p?.rot ?? [0, 0, 0];
  const ap = p?.pos ?? [0, 0, 0];
  return new THREE.Matrix4().compose(
    new THREE.Vector3(-(骨.pivot[0] - 父轴心[0]!) - ap[0]!, 骨.pivot[1] - 父轴心[1]! + ap[1]!, 骨.pivot[2] - 父轴心[2]! + ap[2]!),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-(静[0] + ar[0]!) * 度, -(静[1] + ar[1]!) * 度, (静[2] + ar[2]!) * 度, 'ZYX')),
    new THREE.Vector3(sv[0], sv[1], sv[2]),
  );
};

/** 方盒在自己骨骼坐标里的范围 [min, max]（原点 = pivot，X 取负，同 描边面），计 inflate */
const 盒范围 = (骨: BedrockBone, c: BedrockCube): [THREE.Vector3, THREE.Vector3] => {
  const f = c.inflate ?? 0;
  const [o, s] = [c.origin, c.size];
  return [
    new THREE.Vector3(-(o[0] + s[0]) + 骨.pivot[0] - f, o[1] - 骨.pivot[1] - f, o[2] - 骨.pivot[2] - f),
    new THREE.Vector3(-o[0] + 骨.pivot[0] + f, o[1] + s[1] - 骨.pivot[1] + f, o[2] + s[2] - 骨.pivot[2] + f),
  ];
};

type 片 = {
  骨: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** 片最薄的那个轴（0、1、2）、朝外是正还是负 */
  轴: 0 | 1 | 2;
  外: 1 | -1;
  /** 腿上的点最多能越过外表面多少（像素）：一般是 −外留；站着时就已经越过一点的片（左大腿根比左侧片宽约 0.1 像素），照站着时的放宽，站姿不改 */
  容: number;
};
type 组 = { 名: string; 铰: string[]; 片们: 片[] };
type 基 = {
  表: ReadonlyMap<string, BedrockBone>;
  /** 祖先 坐标 ← 名 的骨骼坐标（名 坐标里的点乘上它得到 祖先 坐标） */
  相对: (祖先: string, 名: string, t: 表) => THREE.Matrix4;
  腿点们: readonly (readonly { 骨: string; 点: THREE.Vector3[] }[])[];
};

/** 这一刻腿在 Skirt 坐标里的采样点（腿不受袍摆影响，一帧算一次） */
const 腿点 = (备: 基, t: 表): THREE.Vector3[] => {
  const 出: THREE.Vector3[] = [];
  // Skirt 和腿的共同祖先是 DownBody：都换到 DownBody 坐标再换进 Skirt
  const 裙 = 备.相对('DownBody', 'Skirt', t).invert();
  for (const 边 of 备.腿点们)
    for (const { 骨, 点 } of 边) {
      const m = 裙.clone().multiply(备.相对('DownBody', 骨, t));
      for (const p of 点) 出.push(p.clone().applyMatrix4(m));
    }
  return 出;
};

/** 腿上每个点越过这片外表面多少像素（点不在这片范围里给 −∞） */
const 各点越过 = (备: 基, 片: 片, t: 表, 点们: readonly THREE.Vector3[]): number[] => {
  const inv = 备.相对('Skirt', 片.骨, t).invert();
  const 面 = 片.外 > 0 ? 片.max.getComponent(片.轴) : 片.min.getComponent(片.轴);
  const q = new THREE.Vector3();
  return 点们.map((p) => {
    q.copy(p).applyMatrix4(inv);
    for (const a of [0, 1, 2] as const) {
      if (a === 片.轴) continue;
      const v = q.getComponent(a);
      if (v < 片.min.getComponent(a) || v > 片.max.getComponent(a)) return -Infinity;
    }
    return 片.外 * (q.getComponent(片.轴) - 面);
  });
};

/**
 * 这一组里腿穿出来、没被盖住的点：越过了某片的外表面，同组也没有别的片把它包在里面（侧片三份副本叠在一起、正中和两角边上叠着，
 * 一份歪开了另一份还盖着就不算露）。返回 [点号, 片号, 越过多少]
 */
const 露点 = (备: 基, 组: 组, t: 表, 点们: readonly THREE.Vector3[]): [number, number, number][] => {
  const 表们 = 组.片们.map((片) => 各点越过(备, 片, t, 点们));
  const 出: [number, number, number][] = [];
  for (let i = 0; i < 点们.length; i++) {
    let 盖 = false;
    let 穿: [number, number, number] | undefined;
    组.片们.forEach((片, j) => {
      const v = 表们[j]![i]!;
      if (v === -Infinity) return;
      if (v > 片.容) {
        if (!穿 || v > 穿[2]) 穿 = [i, j, v];
      } else 盖 = true;
    });
    if (穿 && !盖) 出.push(穿);
  }
  return 出;
};
const 穿出数 = (备: 基, 组: 组, t: 表, 点们: readonly THREE.Vector3[]): number => 露点(备, 组, t, 点们).length;

/** 前、后正中那一串（顶节、下摆节）和左右两角的下摆节 */
const 正中们 = [
  ['bone27', 'bone29', 'bone32', 'bone127'],
  ['bone128', 'bone130', 'bone133', 'bone136'],
] as const;
/** 正中片下摆的左右边、两角下摆朝里的那条边（模型 x，像素；Skirt 坐标的 x 取负就是模型 x） */
const 下摆边 = (备: 基, t: 表, [, 中底, 左角底, 右角底]: (typeof 正中们)[number]) => {
  const xs = (名: string) => {
    const b = 备.表.get(名)!;
    const [a, z] = 盒范围(b, b.cubes![0]!);
    const m = 备.相对('Skirt', 名, t);
    return [0, 1, 2, 3].map((k) => -new THREE.Vector3(k & 1 ? z.x : a.x, a.y, k & 2 ? z.z : a.z).applyMatrix4(m).x);
  };
  const 中 = xs(中底);
  return { 中左: Math.max(...中), 中右: Math.min(...中), 左里: Math.min(...xs(左角底)), 右里: Math.max(...xs(右角底)) };
};

const 准备缓存 = new WeakMap<几何, ReturnType<typeof 准备>>();
const 准备 = (g: 几何) => {
  const 表 = new Map(g.bones.map((b) => [b.name, b]));
  const 子 = new Map<string, BedrockBone[]>();
  for (const b of g.bones) if (b.parent) 子.set(b.parent, [...(子.get(b.parent) ?? []), b]);
  const 后代 = (名: string): BedrockBone[] => (子.get(名) ?? []).flatMap((b) => [b, ...后代(b.name)]);
  /** 从 祖先（不含）到 名 这一串骨骼 */
  const 路 = (祖先: string, 名: string): BedrockBone[] => {
    const 链: BedrockBone[] = [];
    for (let b = 表.get(名); b && b.name !== 祖先; b = b.parent ? 表.get(b.parent) : undefined) 链.unshift(b);
    return 链;
  };
  const 相对 = (祖先: string, 名: string, t: 表): THREE.Matrix4 => {
    const m = new THREE.Matrix4();
    let 父轴心: readonly number[] = 表.get(祖先)!.pivot;
    for (const b of 路(祖先, 名)) {
      m.multiply(局部(b, 父轴心, t[b.name]));
      父轴心 = b.pivot;
    }
    return m;
  };
  // 腿：大腿、小腿、脚上所有方盒，表面按 4×4×4 的格子取点
  const 腿点们 = ['LeftLeg', 'RightLeg'].map((根) =>
    [表.get(根)!, ...后代(根)].flatMap((b) =>
      (b.cubes ?? []).map((c) => {
        const [a, z] = 盒范围(b, c);
        const 点: THREE.Vector3[] = [];
        const n = 3;
        for (let i = 0; i <= n; i++)
          for (let j = 0; j <= n; j++)
            for (let k = 0; k <= n; k++) {
              if (![i, j, k].some((v) => v === 0 || v === n)) continue;
              点.push(new THREE.Vector3(a.x + ((z.x - a.x) * i) / n, a.y + ((z.y - a.y) * j) / n, a.z + ((z.z - a.z) * k) / n));
            }
        return { 骨: b.name, 点 };
      }),
    ),
  );
  // 片：静止姿势下最薄的轴，朝外 = 离腰的竖轴远的那一边
  const 片们 = (根们: string[], 除?: string[]): 片[] => {
    const 除掉 = new Set((除 ?? []).flatMap((n) => [n, ...后代(n).map((b) => b.name)]));
    return 根们
      .flatMap((r) => [表.get(r)!, ...后代(r)])
      .filter((b) => !除掉.has(b.name))
      .flatMap((b) =>
        (b.cubes ?? []).map((c): 片 => {
          const [min, max] = 盒范围(b, c);
          const 尺 = [max.x - min.x, max.y - min.y, max.z - min.z];
          const 轴 = 尺.indexOf(Math.min(...尺)) as 0 | 1 | 2;
          const m = 相对('Skirt', b.name, {});
          const 心 = min.clone().add(max).multiplyScalar(0.5);
          const 心S = 心.clone().applyMatrix4(m);
          // 腰的竖轴上同高的那一点：Skirt 坐标的原点在 Skirt 的 pivot (0, 23.85, 0.1)，DownBody 的竖轴在 x = 0、z = −0.1
          const 轴点 = new THREE.Vector3(0, 心S.y, -0.1).applyMatrix4(m.clone().invert());
          return { 骨: b.name, min, max, 轴, 外: 心.getComponent(轴) > 轴点.getComponent(轴) ? 1 : -1, 容: -外留 };
        }),
      );
  };
  const 组们 = {
    前: { 名: '前', 铰: ['FrontSkirt'], 片们: 片们(['FrontSkirt'], ['LeftSkirt2', 'RightSkirt2']) },
    后: { 名: '后', 铰: ['BackSkirt'], 片们: 片们(['BackSkirt'], ['LeftSkirt3', 'RightSkirt3']) },
    左: { 名: '左', 铰: ['LeftSkirt', 'LeftSkirt2', 'LeftSkirt3', 'bone30', 'bone131'], 片们: 片们(['LeftSkirt', 'LeftSkirt2', 'LeftSkirt3']) },
    右: { 名: '右', 铰: ['RightSkirt', 'RightSkirt2', 'RightSkirt3', 'bone125', 'bone134'], 片们: 片们(['RightSkirt', 'RightSkirt2', 'RightSkirt3']) },
  } satisfies Record<string, 组>;
  // 每根铰往外甩用哪个转角通道、正负：前后片绕 X，侧片、两角绕 Z；试转一度，这一串下摆那节离腰的竖轴远了就是往外
  const 通道 = new Map<string, { 轴: 0 | 2; 号: 1 | -1 }>();
  for (const 组 of Object.values(组们))
    for (const 铰 of 组.铰) {
      const 轴 = 组.名 === '前' || 组.名 === '后' ? 0 : 2;
      let 底 = 表.get(铰)!;
      while (子.get(底.name)?.length) 底 = 子.get(底.name)![0]!;
      const 离轴 = (角: number) => {
        const r = [0, 0, 0];
        r[轴] = 角;
        const p = new THREE.Vector3().applyMatrix4(相对('Skirt', 底.name, { [铰]: { rot: r } }));
        return Math.hypot(p.x, p.z);
      };
      通道.set(铰, { 轴, 号: 离轴(1) > 离轴(-1) ? 1 : -1 });
    }
  const 底: 基 = { 表, 相对, 腿点们 };
  const 静点 = 腿点(底, {});
  for (const 组 of Object.values(组们)) for (const 片 of 组.片们) 片.容 = Math.max(-外留, Math.max(...各点越过(底, 片, {}, 静点)) + 0.01);
  const 静叠 = 正中们.map((组) => {
    const e = 下摆边(底, {}, 组);
    return { 左: Math.min(叠, e.中左 - e.左里), 右: Math.min(叠, e.右里 - e.中右) };
  });
  return { ...底, 组们, 通道, 静叠 };
};
type 备 = ReturnType<typeof 准备>;

const 加转 = (t: 表, 名: string, 轴: number, 角: number): BonePose => {
  const r = [...(t[名]?.rot ?? [0, 0, 0])];
  r[轴] = r[轴]! + 角;
  return { ...t[名], rot: r };
};

/** 给一组的各铰都往外甩 角 度 */
const 甩 = (备: 备, 组: 组, t: 表, 角: number): 表 => {
  if (角 === 0) return t;
  const 出: Record<string, BonePose> = { ...t };
  for (const 铰 of 组.铰) {
    const c = 备.通道.get(铰)!;
    出[铰] = 加转(t, 铰, c.轴, c.号 * 角);
  }
  return 出;
};

/** 前后正中那片（bone27 一串、bone128 一串）横向放宽、平移，下摆两边和甩开的两角至少叠 静叠 那么宽；两角张得不多时不动 */
const 补正中 = (备: 备, t: 表): 表 => {
  let 出: Record<string, BonePose> | undefined;
  正中们.forEach((组, i) => {
    const 中 = 组[0];
    const { 中左, 中右, 左里, 右里 } = 下摆边(备, t, 组);
    const 要左 = Math.max(中左, 左里 + 备.静叠[i]!.左);
    const 要右 = Math.min(中右, 右里 - 备.静叠[i]!.右);
    if (要左 - 中左 < 1e-6 && 中右 - 要右 < 1e-6) return;
    // 绕 pivot（模型 x = 0）横向缩放 w、再平移 d：[中右, 中左] → [要右, 要左]
    const w = (要左 - 要右) / (中左 - 中右);
    const d = 要左 - 中左 * w;
    出 ??= { ...t };
    const p = t[中]?.pos ?? [0, 0, 0];
    出[中] = { ...t[中], scale: [w, 1, 1], pos: [p[0]! + d, p[1]!, p[2]!] };
  });
  return 出 ?? t;
};

type 角们 = { 前: number; 后: number; 左: number; 右: number };
const 合 = (备: 备, t: 表, 角: 角们): 表 => {
  let x: 表 = t;
  for (const k of ['左', '右', '前', '后'] as const) x = 甩(备, 备.组们[k], x, 角[k]);
  return 补正中(备, x);
};

/** 别的组照 角 摆着，这一组最少甩几度就不被穿出（0 = 本来就没穿；到 最大角 还穿就给 最大角） */
const 最少角 = (备: 备, k: keyof 角们, t: 表, 角: 角们, 点们: readonly THREE.Vector3[]): number => {
  const 组 = 备.组们[k];
  const 试 = (a: number) => 穿出数(备, 组, 合(备, t, { ...角, [k]: a }), 点们) > 0;
  if (!试(0)) return 0;
  if (试(最大角)) return 最大角;
  let [lo, hi] = [0, 最大角];
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (试(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
};

/**
 * 给合好的姿势表（动画 + 手摆的姿势），返回袍摆各骨骼要盖上去的姿势（只含改了的骨骼；转角加在表里原有的上面）、各组甩的角度、还剩几片被穿出。
 * 两侧和前后互相牵连（侧片副本挂在前后片下，两角跟着侧片张），轮流解几遍，直到都不穿或者解满 4 轮。
 */
export const 袍摆让腿 = (g: 几何, t: 表): { 姿势: Record<string, BonePose>; 角: 角们; 剩: number } => {
  let 备 = 准备缓存.get(g);
  if (!备) 准备缓存.set(g, (备 = 准备(g)));
  const 点们 = 腿点(备, t);
  const 角: 角们 = { 前: 0, 后: 0, 左: 0, 右: 0 };
  const 剩数 = () => Object.values(备.组们).reduce((s, 组) => s + 穿出数(备, 组, 合(备, t, 角), 点们), 0);
  for (let 轮 = 0; 轮 < 4; 轮++) {
    for (const k of ['左', '右', '前', '后'] as const) 角[k] = 最少角(备, k, t, 角, 点们);
    if (剩数() === 0) break;
  }
  const 末 = 合(备, t, 角);
  const 姿势: Record<string, BonePose> = {};
  for (const [名, p] of Object.entries(末)) if (p !== t[名]) 姿势[名] = p;
  return { 姿势, 角, 剩: 剩数() };
};

/** 核对用：照 袍摆让腿 解出来的样子，列出还露在外面的腿上的点（哪一组、越过哪一片、越过多少像素、点在 Skirt 坐标里的位置） */
export const 袍摆穿出明细 = (g: 几何, t: 表): { 组: string; 骨: string; 越过: number; 点: number[] }[] => {
  const r = 袍摆让腿(g, t);
  const 备 = 准备缓存.get(g)!;
  const 末 = 合(备, t, r.角);
  const 点们 = 腿点(备, t);
  return Object.values(备.组们).flatMap((组) => 露点(备, 组, 末, 点们).map(([i, j, v]) => ({ 组: 组.名, 骨: 组.片们[j]!.骨, 越过: v, 点: 点们[i]!.toArray() })));
};

/** 测试用：祖先 坐标 ← 名 的骨骼坐标（本文件自己的骨骼算式，和 基岩正解.ts 对） */
export const 相对矩阵 = (g: 几何, 祖先: string, 名: string, t: 表): THREE.Matrix4 => {
  let 备 = 准备缓存.get(g);
  if (!备) 准备缓存.set(g, (备 = 准备(g)));
  return 备.相对(祖先, 名, t);
};
