import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { textHash } from './规则/台词.ts';
import { writeSentenceText } from '../配音/句模块.ts';
import type { LineSentence } from '../../engine/audio/台词句.ts';

const voiceSha = 'b'.repeat(64);
const withVoice = {
  'assets/registry/配音.toml': ['[["资产"]]', 'id = "配音/7-李樱-五万血"', '"类别" = "配音"', '"来源" = "手工:TTS"', '"许可" = "MIT"', '"可见性" = "公开"'].join('\n'),
  'assets/资产锁.json': JSON.stringify({
    '贴图/甲': { sha256: 'a'.repeat(64), 后缀: '.png', 大小: 3, 库: 'store' },
    '配音/7-李樱-五万血': { sha256: voiceSha, 后缀: '.wav', 大小: 3, 库: 'store' },
  }),
  '作品/应力转动/段/7-甲/段.ts':
    "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 声音: [{ 秒: 2, 台词: '7-李樱-五万血' }] });\n",
};
const linesFile = (lines: string[]) => ({ '作品/应力转动/台词.toml': ['[["台词"]]', ...lines].join('\n') });

describe('台词', () => {
  it('合规样例放行：cue 引的台词登记了，文本哈希、成品 sha、口型都对得上；备用的标 未用', async () => {
    const root = makeRepo(base(), withVoice, {
      '作品/应力转动/台词.toml': [
        '[["台词"]]',
        'id = "7-李樱-五万血"',
        '"角色" = "李樱"',
        '"文本" = "五万血？"',
        '"配音" = "配音/7-李樱-五万血"',
        `"文本哈希" = "${textHash('五万血？')}"`,
        '"开口" = 0.03',
        '"字幕位置" = "思索上"',
        `"成品sha" = "${voiceSha.slice(0, 12)}"`,
        `"口型" = { "成品sha" = "${voiceSha.slice(0, 12)}" }`,
        '',
        '[["台词"]]',
        'id = "7-九胡-备用"',
        '"角色" = "九胡"',
        '"文本" = "嗯"',
        '"未用" = true',
      ].join('\n'),
    });
    expect((await runRule('台词', root)).violations).toEqual([]);
  });

  it('文本改了、配音换了、口型过期、没登记、没段用、撞旧名都拦', async () => {
    const root = makeRepo(
      base(),
      withVoice,
      {
        '作品/应力转动/段/7-甲/段.ts':
          "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 声音: [{ 秒: 2, 台词: '7-李樱-五万血' }, { 秒: 3, 台词: '7-李樱-没登记' }] });\n",
        '作品/应力转动/旧名.tsv': '类别\t旧名\t新键\t备注\n已删台词\t7-黄叛-受死\t\t\n',
      },
      linesFile([
        'id = "7-李樱-五万血"',
        '"角色" = "李樱"',
        '"文本" = "五万血！"',
        '"配音" = "配音/7-李樱-五万血"',
        `"文本哈希" = "${textHash('五万血？')}"`,
        '"成品sha" = "cccccccccccc"',
        '"口型" = { "成品sha" = "cccccccccccc" }',
        '',
        '[["台词"]]',
        'id = "7-黄叛-受死"',
        '"角色" = "黄叛"',
        '"文本" = "受死"',
      ]),
    );
    const v = (await runRule('台词', root)).violations.join('\n');
    expect(v).toMatch(/文本哈希 .* 和现在念的字.*对不上：念的字改过，配音过期/);
    expect(v).toMatch(/成品sha cccccccccccc 和资产锁里 配音\/7-李樱-五万血 的 bbbbbbbbbbbb 对不上/);
    expect(v).toMatch(/口型 是对着成品 cccccccccccc 做的.*口型 过期/);
    expect(v).toMatch(/7-甲 第 3 秒的台词「7-李樱-没登记」不在 作品\/应力转动\/台词.toml 里/);
    expect(v).toMatch(/台词「7-黄叛-受死」没有段用到/);
    expect(v).toMatch(/台词「7-黄叛-受死」 撞了旧名表第 2 行的旧名/);
  });

  it('开口、字幕位置的格式；每句只开口一次，接上段的后半截要接在本段或清单上一段的开口后面', async () => {
    const makeSegSource = (soundsCode: string) => `import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 声音: ${soundsCode} });\n`;
    const makeSentence = (id: string, speaker: string, extraLines: string[] = []) => [
      '[["台词"]]', `id = "${id}"`, `"角色" = "${speaker}"`, '"文本" = "五万血？"', '"配音" = "配音/7-李樱-五万血"',
      `"文本哈希" = "${textHash('五万血？')}"`, `"成品sha" = "${voiceSha.slice(0, 12)}"`, ...extraLines, '',
    ];
    const root = makeRepo(base(), withVoice, {
      '作品/应力转动/清单.ts': [
        "export const 清单 = [{ 键: '7-甲', 章: 7 }, { 键: '7-乙', 章: 7 }, { 键: '7-丙', 章: 7 }];",
        "export const 段目录 = (键: string) => `段/${键}`;",
      ].join('\n'),
      '作品/应力转动/段/7-甲/段.ts': makeSegSource("[{ 秒: 2, 台词: '7-李樱-五万血' }, { 秒: 5, 台词: '7-李樱-五万血', 接上段: true }]"),
      '作品/应力转动/段/7-乙/段.ts': makeSegSource("[{ 秒: 0, 台词: '7-李樱-五万血', 接上段: true }, { 秒: 1, 台词: '7-九胡-两次' }, { 秒: 6, 台词: '7-九胡-两次' }]"),
      '作品/应力转动/段/7-丙/段.ts': makeSegSource("[{ 秒: 0, 台词: '7-李樱-五万血', 接上段: true }, { 秒: 1, 台词: '7-刘心忠-没开口', 接上段: true }]"),
      '作品/应力转动/段/7-乙/画面.tsx': 'export default () => null;\n',
      '作品/应力转动/段/7-丙/画面.tsx': 'export default () => null;\n',
      '作品/应力转动/台词.toml': [
        ...makeSentence('7-李樱-五万血', '李樱', ['"开口" = 0.03']),
        ...makeSentence('7-九胡-两次', '九胡', ['"字幕位置" = "上"']),
        ...makeSentence('7-刘心忠-没开口', '刘心忠', ['"开口" = -1']),
      ].join('\n'),
    });
    const v = (await runRule('台词', root)).violations.join('\n');
    expect(v).not.toMatch(/7-乙 第 0 秒/);
    expect(v).toMatch(/7-丙 第 0 秒的台词「7-李樱-五万血」标了 接上段，本段前面和清单里上一段都没有它开口/);
    expect(v).toMatch(/7-丙 第 1 秒的台词「7-刘心忠-没开口」标了 接上段/);
    expect(v).toMatch(/台词「7-九胡-两次」：字幕位置 只能是 下、思索上/);
    expect(v).toMatch(/台词「7-九胡-两次」：有配音就要写 开口/);
    expect(v).toMatch(/台词「7-九胡-两次」在 7-乙、7-乙 开口了 2 次/);
    expect(v).toMatch(/台词「7-刘心忠-没开口」：开口 是配音文件里第几秒开口/);
    expect(v).toMatch(/台词「7-刘心忠-没开口」没有段用到/);
    expect(v).not.toMatch(/^作品\/应力转动\/台词.toml 台词「7-李樱-五万血」/m);
  });
  it('文本哈希对的是念的字：只改字幕、写 念 = 原来的字的放行；加了不同的 念 就算配音过期', async () => {
    const makeLine = (text: string, spokenText?: string) =>
      linesFile([
        'id = "7-李樱-五万血"', '"角色" = "李樱"', `"文本" = "${text}"`, ...(spokenText ? [`"念" = "${spokenText}"`] : []), '"配音" = "配音/7-李樱-五万血"', '"开口" = 0.03',
        `"文本哈希" = "${textHash('五万血？')}"`, `"成品sha" = "${voiceSha.slice(0, 12)}"`,
      ]);
    const onlySubtitleChange = await runRule('台词', makeRepo(base(), withVoice, makeLine('五万血？！', '五万血？')));
    expect(onlySubtitleChange.violations).toEqual([]);
    const readingChangeMsg = (await runRule('台词', makeRepo(base(), withVoice, makeLine('五万血？', '五万点血？')))).violations.join('\n');
    expect(readingChangeMsg).toMatch(/文本哈希 .* 和现在念的字.*对不上：念的字改过，配音过期/);
  });

  it('有 台词/ 句模块目录的：有配音的每句要有句模块、跟得上表和成品、是工具写的原样，多出来的句模块也拦', async () => {
    const sentence: LineSentence = {
      id: '7-李樱-五万血', 角色: '李樱', 念: '五万血？', 配音: '配音/7-李樱-五万血', 成品sha: voiceSha.slice(0, 12),
      开口: 0.03, 有声长: 0.5, 时长: 0.68, 文件秒数: 0.68, 字: [['五', 0.03, 0.2]], 嘴: [[0, 'X'], [0.03, 'B'], [0.2, 'X']],
    };
    const makeLineTableFile = (lipSha: string) => linesFile([
      'id = "7-李樱-五万血"', '"角色" = "李樱"', '"文本" = "五万血？"', '"配音" = "配音/7-李樱-五万血"', '"开口" = 0.03',
      `"文本哈希" = "${textHash('五万血？')}"`, `"成品sha" = "${voiceSha.slice(0, 12)}"`, `"口型" = { "成品sha" = "${lipSha}" }`,
    ]);
    const cleanRepo = makeRepo(base(), withVoice, makeLineTableFile(voiceSha.slice(0, 12)), { '作品/应力转动/台词/7-李樱-五万血.ts': writeSentenceText(sentence) });
    expect((await runRule('台词', cleanRepo)).violations).toEqual([]);

    const badRepo = makeRepo(base(), withVoice, makeLineTableFile('cccccccccccc'), {
      '作品/应力转动/台词/7-李樱-五万血.ts': writeSentenceText({ ...sentence, 开口: 0.05 }).replace('"有声长": 0.5,', '"有声长": 0.6,'),
      '作品/应力转动/台词/7-李樱-删了.ts': writeSentenceText({ ...sentence, id: '7-李樱-删了' }),
    });
    const v = (await runRule('台词', badRepo)).violations.join('\n');
    expect(v).toMatch(/句模块被手改过/);
    expect(v).toMatch(/句模块的 开口 0.05 和 台词.toml 的 0.03 不同/);
    expect(v).toMatch(/台词\/7-李樱-删了.ts：作品\/应力转动\/台词.toml 里没有这一句/);

    const missingRepo = makeRepo(base(), withVoice, makeLineTableFile(voiceSha.slice(0, 12)), { '作品/应力转动/台词/7-李樱-删了.ts': writeSentenceText({ ...sentence, id: '7-李樱-删了' }) });
    expect((await runRule('台词', missingRepo)).violations.join('\n')).toMatch(/台词「7-李樱-五万血」：没有句模块（anim voice lip）/);
  });
});
