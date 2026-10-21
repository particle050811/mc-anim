// 网格工人：在 Web Worker 里跑 区段出网格（见 网格池.ts）。收体素块，回区段网格，类型数组都转交、不拷贝。
import { buildSectionMesh, type SectionMesh } from './网格.ts';
import type { VoxelGrid } from './生成.ts';

const materialKeys = ['实心', '镂空', '实心树叶', '水', '花草'] as const;

self.onmessage = (event: MessageEvent<{ id: number; V: VoxelGrid; 实心树叶: boolean }>) => {
  const { id, V: voxels, 实心树叶: solidLeaves } = event.data;
  const mesh: SectionMesh = buildSectionMesh(voxels, solidLeaves);
  // 同一块缓冲只能转交一次；空的不转交
  const transfers = new Set<ArrayBuffer>();
  for (const k of materialKeys) for (const array of [mesh[k].pos, mesh[k].uv, mesh[k].tex, mesh[k].col]) if (array.byteLength) transfers.add(array.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id, m: mesh }, [...transfers]);
};
