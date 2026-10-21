import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pipeline/**/*.test.ts', 'content/**/*.test.ts'],
    environment: 'node',
    // 锁的测试起子进程互抢，放宽超时
    testTimeout: 30_000,
  },
});
