"""读用户在剪映里的调整，和同一个剪辑包的 清单.json 比，列出谁挪了多少。
调整从哪来：包目录里有 剪映-对照.json 时从剪映草稿现拉一份 调整-<月日-时分>.json（剪映.py 的 export_adjustments，剪映开不开都行，录音转成 wav 拷到 录音/）；
--不拉 或直接给 调整-*.json 就只读已有的文件。
只读、只列，不改代码：写回各段 段.ts 由主会话按用户确认来做。片段按 名 对（名在整个包里唯一）。
- 台词（AI 配音轨，元数据里有 句）：挪了多少按「文件开头」算（片段起点 − 入点），和清单的 起帧 − 入点帧 比；一句被切成几段就每段一行，删掉、静音、改过音量或变速的写在备注里。
- 字幕（文字轨，跟随 一句台词）：每屏起止帧由台词落点和配音停顿现算（pipeline/合成/字幕.ts），台词挪了字幕跟着挪；这里只列相对台词单独挪过、改过长短或改过字的屏。
- 注释（用户在剪映里加的标记，以前放的紫色段标记不算）单独一张表，按时间排：整片帧和时间、段号和 Composition、段内帧（按清单的 段落 换算）、注释文字，区间注释另有止帧。
- 录音：用户自己的口播，只拿来对节奏，列出位置和文件。
用法：anim jianying readback <包目录 | 调整-xxxx.json> [--不拉]；单独跑 python -m anim_py.剪辑微调.读取调整 <同上> [--不拉] [--草稿根 …] [--剪映 …] [--解密程序 …]
  给包目录：先拉一份新的再读；给 调整 文件就读那个文件。结果打在屏幕上，另写 <调整文件名>-对比.tsv 和 <调整文件名>-注释.tsv。
"""
import argparse
import json
from pathlib import Path

from . import 剪映 as jianying


def find_adjustment_file(path: Path, pull: bool) -> Path:
    if path.is_file():
        return path.resolve()
    if pull and (path / jianying.LINK_MAP_FILENAME).exists():
        return jianying.export_adjustments(path)
    candidates = sorted(path.glob('调整-*.json'), key=lambda file: file.stat().st_mtime)
    if not candidates:
        raise SystemExit(f'{path} 里还没有 调整-*.json（先跑 anim jianying export 建草稿）')
    return candidates[-1]


def locate_segment(segments, frame: float):
    for segment in segments:
        if segment['全片起帧'] <= frame < segment['全片起帧'] + segment['帧数']:
            return segment['段'], segment.get('Composition'), segment['段内起帧'] + frame - segment['全片起帧']
    return None, None, None


def check_segments(manifest):
    """清单的段落和导出时的拼接表比：剪辑包导出以后整片重拼过，段内帧会对不上。拼接表是 anim film 写的（编号、段、指纹、段内起帧、段内止帧、全片起帧）"""
    table_path = manifest.get('元数据', {}).get('来源', {}).get('拼接表')
    if not table_path or not Path(table_path).exists():
        return
    rows = [line.split('\t') for line in Path(table_path).read_text(encoding='utf-8').splitlines()[1:] if line.strip()]
    current = [(number or comp, comp, int(global_start), int(in_start), int(in_end) - int(in_start)) for number, comp, _, in_start, in_end, global_start in rows]
    in_package = [(segment['段'], segment.get('Composition'), segment['全片起帧'], segment['段内起帧'], segment['帧数']) for segment in manifest.get('段落', [])]
    if current != in_package:
        print(f'!! 剪辑包导出以后 {table_path} 变了（整片重拼过），注释的段内帧按剪辑包导出时的拼接表算；最好重出剪辑包')


def write_notes_table(manifest, adjustment, out_path: Path):
    rows = ['起帧\t起时间\t止帧\t止时间\t段\tComposition\t段内起帧\t止帧所在段\t段内止帧\t注释']
    notes = sorted(adjustment.get('注释', []), key=lambda note: note['起帧'])
    for note in notes:
        segment_id, comp, in_segment_frame = locate_segment(manifest.get('段落', []), note['起帧'])
        end_segment_id, _, end_in_segment_frame = locate_segment(manifest.get('段落', []), note['止帧']) if note.get('止帧') is not None else (None, None, None)
        rows.append('\t'.join(str(cell) if cell is not None else '' for cell in [
            note['起帧'], note['起时间'], note.get('止帧'), note.get('止时间'), segment_id, comp, in_segment_frame, end_segment_id, end_in_segment_frame, note['注释'].replace('\t', ' ').replace('\n', ' ')]))
    out_path.write_text('\n'.join(rows) + '\n', encoding='utf-8')
    return notes, rows[1:]


