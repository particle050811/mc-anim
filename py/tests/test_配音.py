"""anim_py.配音：口型规则、后端 dry-run、成品处理。期望值取自第 6、7 章的句模块（作品/应力转动/台词/，和旧 口型.json 一致）。
汉字句要 pypinyin（项目依赖，钉 0.55.0：uv run pytest）。
"""
import math
import shutil
import struct
import subprocess
import wave
from pathlib import Path

import pytest

from anim_py.配音.口型 import 算嘴
from anim_py.配音.后端 import 后端表, 取后端, 合成请求
from anim_py.配音.处理 import wav秒数, 出成品


def test_日语句不靠拼音():
    字 = [['ロー', 0.87, 1.27], ['ド', 1.28, 1.45], ['ロー', 1.46, 1.77], ['ラー', 1.78, 2.08], ['だ', 2.09, 2.63], ['ッ', 2.63, 2.67]]
    assert 算嘴('ロードローラーだッ！', 2.72, 字) == [
        [0, 'X'], [0.87, 'E'], [1.16, 'B'], [1.28, 'E'], [1.78, 'B'], [1.86, 'D'], [1.98, 'B'], [2.09, 'D'], [2.52, 'C'], [2.6, 'A'], [2.67, 'X'],
    ]


def test_汉字句():
    import pypinyin  # pyright: ignore[reportMissingImports]

    assert pypinyin.__version__ == '0.55.0', '期望值是 pypinyin 0.55.0 算的'
    字 = [['怪', 0, 0.24], ['物', 0.24, 0.32], ['受', 0.32, 0.48], ['死', 0.48, 0.8]]
    assert 算嘴('怪物受死！', 1.007, 字) == [[0, 'B'], [0.09, 'C'], [0.17, 'B'], [0.24, 'F'], [0.32, 'E'], [0.44, 'F'], [0.51, 'B'], [0.8, 'X']]


def _请求(tmp: Path) -> 合成请求:
    return 合成请求(id='7-黄叛-受死', 念='怪物受死！', 语言='中文', 参考音频=str(tmp / '参考.wav'), 参考逐字稿='怪物受死', 种子=7, 输出=str(tmp / '出.wav'), 语气='怒喝', 角色='黄叛')


def test_后端都登记了且_dry_run_不碰网络和模型(tmp_path):
    表 = 后端表()
    assert set(表) == {'firered-本机', 'firered-魔搭', 'indextts2-本机', 'indextts2-runninghub', 'gpt-sovits', 'openai-speech'}
    assert 表['indextts2-runninghub'].付费 and 表['indextts2-runninghub'].云端 and 表['firered-魔搭'].云端
    assert not any(表[n].云端 for n in ('firered-本机', 'indextts2-本机', 'gpt-sovits', 'openai-speech'))
    for 名 in 表:
        d = 取后端(名, {}).描述(_请求(tmp_path))
        assert d['后端'] == 名
    本机 = 取后端('firered-本机', {'目录': str(tmp_path / '没有')})
    assert 本机.描述(_请求(tmp_path))['参数']['cfg'] == 1.2
    # 本机目录、服务地址不进候选说明和资产表（仓库公开）
    assert 本机.记录参数(_请求(tmp_path)) == {'cfg': 1.2, '步数': 30, '精度': 'fp32', '设备': ''}
    assert '地址' not in 取后端('gpt-sovits', {'地址': 'http://127.0.0.1:1'}).记录参数(_请求(tmp_path))
    assert any('venv 没建' in x for x in 本机.缺什么())
    # 按名字取音色的服务：没配 音色 就用台词的角色
    assert 取后端('openai-speech', {}).描述(_请求(tmp_path))['json']['voice'] == '黄叛'
    assert 取后端('firered-本机', {}).缺什么() == ['没给 FireRedTTS3 目录（anim 配置 firered，环境变量 ANIM_FIRERED）']
    # 合成.参数 的采样参数盖到 RunningHub 的 IndexTTS2Run 节点上；节点里没有的键、连线的输入不动
    q = _请求(tmp_path)
    q.参数 = {'top_k': 20, '没有这个键': 1, 'audio': 'x'}
    节点 = 取后端('indextts2-runninghub', {}).描述(q)['workflow']['tts0']['inputs']
    assert 节点['top_k'] == 20 and '没有这个键' not in 节点 and 节点['audio'] == ['timbre', 0]
    with pytest.raises(SystemExit):
        取后端('没有这个')


def _写wav(p: Path, 段: list[tuple[float, float]], 采样率=48000):
    """段：[(秒, 振幅)]，振幅 0 是静音，否则 220 Hz 正弦"""
    帧 = bytearray()
    n = 0
    for 秒, 幅 in 段:
        for _ in range(round(秒 * 采样率)):
            帧 += struct.pack('<h', round(幅 * 32767 * math.sin(2 * math.pi * 220 * n / 采样率)))
            n += 1
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(采样率)
        w.writeframes(bytes(帧))


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='没有 ffmpeg')
def test_出成品_裁静音拉响度(tmp_path):
    原 = tmp_path / '原.wav'
    _写wav(原, [(0.5, 0), (1.0, 0.5), (0.6, 0)])
    成 = tmp_path / '成.wav'
    m = 出成品(原, 成)
    # 头留 0.03 秒、尾留 0.15 秒（同旧链）
    assert abs(m['开口'] - 0.03) < 0.02
    assert abs(m['有声长'] - 1.0) < 0.03
    assert abs(m['时长'] - (m['开口'] + m['有声长'] + 0.15)) < 0.02
    assert abs(wav秒数(成) - m['时长']) < 0.002
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(成), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    综合 = float(r.stderr.rsplit('I:', 1)[1].split('LUFS')[0])
    assert abs(综合 - (-18)) < 1 or m['增益dB'] < -18 - m['原响度'] + 0.1  # 被峰值上限压住时响度会低于 -18
    with wave.open(str(成)) as w:
        assert (w.getnchannels(), w.getframerate(), w.getsampwidth()) == (1, 48000, 2)
    不裁 = 出成品(原, None, 不裁=True)
    assert 不裁['开口'] == 0 and abs(不裁['时长'] - 2.1) < 0.01
