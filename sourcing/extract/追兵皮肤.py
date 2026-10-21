# 追兵皮肤：给 模型/角色/追兵.tsx 的黄叛、刘心忠生成 Minecraft 皮肤式贴图（1 像素 = 模型 1 像素，最近邻）。
# 用法（在 参考模型库/ 下）：npm run 取材 -- 追兵皮肤   或   uv run --with pillow 工具/游戏取材/追兵皮肤.py [核对图目录]
#
# 依据（优先级：设定图 > 原文 > 旧模型的配色和配件）：
# - 黄叛：设定/角色/黄叛/黄叛三视图.png。三视图是 AI 生成的像素皮肤渲染图（网格没对齐、头被压扁），所以按「每个面在设定图上的矩形」切成 宽×高 个格子，
#   每格取中间 70% 的中位色（青色纹路占三成以上就取青色，见 `ACCENT`；白底不算），再整体减色成十几种颜色，排成原版 64×64 皮肤展开图
#   （`PlayerModel`：头 0,0、帽子层 32,0、身子 16,16、外套层 16,32、右臂 40,16、右袖 40,32、左臂 32,48、左袖 48,48、右腿 0,16、右裤 0,32、左腿 16,48、左裤 0,48）。
#   被手臂挡住或设定图上没有的面（手臂内侧、顶底）用相邻面的边缘像素补；左臂正面被弓挡住，左右手臂都用右臂（左边镜像）。
#   胸口、背和头盔逐格取样很碎，这几面整面换成照设定图画的像素（`HP_FIX`，说明见它前面）。
#   外层（帽子层、外套层、袖子、裤子层）只留设定图上凸出来的部件：头盔顶青色冠脊、面甲（眼缝留空露出里层的黑）、后脑绕到两侧的青箍和下面的灰边、肩上灰色护肩带、小臂护腕、膝下皮护腿箍、腰带（正面是扣）。
#   箭袋单独一张贴图（追兵.贴图/黄叛箭袋.png），照设定图背面画：棕色皮面、紫灰包边、中段一道青色。
# - 刘心忠：设定/角色/刘心忠/刘心忠三视图.png。头是村民的头（8×10×8，长鼻子），设定图上的脸就是原版村民的脸，所以头和鼻子照抄 1.20.1 客户端 jar 的
#   textures/entity/villager/villager.png（布局也照 `VillagerModel`：头 0,0、鼻子 24,0）；手（袖口以下两行）也照抄原版村民手臂贴图的最下两行。
#   兜帽、长袍、袖子、腿、法杖按设定图取样（取色 + 减色同上，点缀色换成金边），兜帽正面按设定图的金边开口画（脸那一块透明露出村民的脸）；晶石、金托是手画的几个像素。
#   贴图 128×64，布局见 `LX_UV`（追兵.tsx 里同一份数字）。
# 输出：src/模型/角色/追兵.贴图/{黄叛,黄叛箭袋,刘心忠}.png（8 位 RGBA）。给了核对图目录时，另存放大的贴图和取样位置图。
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]  # 参考模型库/
PROJ = ROOT.parent
OUT = ROOT / 'src/模型/角色/追兵.贴图'
CLIENT_JAR = PROJ / 'game/缓存/client-1.20.1.jar'
HP_SHEET = PROJ / '设定/角色/黄叛/黄叛三视图.png'
LX_SHEET = PROJ / '设定/角色/刘心忠/刘心忠三视图.png'
DEBUG = Path(sys.argv[1]) if len(sys.argv) > 1 else None

T = (0, 0, 0, 0)


