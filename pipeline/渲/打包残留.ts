// Remotion 的 bundle() 每次在系统临时目录新建一份约 345 MB 的包，用完不删（10-31 查到两天积了 120 GB）。
import fs from 'node:fs';
import path from 'node:path';
import { 登记收尾 } from '../闸/收尾.ts';

const 撤收尾 = new Map<string, () => void>();
export const 登记打包 = (serveUrl: string) => {
  if (!撤收尾.has(serveUrl)) 撤收尾.set(serveUrl, 登记收尾(() => 删打包(serveUrl)));
};

/** 删一次打包的产物。public 里是指向数据根的链接（Windows 是 junction），先单独摘掉，递归删除碰不到数据根 */
export const 删打包 = (serveUrl: string) => {
  if (!path.isAbsolute(serveUrl) || !path.basename(serveUrl).startsWith('remotion-webpack-bundle-')) return;
  const 根 = fs.lstatSync(serveUrl, { throwIfNoEntry: false });
  if (根 && !根.isDirectory()) return;
  const pub = path.join(serveUrl, 'public');
  const public项 = fs.lstatSync(pub, { throwIfNoEntry: false });
  if (public项?.isSymbolicLink()) fs.unlinkSync(pub);
  else if (public项?.isDirectory()) {
    for (const e of fs.readdirSync(pub, { withFileTypes: true })) if (e.isSymbolicLink()) fs.unlinkSync(path.join(pub, e.name));
  }
  fs.rmSync(serveUrl, { recursive: true, force: true });
  撤收尾.get(serveUrl)?.();
  撤收尾.delete(serveUrl);
};