def clip_remarks(clip, original) -> list[str]:
    remarks = []
    if clip.get('被裁剪'):
        remarks.append(f'裁过（入点 {clip["入点帧"]:.2f} 帧、长 {clip["长帧"]:.2f} 帧）')
    if clip.get('静音'):
        remarks.append('片段静音')
    if clip.get('轨道静音'):
        remarks.append('轨道静音')
    if clip.get('增益dB') is not None and clip['增益dB'] != original.get('增益dB'):
        remarks.append(f'音量 {clip["增益dB"]:+g} dB')
    if clip.get('变速') is not None:
        remarks.append(f'变速 ×{clip["变速"]}（挪的量只看文件开头，变速后开口不准）')
    return remarks


def parse_args(argv: list[str] | None):
    parser = argparse.ArgumentParser(prog='读取调整')
    parser.add_argument('路径', type=Path, help='包目录或 调整-*.json')
    parser.add_argument('--不拉', action='store_true')
    parser.add_argument('--草稿根', type=Path)
    parser.add_argument('--剪映', type=Path)
    parser.add_argument('--解密程序', type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None):
    args = parse_args(argv)
    jianying.设路径(args.草稿根, args.剪映, args.解密程序)
    adjustment_file = find_adjustment_file(args.路径, not args.不拉)
    package_dir = adjustment_file.parent
    adjustment = json.loads(adjustment_file.read_text(encoding='utf-8'))
    manifest = json.loads((package_dir / '清单.json').read_text(encoding='utf-8'))
    if adjustment.get('格式') != '剪辑调整':
        raise SystemExit(f'{adjustment_file} 不是「剪辑调整」格式（旧版本的调整文件？）')
    if adjustment.get('清单生成时间') != manifest['生成时间']:
        print(f'!! 注意：这份调整是在 {adjustment.get("清单生成时间")} 生成的剪辑包上做的，现在的剪辑包是 {manifest["生成时间"]} 生成的，'
              '原始位置以现在的 清单.json 为准（剪辑包重新导出过的话，原始位置可能已经变了）')
    check_segments(manifest)

    originals = {clip['名']: (track, clip) for track in manifest['轨道'] for clip in track['片段']}
    current_clips: dict[str, list[dict]] = {}
    for clip in adjustment['片段']:
        current_clips.setdefault(clip['名'], []).append(clip)

    def moved_offsets(name: str):
        """[(现片段, 文件开头挪了几帧)]；删掉了返回 []"""
        track, original = originals[name]
        original_head = original['起帧'] - original.get('入点帧', 0)
        return [(clip, 0.0 if abs(clip['文件开头帧'] - original_head) < 0.01 else clip['文件开头帧'] - original_head) for clip in sorted(current_clips.get(name, []), key=lambda other: other['起帧'])]

    # 台词
    rows = ['句\t段\t角色\t台词开头\t原文件开头帧\t现文件开头帧\t挪了帧\t挪了秒\t原开口帧\t现开口帧\t备注']
    dialogue_moves, dialogue_shift_by_name = [], {}
    fps = manifest['帧率']
    for track in manifest['轨道']:
        for original in track['片段']:
            meta = original.get('元数据', {})
            if track['类型'] != '音频' or '句' not in meta:
                continue
            current = moved_offsets(original['名'])
            if not current:
                rows.append(f'{meta["句"]}\t{meta["段"]}\t{meta["角色"]}\t{meta["字"][:12]}\t{original["起帧"]:.2f}\t\t\t\t{meta["开口帧"]:.2f}\t\t删掉了')
                dialogue_moves.append(f'{meta["句"]}：删掉了')
                continue
            dialogue_shift_by_name[original['名']] = current[0][1]
            for k, (clip, shift) in enumerate(current):
                remarks = ([f'拆成 {len(current)} 段的第 {k + 1} 段'] if len(current) > 1 else []) + clip_remarks(clip, original)
                rows.append('\t'.join([
                    meta['句'], meta['段'], meta['角色'], meta['字'][:12], f'{original["起帧"]:.2f}', f'{clip["文件开头帧"]:.2f}', f'{shift:+.2f}', f'{shift / fps:+.3f}',
                    f'{meta["开口帧"]:.2f}', f'{meta["开口帧"] + shift:.2f}', '；'.join(remarks)]))
                if shift != 0 or remarks:
                    dialogue_moves.append(f'{meta["句"]}：{shift:+.2f} 帧（{shift / fps:+.3f} 秒）' + (f'  {"；".join(remarks)}' if remarks else ''))

    # 字幕：跟着台词挪的不列，单独挪过、改过长短或字的列出来
    rows += ['', '字幕屏\t句\t字\t原起帧\t现起帧\t自己挪了帧\t台词挪了帧\t相对台词帧\t原长帧\t现长帧\t备注']
    subtitle_exceptions = []
    follow_count = 0
    for track in manifest['轨道']:
        if track['类型'] != '文字':
            continue
        for original in track['片段']:
            leader = original.get('跟随')
            current = moved_offsets(original['名'])
            sentence_id = original.get('元数据', {}).get('句', '')
            if not current:
                rows.append(f'{original["名"]}\t{sentence_id}\t{original.get("文字", "")}\t{original["起帧"]}\t\t\t\t\t{original.get("长帧", "")}\t\t删掉了')
                subtitle_exceptions.append(f'{original["名"]}「{original.get("文字", "")}」：删掉了')
                continue
            for clip, shift in current:
                leader_shift = dialogue_shift_by_name.get(leader, 0.0) if leader else 0.0
                relative_shift = shift - leader_shift
                remarks = []
                if abs(relative_shift) >= 0.01:
                    remarks.append(f'单独挪了 {relative_shift:+.2f} 帧')
                if abs(clip['长帧'] - original.get('长帧', clip['长帧'])) >= 0.01:
                    remarks.append(f'长短 {original["长帧"]} → {clip["长帧"]:.2f} 帧')
                if clip.get('文字') is not None and clip['文字'] != original.get('文字'):
                    remarks.append(f'字改成「{clip["文字"]}」')
                if len(current) > 1:
                    remarks.append(f'拆成 {len(current)} 段')
                if not remarks:
                    if shift != 0:
                        follow_count += 1
                    continue
                rows.append('\t'.join([original['名'], sentence_id, original.get('文字', ''), f'{original["起帧"]}', f'{clip["起帧"]:.2f}', f'{shift:+.2f}', f'{leader_shift:+.2f}',
                                     f'{relative_shift:+.2f}', f'{original.get("长帧", "")}', f'{clip["长帧"]:.2f}', '；'.join(remarks)]))
                subtitle_exceptions.append(f'{original["名"]}「{original.get("文字", "")}」：{"；".join(remarks)}')

    # 别的片段（画面、配乐）被挪过、裁过；清单里没有的片段（用户自己加的）
    for name, (track, original) in originals.items():
        if track['类型'] == '文字' or original.get('元数据', {}).get('句'):
            continue
        for clip, shift in moved_offsets(name):
            if shift != 0 or clip.get('被裁剪') or clip.get('静音') or clip.get('轨道静音'):
                rows.append(f'!! {name}（{track["名"]}）：文件开头挪了 {shift:+.2f} 帧；{"；".join(clip_remarks(clip, original))}')
    for clip in adjustment['片段']:
        if clip.get('清单里没有'):
            rows.append(f'!! 清单里没有的片段：{clip["名"]}（{clip["轨道"]}）起 {clip["起帧"]:.2f} 帧、长 {clip["长帧"]:.2f} 帧')

    rows += ['', '录音文件\t起帧\t长帧\t入点帧']
    for recording in adjustment.get('录音', []):
        rows.append(f'{recording["文件"]}\t{recording["起帧"]:.2f}\t{recording["长帧"]:.2f}\t{recording["入点帧"]:.2f}')

    out_path = adjustment_file.with_name(adjustment_file.stem + '-对比.tsv')
    out_path.write_text('\n'.join(rows) + '\n', encoding='utf-8')

    print(f'{package_dir.name}/{adjustment_file.name}（{adjustment.get("保存时间")}）对比 清单.json：')
    print('台词：' + ('没有被挪过' if not dialogue_moves else ''))
    for line in dialogue_moves:
        print(f'  {line}')
    print(f'字幕：每屏的起止帧由代码里的台词落点现算，跟着台词挪的 {follow_count} 屏改台词落点就跟着走；'
          + ('没有单独挪过的屏' if not subtitle_exceptions else f'单独改过的 {len(subtitle_exceptions)} 屏（要另改字幕规则或断屏）：'))
    for line in subtitle_exceptions:
        print(f'  {line}')
    for line in rows:
        if line.startswith('!! '):
            print(f'  {line}')
    notes_path = adjustment_file.with_name(adjustment_file.stem + '-注释.tsv')
    notes, note_rows = write_notes_table(manifest, adjustment, notes_path)
    print(f'注释 {len(notes)} 条（按时间）：')
    for line in note_rows:
        cells = line.split('\t')
        print(f'  整片第 {cells[0]} 帧（{cells[1]}）{"～" + cells[2] + " 帧" if cells[2] else ""}  {cells[4]} 段内第 {cells[6]} 帧（{cells[5]}）：{cells[9]}')
    print(f'录音 {len(adjustment.get("录音", []))} 段；明细写在 {out_path}、{notes_path}')


if __name__ == '__main__':
    main()
