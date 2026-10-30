"""配音候选的复核：每项量一种东西，可插拔，按名字取（同 后端/ 的做法）。anim voice gen 出完候选跑默认的本机项，anim voice review 单独跑。

本机、免费（默认跑）：
  起伏  音高（Praat 自相关基频）和响度（50 ms 帧 RMS）起伏有多大：棒读的句子跨度小
  音色  Resemblyzer 说话人向量和角色参考音频的余弦相似度
外部、付费（只留接口和 dry-run，要用户定启用；anim 那边要 --允许付费）：
  听写  Qwen3-ASR + Gemini 听写，去标点比字，带声调拼音一样也算对（比字的规则是本机的纯函数，见 比字）
  语气  几个候选放一起让 Gemini 按台词的「语气」打分，正反两个顺序取平均

出处：旧项目 7d077904 参考模型库/工具/配音/语气.py（pitch_loudness_stats、speaker_similarity、rank_candidates）、听写.py（normalize、pinyin_tones），数值照搬。
依赖在 pyproject.toml 的 voice-review 组（torch），anim 用 uv run --group voice-review 跑；只用 比字 的不用装。
"""
from __future__ import annotations

import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import ClassVar

# 旧项目 生成台词.py 的 MIN_TIMBRE_SIMILARITY：FireRed 用原参考克隆的在 0.85～0.94，低于它的候选不要。只记提示不挡：
# 一两秒的短句普遍偏低（7-黄叛-受死 用户认可的现成品也只有 0.836），要和报告里的现成品比着看
音色下限 = 0.85


@dataclass
class 复核请求:
    """一个要复核的 wav。参考音频是这个角色的音色参考（音色项用）"""

    wav: str
    id: str = ''
    念: str = ''
    语言: str = '中文'
    语气: str = ''
    参考音频: str = ''


class 复核项:
    名: ClassVar[str] = ''
    说明: ClassVar[str] = ''
    云端: ClassVar[bool] = False
    付费: ClassVar[bool] = False

    def 缺什么(self) -> list[str]:
        """跑不了的原因（包、密钥），空表示能跑；不联网、不加载模型"""
        return []

    def 描述(self, 请求们: list[复核请求]) -> dict:
        """dry-run：要做的事（外部项写要发出去的东西，不含音频字节）"""
        return {'项': self.名, '请求': [asdict(q) for q in 请求们]}

    def 复核(self, 请求们: list[复核请求]) -> list[dict]:
        """和 请求们 一一对应的结果"""
        raise NotImplementedError


def _有包(*名们: str) -> list[str]:
    import importlib.util

    缺 = [n for n in 名们 if importlib.util.find_spec(n) is None]
    return [f'没装 {"、".join(缺)}（uv run --group voice-review）'] if 缺 else []


class 起伏(复核项):
    名 = '起伏'
    说明 = '音高跨度、标准差（半音）和响度跨度（dB）：棒读的跨度小'

    def 缺什么(self) -> list[str]:
        return _有包('numpy', 'librosa', 'parselmouth')

    def 复核(self, 请求们: list[复核请求]) -> list[dict]:
        return [音高响度(q.wav) for q in 请求们]


class 音色(复核项):
    名 = '音色'
    说明 = f'Resemblyzer 和角色参考音频的相似度（低于 {音色下限} 记提示）'

    def 缺什么(self) -> list[str]:
        return _有包('numpy', 'resemblyzer')

    def 复核(self, 请求们: list[复核请求]) -> list[dict]:
        import warnings

        with warnings.catch_warnings():  # resemblyzer 依赖的 webrtcvad 一 import pkg_resources 就报弃用
            warnings.simplefilter('ignore', UserWarning)
            from resemblyzer import VoiceEncoder, preprocess_wav  # pyright: ignore[reportMissingImports]

        enc = VoiceEncoder(device='cpu', verbose=False)
        参考向量: dict[str, object] = {}
        out = []
        for q in 请求们:
            if not q.参考音频:
                out.append({'说明': '没给参考音频'})
                continue
            if q.参考音频 not in 参考向量:
                参考向量[q.参考音频] = enc.embed_utterance(preprocess_wav(q.参考音频))
            s = _余弦(参考向量[q.参考音频], enc.embed_utterance(preprocess_wav(q.wav)))
            out.append({'相似度': s, **({'提示': f'低于旧项目挑候选的下限 {音色下限}'} if s < 音色下限 else {})})
        return out


class _外部(复核项):
    """付费的外部复核：现在只有 dry-run。启用要用户定（付费、把候选音频发出去），定了再照旧项目的 听写.py、语气.py 接上"""

    云端 = True
    付费 = True
    密钥文件: ClassVar[tuple[str, ...]] = ()

    def 缺什么(self) -> list[str]:
        缺 = [f'没有密钥 {p}' for p in self.密钥文件 if not Path(os.path.expanduser(p)).is_file()]
        return 缺 + ['还没接（付费，要用户定启用）']

    def 复核(self, 请求们: list[复核请求]) -> list[dict]:
        raise SystemExit(f'{self.名} 还没接：付费复核要用户定启用（先 anim voice review --项 {self.名} --dry-run 看要发什么）')


