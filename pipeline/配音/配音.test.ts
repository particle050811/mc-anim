import { describe, expect, it } from 'vitest';
import type { LineSentence } from '../../engine/audio/台词句.ts';
import { writeSentenceText, parseSentenceModule } from './句模块.ts';
import { editLineField, textHash, parseWorkLines, defaultVoice } from './台词表.ts';
import { sentenceIssues, assembleSentence, manualFixUsable, buildSynthBatches, wavSeconds } from './配音.ts';
import type { AssetLock } from '../资产/资产锁.ts';

const tableText = [
  '# 注释留着',
  '["配音"]',
  '"种子" = [7]',
  '',
  '["音色"."李樱"]',
  '"参考" = "音色/李樱/参考音频"',
  '"逐字稿" = "在拔刀剑迅冲斩面前"',
  '',
  '[["台词"]]',
  'id = "7-李樱-五万血"',
  '"角色" = "李樱"',
  '"文本" = "五万血？"',
  '"开口" = 0.03',
  '',
  '["台词"."口型手修"]',
  '"成品sha" = "bbbbbbbbbbbb"',
  '"字" = [',
  '  ["五", 0.1, 0.2],',
  ']',
  '',
  '[["台词"]]',
  'id = "7-李樱-溜了"',
  '"角色" = "李樱"',
  '"文本" = "溜了"',
  '',
].join('\n');

const sha = 'b'.repeat(64);
const assetLock: AssetLock = { '配音/7-李樱-五万血': { sha256: sha, size: 1, lib: '私有', suffix: '.wav' } };

