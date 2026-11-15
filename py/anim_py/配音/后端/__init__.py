"""TTS 后端：可插拔，按名字取。anim voice gen 把一批合成请求交给一个后端，后端出原件 wav；挑候选、裁静音、拉响度、登记都在后端之外，换后端不影响别的步骤。

加一个后端：在本目录写一个 后端 的子类，填 名、说明、本机/云端/付费，实现 缺什么（本机缺的程序、模型、密钥）、描述（dry-run 打出来的请求）、合成；
在下面的 后端表 里登记。云端的要 --允许云端 才跑，付费的要 --允许付费（anim 那边挡）；dry-run 不碰网络和模型。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import ClassVar

# 台词.toml 写的语言 → 对齐器要的写法
language_names = {'中文': 'Chinese', '日语': 'Japanese', '英语': 'English', '粤语': 'Cantonese'}


@dataclass
class SynthRequest:
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
    backend_params: dict = field(default_factory=dict)  # 后端自己的参数，覆盖默认


@dataclass
class SynthResult:
    id: str
    种子: int
    输出: str
    成功: bool
    说明: str = ''


class Backend:
    名: ClassVar[str] = ''
    说明: ClassVar[str] = ''
    runs_local: ClassVar[bool] = True  # 在本机跑模型
    cloud: ClassVar[bool] = False  # 要把参考音频和台词发到外部服务
    paid: ClassVar[bool] = False  # 按次收费
    default_params: ClassVar[dict] = {}
    # 只跟这台机器有关的设置（程序目录、服务地址、密钥位置）：不写进候选说明和资产表的 来源（仓库公开）
    local_keys: ClassVar[frozenset[str]] = frozenset({'目录', '地址', '接口', '令牌文件', '密钥文件'})

    def __init__(self, config: dict | None = None):
        """配置：后端的全局设置（程序目录、服务地址等，anim 从配置取了传进来），和 默认参数 合并"""
        self.backend_config = {**self.default_params, **(config or {})}

    def backend_params(self, request: SynthRequest) -> dict:
        return {**self.backend_config, **request.backend_params}

    def record_params(self, request: SynthRequest) -> dict:
        """这个候选是用什么参数出的（写进候选旁的 .json，定稿时进资产表的 来源）"""
        return {k: v for k, v in self.backend_params(request).items() if k not in self.local_keys}

    def missing_items(self) -> list[str]:
        """跑不了的原因（程序、模型、密钥不在），空表示能跑；不联网、不加载模型"""
        return []

    def map_descriptor(self, request: SynthRequest) -> dict:
        """dry-run：要发出去或交给模型的东西（不含音频字节）"""
        return {'后端': self.名, **asdict(request), '参数': self.backend_params(request)}

    def synthesize(self, requests: list[SynthRequest]) -> list[SynthResult]:
        raise NotImplementedError


def backend_table() -> dict[str, type[Backend]]:
    from . import image_flow

    return {c.名: c for c in (image_flow.ImageFlow,)}


def get_backend(backend_name: str, config: dict | None = None) -> Backend:
    backend_map = backend_table()
    if backend_name not in backend_map:
        raise SystemExit(f'没有 TTS 后端「{backend_name}」，有：{"、".join(backend_map)}')
    return backend_map[backend_name](config)
