import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { pypinyin版本, 复核组, 配音py命令 } from './python.ts';
import { 列候选, 复核报告文本, 写进候选说明, 拆回包, type 复核请求 } from './复核.ts';

const 请求 = (wav: string): 复核请求 => ({ wav, id: '7-黄叛-受死', 念: '怪物受死！', 语言: '中文', 语气: '怒喝', 参考音频: '/参考.wav' });

describe('配音复核', () => {
  it('回包按请求拆回每个 wav；缺东西的项记 缺；条数对不上就报错', () => {
    const qs = [请求('/a.wav'), 请求('/b.wav')];
    const m = 拆回包(qs, { 起伏: { 结果: [{ 音高跨度st: 10 }, { 音高跨度st: 3 }] }, 听写: { 缺: ['还没接'] } });
    expect(m.get('/b.wav')).toEqual({ 起伏: { 音高跨度st: 3 }, 听写: { 缺: ['还没接'] } });
    expect(() => 拆回包(qs, { 起伏: { 结果: [{}] } })).toThrow(/返回 1 条，请求 2 条/);
  });

  it('列候选不含 use 出的成品；复核并进候选说明，不冲掉 gen 写的字段', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), '复核-'));
    for (const f of ['firered-本机-种子7.wav', '成品-firered-本机-种子7.wav', 'a.wav', '复核.md']) fs.writeFileSync(path.join(d, f), '');
    expect(列候选(d).map((f) => path.basename(f))).toEqual(['a.wav', 'firered-本机-种子7.wav']);
    const wav = path.join(d, 'firered-本机-种子7.wav');
    fs.writeFileSync(wav.replace('.wav', '.json'), JSON.stringify({ 后端: 'firered-本机', 种子: 7, 复核: { 听写: { 过: true } } }));
    写进候选说明(wav, { 音色: { 相似度: 0.8 } });
    expect(JSON.parse(fs.readFileSync(wav.replace('.wav', '.json'), 'utf8'))).toEqual({ 后端: 'firered-本机', 种子: 7, 复核: { 听写: { 过: true }, 音色: { 相似度: 0.8 } } });
    expect(列候选(path.join(d, '没有'))).toEqual([]);
  });

  it('报告：一行一个候选，现成品放最后，提示和没跑的项列在表下', () => {
    const t = 复核报告文本({
      id: '7-黄叛-受死', 念: '怪物受死！', 语气: '怒喝', 时间: 'T',
      条们: [{ 名: '种子7', wav: '/a.wav', 复核: { 音色: { 相似度: 0.789, 提示: '低于旧项目挑候选的下限 0.85' }, 起伏: { 基频中位Hz: 294.9, 音高跨度st: 11.2, 音高标准差st: 3.21, 响度跨度dB: 26.2 } } }],
      对照: { 名: '现成品', wav: '/c.wav', 复核: { 音色: { 缺: ['没装 resemblyzer'] }, 起伏: {} } },
    });
    expect(t).toContain('| 种子7 | 0.789 | 294.9 | 11.2 | 3.21 | 26.2 |');
    expect(t).toContain('| 现成品 | 缺 | — | — | — | — |');
    expect(t).toContain('- 种子7（音色）：低于旧项目挑候选的下限 0.85');
    expect(t).toContain('- 现成品（音色）没跑：没装 resemblyzer');
  });

  it('Python 跑在项目 venv：pypinyin 版本和 pyproject.toml 钉的一样，复核才带 voice-review 组', () => {
    const 项目 = fs.readFileSync(path.join(代码根(), 'pyproject.toml'), 'utf8');
    expect(项目).toContain(`"pypinyin==${pypinyin版本}"`);
    expect(项目).toMatch(new RegExp(`^${复核组} = \\[`, 'm'));
    expect(配音py命令('嘴', '/q.json')).not.toContain('--group');
    expect(配音py命令('复核', '/q.json', [复核组]).join(' ')).toContain(`--project ${代码根()} --group ${复核组} python -m anim_py.配音 复核 /q.json`);
  });
});
