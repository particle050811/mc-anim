// 回放一份法术录制（录制/法术/<模组>/<法术>，格式 mcai-录制/1，录法见 docs/决策/0016-法术录制.md）：
// 录下的是游戏里逐刻的粒子快照，按画面里的施法者、目标两点摆回去（局部坐标：前 = 施法者到目标的水平方向，右 = 前 × 上）。
// - 方片粒子：位置、转角照游戏渲染插值（上一刻到这一刻，同 interpPathPos），大小取这一刻到下一刻（getQuadSize 带分刻），颜色、透明度、贴图格取这一刻；
//   动法 = '算' 时位置改由出生的实例字段（位、速、重力、摩擦、碰撞）按 particlePath 重算，大小、颜色、贴图仍取录下的。
// - 改写了 render 自己画的（冲击波环这类）：录制时替它画过一遍，有网格轨的照录下的顶点画（前后两刻的顶点插值），没有的跳过。
// - 实体（除了目标）：只画线框占位盒；声音不在这里放（段里照 声音 表 放()）。
// 录制是一次随机结果：每次放都是同一份，不认 种子。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { lerp as 插 } from '@engine/core/数学.ts';
import type { Png } from '@engine/model/贴图.ts';
import { interpPathPos, particlePath } from '@库/特效/粒子面片.tsx';
import type { 点 } from '../接口.ts';
import { 混合参数, 贴图, type 混合 } from './材质.ts';
import { 面片们, type 面片项 } from './面片.tsx';

type 轨行 = readonly number[];
export type 录制粒子 = {
  类型: string;
  类: string;
  画法: string;
  自画网格: boolean;
  /** 出生刻（从出手算） */
  生: number;
  寿命: number;
  重力: number;
  摩擦: number;
  碰撞: boolean;
  位: 点;
  速: 点;
  /** 每刻一行：前, 右, 上, 半边长, r, g, b, a, 转角, 贴图（贴图名 的下标） */
  轨: readonly 轨行[];
  /** 每行：刻, 然后每个顶点 前, 右, 上, u, v, r, g, b, a */
  网格轨?: readonly 轨行[];
};
export type 录制实体 = { 类型: string; 生: number; 灭: number | null; 宽: number; 高: number; 目标: boolean; 轨: readonly 轨行[] };
export type 法术录制 = {
  格式: 'mcai-录制/1';
  法术?: string;
  刻数: number;
  施法者: { 眼高: number };
  贴图名: readonly string[];
  粒子: readonly 录制粒子[];
  实体: readonly 录制实体[];
  声音: readonly { 刻: number; 事件: string; 音量: number; 音高: number }[];
};

/** import 进来的 json 断言成录制（格式不对当场报） */
export const 读录制 = (x: unknown): 法术录制 => {
  const r = x as 法术录制;
  if (r?.格式 !== 'mcai-录制/1') throw new Error(`不是法术录制（格式 ${String((x as { 格式?: unknown })?.格式)}）`);
  return r;
};

export type 录制回放属性 = {
  录制: 法术录制;
  /** 出手后的秒 */
  秒: number;
  /** 施法者脚底（录制的原点）；只有 起点 的宿主（法术演出属性）用 脚底 = 起点 − (0, 0, 起点高) */
  脚底: 点;
  目标: 点;
  /** 贴图名（如 goety:frost_1）→ 贴图；缺的不画，列在 缺贴图() */
  贴图: Readonly<Record<string, Png>>;
  动法?: '轨' | '算';
  /** 实体画占位盒；默认画 */
  占位?: boolean;
};

const 画法混合 = (画法: string): 混合 => (/TRANSLUCENT/.test(画法) ? '半透明' : /OPAQUE|TERRAIN/.test(画法) ? '镂空' : '半透明');
const 夹 = (轨: readonly 轨行[], i: number) => 轨[Math.max(0, Math.min(轨.length - 1, i))]!;

/** 局部 (前, 右, 上) → 场景 */
const 摆法 = (脚底: 点, 目标: 点) => {
  let fx = 目标[0] - 脚底[0];
  let fy = 目标[1] - 脚底[1];
  const n = Math.hypot(fx, fy);
  if (n < 1e-9) [fx, fy] = [1, 0];
  else [fx, fy] = [fx / n, fy / n];
  return (前: number, 右: number, 上: number): [number, number, number] => [脚底[0] + 前 * fx + 右 * fy, 脚底[1] + 前 * fy - 右 * fx, 脚底[2] + 上];
};

/** 这份录制用到、贴图表里没有的贴图名（核对用） */
export const 缺贴图 = (录制: 法术录制, 表: Readonly<Record<string, Png>>) => {
  const 用 = new Set<number>();
  for (const p of 录制.粒子) if (!p.自画网格 || p.网格轨) for (const r of p.轨) if (r[9]! >= 0) 用.add(r[9]!);
  return [...用].map((i) => 录制.贴图名[i]!).filter((n) => !表[n]);
};

/** 这份录制回放跳过的（自画网格又没录到网格的）和只画占位的，给 00-说明 列 */
export const 回放不画的 = (录制: 法术录制) => ({
  跳过: [...new Set(录制.粒子.filter((p) => p.自画网格 && !p.网格轨).map((p) => `${p.类型}（${p.类}）`))],
  占位: [...new Set(录制.实体.filter((e) => !e.目标).map((e) => e.类型))],
});

