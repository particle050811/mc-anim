// anim check 一次只查一部作品：第二部作品（没有台词、规矩、旧名表的 2D 短片）查它自己，不被 应力转动 的表和违规误报
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CheckContext } from '../源码/上下文.ts';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { runChecks } from './检查.ts';

const segSource = "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ 场: '1-片头', 秒: 24, 宽: 640, 高: 360, 地形: [] });\n";
const example = {
  '作品/示例/清单.ts': "export const manifest = [{ 键: '1-标题', 章: 1 }];\nexport const segDir = (键: string) => `段/${键}`;\n",
  '作品/示例/段/1-标题/段.ts': segSource,
  '作品/示例/段/1-标题/画面.tsx': "export default () => <div style={{ fontSize: 40 }}>标题</div>;\n",
};
/** 应力转动 那边放一处违规：段目录不在清单里 */
const stressRotationBadFiles = { '作品/应力转动/段/7-多余/段.ts': segSource.replace('1-片头', '7-场一') };

describe('按作品查', () => {
  it('没有台词、规矩、旧名表的作品：这几条跳过，不报缺表；应力转动 的违规不算进来', async () => {
    const root = makeRepo(base(), example, stressRotationBadFiles);
    const reports = await runChecks(root, { 作品: '示例', 只: ['structure', 'manifest', 'load', 'lines', 'assets', 'rules'] });
    fs.rmSync(root, { recursive: true, force: true });
    const violations = [...reports].flatMap(([ruleName, r]) => r.violations.map((q) => `${ruleName} ${q.文件 ?? ''} ${q.文本}`));
    expect(violations).toEqual([]);
    expect(reports.get('lines')!.跳过.join()).toMatch(/没有 作品\/示例\/台词.toml/);
    expect(reports.get('rules')!.跳过.join()).toMatch(/没有 作品\/示例\/规矩.toml/);
    expect(reports.get('manifest')!.跳过.join()).toMatch(/没有 作品\/示例\/旧名.tsv/);
  });

  it('查的是所选作品：它自己的违规报出来，应力转动 的不报', async () => {
    const { violations } = await runRule('manifest', makeRepo(base(), example, stressRotationBadFiles, { '作品/示例/段/1-多余/段.ts': segSource }), { 作品: '示例' });
    expect(violations.join('\n')).toMatch(/作品\/示例\/段\/1-多余\/ 不在清单里/);
    expect(violations.join('\n')).not.toMatch(/应力转动/);
  });

  it('同一个仓库查 应力转动 照旧报它的违规', async () => {
    const { violations } = await runRule('manifest', makeRepo(base(), example, stressRotationBadFiles), { 作品: '应力转动' });
    expect(violations.join('\n')).toMatch(/作品\/应力转动\/段\/7-多余\/ 不在清单里/);
  });

  it('用了台词 cue 或 例外 却没有对应的表：报错', async () => {
    const usesLineFiles = { '作品/示例/段/1-标题/段.ts': segSource.replace('地形: []', "地形: [], 声音: [{ 秒: 0, 台词: '1-甲-你好' }]") };
    expect((await runRule('lines', makeRepo(base(), example, usesLineFiles), { 作品: '示例' })).violations.join()).toMatch(/没有 作品\/示例\/台词.toml，1-标题 却有台词 cue/);
    const usingExceptionFiles = { '作品/示例/段/1-标题/停.ts': "import { exception } from '@engine/core/例外.ts';\nexport const 停 = exception('打击停顿', 2, { 段: '1-标题', 原因: '试' });\n" };
    expect((await runRule('rules', makeRepo(base(), example, usingExceptionFiles), { 作品: '示例' })).violations.join()).toMatch(/例外用的规矩「打击停顿」，这部作品却没有 作品\/示例\/规矩.toml/);
  });

  it('别的作品里的 例外 和渲染代码不归这部作品查', async () => {
    const stressRotationExceptionFiles = { '作品/应力转动/段/7-甲/停.ts': "import { exception } from '@engine/core/例外.ts';\nexport const 停 = exception('没有这条', 2, { 段: '7-甲', 原因: '试' });\nexport const 随 = Math.random();\n" };
    expect((await runRule('rules', makeRepo(base(), example, stressRotationExceptionFiles), { 作品: '示例' })).violations).toEqual([]);
    expect((await runRule('structure', makeRepo(base(), example, stressRotationExceptionFiles), { 作品: '示例' })).violations).toEqual([]);
    expect((await runRule('structure', makeRepo(base(), example, stressRotationExceptionFiles), { 作品: '应力转动' })).violations.join()).toMatch(/Math\.random/);
  });

  it('不指定作品、有好几部：给一句清楚的错', () => {
    const root = makeRepo(base(), example);
    const c = new CheckContext(root);
    expect(() => c.workDir).toThrow(/有 2 部作品（.*示例.*），用 --work <名> 指定/);
    expect(new CheckContext(root).文件()).toContain(path.posix.join('作品', '示例', '清单.ts'));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
