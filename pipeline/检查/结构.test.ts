import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库, type 文件表 } from './测试夹具.ts';
import { 写死了, 分层 } from './规则/结构.ts';

const 两场 = {
  '作品/应力转动/清单.ts': [
    "export const 清单 = [{ 键: '7-甲', 章: 7 }, { 键: '7-乙', 章: 7 }];",
    "export const 段目录 = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice(3)}` : `段/${键}`);",
  ].join('\n'),
  '作品/应力转动/段/7-乙/段.ts': "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场二', 帧数: 5, fps: 24, 宽: 4, 高: 4, 地形: [] });\n",
  '作品/应力转动/段/7-乙/画面.tsx': 'export default () => null;\n',
  '作品/应力转动/场/7-场一/末态.ts': 'export const 末态 = { x: 1 };\n',
  '作品/应力转动/场/7-场一/布局.ts': 'export const 布局 = 1;\n',
};

/** 两部临时作品，段键、场键同名（1-开场、1-场一），只带 engine 里要用的两个文件 */
const 两部作品 = (): 文件表 => {
  const { 'engine/段/段定义.ts': 段定义, 'engine/core/例外.ts': 例外 } = 基础();
  const 表: 文件表 = { 'engine/段/段定义.ts': 段定义!, 'engine/core/例外.ts': 例外! };
  for (const 名 of ['夹具甲', '夹具乙']) {
    Object.assign(表, {
      [`作品/${名}/清单.ts`]: "export const 清单 = [{ 键: '1-开场', 章: 1 }];\nexport const 段目录 = (键: string) => `段/${键}`;\n",
      [`作品/${名}/段/1-开场/段.ts`]: "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '1-场一', 帧数: 24, fps: 24, 宽: 4, 高: 4, 地形: [] });\n",
      [`作品/${名}/段/1-开场/画面.tsx`]: 'export default () => null;\n',
      [`作品/${名}/场/1-场一/末态.ts`]: 'export const 末态 = { x: 1 };\n',
      [`作品/${名}/角色.ts`]: 'export const 角色 = 1;\n',
    });
  }
  return 表;
};

