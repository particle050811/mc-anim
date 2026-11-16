"""在对齐器自己的 venv 里跑：读一批 {模型, 句: [{id, wav, spoken, language}]}，stdout 最后一行是 {id: [[单位, 起, 止]]}。不 import anim_py。"""
# 下面 import 的包只装在外部仓库自己的 venv 里，本仓库的 pyright 找不到
# pyright: reportMissingImports=false
import json
import sys


def main():
    import torch
    from qwen_asr import Qwen3ForcedAligner

    batch = json.load(open(sys.argv[1], encoding='utf-8'))
    m = Qwen3ForcedAligner.from_pretrained(batch['模型'], dtype=torch.float32, device_map='cpu')
    out = {}
    for s in batch['句']:
        res = m.align(audio=s['wav'], text=s['spoken'], language=s['language'])
        out[s['id']] = [[u.text, round(u.start_time, 3), round(u.end_time, 3)] for u in res[0]]
        print(s['id'], file=sys.stderr, flush=True)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
