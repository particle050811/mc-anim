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

from anim_py.配音.口型 import compute_lip_shapes
from anim_py.配音.后端 import backend_table, get_backend, SynthRequest
from anim_py.配音.处理 import wav_seconds, export_finished


def test_japanese_line_skips_pinyin():
    unit_timings = [['ロー', 0.87, 1.27], ['ド', 1.28, 1.45], ['ロー', 1.46, 1.77], ['ラー', 1.78, 2.08], ['だ', 2.09, 2.63], ['ッ', 2.63, 2.67]]
    assert compute_lip_shapes('ロードローラーだッ！', 2.72, unit_timings) == [
        [0, 'X'], [0.87, 'E'], [1.16, 'B'], [1.28, 'E'], [1.78, 'B'], [1.86, 'D'], [1.98, 'B'], [2.09, 'D'], [2.52, 'C'], [2.6, 'A'], [2.67, 'X'],
    ]


def test_chinese_char_sentence():
    import pypinyin  # pyright: ignore[reportMissingImports]

    assert pypinyin.__version__ == '0.55.0', '期望值是 pypinyin 0.55.0 算的'
    unit_timings = [['怪', 0, 0.24], ['物', 0.24, 0.32], ['受', 0.32, 0.48], ['死', 0.48, 0.8]]
    assert compute_lip_shapes('怪物受死！', 1.007, unit_timings) == [[0, 'B'], [0.09, 'C'], [0.17, 'B'], [0.24, 'F'], [0.32, 'E'], [0.44, 'F'], [0.51, 'B'], [0.8, 'X']]


def _make_request(tmp: Path) -> SynthRequest:
    return SynthRequest(id='7-黄叛-受死', 念='怪物受死！', 语言='中文', 参考音频=str(tmp / '参考.wav'), 参考逐字稿='怪物受死', 种子=7, 输出=str(tmp / '出.wav'), 语气='怒喝', 角色='黄叛')


def test_backend_only_image_flow_dry_run_no_network_or_model(tmp_path):
    backend_map = backend_table()
    assert set(backend_map) == {'image-flow'}
    assert backend_map['image-flow'].paid and backend_map['image-flow'].cloud
    q = _make_request(tmp_path)
    q.语气参考 = '/语气.wav'
    q.语气强度 = 0.65
    q.参数 = {'top_k': 20}
    backend = get_backend('image-flow', {'imgflow': str(tmp_path / '没有.mjs')})
    command = backend.describe(q)['命令']
    assert command[1:3] == ['speak', '--text'] and command[command.index('--voice_ref') + 1] == q.参考音频
    assert command[command.index('--emotion_ref') + 1] == '/语气.wav'
    assert 'emo_alpha=0.65' in command and 'top_k=20' in command
    # 壳的位置是这台机器的事，不进候选说明和资产表（仓库公开）
    assert 'imgflow' not in backend.record_params(q)
    assert any('ANIM_IMAGE_FLOW' in x for x in backend.missing_items())
    # 种子不发给模型：IndexTTS2 的节点没有这个输入
    assert not any('seed' in x for x in command)
    with pytest.raises(SystemExit):
        get_backend('没有这个')


def test_image_flow_without_tone_ref_omits_tone_and_strength(tmp_path):
    q = _make_request(tmp_path)
    q.语气强度 = 0.8
    command = get_backend('image-flow', {}).describe(q)['命令']
    assert '--emotion_ref' not in command and not any('emo_alpha' in x for x in command)


def test_image_flow_synthesize(tmp_path, monkeypatch):
    """假 image-flow：查它收到的命令；成功转 wav、任务失败和非 JSON 输出都记成这个候选失败，不抛出去"""
    from anim_py.配音.后端 import image_flow

    ran_commands: list[list[str]] = []
    fake_result = {'stdout': json.dumps({'gen_status': 'success', 'submit_id': '261031/1', 'outputs': [{'path': '/任务/a.flac'}]}), 'returncode': 0}

    def fake_run(command, **_):
        ran_commands.append(command)
        return subprocess.CompletedProcess(command, fake_result['returncode'], fake_result['stdout'], '')

    monkeypatch.setattr(image_flow.subprocess, 'run', fake_run)
    q = _make_request(tmp_path)
    # 资产按 sha 存、没有后缀：交给 image-flow 的要带 .wav，有后缀的原样给
    (tmp_path / '6818727b').write_bytes(b'RIFF')
    (tmp_path / '参考.wav').write_bytes(b'RIFF')
    q.语气参考 = str(tmp_path / '6818727b')
    q.输出 = str(tmp_path / '这句第一次出' / '候选.wav')
    result = get_backend('image-flow', {}).synthesize([q])[0]
    assert result.成功 and '261031/1' in result.说明
    assert Path(q.输出).parent.is_dir()
    assert ran_commands[0][ran_commands[0].index('--voice_ref') + 1] == q.参考音频
    assert ran_commands[0][ran_commands[0].index('--emotion_ref') + 1].endswith('语气.wav')
    assert ran_commands[0][2] == 'speak' and ran_commands[1][-3:] == ['-i', '/任务/a.flac', q.输出]
    fake_result['stdout'] = json.dumps({'gen_status': 'fail', 'submit_id': '261031/2', 'fail_reason': '余额不足'})
    result = get_backend('image-flow', {}).synthesize([q])[0]
    assert not result.成功 and '余额不足' in result.说明 and '261031/2' in result.说明
    fake_result.update(stdout='', returncode=3)
    assert not get_backend('image-flow', {}).synthesize([q])[0].成功


def _write_wav(p: Path, segment: list[tuple[float, float]], sample_rate=48000):
    """段：[(秒, 振幅)]，振幅 0 是静音，否则 220 Hz 正弦"""
    frame = bytearray()
    n = 0
    for sec, amplitude in segment:
        for _ in range(round(sec * sample_rate)):
            frame += struct.pack('<h', round(amplitude * 32767 * math.sin(2 * math.pi * 220 * n / sample_rate)))
            n += 1
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(bytes(frame))


@pytest.mark.skipif(not shutil.which('ffmpeg') or not shutil.which('ffprobe'), reason='没有 ffmpeg')
def test_export_finished_trims_silence_and_normalizes_loudness(tmp_path):
    original_path = tmp_path / '原.wav'
    _write_wav(original_path, [(0.5, 0), (1.0, 0.5), (0.6, 0)])
    finished_wav = tmp_path / '成.wav'
    m = export_finished(original_path, finished_wav)
    # 头留 0.03 秒、尾留 0.15 秒（同旧链）
    assert abs(m['开口'] - 0.03) < 0.02
    assert abs(m['有声长'] - 1.0) < 0.03
    assert abs(m['时长'] - (m['开口'] + m['有声长'] + 0.15)) < 0.02
    assert abs(wav_seconds(finished_wav) - m['时长']) < 0.002
    r = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(finished_wav), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    integrated_loudness = float(r.stderr.rsplit('I:', 1)[1].split('LUFS')[0])
    assert abs(integrated_loudness - (-18)) < 1 or m['增益dB'] < -18 - m['原响度'] + 0.1  # 被峰值上限压住时响度会低于 -18
    with wave.open(str(finished_wav)) as w:
        assert (w.getnchannels(), w.getframerate(), w.getsampwidth()) == (1, 48000, 2)
    no_trim_result = export_finished(original_path, None, no_trim=True)
    assert no_trim_result['开口'] == 0 and abs(no_trim_result['时长'] - 2.1) < 0.01
