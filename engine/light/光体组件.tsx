// 光体组件：放在世界的组里（组的局部坐标 = 场景坐标），备好各层的占用格、团表（光体工人.ts），在显卡上算探针（光体探针.ts），场景里受光的材质都接上（光体着色.ts）。
// 两种来源：体素地形（`LightVolume`，三层跟着镜头走）和方块网格（`BlockMeshLightVolume`，一层罩住整个网格，光体网格.ts）。
// 跟着镜头走：各层窗口按镜头位置取整（光体.ts 的 lightWindows），取整后的窗口变了才重建，没变的层不重算；窗口只取决于这一帧的镜头，
// 所以跳着渲、单出静帧和连着渲画出来一样。要重建的那一帧用 delayRender 拦住截图，建好挂上重画一次再放行。
// 区段数据经地形的旁路读（导入地形.ts 的 sectionData，记进地形用量），工人那边按区段留着格码，主线程记着它有哪些，超了上限让它丢最久没用的。
// 体素地形各层的工人结果先查光体缓存（光体缓存读写.ts），读到的层不再让工人算；工人新算的顺手存。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import * as THREE from 'three';
import type { ImportedTerrain } from '../voxel/导入地形.ts';
import type { BlockMeshInfo } from '../voxel/方块网格信息.ts';
import { loadBlockMeshBin } from '../voxel/方块网格.tsx';
import { sectionKey, sectionCells } from '../voxel/区段.ts';
import { hash64 } from '../core/求解缓存.ts';
import { cascades, extraCells, lightWindows, windowKey, windowSections, cellOf, type ExtraBlock, type ExtraCell, type LightVolumeParams, type LightWindow } from './光体.ts';
import { meshLightCodes, type MeshGlow } from './光体网格.ts';
import { gatherProbes, occupancyTexture, probeTarget } from './光体探针.ts';
import { lightVolumeUniforms, useLightVolumeOn, wrapLightVolume, LIGHT_LAYERS } from './光体着色.ts';
import { lightCacheSlots, putLightCache, readLightCache } from './光体缓存读写.ts';
import type { LightLayerData, LightWorkerMessage, LightWorkerReply } from './光体工人.ts';

// 着色器按三层写死（各层取光时沿法线挪的半格：2、1、0.5 米）
if (cascades.length !== LIGHT_LAYERS || cascades.some((c, n) => c.L !== LIGHT_LAYERS - 1 - n)) throw new Error('光体：层数、各层的级和 光体着色.ts 对不上');
// 工人那边留的格码总量上限（字节）：一个区段 64 × 64 × 层高 字节
const maxWorkerBytes = 192 * 1024 * 1024;
// 细层往粗层渐变的宽度（米）
const blendM = 8;

let worker: Worker | null = null;
const pending = new Map<number, (r: LightWorkerReply) => void>();
let nextId = 0;
const openWorker = () => {
  if (worker) return worker;
  const w = new Worker(new URL('./光体工人.ts', import.meta.url));
  w.onmessage = (e: MessageEvent<LightWorkerReply>) => {
    const done = pending.get(e.data.id);
    pending.delete(e.data.id);
    done?.(e.data);
  };
  w.onerror = (e) => cancelRender(new Error(`光体工人：${e.message}`));
  worker = w;
  return w;
};
const ask = async (msg: Extract<LightWorkerMessage, { id: number }>) => {
  const reply = await new Promise<LightWorkerReply>((resolve) => {
    pending.set(msg.id, resolve);
    openWorker().postMessage(msg);
  });
  if (reply.err) throw new Error(`光体工人：${reply.err}`);
  return reply;
};
// 来源（地形对象）→ 工人里的号
const contexts = new WeakMap<ImportedTerrain, number>();
let nextCtx = 0;
const contextOf = (t: ImportedTerrain) => {
  let ctx = contexts.get(t);
  if (ctx === undefined) {
    contexts.set(t, (ctx = nextCtx++));
    openWorker().postMessage({ type: '来源', ctx, ...t.voxelContext } satisfies LightWorkerMessage);
  }
  return ctx;
};
// 工人那边有哪些区段的格码（来源|区段键 → 字节、最近一次用到），按最近用到挤
const held = new Map<string, { bytes: number; used: number }>();
let heldBytes = 0;
let clock = 0;

