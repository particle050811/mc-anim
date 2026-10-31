// 实验（不合并）：区段网格硬盘缓存（engine/voxel/网格缓存.ts）的本地服务。一个 bin 文件只追加，idx.json 记每条的偏移和长度；bench 跑完写 idx。
// 另收 ANIM_Z=3 量出来的「哪些面占到过像素」（POST /mask，写 mask.json），离线裁缓存用（scratchpad 的 裁缓存.mjs）。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

export const 开网格缓存服务 = async (dir: string) => {
  fs.mkdirSync(dir, { recursive: true });
  const idxPath = path.join(dir, 'idx.json');
  const binPath = path.join(dir, 'bin');
  const idx: Record<string, [number, number]> = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : {};
  const fd = fs.openSync(binPath, 'a+');
  let size = fs.fstatSync(fd).size;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Private-Network': 'true' };
  const body = (req: http.IncomingMessage) => new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors);
        res.end();
      } else if (url.pathname === '/idx') {
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(idx));
      } else if (url.pathname === '/bin') {
        const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '');
        if (!m) throw new Error('要 Range');
        const start = Number(m[1]), end = Number(m[2]) + 1;
        const buf = Buffer.allocUnsafe(end - start);
        await fs.promises.open(binPath, 'r').then(async (h) => {
          try {
            await h.read(buf, 0, buf.length, start);
          } finally {
            await h.close();
          }
        });
        res.writeHead(206, { ...cors, 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'Content-Range': `bytes ${start}-${end - 1}/${size}` });
        res.end(buf);
      } else if (url.pathname === '/put') {
        const k = url.searchParams.get('k')!;
        const b = await body(req);
        if (!idx[k]) {
          if (b.length) fs.writeSync(fd, b, 0, b.length, size);
          idx[k] = [size, b.length];
          size += b.length;
        }
        res.writeHead(200, cors);
        res.end('ok');
      } else if (url.pathname === '/mask') {
        fs.writeFileSync(path.join(dir, 'mask.json'), await body(req));
        res.writeHead(200, cors);
        res.end('ok');
      } else {
        res.writeHead(404, cors);
        res.end();
      }
    })().catch((err) => {
      res.writeHead(500, cors);
      res.end(String(err));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    关: async () => {
      // 浏览器还留着 keep-alive 连接，不断开 close 永远等不到
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      fs.closeSync(fd);
      fs.writeFileSync(idxPath, JSON.stringify(idx));
    },
  };
};
