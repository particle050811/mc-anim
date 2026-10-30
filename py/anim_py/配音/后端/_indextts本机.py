"""在 IndexTTS 仓库自己的 venv 里跑（cwd = 仓库根）：读一批请求，模型只加载一次。stdout 最后一行是 [{成功, 说明}]。
不 import anim_py；加载参数照 IndexTTS/gen_juese.py（本机 Mac：不用 fp16、CUDA 内核、deepspeed）。
"""
# 下面 import 的包只装在外部仓库自己的 venv 里，本仓库的 pyright 找不到
# pyright: reportMissingImports=false
import json
import os
import random
import sys

sys.path.insert(0, os.getcwd())


def main():
    import numpy as np
    import torch
    from indextts.infer_v2 import IndexTTS2

    批 = json.load(open(sys.argv[1], encoding='utf-8'))
    d = 批['模型目录']
    tts = IndexTTS2(cfg_path=os.path.join(d, 'config.yaml'), model_dir=d, use_fp16=False, use_cuda_kernel=False, use_deepspeed=False)
    结果 = []
    for q in 批['请求']:
        try:
            os.makedirs(os.path.dirname(q['输出']), exist_ok=True)
            kw = {'emo_audio_prompt': q['语气参考'], 'emo_alpha': float(q['强度'])} if q.get('语气参考') else {}
            # 种子定住采样，同种子重跑出同一个候选（候选按种子起名）
            random.seed(int(q['种子']))
            np.random.seed(int(q['种子']) % 2**32)
            torch.manual_seed(int(q['种子']))
            tts.infer(spk_audio_prompt=q['参考音频'], text=q['念'], output_path=q['输出'], **kw, **q.get('生成参数', {}))
            结果.append({'成功': os.path.exists(q['输出']), '说明': ''})
        except Exception as e:  # noqa: BLE001
            结果.append({'成功': False, '说明': f'{type(e).__name__}: {e}'})
        print(f'{q["输出"]}：{结果[-1]}', file=sys.stderr, flush=True)
    print(json.dumps(结果, ensure_ascii=False))


if __name__ == '__main__':
    main()
