"""剪映专业版（Mac 11.4.2）和剪辑包之间的公用部分：导入剪映.py、读取调整.py 用。剪映、草稿根、解密程序的位置由 sr 的配置给（设路径）。
- 草稿在 <草稿根>/<草稿名>/：draft_info.json（时间线）、draft_meta_info.json（首页列表用的名字、时长）。
- 写：程序写明文 JSON，剪映照样打开（打开后重存成密文）。剪映 Mac 版是沙盒只能读 ~/Movies，素材硬链接进草稿目录的 素材/，存盘时路径被改写成 ##_draftpath_placeholder_<id>_##/素材/…。
- 读：密文用剪映自己的库解（剪映解密.cpp，第一次用时编到 sr 给的位置）。草稿开着时（.locked 被占着）不能写，会被内存版本覆盖。
- 时间单位微秒；剪映只有整帧，打开草稿就把起点对齐到整帧（帧号 × 10⁶ / fps 向下取整），小数部分记在对照的 余 里。
- 11.4 起多时间线：根目录和 Timelines/<当前时间线 id>/ 各一份 draft_info.json，读写都两份一起。
- 录音在草稿目录 audio_record/（.aac），新开一条音频轨；标记在 time_marks（时间线上）和 materials.time_marks（挂在片段上），都算注释。
"""
import json
import math
import re
import subprocess
import tempfile
import time
from pathlib import Path

from .程序 import FFMPEG

# 默认值是 Mac 版剪映的位置；sr 调用时用 设路径() 换成它配置里的
APP_PATH = Path('/Applications/VideoFusion-macOS.app')
PROCESS_NAME = 'VideoFusion-macOS'
DRAFT_ROOT = Path.home() / 'Movies/JianyingPro/User Data/Projects/com.lveditor.draft'
LINK_MAP_FILENAME = '剪映-对照.json'  # 放在剪辑包目录：草稿名、每个片段名 → 草稿里的片段 id、放下时的位置、段标记 id
THIS_DIR = Path(__file__).resolve().parent
DECRYPT_SOURCE = THIS_DIR / '剪映解密.cpp'
DECRYPT_BINARY = THIS_DIR / 'out' / '剪映解密'
SEGMENT_MARK_COLOR = '#A475D2'  # 紫。剪映标记五色：#00c1cd 青（新加的默认）、#FC7265 红、#F09B43 橙、#A2C15E 绿、#A475D2 紫
US_PER_SEC = 1_000_000
TOLERANCE_US = 1000  # 微秒。剪映打开草稿会把时间规整到帧格（差 1 微秒）；用户真挪一下至少差一帧（41667 微秒）


def 设路径(草稿根: Path | None = None, 剪映: Path | None = None, 解密程序: Path | None = None):
    global DRAFT_ROOT, APP_PATH, DECRYPT_BINARY
    DRAFT_ROOT = 草稿根 or DRAFT_ROOT
    APP_PATH = 剪映 or APP_PATH
    DECRYPT_BINARY = 解密程序 or DECRYPT_BINARY


# ---------- 读草稿 ----------
def ensure_decryptor():
    if DECRYPT_BINARY.exists() and DECRYPT_BINARY.stat().st_mtime >= DECRYPT_SOURCE.stat().st_mtime:
        return
    DECRYPT_BINARY.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['clang++', '-std=c++17', '-O1', '-arch', 'arm64', str(DECRYPT_SOURCE), '-o', str(DECRYPT_BINARY),
                    f'-Wl,-rpath,{APP_PATH}/Contents/Frameworks'], check=True)


def read_draft_file(path: Path) -> dict:
    raw = path.read_bytes()
    if raw[:1] == b'{':
        return json.loads(raw)
    ensure_decryptor()
    with tempfile.TemporaryDirectory() as temp_dir:
        out_path = Path(temp_dir) / 'x.json'
        result = subprocess.run([str(DECRYPT_BINARY), str(path), str(out_path), str(APP_PATH)], capture_output=True, text=True, encoding='utf-8')
        if result.returncode != 0:
            raise RuntimeError(f'解不开 {path}：{result.stderr.strip()[-300:]}')
        return json.loads(out_path.read_text(encoding='utf-8'))


def draft_dir(name: str) -> Path:
    return DRAFT_ROOT / name


