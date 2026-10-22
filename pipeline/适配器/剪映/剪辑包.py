"""剪辑包：给剪映专业版用的整片素材，让用户拖 AI 台词（字幕跟着走）、试听、录口播、加帧注释。照旧 导出剪辑包.py 的声音部分和清单写法。
anim edit-package 已经备好：画面.mp4（母版 + 叠层、不带字幕、2K、CRF 32、每帧关键帧）、拉响度前的整片声音、各句落点、每屏字幕，写成 输入.json 交给这里。
轨道：字幕（每屏一个片段，跟随它那句台词）、画面、AI 配音（每句一个 wav，按整片增益预乘好，起帧带小数）、配乐和音效、我的口播（空，供录音）。
配乐、音效：有各段的音效清单（exportSfx 渲染收的，见 音效拆分.py）就照清单合成，配乐整条、音效一声一个片段（用户 10-15）；
没有就是一条「去台词」：拉响度前的整片声音减掉按落点放的各句台词（旧快路的做法，台词和别的声音线性相加，减得干净）。
最后核对（写进 清单 元数据.核对 和 核对.tsv，只记不拦）：剪辑包各轨相加 vs 成片声音；逐段的清单合成 vs 去台词；台词落点偏差。
用法：uv run -q --no-project --with numpy python pipeline/适配器/剪映/剪辑包.py <输入.json>（anim edit-package 调）
"""
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

import 音效拆分 as sfx_split
from 音效拆分 import FFMPEG

FPS = 24
SAMPLE_RATE = 48000
SAMPLES_PER_FRAME = SAMPLE_RATE // FPS
WIDTH, HEIGHT = 2560, 1440  # 画面和成片同规格：2K、CRF 32（用户 10-14 定）
DIALOGUE_BUS_GAIN = 1.0  # engine/audio/混音.ts 的 台词音量

read_audio = sfx_split.read_audio


def write_audio(path: Path, samples: np.ndarray):
    """写 WAV：峰值不过 1 用 24 位 PCM，过了用 32 位浮点（不削波）"""
    samples = np.ascontiguousarray(samples, np.float32)
    codec = 'pcm_s24le' if np.abs(samples).max() < 1.0 else 'pcm_f32le'
    tmp = path.with_suffix('.写入中.wav')
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', str(samples.shape[1]), '-i', '-', '-c:a', codec, str(tmp)],
                   input=samples.tobytes(), check=True)
    tmp.rename(path)
    return codec


