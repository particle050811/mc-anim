import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const 改写 = require('./媒体字面量.cjs') as (源码: string) => string;
const 包根 = path.dirname(require.resolve('@remotion/media/package.json'));
const 源码 = fs.readFileSync(path.join(包根, 'dist/esm/index.mjs'), 'utf8');
const 提取 = (源码: string) => {
  const 起 = 源码.indexOf('const { audio, durationInSeconds: assetDurationInSeconds } = result;');
  const 止 = 源码.indexOf('const volume = ', 起);
  return 源码.slice(起, 止);
};
const 参数名 = ['result', 'loopVolumeCurveBehavior', 'loop', 'fps', 'frame', 'startsAt', 'playbackRate', 'trimBefore', 'trimAfter'];
const 函数 = (源码: string) => new Function(...参数名, 'frameForVolumeProp', `${提取(源码)} return volumePropsFrame;`);

describe('音频音量参数的 V8 字面量兼容', () => {
  it('锁定版本的真实 ESM 恰好改音频调用，保留视频调用和其余源码', () => {
    expect(require('@remotion/media/package.json').version).toBe('4.0.537');
    const 修后 = 改写(源码);
    expect(源码.split('const volumePropsFrame = frameForVolumeProp({')).toHaveLength(3);
    expect(修后.split('const volumePropsFrame = frameForVolumeProp({')).toHaveLength(2);
    expect(修后.replace(提取(修后), '«参数»')).toBe(源码.replace(提取(源码), '«参数»'));
  });

  it('整数、小数、未给裁剪和循环的参数值、键序、属性描述符保持不变', () => {
    const 原 = 函数(源码);
    const 修 = 函数(改写(源码));
    for (const f of [0, 1, 7, 13, 14, 27]) {
      for (const 循环 of [undefined, false, true]) {
        for (const 裁剪 of [undefined, 0, 0.08333333333333333 * 24, 0.6766537088842597 * 24]) {
          const 入参 = [{ audio: null, durationInSeconds: 0.9386666666666664 }, undefined, 循环, 24, f, -2, 1.0826459342148156, 裁剪, undefined];
          const 原对象 = 原(...入参, (x: object) => x);
          const 修对象 = 修(...入参, (x: object) => x);
          expect(Object.getPrototypeOf(修对象)).toBe(Object.prototype);
          expect(Object.keys(修对象)).toEqual(Object.keys(原对象));
          expect(Object.getOwnPropertyDescriptors(修对象)).toEqual(Object.getOwnPropertyDescriptors(原对象));
        }
      }
    }
  });

  it('缺失、重复或已打过补丁的输入报错，不让依赖升级静默漏掉兼容', () => {
    expect(() => 改写('')).toThrow('恰好命中一次');
    expect(() => 改写(源码 + 源码)).toThrow('恰好命中一次');
    expect(() => 改写(改写(源码))).toThrow('恰好命中一次');
  });
});
