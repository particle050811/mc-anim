// 着色器磁盘缓存跨次留用。Chrome 把编过的着色器程序存在配置目录的 Default/GPUCache；Remotion 每次开浏览器新建一个配置目录、关时删掉
// （open-browser.js 的 mkdtemp、BrowserRunner.js 的 deleteDirectory，没有参数能换），所以新开的浏览器里这份缓存总是空的。
// 单独出一帧时看不出来：系统另有一份 Metal 着色器缓存（`getconf DARWIN_USER_CACHE_DIR` 下的 com.apple.metal/），编过的不再编。
// 但那份按同时活着的进程分片，新进程拿最小的空闲编号（libraries.data、libraries1.data…）：排队等闸的静帧各开着一个浏览器，
// 后开的分到编号大、没编过这些着色器的分片，首帧要现编好几秒（几个 Agent 同时出静帧时就是这样）。GPUCache 里有就不用现编。
// 这里在开浏览器时把数据根 cache/着色器/<浏览器版本>-<gl>/ 里最新的一份克隆进新配置目录，Remotion 删配置目录前再存回一份新的。
// 不让几个浏览器共用一个配置目录：Chrome 一个配置目录只许一个进程用。每份存好就不再改（先写临时名再改名），读到的总是完整的一份；
// 几个进程同时存回，后存的赢，丢掉的条目下次再编。
// 缓存里是编译结果，不是画面：浏览器版本、显卡驱动变了 Chrome 自己作废。ANIM_SHADER_CACHE=0 不读不存（比冷热、排查用）。
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const profilePrefix = 'puppeteer_dev_chrome_profile-';
const snapshotName = /^\d{13}-\d+$/;
// 旧的几份留多久、留几份：别的进程可能正在克隆它（读目录到克隆完不到一秒）
const keepMs = 60_000;
const keepCount = 2;

/** 目录里最新的一份（名字是存的时刻，毫秒，位数一样所以按字典序排）；没有就是 null */
export const latestSnapshot = (storeDir: string): string | null => {
  if (!fs.existsSync(storeDir)) return null;
  const names = fs.readdirSync(storeDir).filter((n) => snapshotName.test(n)).sort();
  return names.length ? path.join(storeDir, names.at(-1)!) : null;
};

/** 把一个配置目录的 GPUCache 存成新的一份，顺手删掉旧的（最新 keepCount 份和 keepMs 以内的留着）。空的不存 */
export const saveSnapshot = (gpuCacheDir: string, storeDir: string, now = Date.now()) => {
  if (!fs.existsSync(gpuCacheDir) || !fs.readdirSync(gpuCacheDir).length) return;
  fs.mkdirSync(storeDir, { recursive: true });
  const name = `${String(now).padStart(13, '0')}-${process.pid}`;
  const tempDir = path.join(storeDir, `.存-${name}`);
  fs.cpSync(gpuCacheDir, tempDir, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
  fs.renameSync(tempDir, path.join(storeDir, name));
  const all = fs.readdirSync(storeDir);
  const kept = new Set(all.filter((n) => snapshotName.test(n)).sort().slice(-keepCount));
  for (const n of all) {
    if (kept.has(n)) continue;
    const p = path.join(storeDir, n);
    if (now - fs.statSync(p).mtimeMs > keepMs) fs.rmSync(p, { recursive: true, force: true });
  }
};

// 接了缓存的配置目录 → 存回哪里
const profiles = new Map<string, string>();
let deleteHooked = false;
/** Remotion 删配置目录前存回（BrowserRunner.js 按属性现取 deleteDirectory，换掉导出就接得上）。同一个目录它会删两次，存过就摘掉 */
const hookDelete = () => {
  if (deleteHooked) return;
  deleteHooked = true;
  const req = createRequire(import.meta.url);
  const del = req(path.join(path.dirname(req.resolve('@remotion/renderer')), 'delete-directory.js')) as { deleteDirectory: (d: string) => void };
  const originalDelete = del.deleteDirectory;
  del.deleteDirectory = (d: string) => {
    const storeDir = profiles.get(d);
    if (storeDir !== undefined) {
      profiles.delete(d);
      try {
        saveSnapshot(path.join(d, 'Default', 'GPUCache'), storeDir);
      } catch {
        // 存不回只是下次再编
      }
    }
    originalDelete(d);
  };
};

/**
 * 开浏览器（open）期间接上：Remotion 新建配置目录时放进最新的一份，删这个配置目录前存回。storeDir 按浏览器版本和 gl 后端分。
 * 放不进、存不回都只是这次没用上缓存，不拦渲染。
 */
export const withShaderCache = async <T>(storeDir: string, open: () => Promise<T>): Promise<T> => {
  if (process.env.ANIM_SHADER_CACHE === '0') return open();
  hookDelete();
  const originalMkdtemp = fs.promises.mkdtemp;
  (fs.promises as { mkdtemp: unknown }).mkdtemp = async (prefix: string, ...rest: unknown[]) => {
    const dir = await (originalMkdtemp as (...a: unknown[]) => Promise<string>)(prefix, ...rest);
    if (!path.basename(prefix).startsWith(profilePrefix)) return dir;
    profiles.set(dir, storeDir);
    const target = path.join(dir, 'Default', 'GPUCache');
    try {
      const latest = latestSnapshot(storeDir);
      if (latest) fs.cpSync(latest, target, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
    } catch {
      // 克隆到一半的不能留给 Chrome
      fs.rmSync(target, { recursive: true, force: true });
    }
    return dir;
  };
  try {
    return await open();
  } finally {
    (fs.promises as { mkdtemp: unknown }).mkdtemp = originalMkdtemp;
  }
};