def subtract_dialogue(mix_file: Path, lines, source_audio, total_frames: int) -> np.ndarray:
    """去台词：拉响度之前的整片声音减掉按落点放的各句台词。
    台词轨是原样放的（`DIALOGUE_BUS_GAIN` × 这句的增益，不压不变速），整片里台词和别的声音线性相加，所以减得干净，各段不用再渲去台词"""
    mix = read_audio(mix_file, 2).astype(np.float64)
    if len(mix) < total_frames * SAMPLES_PER_FRAME:
        raise SystemExit(f'{mix_file} 只有 {len(mix) / SAMPLES_PER_FRAME:.1f} 帧，拼接表是 {total_frames} 帧')
    mix = mix[:total_frames * SAMPLES_PER_FRAME]
    for line in lines:
        mix_in(mix, -source_audio[line['id']][:line['播样本']] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
    return mix.astype(np.float32)


def measure_anchor_offset(mix: np.ndarray, dialogue: np.ndarray, start_frame: float, search_range: int = 48):
    """在 `mix`（拉响度之前、带台词的整片声音）里 ±`search_range` 个样本内找 `dialogue` 最像的位置：返回 (偏几个样本, 那个位置上的增益 dB)。
    台词放对了是 (0, 0.0)；底下的配乐、音效会让增益差一点"""
    start_sample = int(np.ceil(start_frame * SAMPLES_PER_FRAME - 1e-6))
    dialogue = dialogue[:min(len(dialogue), 5 * SAMPLE_RATE)].astype(np.float64)
    best = (0, -1e30, 0.0)
    for offset in range(-search_range, search_range + 1):
        if start_sample + offset < 0 or start_sample + offset + len(dialogue) > len(mix):
            continue
        window = mix[start_sample + offset:start_sample + offset + len(dialogue), 0]
        dot = float(np.dot(window, dialogue))
        norm = float(np.sqrt(np.dot(window, window) * np.dot(dialogue, dialogue))) + 1e-30
        if dot / norm > best[1]:
            best = (offset, dot / norm, dot / float(np.dot(dialogue, dialogue)))
    return best[0], 20 * np.log10(max(best[2], 1e-9))


# ---------- 字幕 ----------
# 样式照 pipeline/合成/字幕卡.ts：1 个界面像素 = 画面高 / 90（1440p 16 像素）；字 8 个界面像素高、框四边各多 1 个、白字、黑底不透明度 0.5；
# 下方：框底离画面底 6 个界面像素；思索上：框底在思索按钮上沿（思索界面 240 高里的 240 − 54）以上 1 个界面像素
def subtitle_style(position: str, height: int = HEIGHT) -> dict:
    ui_pixel = height / 90
    box_height = round(10 * ui_pixel)
    box_bottom = int(np.floor((240 - 54) / 240 * height - ui_pixel)) if position == '思索上' else round(height - 6 * ui_pixel)
    # 字距 1 个界面像素：游戏像素字的汉字步进 9 个界面像素、字身 8 个，系统字体的字身 = 字号，不加字距一屏比成片窄一截
    return dict(字体='sans-serif', 字号=8, 颜色='#ffffff', 底色='rgba(0, 0, 0, 0.5)', 内边距=round(ui_pixel, 3), 行高=1.0, 字距=round(ui_pixel, 3),
                中心Y=round(box_bottom - box_height / 2 - height / 2, 3))


def speech_onset_sec(audio: np.ndarray) -> float:
    """文件里第一个响过 −45 dBFS 的样本（同 pipeline/合成/字幕.ts 核对开口的判据）"""
    return float(np.argmax(np.abs(audio[:, 0]) > 10 ** (-45 / 20))) / SAMPLE_RATE


def main(input_file: Path):
    t0 = time.time()
    spec = json.loads(input_file.read_text(encoding='utf-8'))
    if spec['帧率'] != FPS:
        raise SystemExit(f'剪辑包只按 {FPS} fps 写（音效清单的每帧样本数是定的），这一片是 {spec["帧率"]} fps')
    package_dir = Path(spec['包目录'])
    (package_dir / '台词').mkdir(parents=True, exist_ok=True)
    segment_offsets = [(s['段'], s['Composition'], s['段内起帧'], s['段内起帧'] + s['帧数'], s['全片起帧']) for s in spec['段落']]
    total_frames = spec['总帧']
    screens = spec['字幕屏']
    lines = [dict(line, 增益dB=0.0, 头=None) for line in spec['台词']]  # 台词轨：volume = 台词音量 × 这句的 音量（cue 里没有音量，= 1）
    source_audio = {line['id']: read_audio(Path(line['文件']), 1) for line in lines}
    for line in lines:  # 整片里这句放了多少个样本（mix_in() 的起点取法：落在两个样本之间取后一个）
        played_samples = len(source_audio[line['id']])
        if line['段尾'] is not None:
            played_samples = min(played_samples, line['段尾'] * SAMPLES_PER_FRAME - int(np.ceil(line['起帧'] * SAMPLES_PER_FRAME - 1e-6)))
        line['播样本'] = played_samples
        if played_samples < len(source_audio[line['id']]):
            print(f'!! {line["id"]}：说过了 {line["段"]} 的段尾，整片里放到第 {line["段尾"]} 帧就断了，截掉 {(len(source_audio[line["id"]]) - played_samples) / SAMPLE_RATE:.2f} 秒'
                  '（AI 配音片段截到段尾，文件是整句）', flush=True)

    no_dialogue = subtract_dialogue(Path(spec['未拉响度']), lines, source_audio, total_frames)
    if len(no_dialogue) != total_frames * SAMPLES_PER_FRAME:
        raise SystemExit(f'拼出来 {len(no_dialogue)} 个样本，整片应是 {total_frames * SAMPLES_PER_FRAME}')
    # 配乐、音效照各段的清单合成（音效拆分.py）；没有清单就只出一条去台词
    split = spec.get('清单目录') is not None
    if split:
        sfx_split.设路径(Path(spec['清单目录']), Path(spec['文件根']))
        _, score = sfx_split.build_clips(segment_offsets, total_frames, read_audio, '配乐清单')
        sfx_clips, sfx_sum = sfx_split.build_clips(segment_offsets, total_frames, read_audio)
        sfx_clips = sfx_split.merge_stacked(sfx_clips)
        rebuilt_no_dialogue = score.astype(np.float64) + sfx_sum
        stem_residual_db, stem_rows = stem_residual_by_segment(no_dialogue, rebuilt_no_dialogue, segment_offsets)
        worst_segments = sorted((row for row in stem_rows if row[3] is not None), key=lambda row: row[3], reverse=True)
        print(f'配乐 + 音效（照清单合成）vs 去掉台词的声音：差 {stem_residual_db:.1f} dB；差得最多的段：' + '、'.join(f'{row[0]} {row[3]:.1f} dB' for row in worst_segments[:5]), flush=True)
    else:
        rebuilt_no_dialogue = no_dialogue.astype(np.float64)
        stem_residual_db, stem_rows = None, []
        print('没有各段的音效清单：配乐和音效合成一条「去台词」（整片声音减各句台词）', flush=True)

    # 成片声音（参照）：解成片的 AAC
    reference_file = Path(spec['参照'])
    reference = read_audio(reference_file, 2)
    # 成片的声音比各段母版晚一点：拉响度时的 alimiter（attack=1 毫秒）有前瞻，没开 latency 补偿，整条往后推了约 1 毫秒（47 个样本）。
    # 剪辑包各轨照落点和画面对齐，不跟着推；核对时把整片往前挪回这么多再比
    lag_samples = measure_lag(reference[:, 0], no_dialogue[:, 0])
    reference = np.concatenate([reference[lag_samples:], np.zeros((max(0, lag_samples), 2), np.float32)])[:total_frames * SAMPLES_PER_FRAME]
    if len(reference) < total_frames * SAMPLES_PER_FRAME:
        reference = np.concatenate([reference, np.zeros((total_frames * SAMPLES_PER_FRAME - len(reference), 2), np.float32)])
    print(f'成片声音比母版晚 {lag_samples} 个样本（{lag_samples / SAMPLE_RATE * 1000:.2f} 毫秒，整片限幅器的前瞻），核对时挪回来', flush=True)

    # 整片增益：anim film 用的那个数（manifest 的 响度.增益dB）；顺带从成片声音反推一个对照
    gain_db = spec['增益dB']
    unscaled_mix = no_dialogue.astype(np.float64).copy()
    for line in lines:
        mix_in(unscaled_mix, source_audio[line['id']][:line['播样本']] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
    safe_mask = np.abs(reference) < 0.3
    fitted_gain = float(np.sum(reference[safe_mask] * unscaled_mix[safe_mask]) / max(np.sum(unscaled_mix[safe_mask] ** 2), 1e-30))
    print(f'整片增益：anim film 用的 {gain_db} dB；从成片声音反推 {20 * np.log10(max(fitted_gain, 1e-9)):.3f} dB', flush=True)
    gain = 10 ** (gain_db / 20)

    # 写配乐、音效、台词
    for old in ('配乐.wav', '去台词.wav'):
        (package_dir / old).unlink(missing_ok=True)
    shutil.rmtree(package_dir / '音效', ignore_errors=True)
    sfx_tracks = []
    if split:
        score_codec = write_audio(package_dir / '配乐.wav', score * gain)
        (package_dir / '音效').mkdir()
        sfx_names: dict[str, int] = {}
        for clip in sfx_clips:
            base = f'{clip["段"]} {clip["名"]}'.replace('/', '／')
            sfx_names[base] = sfx_names.get(base, 0) + 1
            clip['片段名'] = base if sfx_names[base] == 1 else f'{base} #{sfx_names[base]}'
            write_audio(package_dir / '音效' / f'{clip["片段名"]}.wav', clip['声音'] * gain)
        sfx_lanes = sfx_split.pack_lanes(sfx_clips)
        sfx_tracks = [
            dict(名='配乐', 类型='音频', 片段=[dict(名='配乐（整片）', 文件='配乐.wav', 起帧=0, 长帧=total_frames, 元数据=dict(编码=score_codec))]),
            *[dict(名=f'音效 {i + 1}', 类型='音频', 片段=[dict(名=clip['片段名'], 文件=f'音效/{clip["片段名"]}.wav', 起帧=clip['起帧'], 元数据=dict(段=clip['段'], 声=clip['名']))
                                                       for clip in lane]) for i, lane in enumerate(sfx_lanes)],
        ]
    else:
        sfx_clips = []
        codec = write_audio(package_dir / '去台词.wav', no_dialogue * gain)
        sfx_tracks = [dict(名='配乐和音效', 类型='音频', 片段=[dict(名='配乐和音效（整片去台词）', 文件='去台词.wav', 起帧=0, 长帧=total_frames, 元数据=dict(编码=codec))])]
    shutil.rmtree(package_dir / '台词', ignore_errors=True)
    (package_dir / '台词').mkdir()
    dialogue_clips = []
    for line in sorted(lines, key=lambda clip: clip['起帧']):
        scaled_audio = source_audio[line['id']] * (10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN * gain)
        # 片段名 = 文件名：剪辑软件时间线上音频片段显示的是素材文件名，句子 id 后面带台词开头几个字，一眼认得出是哪句
        clip_name = f'{line["id"]}「{line["字"][:8]}」'.replace('/', '／')
        write_audio(package_dir / '台词' / f'{clip_name}.wav', scaled_audio)
        lead_in_sec = line['头'] if line['头'] is not None else speech_onset_sec(source_audio[line['id']])
        truncated = line['播样本'] < len(scaled_audio)
        dialogue_clips.append(dict(
            名=clip_name, 文件=f'台词/{clip_name}.wav', 起帧=round(line['起帧'], 4),
            **({'长帧': round(line['播样本'] / SAMPLES_PER_FRAME, 4)} if truncated else {}),
            元数据=dict(句=line['id'], 段=line['段'], 角色=line['角色'], 字=line['字'], 长秒=round(line['播样本'] / SAMPLE_RATE, 6),
                      头秒=round(lead_in_sec, 4), 开口帧=round(line['起帧'] + lead_in_sec * FPS, 3), 预乘增益dB=round(line['增益dB'] + gain_db, 2),
                      **({'段尾截掉秒': round((len(scaled_audio) - line['播样本']) / SAMPLE_RATE, 3), '整句长秒': round(len(scaled_audio) / SAMPLE_RATE, 6)} if truncated else {}))))
    clip_name_by_sentence = {clip['元数据']['句']: clip['名'] for clip in dialogue_clips}

    # 字幕：每屏一个片段，跟随 它那句台词
    subtitle_clips, screen_counts = [], {}
    for screen in screens:
        screen_counts[screen['句']] = screen_counts.get(screen['句'], 0) + 1
        subtitle_clips.append(dict(
            名=f'字幕 {screen["句"]} #{screen_counts[screen["句"]]}', 文字=screen['字'], 起帧=screen['起帧'], 长帧=screen['止帧'] - screen['起帧'], 跟随=clip_name_by_sentence[screen['句']],
            样式=subtitle_style(screen['位置']), 元数据=dict(句=screen['句'], 屏=screen_counts[screen['句']], 位置=screen['位置'], 依据=screen['依据'])))

    # 核对：成片 ≈ 剪辑包各轨相加（有清单时配乐、音效照清单合成，不是拿整片减台词得来的，那样比只剩限幅器、自己比自己）
    rebuilt_mix = rebuilt_no_dialogue.copy()
    for line in lines:
        mix_in(rebuilt_mix, source_audio[line['id']][:line['播样本']] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
    rebuilt = rebuilt_mix * gain
    residual = reference - rebuilt
    total_residual_db = db(np.mean(residual ** 2)) - db(np.mean(reference ** 2))
    check_rows = ['剪辑包各轨相加 vs 成片\t成片电平（dBFS RMS）\t残差电平（dBFS RMS）\t残差比成片（dB）\t残差峰值（dBFS）']

    def add_check_row(label, start_sample, end_sample):
        reference_slice, residual_slice = reference[start_sample:end_sample], residual[start_sample:end_sample]
        check_rows.append(f'{label}\t{db(np.mean(reference_slice ** 2)):.1f}\t{db(np.mean(residual_slice ** 2)):.1f}\t{db(np.mean(residual_slice ** 2)) - db(np.mean(reference_slice ** 2)):.1f}\t{20 * np.log10(np.abs(residual_slice).max() + 1e-12):.1f}')
    add_check_row('整片', 0, len(reference))
    worst_line_db = -999.0
    for clip in dialogue_clips:
        start_sample = int(round(clip['起帧'] * SAMPLES_PER_FRAME))
        end_sample = start_sample + int(clip['元数据']['长秒'] * SAMPLE_RATE)
        add_check_row(f'台词 {clip["元数据"]["句"]}', start_sample, end_sample)
        worst_line_db = max(worst_line_db, float(check_rows[-1].split('\t')[3]))
    for segment_id, comp_id, comp_start_frame, comp_end_frame, global_start in segment_offsets:
        add_check_row(f'段 {segment_id}', global_start * SAMPLES_PER_FRAME, (global_start + comp_end_frame - comp_start_frame) * SAMPLES_PER_FRAME)
    limited_mask = np.abs(rebuilt) > 10 ** (-1.5 / 20)
    if split:
        # 逐段：清单合成的配乐 + 音效 vs 去台词（都在整片增益和限幅之前）。哪段漏收了声音（晚起的 Sequence、没登记的 <Audio>），这段就差得多
        check_rows += ['', '逐段清单合成\t去台词电平（dBFS RMS）\t清单合成残差电平（dBFS RMS）\t残差比去台词（dB；去台词低于 −70 不算）']
        check_rows += [f'段 {seg}\t{level:.1f}\t{res:.1f}\t' + ('' if ratio is None else f'{ratio:.1f}') for seg, level, res, ratio in stem_rows]
    # 台词落点：每句在拉响度之前的整片声音里 ±1 毫秒找最像的位置和增益（拿母版本身量，不拿剪辑包的轨）
    master_mix = read_audio(Path(spec['未拉响度']), 2)[:total_frames * SAMPLES_PER_FRAME]
    check_rows += ['', '台词落点\t偏几个样本（±48 内最像的位置）\t那里的增益 dB（0 = 和代码里一样响）']
    anchor_misses = []
    for line in lines:
        k, gain_error_db = measure_anchor_offset(master_mix, source_audio[line['id']][:line['播样本'], 0] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
        check_rows.append(f'{line["id"]}\t{k}\t{gain_error_db:+.2f}')
        if k != 0 or abs(gain_error_db) > 0.5:
            anchor_misses.append(f'{line["id"]}（{k:+d} 样本、{gain_error_db:+.2f} dB）')
    print(f'台词落点：{len(lines)} 句，' + (f'!! 对不上的：{"、".join(anchor_misses)}' if anchor_misses else '都在算的那个样本上、增益差不过 0.5 dB'), flush=True)
    (package_dir / '核对.tsv').write_text('\n'.join(check_rows) + '\n', encoding='utf-8')
    print(f'核对：残差比成片低 {-total_residual_db:.1f} dB；各句台词那一截最差低 {-worst_line_db:.1f} dB；重建后超过 −1.5 dBFS（整片限幅器会压）的样本 {int(limited_mask.sum())} 个', flush=True)

    # 标记：每截一个；段落：同样每截一行，整片帧 → 段内帧
    markers, segment_table = [], []
    for segment_id, comp_id, comp_start_frame, comp_end_frame, global_start in segment_offsets:
        markers.append(dict(名=f'{segment_id} {comp_id}' if segment_id != comp_id else comp_id, 起帧=global_start, 长帧=comp_end_frame - comp_start_frame))
        segment_table.append(dict(段=segment_id, Composition=comp_id, 全片起帧=global_start, 段内起帧=comp_start_frame, 帧数=comp_end_frame - comp_start_frame))

    manifest = dict(
        格式='剪辑包', 版本=1, 项目名=spec['项目名'], 生成时间=time.strftime('%Y-%m-%d %H:%M:%S'),
        帧率=FPS, 宽=WIDTH, 高=HEIGHT, 总帧=total_frames,
        轨道=[
            dict(名='字幕', 类型='文字', 片段=subtitle_clips),
            dict(名='画面', 类型='视频', 片段=[dict(名='画面（整片，不带字幕）', 文件=spec['画面'], 起帧=0, 长帧=total_frames)]),
            dict(名='AI 配音', 类型='音频', 片段=dialogue_clips),
            *sfx_tracks,
            dict(名='我的口播', 类型='音频', 用途='录音', 片段=[]),
        ],
        标记=markers,
        段落=segment_table,
        元数据=dict(
            采样率=SAMPLE_RATE, 整片增益dB=gain_db,
            来源={**spec['来源'], '配乐': '各段的配乐清单合成（音效拆分.py）' if split else '拉响度前的整片声音减各句台词', '音效': '各段的音效清单一声声合成（音效拆分.py）' if split else '同上（和配乐在一条）'},
            核对=dict(配乐音效合成残差dB=None if stem_residual_db is None else round(stem_residual_db, 1), 整片声音滞后样本=lag_samples, 残差比整片dB=round(total_residual_db, 1),
                    台词段最差dB=round(worst_line_db, 1), 超限幅样本=int(limited_mask.sum()), 台词落点对不上=anchor_misses, 明细='核对.tsv'),
            说明='AI 配音的 起帧 = 这句配音文件开头在整片里的位置，开口 = 起帧 + 头秒 × 帧率。字幕每屏的起止帧由台词落点和配音里的停顿现算（pipeline/合成/字幕.ts），跟随它那句台词。',
        ),
    )
    (package_dir / '清单.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'剪辑包：{package_dir}（{len(dialogue_clips)} 句台词、{len(sfx_clips)} 声音效、{len(subtitle_clips)} 屏字幕、{len(markers)} 个标记、{total_frames} 帧），声音部分 {time.time() - t0:.0f} 秒', flush=True)


def db(energy):
    return 10 * np.log10(energy + 1e-30)


def stem_residual_by_segment(no_dialogue: np.ndarray, rebuilt_no_dialogue: np.ndarray, segment_offsets):
    """配乐 + 音效（照清单合成）vs 去台词：返回 (整片残差比 dB, [(段, 去台词电平, 残差电平, 残差比或 None)…])，一截一行；去台词低于 −70 dBFS 的不算比值"""
    no_dialogue = no_dialogue.astype(np.float64)
    whole = db(np.mean((no_dialogue - rebuilt_no_dialogue) ** 2)) - db(np.mean(no_dialogue ** 2))
    rows = []
    for segment_id, _, comp_start, comp_end, global_start in segment_offsets:
        a, b = global_start * SAMPLES_PER_FRAME, (global_start + comp_end - comp_start) * SAMPLES_PER_FRAME
        level = db(np.mean(no_dialogue[a:b] ** 2))
        residual = db(np.mean((no_dialogue[a:b] - rebuilt_no_dialogue[a:b]) ** 2))
        rows.append((segment_id, level, residual, residual - level if level > -70 else None))
    return whole, rows


def measure_lag(reference: np.ndarray, no_dialogue: np.ndarray, search_range: int = 400) -> int:
    """成片声音相对去掉台词的声音晚几个样本：取几处 2 秒的窗做互相关，取最多的那个"""
    votes = []
    for window_start in np.linspace(SAMPLE_RATE, len(no_dialogue) - 4 * SAMPLE_RATE, 8).astype(int):
        window = reference[window_start:window_start + 2 * SAMPLE_RATE].astype(np.float64)
        best = max(range(-search_range, search_range + 1), key=lambda lag: float(np.dot(window, no_dialogue[window_start - lag:window_start - lag + len(window)])))
        votes.append(best)
    return int(np.bincount(np.array(votes) + search_range).argmax() - search_range)


def mix_in(mix: np.ndarray, audio: np.ndarray, start_frame: float):
    """把单声道 audio 的文件开头放在 start_frame（带小数）处、两声道同样叠进 mix。落在两个样本之间时取后一个样本（Remotion 渲台词轨就是这样放的，取最近的会差 1 个样本）"""
    start_sample = int(np.ceil(start_frame * SAMPLES_PER_FRAME - 1e-6))
    end_sample = min(len(mix), start_sample + len(audio))
    if start_sample < 0:
        audio, start_sample = audio[-start_sample:], 0
    mix[start_sample:end_sample] += audio[:end_sample - start_sample]


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
