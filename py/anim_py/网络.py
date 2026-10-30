"""HTTP 请求的唯一入口：连本机服务（127.0.0.0/8、::1、localhost）一律直连，不走代理。
urllib 照 HTTP_PROXY 走代理，没设 NO_PROXY 时连 127.0.0.1 也交给代理（Windows 实机：本机 TTS 服务报 502、超时）；
连外面的照旧按环境变量（HTTP_PROXY、NO_PROXY）和系统设置走。
"""
from __future__ import annotations

import ipaddress
import urllib.request
from urllib.parse import urlsplit

_直连 = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def 是本机(url: str) -> bool:
    host = (urlsplit(url).hostname or '').rstrip('.')
    if host == 'localhost' or host.endswith('.localhost'):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def 打开(请求: str | urllib.request.Request, timeout: float):
    """同 urllib.request.urlopen；本机地址绕开代理"""
    url = 请求.full_url if isinstance(请求, urllib.request.Request) else 请求
    return _直连.open(请求, timeout=timeout) if 是本机(url) else urllib.request.urlopen(请求, timeout=timeout)