# ---------- 取样 ----------
def median(px):
    return tuple(sorted(p[i] for p in px)[len(px) // 2] for i in range(3))


# 点缀色（黄叛的青色纹路、刘心忠的金边）：设定图的像素比模型细（AI 图约 2 倍密度），细线常常只占一格的一半，取中位色会被底色吃掉。
# 所以每格先看点缀色占多少：超过 `ACCENT_SHARE` 就取点缀色的中位色，否则取其余像素的中位色。
ACCENT_SHARE = 0.3
ACCENT = None  # 当前角色的点缀色判断，huangpan()/liuxinzhong() 里设


def sample(img, rect, cols, rows, marks=None):
    """设定图上 rect=(x0,y0,x1,y1) 切成 cols×rows 格，每格取中间 70% 的颜色（见 ACCENT）。返回 rows 行 cols 列的 RGB 元组。"""
    x0, y0, x1, y1 = rect
    cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
    out = []
    for r in range(rows):
        row = []
        for c in range(cols):
            a, b = x0 + (c + 0.15) * cw, y0 + (r + 0.15) * ch
            box = img.crop((int(a), int(b), int(a + cw * 0.7), int(b + ch * 0.7)))
            px = list(zip(*[iter(box.tobytes())] * 3))
            px = [p for p in px if min(p) < 215] or px  # 设定图的白底不算（手臂斜着，格子边上会露出底色）
            acc = [p for p in px if ACCENT and ACCENT(p)]
            if len(acc) > ACCENT_SHARE * len(px):
                row.append(median(acc))
            else:
                rest = [p for p in px if not (ACCENT and ACCENT(p))]
                row.append(median(rest or px))
        out.append(row)
    if marks is not None:
        marks.append(rect + (cols, rows))
    return out


def quantize(faces, n):
    """几张取样面一起减色成 n 种颜色（中位切分），返回同形状的新面。"""
    allpx = [p for f in faces.values() for row in f for p in row]
    strip = Image.new('RGB', (len(allpx), 1))
    strip.putdata(allpx)
    q = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()[: n * 3]
    pal = [tuple(pal[i : i + 3]) for i in range(0, len(pal), 3)]
    near = lambda p: min(pal, key=lambda c: sum((c[i] - p[i]) ** 2 for i in range(3)))
    return {k: [[near(p) for p in row] for row in f] for k, f in faces.items()}, pal


def flip(f):
    return [list(reversed(row)) for row in f]


def col(f, i):
    return [row[i] for row in f]


def from_cols(cols):
    return [list(r) for r in zip(*cols)]


def put(tex, face, u, v, alpha=None):
    """face（行列表）写进贴图 (u,v)；alpha(r,c,p) 返回 False 的像素留空。"""
    for r, row in enumerate(face):
        for c, p in enumerate(row):
            if alpha is None or alpha(r, c, p):
                tex.putpixel((u + c, v + r), tuple(p[:3]) + (255,))


def box_uv(u, v, w, h, d):
    """实体方盒展开图上六个面的左上角：右侧、正面、左侧、背面、顶、底（和 lib/贴图方盒.tsx 一致）"""
    return {
        'right': (u, v + d), 'front': (u + d, v + d), 'left': (u + d + w, v + d), 'back': (u + d + w + d, v + d),
        'top': (u + d, v), 'bottom': (u + d + w, v),
    }


def put_box(tex, u, v, w, h, d, faces, alpha=None):
    uv = box_uv(u, v, w, h, d)
    for k, f in faces.items():
        if f is not None:
            put(tex, f, *uv[k], alpha=(lambda r, c, p, k=k: alpha(k, r, c, p)) if alpha else None)


def fill(w, h, p):
    return [[p] * w for _ in range(h)]


def rows_only(face, keep):
    return [[p if r in keep else None for p in row] for r, row in enumerate(face)]


def put_sparse(tex, face, u, v):
    for r, row in enumerate(face):
        for c, p in enumerate(row):
            if p is not None:
                tex.putpixel((u + c, v + r), tuple(p[:3]) + (255,))


def put_box_sparse(tex, u, v, w, h, d, faces):
    uv = box_uv(u, v, w, h, d)
    for k, f in faces.items():
        if f is not None:
            put_sparse(tex, f, *uv[k])


def debug_marks(img, marks, name):
    if DEBUG is None:
        return
    im = img.convert('RGB').copy()
    d = ImageDraw.Draw(im)
    for x0, y0, x1, y1, cols, rows in marks:
        for c in range(cols + 1):
            x = x0 + c * (x1 - x0) / cols
            d.line([(x, y0), (x, y1)], fill=(255, 0, 255), width=4)
        for r in range(rows + 1):
            y = y0 + r * (y1 - y0) / rows
            d.line([(x0, y), (x1, y)], fill=(255, 0, 255), width=4)
    im.thumbnail((2400, 2400))
    im.save(DEBUG / f'{name}-取样位置.png')


def save(tex, name):
    OUT.mkdir(parents=True, exist_ok=True)
    tex.save(OUT / f'{name}.png')
    if DEBUG is not None:
        bg = Image.new('RGBA', tex.size, (90, 200, 90, 255))
        bg.alpha_composite(tex)
        bg.resize((tex.width * 12, tex.height * 12), Image.NEAREST).save(DEBUG / f'{name}-放大.png')


# ---------- 黄叛 ----------
# 手工修正（用户要求把胸口 V 形纹和头盔侧面清成干净的色块和线）。
# 为什么碎：设定图是 AI 画的像素皮肤渲染图，像素格和身体轮廓没对齐、头被压扁——
#   - 身子正面：设定图上 12 行像素的真实格线和取样框对不上，每一格跨着上下两个像素，V 形纹的线条被拆成一半一半，减色后成一团团深浅青；
#   - 头盔正面在设定图上只有 6 行，侧面约 8 列 × 7.4 行，按 8×8 硬切都对不上；顶面两角取到白底和背景边上的青色，外层又只留青色，侧面、顶角就剩飘着的青点；
#   - 背面被箭袋挡了大半，取到的是箭袋的棕色和青带，左边一列是阴影的黑。
# 做法：这几面不用取样结果，按设定图的真实格线（量颜色跳变的位置）每格取中间 50% 的中位色读出图案，再照着手画（手画的规矩是皮肤像素画的规矩：
# 大色块、一个面三四种明暗、线条整格对齐、左右对称；颜色只用下面 `HP_PAL` 这几种，取自减色后的调色板，和没修的手臂、腿是同一套）。手臂、腿取样时格线是对齐的，不修。
# 字母 → 颜色；'.' = 透明（只用在外层）
HP_PAL = {
    'k': (0x0d, 0x0d, 0x0c),  # 黑：眼缝、面罩开口、皮带两侧
    'n': (0x18, 0x17, 0x14),  # 近黑
    'v': (0x1f, 0x1b, 0x16),  # 最深的褐
    'w': (0x24, 0x21, 0x1e),  # 深暖灰
    'd': (0x2b, 0x22, 0x19),  # 深褐（皮甲底色）
    'e': (0x30, 0x28, 0x24),  # 褐灰
    'b': (0x3e, 0x2f, 0x27),  # 褐（亮一档）
    'h': (0x40, 0x39, 0x33),  # 灰褐（胸甲、护颊的暗面）
    'g': (0x35, 0x31, 0x2f),  # 深灰（面甲的暗面）
    'G': (0x45, 0x49, 0x49),  # 灰（面甲、头盔箍）
    's': (0x29, 0x30, 0x32),  # 青灰
    't': (0x1f, 0x57, 0x5b),  # 暗青
    'T': (0x25, 0x73, 0x78),  # 青
    'C': (0x38, 0xa2, 0xa6),  # 亮青
}
# 里层：整面替换取样结果（F 里同名的面），之后的外层、侧面照常从这些面派生
HP_FIX = {
    # 头盔正面 8×8：设定图 6 行拉成 8 行——第 0 行眉檐（中间两格亮），第 1～2 行面罩青条（两端暗一档），第 3 行眼缝 + 中间一竖青，
    # 第 4～7 行护颊：里侧两列亮、外侧和往下逐行暗，中间两列是黑的面罩开口
    'head_front': [
        'hhhGGhhh',
        'gTCCCCTg',
        'gTCCCCTg',
        'gkkCCkkg',
        'hGGkkGGh',
        'gGGkkGGg',
        'ghhkkhhg',
        'wggkkggw',
    ],
    # 头盔右侧面（左边是后脑、右边是脸；左侧面镜像）：深褐壳，上面一小块青灰的铆片；后脑那道青箍绕到侧面以后往脸那边一级级往下斜
    # （设定图侧视：第 4 行后两格 → 第 5 行 → 第 6 行，下面一行灰），最前面两列是面甲的侧边（颜色和正面最外两列一样，转角接得上）。
    # 设定图侧视面甲上还有孤零零一格青，单独一格看着就是碎点，没画。
    # 被外层盖住的格子也画成和外层一样，斜着看露出来的缝不会是另一种颜色
    'head_side': [
        'vveeeevh',
        'vebssbeg',
        'ebbbbbeg',
        'ebbbbbeg',
        'CCbbbeGh',
        'GGCCbeGg',
        'wwGGCehg',
        'nnwwGegw',
    ],
    # 头顶（第 0 行是后脑那边）：深褐，中间两列冠脊（左亮右暗，前半段都暗一档），冠脊两边各一列亮褐
    'head_top': ['ddbCTbdd'] * 4 + ['ddhTThdd'] * 4,
    # 后脑：上半深褐、中间一道暗槽（设定图背视的那块暗色），第 4 行一圈青箍、第 5 行灰边，往下是深灰的护颈
    'head_back': [
        'vveeeevv',
        'vebbbbev',
        'ebbwwbbe',
        'eebbbbee',
        'CCCCCCCC',
        'GGGGGGGG',
        'wggggggw',
        'nwwwwwwn',
    ],
    # 身子正面 8×12（设定图真实格线读出来的图案）：上面一个 V 从两肩（第 0 行第 1、6 列）斜到胸口中间（第 2 行亮青）、往下一竖；
    # 下面一个暗一档的 V 从两侧（第 3 行最外列）斜到第 5 行、尖儿不合拢；腰下第 8～10 行是皮带：两侧一竖黑带、中间灰框青扣；
    # 最下一行两个暗青点接腿上的纹
    'body_front': [
        'vTvvvvTv',
        'veTeeTev',
        'eehCChee',
        'tehTThet',
        'vtehhetv',
        'vvtvvtvv',
        'dbbhhbbd',
        'ndbbbbdn',
        'dnddddnd',
        'bnGCCGnb',
        'bngTTgnb',
        'vtvvvvtv',
    ],
    # 身子背面：设定图背面只露出左半（右半被箭袋挡着），是从左肩斜到中间的一道青，照它左右对称画成一个 V；
    # 第 9～10 行一圈褐色腰带（设定图背面那道凸出来的褐带），最下一行两个暗青点
    'body_back': [
        'vTvvvvTv',
        'vTeeeeTv',
        'eeTeeTee',
        'eeeTTeee',
        'ddettedd',
        'dddddddd',
        'dddddddd',
        'nddddddn',
        'dddddddd',
        'bbbbbbbb',
        'bbbbbbbb',
        'vvtvvtvv',
    ],
    # 身子右侧面（左边接背面、右边接正面；左侧面镜像）：被手臂挡着，设定图上看不到，画成素的深褐，腰带接一圈
    'body_side': [
        'vvvv',
        'dddd',
        'dddd',
        'dddd',
        'dddd',
        'dddd',
        'dddd',
        'nddn',
        'dddd',
        'bbbb',
        'bbbb',
        'vvvv',
    ],
}
# 外层（凸出 0.5 / 0.25 像素）里按派生规则做不对的面，整面照画
HP_FIX_OUTER = {
    # 帽子层右侧面：青箍 + 灰边两行宽的一道，从后脑接过来一级级往下斜；最前面是面甲的侧边（和正面外层最外两列同色）
    'hat_side': [
        '........',
        '.......g',
        '.......g',
        '.......g',
        'CC....Gh',
        'GGCC..Gg',
        '..GGC.hg',
        '....G.gw',
    ],
    # 帽子层背面：青箍和下面的灰边一起凸出来（设定图背视，这两行比头宽）
    'hat_back': ['........'] * 4 + ['CCCCCCCC', 'GGGGGGGG'] + ['........'] * 2,
}


def hp_face(rows):
    return [[None if ch == '.' else HP_PAL[ch] for ch in r] for r in rows]


def huangpan():
    global ACCENT
    ACCENT = lambda p: p[2] > p[0] + 40 and p[1] > p[0] + 30  # 青色
    img = Image.open(HP_SHEET).convert('RGB')
    m = []
    # 设定图上的矩形（原图像素）。中间是正面、右边是背面、左边是右侧面（脸朝画面右边）
    F = {
        'head_front': sample(img, (2470, 460, 3085, 947), 8, 8, m),
        'head_top': sample(img, (2470, 290, 3085, 460), 8, 8, m),
        'body_front': sample(img, (2470, 947, 3085, 1900), 8, 12, m),
        'arm_front': sample(img, (2125, 915, 2465, 1900), 4, 12, m),
        'legR_front': sample(img, (2470, 1900, 2777, 2783), 4, 12, m),
        'legL_front': sample(img, (2777, 1900, 3085, 2783), 4, 12, m),
        'head_back': sample(img, (4262, 315, 4952, 910), 8, 8, m),
        'body_back': sample(img, (4262, 910, 4915, 1900), 8, 12, m),
        'arm_back': sample(img, (4915, 917, 5250, 1892), 4, 12, m),
        'legL_back': sample(img, (4262, 1900, 4585, 2772), 4, 12, m),
        'legR_back': sample(img, (4585, 1900, 4915, 2772), 4, 12, m),
        'head_side': sample(img, (697, 312, 1357, 910), 8, 8, m),
        'arm_side': sample(img, (812, 897, 1185, 1900), 4, 12, m),
        'leg_side': sample(img, (870, 1990, 1258, 2780), 4, 12, m),
    }
    debug_marks(img, m, '黄叛')
    F, pal = quantize(F, 14)
    # 手工修正：胸口、背、头盔四面换成 HP_FIX 里照设定图画的像素（多出来的 body_side 是身子侧面）
    F.update({k: hp_face(v) for k, v in HP_FIX.items()})
    tex = Image.new('RGBA', (64, 64), T)
    dark = min(pal, key=sum)

    # 头 8×8×8：右侧面直接取（左边是后脑、右边是脸），左侧面镜像
    head = {
        'front': F['head_front'], 'back': F['head_back'], 'right': F['head_side'], 'left': flip(F['head_side']),
        'top': F['head_top'], 'bottom': fill(8, 8, dark),
    }
    put_box(tex, 0, 0, 8, 8, 8, head)
    # 身子 8×12×4：侧面被手臂挡着、设定图上看不到，用手画的素面（HP_FIX 的 body_side；拼正面、背面边缘两列会把 V 形纹的线头和背面阴影黑带到侧面上）
    bf, bb = F['body_front'], F['body_back']
    body = {
        'front': bf, 'back': bb,
        'right': F['body_side'],
        'left': flip(F['body_side']),
        'top': [bb[0][::-1] for _ in range(2)] + [bf[0] for _ in range(2)], 'bottom': fill(8, 4, dark),
    }
    put_box(tex, 16, 16, 8, 12, 4, body)
    # 手臂 4×12×4：右臂外侧（右侧面）取侧视图，内侧用外侧镜像；左臂整体镜像
    af, ab, aside = F['arm_front'], F['arm_back'], F['arm_side']
    armR = {
        'front': af, 'back': ab, 'right': aside, 'left': flip(aside),
        'top': [ab[0][::-1], ab[0][::-1], af[0], af[0]], 'bottom': fill(4, 4, F['arm_front'][11][1]),
    }
    armL = {
        'front': flip(af), 'back': flip(ab), 'right': flip(aside), 'left': aside,
        'top': [r[::-1] for r in armR['top']], 'bottom': armR['bottom'],
    }
    put_box(tex, 40, 16, 4, 12, 4, armR)
    put_box(tex, 32, 48, 4, 12, 4, armL)
    # 腿 4×12×4
    ls = F['leg_side']
    legR = {'front': F['legR_front'], 'back': F['legR_back'], 'right': ls, 'left': flip(ls),
            'top': fill(4, 4, F['legR_front'][0][1]), 'bottom': fill(4, 4, dark)}
    legL = {'front': F['legL_front'], 'back': F['legL_back'], 'right': flip(ls), 'left': ls,
            'top': fill(4, 4, F['legL_front'][0][1]), 'bottom': fill(4, 4, dark)}
    put_box(tex, 0, 16, 4, 12, 4, legR)
    put_box(tex, 16, 48, 4, 12, 4, legL)

    # ---- 外层 ----
    lum = lambda p: 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]
    cyan = lambda p: p[2] > p[0] + 40 and p[1] > p[0] + 30
    # 帽子层：面甲（正面第 1～7 行，眼缝和面罩开口这些最黑的像素留空）、冠脊（顶面中间两列青色）；
    # 后脑和两侧的青箍连同下面的灰边、面甲侧边照 HP_FIX_OUTER 画（按「只留青色」派生会剩下一个个飘着的青点）
    hf = F['head_front']
    hat_front = [[p if (1 <= r <= 7 and lum(p) > 28) or (r == 0 and cyan(p)) else None for p in row] for r, row in enumerate(hf)]
    hat_top = [[p if cyan(p) else None for p in row] for row in F['head_top']]
    hat_back = hp_face(HP_FIX_OUTER['hat_back'])
    hat_side = hp_face(HP_FIX_OUTER['hat_side'])
    put_box_sparse(tex, 32, 0, 8, 8, 8, {'front': hat_front, 'top': hat_top, 'back': hat_back, 'right': hat_side, 'left': flip(hat_side)})
    # 外套层：腰上一圈（第 9～10 行）：正面是灰框青扣，背面、侧面是褐色腰带
    put_box_sparse(tex, 16, 32, 8, 12, 4, {k: rows_only(body[k], {9, 10}) for k in ('front', 'back', 'right', 'left')})
    # 袖子：肩下灰带（第 3 行）和护腕（第 7～11 行）
    keep = {3, 7, 8, 9, 10, 11}
    put_box_sparse(tex, 40, 32, 4, 12, 4, {k: rows_only(armR[k], keep) for k in ('front', 'back', 'right', 'left')})
    put_box_sparse(tex, 48, 48, 4, 12, 4, {k: rows_only(armL[k], keep) for k in ('front', 'back', 'right', 'left')})
    # 裤子层：膝下皮护腿箍（第 7～8 行）
    put_box_sparse(tex, 0, 32, 4, 12, 4, {k: rows_only(legR[k], {7, 8}) for k in ('front', 'back', 'right', 'left')})
    put_box_sparse(tex, 0, 48, 4, 12, 4, {k: rows_only(legL[k], {7, 8}) for k in ('front', 'back', 'right', 'left')})
    save(tex, '黄叛')

    # ---- 箭袋（3×12×2，设定图背面：棕色皮面、紫灰包边、中段青色一道）----
    q = Image.new('RGBA', (16, 16), T)
    leather = [(0x6b, 0x4a, 0x2a), (0x5c, 0x3e, 0x22), (0x7a, 0x56, 0x30)]
    rim, rim2 = (0x4a, 0x3f, 0x52), (0x3a, 0x31, 0x40)
    cy, cy2 = (0x2f, 0xb7, 0xc4), (0x23, 0x8a, 0x96)

    def qface(w):
        out = []
        for r in range(12):
            row = []
            for c in range(w):
                if r == 0 or r == 11:
                    row.append(rim2)
                elif c == 0 or c == w - 1:
                    row.append(rim)
                elif r in (5, 6):
                    row.append(cy if (r + c) % 2 else cy2)
                else:
                    row.append(leather[(r * 7 + c * 3) % 3])
            out.append(row)
        return out

    put_box(q, 0, 0, 3, 12, 2, {'front': qface(3), 'back': qface(3), 'right': qface(2), 'left': qface(2),
                                 'top': fill(3, 2, (0x1e, 0x16, 0x12)), 'bottom': fill(3, 2, rim2)})
    save(q, '黄叛箭袋')


# ---------- 刘心忠 ----------
# 贴图布局（128×64），和 追兵.tsx 的 LX_UV 一致
LX_UV = {
    'head': (0, 0), 'hood': (32, 0), 'body': (64, 0), 'skirt': (92, 0), 'staff': (124, 0),
    'armR': (0, 20), 'armL': (16, 20), 'legR': (32, 20), 'legL': (48, 20), 'sleeveR': (64, 20), 'sleeveL': (80, 20), 'belt': (96, 20),
    'gem': (0, 40), 'collar': (8, 40), 'prong': (24, 40),
}


def liuxinzhong():
    global ACCENT
    ACCENT = lambda p: p[0] - p[2] > 110 and p[1] > 130  # 金色
    img = Image.open(LX_SHEET).convert('RGB')
    m = []
    F = {
        'hood_front': sample(img, (604, 174, 1388, 1022), 8, 10, m),
        'hood_back': sample(img, (4224, 174, 4992, 1022), 8, 10, m),
        'hood_side': sample(img, (2379, 179, 3066, 1059), 8, 10, m),
        'body_front': sample(img, (668, 1022, 1340, 1918), 8, 12, m),
        'body_back': sample(img, (4272, 1022, 4944, 1926), 8, 12, m),
        'skirt_front': sample(img, (668, 1918, 1340, 2606), 8, 8, m),
        'skirt_back': sample(img, (4272, 1926, 4944, 2630), 8, 8, m),
        'arm_front': sample(img, (1395, 982, 1690, 1982), 4, 12, m),  # 左边 1340～1390 被兜帽挡着，从 1395 起
        'arm_back': sample(img, (3905, 982, 4245, 1998), 4, 12, m),
        'legs_front': sample(img, (668, 2606, 1340, 2942), 8, 4, m),
        'legs_back': sample(img, (4272, 2630, 4944, 2942), 8, 4, m),
    }
    # 杖身是斜的：沿设定图正面那根杖（手下面那一截，x = 380 + (y − 1800) × 0.0514）取 30 格
    F['staff'] = []
    for r in range(30):
        y = 1700 + (r + 0.5) * (2915 - 1700) / 30
        x = 380 + (y - 1800) * 0.0514
        box = img.crop((int(x - 20), int(y - 12), int(x + 20), int(y + 12)))
        F['staff'].append([median(list(zip(*[iter(box.tobytes())] * 3)))])
    debug_marks(img, m, '刘心忠')
    F, pal = quantize(F, 16)
    tex = Image.new('RGBA', (128, 64), T)

    # 头、鼻子：照抄原版村民贴图（头 8×10×8 在 0,0，鼻子 2×4×2 在 24,0，都在 32×18 的范围里）
    with zipfile.ZipFile(CLIENT_JAR) as z:
        vil = Image.open(io.BytesIO(z.read('assets/minecraft/textures/entity/villager/villager.png'))).convert('RGBA')
    tex.paste(vil.crop((0, 0, 32, 18)), (0, 0))

    lum = lambda p: 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]
    gold = lambda p: p[0] - p[2] > 110 and p[1] > 130  # 金色：饱和的黄；村民肤色（约 200,150,110）不算
    purple = lambda p: p[2] > p[1] + 25 and p[0] > p[1] + 15
    P = max((p for p in pal if purple(p)), key=lambda p: [row for f in F.values() for row in f for q in row if q == p].__len__())
    G = max((p for p in pal if gold(p)), key=lum, default=(0xd8, 0xb4, 0x3e))

    # 兜帽 8×10×8（比头大一圈）：正面按设定图画金边开口——第 0 行紫、第 1 行金边横过去、第 2 行起两边各一列金边，中间透明露出村民的脸
    hood_front = []
    for r in range(10):
        row = []
        for c in range(8):
            if r == 0:
                row.append(F['hood_front'][0][c])
            elif r == 1:
                row.append(G if 1 <= c <= 6 else F['hood_front'][1][c])
            elif r == 2:
                row.append(G if c in (0, 1, 6, 7) else None)
            else:
                row.append(G if c in (0, 7) else None)
        hood_front.append(row)
    hs = F['hood_side']
    hood_side = [[G if c == 7 and r >= 2 else (purple(p) and p or P) for c, p in enumerate(row)] for r, row in enumerate(hs)]
    hood = {'front': hood_front, 'back': F['hood_back'], 'right': hood_side, 'left': flip(hood_side),
            'top': [F['hood_back'][0][::-1]] * 4 + [F['hood_front'][0]] * 4}
    put_box_sparse(tex, *LX_UV['hood'], 8, 10, 8, hood)

    # 身子 8×12×6：正面、背面取样；侧面紫袍（取背面边缘两列再接正面边缘）
    bf, bb = F['body_front'], F['body_back']
    side6 = lambda a, b: from_cols([col(a, 0), col(a, 1), col(a, 1), col(b, 1), col(b, 1), col(b, 0)])
    put_box(tex, *LX_UV['body'], 8, 12, 6, {
        'front': bf, 'back': bb, 'right': side6(flip(bb), bf), 'left': side6(flip(bf), bb),
        'top': fill(8, 6, P), 'bottom': fill(8, 6, P)})
    # 下摆 8×8×6（罩住大腿，底边一道金边）
    sf, sb = F['skirt_front'], F['skirt_back']
    put_box(tex, *LX_UV['skirt'], 8, 8, 6, {
        'front': sf, 'back': sb, 'right': side6(flip(sb), sf), 'left': side6(flip(sf), sb),
        'top': fill(8, 6, P), 'bottom': fill(8, 6, (0x2a, 0x1c, 0x16))})
    # 手臂 4×12×4：袖子（紫）、金袖口、手（村民肤色）。设定图拿杖的右臂弯着看不全，两臂都用左臂（右边镜像）
    af, ab = F['arm_front'], F['arm_back']
    aside = from_cols([col(ab, 0), col(af, 0), col(af, 0), col(af, 1)])
    armR = {'front': flip(af), 'back': flip(ab), 'right': aside, 'left': flip(aside),
            'top': fill(4, 4, P), 'bottom': fill(4, 4, af[11][1])}
    armL = {'front': af, 'back': ab, 'right': flip(aside), 'left': aside, 'top': fill(4, 4, P), 'bottom': armR['bottom']}
    # 手（袖口下面两行和底面）：照抄原版村民手臂（VillagerModel 的 arms 方盒 4×8×4，贴图 44,22）最下面两行和底面，
    # 设定图上的手就是村民的肤色；取样再减色会被并进金色
    vu = box_uv(44, 22, 4, 8, 4)
    vrow = (lambda k, r: [vil.getpixel((vu[k][0] + c, vu[k][1] + r))[:3] for c in range(4)])
    vbottom = [[vil.getpixel((vu['bottom'][0] + c, vu['bottom'][1] + r))[:3] for c in range(4)] for r in range(4)]
    for arm in (armR, armL):
        for k in ('front', 'back', 'right', 'left'):
            arm[k] = [list(row) for row in arm[k][:10]] + [vrow(k, 6), vrow(k, 7)]
        arm['bottom'] = vbottom
    put_box(tex, *LX_UV['armR'], 4, 12, 4, armR)
    put_box(tex, *LX_UV['armL'], 4, 12, 4, armL)
    # 袖口外层：金色那一行凸出来
    cuff = lambda f: [[p if gold(p) else None for p in row] for row in f]
    put_box_sparse(tex, *LX_UV['sleeveR'], 4, 12, 4, {k: cuff(armR[k]) for k in ('front', 'back', 'right', 'left')})
    put_box_sparse(tex, *LX_UV['sleeveL'], 4, 12, 4, {k: cuff(armL[k]) for k in ('front', 'back', 'right', 'left')})
    # 腿 4×12×4：只有下摆以下的 4 行露在外面（设定图：深棕裤腿 + 灰靴底），上面 8 行罩在袍子里，用同色补
    lf, lb = F['legs_front'], F['legs_back']
    for name, cs in (('legR', (0, 4)), ('legL', (4, 8))):
        front = [row[cs[0]:cs[1]] for row in lf]
        back = [row[8 - cs[1]:8 - cs[0]] for row in lb]
        front = [front[0]] * 8 + front
        back = [back[0]] * 8 + back
        side = from_cols([col(back, 0), col(front, 1), col(front, 2), col(front, 3)])
        put_box(tex, *LX_UV[name], 4, 12, 4, {'front': front, 'back': back, 'right': side, 'left': flip(side),
                                               'top': fill(4, 4, front[0][0]), 'bottom': fill(4, 4, front[11][1])})
    # 腰带 8×1×6：背面设定图上那条棕色带子
    belt = [bb[11]]
    put_box(tex, *LX_UV['belt'], 8, 1, 6, {'front': belt, 'back': belt, 'right': [belt[0][:6]], 'left': [belt[0][:6]],
                                           'top': fill(8, 6, belt[0][0]), 'bottom': fill(8, 6, belt[0][0])})
    # 法杖：杖身 1×30×1 取设定图正面那根（木纹 + 杖尾一截深紫），顶上粉色晶石 + 金托 + 四个金爪（设定图：粉白晶石、金色十字托）
    s = F['staff']
    put_box(tex, *LX_UV['staff'], 1, 30, 1, {'front': s, 'back': s, 'right': s, 'left': s, 'top': [s[0]], 'bottom': [s[-1]]})
    pink = [(0xf0, 0xb6, 0xe8), (0xe0, 0x9a, 0xd8), (0xfb, 0xe2, 0xf6), (0xd2, 0x86, 0xc8)]
    gem = lambda w, h: [[pink[(r * 2 + c + (r > h // 2)) % 4] if not (r == 0 and c == 0) else pink[2] for c in range(w)] for r in range(h)]
    # 晶石 2×3×2：四个侧面 2×3、顶底 2×2，左上角一个最亮的高光像素
    put_box(tex, *LX_UV['gem'], 2, 3, 2, {k: gem(2, 2 if k in ('top', 'bottom') else 3) for k in ('front', 'back', 'right', 'left', 'top', 'bottom')})
    g1, g2 = G, (0xb0, 0x8a, 0x2c)
    goldf = lambda w, h: [[g1 if (r + c) % 3 else g2 for c in range(w)] for r in range(h)]
    put_box(tex, *LX_UV['collar'], 3, 1, 3, {k: goldf(3, 1 if k not in ('top', 'bottom') else 3) for k in ('front', 'back', 'right', 'left', 'top', 'bottom')})
    put_box(tex, *LX_UV['prong'], 1, 2, 1, {k: goldf(1, 2 if k not in ('top', 'bottom') else 1) for k in ('front', 'back', 'right', 'left', 'top', 'bottom')})
    save(tex, '刘心忠')


if __name__ == '__main__':
    if DEBUG is not None:
        DEBUG.mkdir(parents=True, exist_ok=True)
    huangpan()
    liuxinzhong()
    print('写好了：', *sorted(p.name for p in OUT.glob('*.png')))
