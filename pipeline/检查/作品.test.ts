// anim check 一次只查一部作品：第二部作品（没有台词、规矩、旧名表的 2D 短片）查它自己，不被 应力转动 的表和违规误报
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 检查上下文 } from './上下文.ts';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { 跑检查 } from './检查.ts';

const 段 = "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '1-片头', 帧数: 24, fps: 24, 宽: 640, 高: 360, 地形: [] });\n";
const 示例 = {
  '作品/示例/清单.ts': "export const 清单 = [{ 键: '1-标题', 章: 1 }];\nexport const 段目录 = (键: string) => `段/${键}`;\n",
  '作品/示例/段/1-标题/段.ts': 段,
  '作品/示例/段/1-标题/画面.tsx': "export default () => <div style={{ fontSize: 40 }}>标题</div>;\n",
};
/** 应力转动 那边放一处违规：段目录不在清单里 */
const 应力转动违规 = { '作品/应力转动/段/7-多余/段.ts': 段.replace('1-片头', '7-场一') };

describe('按作品查', () => {
  it('没有台词、规矩、旧名表的作品：这几条跳过，不报缺表；应力转动 的违规不算进来', async () => {
    const 根 = 造仓库(基础(), 示例, 应力转动违规);
    const 结果 = await 跑检查(根, { 作品: '示例', 只: ['结构', '清单', '加载', '台词', '资产', '规矩'] });
    fs.rmSync(根, { recursive: true, force: true });
    const 违规 = [...结果].flatMap(([名, r]) => r.违规.map((q) => `${名} ${q.文件 ?? ''} ${q.文本}`));
    expect(违规).toEqual([]);
    expect(结果.get('台词')!.跳过.join()).toMatch(/没有 作品\/示例\/台词.toml/);
    expect(结果.get('规矩')!.跳过.join()).toMatch(/没有 作品\/示例\/规矩.toml/);
    expect(结果.get('清单')!.跳过.join()).toMatch(/没有 作品\/示例\/旧名.tsv/);
  });

  it('查的是所选作品：它自己的违规报出来，应力转动 的不报', async () => {
    const { 违规 } = await 跑('清单', 造仓库(基础(), 示例, 应力转动违规, { '作品/示例/段/1-多余/段.ts': 段 }), { 作品: '示例' });
    expect(违规.join('\n')).toMatch(/作品\/示例\/段\/1-多余\/ 不在清单里/);
    expect(违规.join('\n')).not.toMatch(/应力转动/);
  });

  it('同一个仓库查 应力转动 照旧报它的违规', async () => {
    const { 违规 } = await 跑('清单', 造仓库(基础(), 示例, 应力转动违规), { 作品: '应力转动' });
    expect(违规.join('\n')).toMatch(/作品\/应力转动\/段\/7-多余\/ 不在清单里/);
  });

  it('用了台词 cue 或 例外 却没有对应的表：报错', async () => {
    const 用台词 = { '作品/示例/段/1-标题/段.ts': 段.replace('地形: []', "地形: [], 声音: [{ 帧: 0, 台词: '1-甲-你好' }]") };
    expect((await 跑('台词', 造仓库(基础(), 示例, 用台词), { 作品: '示例' })).违规.join()).toMatch(/没有 作品\/示例\/台词.toml，1-标题 却有台词 cue/);
    const 用例外 = { '作品/示例/段/1-标题/停.ts': "import { 例外 } from '@engine/core/例外.ts';\nexport const 停 = 例外('打击停顿', 2, { 段: '1-标题', 原因: '试' });\n" };
    expect((await 跑('规矩', 造仓库(基础(), 示例, 用例外), { 作品: '示例' })).违规.join()).toMatch(/例外用的规矩「打击停顿」，这部作品却没有 作品\/示例\/规矩.toml/);
  });

  it('别的作品里的 例外 和渲染代码不归这部作品查', async () => {
    const 应力转动例外 = { '作品/应力转动/段/7-甲/停.ts': "import { 例外 } from '@engine/core/例外.ts';\nexport const 停 = 例外('没有这条', 2, { 段: '7-甲', 原因: '试' });\nexport const 随 = Math.random();\n" };
    expect((await 跑('规矩', 造仓库(基础(), 示例, 应力转动例外), { 作品: '示例' })).违规).toEqual([]);
    expect((await 跑('结构', 造仓库(基础(), 示例, 应力转动例外), { 作品: '示例' })).违规).toEqual([]);
    expect((await 跑('结构', 造仓库(基础(), 示例, 应力转动例外), { 作品: '应力转动' })).违规.join()).toMatch(/Math\.random/);
  });

  it('不指定作品、有好几部：给一句清楚的错', () => {
    const 根 = 造仓库(基础(), 示例);
    const c = new 检查上下文(根);
    expect(() => c.作品目录).toThrow(/有 2 部作品（.*示例.*），用 --作品 <名> 指定/);
    expect(new 检查上下文(根).文件()).toContain(path.posix.join('作品', '示例', '清单.ts'));
    fs.rmSync(根, { recursive: true, force: true });
  });
});
