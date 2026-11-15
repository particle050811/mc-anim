import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { pypinyinVersion, reviewGroup, voicePyCommand } from './python.ts';
import { listCandidates, reviewReportText, writeCandidateNote, unpackReply, type ReviewRequest } from './复核.ts';

const makeRequest = (wav: string): ReviewRequest => ({ wav, id: '7-黄叛-受死', 念: '怪物受死！', 语言: '中文', 语气: '怒喝', 参考音频: '/参考.wav' });

describe('配音复核', () => {
  it('回包按请求拆回每个 wav；缺东西的项记 缺；条数对不上就报错', () => {
    const qs = [makeRequest('/a.wav'), makeRequest('/b.wav')];
    const m = unpackReply(qs, { 起伏: { 结果: [{ 音高跨度st: 10 }, { 音高跨度st: 3 }] }, 听写: { 缺: ['还没接'] } });
    expect(m.get('/b.wav')).toEqual({ 起伏: { 音高跨度st: 3 }, 听写: { 缺: ['还没接'] } });
    expect(() => unpackReply(qs, { 起伏: { 结果: [{}] } })).toThrow(/返回 1 条，请求 2 条/);
  });

  it('列候选不含 use 出的成品；复核并进候选说明，不冲掉 gen 写的字段', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '复核-'));
    for (const f of ['firered-本机-种子7.wav', '成品-firered-本机-种子7.wav', 'a.wav', '复核.md']) fs.writeFileSync(path.join(d, f), '');
    expect(listCandidates(d).map((f) => path.basename(f))).toEqual(['a.wav', 'firered-本机-种子7.wav']);
    const wav = path.join(d, 'firered-本机-种子7.wav');
    fs.writeFileSync(wav.replace('.wav', '.json'), JSON.stringify({ 后端: 'firered-本机', 种子: 7, 复核: { 听写: { 过: true } } }));
    writeCandidateNote(wav, { 音色: { 相似度: 0.8 } });
    expect(JSON.parse(fs.readFileSync(wav.replace('.wav', '.json'), 'utf8'))).toEqual({ 后端: 'firered-本机', 种子: 7, 复核: { 听写: { 过: true }, 音色: { 相似度: 0.8 } } });
    expect(listCandidates(path.join(d, '没有'))).toEqual([]);
  });

  it('报告：一行一个候选，现成品放最后，提示和没跑的项列在表下', () => {
    const t = reviewReportText({
      id: '7-黄叛-受死', 念: '怪物受死！', 语气: '怒喝', 时间: 'T',
      items: [{ 名: '种子7', wav: '/a.wav', 复核: { 音色: { 相似度: 0.789, 提示: '低于旧项目挑候选的下限 0.85' }, 起伏: { 基频中位Hz: 294.9, 音高跨度st: 11.2, 音高标准差st: 3.21, 响度跨度dB: 26.2 } } }],
      compareRow: { 名: '现成品', wav: '/c.wav', 复核: { 音色: { 缺: ['没装 resemblyzer'] }, 起伏: {} } },
    });
    expect(t).toContain('| 种子7 | 0.789 | 294.9 | 11.2 | 3.21 | 26.2 |');
    expect(t).toContain('| 现成品 | 缺 | — | — | — | — |');
    expect(t).toContain('- 种子7（音色）：低于旧项目挑候选的下限 0.85');
    expect(t).toContain('- 现成品（音色）没跑：没装 resemblyzer');
  });

  it('Python 跑在项目 venv：pypinyin 版本和 pyproject.toml 钉的一样，复核才带 voice-review 组', () => {
    const projectToml = fs.readFileSync(path.join(codeRoot(), 'pyproject.toml'), 'utf8');
    expect(projectToml).toContain(`"pypinyin==${pypinyinVersion}"`);
    expect(projectToml).toMatch(new RegExp(`^${reviewGroup} = \\[`, 'm'));
    expect(voicePyCommand('嘴', '/q.json')).not.toContain('--group');
    expect(voicePyCommand('复核', '/q.json', [reviewGroup]).join(' ')).toContain(`--project ${codeRoot()} --group ${reviewGroup} python -m anim_py.配音 复核 /q.json`);
  });
});
