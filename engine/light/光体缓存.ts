// 光体缓存的格式（用户 11-17 定「按方案一存到缓存里」）：光源、地形是静态的，一层的工人结果（占用格 + 团表，光体工人.ts）只取决于
// 算法代码、地形（包的内容版本、挖框、平整）、minLight 和从最粗到这一层的各层窗口，算一次存盘，别的页面、重渲直接读（读写在 光体缓存读写.ts）。
// 显卡收集（探针图）不存：它占不到一成的时间，照同一份输入现算，换机器、换驱动也不会读到别处显卡算的结果。
// 文件 = gzip(4 字节头长 + 头 JSON（含整份键文本）+ 占用格 + 团表三段 float32，各段按 4 字节对齐)。读出来键文本对不上就当没有，不怕文件名的 64 位哈希撞上。
// 本模块在光体工人的闭包里，格式一改代码层指纹就变，旧文件自然不再命中。
import type { LightLayerData } from './光体.ts';

const MAGIC = 'mc-anim 光体缓存 1';
const align4 = (n: number) => (n + 3) & ~3;
type Head = { magic: string; key: string; occ: number; lights: number; bricks: number; index: number; count: number };

export const encodeLayer = (keyText: string, d: LightLayerData): Uint8Array => {
  const { lights, bricks, index, count } = d.set;
  const head = new TextEncoder().encode(JSON.stringify({ magic: MAGIC, key: keyText, occ: d.occ.length, lights: lights.length, bricks: bricks.length, index: index.length, count } satisfies Head));
  const occAt = align4(4 + head.length);
  let at = align4(occAt + d.occ.length);
  const out = new Uint8Array(at + 4 * (lights.length + bricks.length + index.length));
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  out.set(d.occ, occAt);
  for (const f of [lights, bricks, index]) {
    out.set(new Uint8Array(f.buffer, f.byteOffset, f.byteLength), at);
    at += f.byteLength;
  }
  return out;
};

/** buf 是整份解压后的文件（从 0 开始，float32 视图要 4 字节对齐）；格式、键不对返回 null */
export const decodeLayer = (buf: ArrayBuffer, keyText: string): LightLayerData | null => {
  if (buf.byteLength < 4) return null;
  const headLen = new DataView(buf).getUint32(0, true);
  if (4 + headLen > buf.byteLength) return null;
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen))) as Head;
  if (head.magic !== MAGIC || head.key !== keyText) return null;
  const occAt = align4(4 + headLen);
  const lightsAt = align4(occAt + head.occ);
  const bricksAt = lightsAt + 4 * head.lights;
  const indexAt = bricksAt + 4 * head.bricks;
  if (indexAt + 4 * head.index !== buf.byteLength) return null;
  return {
    occ: new Uint8Array(buf, occAt, head.occ),
    set: { lights: new Float32Array(buf, lightsAt, head.lights), bricks: new Float32Array(buf, bricksAt, head.bricks), index: new Float32Array(buf, indexAt, head.index), count: head.count },
  };
};

export const gzipBytes = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
