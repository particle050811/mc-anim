import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { aliasDir } from './pipeline/环境/别名.ts';
import { vitestAssetPlugin } from './pipeline/资产/vitest插件.ts';

export default defineConfig({
  // asset:<id> 按资产锁换成和 webpack 打包后同形状的模块（见 pipeline/资产/vitest插件.ts）
  plugins: [vitestAssetPlugin()],
  // @engine/、@库/（表在 pipeline/环境/别名.ts）
  resolve: { alias: aliasDir(import.meta.dirname ?? path.resolve('.')) },
  test: {
    include: ['pipeline/**/*.test.ts', 'engine/**/*.test.ts', '库/**/*.test.ts', '作品/**/*.test.ts'],
    environment: 'node',
    // 锁的测试起子进程互抢，放宽超时
    testTimeout: 30_000,
  },
});
