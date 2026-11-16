"""Java 版材质包兼容层的出图（anim assets packs 调用，pipeline/取材/材质包.ts 排请求、入库、写覆盖层锁）。
请求 JSON（argv[1]）：包们（zip，按 MC 资源包界面从上到下 = 优先级从高到低）、原版jar、出目录、倍上限（2 的幂，材质包.ts 放大上限）、
图集（[{id, 原图, 贴图名, 格}]）、单张（[{id, 原图, 包内, 组, 倍上限?}]）、群系（{id, 原表}）。结果 JSON 打在 stdout 最后一行。
- 每个贴图按包的顺序找，第一个有的包说了算（同 MC），.png.mcmeta 取同一个包的；都没有就留原版。
- 动画贴图（.png.mcmeta 的 animation）：帧大小照 MC（写了 width/height 用它，没写取图宽高里小的那个），frames 的顺序、time 照写的、没写按 frametime。
  原版这件是一格（方块图集、方贴图）的取第一帧；原版是 N 帧竖条（水面）的，把包的一整圈动画按时长均匀取 N 帧排回竖条，帧数、帧长不同也能换（静态的就 N 帧都一样）。
- 分辨率：包是原版的 s 倍，出 f 倍 = 不超过倍上限、整除 s 的最大 2 的幂（32x 包、上限 2 → 原样；64x、128x → 缩到 2 倍；24x、48x 这类 → 1 倍）。
  比 f 倍大的按预乘透明度的盒子平均缩，小的最近邻放大。方块图集一格 = 16 × 各格 f 里最大的，包里没有的格（原版、模组的）最近邻放大到同一格；
  单张按 组（同一步导出的一组，消费处常拼在一起用）取组里最大的 f，组里包没有的原版贴图也最近邻放大，一组一样大。
- colormap：包里有 colormap/grass.png、foliage.png 的，原表里「按温度湿度查色图」的群系（原版色图在该点的颜色等于表里的）换成包色图同一点的颜色，
  写死颜色的群系（樱花林、沼泽修饰等）不动。温度、湿度取原版 jar 的 data/minecraft/worldgen/biome/*.json。
- OptiFine（CTM、CIT、emissive、自定义天空等）、models、blockstates、core shaders 不支持，只统计、列警告。
资源包是外面下载的不可信数据：只用 zipfile 按名读字节、Pillow 解码，不解压到盘上、不执行包里任何东西；用 python -I 跑。
"""
from __future__ import annotations

import io
import json
import os
import sys
import zipfile
from collections import Counter

from PIL import Image  # pyright: ignore[reportMissingImports]  Pillow 由 uv run --with 临时装，不进项目依赖

SINGLE_FILE_MAX_BYTES = 64 * 1024 * 1024
PIXEL_LIMIT = 8192 * 8192


class Pack:
    def __init__(self, zip_path: str, pack_name: str):
        self.名 = pack_name
        self.z = zipfile.ZipFile(zip_path)
        names = [n for n in self.z.namelist() if not n.endswith('/')]
        # 有的包外面多套一层目录（<包名>/assets/...），按 pack.mcmeta 所在层定根；没有 pack.mcmeta 的（Vanilla Tweaks 拼出来的）按 assets/ 所在层
        roots = sorted({n[: -len('pack.mcmeta')] for n in names if n.endswith('pack.mcmeta')}, key=len)
        if not roots:
            roots = sorted({n[: n.index('assets/')] for n in names if 'assets/' in n}, key=len)
        self.root_key = roots[0] if roots else ''
        self.pack_files = {n[len(self.root_key):] for n in names if n.startswith(self.root_key)}

    def read_file(self, rel_path: str) -> bytes | None:
        if rel_path not in self.pack_files:
            return None
        n = self.root_key + rel_path
        if self.z.getinfo(n).file_size > SINGLE_FILE_MAX_BYTES:
            raise ValueError(f'{self.名}：{rel_path} 解压后太大，不像贴图')
        return self.z.read(n)

    def image(self, rel_path: str) -> Image.Image | None:
        b = self.read_file(rel_path)
        if b is None:
            return None
        im = Image.open(io.BytesIO(b))
        if im.width * im.height > PIXEL_LIMIT:
            raise ValueError(f'{self.名}：{rel_path} 尺寸 {im.size} 太大')
        return im.convert('RGBA')

    def json(self, rel_path: str):
        b = self.read_file(rel_path)
        if b is None:
            return None
        try:
            return json.loads(b.decode('utf-8-sig'))
        except ValueError:
            return None


class PackStack:
    """按优先级从高到低叠的几个包：查一个路径，第一个有的包说了算"""

    def __init__(self, packs: list[Pack]):
        self.packs = packs
        self.contributions: Counter = Counter()

    def find_class(self, rel_path: str) -> Pack | None:
        for p in self.packs:
            if rel_path in p.pack_files:
                return p
        return None


