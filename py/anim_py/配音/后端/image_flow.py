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

from . import SynthResult, SynthRequest, Backend

_own_keys = ('imgflow', '模型', '等待秒')


class ImageFlow(Backend):
    名 = 'image-flow'
    说明 = '交给 image-flow 的命令行（默认 RunningHub 的 IndexTTS2，按次收费，不用开 VS Code）'
    runs_local = False
    cloud = True
    paid = True
    default_params = {'imgflow': '~/Developer/personal/image-flow/skills/image-flow/imgflow.mjs', '模型': 'custom:indextts2', '等待秒': 900}
    local_keys = Backend.local_keys | {'imgflow', '等待秒'}

    def _shell_path(self) -> Path:
        return Path(os.path.expanduser(str(self.backend_config['imgflow'])))

    def missing_items(self) -> list[str]:
        """模型配没配要问后台，这里不问（本方法不联网、不起进程）；没配 gen 时 image-flow 会在花钱前报错"""
        shell_path = self._shell_path()
        if not shell_path.is_file():
            return [f'{shell_path} 不在（anim 配置 image_flow，环境变量 ANIM_IMAGE_FLOW）']
        if not (shell_path.parent / 'lib' / 'headless.cjs').is_file():
            return [f'{shell_path.parent}/lib/headless.cjs 不在（到 image-flow 仓库跑 npm run compile）']
        return []

    def _build_command(self, q: SynthRequest) -> list[str]:
        p = self.参数(q)
        command = ['node', str(self._shell_path()), 'speak', '--text', q.spoken, '--model', str(p['模型']), '--voice_ref', q.参考音频, '--poll', str(p['等待秒'])]
        if q.toneRef:
            command += ['--emotion_ref', q.toneRef]
            if q.语气强度 is not None:
                command += ['--param', f'emo_alpha={q.语气强度}']
        for k, v in p.items():
            if k not in _own_keys:
                command += ['--param', f'{k}={v}']
        return command

    def describe(self, request: SynthRequest) -> dict:
        return {'backend': self.名, 'command': self._build_command(request)[1:], 'output': request.output}

    def _speak_sentence(self, q: SynthRequest) -> str:
        # 花钱之前建好：这句第一次出候选时目录还不存在
        Path(q.output).parent.mkdir(parents=True, exist_ok=True)
        # 资产按 sha 存、没有后缀，image-flow 按后缀认音频；配音参考都是 wav。它提交时就把录音读走了，临时目录用完就删
        with tempfile.TemporaryDirectory(prefix='anim-配音-') as scratch_dir:
            def with_suffix(file_name: str, name: str) -> str:
                if not file_name or Path(file_name).suffix:
                    return file_name
                return shutil.copyfile(file_name, os.path.join(scratch_dir, f'{name}.wav'))

            response = self._run(replace(q, 参考音频=with_suffix(q.参考音频, '音色'), toneRef=with_suffix(q.toneRef, '语气')))
        if response.get('gen_status') != 'success':
            raise RuntimeError(f'image-flow {response.get("gen_status")}（任务 {response.get("submit_id", "没建成")}）：{response.get("fail_reason", "")}')
        output_path = response['outputs'][0]['path']
        # IndexTTS2 出 flac，后面的步骤都按 wav
        subprocess.run([os.environ.get('ANIM_FFMPEG') or 'ffmpeg', '-v', 'error', '-y', '-i', output_path, q.output], check=True)
        return f'image-flow 任务 {response["submit_id"]}'

    def _run(self, q: SynthRequest) -> dict:
        r = subprocess.run(self._build_command(q), capture_output=True, text=True, encoding='utf-8', timeout=float(self.参数(q)['等待秒']) + 180)
        try:
            return json.loads(r.stdout)
        except json.JSONDecodeError:
            raise RuntimeError(f'image-flow 退出码 {r.returncode}：{(r.stdout or r.stderr).strip()[-500:]}') from None

    def synthesize(self, requests: list[SynthRequest]) -> list[SynthResult]:
        out = []
        for q in requests:
            try:
                out.append(SynthResult(q.id, q.seed, q.output, True, self._speak_sentence(q)))
            except Exception as e:  # noqa: BLE001
                out.append(SynthResult(q.id, q.seed, q.output, False, f'{type(e).__name__}: {e}'))
        return out
