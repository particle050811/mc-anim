"""anim_py.配音.复核：项都登记了、付费项只有 dry-run、比字规则（照旧项目 听写.py）、起伏的量法。起伏要 voice-review 组（uv run --group voice-review pytest），没装就跳过。"""
import math
import struct
import wave
from pathlib import Path

import pytest

from anim_py.配音.复核 import 复核表, 复核请求, 取项, 带调拼音, 比字, 规范, 跑, 默认项


def test_项都登记了_默认只跑本机免费的():
    表 = 复核表()
    assert set(表) == {'起伏', '音色', '听写', '语气'}
    assert set(默认项) == {'起伏', '音色'}
    assert not any(表[n].付费 or 表[n].云端 for n in 默认项)
    assert 表['听写'].付费 and 表['语气'].付费 and 表['听写'].云端
    with pytest.raises(SystemExit):
        取项('没有这项')


def test_付费项只描述_不发东西(tmp_path):
    qs = [复核请求(wav=str(tmp_path / f'{i}.wav'), id='7-黄叛-受死', 念='怪物受死！', 语气='怒喝') for i in range(2)]
    r = 跑(['听写', '语气'], qs, 只描述=True)
    assert any('还没接' in x for x in r['听写']['缺'])
    assert len(r['听写']['描述']['发']) == 2
    # 语气是同一句的候选放一起比：两个候选一组
    assert r['语气']['描述']['发'] == [{'gemini-3.8-flash': [f'<{q.wav}>' for q in qs], '台词': '怪物受死！', '语气': '怒喝', '轮': 2}]
    # 真跑：缺东西的项不跑，结果里只有 缺
    assert '结果' not in 跑(['听写'], qs)['听写']


def test_比字():
    assert 规范('五万血？！这我打个集贸啊！') == '五万血这我打个集贸啊'
    assert 规范('ロードローラーだッ！') == 规范('ろどろらだ')
    assert 比字('狗修金萨玛！', ['狗修金sama']) == {'过': True}
    assert 带调拼音('匠魂') == 带调拼音('降魂')
    assert 比字('匠魂', ['降魂']) == {'过': True, '同音': True}
    assert 比字('怪物受死！', ['怪物收尸', '乖乖受死']) == {'过': False}


def _写wav(p: Path, 段: list[tuple[float, float, float]], 采样率=16000):
    """段：[(秒, 频率, 振幅)]"""
    帧 = bytearray()
    相 = 0.0
    for 秒, 频, 幅 in 段:
        for _ in range(round(秒 * 采样率)):
            相 += 2 * math.pi * 频 / 采样率
            帧 += struct.pack('<h', round(幅 * 32767 * math.sin(相)))
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(采样率)
        w.writeframes(bytes(帧))


def test_起伏_平调比滑调跨度小(tmp_path):
    pytest.importorskip('librosa')
    pytest.importorskip('parselmouth')
    平, 滑 = tmp_path / '平.wav', tmp_path / '滑.wav'
    _写wav(平, [(1.0, 220, 0.3)])
    _写wav(滑, [(0.25, 180, 0.1), (0.25, 220, 0.3), (0.25, 280, 0.6), (0.25, 360, 0.2)])
    r = 跑(['起伏'], [复核请求(wav=str(平)), 复核请求(wav=str(滑))])['起伏']['结果']
    assert r[0]['音高跨度st'] < 0.5 < r[1]['音高跨度st']
    assert abs(r[0]['基频中位Hz'] - 220) < 3
    assert r[0]['响度跨度dB'] < r[1]['响度跨度dB']
