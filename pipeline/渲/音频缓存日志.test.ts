import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const 改写 = require('./音频缓存日志.cjs') as (源码: string) => string;
const 源码 = fs.readFileSync(path.join(path.dirname(require.resolve('@remotion/media/package.json')), 'dist/esm/index.mjs'), 'utf8');
const 调用 = '      mediaCache.audioManager.logOpenFrames();';
it('只删除锁定版解码之后的诊断调用，取样和混音字节原样留下', () => {
  expect(require('@remotion/media/package.json').version).toBe('4.0.537');
  expect(源码).toContain(`getSamples(segmentStartInSeconds, segmentDurationInSeconds);\n${调用}\n      const segmentAudioData`);
  expect(改写(源码)).toBe(源码.replace(调用, ''));
  expect(() => 改写(改写(源码))).toThrow('恰好命中一次');
  expect(() => 改写(源码 + 源码)).toThrow('恰好命中一次');
});
