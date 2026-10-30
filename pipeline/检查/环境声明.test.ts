import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 基础, 跑, 造仓库, type 文件表 } from './测试夹具.ts';

const 抄 = (...ps: string[]): 文件表 => Object.fromEntries(ps.map((p) => [p, fs.readFileSync(path.join(代码根(), ...p.split('/')), 'utf8')]));
// 环境.ts 和它引的纯模块照仓库里的抄；画法模块只要有 定义画法('<名>'
const 引擎 = (): 文件表 => ({
  ...抄('engine/light/环境.ts', 'engine/core/数学.ts', 'engine/light/维度.ts'),
  'engine/light/画法/主世界.tsx': "export default 定义画法('主世界', () => null);\n",
});
const 声明 = (正文: string): 文件表 => ({
  '作品/应力转动/段/7-甲/环境.ts': `import { 定义环境, 定义环境轨 } from '@engine/light/环境.ts';\nimport { 主世界 } from '@engine/light/维度.ts';\n${正文}\n`,
});
const 基 = "{ 维度: 主世界, 画法: '主世界', 时刻: 6000, 灯光: { 档位: '主世界' }, 雾: { 种类: '无' }, 云: { 种类: '无' } }";

describe('环境声明（加载）', () => {
  it('合法的描述、环境轨放行，环境.ts 算纯模块', async () => {
    const { 违规, 报 } = await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export default 定义环境轨({ 基础: ${基}, 关键帧: [{ 帧: 0, 时刻: 0 }, { 帧: 9, 时刻: 18000 }] });`)));
    expect(违规).toEqual([]);
    expect(报.信息.join('\n')).toMatch(/查了 1 份环境声明，1 份合法/);
  });

  it('时刻、天气写错：没套 定义环境 的字面量也查到', async () => {
    const v = (await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export default { ...${基}, 天气: { 雨: 2, 雷: 0 } };`)))).违规.join('\n');
    expect(v).toMatch(/段\/7-甲\/环境.ts .*天气.雨 = 2/);
  });

  it('档位名、画法名不存在', async () => {
    const 档 = (await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export default { ...${基}, 灯光: { 档位: '傍晚' } };`)))).违规.join('\n');
    expect(档).toMatch(/没有灯光档位「傍晚」/);
    const 画 = (await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export default 定义环境({ ...${基}, 画法: '下界' });`)))).违规.join('\n');
    expect(画).toMatch(/没有画法「下界」/);
    const 名不符 = (await 跑('加载', 造仓库(基础(), 引擎(), { 'engine/light/画法/下界.tsx': "export default 定义画法('主世界', () => null);\n" }, 声明(`export default { ...${基}, 画法: '下界' };`))))
      .违规.join('\n');
    expect(名不符).toMatch(/下界.tsx 里没有 定义画法\('下界'/);
  });

  it('关键帧超出段的帧数、顺序反了', async () => {
    const 越 = (await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export default { 基础: ${基}, 关键帧: [{ 帧: 3, 雨: 1 }, { 帧: 10, 雨: 0 }] };`)))).违规.join('\n');
    expect(越).toMatch(/关键帧 10 不在段里（段.ts 帧数 10）/);
    const 反 = (await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export default { 基础: ${基}, 关键帧: [{ 帧: 5, 雨: 1 }, { 帧: 2, 雨: 0 }] };`)))).违规.join('\n');
    expect(反).toMatch(/从小到大/);
  });

  it('没有 export default', async () => {
    const v = (await 跑('加载', 造仓库(基础(), 引擎(), 声明(`export const 环境 = ${基};`)))).违规.join('\n');
    expect(v).toMatch(/要 export default/);
  });
});
