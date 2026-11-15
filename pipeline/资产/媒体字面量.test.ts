import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rewrite = require('./媒体字面量.cjs') as (source: string) => string;
const packRoot = path.dirname(require.resolve('@remotion/media/package.json'));
const source = fs.readFileSync(path.join(packRoot, 'dist/esm/index.mjs'), 'utf8');
const extractBody = (source: string) => {
  const startIndex = source.indexOf('const { audio, durationInSeconds: assetDurationInSeconds } = result;');
  const endIndex = source.indexOf('const volume = ', startIndex);
  return source.slice(startIndex, endIndex);
};
const paramNames = ['result', 'loopVolumeCurveBehavior', 'loop', 'fps', 'frame', 'startsAt', 'playbackRate', 'trimBefore', 'trimAfter'];
const compileVolumeProps = (source: string) => new Function(...paramNames, 'frameForVolumeProp', `${extractBody(source)} return volumePropsFrame;`);

describe('音频音量参数的 V8 字面量兼容', () => {
  it('锁定版本的真实 ESM 恰好改音频调用，保留视频调用和其余源码', () => {
    expect(require('@remotion/media/package.json').version).toBe('4.0.537');
    const fixed = rewrite(source);
    expect(source.split('const volumePropsFrame = frameForVolumeProp({')).toHaveLength(3);
    expect(fixed.split('const volumePropsFrame = frameForVolumeProp({')).toHaveLength(2);
    expect(fixed.replace(extractBody(fixed), '«参数»')).toBe(source.replace(extractBody(source), '«参数»'));
  });

  it('整数、小数、未给裁剪和循环的参数值、键序、属性描述符保持不变', () => {
    const compiledFn = compileVolumeProps(source);
    const rewritten = compileVolumeProps(rewrite(source));
    for (const f of [0, 1, 7, 13, 14, 27]) {
      for (const loop of [undefined, false, true]) {
        for (const clipValue of [undefined, 0, 0.08333333333333333 * 24, 0.6766537088842597 * 24]) {
          const args = [{ audio: null, durationInSeconds: 0.9386666666666664 }, undefined, loop, 24, f, -2, 1.0826459342148156, clipValue, undefined];
          const originalLiteral = compiledFn(...args, (x: object) => x);
          const fixedLiteral = rewritten(...args, (x: object) => x);
          expect(Object.getPrototypeOf(fixedLiteral)).toBe(Object.prototype);
          expect(Object.keys(fixedLiteral)).toEqual(Object.keys(originalLiteral));
          expect(Object.getOwnPropertyDescriptors(fixedLiteral)).toEqual(Object.getOwnPropertyDescriptors(originalLiteral));
        }
      }
    }
  });

  it('缺失、重复或已打过补丁的输入报错，不让依赖升级静默漏掉兼容', () => {
    expect(() => rewrite('')).toThrow('恰好命中一次');
    expect(() => rewrite(source + source)).toThrow('恰好命中一次');
    expect(() => rewrite(rewrite(source))).toThrow('恰好命中一次');
  });
});
