// 远景/地表先补齐，再出网格；只把网格和最终包围盒参数转回主线程，不在工人里创建 three 对象。
import { buildSectionMesh } from './网格.ts';
import { completeOverworldSection, type OverworldContext } from './主世界区段.ts';
import type { MeshJob, MeshReply } from './网格池.ts';

const materialKeys = ['实心', '镂空', '实心树叶', '水', '花草'] as const;
const contexts = new Map<number, OverworldContext>();

self.onmessage = (event: MessageEvent<MeshJob>) => {
  const msg = event.data;
  if (msg.type === '主世界') { contexts.set(msg.ctx, msg.context); return; }
  try {
    let voxels = msg.V;
    if (msg.地表) {
      const context = contexts.get(msg.地表.ctx);
      if (!context) throw new Error(`没有登记主世界来源 ${msg.地表.ctx}`);
      voxels = completeOverworldSection(voxels, msg.地表.section, context);
    }
    const mesh = voxels ? buildSectionMesh(voxels, msg.实心树叶) : null;
    const V = voxels && { 原点: voxels.原点, 格: voxels.格, nz: voxels.nz };
    // 补草可能扩高、补缺列可能下移原点，包围盒必须用补完后的范围。
    const transfers = new Set<ArrayBuffer>();
    if (mesh) for (const k of materialKeys) for (const array of [mesh[k].pos, mesh[k].uv, mesh[k].tex, mesh[k].col]) if (array.byteLength) transfers.add(array.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ id: msg.id, out: { mesh, V } } satisfies MeshReply, [...transfers]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: msg.id, err: String((err as Error)?.stack ?? err) } satisfies MeshReply);
  }
};