export const 录制回放: React.FC<录制回放属性> = ({ 录制, 秒, 脚底, 目标, 贴图: 表, 动法 = '轨', 占位 = true }) => {
  const 摆 = 摆法(脚底, 目标);
  const 刻 = 秒 * 20;
  // 算 的路径只依赖录制本身（局部坐标），按录制缓存
  const 算路 = useMemo(
    () =>
      动法 === '算'
        ? 录制.粒子.map((p) =>
            // 碰撞字段开着、类却改写了 move 不碰撞的（FlameParticle）：录下的轨迹钻到脚底以下，就当不碰撞
            particlePath([p.位[0], p.位[1], p.位[2]], [p.速[0], p.速[1], p.速[2]], p.轨.length + 1, { gravity: p.重力, friction: p.摩擦, ground: p.碰撞 && !p.轨.some((r) => r[2]! < -0.01) ? 0 : undefined }),
          )
        : null,
    [录制, 动法],
  );
  const 批 = new Map<string, { 图: Png; 混合: 混合; 项: 面片项[] }>();
  const 网格们: { 名: string; 混合: 混合; 行0: 轨行; 行1: 轨行; f: number }[] = [];
  录制.粒子.forEach((p, k) => {
    const τ = 刻 - p.生;
    if (τ < 0) return;
    const i = Math.floor(τ);
    if (i >= p.轨.length) return;
    const f = τ - i;
    const 这 = p.轨[i]!;
    const 名 = 录制.贴图名[这[9]!];
    if (p.自画网格) {
      if (!p.网格轨 || 名 === undefined) return;
      // 网格轨的刻号是绝对的（从出手算），和 轨 不一定一一对上（render 抛错的那刻没有）
      const 绝对 = p.生 + i;
      const j = p.网格轨.findIndex((r) => r[0] === 绝对);
      if (j < 0) return;
      网格们.push({ 名, 混合: 画法混合(p.画法), 行0: p.网格轨[j]!, 行1: p.网格轨[j + 1]?.[0] === 绝对 + 1 ? p.网格轨[j + 1]! : p.网格轨[j]!, f });
      return;
    }
    if (名 === undefined) return;
    const 图 = 表[名];
    if (!图) return;
    const 前 = 夹(p.轨, i - 1);
    const 下 = 夹(p.轨, i + 1);
    const 局 = 算路 ? interpPathPos(算路[k]!, τ) : [插(前[0]!, 这[0]!, f), 插(前[1]!, 这[1]!, f), 插(前[2]!, 这[2]!, f)];
    const 混 = 画法混合(p.画法);
    const 键 = `${名}|${混}`;
    let b = 批.get(键);
    if (!b) 批.set(键, (b = { 图, 混合: 混, 项: [] }));
    b.项.push({ 位: 摆(局[0]!, 局[1]!, 局[2]!), 半宽: 插(这[3]!, 下[3]!, f), 色: [这[4]!, 这[5]!, 这[6]!], 透明度: 这[7]!, 转角: 插(前[8]!, 这[8]!, f) });
  });
  return (
    <>
      {[...批.entries()].map(([键, b]) => (
        <面片们 key={键} 图={b.图} 项={b.项} 混合={b.混合} />
      ))}
      {网格们.map((m, n) => {
        const 图 = 表[m.名];
        return 图 ? <录下的网格 key={n} 图={图} 混合={m.混合} 行0={m.行0} 行1={m.行1} f={m.f} 摆={摆} /> : null;
      })}
      {占位 &&
        录制.实体.map((e, n) => {
          if (e.目标) return null;
          const τ = 刻 - e.生;
          if (τ < 0 || (e.灭 !== null && 刻 >= e.灭)) return null;
          const i = Math.floor(τ);
          if (i >= e.轨.length) return null;
          const a = 夹(e.轨, i - 1);
          const c = 夹(e.轨, i);
          const f = τ - i;
          const 位 = 摆(插(a[0]!, c[0]!, f), 插(a[1]!, c[1]!, f), 插(a[2]!, c[2]!, f));
          return (
            <mesh key={n} position={[位[0], 位[1], 位[2] + e.高 / 2]}>
              <boxGeometry args={[e.宽, e.宽, e.高]} />
              <meshBasicMaterial color="#ff00ff" wireframe />
            </mesh>
          );
        })}
    </>
  );
};

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** 一刻录下的顶点（每 4 个一个方片），和下一刻的按分刻插值（顶点数不同就不插） */
const 录下的网格: React.FC<{ 图: Png; 混合: 混合; 行0: 轨行; 行1: 轨行; f: number; 摆: ReturnType<typeof 摆法> }> = ({ 图, 混合, 行0, 行1, f, 摆 }) => {
  const 数 = Math.floor((行0.length - 1) / 9);
  const 同 = 行1.length === 行0.length;
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: 贴图(图), vertexColors: true, side: THREE.DoubleSide, alphaTest: 混合 === '镂空' ? 0.1 : 0.004, ...混合参数(混合) }), [图, 混合]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  const 位: number[] = [];
  const uv: number[] = [];
  const 色: number[] = [];
  for (let v = 0; v < 数; v++) {
    const o = 1 + v * 9;
    const g = (k: number) => (同 ? 插(行0[o + k]!, 行1[o + k]!, f) : 行0[o + k]!);
    位.push(...摆(g(0), g(1), g(2)));
    uv.push(行0[o + 3]!, 行0[o + 4]!);
    色.push(s2l(g(5)), s2l(g(6)), s2l(g(7)), g(8));
  }
  const 索引: number[] = [];
  for (let q = 0; q + 3 < 数; q += 4) 索引.push(q, q + 1, q + 2, q, q + 2, q + 3);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(位, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(色, 4));
  geo.setIndex(索引);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};
