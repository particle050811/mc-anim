#!/usr/bin/env python3
"""剪辑包：给剪映专业版（OpenChatCut 备选）用的整片素材，让用户拖 AI 台词（字幕跟着走）、试听、录口播、加帧注释。
格式（清单.json 和读回的 调整-*.json）见 剪辑包格式.md；导入剪映.py / 导入OpenChatCut.py 按它建草稿或工程。
每集一个包，放在 预览/剪辑微调/第N章/（N 是这一集的第一章，不进 Git）；一集含哪几章看段清单（src/镜头/清单.ts 的 集），由 合成第六章.py --章 … 拼成一条。
轨道：字幕（每屏一个片段，字和起止帧由 字幕.py 的 plan_subtitles 现算，跟随它那句台词）、画面（不带字幕、2K、CRF 32、每帧关键帧）、
AI 配音（每句一个 wav，按整片增益预乘好，起帧带小数）、配乐（整条）、音效（一声一个片段，用户 10-15 要求；叠着的同种声并成一个；叠着的分到「音效 1」「音效 2」…几条轨）、我的口播（空，供录音）。
配乐、音效都照各段的清单合成（导出音效清单.mjs 渲各段第 0 帧和晚起声音露出来的那几帧收清单、音效拆分.py 合成），各段不再渲只出声音的版本；和「去掉台词的声音」比一下差多少。
最后核对（写进 清单 元数据.核对 和 核对.tsv，先只记不拦）：剪辑包各轨相加（照清单合成的配乐 + 音效 + 各句台词）vs 整片声音；逐段的清单合成 vs 母版去台词（漏收、多收的声音在这里现形）；台词落点偏差。
出法：快路（缺省）调 合成第六章.py --剪辑包，台词从拉响度前的整片声音里减掉；--正式 取第 6 章的成片，各段真渲去台词声音。出完自动跑 导入剪映.py。
用法（在 参考模型库/ 下）：caffeinate -i uv run -q --with numpy python 工具/剪辑微调/导出剪辑包.py [--章 6] [--重渲 <Composition id 前缀>...]
    [--正式] [--渲去台词] [--重做画面] [--不导入] [--OpenChatCut]
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

sys.path.append(str(Path(__file__).resolve().parents[1]))  # 工具/：取 公共/环境
import 音效拆分 as sfx_split  # noqa: E402
from 公共 import 段清单, 环境  # noqa: E402

LIB = Path(__file__).resolve().parents[2]
MAIN_DIR = 环境.工作区根() / '参考模型库'  # 视频/、预览/ 不在 Git 里，worktree 里也读写主目录
PACKAGES_DIR = MAIN_DIR.parent / '预览/剪辑微调'  # 一章一个子目录；导入剪映.py、导入OpenChatCut.py、读取调整.py 都在这里找包
DIALOGUE_REMOVED_CACHE = LIB / '工具/剪辑微调/out/去台词'
FPS = 24
SAMPLE_RATE = 48000
SAMPLES_PER_FRAME = SAMPLE_RATE // FPS
WIDTH, HEIGHT = 2560, 1440  # 画面和成片同规格：2K、CRF 32（用户 10-14 定）
DIALOGUE_BUS_GAIN = 1.0  # src/音效/混音.ts 的 台词音量（去台词开关关着时）


def latest_file(directory: Path, pattern: str) -> Path | None:
    candidates = sorted(directory.glob(pattern), key=lambda p: p.stat().st_mtime)
    return candidates[-1] if candidates else None


def official_inputs(chapter_dir: str, chapter: int) -> tuple[Path, Path, Path]:
    """合成第六章.py 把成片挪到 正篇/<章>/成片/第N章-<月日-时分>.mp4，拼接表、字幕表留在同一时刻的运行目录"""
    releases = [p for p in (MAIN_DIR.parent / '正篇' / chapter_dir / '成片').glob(f'第{chapter}章-*.mp4') if re.fullmatch(rf'第{chapter}章-\d{{4}}-\d{{4}}\.mp4', p.name)]
    if not releases:
        raise SystemExit(f'正篇/{chapter_dir}/成片/ 里没有只含第 {chapter} 章的成片，先跑 合成第六章.py --章 {chapter}')
    full_cut = max(releases, key=lambda p: p.stat().st_mtime)
    run_dir = MAIN_DIR.parent / '预览/渲染' / (full_cut.stem.split('-', 1)[1] + '-第六章完整参考')
    if not (run_dir / '拼接表.tsv').exists():
        raise SystemExit(f'{full_cut.name} 对应的 {run_dir.relative_to(MAIN_DIR.parent)}/拼接表.tsv 不在了')
    return full_cut, run_dir / '拼接表.tsv', run_dir / '字幕表.tsv'


# 每集的输入都在这里，键是这一集的第一章（--章 6）。这一集拼哪几章取段清单里同一集的章，原样传给 合成第六章.py --章
# （台词落点.ts 里要有这几章的台词）。第 7 章没有单独的完整参考，只在这一集里接在第 6 章后面。
EPISODES = {
    6: dict(
        项目名='第一集完整参考',
        # 快路：合成第六章.py --剪辑包 出画面、拼接表、字幕表、整片响度.json（出到 预览/渲染/<月日-时分>-第六章剪辑包/），拉响度前后的整片声音在 快路拼缓存
        合成脚本=LIB / '工具/合成第六章.py',
        快路拼缓存=LIB / '工具/合成第六章/out/视频/_拼剪辑包',
        # 以下是 --正式 那条路的输入（只有第 6 章的 2K 整片：--正式 只出第 6 章）
        # 整片：带字幕的成片，只拿它的声音当核对参照；无字幕整片：带伤害数字和称号、不带字幕，用 合成第六章.py --叠到 … --不叠字幕 出，取最新的
        # 整片、拼接表、字幕表（整片烧进去的字幕；这里现算一遍，和它对不上就报）：合成第六章.py --章 6 最新一次的成片，和同一次的 预览/渲染/<月日-时分>-第六章完整参考/
        正式输入=lambda: official_inputs('06-古城寻卷', 6),
        无字幕整片=lambda: latest_file(MAIN_DIR.parent / '预览/渲染', '*/6-完整参考-无字幕.mp4'),
        字幕模块=LIB / '工具/合成第六章',  # 字幕.py：load_dialogue_anchors（台词落点.ts）、to_global_frame、plan_subtitles
        # 合成第六章.py 拼整片时留下的中间文件：拉响度之前的整片（full_cut_gain_db 量增益）、拉响度 + 限幅之后的整片声音（24 位 PCM，残差拿它比）
        拼缓存=LIB / '工具/合成第六章/out/视频/_拼',
        # 不走台词轨的句子：增益另算（返回 增益dB, 头）
        特殊增益={'6-3-2-李樱-压路机': lambda: special_gain_6_3_2()},
    ),
}

args = sys.argv[1:]
first_chapter = int(args[args.index('--章') + 1]) if '--章' in args else 6
if first_chapter not in EPISODES:
    raise SystemExit(f'第 {first_chapter} 章还没有完整参考（整片、拼接表、字幕表、台词落点），见 EPISODES 的说明')
episode_config = EPISODES[first_chapter]
official = '--正式' in args
episode_chapters = 段清单.集的章(first_chapter)
if episode_chapters[0] != first_chapter:
    raise SystemExit(f'第 {first_chapter} 章不是它那一集的第一章（这一集含第 {"、".join(map(str, episode_chapters))} 章），--章 给第一章')
included_chapters = [first_chapter] if official else episode_chapters
if official and episode_chapters != [first_chapter]:
    print(f'!! --正式 只有第 {first_chapter} 章的 2K 整片，这一集别的章（{"、".join(str(chapter) for chapter in episode_chapters if chapter != first_chapter)}）不进包；整集用快路', flush=True)
render_dialogue_removed = official or '--渲去台词' in args
# 快路的拼接表、字幕表在 run_fast_path() 里换成这一次的
full_cut, cut_table, subtitle_table = episode_config['正式输入']() if official else (None, None, None)
splice_cache = episode_config['拼缓存'] if official else episode_config['快路拼缓存']
package_dir = PACKAGES_DIR / f'第{first_chapter}章'
sys.path.insert(0, str(episode_config['字幕模块']))
import 字幕 as subtitles  # noqa: E402  load_dialogue_anchors（各句文件开头落在哪段第几帧）、to_global_frame（段内帧 → 整片帧）、plan_subtitles（每屏字幕）和整片字幕用的是同一套

rerender_prefixes: list[str] = []
if '--重渲' in args:
    k = args.index('--重渲') + 1
    while k < len(args) and not args[k].startswith('--'):
        rerender_prefixes.append(args[k])
        k += 1
redo_picture = '--重做画面' in args


def run(*command, **kw):
    return subprocess.run(command, check=True, cwd=LIB, **kw)


read_audio = sfx_split.read_audio


def write_audio(path: Path, samples: np.ndarray):
    """写 WAV：峰值不过 1 用 24 位 PCM，过了用 32 位浮点（不削波）"""
    samples = np.ascontiguousarray(samples, np.float32)
    codec = 'pcm_s24le' if np.abs(samples).max() < 1.0 else 'pcm_f32le'
    tmp = path.with_suffix('.写入中.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', str(samples.shape[1]), '-i', '-', '-c:a', codec, str(tmp)],
                   input=samples.tobytes(), check=True)
    tmp.rename(path)
    return codec


def read_cut_table():
    rows = [row.split('\t') for row in cut_table.read_text(encoding='utf-8').splitlines()[1:] if row.strip()]
    return [(segment_id, comp_id, int(comp_start_frame), int(comp_end_frame), int(global_start_frame)) for segment_id, comp_id, comp_start_frame, comp_end_frame, global_start_frame in rows]


def full_cut_gain_db(segment_offsets) -> float:
    """合成第六章.py：整片照 EBU R128 量一次，加 (−16 − 响度) dB 的固定增益（volume={增益:.2f}dB）。快路直接读那一次写的 整片响度.json；
    正式那条路从它留下的拉响度之前的整片量；缓存没了就返回 None，由 main() 拿整片声音反推"""
    if fast_path_dir:
        return json.loads((fast_path_dir / '整片响度.json').read_text(encoding='utf-8'))['增益dB']
    master_path = splice_cache / '全片-未拉响度.mkv'
    if not master_path.exists():
        return None
    ebur_output = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(master_path), '-vn', '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8').stderr
    integrated_lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', ebur_output[ebur_output.rfind('Summary:'):]).group(1))
    return round(-16.0 - integrated_lufs, 2)


# ---------- 画面 ----------
def build_picture(total_frames: int):
    if fast_path_dir:
        return fast_path_picture(total_frames)
    source = episode_config['无字幕整片']()
    if source is None:
        raise SystemExit('没有不带字幕的整片，先照 EPISODES 里 无字幕整片 的说明出一份')
    if source.stat().st_mtime < full_cut.stat().st_mtime:
        print(f'!! 不带字幕的整片（{source}）比带字幕的整片旧，整片重拼过的话要重出一份', flush=True)
    frame_count = int(run('ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets',
                 '-of', 'csv=p=0', str(source), capture_output=True, text=True).stdout.strip())
    if frame_count != total_frames:
        raise SystemExit(f'{source} 有 {frame_count} 帧，拼接表是 {total_frames} 帧')
    out = package_dir / '画面.mp4'
    if out.exists() and not redo_picture and out.stat().st_mtime > source.stat().st_mtime:
        return out, source
    print(f'== 画面：{source.name} 压成每帧关键帧、不带声音', flush=True)
    tmp = out.with_suffix('.写入中.mp4')
    # -g 1：每帧都是 I 帧，剪映 / OpenChatCut 里拖播放头、逐帧挪台词时哪一帧都能直接解
    run(*环境.资源闸命令(*环境.低优先级前缀(), 'ffmpeg', '-v', 'error', '-y', '-i', str(source), '-an', '-vf', f'scale={WIDTH}:{HEIGHT}:flags=lanczos',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-g', '1', '-keyint_min', '1', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
        '-r', str(FPS), '-movflags', '+faststart', str(tmp)))
    tmp.rename(out)
    return out, source


def count_video_frames(path: Path) -> int:
    return int(run('ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets',
                   '-of', 'csv=p=0', str(path), capture_output=True, text=True).stdout.strip())


def fast_path_picture(total_frames: int):
    """合成第六章.py --剪辑包 已经按剪辑包的压法（2K、每帧关键帧、不带声音）压好，硬链接进包（同一个文件，不多占地方；
    剪映导入时再硬链接进草稿）。原文件留在 预览/渲染/ 那一次的文件夹里"""
    source = fast_path_dir / '画面.mp4'
    if (frame_count := count_video_frames(source)) != total_frames:
        raise SystemExit(f'{source} 有 {frame_count} 帧，拼接表是 {total_frames} 帧')
    out = package_dir / '画面.mp4'
    tmp = out.with_suffix('.写入中.mp4')
    tmp.unlink(missing_ok=True)
    try:
        os.link(source, tmp)
    except OSError:
        shutil.copyfile(source, tmp)
    tmp.rename(out)
    return out, source


def run_fast_path():
    """调 合成第六章.py --剪辑包，出到 预览/渲染/<月日-时分>-第六章剪辑包/（每次新开一个文件夹，旧的不覆盖）"""
    out_dir = MAIN_DIR.parent / '预览/渲染' / f'{time.strftime("%m%d-%H%M", time.gmtime())}-第六章剪辑包'
    t0 = time.time()
    run(sys.executable, str(episode_config['合成脚本']), '--剪辑包', '--出到', str(out_dir), '--章', *map(str, included_chapters), *(['--重渲', *rerender_prefixes] if rerender_prefixes else []))
    print(f'== 合成第六章.py --剪辑包：{time.time() - t0:.0f} 秒', flush=True)
    # 只留这一次和上一次（用户 10-19：一个 550 MB，留久了磁盘放不下）；剪映草稿用的是 预览/剪辑微调/ 里的硬链接，不引用这里
    for old in sorted(out_dir.parent.glob('*-第六章剪辑包'), key=lambda d: d.stat().st_mtime)[:-2]:
        shutil.rmtree(old)
        print(f'== 删掉旧剪辑包 {old.name}', flush=True)
    return out_dir


# ---------- 去台词的声音（--正式、--渲去台词 才用） ----------
# 各段只出声音的版本：开关见 src/音效/混音.ts。cache_dir 下一段一个 wav，--重渲 给的前缀才重渲
STEMS = {'去台词': (DIALOGUE_REMOVED_CACHE, '{"去台词":true}')}


def render_stem_audio(stem: str, comps: list[str]):
    cache_dir, props = STEMS[stem]
    cache_dir.mkdir(parents=True, exist_ok=True)
    for comp_id in comps:
        out = cache_dir / f'{comp_id}.wav'
        if out.exists() and not any(comp_id.startswith(prefix) for prefix in rerender_prefixes):
            continue
        tmp = out.with_suffix('.渲染中.wav')
        print(f'== 渲 {comp_id}（{stem}，只出声音）', flush=True)
        t0 = time.time()
        run(*环境.低优先级前缀(), *环境.资源闸命令(sys.executable, '工具/计时.py', f'剪辑微调{stem}-{comp_id}', '--',
            *环境.remotion命令('render', comp_id, str(tmp), '--codec=wav', f'--props={props}', '--log=error'), 渲染=True),
            env={**os.environ, 'AUDIO_ONLY': '1'})
        tmp.rename(out)
        print(f'   {comp_id}：{time.time() - t0:.0f} 秒', flush=True)


def concat_stem(stem: str, segment_offsets) -> np.ndarray:
    """照拼接表截取各段、接成一条（同 合成第六章.py：atrim start_sample = 段内起帧 × 2000，两声道）"""
    cache_dir = STEMS[stem][0]
    slices, cache = [], {}
    for segment_id, comp_id, comp_start_frame, comp_end_frame, global_start_frame in segment_offsets:
        if comp_id not in cache:
            cache[comp_id] = read_audio(cache_dir / f'{comp_id}.wav', 2)
        slice_samples = cache[comp_id][comp_start_frame * SAMPLES_PER_FRAME:comp_end_frame * SAMPLES_PER_FRAME]
        if len(slice_samples) != (comp_end_frame - comp_start_frame) * SAMPLES_PER_FRAME:
            raise SystemExit(f'{comp_id} 的{stem}声音只有 {len(cache[comp_id]) / SAMPLES_PER_FRAME:.1f} 帧，拼接表要到第 {comp_end_frame} 帧')
        slices.append(slice_samples)
    return np.concatenate(slices)


def subtract_dialogue(lines, source_audio, total_frames: int) -> np.ndarray:
    """快路的配乐和音效：拉响度之前的整片声音（合成第六章.py --剪辑包 留下的 全片-未拉响度.wav）减掉按落点放的各句台词。
    台词轨是原样放的（`DIALOGUE_BUS_GAIN` × 这句的增益，不压不变速），整片里台词和别的声音线性相加，所以减得干净，各段不用再渲去台词"""
    mix = read_audio(splice_cache / '全片-未拉响度.wav', 2).astype(np.float64)
    if len(mix) < total_frames * SAMPLES_PER_FRAME:
        raise SystemExit(f'{splice_cache / "全片-未拉响度.wav"} 只有 {len(mix) / SAMPLES_PER_FRAME:.1f} 帧，拼接表是 {total_frames} 帧')
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


# ---------- 台词 ----------
def build_dialogue_lines(segment_offsets, anchors):
    """每句：文件开头在整片第几帧（带小数）、源文件、这句自己的增益、整片里放到哪一帧为止（段尾帧）。接上段的后半截（同一个文件在下一段接着放）不另出。
    台词说过了段尾、下一段又没接着放的（7-1-3、7-1-6 各一句，各段 `声音.tsx` 只放 id 以本段号开头的句子），整片里到段尾就断了：
    配乐和音效只减掉放出来的那一截，AI 配音片段也截到段尾（文件还是整句，剪映里拉长片段能听到后面）"""
    out = []
    continued_ids = {anchor['id'] for anchor in anchors if anchor['接上段']}
    for anchor in anchors:
        if anchor['接上段']:
            continue
        source = LIB / anchor['文件']
        if anchor['id'] in episode_config['特殊增益']:
            # 6-3-2 不走台词轨：`思索.tsx` 里 volume = 台词音量 × 10^(增益dB/20)，增益和头取 `台词.ts` 的值
            gain_db, lead_in_sec = episode_config['特殊增益'][anchor['id']]()
        else:
            gain_db, lead_in_sec = 0.0, None  # 台词轨：volume = 台词音量 × 这句的 音量（第 6 章都没给，= 1）
        segment_end_frame = None if anchor['id'] in continued_ids else max(global_start_frame + comp_end_frame - comp_start_frame for segment_id, _, comp_start_frame, comp_end_frame, global_start_frame in segment_offsets if segment_id == anchor['段'])
        out.append(dict(id=anchor['id'], 段=anchor['段'], 字=anchor['字'], 角色=anchor['角色'], 源=source, 起帧=subtitles.to_global_frame(segment_offsets, anchor['段'], anchor['起帧']), 增益dB=gain_db, 头=lead_in_sec, 段尾=segment_end_frame))
    return out


# ---------- 字幕 ----------
# 样式照 src/模型/界面/字幕.tsx：1 个界面像素 = 画面高 / 90（1440p 16 像素）；字 8 个界面像素高、框四边各多 1 个、白字、黑底不透明度 0.5；
# 下方：框底离画面底 6 个界面像素；思索上：框底在思索按钮上沿（思索界面 240 高里的 240 − 54）以上 1 个界面像素
def subtitle_style(position: str, height: int = HEIGHT) -> dict:
    ui_pixel = height / 90
    box_height = round(10 * ui_pixel)
    box_bottom = int(np.floor((240 - 54) / 240 * height - ui_pixel)) if position == '思索上' else round(height - 6 * ui_pixel)
    # 字距 1 个界面像素：游戏像素字的汉字步进 9 个界面像素、字身 8 个，系统字体的字身 = 字号，不加字距一屏比成片窄一截
    return dict(字体='sans-serif', 字号=8, 颜色='#ffffff', 底色='rgba(0, 0, 0, 0.5)', 内边距=round(ui_pixel, 3), 行高=1.0, 字距=round(ui_pixel, 3),
                中心Y=round(box_bottom - box_height / 2 - height / 2, 3))


def compare_subtitle_table(screens):
    """现算的屏和整片烧进去的字幕表比：对不上说明整片是按旧的落点拼的（或者落点改了还没重拼）"""
    table = subtitle_table
    if not table.exists():
        print(f'!! 没有 {table}，没法和整片的字幕比', flush=True)
        return
    rows = [line.split('\t') for line in table.read_text(encoding='utf-8').splitlines()[1:] if line.strip()]
    old = [(row[3], int(row[4]), int(row[5])) for row in rows if row[4].strip()]
    new = [(screen.text, screen.start_frame, screen.end_frame) for screen in screens]
    if old != new:
        diffs = [f'{old_item} → {new_item}' for old_item, new_item in zip(old, new) if old_item != new_item][:5]
        print(f'!! 字幕和整片的字幕表对不上（表 {len(old)} 屏、现算 {len(new)} 屏），整片该重拼了：{diffs}', flush=True)


def special_gain_6_3_2():
    """6-3-2 现在选用的那一版（台词.ts 的 activeLine，默认改字）的 增益dB 和 头"""
    tmp = LIB / '工具/一镜到底/out/_剪辑微调632.ts'
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text("import { activeLine } from '../../../src/镜头/6-3-2/台词';\nconsole.log(JSON.stringify({ 增益dB: activeLine.增益dB, 头: activeLine.头 }));\n", encoding='utf-8')
    result = json.loads(run(*环境.ts工具命令(tmp.relative_to(LIB)), capture_output=True, text=True, encoding='utf-8').stdout.strip().splitlines()[-1])
    return result['增益dB'], result['头']


def speech_onset_sec(audio: np.ndarray) -> float:
    """文件里第一个响过 −45 dBFS 的样本（同 src/镜头/6-3-2/台词.ts、合成第六章.py 台词互相关 的开口判据）"""
    return float(np.argmax(np.abs(audio[:, 0]) > 10 ** (-45 / 20))) / SAMPLE_RATE


fast_path_dir: Path | None = None


def main():
    global fast_path_dir, cut_table, subtitle_table
    t0 = time.time()
    if not official:
        fast_path_dir = run_fast_path()
        cut_table, subtitle_table = fast_path_dir / '拼接表.tsv', fast_path_dir / '字幕表.tsv'
    package_dir.mkdir(parents=True, exist_ok=True)
    (package_dir / '台词').mkdir(exist_ok=True)
    segment_offsets = read_cut_table()
    total_frames = sum(comp_end_frame - comp_start_frame for _, _, comp_start_frame, comp_end_frame, _ in segment_offsets)
    picture_file, picture_source = build_picture(total_frames)
    screens, anchors = subtitles.plan_subtitles(LIB, segment_offsets, total_frames)
    compare_subtitle_table(screens)

    lines = build_dialogue_lines(segment_offsets, anchors)
    source_audio = {line['id']: read_audio(line['源'], 1) for line in lines}
    for line in lines:  # 整片里这句放了多少个样本（mix_in() 的起点取法：落在两个样本之间取后一个）
        played_samples = len(source_audio[line['id']])
        if line['段尾'] is not None:
            played_samples = min(played_samples, line['段尾'] * SAMPLES_PER_FRAME - int(np.ceil(line['起帧'] * SAMPLES_PER_FRAME - 1e-6)))
        line['播样本'] = played_samples
        if played_samples < len(source_audio[line['id']]):
            print(f'!! {line["id"]}：说过了 {line["段"]} 的段尾，整片里放到第 {line["段尾"]} 帧就断了，截掉 {(len(source_audio[line["id"]]) - played_samples) / SAMPLE_RATE:.2f} 秒'
                  '（下一段没接着放；AI 配音片段截到段尾，文件是整句）', flush=True)

    comps = list(dict.fromkeys(comp_id for _, comp_id, _, _, _ in segment_offsets))
    if render_dialogue_removed:
        render_stem_audio('去台词', comps)
        no_dialogue = concat_stem('去台词', segment_offsets)
    if not official:
        subtracted = subtract_dialogue(lines, source_audio, total_frames)
        if render_dialogue_removed:
            diff = subtracted.astype(np.float64) - no_dialogue
            print(f'减台词 vs 真渲去台词：差 {10 * np.log10(np.mean(diff ** 2) / np.mean(no_dialogue.astype(np.float64) ** 2) + 1e-30):.1f} dB（相对去台词电平）', flush=True)
        else:
            no_dialogue = subtracted
    if len(no_dialogue) != total_frames * SAMPLES_PER_FRAME:
        raise SystemExit(f'拼出来 {len(no_dialogue)} 个样本，整片应是 {total_frames * SAMPLES_PER_FRAME}')
    # 配乐、音效照各段的清单合成（音效拆分.py），各段不再渲只出声音的版本；和「去掉台词的声音」比一下差多少
    sfx_split.export_cues(comps)
    _, score = sfx_split.build_clips(segment_offsets, total_frames, read_audio, '配乐清单')
    sfx_clips, sfx_sum = sfx_split.build_clips(segment_offsets, total_frames, read_audio)
    sfx_clips = sfx_split.merge_stacked(sfx_clips)
    rebuilt_no_dialogue = score.astype(np.float64) + sfx_sum
    stem_residual_db, stem_rows = stem_residual_by_segment(no_dialogue, rebuilt_no_dialogue, segment_offsets)
    worst_segments = sorted((row for row in stem_rows if row[3] is not None), key=lambda row: row[3], reverse=True)
    print(f'配乐 + 音效（照清单合成）vs 去掉台词的声音：差 {stem_residual_db:.1f} dB；差得最多的段：' + '、'.join(f'{row[0]} {row[3]:.1f} dB' for row in worst_segments[:5]), flush=True)

    # 整片声音（参照）：拼整片时留下的 24 位 PCM 优先，没有就解成片的 AAC（正式：必须是成片前一小时内拼的那份，更早的不算）
    reference_file = splice_cache / '全片声音.wav'
    if official and (not reference_file.exists() or not 0 <= full_cut.stat().st_mtime - reference_file.stat().st_mtime < 3600):
        reference_file = full_cut
    reference = read_audio(reference_file, 2)
    # 整片的声音比各段母版晚一点：合成第六章.py 拉响度时的 alimiter（attack=1 毫秒）有前瞻，没开 latency 补偿，整条往后推了约 1 毫秒（47 个样本）。
    # 剪辑包各轨照落点和画面对齐，不跟着推；核对时把整片往前挪回这么多再比
    lag_samples = measure_lag(reference[:, 0], no_dialogue[:, 0])
    reference = np.concatenate([reference[lag_samples:], np.zeros((max(0, lag_samples), 2), np.float32)])[:total_frames * SAMPLES_PER_FRAME]
    print(f'整片声音比母版晚 {lag_samples} 个样本（{lag_samples / SAMPLE_RATE * 1000:.2f} 毫秒，整片限幅器的前瞻），核对时挪回来', flush=True)

    # 整片增益：合成第六章.py 用的那个数；缓存没了就用最小二乘从整片声音反推（只拿离限幅远的样本）
    gain_db = full_cut_gain_db(segment_offsets)
    unscaled_mix = no_dialogue.astype(np.float64).copy()
    for line in lines:
        mix_in(unscaled_mix, source_audio[line['id']][:line['播样本']] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
    safe_mask = np.abs(reference) < 0.3
    fitted_gain = float(np.sum(reference[safe_mask] * unscaled_mix[safe_mask]) / np.sum(unscaled_mix[safe_mask] ** 2))
    print(f'整片增益：合成第六章.py 用的 {gain_db} dB；从整片声音反推 {20 * np.log10(fitted_gain):.3f} dB', flush=True)
    if gain_db is None:
        gain_db = round(20 * np.log10(fitted_gain), 2)
    gain = 10 ** (gain_db / 20)

    # 写配乐、音效、台词
    score_codec = write_audio(package_dir / '配乐.wav', score * gain)
    (package_dir / '音效.wav').unlink(missing_ok=True)  # 以前是整条一个文件
    shutil.rmtree(package_dir / '音效', ignore_errors=True)
    (package_dir / '音效').mkdir()
    sfx_names: dict[str, int] = {}
    for clip in sfx_clips:
        base = f'{clip["段"]} {clip["名"]}'.replace('/', '／')
        sfx_names[base] = sfx_names.get(base, 0) + 1
        clip['片段名'] = base if sfx_names[base] == 1 else f'{base} #{sfx_names[base]}'
        write_audio(package_dir / '音效' / f'{clip["片段名"]}.wav', clip['声音'] * gain)
    sfx_lanes = sfx_split.pack_lanes(sfx_clips)
    dialogue_clips = []
    for line in sorted(lines, key=lambda clip: clip['起帧']):
        scaled_audio = source_audio[line['id']] * (10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN * gain)
        # 片段名 = 文件名：剪辑软件时间线上音频片段显示的是素材文件名，句子 id 后面带台词开头几个字，一眼认得出是哪句
        clip_name = f'{line["id"]}「{line["字"][:8]}」'
        write_audio(package_dir / '台词' / f'{clip_name}.wav', scaled_audio)
        lead_in_sec = line['头'] if line['头'] is not None else speech_onset_sec(source_audio[line['id']])
        truncated = line['播样本'] < len(scaled_audio)
        dialogue_clips.append(dict(
            名=clip_name, 文件=f'台词/{clip_name}.wav', 起帧=round(line['起帧'], 4),
            **({'长帧': round(line['播样本'] / SAMPLES_PER_FRAME, 4)} if truncated else {}),
            元数据=dict(句=line['id'], 段=line['段'], 角色=line['角色'], 字=line['字'], 长秒=round(line['播样本'] / SAMPLE_RATE, 6),
                      头秒=round(lead_in_sec, 4), 开口帧=round(line['起帧'] + lead_in_sec * FPS, 3), 预乘增益dB=round(line['增益dB'] + gain_db, 2),
                      **({'章': int(line['段'].split('-')[0])} if line['段'].split('-')[0] != str(first_chapter) else {}),
                      **({'段尾截掉秒': round((len(scaled_audio) - line['播样本']) / SAMPLE_RATE, 3), '整句长秒': round(len(scaled_audio) / SAMPLE_RATE, 6)} if truncated else {}))))
    clip_name_by_sentence = {clip['元数据']['句']: clip['名'] for clip in dialogue_clips}

    # 字幕：每屏一个片段，跟随 它那句台词
    subtitle_clips, screen_counts = [], {}
    for screen in screens:
        screen_counts[screen.sentence_id] = screen_counts.get(screen.sentence_id, 0) + 1
        subtitle_clips.append(dict(
            名=f'字幕 {screen.sentence_id} #{screen_counts[screen.sentence_id]}', 文字=screen.text, 起帧=screen.start_frame, 长帧=screen.end_frame - screen.start_frame, 跟随=clip_name_by_sentence[screen.sentence_id], 样式=subtitle_style(screen.position),
            元数据=dict(句=screen.sentence_id, 屏=screen_counts[screen.sentence_id], 位置=screen.position, 依据=screen.reason)))

    # 核对：整片 ≈ 剪辑包各轨相加（配乐、音效照清单合成，不是拿整片减台词得来的，那样比只剩限幅器、自己比自己）
    rebuilt_mix = rebuilt_no_dialogue.copy()
    for line in lines:
        mix_in(rebuilt_mix, source_audio[line['id']][:line['播样本']] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
    rebuilt = rebuilt_mix * gain
    residual = reference - rebuilt
    total_residual_db = db(np.mean(residual ** 2)) - db(np.mean(reference ** 2))
    check_rows = ['剪辑包各轨相加 vs 整片\t整片电平（dBFS RMS）\t残差电平（dBFS RMS）\t残差比整片（dB）\t残差峰值（dBFS）']
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
    # 逐段：清单合成的配乐 + 音效 vs 母版去台词（都在整片增益和限幅之前）。哪段漏收了声音（晚起的 Sequence、没登记的 <Audio>），这段就差得多
    check_rows += ['', '逐段清单合成\t母版去台词电平（dBFS RMS）\t清单合成残差电平（dBFS RMS）\t残差比母版（dB；母版低于 −70 不算）']
    check_rows += [f'段 {seg}\t{level:.1f}\t{residual:.1f}\t' + ('' if ratio is None else f'{ratio:.1f}') for seg, level, residual, ratio in stem_rows]
    # 台词落点：每句在拉响度之前的整片声音里 ±1 毫秒找最像的位置和增益（拿母版本身量，不拿剪辑包的轨）；正式那条路没有拉响度前的 wav，用整片声音除回增益量（限幅处略偏）
    master_mix = read_audio(splice_cache / '全片-未拉响度.wav', 2)[:total_frames * SAMPLES_PER_FRAME] if fast_path_dir else reference / gain
    check_rows += ['', '台词落点\t偏几个样本（±48 内最像的位置）\t那里的增益 dB（0 = 和代码里一样响）']
    anchor_misses = []
    for line in lines:
        k, gain_error_db = measure_anchor_offset(master_mix, source_audio[line['id']][:line['播样本'], 0] * 10 ** (line['增益dB'] / 20) * DIALOGUE_BUS_GAIN, line['起帧'])
        check_rows.append(f'{line["id"]}\t{k}\t{gain_error_db:+.2f}')
        if k != 0 or abs(gain_error_db) > 0.5:
            anchor_misses.append(f'{line["id"]}（{k:+d} 样本、{gain_error_db:+.2f} dB）')
    print(f'台词落点：{len(lines)} 句，' + (f'!! 对不上的：{"、".join(anchor_misses)}' if anchor_misses else '都在代码算的那个样本上、增益差不过 0.5 dB'), flush=True)
    (package_dir / '核对.tsv').write_text('\n'.join(check_rows) + '\n', encoding='utf-8')
    print(f'核对：残差比整片低 {-total_residual_db:.1f} dB；各句台词那一截最差低 {-worst_line_db:.1f} dB；重建后超过 −1.5 dBFS（整片限幅器会压）的样本 {int(limited_mask.sum())} 个', flush=True)

    # 标记：每截一个（一段切成几截时，后面的截写「（接）」）；段落：同样每截一行，整片帧 → 段内帧（拼接表的「从段内帧」= 这一截从 Composition 的第几帧开始）
    markers, segment_table, seen_segments = [], [], set()
    for segment_id, comp_id, comp_start_frame, comp_end_frame, global_start in segment_offsets:
        segment_name = comp_id.removeprefix(f'{segment_id}-')  # Composition id 去掉段号：6-1-2-斩娜迦 → 斩娜迦，6-2-5至6-3-3-飞越主世界俯冲边城 → 飞越主世界俯冲边城
        markers.append(dict(名=f'{segment_id} {segment_name}' + ('（接）' if segment_id in seen_segments else ''), 起帧=global_start, 长帧=comp_end_frame - comp_start_frame))
        segment_table.append(dict(段=segment_id, Composition=comp_id, 全片起帧=global_start, 段内起帧=comp_start_frame, 帧数=comp_end_frame - comp_start_frame))
        seen_segments.add(segment_id)

    manifest = dict(
        格式='剪辑包', 版本=1, 项目名=episode_config['项目名'], 生成时间=time.strftime('%Y-%m-%d %H:%M:%S'),
        帧率=FPS, 宽=WIDTH, 高=HEIGHT, 总帧=total_frames,
        轨道=[
            dict(名='字幕', 类型='文字', 片段=subtitle_clips),
            dict(名='画面', 类型='视频', 片段=[dict(名='画面（整片，不带字幕）', 文件=picture_file.name, 起帧=0, 长帧=total_frames)]),
            dict(名='AI 配音', 类型='音频', 片段=dialogue_clips),
            dict(名='配乐', 类型='音频', 片段=[dict(名='配乐（整片）', 文件='配乐.wav', 起帧=0, 长帧=total_frames, 元数据=dict(编码=score_codec))]),
            *[dict(名=f'音效 {i + 1}', 类型='音频', 片段=[dict(名=clip['片段名'], 文件=f'音效/{clip["片段名"]}.wav', 起帧=clip['起帧'], 元数据=dict(段=clip['段'], 声=clip['名']))
                                                         for clip in lane]) for i, lane in enumerate(sfx_lanes)],
            dict(名='我的口播', 类型='音频', 用途='录音', 片段=[]),
        ],
        标记=markers,
        段落=segment_table,
        元数据=dict(
            章=first_chapter, 含章=included_chapters, 采样率=SAMPLE_RATE, 整片增益dB=gain_db,
            来源=dict(画面=str(picture_source.relative_to(MAIN_DIR.parent)), 整片声音=str(reference_file), 拼接表=str(cut_table.relative_to(MAIN_DIR.parent)),
                    字幕表=str(subtitle_table.relative_to(MAIN_DIR.parent)), 出法='正式（成片）' if official else f'快路（合成第六章.py --剪辑包 --章 {" ".join(map(str, included_chapters))}）',
                    配乐='各段的配乐清单合成（音效拆分.py）', 音效='各段的音效清单一声声合成（音效拆分.py）'),
            核对=dict(配乐音效合成残差dB=round(stem_residual_db, 1), 整片声音滞后样本=lag_samples, 残差比整片dB=round(total_residual_db, 1), 台词段最差dB=round(worst_line_db, 1), 超限幅样本=int(limited_mask.sum()),
                    台词落点对不上=anchor_misses, 明细='核对.tsv'),
            说明='AI 配音的 起帧 = 这句配音文件开头在整片里的位置，开口 = 起帧 + 头秒 × 帧率。字幕每屏的起止帧由台词落点和配音里的停顿现算（工具/合成第六章/字幕.py 的 plan_subtitles），跟随它那句台词。',
        ),
    )
    (package_dir / '清单.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'剪辑包：{package_dir}（{len(dialogue_clips)} 句台词、{len(sfx_clips)} 声音效（{len(sfx_lanes)} 条轨）、{len(subtitle_clips)} 屏字幕、{len(markers)} 个标记、{total_frames} 帧），出包共 {time.time() - t0:.0f} 秒', flush=True)

    # 出完包直接写进剪映草稿（草稿已有就更新，用户挪过的保留）；--OpenChatCut 时导进 OpenChatCut
    if '--不导入' not in args:
        import_script = '导入OpenChatCut.py' if '--OpenChatCut' in args else '导入剪映.py'
        result = subprocess.run([sys.executable, str(Path(__file__).resolve().parent / import_script), str(package_dir)], cwd=LIB)
        if result.returncode:
            print(f'!! 没导进去，单独跑 python3 工具/剪辑微调/{import_script} 看原因', flush=True)


def db(energy):
    return 10 * np.log10(energy + 1e-30)


def stem_residual_by_segment(no_dialogue: np.ndarray, rebuilt_no_dialogue: np.ndarray, segment_offsets):
    """配乐 + 音效（照清单合成）vs 母版去台词：返回 (整片残差比 dB, [(段, 母版电平, 残差电平, 残差比或 None)…])，一截一行；母版低于 −70 dBFS 的不算比值"""
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
    """整片声音相对去掉台词的声音晚几个样本：取几处 2 秒的窗做互相关，取最多的那个"""
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
    main()
