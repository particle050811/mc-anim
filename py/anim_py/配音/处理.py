"""配音原件 → 成品：开头静音裁到 0.03 秒、结尾留 0.15 秒（-45 dBFS 以下算静音），EBU R128 拉到 -18 LUFS（峰值不超 -1.5 dBFS），48 kHz 单声道 16 位。
同时量出 开口（成品里第几秒开口）、有声长、时长，台词轨按 开口 把这句对到 cue 的帧上。

出处：旧项目 7d077904 参考模型库/工具/配音/生成台词.py 的 make_trimmed_copy、voiced_span、measure_loudness，数值照搬。
开口、有声长是在原件上量的（成品拉过响度，-45 dB 的门槛对应的是原件的电平），所以只在出成品时量一次、写进句模块，不在成品上重量。
ffmpeg、ffprobe 取环境变量 ANIM_FFMPEG、ANIM_FFPROBE（anim 传进来），没有就从 PATH 找。
"""
from __future__ import annotations

import array
import os
import re
import subprocess
import tempfile
import wave
from pathlib import Path

静音门槛dB = -45
静音最短秒 = 0.12
开头留秒 = 0.03
结尾留秒 = 0.15
目标响度 = -18.0
峰值上限 = -1.5


def _ffmpeg() -> str:
    return os.environ.get('ANIM_FFMPEG') or 'ffmpeg'


def _ffprobe() -> str:
    return os.environ.get('ANIM_FFPROBE') or 'ffprobe'


def 时长(p: Path) -> float:
    r = subprocess.run([_ffprobe(), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)], capture_output=True, text=True, check=True, encoding='utf-8')
    return float(r.stdout.strip())


def wav秒数(p: Path) -> float:
    """wav 头里的帧数 ÷ 采样率（口型的 时长 用它，和 ffprobe 的可能差最后一位）"""
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()


def 有声段(p: Path) -> tuple[float, float]:
    """第一个和最后一个有声的时刻（-45 dBFS，静音至少 0.12 秒才算）"""
    s = subprocess.run([_ffmpeg(), '-hide_banner', '-i', str(p), '-af', f'silencedetect=n={静音门槛dB}dB:d={静音最短秒}', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8').stderr
    total = 时长(p)
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', s)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', s)]
    head = ends[0] if starts and starts[0] < 0.01 and ends else 0.0
    tail = total
    if starts and starts[-1] > head and (len(ends) < len(starts) or ends[-1] >= total - 0.02):
        tail = starts[-1]
    return head, tail


def 量响度(p: Path) -> tuple[float, float]:
    """积分响度（LUFS）、采样峰值（dBFS）"""
    s = subprocess.run([_ffmpeg(), '-hide_banner', '-nostats', '-i', str(p), '-af', 'ebur128=peak=sample', '-f', 'null', '-'],
                       capture_output=True, text=True, encoding='utf-8').stderr
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', s)[-1])
    pk = float(re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS', s)[-1])
    return i, pk


def 首个有声秒(p: Path) -> float:
    """文件里第一个响过 −45 dBFS 的样本（不裁的句子记它当 头）"""
    with wave.open(str(p)) as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        a = array.array('h' if sw == 2 else 'i', w.readframes(n))
    门 = (32768 if sw == 2 else 2 ** 31) * 10 ** (静音门槛dB / 20)
    for i, x in enumerate(a):
        if abs(x) > 门:
            return i // ch / sr
    return 0.0


def 出成品(原件: Path, 成品: Path | None, 不裁: bool = False, 目标: float = 目标响度, 峰值: float = 峰值上限) -> dict:
    """原件裁静音、拉响度写成品（成品 None 时只量不写）；返回 开口、有声长、时长、增益dB、原响度、原峰值"""
    head, tail = (0.0, 时长(原件)) if 不裁 else 有声段(原件)
    trim_start = max(0.0, head - 开头留秒)
    trim_end = min(时长(原件), tail + 结尾留秒)
    with tempfile.TemporaryDirectory() as d:
        t = Path(d) / '裁.wav'
        subprocess.run([_ffmpeg(), '-v', 'error', '-y', '-i', str(原件), '-af', f'atrim=start={trim_start:.3f}:end={trim_end:.3f},asetpts=PTS-STARTPTS',
                        '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(t)], check=True)
        i, pk = 量响度(t)
        gain_db = min(目标 - i, 峰值 - pk)
        if 成品 is not None:
            成品.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run([_ffmpeg(), '-v', 'error', '-y', '-i', str(t), '-af', f'volume={gain_db:.2f}dB', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(成品)], check=True)
    return {'开口': round(head - trim_start, 3), '有声长': round(tail - head, 3), '时长': round(trim_end - trim_start, 3), '增益dB': round(gain_db, 2), '原响度': i, '原峰值': pk}
