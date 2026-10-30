"""OpenAI 兼容的 POST /v1/audio/speech（FireRedTTS3/server.py、image-flow 的 openai-speech 协议都是这个形状）。
voice 填服务那边音色库里的名字（参考音频不经接口上传，由服务自己管）；参数 音色 不给时用台词的角色名。seed 是 FireRedTTS3 服务多收的字段。
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from . import 合成结果, 合成请求, 后端, 语言码


class OpenAI语音(后端):
    名 = 'openai-speech'
    说明 = 'OpenAI 兼容的 /v1/audio/speech 服务（如 FireRedTTS3 本地服务 127.0.0.1:47900）；音色用服务自己的音色库'
    默认参数 = {'地址': 'http://127.0.0.1:47900', 'model': 'fireredtts3-base', '音色': '', '密钥环境变量': ''}

    def _体(self, q: 合成请求) -> dict:
        p = self.参数(q)
        return {'model': p['model'], 'input': q.念, 'voice': p['音色'] or q.id.split('-')[1], 'response_format': 'wav', 'language': 语言码.get(q.语言, 'zh'), 'seed': q.种子,
                **({'instructions': q.语气} if q.语气 and 'instruct' in p['model'] else {})}

    def _头(self) -> dict:
        h = {'Content-Type': 'application/json'}
        if self.配置['密钥环境变量'] and os.environ.get(self.配置['密钥环境变量']):
            h['Authorization'] = 'Bearer ' + os.environ[self.配置['密钥环境变量']]
        return h

    def 缺什么(self) -> list[str]:
        try:
            urllib.request.urlopen(urllib.request.Request(self.配置['地址'] + '/v1/models', headers=self._头()), timeout=3)
            return []
        except (urllib.error.URLError, OSError) as e:
            return [f'服务 {self.配置["地址"]} 连不上（{e}）']

    def 描述(self, 请求: 合成请求) -> dict:
        return {'后端': self.名, 'POST': self.参数(请求)['地址'] + '/v1/audio/speech', 'json': self._体(请求), '输出': 请求.输出}

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        out = []
        for q in 请求们:
            try:
                r = urllib.request.Request(self.参数(q)['地址'] + '/v1/audio/speech', json.dumps(self._体(q), ensure_ascii=False).encode(), self._头())
                Path(q.输出).parent.mkdir(parents=True, exist_ok=True)
                Path(q.输出).write_bytes(urllib.request.urlopen(r, timeout=900).read())
                out.append(合成结果(q.id, q.种子, q.输出, True))
            except Exception as e:  # noqa: BLE001
                out.append(合成结果(q.id, q.种子, q.输出, False, f'{type(e).__name__}: {e}'))
        return out
