import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { base, runRule, makeRepo, type FileTable } from './测试夹具.ts';

const readFiles = (...ps: string[]): FileTable => Object.fromEntries(ps.map((p) => [p, fs.readFileSync(path.join(codeRoot(), ...p.split('/')), 'utf8')]));
// 环境.ts 和它引的纯模块照仓库里的抄；画法模块只要有 定义画法('<名>'
const engineFiles = (): FileTable => ({
  ...readFiles('engine/light/环境.ts', 'engine/core/数学.ts', 'engine/light/维度.ts'),
  'engine/light/画法/主世界.tsx': "export default 定义画法('主世界', () => null);\n",
});
const envDeclFile = (body: string): FileTable => ({
  '作品/应力转动/段/7-甲/环境.ts': `import { 定义环境, 定义环境轨 } from '@engine/light/环境.ts';\nimport { 主世界 } from '@engine/light/维度.ts';\n${body}\n`,
});
const baseEnv = "{ 维度: 主世界, 画法: '主世界', 时刻: 6000, 灯光: { 档位: '主世界' }, 雾: { 种类: '无' }, 云: { 种类: '无' } }";

describe('环境声明（加载）', () => {
  it('合法的描述、环境轨放行，环境.ts 算纯模块', async () => {
    const { violations, report } = await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export default 定义环境轨({ 基础: ${baseEnv}, 关键帧: [{ 帧: 0, 时刻: 0 }, { 帧: 9, 时刻: 18000 }] });`)));
    expect(violations).toEqual([]);
    expect(report.infoLines.join('\n')).toMatch(/查了 1 份环境声明，1 份合法/);
  });

  it('时刻、天气写错：没套 定义环境 的字面量也查到', async () => {
    const v = (await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export default { ...${baseEnv}, 天气: { 雨: 2, 雷: 0 } };`)))).violations.join('\n');
    expect(v).toMatch(/段\/7-甲\/环境.ts .*天气.雨 = 2/);
  });

  it('档位名、画法名不存在', async () => {
    const lightTierMessage = (await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export default { ...${baseEnv}, 灯光: { 档位: '傍晚' } };`)))).violations.join('\n');
    expect(lightTierMessage).toMatch(/没有灯光档位「傍晚」/);
    const message = (await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export default 定义环境({ ...${baseEnv}, 画法: '下界' });`)))).violations.join('\n');
    expect(message).toMatch(/没有画法「下界」/);
    const nameMismatch = (await runRule('加载', makeRepo(base(), engineFiles(), { 'engine/light/画法/下界.tsx': "export default 定义画法('主世界', () => null);\n" }, envDeclFile(`export default { ...${baseEnv}, 画法: '下界' };`))))
      .violations.join('\n');
    expect(nameMismatch).toMatch(/下界.tsx 里没有 定义画法\('下界'/);
  });

  it('关键帧超出段的帧数、顺序反了', async () => {
    const outOfRange = (await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export default { 基础: ${baseEnv}, 关键帧: [{ 帧: 3, 雨: 1 }, { 帧: 240, 雨: 0 }] };`)))).violations.join('\n');
    expect(outOfRange).toMatch(/关键帧 240 不在段里（段长 10 秒，一秒 24 帧共 240 帧）/);
    const failureMessage = (await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export default { 基础: ${baseEnv}, 关键帧: [{ 帧: 5, 雨: 1 }, { 帧: 2, 雨: 0 }] };`)))).violations.join('\n');
    expect(failureMessage).toMatch(/从小到大/);
  });

  it('没有 export default', async () => {
    const v = (await runRule('加载', makeRepo(base(), engineFiles(), envDeclFile(`export const 环境 = ${baseEnv};`)))).violations.join('\n');
    expect(v).toMatch(/要 export default/);
  });
});
