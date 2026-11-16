// 着色器缓存.ts：存成一份份不再改的目录、取最新的、清旧的；接到 Remotion 新建和删除配置目录的两个点上（不开浏览器，照 Remotion 的调法走一遍）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { latestSnapshot, saveSnapshot, withShaderCache } from './着色器缓存.ts';

const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-着色器缓存-')));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));
afterEach(() => delete process.env.ANIM_SHADER_CACHE);

const makeGpuCache = (name: string, content: string) => {
  const dir = path.join(tempDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index'), content);
  return dir;
};
const req = createRequire(import.meta.url);
// Remotion 关浏览器时调的就是这个模块上的 deleteDirectory（BrowserRunner.js 按属性现取）
const remotionDelete = () => (req(path.join(path.dirname(req.resolve('@remotion/renderer')), 'delete-directory.js')) as { deleteDirectory: (d: string) => void }).deleteDirectory;
// Remotion 新建配置目录的调法（open-browser.js）
const newProfile = () => fs.promises.mkdtemp(path.join(os.tmpdir(), 'puppeteer_dev_chrome_profile-'));

describe('着色器缓存', () => {
  it('存一份取一份：取最新的，空的不存，旧的只留最新两份和一分钟以内的', () => {
    const store = path.join(tempDir, '库甲');
    expect(latestSnapshot(store)).toBeNull();
    saveSnapshot(path.join(tempDir, '没有'), store, 1_700_000_000_000);
    fs.mkdirSync(path.join(tempDir, '空'), { recursive: true });
    saveSnapshot(path.join(tempDir, '空'), store, 1_700_000_000_000);
    expect(latestSnapshot(store)).toBeNull();

    const t0 = Date.now() - 10 * 60_000;
    for (const [i, content] of ['一', '二', '三'].entries()) saveSnapshot(makeGpuCache('缓存', content), store, t0 + i);
    // 这三份刚写的（改动时间是现在），按「现在 = t0 + 2」算都没过期
    expect(fs.readdirSync(store)).toHaveLength(3);
    expect(fs.readFileSync(path.join(latestSnapshot(store)!, 'index'), 'utf8')).toBe('三');
    // 过了一分钟以上再存：留最新两份
    const old = new Date(Date.now() - 5 * 60_000);
    for (const n of fs.readdirSync(store)) fs.utimesSync(path.join(store, n), old, old);
    fs.mkdirSync(path.join(store, '.存-半截'));
    fs.utimesSync(path.join(store, '.存-半截'), old, old);
    saveSnapshot(makeGpuCache('缓存', '四'), store);
    const left = fs.readdirSync(store).sort();
    expect(left).toHaveLength(2);
    expect(left.map((n) => fs.readFileSync(path.join(store, n, 'index'), 'utf8'))).toEqual(['三', '四']);
  });

  it('新建配置目录时放进最新的一份，Remotion 删配置目录前存回', async () => {
    const store = path.join(tempDir, '库乙');
    saveSnapshot(makeGpuCache('缓存乙', '旧条目'), store, Date.now() - 1000);
    const profile = await withShaderCache(store, async () => {
      const other = await fs.promises.mkdtemp(path.join(tempDir, '别的-'));
      expect(fs.existsSync(path.join(other, 'Default'))).toBe(false);
      return newProfile();
    });
    try {
      const gpuCache = path.join(profile, 'Default', 'GPUCache');
      expect(fs.readFileSync(path.join(gpuCache, 'index'), 'utf8')).toBe('旧条目');
      fs.writeFileSync(path.join(gpuCache, 'index'), '旧条目+新条目');
      remotionDelete()(profile);
      expect(fs.existsSync(profile)).toBe(false);
      expect(fs.readFileSync(path.join(latestSnapshot(store)!, 'index'), 'utf8')).toBe('旧条目+新条目');
      // 同一个目录再删一次（Remotion 会这样调）不再存
      const count = fs.readdirSync(store).length;
      remotionDelete()(profile);
      expect(fs.readdirSync(store)).toHaveLength(count);
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });

  it('ANIM_SHADER_CACHE=0 不放也不存', async () => {
    const store = path.join(tempDir, '库丙');
    saveSnapshot(makeGpuCache('缓存丙', '旧条目'), store);
    process.env.ANIM_SHADER_CACHE = '0';
    const profile = await withShaderCache(store, newProfile);
    try {
      expect(fs.existsSync(path.join(profile, 'Default'))).toBe(false);
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });
});
