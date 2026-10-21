"""只改了声音的段不重渲画面（用户 10-18）：照各段的音效、配乐、台词清单（pipeline/适配器/剪映/音效清单.ts 导，几秒一段）合成整段声音，接到现成的画面上。
整片增益用整片合成量的（交付 manifest.json 的 响度.增益dB，--增益 给），限幅同 pipeline/合成/成片.ts，听着和整片里一样响。
画面用各段的母版（--画面 <段键>=<视频>，每段都要给）；帧数和段长（清单目录的 段长.json）对不上就报错。
用法：uv run -q --no-project --with numpy python pipeline/适配器/剪映/只换声音.py <段键>... --出 <输出.mp4> --清单目录 <目录> --文件根 <目录> --增益 <dB> --画面 <段键>=<视频>...
  几段按给的顺序接起来；另写同名 .wav（拉过响度的声音）。清单要先导（exportSfx 渲染，见 音效清单.ts）。
  --按剪辑包 <清单.json>：段和每段的段内起帧、帧数照剪辑包的「段落」取（整章预览，帧号和剪映草稿对得上），不用再列 id。"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

import 音效拆分 as sfx_split
from 音效拆分 import FFMPEG, FFPROBE

SR, SPF, FPS = sfx_split.SAMPLE_RATE, sfx_split.SAMPLES_PER_FRAME, 24
TRUE_PEAK_CEILING_DBTP, HEADROOM_DB = -1.0, 0.5  # 同 pipeline/合成/成片.ts 的真峰值上限、第一回的余量

args = sys.argv[1:]
comps, pictures, out, gain_db, package, cue_root, file_root = [], {}, None, None, None, None, None
while args:
    a = args.pop(0)
    if a == '--出':
        out = Path(args.pop(0))
    elif a == '--画面':
        k, v = args.pop(0).split('=', 1)
        pictures[k] = Path(v)
    elif a == '--增益':
        gain_db = float(args.pop(0))
    elif a == '--清单目录':
        cue_root = Path(args.pop(0))
    elif a == '--文件根':
        file_root = Path(args.pop(0))
    elif a == '--按剪辑包':
        package = json.loads(Path(args.pop(0)).read_text(encoding='utf-8'))
        comps = [x['Composition'] for x in package['段落']]
    else:
        comps.append(a)
if not comps or not out or gain_db is None or cue_root is None or file_root is None:
    sys.exit(__doc__)
sfx_split.设路径(cue_root, file_root)
lengths = json.loads((cue_root / '段长.json').read_text(encoding='utf-8'))


def picture_frames(path: Path) -> int:
    r = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', str(path)],
                       capture_output=True, text=True, check=True, encoding='utf-8')
    return int(r.stdout.split()[0])


windows = [(x['Composition'], x['段内起帧'], x['帧数']) for x in package['段落']] if package else [(c, 0, None) for c in comps]
sources, offsets, start = [], [], 0
for c, skip, count in windows:
    if c not in pictures:
        sys.exit(f'{c}：没给画面（--画面 {c}=<母版>）')
    src = pictures[c]
    n = picture_frames(src)
    if n != lengths[c]:
        sys.exit(f'{c}：画面 {src} 有 {n} 帧，Composition 是 {lengths[c]} 帧，画面要重渲（--画面 指定新的）')
    count = count or n
    sources.append((src, skip, count))
    offsets.append((c, c, skip, skip + count, start))
    start += count

mix = np.zeros((start * SPF, 2), np.float64)
for kind in sfx_split.CUE_DIRS:
    mix += sfx_split.build_clips(offsets, start, sfx_split.read_audio, kind)[1]

out.parent.mkdir(parents=True, exist_ok=True)
wav = out.with_suffix('.wav')
with tempfile.TemporaryDirectory() as tmp:
    raw = Path(tmp) / '未拉响度.wav'
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', str(raw)], input=mix.astype(np.float32).tobytes(), check=True)
    limit = 10 ** ((TRUE_PEAK_CEILING_DBTP - HEADROOM_DB) / 20)
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', str(raw), '-af', f'volume={gain_db:.2f}dB,alimiter=limit={limit:.4f}:attack=1:release=50:level=disabled:asc=0',
                    '-ar', str(SR), '-c:a', 'pcm_s24le', str(wav)], check=True)
inputs = [x for s, _, _ in sources for x in ('-i', str(s))]
trims = ''.join(f'[{i}:v]trim=start_frame={skip}:end_frame={skip + count},setpts=PTS-STARTPTS[v{i}];' for i, (_, skip, count) in enumerate(sources))
concat = trims + ''.join(f'[v{i}]' for i in range(len(sources))) + f'concat=n={len(sources)}:v=1:a=0[v]'
subprocess.run([FFMPEG, '-v', 'error', '-y', *inputs, '-i', str(wav), '-filter_complex', concat, '-map', '[v]', '-map', f'{len(sources)}:a',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out)], check=True)
print(f'已写 {out}（{start} 帧）和 {wav}')
