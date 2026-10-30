"""在 FireRedTTS3 仓库自己的 venv 里跑（cwd = 仓库根）：读一批请求，模型只加载一次，逐条克隆写 wav。stdout 最后一行是 [{成功, 说明}]。
不 import anim_py（那边的 venv 里没有）；模型加载照 FireRedTTS3/server.py 的 _load_locked，峰值归一照它的 normalize_peak（-1 dBFS）。
"""
# 下面 import 的包只装在外部仓库自己的 venv 里，本仓库的 pyright 找不到
# pyright: reportMissingImports=false
import json
import os
import sys

sys.path.insert(0, os.getcwd())


def main():
    import numpy as np
    import soundfile as sf
    import torch

    from fireredtts3.core import FireRedTTS3
    from fireredtts3.utils.utils import inference_autocast

    批 = json.load(open(sys.argv[1], encoding='utf-8'))
    m = FireRedTTS3(os.path.join(批['目录'], 'pretrained_models'), use_fasttext=False, use_wetext=True, use_llm_tn=False)
    结果 = []
    for q in 批['请求']:
        try:
            data, sr = sf.read(q['参考音频'], dtype='float32', always_2d=True)
            prompt = torch.from_numpy(data.T.copy())
            with torch.inference_mode(), inference_autocast():
                audio, out_sr = m.generate(text=q['念'], language=q['语言'], prompt_text=q['参考逐字稿'], prompt_audio=prompt, prompt_audio_sr=sr,
                                           n_timesteps=int(q['步数']), inference_cfg=float(q['cfg']), seed=int(q['种子']))
            a = audio.float().cpu().numpy().reshape(-1).astype(np.float64)
            a = a - a.mean()
            peak = np.abs(a).max()
            if peak > 1e-6:
                a = a * (10 ** (-1.0 / 20) / peak)
            os.makedirs(os.path.dirname(q['输出']), exist_ok=True)
            sf.write(q['输出'], a.astype(np.float32), out_sr, format='WAV', subtype='PCM_16')
            结果.append({'成功': True, '说明': f'{len(a) / out_sr:.2f} 秒'})
        except Exception as e:  # noqa: BLE001
            结果.append({'成功': False, '说明': f'{type(e).__name__}: {e}'})
        print(f'{q["输出"]}：{结果[-1]}', file=sys.stderr, flush=True)
    print(json.dumps(结果, ensure_ascii=False))


if __name__ == '__main__':
    main()
