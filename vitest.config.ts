import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { 别名目录 } from './pipeline/环境/别名.ts';

export default defineConfig({
  // @engine/、@库/（表在 pipeline/环境/别名.ts）
  resolve: { alias: 别名目录(import.meta.dirname ?? path.resolve('.')) },
  test: {
    include: ['pipeline/**/*.test.ts', 'content/**/*.test.ts'],
    environment: 'node',
    // 锁的测试起子进程互抢，放宽超时
    testTimeout: 30_000,
  },
});
