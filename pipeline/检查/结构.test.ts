import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { 写死了, 分层 } from './规则/结构.ts';

const 两场 = {
  'content/清单.ts': [
    "export const 清单 = [{ 键: '7-甲', 章: 7 }, { 键: '7-乙', 章: 7 }];",
    "export const 段目录 = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice(3)}` : `段/${键}`);",
  ].join('\n'),
  'content/段/7-乙/段.ts': "import { 定义段 } from '../../段定义.ts';\nexport default 定义段({ 场: '7-场二', 帧数: 5, fps: 24, 宽: 4, 高: 4, 地形: [] });\n",
  'content/段/7-乙/画面.tsx': 'export default () => null;\n',
  'content/场/7-场一/末态.ts': 'export const 末态 = { x: 1 };\n',
  'content/场/7-场一/布局.ts': 'export const 布局 = 1;\n',
};

describe('结构', () => {
  it('合规样例放行：段引自己场、场接上一场的 末态.ts、pipeline 引纯模块', async () => {
    const 根 = 造仓库(基础(), 两场, {
      'content/场/7-场二/时间线.ts': "import { 末态 } from '../7-场一/末态.ts';\nexport const 起 = 末态.x;\n",
      'content/段/7-乙/画面.tsx': "import { 起 } from '../../场/7-场二/时间线.ts';\nimport { 例外 } from '../../../engine/core/例外.ts';\nexport default () => <div>{起}{例外('x', 1, { 段: '7-乙', 原因: 'y' })}</div>;\n",
      'pipeline/读.ts': "import { 清单 } from '../content/清单.ts';\nimport 乙 from '../content/段/7-乙/段.ts';\nexport const n = [清单, 乙];\n",
      'world/角色/甲.ts': "import { 例外 } from '../../engine/core/例外.ts';\nexport const 甲 = 例外;\nexport const ns = 'http://www.w3.org/2000/svg';\n",
    });
    expect((await 跑('结构', 根)).违规).toEqual([]);
  });

  it('段互引、反向分层、引核对、场引别的场、pipeline 引画面都拦', async () => {
    const 根 = 造仓库(基础(), 两场, {
      'content/段/7-乙/画面.tsx': "import 甲 from '../7-甲/画面.tsx';\nexport default 甲;\n",
      'engine/core/坏.ts': "import { 甲 } from '../../world/角色/甲.ts';\nexport const 坏 = 甲;\n",
      'world/角色/甲.ts': 'export const 甲 = 1;\n',
      'content/核对/看看/画面.tsx': 'export default () => null;\n',
      'content/段/7-甲/编排.ts': "import 看 from '../../核对/看看/画面.tsx';\nexport default 看;\n",
      'content/场/7-场二/时间线.ts': "import { 布局 } from '../7-场一/布局.ts';\nexport const 起 = 布局;\n",
      'pipeline/读.ts': "import 画 from '../content/段/7-甲/画面.tsx';\nexport const n = 画;\n",
    });
    const v = (await 跑('结构', 根)).违规.join('\n');
    expect(v).toMatch(/段不许引用别的段：content\/段\/7-乙\/画面.tsx → content\/段\/7-甲\/画面.tsx/);
    expect(v).toMatch(/分层方向反了：engine 不能引用 world/);
    expect(v).toMatch(/不许引用 核对\/：content\/段\/7-甲\/编排.ts/);
    expect(v).toMatch(/场只许引用上一场的 末态.ts：content\/场\/7-场二\/时间线.ts → content\/场\/7-场一\/布局.ts/);
    expect(v).toMatch(/pipeline 只许 import 纯模块.*pipeline\/读.ts → content\/段\/7-甲\/画面.tsx/);
  });

  it('纯模块闭包里有 react/remotion、asset: 都拦', async () => {
    const 根 = 造仓库(基础(), {
      'content/段/7-甲/段.ts': "import { 定义段 } from '../../段定义.ts';\nimport { 帧 } from './帮.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 帧, fps: 24, 宽: 4, 高: 4, 地形: [] });\n",
      'content/段/7-甲/帮.ts': "import { interpolate } from 'remotion';\nimport 图 from 'asset:贴图/甲';\nexport const 帧 = 10;\nexport const x = [interpolate, 图];\n",
    });
    const v = (await 跑('结构', 根)).违规.join('\n');
    expect(v).toMatch(/纯模块的闭包里不能有 remotion：content\/段\/7-甲\/段.ts → content\/段\/7-甲\/帮.ts → remotion/);
    expect(v).toMatch(/纯模块的闭包里不能有 asset:/);
  });

  it('getInputProps 只在 设置.ts；渲染代码里的 Math.random、Date.now、写死路径、相对路径资产都拦', async () => {
    const 根 = 造仓库(基础(), {
      'content/设置.ts': "import { getInputProps } from 'remotion';\nexport const 读 = () => getInputProps();\n",
      'content/段/7-甲/画面.tsx': [
        "import { getInputProps } from 'remotion';",
        "import 图 from './图.png';",
        'export const 乱 = Math.random() + Date.now();',
        "export const 路 = '/Users/particle/x.bin';",
        "export const 网 = 'http://192.168.1.5:8080/a';",
        'export default () => <img src={图} title={String(getInputProps())} />;',
      ].join('\n'),
      'content/段/7-甲/图.png': Buffer.from([0x89, 0x50]),
    });
    const v = (await 跑('结构', 根)).违规;
    expect(v.filter((x) => x.includes('getInputProps'))).toHaveLength(2); // import 和调用各一处，设置.ts 不算
    expect(v.join('\n')).toMatch(/画面.tsx:3 渲染代码里不许用 Math.random/);
    expect(v.join('\n')).toMatch(/画面.tsx:3 渲染代码里不许用 Date.now/);
    expect(v.join('\n')).toMatch(/写死的路径："\/Users\/particle\/x.bin"/);
    expect(v.join('\n')).toMatch(/写死的主机或网址/);
    expect(v.join('\n')).toMatch(/资产要写 asset:<id> 引用，不用相对路径：content\/段\/7-甲\/画面.tsx → content\/段\/7-甲\/图.png/);
  });

  it('分层按路径前缀；写死判断', () => {
    expect(分层('content/段/6-斩娜迦/画面.tsx')).toEqual({ 名: '段', 键: '6-斩娜迦' });
    expect(分层('content/设置.ts')).toEqual({ 名: 'content公共' });
    expect(分层('content/注册.tsx')).toEqual({ 名: '注册' });
    expect(写死了('C:\\render\\a.mkv', 'host')).toBe('写死的路径');
    expect(写死了('localhost:3000', 'host')).toBe('写死的主机或网址');
    expect(写死了('http://www.w3.org/2000/svg', 'host')).toBeNull();
    expect(写死了('./a.png', 'host')).toBe('相对路径的资产');
    expect(写死了('暮色放大-1752-扩展', 'host')).toBeNull();
    expect(写死了('my-laptop-01.local', 'my-laptop-01')).toBe('写死的本机名');
  });
});
