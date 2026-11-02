// 用独立 Node 进程走 package exports，避免 Vitest 的解析器把 ESM/CJS 混成同一份而漏报。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 查渲染器入口 } from '../检查/规则/结构.ts';
import { describe, expect, it } from 'vitest';

const 根 = fileURLToPath(new URL('../../', import.meta.url));

describe('渲染器入口', () => {
  it('导出 CJS 的同一份函数，加载即固定实际下载表的混音器', () => {
    const 输出 = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import path from 'node:path';
      import fs from 'node:fs';
      import crypto from 'node:crypto';
      const require = createRequire(import.meta.url);
      const cjs = require('@remotion/renderer');
      const dir = path.dirname(require.resolve('@remotion/renderer'));
      const mixing = require(path.join(dir, 'assets/inline-audio-mixing.js'));
      const original = mixing.makeInlineAudioMixing;
      const renderer = await import('./pipeline/渲/渲染器.ts');
      const entries = Object.entries(renderer);
      assert.ok(entries.length > 0, '统一入口必须有值导出');
      for (const [key, value] of entries) {
        assert.ok(Object.hasOwn(cjs, key), key + ' 必须是 CJS 的值导出');
        assert.equal(value, cjs[key], key + ' 必须是 CJS 同一份值');
      }
      assert.notEqual(mixing.makeInlineAudioMixing, original, '入口必须自动固定混音顺序');
      const fixed = mixing.makeInlineAudioMixing;
      let calls = 0;
      mixing.makeInlineAudioMixing = (...args) => { calls++; return fixed(...args); };
      const {makeDownloadMap, cleanDownloadMap} = require(path.join(dir, 'assets/download-map.js'));
      const map = makeDownloadMap(48000);
      try {
        assert.equal(calls, 1, '下载表必须调用替换后的导出');
        for (const [id, value] of [['甲', 100], ['乙', 200], ['丙', 300]]) {
          map.inlineAudioMixing.addAsset({
            asset: {type: 'inline-audio', id, frame: 5, startInVideo: 5, audio: new Array(3200).fill(value), timestamp: 0, duration: 41666, toneFrequency: 1},
            fps: 24, totalNumberOfFrames: 100, firstFrame: 0, trimLeftOffset: 0, trimRightOffset: 0,
          });
        }
        await map.inlineAudioMixing.finish({binariesDirectory: null, indent: false, logLevel: 'error', cancelSignal: undefined, sampleRate: 48000});
        const hashes = map.inlineAudioMixing.getListOfAssets().map(x => crypto.createHash('sha256').update(fs.readFileSync(x.outName)).digest('hex'));
        assert.equal(hashes.length, 3);
        assert.deepEqual(hashes, [...hashes].sort(), '真实混音项必须按内容排序');
        console.log('全部值导出与 CJS 严格同一 ' + entries.length + '/' + entries.length + '；下载表调用替换工厂 1 次；真实声音 3 条按内容排序');
      } finally { cleanDownloadMap(map); }
    `], { cwd: 根, encoding: 'utf8' });
    expect(输出).toContain('全部值导出与 CJS 严格同一');
  });

  it('pipeline 除统一入口外不直接取渲染器的值，测试 mock 统一入口（与 anim check 共用）', () => {
    const 违规: string[] = [];
    const 扫 = (目录: string) => {
      for (const e of fs.readdirSync(目录, { withFileTypes: true })) {
        const 文件 = path.join(目录, e.name);
        if (e.isDirectory()) { 扫(文件); continue; }
        if (!/\.[cm]?[jt]s$/.test(e.name)) continue;
        const 相对路径 = path.relative(根, 文件).split(path.sep).join('/');
        for (const q of 查渲染器入口(相对路径, fs.readFileSync(文件, 'utf8'))) {
          违规.push(`${相对路径}:${q.行} ${q.文本}`);
        }
      }
    };
    扫(path.join(根, 'pipeline'));
    expect(违规, '值导入必须通过 pipeline/渲/渲染器.ts').toEqual([]);
  });
});
