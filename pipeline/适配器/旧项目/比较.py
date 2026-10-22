"""基线的逐帧数值比较（基线.ts 的「底噪」「对照」步骤调，numpy；本机没有 PIL）。
底噪：同机同提交渲的两遍母版（_母版/A、_母版/B）逐帧逐通道比，声音逐样本比 → 基线/底噪.tsv、_底噪逐帧/。
对照：已交付成片按拼接表切回各段，和交付时用的母版（_交付母版-1020）、代码现状（_母版/A）逐帧比 → 基线/_对照/；
  每段存「交付母版和现状差得最多」的几帧左右对比图（左成片、右现状），之后挑有差的段拷进预览。
用法：python 比较.py 底噪 <基线>；python 比较.py 对照 <基线> <成片.mp4> [--门槛 <占比>]（由 基线.ts 传路径）
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

FFMPEG = os.environ.get('ANIM_FFMPEG', 'ffmpeg')  # 基线.ts 按 anim 的配置传进来

W, H = 2560, 1440
FRAME_BYTES = W * H * 3
BIG = 16  # 「明显有差」：某个通道差超过 16/255


class Frames:
    def __init__(self, path: Path):
        self.p = subprocess.Popen([FFMPEG, '-v', 'error', '-i', str(path), '-map', '0:v:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                                  stdout=subprocess.PIPE, bufsize=FRAME_BYTES * 2)

    def read(self):
        buf = self.p.stdout.read(FRAME_BYTES)
        if len(buf) < FRAME_BYTES:
            return None
        return np.frombuffer(buf, np.uint8).reshape(H, W, 3)

    def close(self):
        rest = self.p.stdout.read(FRAME_BYTES)
        self.p.stdout.close()
        self.p.wait()
        return len(rest) == 0


def absdiff(a, b):
    d = np.maximum(a, b)
    d -= np.minimum(a, b)
    return d


def pcm(path: Path) -> np.ndarray:
    raw = subprocess.run([FFMPEG, '-v', 'error', '-i', str(path), '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.int16)


def audio_compare(a: Path, b: Path):
    x, y = pcm(a), pcm(b)
    if len(x) != len(y):
        return False, f'样本数不同 {len(x)} / {len(y)}'
    if np.array_equal(x, y):
        return True, '0'
    return False, str(int(np.abs(x.astype(np.int32) - y).max()))


def segments(base: Path):
    return json.loads((base / '_表/段清单.json').read_text(encoding='utf-8'))['段']


def noise(base: Path):
    out_dir = base / '_底噪逐帧'
    out_dir.mkdir(exist_ok=True)
    rows = ['段\t帧数\t有差帧数\t最大差R\t最大差G\t最大差B\t有差像素占比（最大帧）\t有差像素占比（各帧平均）\t差>16的像素占比（最大帧）\t声音逐样本相同\t声音最大样本差']
    for s in segments(base):
        comp = s['Composition']
        a, b = Frames(base / '_母版/A' / f'{comp}.mkv'), Frames(base / '_母版/B' / f'{comp}.mkv')
        per_frame, n = [], 0
        while True:
            fa, fb = a.read(), b.read()
            if fa is None or fb is None:
                if (fa is None) != (fb is None):
                    raise SystemExit(f'{s["id"]}：两遍帧数不同')
                break
            if np.array_equal(fa, fb):
                per_frame.append((n, 0, 0, 0, 0.0, 0.0))
            else:
                d = absdiff(fa, fb)
                mx = d.reshape(-1, 3).max(axis=0)
                dm = d.max(axis=2)
                per_frame.append((n, *map(int, mx), float((dm > 0).mean()), float((dm > BIG).mean())))
            n += 1
        a.close(), b.close()
        if n != s['帧数']:
            raise SystemExit(f'{s["id"]}：母版 {n} 帧，清单 {s["帧数"]} 帧')
        diff = [r for r in per_frame if r[4] > 0]
        (out_dir / f'{s["id"]}.tsv').write_text('段内帧\t最大差R\t最大差G\t最大差B\t有差像素占比\t差>16的像素占比\n' + ''.join('\t'.join(map(str, r)) + '\n' for r in diff), encoding='utf-8')
        same, maxs = audio_compare(base / '_母版/A' / f'{comp}.mkv', base / '_母版/B' / f'{comp}.mkv')
        mx = [max((r[i] for r in per_frame), default=0) for i in (1, 2, 3)]
        rows.append('\t'.join(map(str, (s['id'], n, len(diff), *mx, f'{max((r[4] for r in per_frame), default=0):.6f}',
                                        f'{np.mean([r[4] for r in per_frame]):.6f}', f'{max((r[5] for r in per_frame), default=0):.6f}', '是' if same else '否', maxs))))
        print(rows[-1], flush=True)
    (base / '底噪.tsv').write_text('\n'.join(rows) + '\n', encoding='utf-8')


def half(img):
    return img.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3)).astype(np.uint8)


def save_pair(left, right, path: Path):
    sep = np.full((H // 2, 8, 3), 128, np.uint8)
    img = np.ascontiguousarray(np.concatenate([half(left), sep, half(right)], axis=1))
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{img.shape[1]}x{img.shape[0]}', '-i', '-', '-q:v', '2', str(path)],
                   input=img.tobytes(), check=True)


def compare(base: Path, film: Path, threshold: float):
    out = base / '_对照'
    (out / '逐帧').mkdir(parents=True, exist_ok=True)
    (out / '图').mkdir(exist_ok=True)
    concat = [row.split('\t') for row in (base / '_表/交付-1020-1306/拼接表.tsv').read_text(encoding='utf-8').splitlines()[1:]]
    segs = segments(base)
    if [(c[0], c[1], int(c[3]) - int(c[2])) for c in concat] != [(s['id'], s['Composition'], s['帧数']) for s in segs]:
        raise SystemExit('交付那次的拼接表和现在的段清单对不上（段、Composition 或帧数）')
    film_frames = Frames(film)
    rows = ['段\t帧数\t有差帧数（交付母版≠现状，差>16 的像素占比超门槛）\t首个有差帧\t末个有差帧\t差>16 像素占比最大\t那一帧\t最大通道差\t'
            '成片−现状 平均差（各帧平均）\t成片−交付母版 平均差（各帧平均）\t成片−现状 比 成片−交付母版 多出的平均差（最大帧）\t交付母版和现状声音逐样本相同\t声音最大样本差']
    for s in segs:
        comp = s['Composition']
        old, new = Frames(base / '_交付母版-1020' / f'{comp}.mkv'), Frames(base / '_母版/A' / f'{comp}.mkv')
        per_frame, keep = [], {}
        for n in range(s['帧数']):
            ff, fo, fn = film_frames.read(), old.read(), new.read()
            if ff is None or fo is None or fn is None:
                raise SystemExit(f'{s["id"]} 第 {n} 帧：成片或母版提前结束')
            e_fn, e_fo = float(absdiff(ff, fn).mean()), float(absdiff(ff, fo).mean())
            if np.array_equal(fo, fn):
                mx, f0, f16 = 0, 0.0, 0.0
            else:
                dm = absdiff(fo, fn).max(axis=2)
                mx, f0, f16 = int(dm.max()), float((dm > 0).mean()), float((dm > BIG).mean())
            per_frame.append((n, e_fn, e_fo, mx, f0, f16))
            hit = f16 > threshold
            # 留图：首个有差帧、差得最多那帧、末个有差帧（没差的段留差得最多那帧当样例）
            if hit and 'first' not in keep:
                keep['first'] = (n, ff.copy(), fn.copy())
            if hit:
                keep['last'] = (n, ff.copy(), fn.copy())
            if 'max' not in keep or f16 > keep['max'][3]:
                keep['max'] = (n, ff.copy(), fn.copy(), f16)
        old.close(), new.close()
        hits = [r for r in per_frame if r[5] > threshold]
        (out / '逐帧' / f'{s["id"]}.tsv').write_text('段内帧\t成片−现状平均差\t成片−交付母版平均差\t交付母版−现状最大通道差\t有差像素占比\t差>16像素占比\n'
                                                   + ''.join(f'{r[0]}\t{r[1]:.3f}\t{r[2]:.3f}\t{r[3]}\t{r[4]:.6f}\t{r[5]:.6f}\n' for r in per_frame), encoding='utf-8')
        for name, item in keep.items():
            n, ff, fn = item[:3]
            save_pair(ff, fn, out / '图' / f'{s["id"]}-{name}-第{n}帧.jpg')
        same, maxs = audio_compare(base / '_交付母版-1020' / f'{comp}.mkv', base / '_母版/A' / f'{comp}.mkv')
        top = max(per_frame, key=lambda r: r[5])
        rows.append('\t'.join(map(str, (s['id'], s['帧数'], len(hits), hits[0][0] if hits else '', hits[-1][0] if hits else '', f'{top[5]:.6f}', top[0],
                                        max(r[3] for r in per_frame), f'{np.mean([r[1] for r in per_frame]):.3f}', f'{np.mean([r[2] for r in per_frame]):.3f}',
                                        f'{max(r[1] - r[2] for r in per_frame):.3f}', '是' if same else '否', maxs))))
        print(rows[-1], flush=True)
    if not film_frames.close():
        raise SystemExit('成片比拼接表长')
    (out / '对照.tsv').write_text('\n'.join(rows) + '\n', encoding='utf-8')


if __name__ == '__main__':
    mode, base = sys.argv[1], Path(sys.argv[2])
    if mode == '底噪':
        noise(base)
    elif mode == '对照':
        th = float(sys.argv[sys.argv.index('--门槛') + 1]) if '--门槛' in sys.argv else 0.001
        compare(base, Path(sys.argv[3]), th)
    else:
        raise SystemExit(__doc__)