def timeline_files(draft_folder: Path) -> list[Path]:
    """草稿的时间线文件：根目录的 draft_info.json，和 11.4 起多时间线的 Timelines/<当前时间线 id>/draft_info.json（剪映两份都存，内容一样）。
    当前时间线看 timeline_layout.json 的 activeTimeline"""
    files = [draft_folder / 'draft_info.json']
    try:
        tid = json.loads((draft_folder / 'timeline_layout.json').read_text(encoding='utf-8'))['activeTimeline']
        candidate = draft_folder / 'Timelines' / tid / 'draft_info.json'
        if candidate.exists():
            files.append(candidate)
    except Exception:
        pass
    return files


def read_draft(draft_folder: Path) -> dict:
    """读最新存的那份（根目录和当前时间线目录里的，按修改时间）"""
    files = [file for file in timeline_files(draft_folder) if file.exists()]
    return read_draft_file(max(files, key=lambda file: file.stat().st_mtime))


def resolve_draft_path(path_str: str, draft_folder: Path) -> Path:
    """剪映存盘后把草稿目录里的素材写成 ##_draftpath_placeholder_<id>_##/…"""
    return Path(re.sub(r'^##_draftpath_placeholder_[^#]*_##', str(draft_folder), path_str))


# ---------- 软件 ----------
def app_running() -> bool:
    return subprocess.run(['pgrep', '-x', PROCESS_NAME], capture_output=True).returncode == 0


def draft_open(draft_folder: Path) -> bool:
    lock_file = draft_folder / '.locked'
    if not lock_file.exists() or not app_running():
        return False
    return subprocess.run(['lsof', '-t', str(lock_file)], capture_output=True).returncode == 0


def quit_app(wait_sec: int = 60):
    """让剪映自己退出（退出前自动存盘），等进程没了。剪映不理 AppleScript 的 quit，点它菜单里的「退出」（要辅助功能权限）"""
    result = subprocess.run(['osascript', '-e', f'tell application "System Events" to tell process "{PROCESS_NAME}" to click menu item "退出" of menu 1 of menu bar item "剪映专业版" of menu bar 1'],
                       capture_output=True)
    if result.returncode != 0:
        subprocess.run(['osascript', '-e', 'tell application id "com.lemon.lvpro" to quit'], capture_output=True)
    t0 = time.time()
    while app_running():
        if time.time() - t0 > wait_sec:
            raise SystemExit('剪映 60 秒没退出（有弹窗？），手动退出后再跑')
        time.sleep(0.5)


# ---------- 草稿 → 剪辑调整（格式见 剪辑包.py 的 清单，读取调整.py 照它比） ----------
def format_time(frame: float, fps: int) -> str:
    total_sec = frame / fps
    return f'{int(total_sec // 60)}:{total_sec % 60:06.3f}'


def us_to_frames(us: float, fps: int) -> float:
    return round(us * fps / US_PER_SEC, 3)


def text_of(draft: dict, material_id: str) -> str | None:
    for text_material in draft['materials'].get('texts', []):
        if text_material['id'] == material_id:
            try:
                return json.loads(text_material['content'])['text']
            except Exception:
                return text_material.get('content')
    return None


def segment_range(seg: dict) -> tuple[int, int, int]:
    """片段的 (起, 长, 入点)，微秒"""
    target_range, source_range = seg.get('target_timerange') or {}, seg.get('source_timerange') or {}
    return target_range.get('start', 0), target_range.get('duration', 0), source_range.get('start', 0) or 0


def is_unmoved(seg: dict, link: dict) -> bool:
    """片段还在导入时放的位置（对照里的 放起、放长、放入点）"""
    start_us, duration_us, in_point_us = segment_range(seg)
    return abs(start_us - link['放起']) <= TOLERANCE_US and abs(duration_us - link['放长']) <= TOLERANCE_US and abs(in_point_us - link.get('放入点', 0)) <= TOLERANCE_US


