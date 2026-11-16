// 回放一份法术录制（录制/法术/<模组>/<法术>，格式 mcai-录制/1，录法见 docs/决策/0016-法术录制.md）：
// 录下的是游戏里逐刻的粒子快照，按画面里的施法者、目标两点摆回去（局部坐标：前 = 施法者到目标的水平方向，右 = 前 × 上）。
// - 方片粒子：位置、转角照游戏渲染插值（上一刻到这一刻，同 interpPathPos），大小取这一刻到下一刻（getQuadSize 带分刻），颜色、透明度、贴图格取这一刻；
//   动法 = '算' 时位置改由出生的实例字段（位、速、重力、摩擦、碰撞）按 particlePath 重算，大小、颜色、贴图仍取录下的。
// - 改写了 render 自己画的（冲击波环这类）：录制时替它画过一遍，有网格轨的照录下的顶点画（前后两刻的顶点插值），没有的跳过。
// - 实体（除了目标）：只画线框占位盒；声音不在这里放（段里照 声音 表 放()）。
// 录制是一次随机结果：每次放都是同一份，不认 种子。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { lerp } from '@engine/core/数学.ts';
import type { Png } from '@engine/model/贴图.ts';
import { interpPathPos, particlePath } from '@库/特效/粒子面片.tsx';
import type { Vec3 } from '../接口.ts';
import { blendParams, toTexture, type Blend } from './材质.ts';
import { facePatch, QuadGroup, type QuadItem } from './面片.tsx';

type TrackRow = readonly number[];
export type RecordedParticle = {
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
  位: Vec3;
  速: Vec3;
  /** 每刻一行：前, 右, 上, 半边长, r, g, b, a, 转角, 贴图（贴图名 的下标） */
  轨: readonly TrackRow[];
  /** 每行：刻, 然后每个顶点 前, 右, 上, u, v, r, g, b, a */
  网格轨?: readonly TrackRow[];
};
export type RecordedEntity = { 类型: string; 生: number; 灭: number | null; 宽: number; 高: number; 目标: boolean; 轨: readonly TrackRow[] };
export type SpellRecording = {
  格式: 'mcai-录制/1';
  法术?: string;
  刻数: number;
  施法者: { 眼高: number };
  贴图名: readonly string[];
  粒子: readonly RecordedParticle[];
  实体: readonly RecordedEntity[];
  声音: readonly { 刻: number; 事件: string; 音量: number; 音高: number }[];
};

/** import 进来的 json 断言成录制（格式不对当场报） */
export const readRecording = (x: unknown): SpellRecording => {
  const r = x as SpellRecording;
  if (r?.格式 !== 'mcai-录制/1') throw new Error(`不是法术录制（格式 ${String((x as { 格式?: unknown })?.格式)}）`);
  return r;
};

export type RecordingReplayProps = {
  录制: SpellRecording;
  /** 出手后的秒 */
  sec: number;
  /** 施法者脚底（录制的原点）；只有 起点 的宿主（法术演出属性）用 脚底 = 起点 − (0, 0, 起点高) */
  feet: Vec3;
  target: Vec3;
  /** 贴图名（如 goety:frost_1）→ 贴图；缺的不画，列在 缺贴图() */
  贴图: Readonly<Record<string, Png>>;
  animMode?: '轨' | '算';
  /** 实体画占位盒；默认画 */
  withPlaceholders?: boolean;
};

const drawBlend = (renderType: string): Blend => (/TRANSLUCENT/.test(renderType) ? '半透明' : /OPAQUE|TERRAIN/.test(renderType) ? '镂空' : '半透明');
const clampedAt = (track: readonly TrackRow[], i: number) => track[Math.max(0, Math.min(track.length - 1, i))]!;

