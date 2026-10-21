import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { 文本哈希 } from './规则/台词.ts';

const 配音sha = 'b'.repeat(64);
const 带配音 = {
  'assets/registry/配音.toml': ['[["资产"]]', 'id = "配音/7-李樱-五万血"', '"类别" = "配音"', '"来源" = "手工:TTS"', '"许可" = "MIT"', '"可见性" = "公开"'].join('\n'),
  'assets/资产锁.json': JSON.stringify({
    '贴图/甲': { sha256: 'a'.repeat(64), 后缀: '.png', 大小: 3, 库: 'store' },
    '配音/7-李樱-五万血': { sha256: 配音sha, 后缀: '.wav', 大小: 3, 库: 'store' },
  }),
  'content/段/7-甲/段.ts':
    "import { 定义段 } from '../../段定义.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 10, fps: 24, 宽: 4, 高: 4, 地形: [], 声音: [{ 帧: 2, 台词: '7-李樱-五万血' }] });\n",
};
const 台词 = (行: string[]) => ({ 'story/台词.toml': ['[["台词"]]', ...行].join('\n') });

describe('台词', () => {
  it('合规样例放行：cue 引的台词登记了，文本哈希、成品 sha、口型都对得上；备用的标 未用', async () => {
    const 根 = 造仓库(基础(), 带配音, {
      'story/台词.toml': [
        '[["台词"]]',
        'id = "7-李樱-五万血"',
        '"角色" = "李樱"',
        '"文本" = "五万血？"',
        '"配音" = "配音/7-李樱-五万血"',
        `"文本哈希" = "${文本哈希('五万血？')}"`,
        `"成品sha" = "${配音sha.slice(0, 12)}"`,
        `"口型" = { "成品sha" = "${配音sha.slice(0, 12)}" }`,
        '',
        '[["台词"]]',
        'id = "7-九胡-备用"',
        '"角色" = "九胡"',
        '"文本" = "嗯"',
        '"未用" = true',
      ].join('\n'),
    });
    expect((await 跑('台词', 根)).违规).toEqual([]);
  });

  it('文本改了、配音换了、口型过期、没登记、没段用、撞旧名都拦', async () => {
    const 根 = 造仓库(
      基础(),
      带配音,
      {
        'content/段/7-甲/段.ts':
          "import { 定义段 } from '../../段定义.ts';\nexport default 定义段({ 场: '7-场一', 帧数: 10, fps: 24, 宽: 4, 高: 4, 地形: [], 声音: [{ 帧: 2, 台词: '7-李樱-五万血' }, { 帧: 3, 台词: '7-李樱-没登记' }] });\n",
        'docs/旧名.tsv': '类别\t旧名\t新键\t备注\n已删台词\t7-黄叛-受死\t\t\n',
      },
      台词([
        'id = "7-李樱-五万血"',
        '"角色" = "李樱"',
        '"文本" = "五万血！"',
        '"配音" = "配音/7-李樱-五万血"',
        `"文本哈希" = "${文本哈希('五万血？')}"`,
        '"成品sha" = "cccccccccccc"',
        '"口型" = { "成品sha" = "cccccccccccc" }',
        '',
        '[["台词"]]',
        'id = "7-黄叛-受死"',
        '"角色" = "黄叛"',
        '"文本" = "受死"',
      ]),
    );
    const v = (await 跑('台词', 根)).违规.join('\n');
    expect(v).toMatch(/文本哈希 .* 和现在的文本.*对不上：文本改过，配音过期/);
    expect(v).toMatch(/成品sha cccccccccccc 和资产锁里 配音\/7-李樱-五万血 的 bbbbbbbbbbbb 对不上/);
    expect(v).toMatch(/口型 是对着成品 cccccccccccc 做的.*口型 过期/);
    expect(v).toMatch(/7-甲 第 3 帧的台词「7-李樱-没登记」不在 story\/台词.toml 里/);
    expect(v).toMatch(/台词「7-黄叛-受死」没有段用到/);
    expect(v).toMatch(/台词「7-黄叛-受死」 撞了旧名表第 2 行的旧名/);
  });
});
