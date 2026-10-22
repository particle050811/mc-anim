"""音效一声一个片段（用户 10-15 要求每个音效分开导入剪映）、配乐整条：按 pipeline/适配器/剪映/音效清单.ts 收的各段放法（engine/audio/音效清单.ts）合成，不用各段再渲声音。
放法照 Remotion：从文件 入点秒 起按 速率 变速变调（线性插值）、循环的绕回文件开头，每帧乘一个音量（整帧内不变），两声道一样。
剪辑包.py 用：build_clips() 照拼接表把每一声截到它那一截里、换成整片帧，merge_stacked() 把叠着的同种声并成一个。
清单目录（<目录>/音效清单/<段键>.json 等）和清单里 文件 的相对起点由调用方 设路径() 给；清单由 anim 导，这里不导。"""
import json
import os
import re
import subprocess
from pathlib import Path

import numpy as np

FFMPEG = os.environ.get('ANIM_FFMPEG', 'ffmpeg')  # anim 按自己的配置传进来
FFPROBE = os.environ.get('ANIM_FFPROBE', 'ffprobe')

KINDS = ('音效清单', '配乐清单', '台词清单')
CUE_DIRS: dict[str, Path] = {}
FILE_ROOT = Path('.')


def 设路径(清单目录: Path, 文件根: Path):
    global FILE_ROOT
    CUE_DIRS.update({kind: 清单目录 / kind for kind in KINDS})
    FILE_ROOT = 文件根


SAMPLE_RATE = 48000
SAMPLES_PER_FRAME = SAMPLE_RATE // 24
SILENT = 10 ** (-80 / 20)  # 整声都低于这个（−80 dBFS）的不出片段：离镜头太远、衰减到零的
# 同一种声音叠在一起的并成一个片段：一个洞一下几十声碎方块、一队卫兵同时迈步，一声一个片段叠出几十条轨，剪映拖不动（用户 10-15）。
# 种类 = 文件名（新管线的清单给资产 id，没有 .ogg）去掉变体号；破坏方块（方块碎、钻头敲、挂画碎）算一种
BLOCK_BREAK = re.compile(r'^(block\.[a-z_]+\.(break|hit)|entity\.painting\.break)$')


def sound_kind(file: str) -> str:
    kind = re.sub(r'(\.\d+)?(\.ogg)?$', '', file.rsplit('/', 1)[-1])
    return '破坏方块' if BLOCK_BREAK.match(kind) else kind


