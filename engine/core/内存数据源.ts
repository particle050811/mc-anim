// 内存里的数据源：测试用，替掉 vi.mock('../core/数据源.ts')。文件内容照盘上的字节给（.gz 给压过的），字符串按 UTF-8。
// requests 按先后记下每次取的路径（once 不记），测试拿它断言取了几次、什么顺序。engine 下的测试不许 import pipeline，所以放在 engine 里。
import { missingDataError, onceTable, type DataSource } from './数据读取.ts';

const ungzip = (bytes: Uint8Array): Promise<ArrayBuffer> => new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();

export type MemoryDataSource = DataSource & { readonly requests: string[] };

export const memoryDataSource = (files: Record<string, Uint8Array | string>): MemoryDataSource => {
  const requests: string[] = [];
  const read = (rel: string): Uint8Array | null => {
    requests.push(rel);
    const file = files[rel];
    if (file === undefined) return null;
    return typeof file === 'string' ? new TextEncoder().encode(file) : file;
  };
  const must = (rel: string, hint?: string) => {
    const bytes = read(rel);
    if (!bytes) throw missingDataError(rel, 404, hint);
    return bytes;
  };
  const parse = <T>(bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as T;
  return {
    kind: 'memory',
    requests,
    json: async (rel, hint) => parse(must(rel, hint)),
    jsonIfAny: async (rel) => {
      const bytes = read(rel);
      return bytes ? parse(bytes) : null;
    },
    gunzip: async (rel, hint) => ungzip(must(rel, hint)),
    once: onceTable(),
  };
};
