"""FireRedTTS3 零样本克隆：本机跑（FireRedTTS3 仓库自己的 venv，一批请求只加载一次模型）和魔搭创空间云端两种。

参数照用户 10-10 定的配音做法：cfg 1.2、30 步（官方默认 2.0、10 步，九胡的声音有电音）。第 6、7 章的配音都是魔搭云端出的（旧项目 工具/配音/魔搭.py）。
本机：fp32 推理 MPS 占约 16 GB、一句 6 秒约 16 秒（FireRedTTS3/本地服务说明.md、start-server.sh）；bf16 省一半内存但有电音（用户 10-10 比过）。
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path

from ...网络 import 打开
from . import 合成结果, 合成请求, 后端, 语言名

_跑本机 = Path(__file__).with_name('_firered本机.py')


class FireRed本机(后端):
    名 = 'firered-本机'
    说明 = 'FireRedTTS3 在本机克隆（fp32 约 16 GB 统一内存，走资源闸）'
    默认参数 = {'目录': '', 'cfg': 1.2, '步数': 30, '精度': 'fp32', '设备': ''}

    def _python(self) -> Path:
        d = Path(self.配置['目录'])
        return d / ('.venv/Scripts/python.exe' if os.name == 'nt' else '.venv/bin/python')

    def 缺什么(self) -> list[str]:
        d = self.配置['目录']
        if not d:
            return ['没给 FireRedTTS3 目录（anim 配置 firered，环境变量 ANIM_FIRERED）']
        缺 = []
        if not self._python().exists():
            缺.append(f'{self._python()} 不在（FireRedTTS3 的 venv 没建）')
        if not (Path(d) / 'pretrained_models' / 'fireredtts3_base').is_dir():
            缺.append(f'{d}/pretrained_models/fireredtts3_base 不在（模型没下）')
        return 缺

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        批 = {
            '目录': self.配置['目录'],
            '请求': [{'念': r.念, '语言': 语言名.get(r.语言, r.语言), '参考音频': r.参考音频, '参考逐字稿': r.参考逐字稿, '种子': r.种子, '输出': r.输出,
                      'cfg': self.参数(r)['cfg'], '步数': self.参数(r)['步数']} for r in 请求们],
        }
        env = {**os.environ, 'PYTORCH_ENABLE_MPS_FALLBACK': '1', 'FIRERED_DTYPE': self.配置['精度']}
        if self.配置['设备']:
            env['FIRERED_DEVICE'] = self.配置['设备']
        with tempfile.TemporaryDirectory() as t:
            批文件 = Path(t) / '批.json'
            批文件.write_text(json.dumps(批, ensure_ascii=False), encoding='utf-8')
            r = subprocess.run([str(self._python()), str(_跑本机), str(批文件)], cwd=self.配置['目录'], env=env, capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0:
            return [合成结果(q.id, q.种子, q.输出, False, f'FireRedTTS3 退出码 {r.returncode}：{r.stderr.strip()[-500:]}') for q in 请求们]
        结果 = json.loads(r.stdout.strip().splitlines()[-1])
        return [合成结果(q.id, q.种子, q.输出, bool(x['成功']), x.get('说明', '')) for q, x in zip(请求们, 结果)]


class FireRed魔搭(后端):
    名 = 'firered-魔搭'
    说明 = 'FireRedTTS3 魔搭创空间（第 6、7 章用的）：参考音频和台词发到魔搭，要访问令牌'
    本机 = False
    云端 = True
    默认参数 = {'接口': 'https://studio-fireredteam-fireredtts3.api-inference.modelscope.net/gradio_api', '令牌文件': '~/.config/modelscope/api_key', 'cfg': 1.2, '步数': 30}

    def _令牌(self) -> str:
        return Path(os.path.expanduser(self.配置['令牌文件'])).read_text(encoding='utf-8').strip()

    def 缺什么(self) -> list[str]:
        p = Path(os.path.expanduser(self.配置['令牌文件']))
        return [] if p.is_file() else [f'没有魔搭访问令牌 {p}']

    def _头(self) -> dict:
        return {'User-Agent': 'curl/8.7.1', 'Authorization': 'Bearer ' + self._令牌()}

    def _上传(self, 路径: str) -> str:
        boundary = uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="files"; filename="{os.path.basename(路径).encode().hex()}.wav"\r\n'
                'Content-Type: audio/wav\r\n\r\n').encode() + Path(路径).read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
        r = urllib.request.Request(self.配置['接口'] + '/upload', body, {**self._头(), 'Content-Type': f'multipart/form-data; boundary={boundary}'})
        return json.load(打开(r, timeout=120))[0]

    def _调(self, data: list, 输出: str) -> tuple[bool, str]:
        api = self.配置['接口']
        r = urllib.request.Request(api + '/call/voice_clone', json.dumps({'data': data}).encode(), {**self._头(), 'Content-Type': 'application/json'})
        eid = json.load(打开(r, timeout=60))['event_id']
        s = 打开(urllib.request.Request(api + f'/call/voice_clone/{eid}', headers=self._头()), timeout=900).read().decode()
        ev = None
        for line in s.splitlines():
            if line.startswith('event:'):
                ev = line[6:].strip()
            elif line.startswith('data:') and ev == 'complete':
                f = json.loads(line[5:])[0]
                url = api + '/file=' + f['path']  # 返回的 url 指向要登录的 ms.show，改从 API 域名取
                Path(输出).write_bytes(打开(urllib.request.Request(url, headers=self._头()), timeout=120).read())
                return True, ''
            elif line.startswith('data:') and ev == 'error':
                return False, f'魔搭报错 {line[:300]}'
        return False, f'魔搭没返回结果 {s[:300]}'

    def 描述(self, 请求: 合成请求) -> dict:
        p = self.参数(请求)
        return {'后端': self.名, 'POST': p['接口'] + '/call/voice_clone',
                'data': ['<上传的参考音频 ' + 请求.参考音频 + '>', 请求.参考逐字稿, 请求.念, 语言名.get(请求.语言, 请求.语言), p['cfg'], p['步数'], 请求.种子, True], '输出': 请求.输出}

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        out = []
        for q in 请求们:
            p = self.参数(q)
            try:
                上传 = self._上传(q.参考音频)
                ok, 说明 = self._调([{'path': 上传, 'meta': {'_type': 'gradio.FileData'}}, q.参考逐字稿, q.念, 语言名.get(q.语言, q.语言), p['cfg'], p['步数'], q.种子, True], q.输出)
            except Exception as e:  # noqa: BLE001 — 网络错一句记一句，不拖垮整批
                ok, 说明 = False, f'{type(e).__name__}: {e}'
            out.append(合成结果(q.id, q.种子, q.输出, ok, 说明))
        return out
