"""GPT-SoVITS：连本机已经起好的 api_v2.py 服务（python api_v2.py -a 127.0.0.1 -p 9880），POST /tts。服务要先由人起好、换好角色的权重（如 九胡 训练的 v2Pro）；
本后端不起服务、不换权重（那是 GPU 上的常驻进程，归人管）。接口照 GPT-SoVITS/api_v2.py 文件头的说明。
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

from ...网络 import 打开
from . import 合成结果, 合成请求, 后端, 语言码


class GPTSoVITS(后端):
    名 = 'gpt-sovits'
    说明 = 'GPT-SoVITS api_v2 服务（要先起好服务、换好角色权重）'
    默认参数 = {'地址': 'http://127.0.0.1:9880', 'text_split_method': 'cut5', 'batch_size': 1}

    def _体(self, q: 合成请求) -> dict:
        p = self.参数(q)
        return {'text': q.念, 'text_lang': 语言码.get(q.语言, 'zh'), 'ref_audio_path': q.参考音频, 'prompt_text': q.参考逐字稿, 'prompt_lang': 语言码.get(p.get('参考语言', '中文'), 'zh'),
                'text_split_method': p['text_split_method'], 'batch_size': p['batch_size'], 'media_type': 'wav', 'streaming_mode': False, 'seed': q.种子}

    def 缺什么(self) -> list[str]:
        try:
            打开(self.配置['地址'] + '/docs', timeout=3)
            return []
        except (urllib.error.URLError, OSError) as e:
            return [f'GPT-SoVITS 服务 {self.配置["地址"]} 没起（{e}）']

    def 描述(self, 请求: 合成请求) -> dict:
        return {'后端': self.名, 'POST': self.参数(请求)['地址'] + '/tts', 'json': self._体(请求), '输出': 请求.输出}

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        out = []
        for q in 请求们:
            try:
                r = urllib.request.Request(self.参数(q)['地址'] + '/tts', json.dumps(self._体(q)).encode(), {'Content-Type': 'application/json'})
                Path(q.输出).parent.mkdir(parents=True, exist_ok=True)
                Path(q.输出).write_bytes(打开(r, timeout=600).read())
                out.append(合成结果(q.id, q.种子, q.输出, True))
            except Exception as e:  # noqa: BLE001
                out.append(合成结果(q.id, q.种子, q.输出, False, f'{type(e).__name__}: {e}'))
        return out
