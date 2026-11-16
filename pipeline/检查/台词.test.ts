import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { textHash } from './规则/台词.ts';
import { writeSentenceText } from '../配音/句模块.ts';
import type { LineSentence } from '../../engine/audio/台词句.ts';

const voiceSha = 'b'.repeat(64);
const withVoice = {
  'assets/registry/配音.toml': ['[["asset"]]', 'id = "配音/7-李樱-五万血"', '"category" = "配音"', '"source" = "手工:TTS"', '"license" = "MIT"', '"visibility" = "公开"'].join('\n'),
  'assets/资产锁.json': JSON.stringify({
    '贴图/甲': { sha256: 'a'.repeat(64), suffix: '.png', size: 3, lib: 'store' },
    '配音/7-李樱-五万血': { sha256: voiceSha, suffix: '.wav', size: 3, lib: 'store' },
  }),
  '作品/应力转动/段/7-甲/段.ts':
    "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场一', sec: 10, width: 4, height: 4, terrain: [], sound: [{ sec: 2, lines: '7-李樱-五万血' }] });\n",
};
const linesFile = (lines: string[]) => ({ '作品/应力转动/台词.toml': ['[["lines"]]', ...lines].join('\n') });

describe('台词', () => {
  it('合规样例放行：cue 引的台词登记了，文本哈希、成品 sha、口型都对得上；备用的标 未用', async () => {
    const root = makeRepo(base(), withVoice, {
      '作品/应力转动/台词.toml': [
        '[["lines"]]',
        'id = "7-李樱-五万血"',
        '"character" = "李樱"',
        '"text" = "五万血？"',
        '"voice" = "配音/7-李樱-五万血"',
        `"textHash" = "${textHash('五万血？')}"`,
        '"mouthOpen" = 0.03',
        '"subtitlePosition" = "思索上"',
        `"finishedSha" = "${voiceSha.slice(0, 12)}"`,
        `"lip" = { "finishedSha" = "${voiceSha.slice(0, 12)}" }`,
        '',
        '[["lines"]]',
        'id = "7-九胡-备用"',
        '"character" = "九胡"',
        '"text" = "嗯"',
        '"未用" = true',
      ].join('\n'),
    });
    expect((await runRule('lines', root)).violations).toEqual([]);
  });

  it('文本改了、配音换了、口型过期、没登记、没段用、撞旧名都拦', async () => {
    const root = makeRepo(
      base(),
      withVoice,
      {
        '作品/应力转动/段/7-甲/段.ts':
          "import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场一', sec: 10, width: 4, height: 4, terrain: [], sound: [{ sec: 2, lines: '7-李樱-五万血' }, { sec: 3, lines: '7-李樱-没登记' }] });\n",
        '作品/应力转动/旧名.tsv': '类别\t旧名\t新键\t备注\n已删台词\t7-黄叛-受死\t\t\n',
      },
      linesFile([
        'id = "7-李樱-五万血"',
        '"character" = "李樱"',
        '"text" = "五万血！"',
        '"voice" = "配音/7-李樱-五万血"',
        `"textHash" = "${textHash('五万血？')}"`,
        '"finishedSha" = "cccccccccccc"',
        '"lip" = { "finishedSha" = "cccccccccccc" }',
        '',
        '[["lines"]]',
        'id = "7-黄叛-受死"',
        '"character" = "黄叛"',
        '"text" = "受死"',
      ]),
    );
    const v = (await runRule('lines', root)).violations.join('\n');
    expect(v).toMatch(/文本哈希 .* 和现在念的字.*对不上：念的字改过，配音过期/);
    expect(v).toMatch(/成品sha cccccccccccc 和资产锁里 配音\/7-李樱-五万血 的 bbbbbbbbbbbb 对不上/);
    expect(v).toMatch(/口型 是对着成品 cccccccccccc 做的.*口型 过期/);
    expect(v).toMatch(/7-甲 第 3 秒的台词「7-李樱-没登记」不在 作品\/应力转动\/台词.toml 里/);
    expect(v).toMatch(/台词「7-黄叛-受死」没有段用到/);
    expect(v).toMatch(/台词「7-黄叛-受死」 撞了旧名表第 2 行的旧名/);
  });

  it('开口、字幕位置的格式；每句只开口一次，接上段的后半截要接在本段或清单上一段的开口后面', async () => {
    const makeSegSource = (soundsCode: string) => `import { defineSeg } from '@engine/段/段定义.ts';\nexport default defineSeg({ scene: '7-场一', sec: 10, width: 4, height: 4, terrain: [], sound: ${soundsCode} });\n`;
    const makeSentence = (id: string, speaker: string, extraLines: string[] = []) => [
      '[["lines"]]', `id = "${id}"`, `"character" = "${speaker}"`, '"text" = "五万血？"', '"voice" = "配音/7-李樱-五万血"',
      `"textHash" = "${textHash('五万血？')}"`, `"finishedSha" = "${voiceSha.slice(0, 12)}"`, ...extraLines, '',
    ];
    const root = makeRepo(base(), withVoice, {
      '作品/应力转动/清单.ts': [
        "export const manifest = [{ key: '7-甲', 章: 7 }, { key: '7-乙', 章: 7 }, { key: '7-丙', 章: 7 }];",
        "export const segDir = (键: string) => `段/${键}`;",
      ].join('\n'),
      '作品/应力转动/段/7-甲/段.ts': makeSegSource("[{ sec: 2, lines: '7-李樱-五万血' }, { sec: 5, lines: '7-李樱-五万血', 接上段: true }]"),
      '作品/应力转动/段/7-乙/段.ts': makeSegSource("[{ sec: 0, lines: '7-李樱-五万血', 接上段: true }, { sec: 1, lines: '7-九胡-两次' }, { sec: 6, lines: '7-九胡-两次' }]"),
      '作品/应力转动/段/7-丙/段.ts': makeSegSource("[{ sec: 0, lines: '7-李樱-五万血', 接上段: true }, { sec: 1, lines: '7-刘心忠-没开口', 接上段: true }]"),
      '作品/应力转动/段/7-乙/画面.tsx': 'export default () => null;\n',
      '作品/应力转动/段/7-丙/画面.tsx': 'export default () => null;\n',
      '作品/应力转动/台词.toml': [
        ...makeSentence('7-李樱-五万血', '李樱', ['"mouthOpen" = 0.03']),
        ...makeSentence('7-九胡-两次', '九胡', ['"subtitlePosition" = "上"']),
        ...makeSentence('7-刘心忠-没开口', '刘心忠', ['"mouthOpen" = -1']),
      ].join('\n'),
    });
    const v = (await runRule('lines', root)).violations.join('\n');
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
        'id = "7-李樱-五万血"', '"character" = "李樱"', `"text" = "${text}"`, ...(spokenText ? [`"spoken" = "${spokenText}"`] : []), '"voice" = "配音/7-李樱-五万血"', '"mouthOpen" = 0.03',
        `"textHash" = "${textHash('五万血？')}"`, `"finishedSha" = "${voiceSha.slice(0, 12)}"`,
      ]);
    const onlySubtitleChange = await runRule('lines', makeRepo(base(), withVoice, makeLine('五万血？！', '五万血？')));
    expect(onlySubtitleChange.violations).toEqual([]);
    const readingChangeMsg = (await runRule('lines', makeRepo(base(), withVoice, makeLine('五万血？', '五万点血？')))).violations.join('\n');
    expect(readingChangeMsg).toMatch(/文本哈希 .* 和现在念的字.*对不上：念的字改过，配音过期/);
  });

  it('有 台词/ 句模块目录的：有配音的每句要有句模块、跟得上表和成品、是工具写的原样，多出来的句模块也拦', async () => {
    const sentence: LineSentence = {
      id: '7-李樱-五万血', character: '李樱', spoken: '五万血？', voice: '配音/7-李樱-五万血', finishedSha: voiceSha.slice(0, 12),
      mouthOpen: 0.03, 有声长: 0.5, duration: 0.68, 文件秒数: 0.68, char: [['五', 0.03, 0.2]], 嘴: [[0, 'X'], [0.03, 'B'], [0.2, 'X']],
    };
    const makeLineTableFile = (lipSha: string) => linesFile([
      'id = "7-李樱-五万血"', '"character" = "李樱"', '"text" = "五万血？"', '"voice" = "配音/7-李樱-五万血"', '"mouthOpen" = 0.03',
      `"textHash" = "${textHash('五万血？')}"`, `"finishedSha" = "${voiceSha.slice(0, 12)}"`, `"lip" = { "finishedSha" = "${lipSha}" }`,
    ]);
    const cleanRepo = makeRepo(base(), withVoice, makeLineTableFile(voiceSha.slice(0, 12)), { '作品/应力转动/台词/7-李樱-五万血.ts': writeSentenceText(sentence) });
    expect((await runRule('lines', cleanRepo)).violations).toEqual([]);

    const badRepo = makeRepo(base(), withVoice, makeLineTableFile('cccccccccccc'), {
      '作品/应力转动/台词/7-李樱-五万血.ts': writeSentenceText({ ...sentence, mouthOpen: 0.05 }).replace('"有声长": 0.5,', '"有声长": 0.6,'),
      '作品/应力转动/台词/7-李樱-删了.ts': writeSentenceText({ ...sentence, id: '7-李樱-删了' }),
    });
    const v = (await runRule('lines', badRepo)).violations.join('\n');
    expect(v).toMatch(/句模块被手改过/);
    expect(v).toMatch(/句模块的 开口 0.05 和 台词.toml 的 0.03 不同/);
    expect(v).toMatch(/台词\/7-李樱-删了.ts：作品\/应力转动\/台词.toml 里没有这一句/);

    const missingRepo = makeRepo(base(), withVoice, makeLineTableFile(voiceSha.slice(0, 12)), { '作品/应力转动/台词/7-李樱-删了.ts': writeSentenceText({ ...sentence, id: '7-李樱-删了' }) });
    expect((await runRule('lines', missingRepo)).violations.join('\n')).toMatch(/台词「7-李樱-五万血」：没有句模块（anim voice lip）/);
  });
});
