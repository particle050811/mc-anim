"""配音走 image-flow：调模型的事（密钥、计费、任务记录、渠道增减）都归 image-flow，这里只调它的命令行，把产物转成 wav。用户 10-31 定（docs/决策/0009）。

默认模型是 RunningHub 的 IndexTTS2：音色和语气分开给，语气强度 0.6 是用户 10-15 在 0.6/0.8/1.0 里挑的，缺省值写在 image-flow 的 settings.json。
IndexTTS2 的节点没有种子输入，种子只给候选编号和文件名用，没传给模型；同一句多个候选靠每次采样不同。
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import replace
from pathlib import Path

from . import 合成结果, 合成请求, 后端

_自己的键 = ('imgflow', '模型', '等待秒')


class ImageFlow(后端):
    名 = 'image-flow'
    说明 = '交给 image-flow 的命令行（默认 RunningHub 的 IndexTTS2，按次收费，不用开 VS Code）'
    本机 = False
    云端 = True
    付费 = True
    默认参数 = {'imgflow': '~/Developer/personal/image-flow/skills/image-flow/imgflow.mjs', '模型': 'custom:indextts2', '等待秒': 900}
    本机键 = 后端.本机键 | {'imgflow', '等待秒'}

    def _壳(self) -> Path:
        return Path(os.path.expanduser(str(self.配置['imgflow'])))

    def 缺什么(self) -> list[str]:
        """模型配没配要问后台，这里不问（本方法不联网、不起进程）；没配 gen 时 image-flow 会在花钱前报错"""
        壳 = self._壳()
        if not 壳.is_file():
            return [f'{壳} 不在（anim 配置 image_flow，环境变量 ANIM_IMAGE_FLOW）']
        if not (壳.parent / 'lib' / 'headless.cjs').is_file():
            return [f'{壳.parent}/lib/headless.cjs 不在（到 image-flow 仓库跑 npm run compile）']
        return []

    def _命令(self, q: 合成请求) -> list[str]:
        p = self.参数(q)
        命令 = ['node', str(self._壳()), 'speak', '--text', q.念, '--model', str(p['模型']), '--voice_ref', q.参考音频, '--poll', str(p['等待秒'])]
        if q.语气参考:
            命令 += ['--emotion_ref', q.语气参考]
            if q.语气强度 is not None:
                命令 += ['--param', f'emo_alpha={q.语气强度}']
        for k, v in p.items():
            if k not in _自己的键:
                命令 += ['--param', f'{k}={v}']
        return 命令

    def 描述(self, 请求: 合成请求) -> dict:
        return {'后端': self.名, '命令': self._命令(请求)[1:], '输出': 请求.输出}

    def _念一句(self, q: 合成请求) -> str:
        # 花钱之前建好：这句第一次出候选时目录还不存在
        Path(q.输出).parent.mkdir(parents=True, exist_ok=True)
        # 资产按 sha 存、没有后缀，image-flow 按后缀认音频；配音参考都是 wav。它提交时就把录音读走了，临时目录用完就删
        with tempfile.TemporaryDirectory(prefix='anim-配音-') as 临时:
            def 带后缀(文件: str, 名: str) -> str:
                if not 文件 or Path(文件).suffix:
                    return 文件
                return shutil.copyfile(文件, os.path.join(临时, f'{名}.wav'))

            结果 = self._跑(replace(q, 参考音频=带后缀(q.参考音频, '音色'), 语气参考=带后缀(q.语气参考, '语气')))
        if 结果.get('gen_status') != 'success':
            raise RuntimeError(f'image-flow {结果.get("gen_status")}（任务 {结果.get("submit_id", "没建成")}）：{结果.get("fail_reason", "")}')
        产物 = 结果['outputs'][0]['path']
        # IndexTTS2 出 flac，后面的步骤都按 wav
        subprocess.run([os.environ.get('ANIM_FFMPEG') or 'ffmpeg', '-v', 'error', '-y', '-i', 产物, q.输出], check=True)
        return f'image-flow 任务 {结果["submit_id"]}'

    def _跑(self, q: 合成请求) -> dict:
        r = subprocess.run(self._命令(q), capture_output=True, text=True, encoding='utf-8', timeout=float(self.参数(q)['等待秒']) + 180)
        try:
            return json.loads(r.stdout)
        except json.JSONDecodeError:
            raise RuntimeError(f'image-flow 退出码 {r.returncode}：{(r.stdout or r.stderr).strip()[-500:]}') from None

    def 合成(self, 请求们: list[合成请求]) -> list[合成结果]:
        out = []
        for q in 请求们:
            try:
                out.append(合成结果(q.id, q.种子, q.输出, True, self._念一句(q)))
            except Exception as e:  # noqa: BLE001
                out.append(合成结果(q.id, q.种子, q.输出, False, f'{type(e).__name__}: {e}'))
        return out