def read_audio(path: Path, channels: int) -> np.ndarray:
    """任意音频 → 48 kHz float32，形状 (样本, 声道)。
    采样率是 48 kHz 整数分之一的（6-3-2 原文版是 24 kHz）每个样本重复几遍，不用插值重采样：Remotion 渲的时候就是这样升到 48 kHz 的（插值重采样和整片差得多）"""
    source_rate = int(subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', str(path)],
                                     capture_output=True, text=True, check=True, encoding='utf-8').stdout.split()[0])
    repeat_factor = SAMPLE_RATE // source_rate if SAMPLE_RATE % source_rate == 0 else 1
    raw = subprocess.run([FFMPEG, '-v', 'error', '-i', str(path), '-vn', '-ac', str(channels), '-ar', str(SAMPLE_RATE // repeat_factor), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    samples = np.frombuffer(raw, np.float32).reshape(-1, channels)
    return np.repeat(samples, repeat_factor, axis=0) if repeat_factor > 1 else samples


def synthesize(cue: dict, read_audio, file_cache: dict) -> np.ndarray:
    path = FILE_ROOT / cue['文件']
    if path not in file_cache:
        # 单声道的文件读成单声道再复制到两声道：Remotion 就是这样放的；ffmpeg 直接 -ac 2 升声道会把每边压 3 dB
        channels = int(subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', str(path)],
                                      capture_output=True, text=True, check=True, encoding='utf-8').stdout.split()[0])
        audio = read_audio(path, 1 if channels == 1 else 2).astype(np.float64)
        file_cache[path] = np.repeat(audio, 2, axis=1) if channels == 1 else audio
    source = file_cache[path]
    n = cue['帧数'] * SAMPLES_PER_FRAME
    pos = cue['入点秒'] * SAMPLE_RATE + np.arange(n) * cue['速率']
    if cue['循环']:
        pos = np.mod(pos, len(source))
    i0 = np.floor(pos).astype(np.int64)
    frac = (pos - i0)[:, None]
    inside = i0 < len(source)
    i0c = np.minimum(i0, len(source) - 1)
    i1 = np.where(cue['循环'], (i0c + 1) % len(source), np.minimum(i0c + 1, len(source) - 1))
    out = (source[i0c] * (1 - frac) + source[i1] * frac) * inside[:, None]
    return (out * np.repeat(np.asarray(cue['增益'], np.float64), SAMPLES_PER_FRAME)[:, None]).astype(np.float32)


def build_clips(segment_offsets, total_frames: int, read_audio, kind: str = '音效清单'):
    """返回 (片段们, 各声之和)。片段：段、名、起帧（整片帧）、声音（float32，两声道，未乘整片增益）。kind：音效清单 / 配乐清单 / 台词清单"""
    clips, total = [], np.zeros((total_frames * SAMPLES_PER_FRAME, 2), np.float32)
    file_cache, synth_cache, silent = {}, {}, 0
    for segment_id, comp_id, comp_start, comp_end, global_start in segment_offsets:
        cues = json.loads((CUE_DIRS[kind] / f'{comp_id}.json').read_text(encoding='utf-8'))
        for k, cue in enumerate(cues):
            a, b = max(cue['起帧'], comp_start), min(cue['起帧'] + cue['帧数'], comp_end)
            if b <= a:
                continue
            if (comp_id, k) not in synth_cache:
                synth_cache[(comp_id, k)] = synthesize(cue, read_audio, file_cache)
            audio = synth_cache[(comp_id, k)][(a - cue['起帧']) * SAMPLES_PER_FRAME:(b - cue['起帧']) * SAMPLES_PER_FRAME]
            if np.abs(audio).max() < SILENT:
                silent += 1
                continue
            start = (global_start + a - comp_start) * SAMPLES_PER_FRAME
            total[start:start + len(audio)] += audio
            name = f"【{cue['档']}】{cue['名']}" if cue.get('档') else cue['名']  # 分了档的片段名前标档（用户 10-18 要在剪映里逐个听）
            clips.append(dict(段=segment_id, 名=name, 档=cue.get('档'), 起帧=global_start + a - comp_start, 声音=audio, 种类=sound_kind(cue.get('资产') or cue['文件'])))
    if kind == '音效清单':
        print(f'音效拆分：{len(clips)} 声（{silent} 声衰减到听不见，不出片段）', flush=True)
    return clips, total


def merge_stacked(clips: list[dict]) -> list[dict]:
    """同一截里同一个声源、同一种、时间上接着或叠着的声并成一个片段，单独响的不动。
    声源 = 名字去掉档和末尾编号（九胡脚步1、九胡脚步2 是一个）；不同人的同种声音不并（用户 10-18：李樱、九胡的脚步不能并在一起）。破坏方块不分声源，按种类并"""
    groups, open_groups = [], {}
    for clip in sorted(clips, key=lambda c: c['起帧']):
        source = '' if clip['种类'] == '破坏方块' else re.sub(r'\d+$', '', re.sub(r'【.*?】', '', clip['名']))
        key = (clip['段'], clip['种类'], source)
        end = clip['起帧'] + len(clip['声音']) // SAMPLES_PER_FRAME
        group = open_groups.get(key)
        if group and clip['起帧'] <= group['止帧']:
            group['成员'].append(clip)
            group['止帧'] = max(group['止帧'], end)
        else:
            open_groups[key] = dict(起帧=clip['起帧'], 止帧=end, 成员=[clip])
            groups.append(open_groups[key])
    out = []
    for group in groups:
        members = group['成员']
        if len(members) == 1:
            out.append(members[0])
            continue
        audio = np.zeros(((group['止帧'] - group['起帧']) * SAMPLES_PER_FRAME, 2), np.float32)
        for clip in members:
            start = (clip['起帧'] - group['起帧']) * SAMPLES_PER_FRAME
            audio[start:start + len(clip['声音'])] += clip['声音']
        name = f'破坏方块（{len(members)} 声）' if members[0]['种类'] == '破坏方块' else f'{members[0]["名"]} 等 {len(members)} 声'
        # 并起来的几声档不一样（一串越来越小的碎裂）就标头尾
        tiers = [c['档'] for c in members if c.get('档')]
        if tiers and members[0]['种类'] == '破坏方块':
            name = f'【{tiers[0]}】{name}' if len(set(tiers)) == 1 else f'【{tiers[0]}→{tiers[-1]}】{name}'
        out.append(dict(段=members[0]['段'], 名=name, 档=tiers[0] if tiers else None, 起帧=group['起帧'], 声音=audio, 种类=members[0]['种类']))
    merged = [g for g in groups if len(g['成员']) > 1]
    print(f'叠着的同种声：{sum(len(g["成员"]) for g in merged)} 声并成 {len(merged)} 个片段', flush=True)
    return out


def pack_lanes(clips: list[dict]) -> list[list[dict]]:
    """叠在一起的放不同轨：按起帧排，放进第一条已经空出来的轨"""
    lanes, lane_ends = [], []
    for clip in sorted(clips, key=lambda c: c['起帧']):
        end = clip['起帧'] + len(clip['声音']) / SAMPLES_PER_FRAME
        for i, lane_end in enumerate(lane_ends):
            if lane_end <= clip['起帧']:
                lanes[i].append(clip)
                lane_ends[i] = end
                break
        else:
            lanes.append([clip])
            lane_ends.append(end)
    return lanes
