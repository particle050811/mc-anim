// 光体缓存（engine/light/光体缓存读写.ts）的写盘：页面里新算、压好的层挂在 window 上，关页面前收走写进 <数据根>/cache/光体/<作品>/<键哈希>.gz；
// 这一页读中的文件推一下修改时间（超过 1 天才推，同 列段缓存），anim cache gc 按它删久没用的。
// 和求解缓存走同一个关页钩子（求解缓存收集.ts 的 收求解缓存 顺手接上），等写完也是同一个 等求解缓存写完()。
import fs from 'node:fs';
import path from 'node:path';
import { lightCacheDir } from '../环境/配置.ts';

// 一次取多少字节（base64 前）：几十 MB 的文件分块取
const chunkBytes = 8 * 1024 * 1024;
const fileOk = (f: string) => /^[^/\\.][^/\\]*\/[0-9a-f]{16}\.gz$/.test(f);
const dayMs = 24 * 3600 * 1000;

export const collectLightCachePage = async (evaluate: (expression: string) => Promise<string>, dir = lightCacheDir()) => {
  const listText = await evaluate('window.__lightVolumeCacheList ? window.__lightVolumeCacheList() : ""');
  if (typeof listText !== 'string' || !listText) return 0;
  const { files, hits } = JSON.parse(listText) as { files: { file: string; bytes: number }[]; hits: string[] };
  const now = Date.now();
  for (const h of hits) {
    if (!fileOk(h)) continue;
    const f = path.join(dir, ...h.split('/'));
    try {
      if (now - fs.statSync(f).mtimeMs > dayMs) fs.utimesSync(f, new Date(now), new Date(now));
    } catch {
      // 读完到现在被 gc 删了：算了
    }
  }
  let newWrites = 0;
  for (const { file, bytes } of files) {
    if (!fileOk(file)) continue;
    const f = path.join(dir, ...file.split('/'));
    if (fs.existsSync(f)) continue;
    const parts: Buffer[] = [];
    for (let at = 0; at < bytes; at += chunkBytes) parts.push(Buffer.from(await evaluate(`window.__lightVolumeCacheChunk(${JSON.stringify(file)}, ${at}, ${chunkBytes})`), 'base64'));
    const data = Buffer.concat(parts);
    if (data.length !== bytes) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, f);
    newWrites++;
  }
  if (newWrites) console.log(`光体缓存：新写 ${newWrites} 份`);
  return newWrites;
};