const terrainLayers = async (t: ImportedTerrain, allWindows: LightWindow[], keys: string[], need: boolean[], minLight: number, extra: { cells: ExtraCell[]; key: string }) => {
  const out: (LightLayerData | null)[] = allWindows.map(() => null);
  const slots = lightCacheSlots(t, keys);
  const toBuild = [...need];
  if (slots) {
    const got = await Promise.all(need.map((n, i) => (n ? readLightCache(slots[i]!) : null)));
    got.forEach((d, i) => {
      if (!d) return;
      out[i] = d;
      toBuild[i] = false;
    });
    // 一层的结果用到它和比它粗的各层的区段
    const lastHit = got.findLastIndex((d) => d !== null);
    if (lastHit >= 0) t.noteSections(allWindows.slice(0, lastHit + 1).flatMap((w) => windowSections(w)));
  }
  // 工人只要算到最后一个没读到的层（细层的团表要比它粗的各层，粗层读到了也照样拼它的格码）
  const last = toBuild.lastIndexOf(true);
  if (last < 0) return out;
  const windows = allWindows.slice(0, last + 1);
  const ctx = contextOf(t);
  const stamp = ++clock;
  const ids = windows.flatMap((w) => windowSections(w));
  const missing = ids.filter((q) => !held.has(`${ctx}|${sectionKey(q)}`));
  for (const q of ids) {
    const h = held.get(`${ctx}|${sectionKey(q)}`);
    if (h) h.used = stamp;
  }
  const data = missing.length ? await t.sectionData(missing) : [];
  const sections: { data: NonNullable<(typeof data)[number]> }[] = [];
  missing.forEach((q, n) => {
    const d = data[n];
    const w = windows.find((x) => x.L === q.L)!;
    const bytes = sectionCells * sectionCells * w.D;
    held.set(`${ctx}|${sectionKey(q)}`, { bytes, used: stamp });
    heldBytes += bytes;
    if (d) sections.push({ data: d });
  });
  const drop: string[] = [];
  if (heldBytes > maxWorkerBytes)
    for (const [k, h] of [...held].sort((a, b) => a[1].used - b[1].used)) {
      if (heldBytes <= maxWorkerBytes * 0.8 || h.used === stamp) break;
      held.delete(k);
      heldBytes -= h.bytes;
      drop.push(k);
    }
  const cacheKeys = windows.map((_, i) => (slots && toBuild[i] ? slots[i]!.key : null));
  const reply = await ask({ type: '建', id: nextId++, ctx, minLight, windows, need: toBuild.slice(0, last + 1), sections, drop, cacheKeys, extra: extra.cells, extraKey: extra.key });
  reply.layers.forEach((d, i) => {
    if (d) out[i] = d;
  });
  reply.cache?.forEach((gz, i) => {
    if (gz && slots) putLightCache(slots[i]!.file, gz);
  });
  return out;
};

// 一层挂着的：键、窗口、占用格、探针图
type Layer = { key: string; w: LightWindow; occ: THREE.Data3DTexture; probes: THREE.WebGLRenderTarget };
type Want = { windows: LightWindow[]; keys: string[] };

/**
 * 两种来源共用：want 是这一帧要的各层（从粗到细，键里带上比它粗的各层），fetch 给出要重建的那几层的数据（可以改 want.windows，网格取回来才知道窗口）。
 * 返回挂光体用的组（放在场景坐标的组里）
 */
