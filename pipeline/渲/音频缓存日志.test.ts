import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rewrite = require('./音频缓存日志.cjs') as (source: string) => string;
const source = fs.readFileSync(path.join(path.dirname(require.resolve('@remotion/media/package.json')), 'dist/esm/index.mjs'), 'utf8');
const logOpenFramesCall = '      mediaCache.audioManager.logOpenFrames();';
it('只删除锁定版解码之后的诊断调用，取样和混音字节原样留下', () => {
  expect(require('@remotion/media/package.json').version).toBe('4.0.537');
  expect(source).toContain(`getSamples(segmentStartInSeconds, segmentDurationInSeconds);\n${logOpenFramesCall}\n      const segmentAudioData`);
  expect(rewrite(source)).toBe(source.replace(logOpenFramesCall, ''));
  expect(() => rewrite(rewrite(source))).toThrow('恰好命中一次');
  expect(() => rewrite(source + source)).toThrow('恰好命中一次');
});
