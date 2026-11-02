// 用独立 Node 进程走 package exports，避免 Vitest 的解析器把 ESM/CJS 混成同一份而漏报。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
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
      for (const key of ['renderMedia', 'renderFrames', 'renderStill', 'getCompositions', 'openBrowser']) {
        assert.equal(renderer[key], cjs[key], key + ' 必须是 CJS 同一份函数');
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
        console.log('CJS 同一份函数 5/5；下载表调用替换工厂 1 次；真实声音 3 条按内容排序');
      } finally { cleanDownloadMap(map); }
    `], { cwd: 根, encoding: 'utf8' });
    expect(输出).toContain('CJS 同一份函数 5/5');
  });

  it('pipeline 除统一入口外不直接取 @remotion/renderer 的值（类型可直引）', () => {
    const 违规: string[] = [];
    const 扫 = (目录: string) => {
      for (const e of fs.readdirSync(目录, { withFileTypes: true })) {
        const 文件 = path.join(目录, e.name);
        if (e.isDirectory()) { 扫(文件); continue; }
        if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts') || 文件 === path.join(根, 'pipeline/渲/渲染器.ts')) continue;
        const 源 = ts.createSourceFile(文件, fs.readFileSync(文件, 'utf8'), ts.ScriptTarget.Latest, true);
        const 是包 = (n: ts.Node | undefined) => n && ts.isStringLiteral(n) && (n.text === '@remotion/renderer' || n.text.startsWith('@remotion/renderer/'));
        const 值导入 = (n: ts.ImportDeclaration) => {
          const c = n.importClause;
          if (!c) return true;
          if (c.isTypeOnly) return false;
          return !!c.name || !c.namedBindings || ts.isNamespaceImport(c.namedBindings) || c.namedBindings.elements.length === 0 || c.namedBindings.elements.some(x => !x.isTypeOnly);
        };
        const 看 = (n: ts.Node) => {
          const 违规导入 = ts.isImportDeclaration(n) && 是包(n.moduleSpecifier) && 值导入(n);
          const 违规导出 = ts.isExportDeclaration(n) && 是包(n.moduleSpecifier) && !n.isTypeOnly &&
            (!n.exportClause || !ts.isNamedExports(n.exportClause) || n.exportClause.elements.some(x => !x.isTypeOnly));
          const 违规调用 = ts.isCallExpression(n) && 是包(n.arguments[0]) &&
            !(ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'resolve');
          const 违规别名 = ts.isImportEqualsDeclaration(n) && !n.isTypeOnly && ts.isExternalModuleReference(n.moduleReference) && 是包(n.moduleReference.expression);
          if (违规导入 || 违规导出 || 违规调用 || 违规别名) {
            违规.push(path.relative(根, 文件) + ':' + (源.getLineAndCharacterOfPosition(n.getStart()).line + 1));
          }
          ts.forEachChild(n, 看);
        };
        看(源);
      }
    };
    扫(path.join(根, 'pipeline'));
    expect(违规, '值导入必须通过 pipeline/渲/渲染器.ts').toEqual([]);
  });
});
