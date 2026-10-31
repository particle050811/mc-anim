"""anim_py.配音：口型规则、后端 dry-run、成品处理。期望值取自第 6、7 章的句模块（作品/应力转动/台词/，和旧 口型.json 一致）。
汉字句要 pypinyin（项目依赖，钉 0.55.0：uv run pytest）。
"""
import json
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


def test_后端只有_image_flow_且_dry_run_不碰网络和模型(tmp_path):
    表 = 后端表()
    assert set(表) == {'image-flow'}
    assert 表['image-flow'].付费 and 表['image-flow'].云端
    q = _请求(tmp_path)
    q.语气参考 = '/语气.wav'
    q.语气强度 = 0.65
    q.参数 = {'top_k': 20}
    后 = 取后端('image-flow', {'imgflow': str(tmp_path / '没有.mjs')})
    命令 = 后.描述(q)['命令']
    assert 命令[1:3] == ['speak', '--text'] and 命令[命令.index('--voice_ref') + 1] == q.参考音频
    assert 命令[命令.index('--emotion_ref') + 1] == '/语气.wav'
    assert 'emo_alpha=0.65' in 命令 and 'top_k=20' in 命令
    # 壳的位置是这台机器的事，不进候选说明和资产表（仓库公开）
    assert 'imgflow' not in 后.记录参数(q)
    assert any('ANIM_IMAGE_FLOW' in x for x in 后.缺什么())
    # 种子不发给模型：IndexTTS2 的节点没有这个输入
    assert not any('seed' in x for x in 命令)
    with pytest.raises(SystemExit):
        取后端('没有这个')


def test_image_flow_没语气参考不传语气也不传强度(tmp_path):
    q = _请求(tmp_path)
    q.语气强度 = 0.8
    命令 = 取后端('image-flow', {}).描述(q)['命令']
    assert '--emotion_ref' not in 命令 and not any('emo_alpha' in x for x in 命令)


def test_image_flow_合成(tmp_path, monkeypatch):
    """假 image-flow：查它收到的命令；成功转 wav、任务失败和非 JSON 输出都记成这个候选失败，不抛出去"""
    from anim_py.配音.后端 import image_flow

    跑过: list[list[str]] = []
    回 = {'stdout': json.dumps({'gen_status': 'success', 'submit_id': '261031/1', 'outputs': [{'path': '/任务/a.flac'}]}), 'returncode': 0}

    def 假跑(命令, **_):
        跑过.append(命令)
        return subprocess.CompletedProcess(命令, 回['returncode'], 回['stdout'], '')

    monkeypatch.setattr(image_flow.subprocess, 'run', 假跑)
    q = _请求(tmp_path)
    # 资产按 sha 存、没有后缀：交给 image-flow 的要带 .wav，有后缀的原样给
    (tmp_path / '6818727b').write_bytes(b'RIFF')
    (tmp_path / '参考.wav').write_bytes(b'RIFF')
    q.语气参考 = str(tmp_path / '6818727b')
    q.输出 = str(tmp_path / '这句第一次出' / '候选.wav')
    结果 = 取后端('image-flow', {}).合成([q])[0]
    assert 结果.成功 and '261031/1' in 结果.说明
    assert Path(q.输出).parent.is_dir()
    assert 跑过[0][跑过[0].index('--voice_ref') + 1] == q.参考音频
    assert 跑过[0][跑过[0].index('--emotion_ref') + 1].endswith('语气.wav')
    assert 跑过[0][2] == 'speak' and 跑过[1][-3:] == ['-i', '/任务/a.flac', q.输出]
    回['stdout'] = json.dumps({'gen_status': 'fail', 'submit_id': '261031/2', 'fail_reason': '余额不足'})
    结果 = 取后端('image-flow', {}).合成([q])[0]
    assert not 结果.成功 and '余额不足' in 结果.说明 and '261031/2' in 结果.说明
    回.update(stdout='', returncode=3)
    assert not 取后端('image-flow', {}).合成([q])[0].成功


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
