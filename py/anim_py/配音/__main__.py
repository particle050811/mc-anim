"""python -m anim_py.配音 <动作> <请求.json>：结果 JSON 打在 stdout 最后一行。
  嘴    {句: [{id, 念, 时长, 字}]}                      → {id: [[秒, 嘴型]]}
  成品  {原件, 成品|null, 不裁?, 目标响度?, 峰值上限?}  → {开口, 有声长, 时长, 增益dB, 原响度, 原峰值, 头?}
  秒数  {wav}                                          → wav 头里的秒数（3 位）
  后端  {配置: {后端名: {…}}}                          → [{名, 说明, 本机, 云端, 付费, 缺}]
  合成  {后端, 配置, 请求: [合成请求…], 只描述?}         → {缺, 描述} 或 [合成结果 + 参数…]
  对齐  {目录, 模型?, 句: [{id, wav, 念, 语言}]}        → {id: [[单位, 起, 止]]}
  复核  {项?: [名…]（不给 = 默认的本机项）, 请求: [复核请求…], 只描述?}          → {项名: {结果: [和请求一一对应]} | {缺} | {缺, 描述}}
  复核项 {}                                             → [{名, 说明, 云端, 付费, 缺}]
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path


def run_action(action: str, request: dict):
    if action == '嘴':
        from .口型 import compute_lip_shapes

        return {s['id']: compute_lip_shapes(s['念'], s['时长'], s['字']) for s in request['句']}
    if action == '成品':
        from . import 处理

        r = 处理.export_finished(Path(request['原件']), Path(request['成品']) if request.get('成品') else None, bool(request.get('不裁')),
                       request.get('目标响度', 处理.target_loudness_db), request.get('峰值上限', 处理.peak_limit_db))
        if request.get('不裁'):
            r['头'] = round(处理.first_voiced_sec(Path(request['原件'])), 3)
        return r
    if action == '秒数':
        from .处理 import wav_seconds

        return round(wav_seconds(Path(request['wav'])), 3)
    if action == '后端':
        from .后端 import backend_table

        return [{'名': c.名, '说明': c.说明, '本机': c.runs_local, '云端': c.cloud, '付费': c.paid, '缺': c(request.get('配置', {}).get(c.名)).missing_items()} for c in backend_table().values()]
    if action == '合成':
        from .后端 import get_backend, SynthRequest

        b = get_backend(request['后端'], request.get('配置'))
        qs = [SynthRequest(**q) for q in request['请求']]
        if request.get('只描述'):
            return {'缺': b.missing_items(), '描述': [b.describe(q) for q in qs]}
        missing = b.missing_items()
        if missing:
            raise SystemExit(f'{b.名} 跑不了：' + '；'.join(missing))
        params = {q.输出: b.record_params(q) for q in qs}
        return [{**asdict(r), '参数': params.get(r.输出, {})} for r in b.synthesize(qs)]
    if action == '对齐':
        from .对齐 import align

        return align(request['目录'], request['句'], request.get('模型', ''))
    if action == '复核':
        from .复核 import ReviewRequest, DEFAULT_ITEMS, run_review as run_review

        return run_review(request.get('项') or list(DEFAULT_ITEMS), [ReviewRequest(**q) for q in request['请求']], bool(request.get('只描述')))
    if action == '复核项':
        from .复核 import review_table, DEFAULT_ITEMS

        return [{'名': c.名, '说明': c.说明, '云端': c.cloud, '付费': c.paid, '默认': c.名 in DEFAULT_ITEMS, '缺': c().missing_items()} for c in review_table().values()]
    raise SystemExit(f'没有动作「{action}」')


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        raise SystemExit(__doc__)
    request = json.loads(Path(argv[1]).read_text(encoding='utf-8'))
    print(json.dumps(run_action(argv[0], request), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:])
