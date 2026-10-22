"""剪辑包（清单.json，格式见 剪辑包.py）→ 剪映专业版草稿，直接写进剪映的草稿目录，首页「本地草稿」里就有。
草稿名 = 清单的 项目名。轨道：画面、字幕（每屏一个文字片段）、AI 配音（每句一个）、配乐、音效（一声一个，分几条轨）；录音是剪映麦克风录在播放头处，文件在草稿目录 audio_record/。
每句台词和它那几屏字幕编成一个「组合」；不放段标记；用户自己加的标记（默认青色）就是注释。素材硬链接进草稿目录的 素材/（剪映 Mac 版是沙盒）。
草稿只给用户看：每次都按清单从头建，旧草稿里的片段、改动、标记一概不留（用户 10-18：要改会说，落实到代码里）；建之前旧草稿里有注释、录音就先存成 调整-<月日-时分>-更新前.json。
片段名 → 草稿里的片段 id 记在 包/剪映-对照.json，读取调整.py 用它读回注释和录音。剪映开着这个草稿时不能写（会被内存版本覆盖）：先退出剪映，写完再打开。
旧草稿解不开（剪映升级、没装编译器）不拦着写：旧草稿的原文件先整个拷进包的 剪映-更新前原文件-<月日-时分>/，再照样新建。
用法：anim jianying export <包目录>（anim edit-package 出完包会自动调）；单独跑 python -m anim_py.剪辑微调.导入剪映 <包目录> [--草稿根 …] [--剪映 …] [--解密程序 …]
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from . import 剪映 as jianying
from .程序 import FFMPEG, FFPROBE

MANIFEST_TYPE_TO_KIND = {'视频': 'video', '音频': 'audio', '文字': 'text'}
US_PER_SEC = jianying.US_PER_SEC
# 字幕样式换算（对着成片 6-完整参考.mp4 在剪映里量的）：剪映字号 1 ≈ 画面高的 1/104；字距按 字距/字号 给会比成片宽 5%，乘 0.59 后整行一样宽；
# 底框 background_width/height 默认 0.14 时四周约多出画面高的 1/30（720p 24 像素），按成片内边距等比缩
JIANYING_FONT_SIZE_PER_HEIGHT = 1 / 104
JIANYING_LETTER_SPACING_FACTOR = 0.59
JIANYING_BACKGROUND_DEFAULT_PADDING_PER_HEIGHT = 1 / 30


def new_id() -> str:
    return uuid.uuid4().hex


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def empty_draft_skeleton(width: int, height: int, fps: float) -> dict:
    """空草稿（照 pyJianYingDraft 的 draft_content_template.json，剪映 11.4 打开后自己补齐其余字段）"""
    mats = ['ai_translates', 'audio_balances', 'audio_effects', 'audio_fades', 'audio_track_indexes', 'audios', 'beats', 'canvases', 'chromas',
            'color_curves', 'digital_humans', 'drafts', 'effects', 'flowers', 'green_screens', 'handwrites', 'hsl', 'images', 'log_color_wheels',
            'loudnesses', 'manual_deformations', 'masks', 'material_animations', 'material_colors', 'multi_language_refs', 'placeholders',
            'plugin_effects', 'primary_color_wheels', 'realtime_denoises', 'shapes', 'smart_crops', 'smart_relights', 'sound_channel_mappings',
            'speeds', 'stickers', 'tail_leaders', 'text_templates', 'texts', 'time_marks', 'transitions', 'video_effects', 'video_trackings',
            'videos', 'vocal_beautifys', 'vocal_separations']
    platform = {'app_id': 3704, 'app_source': 'lv', 'app_version': '5.9.0', 'os': 'mac'}
    return {
        'canvas_config': {'height': height, 'ratio': 'original', 'width': width}, 'color_space': 0,
        'config': {'adjust_max_index': 1, 'attachment_info': [], 'combination_max_index': 1, 'export_range': None, 'extract_audio_last_index': 1,
                   'lyrics_recognition_id': '', 'lyrics_sync': True, 'lyrics_taskinfo': [], 'maintrack_adsorb': True, 'material_save_mode': 0,
                   'multi_language_current': 'none', 'multi_language_list': [], 'multi_language_main': 'none', 'multi_language_mode': 'none',
                   'original_sound_last_index': 1, 'record_audio_last_index': 1, 'sticker_max_index': 1, 'subtitle_keywords_config': None,
                   'subtitle_recognition_id': '', 'subtitle_sync': True, 'subtitle_taskinfo': [], 'system_font_list': [], 'video_mute': False,
                   'zoom_info_params': None},
        'cover': None, 'create_time': 0, 'duration': 0, 'extra_info': None, 'fps': float(fps), 'free_render_index_mode_on': False,
        'group_container': None, 'id': new_uuid(), 'keyframe_graph_list': [],
        'keyframes': {k: [] for k in ['adjusts', 'audios', 'effects', 'filters', 'handwrites', 'stickers', 'texts', 'videos']},
        'last_modified_platform': dict(platform), 'platform': dict(platform), 'materials': {k: [] for k in mats}, 'mutable_config': None, 'name': '',
        'new_version': '110.0.0', 'relationships': [], 'render_index_track_mode_on': False, 'retouch_cover': None, 'source': 'default',
        'static_cover_image_path': '', 'time_marks': None, 'tracks': [], 'update_time': 0, 'version': 360000,
    }


def build_group(members: list[str], index: int) -> dict:
    """「创建组合」那种组（group_container.groups 一项，片段的 group_id 指它）。material_draft 照剪映自己建的：一个空的复合草稿"""
    return {'group_index': index, 'group_main_id': '', 'group_members': members, 'id': new_uuid(), 'is_expand': True, 'name': '',
            'material_draft': {'aimusic_mv_template_info': None, 'category_id': '', 'category_name': '', 'combination_id': '', 'combination_type': 'none',
                               'draft': {**empty_draft_skeleton(0, 0, 30), 'color_space': -1}, 'draft_config_path': '', 'draft_cover_path': '', 'draft_file_path': '',
                               'formula_id': '', 'id': new_uuid(), 'name': '', 'precompile_combination': False, 'type': 'composition'}}


# ---------- 素材 ----------
def duration_us(path: Path) -> int:
    result = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)], capture_output=True, text=True, check=True, encoding='utf-8')
    return round(float(result.stdout.strip()) * US_PER_SEC)


def frame_size(path: Path) -> tuple[int, int]:
    result = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', str(path)],
                       capture_output=True, text=True, check=True, encoding='utf-8')
    width, height = result.stdout.strip().split(',')[:2]
    return int(width), int(height)


def hard_link(source: Path, target: Path) -> bool:
    """硬链接进草稿目录；已经是同一个文件就不动。返回换没换"""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if os.path.samefile(source, target):
            return False
        target.unlink()
    try:
        os.link(source, target)
    except OSError:
        shutil.copy2(source, target)
    return True


def build_media_material(file: str, kind: str, media_dir: Path, duration: int, size: tuple[int, int] = (0, 0)) -> dict:
    path = str(media_dir / file)
    name = Path(file).name
    if kind == 'video':
        width, height = size
        material_id = new_id()
        return {'audio_fade': None, 'category_id': '', 'category_name': 'local', 'check_flag': 63487,
                'crop': {'upper_left_x': 0.0, 'upper_left_y': 0.0, 'upper_right_x': 1.0, 'upper_right_y': 0.0,
                         'lower_left_x': 0.0, 'lower_left_y': 1.0, 'lower_right_x': 1.0, 'lower_right_y': 1.0},
                'crop_ratio': 'free', 'crop_scale': 1.0, 'duration': duration, 'height': height, 'id': material_id, 'local_material_id': '', 'material_id': material_id,
                'material_name': name, 'media_path': '', 'path': path, 'type': 'video', 'width': width}
    material_id = new_id()
    return {'app_id': 0, 'category_id': '', 'category_name': 'local', 'check_flag': 3, 'copyright_limit_type': 'none', 'duration': duration,
            'effect_id': '', 'formula_id': '', 'id': material_id, 'local_material_id': material_id, 'music_id': material_id, 'name': name, 'path': path,
            'source_platform': 0, 'type': 'extract_music', 'wave_points': []}


# ---------- 字幕 ----------
def parse_color(color_text: str | None) -> tuple[list[float], float]:
    """'#ffffff' / 'rgba(0, 0, 0, 0.5)' → ([r, g, b] 0~1, alpha)"""
    if not color_text:
        return [1.0, 1.0, 1.0], 1.0
    match = re.match(r'rgba?\(([^)]*)\)', color_text.strip())
    if match:
        channels = [float(x) for x in match.group(1).split(',')]
        return [round(x / 255, 4) for x in channels[:3]], (channels[3] if len(channels) > 3 else 1.0)
    hex_digits = color_text.lstrip('#')
    return [round(int(hex_digits[i:i + 2], 16) / 255, 4) for i in (0, 2, 4)], 1.0


def rgb_to_hex(rgb: list[float]) -> str:
    return '#' + ''.join(f'{round(x * 255):02x}' for x in rgb)


def build_text_material(text: str, style: dict, height: int) -> dict:
    """清单的 样式（字号以 高/90 为单位，其余是画面像素）→ 剪映文字素材。字体不指定（剪映默认的系统字体），在剪映里随便换"""
    font_px = style.get('字号', 8) * height / 90
    size = round(font_px / height / JIANYING_FONT_SIZE_PER_HEIGHT, 2)
    rgb, alpha = parse_color(style.get('颜色'))
    content = {'styles': [{'fill': {'alpha': 1.0, 'content': {'render_type': 'solid', 'solid': {'alpha': alpha, 'color': rgb}}},
                        'range': [0, len(text)], 'size': size, 'bold': False, 'italic': False, 'underline': False, 'strokes': []}], 'text': text}
    material = {'id': new_id(), 'content': json.dumps(content, ensure_ascii=False), 'typesetting': 0, 'alignment': 1,
         'letter_spacing': round(style.get('字距', 0) * JIANYING_LETTER_SPACING_FACTOR / font_px, 4), 'line_spacing': 0.02, 'line_feed': 1, 'line_max_width': 1.0,
         'force_apply_line_max_width': False, 'check_flag': 7, 'type': 'text', 'global_alpha': 1.0}
    if style.get('底色'):
        background_rgb, background_alpha = parse_color(style['底色'])
        material.update(check_flag=7 | 16, background_style=1, background_color=rgb_to_hex(background_rgb), background_alpha=background_alpha, background_round_radius=0.0,
                 background_height=round(0.14 * style.get('内边距', height / 90) / (JIANYING_BACKGROUND_DEFAULT_PADDING_PER_HEIGHT * height), 4),
                 background_width=round(0.14 * style.get('内边距', height / 90) / (JIANYING_BACKGROUND_DEFAULT_PADDING_PER_HEIGHT * height), 4),
                 background_horizontal_offset=0.0, background_vertical_offset=0.0)
    return material


# ---------- 片段 ----------
def build_segment(kind: str, material_id: str, start: int, duration: int, source_start: int | None, extra_material_refs: list[str], position_y: float = 0.0) -> dict:
    segment = {'enable_adjust': True, 'enable_color_correct_adjust': False, 'enable_color_curves': True, 'enable_color_match_adjust': False,
         'enable_color_wheels': True, 'enable_lut': True, 'enable_smart_color_adjust': False, 'last_nonzero_volume': 1.0, 'reverse': False,
         'track_attribute': 0, 'track_render_index': 0, 'visible': True, 'id': new_id(), 'material_id': material_id,
         'target_timerange': {'start': start, 'duration': duration}, 'common_keyframes': [], 'keyframe_refs': [],
         'source_timerange': None if kind == 'text' else {'start': source_start or 0, 'duration': duration}, 'speed': 1.0, 'volume': 1.0,
         'extra_material_refs': extra_material_refs, 'is_tone_modify': False, 'group_id': ''}
    if kind == 'audio':
        segment.update(clip=None, hdr_settings=None)
    else:
        segment.update(clip={'alpha': 1.0, 'flip': {'horizontal': False, 'vertical': False}, 'rotation': 0.0, 'scale': {'x': 1.0, 'y': 1.0},
                       'transform': {'x': 0.0, 'y': position_y}}, uniform_scale={'on': True, 'value': 1.0})
        if kind == 'video':
            segment['hdr_settings'] = {'intensity': 1.0, 'mode': 1, 'nits': 1000}
    return segment


def frame_to_draft_us(frame: int, fps: int) -> int:
    """第 n 帧在剪映帧格上的微秒（剪映自己存的就是这样：10⁶ × n / fps 向下取整）"""
    return frame * US_PER_SEC // fps


def write_json(path: Path, data: dict):
    temp_path = path.with_name(path.name + '.写入中')
    temp_path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(temp_path, path)


def backup_raw_draft(draft_dir: Path, package_dir: Path, error: Exception) -> Path:
    """旧草稿解不开时：草稿里的 json（含各时间线）和录音原样拷进包，用户的注释、录音不会因为重建丢掉"""
    out = package_dir / f'剪映-更新前原文件-{time.strftime("%m%d-%H%M", time.gmtime())}'
    out.mkdir(parents=True, exist_ok=True)
    for file in [*draft_dir.glob('*.json'), *draft_dir.glob('Timelines/*/*.json')]:
        (out / file.relative_to(draft_dir)).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, out / file.relative_to(draft_dir))
    if (draft_dir / 'audio_record').is_dir():
        shutil.copytree(draft_dir / 'audio_record', out / 'audio_record', dirs_exist_ok=True)
    (out / '原因.txt').write_text(f'{type(error).__name__}: {error}\n', encoding='utf-8')
    return out


def parse_args(argv: list[str] | None):
    parser = argparse.ArgumentParser(prog='导入剪映')
    parser.add_argument('包目录', type=Path)
    parser.add_argument('--草稿根', type=Path)
    parser.add_argument('--剪映', type=Path)
    parser.add_argument('--解密程序', type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None):
    args = parse_args(argv)
    jianying.设路径(args.草稿根, args.剪映, args.解密程序)
    package_dir = args.包目录.resolve()
    manifest = json.loads((package_dir / '清单.json').read_text(encoding='utf-8'))
    link_map_path = package_dir / jianying.LINK_MAP_FILENAME
    link_map = json.loads(link_map_path.read_text(encoding='utf-8')) if link_map_path.exists() else {}
    fps, width, height = manifest['帧率'], manifest['宽'], manifest['高']
    draft_name = manifest['项目名']
    draft_dir = jianying.draft_dir(draft_name)
    media_dir = draft_dir / '素材'
    t0 = time.time()
    messages = []

    reopen_app = False
    if jianying.draft_open(draft_dir):
        print('剪映开着这个草稿，先让剪映退出（退出前它自己存盘）…', flush=True)
        jianying.quit_app()
        reopen_app = True

    # 草稿只给用户看，每次按清单从头建、旧草稿里的东西一概不留（用户 10-18）；用户在剪映里加的注释、录音先存一份 调整-*-更新前.json
    draft_existed = (draft_dir / 'draft_info.json').exists()
    draft, backup = None, None
    try:
        draft = jianying.read_draft(draft_dir) if draft_existed else None
        if draft is not None and link_map.get('草稿名') == draft_name and link_map.get('片段') and jianying.has_user_changes(package_dir, draft):
            backup = jianying.export_adjustments(package_dir, '-更新前')
    except Exception as error:  # 读回解密和写草稿隔开：解不开只是不能在旧草稿上清空重建
        draft = None
        backup = backup_raw_draft(draft_dir, package_dir, error)
        messages.append(f'!! 旧草稿读不出来（{error}），原文件存在 {backup}，按空草稿新建')
    if draft is not None and draft.get('new_version') != empty_draft_skeleton(width, height, fps)['new_version']:
        # 在剪映自己存过的草稿上清空再建，不换成 empty_draft_skeleton：它是 11.4 的结构，剪映 11.6 打开整份换成它的草稿会打不开
        draft['tracks'] = []
        for k, value in draft['materials'].items():
            if isinstance(value, list):
                draft['materials'][k] = []
        draft['group_container'] = None
        draft['time_marks'] = None
    else:
        draft = empty_draft_skeleton(width, height, fps)
    draft['fps'] = float(fps)
    draft['canvas_config'].update(width=width, height=height)

    # 素材：硬链接进 草稿/素材/，路径照清单里的相对路径
    files = sorted({clip['文件'] for track in manifest['轨道'] for clip in track['片段'] if clip.get('文件')})
    relinked_files = [file for file in files if hard_link(package_dir / file, media_dir / file)]
    durations_us = {file: duration_us(package_dir / file) for file in files}
    cover_path = draft_dir / 'draft_cover.jpg'
    main_video_file = next((clip['文件'] for track in manifest['轨道'] if track['类型'] == '视频' for clip in track['片段']), None)
    if main_video_file and (not cover_path.exists() or main_video_file in relinked_files):
        subprocess.run([FFMPEG, '-v', 'error', '-y', '-ss', '1', '-i', str(package_dir / main_video_file), '-frames:v', '1', '-vf', 'scale=480:-2', str(cover_path)])

    mats = draft['materials']
    for k in ('videos', 'audios', 'texts', 'speeds'):
        mats.setdefault(k, [])
    materials_by_path = {}

    # 轨道：照清单，视频、文字、音频依次；清单里空的轨（我的口播）不建
    track_specs = sorted([(track['名'], MANIFEST_TYPE_TO_KIND[track['类型']]) for track in manifest['轨道'] if track['片段']], key=lambda x: ['video', 'text', 'audio'].index(x[1]))
    tracks_by_name = {}
    for track_name, kind in track_specs:
        tracks_by_name[track_name] = {'attribute': 0, 'flag': 0, 'id': new_id(), 'is_default_name': False, 'name': track_name, 'segments': [], 'type': kind}
        draft['tracks'].append(tracks_by_name[track_name])

    link_segments = {}
    for track in manifest['轨道']:
        if not track['片段']:
            continue
        kind = MANIFEST_TYPE_TO_KIND[track['类型']]
        draft_track = tracks_by_name[track['名']]
        for clip in track['片段']:
            # 剪映只有整帧：打开草稿时带小数的起点会被对齐到整帧（帧号 × 10⁶ / fps 向下取整的微秒）。这里先按它的规矩放好，小数部分记在对照的 余 里，读回时补上
            start_frame = math.ceil(clip['起帧'] - 1e-6)
            source_start_frame = round(clip.get('入点帧', 0))
            if clip.get('长帧') is not None:
                end_frame = round(clip['起帧'] + clip['长帧'])
            else:
                end_frame = start_frame + round(durations_us[clip['文件']] * fps / US_PER_SEC - source_start_frame)
            start_us, source_start_us = frame_to_draft_us(start_frame, fps), frame_to_draft_us(source_start_frame, fps)
            clip_duration_us = frame_to_draft_us(end_frame, fps) - start_us
            # 片段音量：清单的 静音（视频片段静音，免得音效放两遍）或 增益dB
            volume = None if kind == 'text' else (0.0 if clip.get('静音') else round(10 ** (clip.get('增益dB', 0) / 20), 6))
            position_y = 0.0
            if kind == 'text':
                position_y = round(-clip.get('样式', {}).get('中心Y', 0) / (height / 2), 4)
                material = build_text_material(clip['文字'], clip.get('样式', {}), height)
                mats['texts'].append(material)
                extra_material_refs = []
            else:
                media_path = str(media_dir / clip['文件'])
                material = materials_by_path.get(media_path)
                if material is None:
                    material = build_media_material(clip['文件'], kind, media_dir, durations_us[clip['文件']], frame_size(package_dir / clip['文件']) if kind == 'video' else (0, 0))
                    mats['videos' if kind == 'video' else 'audios'].append(material)
                    materials_by_path[media_path] = material
                speed_material = {'curve_speed': None, 'id': new_id(), 'mode': 0, 'speed': 1.0, 'type': 'speed'}
                mats['speeds'].append(speed_material)
                extra_material_refs = [speed_material['id']]
            segment = build_segment(kind, material['id'], start_us, clip_duration_us, source_start_us, extra_material_refs, position_y)
            if volume is not None:
                segment['volume'] = volume
            draft_track['segments'].append(segment)
            link_segments[clip['名']] = dict(片段id=segment['id'], 放起=start_us, 放长=clip_duration_us, 放入点=source_start_us if kind != 'text' else 0,
                                          余=round(clip['起帧'] - start_frame, 6), 入点余=round(clip.get('入点帧', 0) - source_start_frame, 6),
                                          **({'文字': clip['文字']} if kind == 'text' else {}), **({'放音量': volume} if volume is not None else {}))

    # 同一条轨上叠了（剪映一条轨不能叠）：叠的挪到同类的「<轨名> 2」轨
    for track_name, kind in track_specs:
        draft_track = tracks_by_name[track_name]
        kept_segments, overflow_segments = [], []
        previous_end = -1
        for segment in sorted(draft_track['segments'], key=lambda segment: jianying.segment_range(segment)[0]):
            if jianying.segment_range(segment)[0] < previous_end - jianying.TOLERANCE_US:
                overflow_segments.append(segment)
            else:
                kept_segments.append(segment)
                previous_end = sum(jianying.segment_range(segment)[:2])
        draft_track['segments'] = kept_segments
        if overflow_segments:
            overflow_name = f'{track_name} 2'
            overflow_track = {'attribute': 0, 'flag': 0, 'id': new_id(), 'is_default_name': False, 'name': overflow_name, 'segments': overflow_segments, 'type': kind}
            draft['tracks'].insert(draft['tracks'].index(draft_track) + 1, overflow_track)
            messages.append(f'!! {track_name} 轨上 {len(overflow_segments)} 个片段和别的叠了，放到「{overflow_name}」轨')
    for i, track in enumerate(draft['tracks']):
        for segment in track['segments']:
            segment['render_index'] = i

    # 每句台词和它那几屏字幕编组
    segments_by_id = {segment['id']: segment for track in draft['tracks'] for segment in track['segments']}
    groups = []
    for track in manifest['轨道']:
        if track['类型'] != '音频':
            continue
        for clip in track['片段']:
            followers = [link_segments[follower['名']]['片段id'] for other_track in manifest['轨道'] for follower in other_track['片段'] if follower.get('跟随') == clip['名']]
            if not followers:
                continue
            members = [link_segments[clip['名']]['片段id']] + followers
            group = build_group(members, len(groups))
            groups.append(group)
            for i in members:
                segments_by_id[i]['group_id'] = group['id']
    draft['group_container'] = {'groups': groups} if groups else None
    draft['time_marks'] = {'id': new_uuid(), 'mark_items': []}

    draft['duration'] = max((sum(jianying.segment_range(segment)[:2]) for track in draft['tracks'] for segment in track['segments']), default=0)

    # 写盘：draft_info.json 明文（剪映打开后自己重存成密文）。根目录和当前时间线目录（Timelines/<id>/）各一份，剪映两份都存
    if jianying.draft_open(draft_dir):
        raise SystemExit('剪映又把这个草稿打开了，没写；关掉草稿再跑')
    draft_dir.mkdir(parents=True, exist_ok=True)
    for file in jianying.timeline_files(draft_dir):
        write_json(file, draft)
        if (file.parent / 'template-2.tmp').exists():  # 剪映存的同一份，一并换掉免得它拿旧的
            write_json(file.parent / 'template-2.tmp', draft)
    now_us = int(time.time() * US_PER_SEC)
    meta_path = draft_dir / 'draft_meta_info.json'
    try:
        meta = jianying.read_draft_file(meta_path) if meta_path.exists() else None
    except Exception:
        meta = None
    if meta is None:
        meta = {'cloud_package_completed_time': '', 'draft_cloud_capcut_purchase_info': '', 'draft_cloud_last_action_download': False,
                'draft_cloud_materials': [], 'draft_cloud_purchase_info': '', 'draft_cloud_template_id': '', 'draft_cloud_tutorial_info': '',
                'draft_cloud_videocut_purchase_info': '', 'draft_cover': '', 'draft_deeplink_url': '',
                'draft_enterprise_info': {'draft_enterprise_extra': '', 'draft_enterprise_id': '', 'draft_enterprise_name': '', 'enterprise_material': []},
                'draft_fold_path': '', 'draft_id': new_uuid(), 'draft_is_ai_packaging_used': False, 'draft_is_ai_shorts': False,
                'draft_is_ai_translate': False, 'draft_is_article_video_draft': False, 'draft_is_from_deeplink': 'false', 'draft_is_invisible': False,
                'draft_materials': [{'type': k, 'value': []} for k in (0, 1, 2, 3, 6, 7, 8)], 'draft_materials_copied_info': [], 'draft_name': '',
                'draft_new_version': '', 'draft_removable_storage_device': '', 'draft_root_path': '', 'draft_segment_extra_info': [],
                'draft_type': '', 'tm_draft_cloud_completed': '', 'tm_draft_cloud_modified': 0, 'tm_draft_create': now_us, 'tm_draft_removed': 0}
    meta.update(draft_name=draft_name, draft_fold_path=str(draft_dir), draft_root_path=str(jianying.DRAFT_ROOT), tm_duration=draft['duration'], tm_draft_modified=now_us)
    if cover_path.exists():
        meta['draft_cover'] = 'draft_cover.jpg'
    write_json(meta_path, meta)

    link_map = dict(草稿名=draft_name, 草稿目录=str(draft_dir), 清单生成时间=manifest['生成时间'], 导入时间=time.strftime('%Y-%m-%d %H:%M:%S'),
                    轨道={track['name']: track['id'] for track in draft['tracks']}, 片段=link_segments)
    write_json(link_map_path, link_map)

    if reopen_app:
        subprocess.run(['open', '-a', str(jianying.APP_PATH)])
    print(f'剪映草稿「{draft_name}」按清单{"重建" if draft_existed else "新建"}（{time.time() - t0:.0f} 秒）：{len(link_segments)} 个片段、{len(groups)} 句台词和字幕编组；'
          f'素材换了 {len(relinked_files)} 个；{draft_dir}')
    for line in messages:
        print(f'  {line}')
    if backup:
        print(f'  旧草稿里的注释、录音存在 {backup}')
    if reopen_app:
        print('  剪映重新打开了，在首页点「' + draft_name + '」进去')


if __name__ == '__main__':
    main()