/** 局部 (前, 右, 上) → 场景 */
const placement = (feet: Vec3, target: Vec3) => {
  let fx = target[0] - feet[0];
  let fy = target[1] - feet[1];
  const n = Math.hypot(fx, fy);
  if (n < 1e-9) [fx, fy] = [1, 0];
  else [fx, fy] = [fx / n, fy / n];
  return (forward: number, right: number, up: number): [number, number, number] => [feet[0] + forward * fx + right * fy, feet[1] + forward * fy - right * fx, feet[2] + up];
};
export const RecordingReplay: React.FC<RecordingReplayProps> = ({ 录制: recording, sec: sec, feet, target: target, 贴图: textureMap, animMode = '轨', withPlaceholders = true }) => {
  const place = placement(feet, target);
  const tick = sec * 20;
  // 算 的路径只依赖录制本身（局部坐标），按录制缓存
  const computedPath = useMemo(
    () =>
      animMode === '算'
        ? recording.粒子.map((p) =>
            // 碰撞字段开着、类却改写了 move 不碰撞的（FlameParticle）：录下的轨迹钻到脚底以下，就当不碰撞
            particlePath([p.位[0], p.位[1], p.位[2]], [p.速[0], p.速[1], p.速[2]], p.轨.length + 1, { gravity: p.重力, friction: p.摩擦, ground: p.碰撞 && !p.轨.some((r) => r[2]! < -0.01) ? 0 : undefined }),
          )
        : null,
    [recording, animMode],
  );
  const batches = new Map<string, { 图: Png; blend: Blend; items: QuadItem[] }>();
  const meshes: { 名: string; blend: Blend; curRow: TrackRow; nextRow: TrackRow; f: number }[] = [];
  recording.粒子.forEach((p, k) => {
    const τ = tick - p.生;
    if (τ < 0) return;
    const i = Math.floor(τ);
    if (i >= p.轨.length) return;
    const f = τ - i;
    const trackRow = p.轨[i]!;
    const textureName = recording.贴图名[trackRow[9]!];
    if (p.自画网格) {
      if (!p.网格轨 || textureName === undefined) return;
      // 网格轨的刻号是绝对的（从出手算），和 轨 不一定一一对上（render 抛错的那刻没有）
      const absFrame = p.生 + i;
      const j = p.网格轨.findIndex((r) => r[0] === absFrame);
      if (j < 0) return;
      meshes.push({ 名: textureName, blend: drawBlend(p.画法), curRow: p.网格轨[j]!, nextRow: p.网格轨[j + 1]?.[0] === absFrame + 1 ? p.网格轨[j + 1]! : p.网格轨[j]!, f });
      return;
    }
    if (textureName === undefined) return;
    const image = textureMap[textureName];
    if (!image) return;
    const prev = clampedAt(p.轨, i - 1);
    const nextSample = clampedAt(p.轨, i + 1);
    const localPos = computedPath ? interpPathPos(computedPath[k]!, τ) : [lerp(prev[0]!, trackRow[0]!, f), lerp(prev[1]!, trackRow[1]!, f), lerp(prev[2]!, trackRow[2]!, f)];
    const blend = drawBlend(p.画法);
    const cacheKey = `${textureName}|${blend}`;
    let b = batches.get(cacheKey);
    if (!b) batches.set(cacheKey, (b = { 图: image, blend: blend, items: [] }));
    b.items.push(facePatch(place(localPos[0]!, localPos[1]!, localPos[2]!), lerp(trackRow[3]!, nextSample[3]!, f), [trackRow[4]!, trackRow[5]!, trackRow[6]!], undefined, trackRow[7]!, lerp(prev[8]!, trackRow[8]!, f)));
  });
  return (
    <>
      {[...batches.entries()].map(([cacheKey, b]) => (
        <QuadGroup key={cacheKey} image={b.图} items={b.items} blend={b.blend} />
      ))}
      {meshes.map((m, n) => {
        const image = textureMap[m.名];
        return image ? <RecordedMesh key={n} image={image} blend={m.blend} curRow={m.curRow} nextRow={m.nextRow} f={m.f} place={place} /> : null;
      })}
      {withPlaceholders &&
        recording.实体.map((e, n) => {
          if (e.目标) return null;
          const τ = tick - e.生;
          if (τ < 0 || (e.灭 !== null && tick >= e.灭)) return null;
          const i = Math.floor(τ);
          if (i >= e.轨.length) return null;
          const a = clampedAt(e.轨, i - 1);
          const c = clampedAt(e.轨, i);
          const f = τ - i;
          const pos = place(lerp(a[0]!, c[0]!, f), lerp(a[1]!, c[1]!, f), lerp(a[2]!, c[2]!, f));
          return (
            <mesh key={n} position={[pos[0], pos[1], pos[2] + e.高 / 2]}>
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
const RecordedMesh: React.FC<{ image: Png; blend: Blend; curRow: TrackRow; nextRow: TrackRow; f: number; place: ReturnType<typeof placement> }> = ({ image: image, blend: blend, curRow, nextRow, f, place }) => {
  const count = Math.floor((curRow.length - 1) / 9);
  const sameLength = nextRow.length === curRow.length;
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: toTexture(image), vertexColors: true, side: THREE.DoubleSide, alphaTest: blend === '镂空' ? 0.1 : 0.004, ...blendParams(blend) }), [image, blend]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  const positions: number[] = [];
  const uv: number[] = [];
  const colors: number[] = [];
  for (let v = 0; v < count; v++) {
    const o = 1 + v * 9;
    const g = (k: number) => (sameLength ? lerp(curRow[o + k]!, nextRow[o + k]!, f) : curRow[o + k]!);
    positions.push(...place(g(0), g(1), g(2)));
    uv.push(curRow[o + 3]!, curRow[o + 4]!);
    colors.push(s2l(g(5)), s2l(g(6)), s2l(g(7)), g(8));
  }
  const indices: number[] = [];
  for (let q = 0; q + 3 < count; q += 4) indices.push(q, q + 1, q + 2, q, q + 2, q + 3);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setIndex(indices);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};