def texture_path(texture_name: str) -> str:
    ns, _, p = texture_name.partition(':')
    if not p:
        ns, p = 'minecraft', texture_name
    return f'assets/{ns}/textures/{p}.png'


def animation_frames(p: Pack, rel_path: str, im: Image.Image) -> list[tuple[Image.Image, int]] | None:
    """有 animation 的按 MC 拆成 [(帧图, 时长 tick)]，frames 写的顺序、time 照写；没有 animation 返回 None"""
    meta = p.json(rel_path + '.mcmeta')
    a = meta.get('animation') if isinstance(meta, dict) else None
    if not isinstance(a, dict):
        return None
    w, h = im.size
    side = min(w, h)
    fw, fh = int(a.get('width', side)), int(a.get('height', side))
    if fw <= 0 or fh <= 0 or w % fw or h % fh:
        return None
    cols = w // fw
    frame_count = cols * (h // fh)
    default_frame_time = max(1, int(a.get('frametime', 1)))
    index_order = a.get('frames') or list(range(frame_count))
    out_frames = []
    for f in index_order:
        i = int(f.get('index', 0) if isinstance(f, dict) else f)
        t = int(f.get('time', default_frame_time)) if isinstance(f, dict) else default_frame_time
        if not 0 <= i < frame_count:
            continue
        x, y = (i % cols) * fw, (i // cols) * fh
        out_frames.append((im.crop((x, y, x + fw, y + fh)), max(1, t)))
    return out_frames or None


def pick_frames_evenly(frames: list[tuple[Image.Image, int]], n: int) -> list[Image.Image]:
    """一整圈动画按时长均匀取 n 帧（第 k 帧取 k/n 圈处正在放的那帧），循环接得上"""
    total_ticks = sum(t for _, t in frames)
    out_images = []
    for k in range(n):
        at, frame_start = k * total_ticks / n, 0
        for image, t in frames:
            if at < frame_start + t:
                out_images.append(image)
                break
            frame_start += t
        else:
            out_images.append(frames[-1][0])
    return out_images


def normalize_image(im: Image.Image, target: tuple[int, int]) -> tuple[Image.Image | None, str]:
    """缩放到目标尺寸：大的盒子平均（预乘透明度，镂空处的颜色不会把边缘拖黑），小的最近邻放大。返回 (图, 倍率说明)"""
    w, h = im.size
    tw, th = target
    if (w, h) == (tw, th):
        return im, '原样'
    if w * th != h * tw:
        return None, f'{w}×{h} 和要出的 {tw}×{th} 比例不同'
    if w > tw:
        scale = w / tw
        out = im.convert('RGBa').resize((tw, th), Image.BOX).convert('RGBA')
        return out, f'{scale:g}倍缩' + ('' if w % tw == 0 else '（非整数倍）')
    scale = tw / w
    return im.resize((tw, th), Image.NEAREST), f'{scale:g}倍放' + ('' if tw % w == 0 else '（非整数倍）')


def find_image(pack_stack: PackStack, rel_path: str):
    """(包, 图, 动画帧们或 None)；包里没有 → None"""
    p = pack_stack.find_class(rel_path)
    if p is None:
        return None
    im = p.image(rel_path)
    assert im is not None  # 找() 已确认包里有这个文件
    return p, im, animation_frames(p, rel_path, im)


def pack_scale(found, orig_width: int) -> float:
    """包里一帧的宽是原版的几倍"""
    _, im, frames = found
    return (frames[0][0].width if frames else im.width) / orig_width


def effective_scale(s: float, max_factor: int) -> int:
    """包是原版的 s 倍：取不超过上限、整除 s 的最大 2 的幂；s 不是整数（24x）或比原版小 → 1"""
    if s < 1 or s != int(s):
        return 1
    f = 1
    while f * 2 <= max_factor and int(s) % (f * 2) == 0:
        f *= 2
    return f


def get_texture(found, orig_size: tuple[int, int], f: int):
    """包里的贴图出成原版尺寸的 f 倍，返回 (图, 说明)；尺寸对不上 → (None, 原因)"""
    _, im, frames = found
    ow, oh = orig_size
    tw, th = ow * f, oh * f
    n = oh // ow if ow and oh % ow == 0 else 1
    if n == 1:
        # 原版一格：动画取第一帧
        return normalize_image(frames[0][0] if frames else im, (tw, th))
    # 原版是 n 帧竖条（动画），包里是动画、或者一张方图（静态）：按帧重排
    if frames is None and im.width == im.height:
        frames = [(im, 1)]
    if frames is None:
        return normalize_image(im, (tw, th))
    strip = Image.new('RGBA', (tw, th))
    notes = set()
    for k, image in enumerate(pick_frames_evenly(frames, n)):
        g, note = normalize_image(image, (tw, tw))
        if g is None:
            return None, note
        strip.paste(g, (0, k * tw))
        notes.add(note)
    return strip, '、'.join(sorted(notes)) + f'（动画 {len(frames)} 帧→{n} 帧）'


def nearest_upscale(im: Image.Image, f: int) -> Image.Image:
    return im if f == 1 else im.resize((im.width * f, im.height * f), Image.NEAREST)


def save_image(im: Image.Image, out_dir: str, name: str) -> str:
    f = os.path.join(out_dir, name.replace('/', '__') + '.png')
    im.save(f, format='PNG')
    return f


def colormap_point(im: Image.Image, t: float, d: float) -> int:
    # 原版 GrassColor.get / FoliageColor.get：t、d 夹到 0～1，d *= t，取 (255 − t·255, 255 − d·255)
    t = min(1.0, max(0.0, t))
    d = min(1.0, max(0.0, d)) * t
    x, y = int((1 - t) * 255), int((1 - d) * 255)
    if x >= im.width or y >= im.height:
        return -1
    r, g, b, _ = im.getpixel((x, y))
    return (r << 16) | (g << 8) | b


def remap_biome_color(pack_stack: PackStack, jar: zipfile.ZipFile, source_table_path: str, out_dir: str, id: str):
    changed = {}
    original_images = {}
    pack_images = {}
    for tint_key, colormap_name in (('草', 'grass'), ('叶', 'foliage')):
        rel_path = f'assets/minecraft/textures/colormap/{colormap_name}.png'
        p = pack_stack.find_class(rel_path)
        if p is None:
            continue
        pack_images[tint_key] = (p.image(rel_path), p.名)
        original_images[tint_key] = Image.open(io.BytesIO(jar.read(rel_path))).convert('RGBA')
    if not pack_images:
        return None
    table = json.load(open(source_table_path, encoding='utf-8'))
    for biome, e in table['群系'].items():
        ns, _, n = biome.partition(':')
        if ns != 'minecraft':
            continue
        try:
            b = json.loads(jar.read(f'data/minecraft/worldgen/biome/{n}.json'))
        except KeyError:
            continue
        t, d = float(b.get('temperature', 0.5)), float(b.get('downfall', 0.5))
        for tint_key in pack_images:
            old_color = int(e[tint_key][1:], 16)
            if colormap_point(original_images[tint_key], t, d) != old_color:
                continue  # 写死颜色或带修饰的群系不跟色图
            new_color = colormap_point(pack_images[tint_key][0], t, d)
            if new_color >= 0 and new_color != old_color:
                e[tint_key] = f'#{new_color:06x}'
                changed[biome + '/' + tint_key] = (f'#{old_color:06x}', e[tint_key])
    if not changed:
        return None
    table['说明'] = table.get('说明', '') + '；材质包兼容层按包里的 colormap 改过（pipeline/取材/材质包.ts）'
    f = os.path.join(out_dir, id.replace('/', '__') + '.json')
    with open(f, 'w', encoding='utf-8') as fp:
        json.dump(table, fp, ensure_ascii=False, indent=2, sort_keys=True)
        fp.write('\n')
    return {'文件': f, '改': len(changed), '色图来自': sorted({v[1] for v in pack_images.values()}), '例': dict(list(changed.items())[:6])}


optifine_dirs = ('optifine/', 'mcpatcher/')


def health_check(p: Pack) -> dict:
    """统计包里兼容层不支持的东西，给警告"""
    stats: Counter = Counter()
    examples: dict[str, list[str]] = {}

    def record(k: str, n: str):
        stats[k] += 1
        examples.setdefault(k, [])
        if len(examples[k]) < 4:
            examples[k].append(n)

    for n in sorted(p.pack_files):
        if not n.startswith('assets/'):
            continue
        _, ns, *rest = n.split('/')
        sub = '/'.join(rest)
        if any(sub.startswith(d) for d in optifine_dirs):
            seg = sub.split('/')
            feature = seg[1] if len(seg) > 2 else seg[1].split('.')[0]
            if feature == 'emissive' or n.endswith('emissive.properties'):
                feature = 'emissive'
            record(f'OptiFine/{feature}', n)
        elif sub.startswith('models/block/'):
            record('models/block', n)
        elif sub.startswith('models/item/'):
            record('models/item', n)
        elif sub.startswith('blockstates/'):
            record('blockstates', n)
        elif sub.startswith('shaders/'):
            record('shaders', n)
        elif sub.startswith(('font/', 'textures/font/')):
            record('字体（不换：画面里的字是作品自己的点阵）', n)
        elif sub.startswith('textures/gui/'):
            record('界面（只换选择世界界面的泥土底、播放箭头）', n)
        elif sub.startswith('textures/') and sub.endswith('.png'):
            record('贴图', n)
    meta = p.json('pack.mcmeta')
    pf = meta.get('pack', {}).get('pack_format') if isinstance(meta, dict) else None
    sf = meta.get('pack', {}).get('supported_formats') if isinstance(meta, dict) else None
    return {'名': p.名, 'pack_format': pf, 'supported_formats': sf, '统计': dict(stats), '例': examples}


def main() -> None:
    with open(sys.argv[1], encoding='utf-8') as f:
        q = json.load(f)
    pack_stack = PackStack([Pack(x['zip'], x['名']) for x in q['包们']])
    jar = zipfile.ZipFile(q['原版jar'])
    out_dir = q['出目录']
    max_scale = int(q.get('倍上限', 1))
    report: dict = {'产物': [], '图集缺': 0, '图集不合': [], '单张缺': [], '单张原版放大': [], '单张不合': [], '图集格': {}, '缩放': Counter(), '各包贡献': Counter(), '体检': [health_check(p) for p in pack_stack.packs]}

    def record_scale(s: float, f: int, note: str):
        report['缩放'][f'包 {s:g} 倍 → 出 {f} 倍（{note}）'] += 1

    for t in q.get('图集', []):
        original = Image.open(t['原图']).convert('RGBA')
        cell_size = t['格']
        found_list = [find_image(pack_stack, texture_path(texture_name)) for texture_name in t['贴图名']]
        F = max([effective_scale(pack_scale(x, cell_size), max_scale) for x in found_list if x] or [1])
        # 方块表.png 是竖条：格边长宽，第 i 张在 y = 格·i（engine/voxel/真实方块图集.ts 按竖条宽取格边长，读的时候才排成 16 列）
        original = nearest_upscale(original, F)
        replaced = 0
        for i, (texture_name, x) in enumerate(zip(t['贴图名'], found_list)):
            if x is None:
                report['图集缺'] += 1
                continue
            cell, note = get_texture(x, (cell_size, cell_size), F)
            if cell is None:
                report['图集不合'].append({'名': texture_name, '包': x[0].名, '原因': note})
                continue
            original.paste(cell, (0, i * cell_size * F))
            replaced += 1
            record_scale(pack_scale(x, cell_size), F, note)
            report['各包贡献'][x[0].名] += 1
        report['图集格'][t['id']] = cell_size * F
        report['产物'].append({'id': t['id'], '文件': save_image(original, out_dir, t['id']), '换': replaced, '共': len(t['贴图名'])})
    single_images = q.get('单张', [])
    source_images = {s['id']: Image.open(s['原图']).convert('RGBA') for s in single_images}
    found_list = {s['id']: find_image(pack_stack, s['包内']) for s in single_images}
    caps = {s['id']: min(max_scale, int(s.get('倍上限', max_scale))) for s in single_images}
    group_scale: dict[str, int] = {}
    for s in single_images:
        x = found_list[s['id']]
        if x:
            group_scale[s['组']] = max(group_scale.get(s['组'], 1), effective_scale(pack_scale(x, source_images[s['id']].width), caps[s['id']]))
    for s in single_images:
        original = source_images[s['id']]
        x = found_list[s['id']]
        f = min(group_scale.get(s['组'], 1), caps[s['id']])
        if x is None:
            report['单张缺'].append(s['id'])
            if f > 1:
                # 同组别的贴图放大了，包里没有的原版贴图也跟着放大，一组一样大（消费处常把一组拼成一张图集）
                report['单张原版放大'].append(s['id'])
                report['产物'].append({'id': s['id'], '文件': save_image(nearest_upscale(original, f), out_dir, s['id']), '换': 0, '共': 1})
            continue
        im, note = get_texture(x, original.size, f)
        if im is None:
            report['单张不合'].append({'id': s['id'], '包': x[0].名, '原因': note})
            continue
        record_scale(pack_scale(x, original.width), f, note)
        report['各包贡献'][x[0].名] += 1
        report['产物'].append({'id': s['id'], '文件': save_image(im, out_dir, s['id']), '换': 1, '共': 1})
    g = q.get('群系')
    if g:
        r = remap_biome_color(pack_stack, jar, g['原表'], out_dir, g['id'])
        if r:
            report['产物'].append({'id': g['id'], '文件': r['文件'], '换': r['改'], '共': r['改']})
            report['群系色'] = {k: r[k] for k in ('改', '色图来自', '例')}
    report['缩放'] = dict(report['缩放'])
    report['各包贡献'] = dict(report['各包贡献'])
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