const useLightVolume = (params: LightVolumeParams | undefined, want: Want | null, fetch: (want: Want, need: boolean[]) => Promise<(LightLayerData | null)[]>) => {
  useLightVolumeOn(Boolean(params));
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const anchor = useRef<THREE.Group>(null);
  const shown = useRef<(Layer | null)[]>([]);
  const wanted = useRef<Want | null>(null);
  const building = useRef(false);
  const handle = useRef<number | null>(null);
  const [, redraw] = useState(0);

  wanted.current = params ? want : null;
  const stale = wanted.current !== null && wanted.current.keys.some((k, n) => k !== shown.current[n]?.key);
  if (stale && handle.current === null) handle.current = delayRender(`光体：建 ${want!.keys.join(' ')}`, { timeoutInMilliseconds: 10 * 60 * 1000 });

  useEffect(() => {
    if (!stale || building.current || !params) return;
    building.current = true;
    (async () => {
      // 建的时候镜头又挪了（Studio 里拖时间轴）：建完回头看要的变没变，变了接着建
      for (;;) {
        const w = wanted.current;
        if (!w) break;
        const need = w.keys.map((k, n) => k !== shown.current[n]?.key);
        if (!need.includes(true)) break;
        const data = await fetch(w, need);
        const next = shown.current.slice(0, w.windows.length);
        // 先换占用格（细层的探针要用粗层的），再从粗到细算探针
        data.forEach((d, n) => {
          if (!d) return;
          const win = w.windows[n]!;
          const old = next[n];
          old?.occ.dispose();
          const sameSize = old && old.w.W === win.W && old.w.H === win.H && old.w.D === win.D;
          if (old && !sameSize) old.probes.dispose();
          next[n] = { key: w.keys[n]!, w: win, occ: occupancyTexture(win, d.occ), probes: old && sameSize ? old.probes : probeTarget(win) };
        });
        for (let n = 0; n < data.length; n++) {
          const d = data[n];
          if (!d) continue;
          const occs = next.slice(0, n + 1).reverse().map((l) => ({ w: l!.w, tex: l!.occ }));
          await gatherProbes(gl, next[n]!.w, occs, d.set, next[n]!.probes, params.minLight);
        }
        shown.current = next;
      }
      building.current = false;
      redraw((v) => v + 1);
    })().catch((e) => cancelRender(e));
  });
  // 建好了、这一帧要的都挂上了：重画一次再放行
  useEffect(() => {
    if (stale || handle.current === null || building.current) return;
    advance(performance.now());
    continueRender(handle.current);
    handle.current = null;
  });
  useEffect(
    () => () => {
      for (const l of shown.current) {
        l?.occ.dispose();
        l?.probes.dispose();
      }
      if (handle.current !== null) continueRender(handle.current);
    },
    [],
  );

  useFrame(() => {
    const k = lightVolumeUniforms.lightVolK.value;
    const layers = shown.current;
    if (!params || !anchor.current || !layers.length || layers.some((l) => !l)) {
      k.x = 0;
      return;
    }
    // 场景里受光的材质都套上（人物、模型、方块网格；体素材质自己接了）。新套的要重编，所以每帧扫：组件换材质、新挂上的物体都接得上
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (!mat) return;
      if (Array.isArray(mat)) for (const m of mat) wrapLightVolume(m);
      else wrapLightVolume(mat as THREE.Material);
    });
    const u = lightVolumeUniforms;
    // 着色器的第 s 槽（0 最细）放第几层：三层的从细到粗；只有一层（方块网格）三槽都放它
    const S = [u.lightVolS0, u.lightVolS1, u.lightVolS2];
    const V = [u.lightVolV0, u.lightVolV1, u.lightVolV2];
    for (let s = 0; s < LIGHT_LAYERS; s++) {
      const l = layers[Math.max(0, layers.length - 1 - s)]!;
      const cell = cellOf(l.w);
      // 同一个标签页里几块画布共用这份 uniform：每块画布画之前写自己的
      S[s]!.value = l.probes.textures[0]!;
      V[s]!.value = l.probes.textures[1]!;
      u.lightVolMin.value[s]!.set(l.w.x0, l.w.y0, l.w.z0);
      u.lightVolSize.value[s]!.set(l.w.W * cell, l.w.H * cell, l.w.D * cell);
      u.lightVolDims.value[s]!.set(l.w.W, l.w.H, l.w.D);
    }
    camera.updateMatrixWorld();
    anchor.current.updateMatrixWorld();
    u.lightVolView.value.copy(anchor.current.matrixWorld).invert().multiply(camera.matrixWorld);
    k.set(params.strength, params.knee, blendM);
  });
  return anchor;
};

const noExtra: readonly ExtraBlock[] = [];
/**
 * 体素地形的光体：t 地形，center 镜头位置（场景坐标），heightRange 场景 z 的范围，params 光体参数（不给 = 不开）；
 * extraBlocks 地形外另摆的方块（模型画的发光、挡光方块，光体.ts 的 ExtraBlock），要是模块级常量。不给时层键、缓存都和没有这一项时一样
 */
export const LightVolume: React.FC<{ t: ImportedTerrain | null; center: readonly number[]; heightRange: readonly [number, number]; params: LightVolumeParams | undefined; extraBlocks?: readonly ExtraBlock[] }> = ({ t, center, heightRange, params, extraBlocks = noExtra }) => {
  const extra = useMemo(() => {
    const cells = extraCells(extraBlocks);
    return { cells, key: cells.length ? `另摆${hash64(JSON.stringify(cells))}` : '' };
  }, [extraBlocks]);
  let want: Want | null = null;
  if (params && t) {
    // 层键带上参数、另摆的方块和比它粗的各层（团表、探针要用粗层）
    const windows = lightWindows(center, heightRange);
    let chain = extra.key ? `${params.minLight}|${extra.key}` : `${params.minLight}`;
    want = { windows, keys: windows.map((w) => (chain += `|${windowKey(w)}`)) };
  }
  const anchor = useLightVolume(params, want, (w, need) => terrainLayers(t!, w.windows, w.keys, need, params!.minLight, extra));
  return <group ref={anchor} />;
};

/** 方块网格的光体：和 BlockMesh 放在同一个组里（同一套坐标），info、bin 同 BlockMesh；glow 定哪些方块发光、多亮（不给照方块发光表） */
export const BlockMeshLightVolume: React.FC<{ info: BlockMeshInfo; bin: string; params: LightVolumeParams | undefined; glow?: MeshGlow }> = ({ info, bin, params, glow }) => {
  // 窗口要等网格取回来才知道：键只看 bin 和参数，取回来以后 fetch 填上窗口
  const want: Want | null = params ? { windows: [{ L: 0, x0: 0, y0: 0, z0: 0, W: 1, H: 1, D: 1 }], keys: [`网格|${bin}|${params.minLight}`] } : null;
  const anchor = useLightVolume(params, want, async (w) => {
    const layer = meshLightCodes(info, await loadBlockMeshBin(bin), glow);
    w.windows[0] = layer.w;
    return (await ask({ type: '网格', id: nextId++, layer, minLight: params!.minLight })).layers;
  });
  return <group ref={anchor} />;
};