class 听写(_外部):
    名 = '听写'
    说明 = 'Qwen3-ASR（百炼 qwen3-asr-flash）听写，对不上再让 Gemini 听，去标点比字（同音也算对）'
    密钥文件 = ('~/.config/dashscope/api_key', '~/.config/grsai/api_key')

    def 描述(self, 请求们: list[复核请求]) -> dict:
        return {'项': self.名, '发': [{'qwen3-asr-flash': f'<{q.wav}>', '然后 gemini-3.8-flash（对不上时）': f'<{q.wav}>', '比字': q.念} for q in 请求们]}


class 语气(_外部):
    名 = '语气'
    说明 = '同一句的几个候选一起交给 Gemini，按台词的「语气」打 1～10 分，正反两个顺序各听一轮取平均'
    密钥文件 = ('~/.config/grsai/api_key',)

    def 描述(self, 请求们: list[复核请求]) -> dict:
        按句: dict[str, list[复核请求]] = {}
        for q in 请求们:
            按句.setdefault(q.id, []).append(q)
        return {'项': self.名, '发': [{'gemini-3.8-flash': [f'<{q.wav}>' for q in qs], '台词': qs[0].念, '语气': qs[0].语气, '轮': 2} for qs in 按句.values()]}


def 复核表() -> dict[str, type[复核项]]:
    return {c.名: c for c in (起伏, 音色, 听写, 语气)}


默认项 = ('起伏', '音色')


def 取项(名: str) -> 复核项:
    表 = 复核表()
    if 名 not in 表:
        raise SystemExit(f'没有复核项「{名}」，有：{"、".join(表)}')
    return 表[名]()


# ---------- 量法（照旧项目 语气.py） ----------


def _余弦(a, b) -> float:
    import numpy as np  # pyright: ignore[reportMissingImports]

    return round(float(np.dot(a, b) / np.linalg.norm(a) / np.linalg.norm(b)), 3)


def 音高响度(wav: str) -> dict:
    """音高（Praat 自相关基频，有声帧，半音）p5–p95 跨度、标准差；响度（50 ms 帧 RMS，最响往下 40 dB 内）p10–p90 跨度。有声帧不到 5 个返回 {}"""
    import librosa  # pyright: ignore[reportMissingImports]
    import numpy as np  # pyright: ignore[reportMissingImports]
    import parselmouth  # pyright: ignore[reportMissingImports]

    y, sr = librosa.load(wav, sr=16000)
    f = parselmouth.Sound(y, sr).to_pitch_ac(time_step=0.01, pitch_floor=60, pitch_ceiling=700).selected_array['frequency']
    f = f[f > 0]
    if len(f) < 5:
        return {}
    st = 12 * np.log2(f / np.median(f))
    rms = librosa.feature.rms(y=y, frame_length=800, hop_length=400)[0]
    db = 20 * np.log10(rms + 1e-9)
    db = db[db > db.max() - 40]
    return {'基频中位Hz': round(float(np.median(f)), 1), '音高跨度st': round(float(np.percentile(st, 95) - np.percentile(st, 5)), 1),
            '音高标准差st': round(float(st.std()), 2), '响度跨度dB': round(float(np.percentile(db, 90) - np.percentile(db, 10)), 1)}


# ---------- 比字（听写接上后用；纯函数） ----------

# 去掉标点、空白、语气记号（↗↘）、大小写；外来词按同一个写法；儿化的「儿」听写常不写；叹词「诶」两个 ASR 都写成「哎」；「哒」念 da
同写 = [('sama', '萨玛'), ('萨马', '萨玛'), ('撒玛', '萨玛'), ('哪儿', '哪'), ('哎', '诶'), ('欸', '诶'), ('唉', '诶'), ('哒', 'da')]


def 规范(s: str) -> str:
    s = s.lower()
    # 日文：平假名换成片假名，促音「ッ」、长音「ー」听写时常漏，比字时去掉
    s = ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s).replace('ッ', '').replace('ー', '')
    s = re.sub(r'[\s，。！？、…—,.!?~～↗↘「」“”"\'：:；;（）()·•]', '', s)
    for 变, 正 in 同写:
        s = s.replace(变, 正)
    return s


def 带调拼音(s: str) -> str:
    from pypinyin import Style, lazy_pinyin  # pyright: ignore[reportMissingImports]

    return ' '.join(lazy_pinyin(规范(s), style=Style.TONE3, neutral_tone_with_five=True))


def 比字(念: str, 听写们: list[str]) -> dict:
    """任一份听写去标点后一字不差算过；字不同但带声调拼音一样（录音分不出同音字）也算过，记 同音"""
    if any(规范(t) == 规范(念) for t in 听写们):
        return {'过': True}
    if 带调拼音(念) in {带调拼音(t) for t in 听写们}:
        return {'过': True, '同音': True}
    return {'过': False}


def 跑(项名们: list[str], 请求们: list[复核请求], 只描述: bool = False) -> dict:
    """{项名: 结果们}；只描述 时 {项名: {缺, 描述}}。缺东西的项不跑，结果里写 缺"""
    out: dict = {}
    for 名 in 项名们:
        项 = 取项(名)
        缺 = 项.缺什么()
        if 只描述:
            out[名] = {'缺': 缺, '描述': 项.描述(请求们)}
        elif 缺:
            out[名] = {'缺': 缺}
        else:
            out[名] = {'结果': 项.复核(请求们)}
    return out