describe('结构', () => {
  it('合规样例放行：段引自己场、场接上一场的 末态.ts、pipeline 引纯模块', async () => {
    const 根 = 造仓库(基础(), 两场, {
      '作品/应力转动/场/7-场二/时间线.ts': "import { 末态 } from '../7-场一/末态.ts';\nexport const 起 = 末态.x;\n",
      '作品/应力转动/段/7-乙/画面.tsx': "import { 起 } from '../../场/7-场二/时间线.ts';\nimport { 例外 } from '@engine/core/例外.ts';\nexport default () => <div>{起}{例外('x', 1, { 段: '7-乙', 原因: 'y' })}</div>;\n",
      'pipeline/读.ts': "import { 清单 } from '../作品/应力转动/清单.ts';\nimport 乙 from '../作品/应力转动/段/7-乙/段.ts';\nexport const n = [清单, 乙];\n",
      '库/角色/甲.ts': "import { 例外 } from '../../engine/core/例外.ts';\nexport const 甲 = 例外;\nexport const ns = 'http://www.w3.org/2000/svg';\n",
    });
    expect((await 跑('结构', 根)).违规).toEqual([]);
  });

  it('段互引、反向分层、引核对、场引别的场、pipeline 引画面都拦', async () => {
    const 根 = 造仓库(基础(), 两场, {
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
    const v = (await 跑('结构', 根)).违规.join('\n');
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
    const 文件 = {
      '库/坏.ts': "import 没有 from './空.ts';\nexport const 坏 = 没有;\n",
      '库/空.ts': 'export const 空 = 1;\n',
      '作品/应力转动/段/7-乙/画面.tsx': "import 甲 from '../7-甲/画面.tsx';\nimport 图 from 'asset:不存在/某件';\nexport default () => [甲, 图];\n",
    };
    const 结 = (await 跑('结构', 造仓库(基础(), 两场, 文件))).违规.join('\n');
    expect(结).toMatch(/打包失败，依赖图不全：库\/坏.ts:1/);
    expect(结).toMatch(/段不许引用别的段：作品\/应力转动\/段\/7-乙\/画面.tsx → 作品\/应力转动\/段\/7-甲\/画面.tsx/);
    const 资 = (await 跑('资产', 造仓库(基础(), 两场, 文件))).违规.join('\n');
    expect(资).toMatch(/依赖图不全/);
    expect(资).toMatch(/asset:引用的「不存在\/某件」没在资产表登记/);
  });

  it('纯模块闭包里有 react/remotion、asset: 都拦', async () => {
    const 根 = 造仓库(基础(), {
      '作品/应力转动/段/7-甲/段.ts': "import { 定义段 } from '@engine/段/段定义.ts';\nimport { 帧 } from './帮.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 帧, fps: 24, 宽: 4, 高: 4, 地形: [] });\n",
      '作品/应力转动/段/7-甲/帮.ts': "import { interpolate } from 'remotion';\nimport 图 from 'asset:贴图/甲';\nexport const 帧 = 10;\nexport const x = [interpolate, 图];\n",
    });
    const v = (await 跑('结构', 根)).违规.join('\n');
    expect(v).toMatch(/纯模块的闭包里不能有 remotion：作品\/应力转动\/段\/7-甲\/段.ts → 作品\/应力转动\/段\/7-甲\/帮.ts → remotion/);
    expect(v).toMatch(/纯模块的闭包里不能有 asset:/);
  });

  it('getInputProps 只在 设置.ts；渲染代码里的 Math.random、Date.now、写死路径、相对路径资产都拦', async () => {
    const 根 = 造仓库(基础(), {
      'engine/段/设置.ts': "import { getInputProps } from 'remotion';\nexport const 读 = () => getInputProps();\n",
      '作品/应力转动/段/7-甲/画面.tsx': [
        "import { getInputProps } from 'remotion';",
        "import 图 from './图.png';",
        'export const 乱 = Math.random() + Date.now();',
        "export const 路 = '/Users/particle/x.bin';",
        "export const 网 = 'http://192.168.1.5:8080/a';",
        "export const 目录 = 资产目录({ './键.png': 0 });",
        "export const 藏 = { './混进来.png': 0 };",
        'export default () => <img src={图} title={String(getInputProps())} />;',
      ].join('\n'),
      '作品/应力转动/段/7-甲/图.png': Buffer.from([0x89, 0x50]),
    });
    const v = (await 跑('结构', 根)).违规;
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
    const 引共用 = {
      '库/角色/路人.ts': "import { 例外 } from '@engine/core/例外.ts';\nexport const 路人 = 例外;\n",
      '作品/夹具甲/段/1-开场/画面.tsx': [
        "import { 例外 } from '@engine/core/例外.ts';",
        "import { 路人 } from '@库/角色/路人.ts';",
        "import { 路人 as 同一个 } from '../../../../库/角色/路人.ts';",
        "import { 角色 } from '../../角色.ts';",
        "import { 末态 } from '../../场/1-场一/末态.ts';",
        'export default () => <div>{String([例外, 路人, 同一个, 角色, 末态])}</div>;',
      ].join('\n'),
    };
    for (const 作品 of ['夹具甲', '夹具乙']) {
      expect((await 跑('结构', 造仓库(两部作品(), 引共用), { 作品 })).违规).toEqual([]);
    }
  });

  it('作品引别的作品一律拦：同名的段、场也拦，不再按段互引、场互引报；两个方向都查', async () => {
    const 互引 = {
      '作品/夹具甲/段/1-开场/画面.tsx': "import 乙 from '../../../夹具乙/段/1-开场/画面.tsx';\nexport default 乙;\n",
      '作品/夹具甲/场/1-场一/时间线.ts': "import { 末态 } from '../../../夹具乙/场/1-场一/末态.ts';\nexport const 起 = 末态.x;\n",
      '作品/夹具甲/角色.ts': "import { 角色 } from '../夹具乙/角色.ts';\nexport { 角色 };\n",
      '作品/夹具甲/核对/看看/画面.tsx': "import { 角色 } from '../../../夹具乙/角色.ts';\nexport default () => <div>{角色}</div>;\n",
      '作品/夹具乙/段/1-开场/画面.tsx': "import { 角色 } from '../../../夹具甲/角色.ts';\nexport default () => <div>{角色}</div>;\n",
    };
    const 甲 = (await 跑('结构', 造仓库(两部作品(), 互引), { 作品: '夹具甲' })).违规.join('\n');
    expect(甲).toMatch(/作品不许引用别的作品：作品\/夹具甲\/段\/1-开场\/画面.tsx → 作品\/夹具乙\/段\/1-开场\/画面.tsx/);
    expect(甲).toMatch(/作品不许引用别的作品：作品\/夹具甲\/场\/1-场一\/时间线.ts → 作品\/夹具乙\/场\/1-场一\/末态.ts/);
    expect(甲).toMatch(/作品不许引用别的作品：作品\/夹具甲\/角色.ts → 作品\/夹具乙\/角色.ts/);
    expect(甲).toMatch(/作品不许引用别的作品：作品\/夹具甲\/核对\/看看\/画面.tsx → 作品\/夹具乙\/角色.ts/);
    expect(甲).not.toMatch(/段不许引用别的段|场只许引用上一场/);
    expect(甲).not.toMatch(/作品\/夹具乙\/段\/1-开场\/画面.tsx →/); // 乙自己的边归查乙时报
    const 乙 = (await 跑('结构', 造仓库(两部作品(), 互引), { 作品: '夹具乙' })).违规.join('\n');
    expect(乙).toMatch(/作品不许引用别的作品：作品\/夹具乙\/段\/1-开场\/画面.tsx → 作品\/夹具甲\/角色.ts/);
  });

  it('分层按路径前缀；写死判断', () => {
    expect(分层('作品/应力转动/段/6-斩娜迦/画面.tsx')).toEqual({ 名: '段', 键: '6-斩娜迦' });
    expect(分层('engine/段/设置.ts')).toEqual({ 名: 'engine' });
    expect(分层('作品/应力转动/默认.ts')).toEqual({ 名: '作品公共' });
    expect(分层('作品/应力转动/注册.tsx')).toEqual({ 名: '注册' });
    expect(写死了('C:\\render\\a.mkv', 'host')).toBe('写死的路径');
    expect(写死了('localhost:3000', 'host')).toBe('写死的主机或网址');
    expect(写死了('http://www.w3.org/2000/svg', 'host')).toBeNull();
    expect(写死了('./a.png', 'host')).toBe('相对路径的资产');
    expect(写死了('暮色放大-1752-扩展', 'host')).toBeNull();
    expect(写死了('my-laptop-01.local', 'my-laptop-01')).toBe('写死的本机名');
  });
});
