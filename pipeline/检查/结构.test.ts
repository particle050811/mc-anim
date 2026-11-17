import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo, type FileTable } from './测试夹具.ts';
import { hardcodedProblem, layerOf, checkRendererEntry, checkTestPipelineImport } from './规则/结构.ts';

const twoScenes = {
  '作品/应力转动/清单.ts': [
    "export const manifest = [{ key: '7-甲', 章: 7 }, { key: '7-乙', 章: 7 }];",
    "export const segDir = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice(3)}` : `段/${键}`);",
  ].join('\n'),
  '作品/应力转动/段/7-乙/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场二', sec: 5, width: 4, height: 4, terrain: [] });\n",
  '作品/应力转动/段/7-乙/画面.tsx': 'export default () => null;\n',
  '作品/应力转动/场/7-场一/末态.ts': 'export const 末态 = { x: 1 };\n',
  '作品/应力转动/场/7-场一/布局.ts': 'export const 布局 = 1;\n',
};

/** 两部临时作品，段键、场键同名（1-开场、1-场一），只带 engine 里要用的两个文件 */
const twoWorks = (): FileTable => {
  const { 'engine/段/段定义.ts': segmentDefModule, 'engine/段/按时取值.ts': valueAtTime, 'engine/core/例外.ts': exception } = base();
  const fileMap: FileTable = { 'engine/段/段定义.ts': segmentDefModule!, 'engine/段/按时取值.ts': valueAtTime!, 'engine/core/例外.ts': exception! };
  for (const workName of ['夹具甲', '夹具乙']) {
    Object.assign(fileMap, {
      [`作品/${workName}/清单.ts`]: "export const manifest = [{ key: '1-开场', 章: 1 }];\nexport const segDir = (键: string) => `段/${键}`;\n",
      [`作品/${workName}/段/1-开场/段.ts`]: "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '1-场一', sec: 24, width: 4, height: 4, terrain: [] });\n",
      [`作品/${workName}/段/1-开场/画面.tsx`]: 'export default () => null;\n',
      [`作品/${workName}/场/1-场一/末态.ts`]: 'export const 末态 = { x: 1 };\n',
      [`作品/${workName}/角色.ts`]: 'export const 角色 = 1;\n',
    });
  }
  return fileMap;
};

