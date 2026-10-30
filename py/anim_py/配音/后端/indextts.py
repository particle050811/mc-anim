"""IndexTTS2：音色和语气分开给（音色 = 角色参考，语气 = 一段情绪参考录音，强度 emo_alpha）。用户 10-15 定：FireRedTTS3 没感情的句子，用户录一句当语气参考，换它重念。

两种跑法：本机（IndexTTS 仓库自己的 venv，checkpoints_2）和 RunningHub 云端（按次收费；第 6 章 6-1-3、6-4-3a 那几句是它出的，旧项目 工具/配音/语气参考.py）。
强度缺省 0.6（用户 10-15 在 0.6/0.8/1.0 里挑的）。RunningHub 那边借公开工作流的 id 提交自拼的图，节点参数照它的 IndexTTS2Run。
合成.参数 里的采样参数（top_k、top_p、temperature、num_beams 等）两边都照传：本机给 infer，云端盖到 IndexTTS2Run 节点同名的输入上。
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path

from . import 合成结果, 合成请求, 后端

_跑本机 = Path(__file__).with_name('_indextts本机.py')
默认强度 = 0.6


class IndexTTS2本机(后端):
    名 = 'indextts2-本机'
    说明 = 'IndexTTS2 在本机跑（音色 + 语气参考录音）'
    默认参数 = {'目录': '', '模型目录': 'checkpoints_2'}

    def _python(self) -> Path:
        return Path(self.配置['目录']) / ('.venv/Scripts/python.exe' if os.name == 'nt' else '.venv/bin/python')

    def 缺什么(self) -> list[str]:
        d = self.配置['目录']
        if not d:
            return ['没给 IndexTTS 目录（anim 配置 indextts，环境变量 ANIM_INDEXTTS）']
        缺 = []
        if not self._python().exists():
            缺.append(f'{self._python()} 不在（IndexTTS 的 venv 没建）')
        if not (Path(d) / self.配置['模型目录'] / 'config.yaml').is_file():
            缺.append(f'{d}/{self.配置["模型目录"]}/config.yaml 不在（IndexTTS2 模型没下）')
        return 缺

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        批 = {'模型目录': self.配置['模型目录'], '请求': [{'念': r.念, '参考音频': r.参考音频, '语气参考': r.语气参考, '强度': r.语气强度 or 默认强度, '输出': r.输出, '种子': r.种子,
                                                  '生成参数': {k: v for k, v in self.参数(r).items() if k not in ('目录', '模型目录')}} for r in 请求们]}
        with tempfile.TemporaryDirectory() as t:
            批文件 = Path(t) / '批.json'
            批文件.write_text(json.dumps(批, ensure_ascii=False), encoding='utf-8')
            r = subprocess.run([str(self._python()), str(_跑本机), str(批文件)], cwd=self.配置['目录'], capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0:
            return [合成结果(q.id, q.种子, q.输出, False, f'IndexTTS2 退出码 {r.returncode}：{r.stderr.strip()[-500:]}') for q in 请求们]
        结果 = json.loads(r.stdout.strip().splitlines()[-1])
        return [合成结果(q.id, q.种子, q.输出, bool(x['成功']), x.get('说明', '')) for q, x in zip(请求们, 结果)]


class IndexTTS2RunningHub(后端):
    名 = 'indextts2-runninghub'
    说明 = 'IndexTTS2 在 RunningHub 云端跑（按次收费）'
    本机 = False
    云端 = True
    付费 = True
    默认参数 = {'接口': 'https://www.runninghub.cn', '工作流': '1965717630348886018', '密钥文件': '~/.config/runninghub/api_key'}

    def 缺什么(self) -> list[str]:
        p = Path(os.path.expanduser(self.配置['密钥文件']))
        return [] if p.is_file() else [f'没有 RunningHub 密钥 {p}']

    def _图(self, 音色名: str, 语气名: str, 念: str, 强度: float, 参数: dict | None = None) -> dict:
        图 = {
            'timbre': {'class_type': 'LoadAudio', 'inputs': {'audio': 音色名, 'audioUI': ''}},
            'emotion': {'class_type': 'LoadAudio', 'inputs': {'audio': 语气名, 'audioUI': ''}},
            'text': {'class_type': 'CR Prompt Text', 'inputs': {'prompt': 念}},
            'tts0': {'class_type': 'IndexTTS2Run', 'inputs': {
                'audio': ['timbre', 0], 'emo_audio_prompt': ['emotion', 0], 'emo_alpha': 强度, 'text': ['text', 0],
                'use_emo_text': False, 'emo_text': '', 'emo_vector': '', 'use_random': False,
                'num_beams': 3, 'top_p': 0.8, 'top_k': 30, 'temperature': 0.8, 'max_text_tokens_per_sentence': 120, 'max_mel_tokens': 1500,
                'use_emo_text_s2': False, 'emo_text_s2': '', 'emo_vector_s2': '[0, 0, 0, 0, 0, 0, 0, 0]', 'emo_alpha_s2': 1, 'use_random_s2': False,
                'custom_cuda_kernel': False, 'unload_model': False, 'deepspeed': False,
            }},
            'save0': {'class_type': 'SaveAudio', 'inputs': {'audio': ['tts0', 0], 'filename_prefix': 'audio/ComfyUI', 'audioUI': ''}},
        }
        节点 = 图['tts0']['inputs']
        for k, v in (参数 or {}).items():  # 只盖节点里本来就有、不是连线的输入
            if k in 节点 and not isinstance(节点[k], list):
                节点[k] = v
        return 图

    def 描述(self, 请求: 合成请求) -> dict:
        p = self.参数(请求)
        return {'后端': self.名, 'POST': p['接口'] + '/task/openapi/create', '工作流': p['工作流'],
                'workflow': self._图(f'<上传 {请求.参考音频}>', f'<上传 {请求.语气参考 or "（缺语气参考）"}>', 请求.念, 请求.语气强度 or 默认强度, p), '输出': 请求.输出}

    def _key(self) -> str:
        return Path(os.path.expanduser(self.配置['密钥文件'])).read_text(encoding='utf-8').strip()

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(self.配置['接口'] + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        return json.load(urllib.request.urlopen(req, timeout=120))

    def _上传(self, 文件: str) -> str:
        boundary = uuid.uuid4().hex
        fields = b''.join(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in (('apiKey', self._key()), ('fileType', 'input')))
        body = fields + (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{uuid.uuid4().hex}.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
                         + Path(文件).read_bytes() + f'\r\n--{boundary}--\r\n'.encode())
        req = urllib.request.Request(self.配置['接口'] + '/task/openapi/upload', data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
        r = json.load(urllib.request.urlopen(req, timeout=300))
        if r.get('code') != 0:
            raise RuntimeError(f'RunningHub 上传失败：{r}')
        return r['data']['fileName']

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        out = []
        for q in 请求们:
            if not q.语气参考:
                out.append(合成结果(q.id, q.种子, q.输出, False, 'IndexTTS2 要语气参考录音（--语气参考）'))
                continue
            try:
                图 = self._图(self._上传(q.参考音频), self._上传(q.语气参考), q.念, q.语气强度 or 默认强度, self.参数(q))
                r = self._post('/task/openapi/create', {'apiKey': self._key(), 'workflowId': self.配置['工作流'], 'workflow': json.dumps(图, ensure_ascii=False)})
                if r.get('code') != 0:
                    raise RuntimeError(f'提交失败：{r}')
                task = r['data']['taskId']
                while True:
                    time.sleep(5)
                    r = self._post('/task/openapi/outputs', {'apiKey': self._key(), 'taskId': task})
                    if r.get('code') == 0 and r.get('data'):
                        url = next(i['fileUrl'] for i in r['data'] if str(i.get('nodeId')) == 'save0')
                        break
                    if r.get('code') not in (804, 813):  # 运行中、排队中
                        raise RuntimeError(f'任务失败：{json.dumps(r, ensure_ascii=False)[:500]}')
                with tempfile.TemporaryDirectory() as t:  # 结果是 flac，转 wav
                    src = Path(t) / Path(url).name
                    urllib.request.urlretrieve(url, src)
                    subprocess.run([os.environ.get('ANIM_FFMPEG') or 'ffmpeg', '-v', 'error', '-y', '-i', str(src), q.输出], check=True)
                out.append(合成结果(q.id, q.种子, q.输出, True, f'RunningHub 任务 {task}'))
            except Exception as e:  # noqa: BLE001
                out.append(合成结果(q.id, q.种子, q.输出, False, f'{type(e).__name__}: {e}'))
        return out
