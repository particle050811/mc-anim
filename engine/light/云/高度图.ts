// 每团积云的高度图（同 engine/light/大气/云.ts 的 cumulusHeightMap，那边应力转动在用、一行不改，这里抄一份）：
// 积云的平面轮廓只由覆盖噪声定（noise 的 a 通道 > 1 − 覆盖），在 512² 的 a 通道上按阈值找连通的团（四邻接、平铺回绕），每团一个随机高度 0～1（× 高低差）；
// 团外的格子跟最近的团（按格子一圈圈往外扩）。阈值 0.56：再低团就连成一大片（0.53 时最大一团占四分之一）
import * as THREE from 'three';

const HEIGHT_THRESHOLD = 0.56;
let heightMap: { nearest: THREE.DataTexture; smooth: THREE.DataTexture } | null = null;
export const 积云高度图 = (noise: Uint8Array) => {
  if (heightMap) return heightMap;
  const N = 512;
  const parent = new Int32Array(N * N).map((_, i) => i);
  const find = (a: number) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!;
    return a;
  };
  const on = (i: number) => noise[4 * i + 3]! > HEIGHT_THRESHOLD * 255;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!on(i)) continue;
      for (const j of [y * N + ((x + 1) % N), ((y + 1) % N) * N + x]) if (on(j)) parent[find(i)] = find(j);
    }
  const label = new Int32Array(N * N).fill(-1);
  let queue: number[] = [];
  for (let i = 0; i < N * N; i++)
    if (on(i)) {
      label[i] = find(i);
      queue.push(i);
    }
  while (queue.length) {
    const next: number[] = [];
    for (const i of queue) {
      const x = i % N, y = (i - x) / N;
      for (const j of [y * N + ((x + 1) % N), y * N + ((x + N - 1) % N), ((y + 1) % N) * N + x, ((y + N - 1) % N) * N + x])
        if (label[j]! < 0) {
          label[j] = label[i]!;
          next.push(j);
        }
    }
    queue = next;
  }
  const rand = (k: number) => {
    let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = Math.round(255 * rand(label[i]!));
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  const smooth = t.clone();
  smooth.minFilter = smooth.magFilter = THREE.LinearFilter;
  smooth.needsUpdate = true;
  return (heightMap = { nearest: t, smooth });
};