describe('结构', () => {
  it('合规样例放行：段引自己场、场接上一场的 末态.ts、pipeline 引纯模块', async () => {
    const root = makeRepo(base(), twoScenes, {
      '作品/应力转动/场/7-场二/时间线.ts': "import { 末态 } from '../7-场一/末态.ts';\nexport const 起 = 末态.x;\n",
      '作品/应力转动/段/7-乙/画面.tsx': "import { 起 } from '../../场/7-场二/时间线.ts';\nimport { exception } from '@engine/core/例外.ts';\nexport default () => <div>{起}{exception('x', 1, { segment: '7-乙', cause: 'y' })}</div>;\n",
      'pipeline/读.ts': "import { manifest } from '../作品/应力转动/清单.ts';\nimport 乙 from '../作品/应力转动/段/7-乙/段.ts';\nexport const n = [manifest, 乙];\n",
      '库/角色/甲.ts': "import { exception } from '../../engine/core/例外.ts';\nexport const 甲 = exception;\nexport const ns = 'http://www.w3.org/2000/svg';\n",
    });
    expect((await runRule('structure', root)).violations).toEqual([]);
  });

  it('段互引、反向分层、引核对、场引别的场、pipeline 引画面都拦', async () => {
    const root = makeRepo(base(), twoScenes, {
      '作品/应力转动/段/7-乙/画面.tsx': "import 甲 from '../7-甲/画面.tsx';\nexport default 甲;\n",
      'engine/core/坏.ts': "import { 甲 } from '../../库/角色/甲.ts';\nexport const 坏 = 甲;\n",
      '库/角色/甲.ts': 'export const 甲 = 1;\n',
      '作品/应力转动/核对/看看/画面.tsx': 'export default () => null;\n',
      '作品/应力转动/段/7-甲/编排.ts': "import 看 from '../../核对/看看/画面.tsx';\nexport default 看;\n",
      '作品/应力转动/核对/看看/时间线.ts': 'export default 1;\n',
      '作品/应力转动/核对/再看/画面.tsx': "import 看 from '../看看/画面.tsx';\nimport 线 from '../看看/时间线.ts';\nexport default () => [看, 线];\n",
      '作品/应力转动/场/7-场二/时间线.ts': "import { 布局 } from '../7-场一/布局.ts';\nexport const 起 = 布局;\n",
      'pipeline/读.ts': "import 画 from '../作品/应力转动/段/7-甲/画面.tsx';\nexport const n = 画;\n",
    });
    const v = (await runRule('structure', root)).violations.join('\n');
    expect(v).toMatch(/段不许引用别的段：作品\/应力转动\/段\/7-乙\/画面.tsx → 作品\/应力转动\/段\/7-甲\/画面.tsx/);
    expect(v).toMatch(/分层方向反了：engine 不能引用 库/);
    expect(v).toMatch(/不许引用 核对\/：作品\/应力转动\/段\/7-甲\/编排.ts/);
    // 核对段之间只许引别的核对段的 时间线.ts
    expect(v).toMatch(/不许引用 核对\/：作品\/应力转动\/核对\/再看\/画面.tsx → 作品\/应力转动\/核对\/看看\/画面.tsx/);
    expect(v).not.toMatch(/核对\/看看\/时间线.ts/);
    expect(v).toMatch(/场只许引用上一场的 末态.ts：作品\/应力转动\/场\/7-场二\/时间线.ts → 作品\/应力转动\/场\/7-场一\/布局.ts/);
    expect(v).toMatch(/pipeline 只许 import 纯模块.*pipeline\/读.ts → 作品\/应力转动\/段\/7-甲\/画面.tsx/);
  });

  it('有一处打包错误时，别的文件照样收边：段互引、未登记 asset 照报，资产规则不显示通过', async () => {
    const files = {
      '库/坏.ts': "import 没有 from './空.ts';\nexport const 坏 = 没有;\n",
      '库/空.ts': 'export const 空 = 1;\n',
      '作品/应力转动/段/7-乙/画面.tsx': "import 甲 from '../7-甲/画面.tsx';\nimport 图 from 'asset:不存在/某件';\nexport default () => [甲, 图];\n",
    };
    const result = (await runRule('structure', makeRepo(base(), twoScenes, files))).violations.join('\n');
    expect(result).toMatch(/打包失败，依赖图不全：库\/坏.ts:1/);
    expect(result).toMatch(/段不许引用别的段：作品\/应力转动\/段\/7-乙\/画面.tsx → 作品\/应力转动\/段\/7-甲\/画面.tsx/);
    const report = (await runRule('assets', makeRepo(base(), twoScenes, files))).violations.join('\n');
    expect(report).toMatch(/依赖图不全/);
    expect(report).toMatch(/asset:引用的「不存在\/某件」没在资产表登记/);
  });

  it('纯模块闭包里有 react/remotion、asset: 都拦', async () => {
    const root = makeRepo(base(), {
      '作品/应力转动/段/7-甲/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nimport { 帧 } from './帮.ts';\nexport default defineSeg({ scene: '7-场一', sec: 帧, width: 4, height: 4, terrain: [] });\n",
      '作品/应力转动/段/7-甲/帮.ts': "import { interpolate } from 'remotion';\nimport 图 from 'asset:贴图/甲';\nexport const 帧 = 10;\nexport const x = [interpolate, 图];\n",
    });
    const v = (await runRule('structure', root)).violations.join('\n');
    expect(v).toMatch(/纯模块的闭包里不能有 remotion：作品\/应力转动\/段\/7-甲\/段.ts → 作品\/应力转动\/段\/7-甲\/帮.ts → remotion/);
    expect(v).toMatch(/纯模块的闭包里不能有 asset:/);
  });

  it('渲染代码读时刻的 依据（点、下标、解构）要拦，透传和 交界.json 的不拦', async () => {
    const r = await runRule(
      'structure',
      makeRepo(base(), {
        '作品/应力转动/段/7-甲/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场一', sec: 10, width: 4, height: 4, terrain: [] });\n",
        '作品/应力转动/段/7-甲/画面.tsx': [
          "const 表 = { 甲: { 在: { sec: 1 }, basis: '说明' } };",
          "const 传 = { basis: 表.甲.basis ?? '', 又: 1 };",
          'const 传二 = { basis: 表.甲.basis };',
          'export const 字 = 表.甲.basis;',
          "export const 字二 = 表.甲['basis'];",
          'const { basis } = 表.甲;',
          'export default () => <div>{basis}{传.又}{传二.basis ? 1 : 0}</div>;',
          '',
        ].join('\n'),
      }),
    );
    const lineNos = r.violations.filter((x) => x.includes('依据')).map((x) => /画面.tsx:(\d+)/.exec(x)?.[1]);
    expect(lineNos).toEqual(['4', '5', '6', '7']);
  });

  it('渲染代码 import assets/地形版本.json 要拦', async () => {
    const r = await runRule(
      'structure',
      makeRepo(base(), {
        'assets/地形版本.json': JSON.stringify({ pack: {} }),
        '作品/应力转动/段/7-甲/段.ts': "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场一', sec: 10, width: 4, height: 4, terrain: [] });\n",
        '作品/应力转动/段/7-甲/画面.tsx': "import 表 from '../../../../assets/地形版本.json';\nexport default () => <div>{Object.keys(表).length}</div>;\n",
      }),
    );
    expect(r.violations.join('\n')).toMatch(/渲染代码不许 import 地形版本表/);
  });

  it('getInputProps 只在 设置.ts；渲染代码里的 Math.random、Date.now、写死路径、相对路径资产都拦', async () => {
    const root = makeRepo(base(), {
      'engine/段/设置.ts': "import { getInputProps } from 'remotion';\nexport const 读 = () => getInputProps();\n",
      '作品/应力转动/段/7-甲/画面.tsx': [
        "import { getInputProps } from 'remotion';",
        "import 图 from './图.png';",
        'export const 乱 = Math.random() + Date.now();',
        "export const 路 = '/Users/particle/x.bin';",
        "export const 网 = 'http://192.168.1.5:8080/a';",
        "export const 目录 = assetDir({ './键.png': 0 });",
        "export const 藏 = { './混进来.png': 0 };",
        'export default () => <img src={图} title={String(getInputProps())} />;',
      ].join('\n'),
      '作品/应力转动/段/7-甲/图.png': Buffer.from([0x89, 0x50]),
    });
    const v = (await runRule('structure', root)).violations;
    expect(v.filter((x) => x.includes('getInputProps'))).toHaveLength(2); // import 和调用各一处，设置.ts 不算
    expect(v.join('\n')).toMatch(/画面.tsx:3 渲染代码里不许用 Math.random/);
    expect(v.join('\n')).toMatch(/画面.tsx:3 渲染代码里不许用 Date.now/);
    expect(v.join('\n')).toMatch(/写死的路径："\/Users\/particle\/x.bin"/);
    expect(v.join('\n')).toMatch(/写死的主机或网址/);
    expect(v.join('\n')).not.toMatch(/键\.png/); // 资产目录() 的键只是名字
    expect(v.join('\n')).toMatch(/相对路径的资产："\.\/混进来\.png"/);
    expect(v.join('\n')).toMatch(/资产要写 asset:<id> 引用，不用相对路径：作品\/应力转动\/段\/7-甲\/画面.tsx → 作品\/应力转动\/段\/7-甲\/图.png/);
  });

  it('作品引 engine/、库/ 和自己的东西放行，两部作品各查各的', async () => {
    const sharedRefs = {
      '库/角色/路人.ts': "import { exception } from '@engine/core/例外.ts';\nexport const 路人 = exception;\n",
      '作品/夹具甲/段/1-开场/画面.tsx': [
        "import { exception } from '@engine/core/例外.ts';",
        "import { 路人 } from '@库/角色/路人.ts';",
        "import { 路人 as 同一个 } from '../../../../库/角色/路人.ts';",
        "import { 角色 } from '../../角色.ts';",
        "import { 末态 } from '../../场/1-场一/末态.ts';",
        'export default () => <div>{String([exception, 路人, 同一个, 角色, 末态])}</div>;',
      ].join('\n'),
    };
    for (const work of ['夹具甲', '夹具乙']) {
      expect((await runRule('structure', makeRepo(twoWorks(), sharedRefs), { work: work })).violations).toEqual([]);
    }
  });

  it('作品引别的作品一律拦：同名的段、场也拦，不再按段互引、场互引报；两个方向都查', async () => {
    const mutualRefs = {
      '作品/夹具甲/段/1-开场/画面.tsx': "import 乙 from '../../../夹具乙/段/1-开场/画面.tsx';\nexport default 乙;\n",
      '作品/夹具甲/场/1-场一/时间线.ts': "import { 末态 } from '../../../夹具乙/场/1-场一/末态.ts';\nexport const 起 = 末态.x;\n",
      '作品/夹具甲/角色.ts': "import { 角色 } from '../夹具乙/角色.ts';\nexport { 角色 };\n",
      '作品/夹具甲/核对/看看/画面.tsx': "import { 角色 } from '../../../夹具乙/角色.ts';\nexport default () => <div>{角色}</div>;\n",
      '作品/夹具乙/段/1-开场/画面.tsx': "import { 角色 } from '../../../夹具甲/角色.ts';\nexport default () => <div>{角色}</div>;\n",
    };
    const violationText = (await runRule('structure', makeRepo(twoWorks(), mutualRefs), { work: '夹具甲' })).violations.join('\n');
    expect(violationText).toMatch(/作品不许引用别的作品：作品\/夹具甲\/段\/1-开场\/画面.tsx → 作品\/夹具乙\/段\/1-开场\/画面.tsx/);
    expect(violationText).toMatch(/作品不许引用别的作品：作品\/夹具甲\/场\/1-场一\/时间线.ts → 作品\/夹具乙\/场\/1-场一\/末态.ts/);
    expect(violationText).toMatch(/作品不许引用别的作品：作品\/夹具甲\/角色.ts → 作品\/夹具乙\/角色.ts/);
    expect(violationText).toMatch(/作品不许引用别的作品：作品\/夹具甲\/核对\/看看\/画面.tsx → 作品\/夹具乙\/角色.ts/);
    expect(violationText).not.toMatch(/段不许引用别的段|场只许引用上一场/);
    expect(violationText).not.toMatch(/作品\/夹具乙\/段\/1-开场\/画面.tsx →/); // 乙自己的边归查乙时报
    const secondViolations = (await runRule('structure', makeRepo(twoWorks(), mutualRefs), { work: '夹具乙' })).violations.join('\n');
    expect(secondViolations).toMatch(/作品不许引用别的作品：作品\/夹具乙\/段\/1-开场\/画面.tsx → 作品\/夹具甲\/角色.ts/);
  });

  it('分层按路径前缀；写死判断', () => {
    expect(layerOf('作品/应力转动/段/6-斩娜迦/画面.tsx')).toEqual({ name: '段', key: '6-斩娜迦' });
    expect(layerOf('engine/段/设置.ts')).toEqual({ name: 'engine' });
    expect(layerOf('作品/应力转动/默认.ts')).toEqual({ name: '作品公共' });
    expect(layerOf('作品/应力转动/注册.tsx')).toEqual({ name: '注册' });
    expect(hardcodedProblem('C:\\render\\a.mkv', 'host')).toBe('写死的路径');
    expect(hardcodedProblem('localhost:3000', 'host')).toBe('写死的主机或网址');
    expect(hardcodedProblem('http://www.w3.org/2000/svg', 'host')).toBeNull();
    expect(hardcodedProblem('./a.png', 'host')).toBe('相对路径的资产');
    expect(hardcodedProblem('暮色放大-1752-扩展', 'host')).toBeNull();
    expect(hardcodedProblem('my-laptop-01.local', 'my-laptop-01')).toBe('写死的本机名');
  });
});

