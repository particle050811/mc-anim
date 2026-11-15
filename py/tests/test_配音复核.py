"""anim_py.配音.复核：项都登记了、付费项只有 dry-run、比字规则（照旧项目 听写.py）、起伏的量法。起伏要 voice-review 组（uv run --group voice-review pytest），没装就跳过。"""
import math
import struct
import wave
from pathlib import Path

import pytest

from anim_py.配音.复核 import review_table, ReviewRequest, get_item, pinyin_with_tone, compare_chars, canonicalize, run_review, DEFAULT_ITEMS


def test_all_registered_default_runs_only_local_free():
    review_map = review_table()
    assert set(review_map) == {'起伏', '音色', '听写', '语气'}
    assert set(DEFAULT_ITEMS) == {'起伏', '音色'}
    assert not any(review_map[n].paid or review_map[n].cloud for n in DEFAULT_ITEMS)
    assert review_map['听写'].paid and review_map['语气'].paid and review_map['听写'].cloud
    with pytest.raises(SystemExit):
        get_item('没有这项')


def test_paid_item_describe_only_sends_nothing(tmp_path):
    qs = [ReviewRequest(wav=str(tmp_path / f'{i}.wav'), id='7-黄叛-受死', 念='怪物受死！', 语气='怒喝') for i in range(2)]
    r = run_review(['听写', '语气'], qs, describe_only=True)
    assert any('还没接' in x for x in r['听写']['缺'])
    assert len(r['听写']['描述']['发']) == 2
    # 语气是同一句的候选放一起比：两个候选一组
    assert r['语气']['描述']['发'] == [{'gemini-3.8-flash': [f'<{q.wav}>' for q in qs], '台词': '怪物受死！', '语气': '怒喝', '轮': 2}]
    # 真跑：缺东西的项不跑，结果里只有 缺
    assert '结果' not in run_review(['听写'], qs)['听写']


def test_compare_chars():
    assert canonicalize('五万血？！这我打个集贸啊！') == '五万血这我打个集贸啊'
    assert canonicalize('ロードローラーだッ！') == canonicalize('ろどろらだ')
    assert compare_chars('狗修金萨玛！', ['狗修金sama']) == {'过': True}
    assert pinyin_with_tone('匠魂') == pinyin_with_tone('降魂')
    assert compare_chars('匠魂', ['降魂']) == {'过': True, '同音': True}
    assert compare_chars('怪物受死！', ['怪物收尸', '乖乖受死']) == {'过': False}


def _write_wav(p: Path, segment: list[tuple[float, float, float]], sample_rate=16000):
    """段：[(秒, 频率, 振幅)]"""
    frame = bytearray()
    phase = 0.0
    for sec, frequency, amplitude in segment:
        for _ in range(round(sec * sample_rate)):
            phase += 2 * math.pi * frequency / sample_rate
            frame += struct.pack('<h', round(amplitude * 32767 * math.sin(phase)))
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(bytes(frame))


def test_pitch_flat_span_smaller_than_slide(tmp_path):
    pytest.importorskip('librosa')
    pytest.importorskip('parselmouth')
    flat_wav, glide = tmp_path / '平.wav', tmp_path / '滑.wav'
    _write_wav(flat_wav, [(1.0, 220, 0.3)])
    _write_wav(glide, [(0.25, 180, 0.1), (0.25, 220, 0.3), (0.25, 280, 0.6), (0.25, 360, 0.2)])
    r = run_review(['起伏'], [ReviewRequest(wav=str(flat_wav)), ReviewRequest(wav=str(glide))])['起伏']['结果']
    assert r[0]['音高跨度st'] < 0.5 < r[1]['音高跨度st']
    assert abs(r[0]['基频中位Hz'] - 220) < 3
    assert r[0]['响度跨度dB'] < r[1]['响度跨度dB']
