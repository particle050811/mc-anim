"""只改了声音的段不重渲画面（用户 10-18）：照各段的音效、配乐、台词清单（导出音效清单.mjs，几秒一段）合成整段声音，接到现成的画面上。
整片增益用最近一次整片合成量的（预览/渲染/*/整片响度.json 最新那份，可用 --增益 改），限幅同 工具/合成第六章.py，听着和整片里一样响。
画面默认取 合成第六章 的母版缓存（工具/合成第六章/out/视频/<id>.mkv），画面改过的段用 --画面 <id>=<视频> 指定；帧数和 Composition 对不上就报错。
用法（在 参考模型库/ 下）：uv run -q --with numpy python 工具/剪辑微调/只换声音.py <Composition id>... --出 <输出.mp4> [--画面 <id>=<视频>]... [--增益 <dB>] [--不导清单]
  几段按给的顺序接起来；另写同名 .wav（拉过响度的声音）。
  --按剪辑包 <清单.json>：段和每段的段内起帧、帧数照剪辑包的「段落」取（整章预览，帧号和剪映草稿对得上），不用再列 id。"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.append(str(Path(__file__).resolve().parents[1]))  # 工具/：取 公共/环境
import 音效拆分 as sfx_split  # noqa: E402
from 公共 import 环境  # noqa: E402

LIB = sfx_split.LIB
SR, SPF, FPS = sfx_split.SAMPLE_RATE, sfx_split.SAMPLES_PER_FRAME, 24
TRUE_PEAK_CEILING_DBTP, HEADROOM_DB = -1.0, 0.5  # 同 工具/合成第六章.py 的真峰值上限、normalize_loudness 第一回的余量

args = sys.argv[1:]
comps, pictures, out, gain_db, export, package = [], {}, None, None, True, None
while args:
    a = args.pop(0)
    if a == '--出':
        out = Path(args.pop(0))
    elif a == '--画面':
        k, v = args.pop(0).split('=', 1)
        pictures[k] = Path(v)
    elif a == '--增益':
        gain_db = float(args.pop(0))
    elif a == '--不导清单':
        export = False
    elif a == '--按剪辑包':
        package = json.loads(Path(args.pop(0)).read_text(encoding='utf-8'))
        comps = [x['Composition'] for x in package['段落']]
    else:
        comps.append(a)
if not comps or not out:
    sys.exit(__doc__)
if gain_db is None:
    latest = max((LIB.parent / '预览/渲染').glob('*/整片响度.json'), key=lambda p: p.stat().st_mtime)
    gain_db = json.loads(latest.read_text(encoding='utf-8'))['增益dB']
    print(f'整片增益 {gain_db:+.2f} dB（{latest.parent.name}）')

if export:
    subprocess.run([*环境.低优先级前缀(), *环境.资源闸命令(*环境.node命令('工具/剪辑微调/导出音效清单.mjs', *comps), 渲染=True)], check=True, cwd=LIB)
lengths = json.loads((LIB / '工具/剪辑微调/out/段长.json').read_text(encoding='utf-8'))


def picture_frames(path: Path) -> int:
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', str(path)],
                       capture_output=True, text=True, check=True, encoding='utf-8')
    return int(r.stdout.split()[0])


windows = [(x['Composition'], x['段内起帧'], x['帧数']) for x in package['段落']] if package else [(c, 0, None) for c in comps]
sources, offsets, start = [], [], 0
for c, skip, count in windows:
    src = pictures.get(c, LIB / f'工具/合成第六章/out/视频/{c}.mkv')
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
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', str(raw)], input=mix.astype(np.float32).tobytes(), check=True)
    limit = 10 ** ((TRUE_PEAK_CEILING_DBTP - HEADROOM_DB) / 20)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', f'volume={gain_db:.2f}dB,alimiter=limit={limit:.4f}:attack=1:release=50:level=disabled:asc=0',
                    '-ar', str(SR), '-c:a', 'pcm_s24le', str(wav)], check=True)
inputs = [x for s, _, _ in sources for x in ('-i', str(s))]
trims = ''.join(f'[{i}:v]trim=start_frame={skip}:end_frame={skip + count},setpts=PTS-STARTPTS[v{i}];' for i, (_, skip, count) in enumerate(sources))
concat = trims + ''.join(f'[v{i}]' for i in range(len(sources))) + f'concat=n={len(sources)}:v=1:a=0[v]'
subprocess.run([*环境.低优先级前缀(), 'ffmpeg', '-v', 'error', '-y', *inputs, '-i', str(wav), '-filter_complex', concat, '-map', '[v]', '-map', f'{len(sources)}:a',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out)], check=True)
print(f'已写 {out}（{start} 帧）和 {wav}')