describe('pipeline 渲染器统一入口', () => {
  const pkg = '@remotion/renderer';
  const esmPath = `${pkg}/dist/esm/index.mjs`;
  const valueImportHint = '值导入必须通过 pipeline/渲/渲染器.ts';

  it('六种代码后缀都检查，动态导入也认无插值模板字面量', () => {
    for (const ext of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
      const issues = checkRendererEntry(`pipeline/绕行.${ext}`, `// 第一行\nconst r = import(\`${pkg}\`);`);
      expect(issues, ext).toEqual([{ 行: 2, text: expect.stringContaining(valueImportHint) }]);
    }
  });

  it('静态值导入、转导出、require 和 import 等号别名都不能绕行，混合类型导入也拦', () => {
    for (const sourceText of [
      `import '${pkg}';`,
      `import {} from '${pkg}';`,
      `import R from '${pkg}';`,
      `import * as R from '${pkg}';`,
      `import { type HeadlessBrowser, renderMedia } from '${pkg}';`,
      `export * from '${pkg}';`,
      `export * as R from '${pkg}';`,
      `export { type HeadlessBrowser, renderMedia as render } from '${pkg}';`,
      `const r = require('${pkg}');`,
      `const r = createRequire(import.meta.url)('${pkg}');`,
      `const r = import('${pkg}/client');`,
      `import R = require('${pkg}');`,
    ]) expect(checkRendererEntry('pipeline/绕行.ts', sourceText), sourceText).toEqual([{ 行: 1, text: expect.stringContaining(valueImportHint) }]);
  });

  it('类型、CJS 路径解析、统一入口及测试取值放行；声明文件不扫', () => {
    for (const sourceText of [
      `import type { HeadlessBrowser } from '${pkg}';`,
      `import { type HeadlessBrowser } from '${pkg}';`,
      `export type { HeadlessBrowser } from '${pkg}';`,
      `export { type HeadlessBrowser } from '${pkg}';`,
      `export type * from '${pkg}';`,
      `type R = typeof import('${pkg}');`,
      `import type R = require('${pkg}');`,
      `const p = require.resolve('${pkg}');`,
    ]) expect(checkRendererEntry('pipeline/类型.ts', sourceText), sourceText).toEqual([]);
    const sourceText = `import * as R from '${pkg}';`;
    for (const file of ['pipeline/渲/渲染器.ts', 'pipeline/合法.test.ts', 'pipeline/声明.d.ts', 'pipeline/声明.d.mts', 'pipeline/声明.d.cts', '库/无关.ts']) {
      expect(checkRendererEntry(file, sourceText), file).toEqual([]);
    }
    expect(checkRendererEntry('pipeline/声明.d.ts', `// ${esmPath}\nconst p = import.meta.resolve('${pkg}');`)).toEqual([]);
  });

  it('文本兜底守相对 ESM 路径和 import.meta.resolve，注释、测试、统一入口也不能藏', () => {
    for (const file of ['pipeline/绕行.ts', 'pipeline/绕行.test.mjs', 'pipeline/渲/渲染器.ts']) {
      for (const quote of ["'", '"', '`']) {
        const sourceText = `// ${esmPath}\nconst p = import.meta.resolve(${quote}${pkg}${quote});`;
        expect(checkRendererEntry(file, sourceText), file).toEqual([
          { 行: 1, text: expect.stringContaining('不许引用 renderer 的 ESM 路径') },
          { 行: 2, text: expect.stringContaining('不许用 import.meta.resolve 解析渲染器') },
        ]);
      }
    }
  });

  it('测试六种后缀的 vi.mock / vi.doMock 必须 mock 统一入口，普通注释和别的 mock 放行', () => {
    for (const ext of ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs']) {
      const file = `pipeline/绕行.test.${ext}`;
      for (const method of ['mock', 'doMock']) {
        for (const quote of ["'", '"', '`']) {
          expect(checkRendererEntry(file, `vi.${method}(${quote}${pkg}${quote}, () => ({}));`)).toEqual([
            { 行: 1, text: expect.stringContaining('测试要 mock 渲染器.ts') },
          ]);
        }
        expect(checkRendererEntry(file, `// vi.${method}('${pkg}')\nvi.${method}('./渲染器.ts');\nvi.${method}('@remotion/media');`)).toEqual([]);
      }
    }
  });

  it('anim check 的结构规则接入相同判定，含新文件、非 ts、测试 mock 和文本兜底', async () => {
    const files: FileTable = {
      'pipeline/绕行.mts': `export const r = import(\`${pkg}\`);`,
      'pipeline/解析.mjs': `export const p = import.meta.resolve('${pkg}');`,
      'pipeline/深路径.cjs': `// ${esmPath}`,
      'pipeline/错误.test.cts': `vi.mock('${pkg}');\nvi.doMock('${pkg}');`,
    };
    const violations = (await runRule('structure', makeRepo(base(), files))).violations;
    expect(violations).toHaveLength(5);
    for (const [p, sourceText] of Object.entries(files)) {
      for (const q of checkRendererEntry(p, String(sourceText))) expect(violations).toContain(`${p}:${q.行} ${q.text}`);
    }
    const validFiles: FileTable = {
      'pipeline/渲/渲染器.ts': `export const r = require('${pkg}');`,
      'pipeline/合法.ts': `export type { HeadlessBrowser } from '${pkg}';`,
      'pipeline/合法.test.ts': `vi.mock('./渲/渲染器.ts');`,
    };
    expect((await runRule('structure', makeRepo(base(), validFiles))).violations).toEqual([]);
  });

  it('engine、库、作品下的测试不许引 pipeline（各种引法都拦，引 engine、库、asset: 和别处的测试放行）', async () => {
    const bad: FileTable = {
      'engine/甲.test.ts': "import { x } from '../pipeline/资产/资产锁.ts';\nexport { y } from '../pipeline/乙.ts';",
      '库/角色/乙.test.ts': "const m = await import('../../pipeline/甲.ts');\nvi.mock('../../pipeline/丙.ts');\ntype T = import('../../pipeline/丁.ts').T;",
      '作品/应力转动/段/7-甲/丙.test.tsx': "import type { T } from '../../../../pipeline/甲.ts';\nimport x = require('../../../../pipeline/乙.ts');",
    };
    expect(checkTestPipelineImport('engine/甲.test.ts', String(bad['engine/甲.test.ts']))).toEqual([
      { 行: 1, text: expect.stringContaining('engine/甲.test.ts → pipeline/资产/资产锁.ts') },
      { 行: 2, text: expect.stringContaining('要引管线就把测试放到 pipeline/ 下') },
    ]);
    expect(checkTestPipelineImport('库/角色/乙.test.ts', String(bad['库/角色/乙.test.ts'])).map((q) => q.行)).toEqual([1, 2, 3]);
    expect(checkTestPipelineImport('作品/应力转动/段/7-甲/丙.test.tsx', String(bad['作品/应力转动/段/7-甲/丙.test.tsx'])).map((q) => q.行)).toEqual([1, 2]);
    const violations = (await runRule('structure', makeRepo(base(), twoScenes, bad))).violations;
    expect(violations.filter((v) => v.includes('不许 import pipeline/'))).toHaveLength(7);

    const fine: FileTable = {
      'engine/乙.test.ts': "// 字节在 pipeline/资产/vitest插件.ts\nimport raw from 'asset:模型/甲';\nimport { a } from './甲.ts';\nimport { b } from '@库/乙.ts';\nconst s = '../pipeline/甲.ts';",
      'pipeline/甲.test.ts': "import { x } from '../engine/甲.ts';\nimport { y } from './乙.ts';",
      '库/丙.ts': "export const s = 'pipeline/甲.ts';",
    };
    for (const [p, sourceText] of Object.entries(fine)) expect(checkTestPipelineImport(p, String(sourceText)), p).toEqual([]);
  });
});
