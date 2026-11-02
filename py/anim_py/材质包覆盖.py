"""Java 版材质包兼容层的出图（anim assets 材质包 调用，pipeline/资产/材质包.ts 排请求、入库、写覆盖层锁）。
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

单件上限 = 64 * 1024 * 1024
像素上限 = 8192 * 8192


class 包:
    def __init__(self, zip路径: str, 名: str):
        self.名 = 名
        self.z = zipfile.ZipFile(zip路径)
        名们 = [n for n in self.z.namelist() if not n.endswith('/')]
        # 有的包外面多套一层目录（<包名>/assets/...），按 pack.mcmeta 所在层定根；没有 pack.mcmeta 的（Vanilla Tweaks 拼出来的）按 assets/ 所在层
        根们 = sorted({n[: -len('pack.mcmeta')] for n in 名们 if n.endswith('pack.mcmeta')}, key=len)
        if not 根们:
            根们 = sorted({n[: n.index('assets/')] for n in 名们 if 'assets/' in n}, key=len)
        self.根 = 根们[0] if 根们 else ''
        self.文件 = {n[len(self.根):] for n in 名们 if n.startswith(self.根)}

    def 读(self, 相对: str) -> bytes | None:
        if 相对 not in self.文件:
            return None
        n = self.根 + 相对
        if self.z.getinfo(n).file_size > 单件上限:
            raise ValueError(f'{self.名}：{相对} 解压后太大，不像贴图')
        return self.z.read(n)

    def 图(self, 相对: str) -> Image.Image | None:
        b = self.读(相对)
        if b is None:
            return None
        im = Image.open(io.BytesIO(b))
        if im.width * im.height > 像素上限:
            raise ValueError(f'{self.名}：{相对} 尺寸 {im.size} 太大')
        return im.convert('RGBA')

    def json(self, 相对: str):
        b = self.读(相对)
        if b is None:
            return None
        try:
            return json.loads(b.decode('utf-8-sig'))
        except ValueError:
            return None


class 叠包:
    """按优先级从高到低叠的几个包：查一个路径，第一个有的包说了算"""

    def __init__(self, 包们: list[包]):
        self.包们 = 包们
        self.贡献: Counter = Counter()

    def 找(self, 相对: str) -> 包 | None:
        for p in self.包们:
            if 相对 in p.文件:
                return p
        return None


def 贴图路径(名: str) -> str:
    ns, _, p = 名.partition(':')
    if not p:
        ns, p = 'minecraft', 名
    return f'assets/{ns}/textures/{p}.png'


def 动画帧(p: 包, 相对: str, im: Image.Image) -> list[tuple[Image.Image, int]] | None:
    """有 animation 的按 MC 拆成 [(帧图, 时长 tick)]，frames 写的顺序、time 照写；没有 animation 返回 None"""
    meta = p.json(相对 + '.mcmeta')
    a = meta.get('animation') if isinstance(meta, dict) else None
    if not isinstance(a, dict):
        return None
    w, h = im.size
    边 = min(w, h)
    fw, fh = int(a.get('width', 边)), int(a.get('height', 边))
    if fw <= 0 or fh <= 0 or w % fw or h % fh:
        return None
    列 = w // fw
    帧数 = 列 * (h // fh)
    默认长 = max(1, int(a.get('frametime', 1)))
    序 = a.get('frames') or list(range(帧数))
    出 = []
    for f in 序:
        i = int(f.get('index', 0) if isinstance(f, dict) else f)
        t = int(f.get('time', 默认长)) if isinstance(f, dict) else 默认长
        if not 0 <= i < 帧数:
            continue
        x, y = (i % 列) * fw, (i // 列) * fh
        出.append((im.crop((x, y, x + fw, y + fh)), max(1, t)))
    return 出 or None


def 均匀取帧(帧们: list[tuple[Image.Image, int]], n: int) -> list[Image.Image]:
    """一整圈动画按时长均匀取 n 帧（第 k 帧取 k/n 圈处正在放的那帧），循环接得上"""
    总 = sum(t for _, t in 帧们)
    出 = []
    for k in range(n):
        at, 走 = k * 总 / n, 0
        for 图, t in 帧们:
            if at < 走 + t:
                出.append(图)
                break
            走 += t
        else:
            出.append(帧们[-1][0])
    return 出


def 规整(im: Image.Image, 目标: tuple[int, int]) -> tuple[Image.Image | None, str]:
    """缩放到目标尺寸：大的盒子平均（预乘透明度，镂空处的颜色不会把边缘拖黑），小的最近邻放大。返回 (图, 倍率说明)"""
    w, h = im.size
    tw, th = 目标
    if (w, h) == (tw, th):
        return im, '原样'
    if w * th != h * tw:
        return None, f'{w}×{h} 和要出的 {tw}×{th} 比例不同'
    if w > tw:
        倍 = w / tw
        out = im.convert('RGBa').resize((tw, th), Image.BOX).convert('RGBA')
        return out, f'{倍:g}倍缩' + ('' if w % tw == 0 else '（非整数倍）')
    倍 = tw / w
    return im.resize((tw, th), Image.NEAREST), f'{倍:g}倍放' + ('' if tw % w == 0 else '（非整数倍）')


def 找图(叠: 叠包, 相对: str):
    """(包, 图, 动画帧们或 None)；包里没有 → None"""
    p = 叠.找(相对)
    if p is None:
        return None
    im = p.图(相对)
    assert im is not None  # 找() 已确认包里有这个文件
    return p, im, 动画帧(p, 相对, im)


def 包倍(找到, 原宽: int) -> float:
    """包里一帧的宽是原版的几倍"""
    _, im, 帧们 = 找到
    return (帧们[0][0].width if 帧们 else im.width) / 原宽


def 有效倍(s: float, 上限: int) -> int:
    """包是原版的 s 倍：取不超过上限、整除 s 的最大 2 的幂；s 不是整数（24x）或比原版小 → 1"""
    if s < 1 or s != int(s):
        return 1
    f = 1
    while f * 2 <= 上限 and int(s) % (f * 2) == 0:
        f *= 2
    return f


def 取贴图(找到, 原尺寸: tuple[int, int], f: int):
    """包里的贴图出成原版尺寸的 f 倍，返回 (图, 说明)；尺寸对不上 → (None, 原因)"""
    _, im, 帧们 = 找到
    ow, oh = 原尺寸
    tw, th = ow * f, oh * f
    n = oh // ow if ow and oh % ow == 0 else 1
    if n == 1:
        # 原版一格：动画取第一帧
        return 规整(帧们[0][0] if 帧们 else im, (tw, th))
    # 原版是 n 帧竖条（动画），包里是动画、或者一张方图（静态）：按帧重排
    if 帧们 is None and im.width == im.height:
        帧们 = [(im, 1)]
    if 帧们 is None:
        return 规整(im, (tw, th))
    条 = Image.new('RGBA', (tw, th))
    说们 = set()
    for k, 图 in enumerate(均匀取帧(帧们, n)):
        g, 说 = 规整(图, (tw, tw))
        if g is None:
            return None, 说
        条.paste(g, (0, k * tw))
        说们.add(说)
    return 条, '、'.join(sorted(说们)) + f'（动画 {len(帧们)} 帧→{n} 帧）'


def 最近邻放大(im: Image.Image, f: int) -> Image.Image:
    return im if f == 1 else im.resize((im.width * f, im.height * f), Image.NEAREST)


def 存(im: Image.Image, 出目录: str, 名: str) -> str:
    f = os.path.join(出目录, 名.replace('/', '__') + '.png')
    im.save(f, format='PNG')
    return f


def 色图点(im: Image.Image, t: float, d: float) -> int:
    # 原版 GrassColor.get / FoliageColor.get：t、d 夹到 0～1，d *= t，取 (255 − t·255, 255 − d·255)
    t = min(1.0, max(0.0, t))
    d = min(1.0, max(0.0, d)) * t
    x, y = int((1 - t) * 255), int((1 - d) * 255)
    if x >= im.width or y >= im.height:
        return -1
    r, g, b, _ = im.getpixel((x, y))
    return (r << 16) | (g << 8) | b


def 换群系色(叠: 叠包, jar: zipfile.ZipFile, 原表文件: str, 出目录: str, id: str):
    改 = {}
    原图 = {}
    包图 = {}
    for 键, 名 in (('草', 'grass'), ('叶', 'foliage')):
        相对 = f'assets/minecraft/textures/colormap/{名}.png'
        p = 叠.找(相对)
        if p is None:
            continue
        包图[键] = (p.图(相对), p.名)
        原图[键] = Image.open(io.BytesIO(jar.read(相对))).convert('RGBA')
    if not 包图:
        return None
    表 = json.load(open(原表文件, encoding='utf-8'))
    for 群系, e in 表['群系'].items():
        ns, _, n = 群系.partition(':')
        if ns != 'minecraft':
            continue
        try:
            b = json.loads(jar.read(f'data/minecraft/worldgen/biome/{n}.json'))
        except KeyError:
            continue
        t, d = float(b.get('temperature', 0.5)), float(b.get('downfall', 0.5))
        for 键 in 包图:
            旧 = int(e[键][1:], 16)
            if 色图点(原图[键], t, d) != 旧:
                continue  # 写死颜色或带修饰的群系不跟色图
            新 = 色图点(包图[键][0], t, d)
            if 新 >= 0 and 新 != 旧:
                e[键] = f'#{新:06x}'
                改[群系 + '/' + 键] = (f'#{旧:06x}', e[键])
    if not 改:
        return None
    表['说明'] = 表.get('说明', '') + '；材质包兼容层按包里的 colormap 改过（pipeline/资产/材质包.ts）'
    f = os.path.join(出目录, id.replace('/', '__') + '.json')
    with open(f, 'w', encoding='utf-8') as fp:
        json.dump(表, fp, ensure_ascii=False, indent=2, sort_keys=True)
        fp.write('\n')
    return {'文件': f, '改': len(改), '色图来自': sorted({v[1] for v in 包图.values()}), '例': dict(list(改.items())[:6])}


OptiFine目录 = ('optifine/', 'mcpatcher/')


def 体检(p: 包) -> dict:
    """统计包里兼容层不支持的东西，给警告"""
    统计: Counter = Counter()
    例: dict[str, list[str]] = {}

    def 记(k: str, n: str):
        统计[k] += 1
        例.setdefault(k, [])
        if len(例[k]) < 4:
            例[k].append(n)

    for n in sorted(p.文件):
        if not n.startswith('assets/'):
            continue
        _, ns, *rest = n.split('/')
        sub = '/'.join(rest)
        if any(sub.startswith(d) for d in OptiFine目录):
            seg = sub.split('/')
            功能 = seg[1] if len(seg) > 2 else seg[1].split('.')[0]
            if 功能 == 'emissive' or n.endswith('emissive.properties'):
                功能 = 'emissive'
            记(f'OptiFine/{功能}', n)
        elif sub.startswith('models/block/'):
            记('models/block', n)
        elif sub.startswith('models/item/'):
            记('models/item', n)
        elif sub.startswith('blockstates/'):
            记('blockstates', n)
        elif sub.startswith('shaders/'):
            记('shaders', n)
        elif sub.startswith(('font/', 'textures/font/')):
            记('字体（不换：画面里的字是作品自己的点阵）', n)
        elif sub.startswith('textures/gui/'):
            记('界面（只换选择世界界面的泥土底、播放箭头）', n)
        elif sub.startswith('textures/') and sub.endswith('.png'):
            记('贴图', n)
    meta = p.json('pack.mcmeta')
    pf = meta.get('pack', {}).get('pack_format') if isinstance(meta, dict) else None
    sf = meta.get('pack', {}).get('supported_formats') if isinstance(meta, dict) else None
    return {'名': p.名, 'pack_format': pf, 'supported_formats': sf, '统计': dict(统计), '例': 例}


def main() -> None:
    with open(sys.argv[1], encoding='utf-8') as f:
        q = json.load(f)
    叠 = 叠包([包(x['zip'], x['名']) for x in q['包们']])
    jar = zipfile.ZipFile(q['原版jar'])
    出目录 = q['出目录']
    倍上限 = int(q.get('倍上限', 1))
    结果: dict = {'产物': [], '图集缺': 0, '图集不合': [], '单张缺': [], '单张原版放大': [], '单张不合': [], '图集格': {}, '缩放': Counter(), '各包贡献': Counter(), '体检': [体检(p) for p in 叠.包们]}

    def 记缩放(s: float, f: int, 说: str):
        结果['缩放'][f'包 {s:g} 倍 → 出 {f} 倍（{说}）'] += 1

    for t in q.get('图集', []):
        原 = Image.open(t['原图']).convert('RGBA')
        格 = t['格']
        找到们 = [找图(叠, 贴图路径(名)) for 名 in t['贴图名']]
        F = max([有效倍(包倍(x, 格), 倍上限) for x in 找到们 if x] or [1])
        # 方块表.png 是竖条：格边长宽，第 i 张在 y = 格·i（engine/voxel/真实方块图集.ts 按竖条宽取格边长，读的时候才排成 16 列）
        原 = 最近邻放大(原, F)
        换 = 0
        for i, (名, x) in enumerate(zip(t['贴图名'], 找到们)):
            if x is None:
                结果['图集缺'] += 1
                continue
            cell, 说 = 取贴图(x, (格, 格), F)
            if cell is None:
                结果['图集不合'].append({'名': 名, '包': x[0].名, '原因': 说})
                continue
            原.paste(cell, (0, i * 格 * F))
            换 += 1
            记缩放(包倍(x, 格), F, 说)
            结果['各包贡献'][x[0].名] += 1
        结果['图集格'][t['id']] = 格 * F
        结果['产物'].append({'id': t['id'], '文件': 存(原, 出目录, t['id']), '换': 换, '共': len(t['贴图名'])})
    单张们 = q.get('单张', [])
    原图们 = {s['id']: Image.open(s['原图']).convert('RGBA') for s in 单张们}
    找到们 = {s['id']: 找图(叠, s['包内']) for s in 单张们}
    上限们 = {s['id']: min(倍上限, int(s.get('倍上限', 倍上限))) for s in 单张们}
    组倍: dict[str, int] = {}
    for s in 单张们:
        x = 找到们[s['id']]
        if x:
            组倍[s['组']] = max(组倍.get(s['组'], 1), 有效倍(包倍(x, 原图们[s['id']].width), 上限们[s['id']]))
    for s in 单张们:
        原 = 原图们[s['id']]
        x = 找到们[s['id']]
        f = min(组倍.get(s['组'], 1), 上限们[s['id']])
        if x is None:
            结果['单张缺'].append(s['id'])
            if f > 1:
                # 同组别的贴图放大了，包里没有的原版贴图也跟着放大，一组一样大（消费处常把一组拼成一张图集）
                结果['单张原版放大'].append(s['id'])
                结果['产物'].append({'id': s['id'], '文件': 存(最近邻放大(原, f), 出目录, s['id']), '换': 0, '共': 1})
            continue
        im, 说 = 取贴图(x, 原.size, f)
        if im is None:
            结果['单张不合'].append({'id': s['id'], '包': x[0].名, '原因': 说})
            continue
        记缩放(包倍(x, 原.width), f, 说)
        结果['各包贡献'][x[0].名] += 1
        结果['产物'].append({'id': s['id'], '文件': 存(im, 出目录, s['id']), '换': 1, '共': 1})
    g = q.get('群系')
    if g:
        r = 换群系色(叠, jar, g['原表'], 出目录, g['id'])
        if r:
            结果['产物'].append({'id': g['id'], '文件': r['文件'], '换': r['改'], '共': r['改']})
            结果['群系色'] = {k: r[k] for k in ('改', '色图来自', '例')}
    结果['缩放'] = dict(结果['缩放'])
    结果['各包贡献'] = dict(结果['各包贡献'])
    print(json.dumps(结果, ensure_ascii=False))


if __name__ == '__main__':
    main()
