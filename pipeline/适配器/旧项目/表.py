"""基线的字幕表、SRT、同步表、音效清单汇总（基线.ts 的「表」步骤调）。
字幕照旧项目 工具/合成第六章/字幕.py 的 plan_subtitles 现排；同步表照 合成第六章.py 的 build_sync_table 把片段换成全片帧，
起音核对用基线各段音频接起来的整条（没拉响度；判起音只看相邻帧的响度跳变，和增益无关）。
用法：uv run --no-project --with numpy python 表.py <旧项目 参考模型库> <基线/_表> <基线>（由 基线.ts 传路径）
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

FFMPEG = os.environ.get('SR_FFMPEG', 'ffmpeg')  # 基线.ts 按 sr 的配置传进来

LIB, TABLES, BASE = (Path(a) for a in sys.argv[1:4])
sys.path.insert(0, str(LIB / '工具'))
sys.path.insert(0, str(LIB / '工具/合成第六章'))
import 字幕  # noqa: E402

FPS = 24
SPF = 2000  # 48 kHz / 24 帧

segments = json.loads((TABLES / '段清单.json').read_text(encoding='utf-8'))['段']
offsets = []
for line in (TABLES / '拼接表.tsv').read_text(encoding='utf-8').splitlines()[1:]:
    seg, comp, a, b, g = line.split('\t')
    offsets.append((seg, comp, int(a), int(b), int(g)))
total = sum(b - a for _, _, a, b, _ in offsets)

screens, sentences = 字幕.plan_subtitles(LIB, offsets, total)
字幕.write_srt(screens, TABLES / '字幕.srt')
字幕.write_table(screens, sentences, TABLES / '字幕表.tsv')
print(f'字幕：{len(sentences)} 句、{len(screens)} 屏')

# 整条基线音频（单声道 float），给同步表找起音
chunks = []
for s in segments:
    raw = subprocess.run([FFMPEG, '-v', 'error', '-i', str(BASE / s['id'] / '音频.wav'), '-ac', '1', '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    pcm = np.frombuffer(raw, np.float32)
    want = s['帧数'] * SPF
    chunks.append(np.pad(pcm[:want], (0, max(0, want - len(pcm)))))
samples = np.concatenate(chunks)
db = np.array([20 * np.log10(np.sqrt(np.mean(samples[k * SPF:(k + 1) * SPF] ** 2)) + 1e-9) for k in range(len(samples) // SPF)])
onsets = set(int(k) for k in np.nonzero((db[1:] - db[:-1] > 6) & (db[1:] > -50))[0] + 1)

rows = []
for tsv in sorted((TABLES / '同步表片段').glob('*.tsv')):
    for line in tsv.read_text(encoding='utf-8').splitlines()[1:]:
        if not line.strip():
            continue
        seg, frame_text, event, sound_file, basis = (line.split('\t') + [''] * 5)[:5]
        m = re.match(r'(-?[\d.]+)', frame_text)
        if not m:
            continue
        f = float(m.group(1))
        g = next((gs + f - a for s2, _, a, b, gs in offsets if s2 == seg and a <= f < b), None)
        rows.append((g, seg, f, event, sound_file, basis))
out = ['段\t全局时间\t帧\t段内帧\t事件\t声音文件\t依据\t基线声音里起音（±1 帧内的能量跳变）']
for g, seg, f, event, sound_file, basis in sorted(rows, key=lambda r: (r[0] is None, r[0] or 0)):
    if g is None:
        out.append(f'{seg}\t\t\t{f}\t{event}\t{sound_file}\t{basis}\t（这一截没进成片）')
        continue
    hit = [k for k in onsets if abs(k - g) <= 1.5]
    mm, ss = divmod(g / FPS, 60)
    out.append(f'{seg}\t{int(mm):02d}:{ss:06.3f}\t{g:.1f}\t{f}\t{event}\t{sound_file}\t{basis}\t' + (f'对上（第 {min(hit, key=lambda k: abs(k - g))} 帧）' if hit else '没测到（被盖住或太轻）'))
(TABLES / '同步表.tsv').write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'同步表：{len(rows)} 行（第 7 章没有同步表片段，旧项目也只有第 6 章的）')

# 音效清单汇总：声音清单/<类>/<Composition>.json 摊成一张表（增益曲线只留首尾，原 JSON 在 声音清单/ 里）
out = ['段\t类\t名\t档\t文件\t起帧（段内）\t全片起帧\t帧数\t入点秒\t速率\t循环\t首帧增益\t末帧增益']
for s, (_, comp, _, _, g) in zip(segments, offsets):
    for kind in ('台词清单', '音效清单', '配乐清单'):
        for c in json.loads((TABLES / '声音清单' / kind / f'{comp}.json').read_text(encoding='utf-8')):
            gain = c.get('增益') or [None]
            out.append('\t'.join(str(v) for v in (s['id'], kind[:2], c['名'], c.get('档', ''), c['文件'], c['起帧'], g + c['起帧'], c['帧数'], c['入点秒'], c['速率'], c['循环'], gain[0], gain[-1])))
(TABLES / '音效清单.tsv').write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'音效清单：{len(out) - 1} 条')
