"""字级对齐：配音成品 + 念的字 → [[单位, 起秒, 止秒]]（汉字一个字一个单位，日语、英文一个词一个单位），口型.py 拿它算嘴。

对齐器是 Qwen3-ForcedAligner-0.6B，跑在它自己的 uv 工程里（qwen-aligner/.venv，装 qwen-asr、pypinyin；模型从魔搭下到同目录），本模块起子进程调它，一批只加载一次模型。
CPU、float32 推理（旧项目 工具/配音/口型.py 的 align）。对不准的句子（九胡拖长音、撒娇腔，模型常把大半句时间给第一个字）在 台词.toml 的 lipManual（口型手修）里手标，优先于对齐。
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

from .后端 import language_names

_run_script = Path(__file__).with_name('_对齐跑.py')


def aligner_python(dir_path: str) -> Path:
    return Path(dir_path) / ('.venv/Scripts/python.exe' if os.name == 'nt' else '.venv/bin/python')


def missing_items(dir_path: str, model: str = '') -> list[str]:
    if not dir_path:
        return ['没给对齐器目录（anim 配置 对齐器，环境变量 ANIM_ALIGNER）']
    missing = []
    if not aligner_python(dir_path).exists():
        missing.append(f'{aligner_python(dir_path)} 不在（对齐器的 venv 没建）')
    m = Path(model or Path(dir_path) / 'Qwen3-ForcedAligner-0.6B')
    if not (m / 'config.json').is_file():
        missing.append(f'{m} 里没有模型')
    return missing


def align(dir_path: str, sentences: list[dict], model: str = '') -> dict[str, list]:
    """句们：[{id, wav, spoken, language}]（语言：台词.toml 的写法，中文、日语、英语、粤语）；返回 id → 字"""
    if not sentences:
        return {}
    batch = {'模型': str(model or Path(dir_path) / 'Qwen3-ForcedAligner-0.6B'), '句': [{**s, 'language': language_names.get(s.get('language') or '中文', 'Chinese')} for s in sentences]}
    with tempfile.TemporaryDirectory() as t:
        f = Path(t) / '批.json'
        f.write_text(json.dumps(batch, ensure_ascii=False), encoding='utf-8')
        r = subprocess.run([str(aligner_python(dir_path)), str(_run_script), str(f)], capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        raise SystemExit(f'对齐器退出码 {r.returncode}：{r.stderr.strip()[-800:]}')
    return json.loads(r.stdout.strip().splitlines()[-1])
