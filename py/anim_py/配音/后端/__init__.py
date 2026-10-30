"""TTS 后端：可插拔，按名字取。anim voice gen 把一批合成请求交给一个后端，后端出原件 wav；挑候选、裁静音、拉响度、登记都在后端之外，换后端不影响别的步骤。

加一个后端：在本目录写一个 后端 的子类，填 名、说明、本机/云端/付费，实现 缺什么（本机缺的程序、模型、密钥）、描述（dry-run 打出来的请求）、合成；
在下面的 后端表 里登记。云端的要 --允许云端 才跑，付费的要 --允许付费（anim 那边挡）；dry-run 不碰网络和模型。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import ClassVar

# 台词.toml 写的语言 → 各后端常用的写法
语言码 = {'中文': 'zh', '日语': 'ja', '英语': 'en', '粤语': 'yue'}
语言名 = {'中文': 'Chinese', '日语': 'Japanese', '英语': 'English', '粤语': 'Cantonese'}


@dataclass
class 合成请求:
    """一个候选：一句台词用一个种子念一遍。路径都是 anim 给的绝对路径。"""

    id: str
    念: str  # 交给 TTS 的字（台词的「念」，没写同「文本」）
    语言: str  # 中文、日语、英语、粤语
    参考音频: str  # 角色音色参考 wav
    参考逐字稿: str
    种子: int
    输出: str  # 候选 wav 写到这里
    语气: str = ''  # 这句的情境和语气描述（只给支持文字控制语气的后端）
    语气参考: str = ''  # 情绪参考 wav（IndexTTS2 这类分开音色和语气的后端）
    语气强度: float | None = None
    角色: str = ''  # 台词.toml 的角色（按名字取音色的后端用）
    参数: dict = field(default_factory=dict)  # 后端自己的参数，覆盖默认


@dataclass
class 合成结果:
    id: str
    种子: int
    输出: str
    成功: bool
    说明: str = ''


class 后端:
    名: ClassVar[str] = ''
    说明: ClassVar[str] = ''
    本机: ClassVar[bool] = True  # 在本机跑模型
    云端: ClassVar[bool] = False  # 要把参考音频和台词发到外部服务
    付费: ClassVar[bool] = False  # 按次收费
    默认参数: ClassVar[dict] = {}
    # 只跟这台机器有关的设置（程序目录、服务地址、密钥位置）：不写进候选说明和资产表的 来源（仓库公开）
    本机键: ClassVar[frozenset[str]] = frozenset({'目录', '地址', '接口', '令牌文件', '密钥文件'})

    def __init__(self, 配置: dict | None = None):
        """配置：后端的全局设置（程序目录、服务地址等，anim 从配置取了传进来），和 默认参数 合并"""
        self.配置 = {**self.默认参数, **(配置 or {})}

    def 参数(self, 请求: 合成请求) -> dict:
        return {**self.配置, **请求.参数}

    def 记录参数(self, 请求: 合成请求) -> dict:
        """这个候选是用什么参数出的（写进候选旁的 .json，定稿时进资产表的 来源）"""
        return {k: v for k, v in self.参数(请求).items() if k not in self.本机键}

    def 缺什么(self) -> list[str]:
        """跑不了的原因（程序、模型、密钥不在），空表示能跑；不联网、不加载模型"""
        return []

    def 描述(self, 请求: 合成请求) -> dict:
        """dry-run：要发出去或交给模型的东西（不含音频字节）"""
        return {'后端': self.名, **asdict(请求), '参数': self.参数(请求)}

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        raise NotImplementedError


def 后端表() -> dict[str, type[后端]]:
    from . import firered, gpt_sovits, indextts, openai_speech

    表: dict[str, type[后端]] = {}
    for c in (firered.FireRed本机, firered.FireRed魔搭, indextts.IndexTTS2本机, indextts.IndexTTS2RunningHub, gpt_sovits.GPTSoVITS, openai_speech.OpenAI语音):
        表[c.名] = c
    return 表


def 取后端(名: str, 配置: dict | None = None) -> 后端:
    表 = 后端表()
    if 名 not in 表:
        raise SystemExit(f'没有 TTS 后端「{名}」，有：{"、".join(表)}')
    return 表[名](配置)