const makeWav = (sampleRate: number, frameCount: number, channels = 1, leadingChunk = false) => {
  const blockAlign = channels * 2;
  const dataBytes = Buffer.alloc(frameCount * blockAlign);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * blockAlign, 16);
  fmt.writeUInt16LE(blockAlign, 20);
  fmt.writeUInt16LE(16, 22);
  // 奇数长的 LIST 块要补一个字节（RIFF 的对齐规则）
  const list = leadingChunk ? Buffer.concat([Buffer.from('LIST', 'ascii'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc\0', 'ascii')]) : Buffer.alloc(0);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write('data', 0, 'ascii');
  chunkHeader.writeUInt32LE(dataBytes.length, 4);
  const wavBytes = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, chunkHeader, dataBytes]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(wavBytes.length, 4);
  return Buffer.concat([riff, wavBytes]);
};

describe('台词表', () => {
  it('解析：[配音] 补默认，[音色]、口型手修照写的', () => {
    const t = parseWorkLines(tableText);
    expect(t.voice).toEqual({ ...defaultVoice, seed: [7] });
    expect(t.timbre.李樱!.reference).toBe('音色/李樱/参考音频');
    expect(t.lines[0]!.lipManual).toEqual({ finishedSha: 'bbbbbbbbbbbb', char: [['五', 0.1, 0.2]] });
  });

  it('写回只动那一句的那几行：改已有的、在子表前插新的、删掉、整数写成 x.0，注释和别的句子不动', () => {
    const updatedText = editLineField(tableText, '7-李樱-五万血', { mouthOpen: 0, voice: '配音/7-李樱-五万血', lip: { finishedSha: 'bbbbbbbbbbbb' } });
    expect(updatedText).toContain('"开口" = 0.0\n"配音" = "配音/7-李樱-五万血"\n"口型" = { "成品sha" = "bbbbbbbbbbbb" }\n\n["台词"."口型手修"]');
    expect(updatedText.startsWith('# 注释留着\n')).toBe(true);
    const t = parseWorkLines(updatedText);
    expect(t.lines[0]!.lipManual?.char).toEqual([['五', 0.1, 0.2]]);
    expect(t.lines[1]).toEqual({ id: '7-李樱-溜了', character: '李樱', text: '溜了' });
    const stripped = editLineField(updatedText, '7-李樱-五万血', { voice: undefined });
    expect(stripped).not.toContain('"配音" =');
    const editedText = editLineField(tableText, '7-李樱-溜了', { mouthOpen: 0.03 });
    expect(parseWorkLines(editedText).lines[1]!.mouthOpen).toBe(0.03);
    expect(() => editLineField(tableText, '7-李樱-没有', { mouthOpen: 0 })).toThrow(/没有 id = "7-李樱-没有"/);
  });

  it('写回：句子里有多行数组也认得出边界；改出来和预期内容不一致的不写、报错', () => {
    const multiLines = ['[["台词"]]', 'id = "7-李樱-溜了"', '"角色" = "李樱"', '"种子" = [', '  [1],', '  [2]', ']', '"文本" = "溜了"', '', '[["台词"]]', 'id = "7-李樱-开到了"', '"文本" = "开到了"', ''].join('\n');
    const updatedText = editLineField(multiLines, '7-李樱-溜了', { mouthOpen: 0.03 });
    expect(parseWorkLines(updatedText).lines[0]).toEqual({ id: '7-李樱-溜了', character: '李樱', seed: [[1], [2]], text: '溜了', mouthOpen: 0.03 });
    expect(updatedText).toContain('"文本" = "溜了"\n"开口" = 0.03\n');
    const arrayAtEnd = ['[["台词"]]', 'id = "7-李樱-溜了"', '"文本" = "溜了"', '"种子" = [', '  1,', ']', '# 注释', ''].join('\n');
    expect(editLineField(arrayAtEnd, '7-李樱-溜了', { mouthOpen: 0.03 })).toContain(']\n"开口" = 0.03\n# 注释');
    // 多行字符串里像键的行：按行改会改错地方，校验拦下
    const multiLineText = ['[["台词"]]', 'id = "7-李樱-溜了"', '"说明" = """', '"开口" = 1.0', '"""', '"文本" = "溜了"', ''].join('\n');
    expect(() => editLineField(multiLineText, '7-李樱-溜了', { mouthOpen: 0.03 })).toThrow(/按行改不了/);
  });
});

describe('句模块', () => {
  const sentence: LineSentence = {
    id: '7-李樱-五万血', character: '李樱', spoken: '五万血？', voice: '配音/7-李樱-五万血', finishedSha: sha.slice(0, 12),
    mouthOpen: 0.03, 有声长: 0.5, duration: 0.68, 文件秒数: 0.681, 手修: true, char: [['五', 0.1, 0.2]], 嘴: [[0, 'X'], [0.1, 'B'], [0.5, 'X']],
  };

  it('写出来读得回、同样的数据同样的字节；数据手改了校验码对不上', () => {
    const sourceText = writeSentenceText(sentence);
    expect(parseSentenceModule(sourceText)).toEqual(sentence);
    expect(writeSentenceText(parseSentenceModule(sourceText))).toBe(sourceText);
    expect(sourceText).toMatch(/^\/\/ 由 anim voice 生成（校验 [0-9a-f]{12}）/);
    const edited = sourceText.replace('"有声长": 0.5,', '"有声长": 0.6,');
    expect(writeSentenceText(parseSentenceModule(edited))).not.toBe(edited);
    expect(() => parseSentenceModule('export default {};')).toThrow(/不是 anim voice 写的句模块/);
  });

  it('句问题：表、锁、句模块对不上的都列出来', () => {
    const line = parseWorkLines(tableText).lines[0]!;
    expect(sentenceIssues({ ...line, voice: undefined }, assetLock, null)).toEqual([]);
    expect(sentenceIssues({ ...line, voice: '配音/没有' }, assetLock, null)).toEqual(['配音「配音/没有」不在资产锁里']);
    const completeLine = { ...line, voice: '配音/7-李樱-五万血', textHash: textHash('五万血？'), finishedSha: sha.slice(0, 12), lip: { finishedSha: sha.slice(0, 12) } };
    expect(sentenceIssues(completeLine, assetLock, sentence)).toEqual([]);
    expect(sentenceIssues(completeLine, assetLock, null)).toEqual(['没有句模块（anim voice lip）']);
    const issues = sentenceIssues({ ...completeLine, text: '五万血！', lipManual: { finishedSha: 'cccccccccccc', char: [['五', 0, 1]] } }, assetLock, { ...sentence, spoken: '五万血？', mouthOpen: 0 });
    expect(issues.join('\n')).toMatch(/念的字改过、配音没重出/);
    expect(issues.join('\n')).toMatch(/口型手修 是对着成品 cccccccccccc 标的/);
    expect(issues.join('\n')).toMatch(/念的字改了/);
    expect(issues.join('\n')).toMatch(/句模块的 开口 0 和 台词.toml 的 0.03 不同/);
    expect(issues.join('\n')).toMatch(/句模块用的手修已经不能用了/);
  });

  it('手修只认绑着现在这版成品的；拼句只在用了手修时写 手修', () => {
    const line = parseWorkLines(tableText).lines[0]!;
    expect(manualFixUsable(line, sha.slice(0, 12))).toBe(true);
    expect(manualFixUsable(line, 'c'.repeat(12))).toBe(false);
    expect(manualFixUsable({ ...line, lipManual: { finishedSha: sha.slice(0, 12) } }, sha.slice(0, 12))).toBe(false);
    const buildSentence = (manualFix: boolean) => assembleSentence({ ...line, voice: '配音/7-李樱-五万血' }, { finishedSha: sha.slice(0, 12), measure: { mouthOpen: 0.03, 有声长: 0.5, duration: 0.68 }, fileDurationSec: 0.681, char: [['五', 0.1, 0.2]], manualFix, mouthKeys: [[0, 'X']] });
    expect(buildSentence(true).手修).toBe(true);
    expect('手修' in buildSentence(false)).toBe(false);
  });
});

describe('wav秒数', () => {
  it('帧数 ÷ 采样率，3 位；跳过 data 前的别的块（含奇数长补齐）', () => {
    expect(wavSeconds(makeWav(48000, 48000))).toBe(1);
    expect(wavSeconds(makeWav(48000, 32688))).toBe(0.681);
    expect(wavSeconds(makeWav(44100, 22050, 2, true))).toBe(0.5);
    expect(() => wavSeconds(Buffer.from('not a wav file at all'))).toThrow(/不是 wav/);
  });
});

describe('排合成批', () => {
  const workLineTable = parseWorkLines(
    [
      '["配音"]', '"种子" = [1, 2]',
      '["音色"."李樱"]', '"参考" = "音色/李樱/参考音频"', '"逐字稿" = "在拔刀剑迅冲斩面前"',
      '[["台词"]]', 'id = "7-李樱-五万血"', '"角色" = "李樱"', '"文本" = "5万血？"', '"念" = "五万血？"',
      '[["台词"]]', 'id = "7-李樱-溜了"', '"角色" = "李樱"', '"文本" = "溜了"',
      '["台词"."合成"]', '"后端" = "别的后端"', '"念" = "溜了溜了"', '"参考" = "音色/李樱/别的"', '"逐字稿" = "别的"', '"种子" = [9]', '"语气参考" = "配音/没登记"',
    ].join('\n'),
  );
  const assetLock: AssetLock = {
    '音色/李樱/参考音频': { sha256: 'a'.repeat(64), size: 1, lib: 'store', suffix: '.wav' },
    '音色/李樱/别的': { sha256: 'c'.repeat(64), size: 1, lib: 'store', suffix: '.wav' },
  };
  const env = { dataRoot: '/数据', work: '应力转动' };

  it('按句的 合成.后端 分批；念、参考、种子按句覆盖；命令行盖过一切', () => {
    expect(() => buildSynthBatches(workLineTable, workLineTable.lines, {}, assetLock, env)).toThrow(/语气参考「配音\/没登记」不在资产锁里/);
    const batches = buildSynthBatches(workLineTable, workLineTable.lines, { toneRef: '/录音.wav' }, assetLock, env);
    expect([...batches.keys()]).toEqual([defaultVoice.backend, '别的后端']);
    const defaultBatch = batches.get(defaultVoice.backend)!.requests;
    expect(defaultBatch.map((q) => [q.id, q.spoken, q.seed, q.character])).toEqual([['7-李樱-五万血', '五万血？', 1, '李樱'], ['7-李樱-五万血', '五万血？', 2, '李樱']]);
    expect(defaultBatch[0]!.output).toBe(`/数据/run/草稿/配音/应力转动/7-李樱-五万血/${defaultVoice.backend}-种子1.wav`);
    const overrideBatch = batches.get('别的后端')!.requests;
    expect(overrideBatch.map((q) => [q.spoken, q.seed, q.参考逐字稿, q.toneRef])).toEqual([['溜了溜了', 9, '别的', '/录音.wav']]);
    expect(String(overrideBatch[0]!.参考音频)).toContain('c'.repeat(64));
    const overrideAll = buildSynthBatches(workLineTable, workLineTable.lines, { backend: '别的后端', seed: [3], toneRef: '/录音.wav', intensity: 0.8 }, assetLock, env);
    expect([...overrideAll.keys()]).toEqual(['别的后端']);
    expect(overrideAll.get('别的后端')!.requests.map((q) => [q.seed, q.语气强度])).toEqual([[3, 0.8], [3, 0.8]]);
  });
});