def all_marks(draft: dict) -> list[dict]:
    """时间线上的标记，加上片段上的标记（选中片段时点标记按钮加的，存在 materials.time_marks，片段的 extra_material_refs 指它，
    时间相对素材；这里换成整片时间）"""
    marks = list((draft.get('time_marks') or {}).get('mark_items') or [])
    segment_marks_by_id = {m['id']: m for m in draft['materials'].get('time_marks') or []}
    for track in draft['tracks']:
        for seg in track['segments']:
            start_us, duration_us, in_point_us = segment_range(seg)
            for ref in seg.get('extra_material_refs') or []:
                for mark in (segment_marks_by_id.get(ref) or {}).get('mark_items') or []:
                    time_range = dict(mark.get('time_range') or {})
                    time_range['start'] = start_us + time_range.get('start', 0) - in_point_us
                    marks.append({**mark, 'time_range': time_range})
    return marks


def material_index(draft: dict) -> dict:
    return {material['id']: material for kind in ('videos', 'audios') for material in draft['materials'].get(kind, [])}


def export_adjustments(package_dir: Path, suffix: str = '') -> Path:
    """把草稿现在的样子写成 包/调整-<月日-时分><后缀>.json，用户的录音转成 wav 拷到 包/录音/调整-<月日-时分><后缀>/"""
    link_map = json.loads((package_dir / LINK_MAP_FILENAME).read_text(encoding='utf-8'))
    manifest = json.loads((package_dir / '清单.json').read_text(encoding='utf-8'))
    fps = manifest['帧率']
    draft_folder = draft_dir(link_map['草稿名'])
    if not (draft_folder / 'draft_info.json').exists():
        raise SystemExit(f'剪映里找不到草稿「{link_map["草稿名"]}」（{draft_folder}），被删了？重跑 sr jianying export')
    draft = read_draft(draft_folder)
    materials = material_index(draft)
    id_to_name = {link['片段id']: k for k, link in link_map['片段'].items()}
    manifest_clips = {item['名']: item for lane in manifest['轨道'] for item in lane['片段']}
    segment_marks = set(link_map.get('段标记', []))
    stamp = time.strftime('%m%d-%H%M', time.gmtime())
    adjust_name = f'调整-{stamp}{suffix}'
    k = 2
    while (package_dir / f'{adjust_name}.json').exists():
        adjust_name = f'调整-{stamp}-{k}{suffix}'
        k += 1
    recording_dir = package_dir / '录音' / adjust_name
    clips, recordings = [], []
    for track in draft['tracks']:
        kind = {'video': 'video', 'audio': 'audio', 'text': 'text'}.get(track['type'], track['type'])
        for seg in track['segments']:
            name = id_to_name.get(seg['id'])
            original = manifest_clips.get(name) if name else None
            link = link_map['片段'].get(name) if name else None
            start_us, duration_us, in_point_us = segment_range(seg)
            start_frame, length_frames, in_frame = us_to_frames(start_us, fps), us_to_frames(duration_us, fps), us_to_frames(in_point_us, fps)
            material = materials.get(seg['material_id'], {})
            adj_clip = dict(名=name or material.get('name') or material.get('material_name') or seg['id'], 轨道=track.get('name') or track['type'], 类型=kind, 起帧=start_frame, 长帧=length_frames, 入点帧=in_frame)
            if original is not None and link is not None:  # 清单里有的片段对照里一定有（导入时一起写的）
                # 没挪过的（和放下时的微秒数一样）起帧用清单原值，带小数的逐位相同
                # 放的时候起点对齐到了整帧（剪映只有整帧），小数部分补回来：没挪过的片段 起帧、文件开头帧 和清单逐位相同
                adj_clip['起帧'] = round(round(start_frame) + link.get('余', 0), 6)
                adj_clip['入点帧'] = round(round(in_frame) + link.get('入点余', 0), 6)
                adj_clip['文件开头帧'] = round(adj_clip['起帧'] - adj_clip['入点帧'], 6)
                adj_clip['被裁剪'] = bool(kind in ('audio', 'video') and (in_point_us > link.get('放入点', 0) + TOLERANCE_US or duration_us < link['放长'] - TOLERANCE_US))
            else:
                adj_clip['文件开头帧'] = start_frame - in_frame
                adj_clip['清单里没有'] = True
                adj_clip['被裁剪'] = False
            if kind == 'text':
                adj_clip['文字'] = text_of(draft, seg['material_id'])
            vol = seg.get('volume')
            if kind == 'audio' or (kind == 'video' and vol is not None):
                if vol is not None and abs(vol - 1) > 1e-6:
                    if vol <= 0:
                        adj_clip['静音'] = True
                    else:
                        adj_clip['增益dB'] = round((original or {}).get('增益dB', 0) + 20 * math.log10(vol), 2)
            if seg.get('speed') not in (None, 1, 1.0):
                adj_clip['变速'] = seg['speed']
            if track.get('attribute', 0) & 1:
                adj_clip['轨道静音'] = True
            clips.append(adj_clip)
            if original is None and kind == 'audio' and material.get('path'):
                source_path = resolve_draft_path(material['path'], draft_folder)
                recording_dir.mkdir(parents=True, exist_ok=True)
                out_path = recording_dir / f'录音-{len(recordings) + 1:02d}-{int(start_frame)}帧.wav'
                if source_path.exists():
                    # 只取片段用到的那一截，落点就是片段起帧
                    subprocess.run([FFMPEG, '-v', 'error', '-y', '-ss', f'{in_point_us / US_PER_SEC:.6f}', '-t', f'{duration_us / US_PER_SEC:.6f}',
                                    '-i', str(source_path), '-ac', '1', '-ar', '48000', str(out_path)], check=True)
                recordings.append(dict(名=adj_clip['名'], 文件=str(out_path.relative_to(package_dir)) if source_path.exists() else f'（找不到 {source_path}）', 起帧=start_frame, 长帧=length_frames, 入点帧=0.0))
    present_ids = {seg['id'] for track in draft['tracks'] for seg in track['segments']}
    deleted = [k for k, link in link_map['片段'].items() if link['片段id'] not in present_ids] + list(link_map.get('用户删掉', []))
    notes = []
    for mark in all_marks(draft):
        if mark['id'] in segment_marks:
            continue
        mark_start = us_to_frames(mark['time_range'].get('start', 0), fps)
        # 剪映改过标记的字以后会把 duration 写成和 start 一样（UI 上仍是一个点），这种不当区间
        dur = mark['time_range'].get('duration') or 0
        end_frame = us_to_frames(mark['time_range'].get('start', 0) + dur, fps) if dur and dur != mark['time_range'].get('start', 0) else None
        notes.append(dict(注释=mark.get('title', ''), 起帧=mark_start, 起时间=format_time(mark_start, fps), 止帧=end_frame, 止时间=format_time(end_frame, fps) if end_frame is not None else None, 颜色=mark.get('color')))
    adjustment = {'格式': '剪辑调整', '版本': 1, '剪辑包': package_dir.name, '项目名': link_map.get('草稿名'), '保存时间': time.strftime('%Y-%m-%d %H:%M:%S'),
          '清单生成时间': link_map.get('清单生成时间'), '帧率': fps, '来源': f'剪映草稿 {draft_folder}',
          '片段': clips, '删掉的片段': deleted, '注释': notes, '录音': recordings}
    out_path = package_dir / f'{adjust_name}.json'
    out_path.write_text(json.dumps(adjustment, ensure_ascii=False, indent=1), encoding='utf-8')
    return out_path


def has_user_changes(package_dir: Path, draft: dict | None = None) -> bool:
    """草稿和上次导入时（对照）比，用户动过没有：挪过、裁过、改过字或音量、删了、自己加了片段（录音）或标记"""
    link_map = json.loads((package_dir / LINK_MAP_FILENAME).read_text(encoding='utf-8'))
    if draft is None:
        draft_folder = draft_dir(link_map['草稿名'])
        if not (draft_folder / 'draft_info.json').exists():
            return False
        draft = read_draft(draft_folder)
    present = {seg['id']: (track, seg) for track in draft['tracks'] for seg in track['segments']}
    ids = set()
    for link in link_map['片段'].values():
        ids.add(link['片段id'])
        if link['片段id'] not in present:
            return True
        track, seg = present[link['片段id']]
        if not is_unmoved(seg, link):
            return True
        if seg.get('volume') not in (None, 1, 1.0) or seg.get('speed') not in (None, 1, 1.0):
            return True
        if '文字' in link and text_of(draft, seg['material_id']) != link['文字']:
            return True
    if set(present) - ids or link_map.get('用户删掉'):
        return True
    return any(m['id'] not in set(link_map.get('段标记', [])) for m in all_marks(draft))
