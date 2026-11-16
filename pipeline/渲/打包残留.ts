// Remotion 的 bundle() 每次在系统临时目录新建一份约 345 MB 的包，用完不删（10-31 查到两天积了 120 GB）。
import fs from 'node:fs';
import path from 'node:path';
import { registerCleanup } from '../环境/收尾.ts';

const teardowns = new Map<string, () => void>();
export const registerBundle = (serveUrl: string) => {
  if (!teardowns.has(serveUrl)) teardowns.set(serveUrl, registerCleanup(() => removeBundles(serveUrl)));
};

/** 删一次打包的产物。public 里是指向数据根的链接（Windows 是 junction），先单独摘掉，递归删除碰不到数据根 */
export const removeBundles = (serveUrl: string) => {
  if (!path.isAbsolute(serveUrl) || !path.basename(serveUrl).startsWith('remotion-webpack-bundle-')) return;
  const stat = fs.lstatSync(serveUrl, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory()) return;
  const pub = path.join(serveUrl, 'public');
  const publicEntry = fs.lstatSync(pub, { throwIfNoEntry: false });
  if (publicEntry?.isSymbolicLink()) fs.unlinkSync(pub);
  else if (publicEntry?.isDirectory()) {
    for (const e of fs.readdirSync(pub, { withFileTypes: true })) if (e.isSymbolicLink()) fs.unlinkSync(path.join(pub, e.name));
  }
  fs.rmSync(serveUrl, { recursive: true, force: true });
  teardowns.get(serveUrl)?.();
  teardowns.delete(serveUrl);
};
