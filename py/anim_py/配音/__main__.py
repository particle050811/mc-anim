"""python -m anim_py.配音 <动作> <请求.json>：结果 JSON 打在 stdout 最后一行。
  嘴    {句: [{id, 念, 时长, 字}]}                      → {id: [[秒, 嘴型]]}
  成品  {原件, 成品|null, 不裁?, 目标响度?, 峰值上限?}  → {开口, 有声长, 时长, 增益dB, 原响度, 原峰值, 头?}
  秒数  {wav}                                          → wav 头里的秒数（3 位）
  后端  {配置: {后端名: {…}}}                          → [{名, 说明, 本机, 云端, 付费, 缺}]
  合成  {后端, 配置, 请求: [合成请求…], 只描述?}         → {缺, 描述} 或 [合成结果…]
  对齐  {目录, 模型?, 句: [{id, wav, 念, 语言}]}        → {id: [[单位, 起, 止]]}
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path


def 跑(动作: str, 请求: dict):
    if 动作 == '嘴':
        from .口型 import 算嘴

        return {s['id']: 算嘴(s['念'], s['时长'], s['字']) for s in 请求['句']}
    if 动作 == '成品':
        from . import 处理

        r = 处理.出成品(Path(请求['原件']), Path(请求['成品']) if 请求.get('成品') else None, bool(请求.get('不裁')),
                       请求.get('目标响度', 处理.目标响度), 请求.get('峰值上限', 处理.峰值上限))
        if 请求.get('不裁'):
            r['头'] = round(处理.首个有声秒(Path(请求['原件'])), 3)
        return r
    if 动作 == '秒数':
        from .处理 import wav秒数

        return round(wav秒数(Path(请求['wav'])), 3)
    if 动作 == '后端':
        from .后端 import 后端表

        return [{'名': c.名, '说明': c.说明, '本机': c.本机, '云端': c.云端, '付费': c.付费, '缺': c(请求.get('配置', {}).get(c.名)).缺什么()} for c in 后端表().values()]
    if 动作 == '合成':
        from .后端 import 取后端, 合成请求

        b = 取后端(请求['后端'], 请求.get('配置'))
        qs = [合成请求(**q) for q in 请求['请求']]
        if 请求.get('只描述'):
            return {'缺': b.缺什么(), '描述': [b.描述(q) for q in qs]}
        缺 = b.缺什么()
        if 缺:
            raise SystemExit(f'{b.名} 跑不了：' + '；'.join(缺))
        return [asdict(r) for r in b.合成(qs)]
    if 动作 == '对齐':
        from .对齐 import 对齐

        return 对齐(请求['目录'], 请求['句'], 请求.get('模型', ''))
    raise SystemExit(f'没有动作「{动作}」')


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        raise SystemExit(__doc__)
    请求 = json.loads(Path(argv[1]).read_text(encoding='utf-8'))
    print(json.dumps(跑(argv[0], 请求), ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1:])
