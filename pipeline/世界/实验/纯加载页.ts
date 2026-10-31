// 纯加载.ts 的页面端：和 导入地形.ts 同样地分活（同样的并法、三个工人轮流），只取区段，不建网格、不画。结果 POST 回去。
import { sectionInTile, tileFileName, tileHeaderLen, decodeTileHeader } from '../../../engine/voxel/区段包.ts';
import type { 工人消息, 工时 } from '../../../engine/voxel/区段工人池.ts';

const 配置 = (await (await fetch('/配置')).json()) as { 清单: string; 趟: number; 包: { 原点: number[]; 状态: unknown; 群系: unknown } };
const 清单 = 配置.清单.split(',').map((s) => {
  const [L, i, j] = s.split('/').map(Number) as [number, number, number];
  return { L, i, j };
});
const 工人们 = Array.from({ length: 3 }, () => new Worker('/工人.js'));
const 待 = new Map<number, (时: 工时) => void>();
for (const w of 工人们) {
  w.onmessage = (e) => {
    if (e.data.err !== undefined) throw new Error(e.data.err);
    待.get(e.data.id)!(e.data.时);
    待.delete(e.data.id);
  };
  w.postMessage({ type: '来源', ctx: 0, info: 配置.包, cutBoxes: [], flattenAreas: [] } as unknown as 工人消息);
}
let 下号 = 0;
const 一趟 = async () => {
  const 按文件 = new Map<string, { q: (typeof 清单)[number]; slot: number }[]>();
  for (const q of 清单) {
    const { ti, tj, slot } = sectionInTile(q);
    const f = tileFileName(ti, tj);
    if (!按文件.has(f)) 按文件.set(f, []);
    按文件.get(f)!.push({ q, slot });
  }
  await fetch('/快照?名=起', { method: 'POST' });
  const 起 = performance.now();
  const 累: 工时 = { 取: 0, 解压: 0, 解码: 0, 换: 0, 字节: 0, 区段: 0 };
  const 任务: Promise<void>[] = [];
  for (const [f, 项] of 按文件) {
    任务.push(
      (async () => {
        const 头 = decodeTileHeader(new Uint8Array(await (await fetch(`/包/${f}`, { headers: { Range: `bytes=0-${tileHeaderLen - 1}` } })).arrayBuffer()));
        const 段 = 项.map(({ q, slot }) => ({ q, off: 头[2 * slot]!, len: 头[2 * slot + 1]! })).sort((a, b) => a.off - b.off);
        const 活: { start: number; len: number; parts: typeof 段 }[] = [];
        for (const p of 段) {
          const 末 = 活[活.length - 1];
          if (末 && p.off - (末.start + 末.len) <= 16 * 1024 && 末.parts.length < 16 && p.off + p.len - 末.start <= 512 * 1024) {
            末.len = p.off + p.len - 末.start;
            末.parts.push(p);
          } else 活.push({ start: p.off, len: p.len, parts: [p] });
        }
        await Promise.all(
          活.map(
            (a) =>
              new Promise<void>((resolve) => {
                const id = 下号++;
                待.set(id, (时) => {
                  for (const k of Object.keys(累) as (keyof 工时)[]) 累[k] += 时[k];
                  resolve();
                });
                工人们[id % 3]!.postMessage({ type: '取', id, url: new URL(`/包/${f}`, location.href).href, start: a.start, len: a.len, parts: a.parts.map((p) => ({ off: p.off - a.start, len: p.len, ctx: 0, id: { L: p.q.L, i: p.q.i, j: p.q.j } })) } as 工人消息);
              }),
          ),
        );
      })(),
    );
  }
  await Promise.all(任务);
  const 墙钟 = performance.now() - 起;
  await fetch('/快照?名=止', { method: 'POST', body: JSON.stringify({ 墙钟, ...累 }) });
};
for (let n = 0; n < 配置.趟; n++) await 一趟();
await fetch('/完', { method: 'POST' });
