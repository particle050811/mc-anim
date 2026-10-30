"""台词口型：一句配音按字的起止（对齐结果或手修）算 Rhubarb 嘴型时间线 [[秒, 嘴型]]，运行时由 库/角色/口型.ts 在嘴型之间连续过渡。

照 Rhubarb Lip Sync（github.com/DanielSWolf/rhubarb-lip-sync，rhubarb/src/animation/）的做法：音素 → 可选嘴型 → 就近选形 + 元音提前 → 防闪 → 停顿 → 补过渡形。
Rhubarb 自带的识别只认英文，这里拿字的起止（汉字一个字一个单位，日语、英文一个词一个单位），拼音拆成声母、介音、韵腹、韵尾当音素；日语按假名、英文按字母拆。
嘴型用 Rhubarb 的 A～F + X（G 上齿咬唇、H 舌头方块脸画不出来，按 Rhubarb 换成基本形 A、C）。用户 10-15 看过只按音量开合的三档，嫌几张图切来切去，换成这个。

出处：旧项目 7d077904 参考模型库/工具/配音/口型.py 的规则部分，逐行照搬（含 Python round 的银行家舍入），只拆成纯函数。
确定性：同样的 念、时长、字 → 同样的嘴；拼音取自 pypinyin，版本钉在 pipeline/配音/python.ts（换版本可能改拼音，要重跑 anim voice check）。
"""
from __future__ import annotations

import re

# ---------- 嘴型规则（照 Rhubarb animationRules.cpp，去掉 G、H） ----------
SHAPES = 'ABCDEFX'
ANY = SHAPES
ANY_OPEN = 'BCDEF'
BASIC = dict(A='A', B='B', C='C', D='D', E='E', F='F', X='A')
RELAX = dict(A='A', B='B', C='B', D='C', E='C', F='B', X='X')
# 从某形出发，按改动由小到大排的各形（Rhubarb 的 effortMatrix）
EFFORT = dict(A='AXBCEDF', B='BAXCEDF', C='CBDAXEF', D='DCBAXEF', E='ECBAXDF', F='FBAXCED', X='XABCEDF')
# 两形之间补的过渡形和放的位置（只有这几对：嘴一般「啪」地张开、慢慢合上）
TWEENS = {
    ('D', 'A'): ('C', 'early'), ('D', 'B'): ('C', 'centered'), ('D', 'X'): ('C', 'late'),
    ('C', 'F'): ('E', 'centered'), ('F', 'C'): ('E', 'centered'), ('D', 'F'): ('E', 'centered'),
}
MIN_SHAPE_CS = 7  # Rhubarb：短于 5～7 厘秒会闪，7 略好
MAX_ANTICIPATION_CS = 20  # 元音的嘴型最多提前这么久摆好
TAIL_SILENCE_CS = 30  # 句尾补一段静音：说到文件末尾的句子也要有收嘴的 X


def closest(ref, shapes):
    return next(s for s in EFFORT[ref] if s in shapes)


class Phone:
    """一个音素在时间轴上占的一段（厘秒）：shapes 是可选的嘴型；vowel：元音（只有一个可选形时会提前摆好）。"""

    def __init__(self, start, end, shapes, vowel=False):
        self.start, self.end, self.shapes, self.vowel = start, end, frozenset(shapes), vowel


# ---------- 普通话：声母、韵母 → 音素 ----------
STOPS = {'b': 'A', 'p': 'A', 'd': 'BF', 't': 'BF', 'g': 'BCEF', 'k': 'BCEF'}  # 塞音：先闭合（成阻）再放开
CONSONANTS = {  # 其余声母（括号里是 Rhubarb 对应的英文音素）
    'm': 'A', 'f': 'A',  # M；F（G 换成基本形 A）
    'n': 'BCF', 'l': 'BEF', 'r': 'BEF',  # N；L（短）；R
    'h': ANY,  # HH
    'j': 'BF', 'q': 'BF', 'x': 'BF', 'zh': 'BF', 'ch': 'BF', 'sh': 'BF', 'z': 'BF', 'c': 'BF', 's': 'BF',  # JH、CH、S、SH
    'y': 'BCF', 'w': 'F',  # Y、W
}
VOWELS = {'a': 'D', 'o': 'E', 'e': 'C', 'ê': 'C', 'i': 'B', 'u': 'F', 'v': 'F', 'er': 'E'}  # AA；AO；EH；IY；UW；ER
# 韵母 = 介音 + 韵腹 + 韵尾（strict 拼音，ü 写 v）
FINALS = {
    'a': ('', 'a', ''), 'o': ('', 'o', ''), 'e': ('', 'e', ''), 'i': ('', 'i', ''), 'u': ('', 'u', ''), 'v': ('', 'v', ''), 'er': ('', 'er', ''),
    'ai': ('', 'ai', ''), 'ei': ('', 'ei', ''), 'ao': ('', 'ao', ''), 'ou': ('', 'ou', ''),
    'an': ('', 'a', 'n'), 'en': ('', 'e', 'n'), 'ang': ('', 'a', 'ng'), 'eng': ('', 'e', 'ng'), 'ong': ('', 'u', 'ng'),
    'ia': ('i', 'a', ''), 'ie': ('i', 'ê', ''), 'iao': ('i', 'ao', ''), 'iou': ('i', 'ou', ''), 'iu': ('i', 'ou', ''),
    'ian': ('i', 'ê', 'n'), 'in': ('', 'i', 'n'), 'iang': ('i', 'a', 'ng'), 'ing': ('', 'i', 'ng'), 'iong': ('i', 'u', 'ng'),
    'ua': ('u', 'a', ''), 'uo': ('u', 'o', ''), 'uai': ('u', 'ai', ''), 'uei': ('u', 'ei', ''), 'ui': ('u', 'ei', ''),
    'uan': ('u', 'a', 'n'), 'uen': ('u', 'e', 'n'), 'un': ('u', 'e', 'n'), 'uang': ('u', 'a', 'ng'), 'ueng': ('u', 'e', 'ng'),
    've': ('v', 'ê', ''), 'van': ('v', 'ê', 'n'), 'vn': ('', 'v', 'n'),
}
DIPHTHONGS = {'ai': ('a', 'B'), 'ei': ('e', 'B'), 'ao': ('a', 'E'), 'ou': ('o', 'F')}  # Rhubarb 的 AY、EY、AW、OW：前 60% / 后 40%
CODAS = {'n': 'BCF', 'ng': 'BCEF'}


def vowel_shapes(v, dur):
    if v == 'a':  # Rhubarb 的 AH：短的只张到 C
        return 'C' if dur < 20 else 'D'
    return VOWELS[v]


def consonant_len(initial, dur):
    if initial in STOPS:
        return max(2, min(6, round(dur * 0.2)))
    if initial in ('m', 'n', 'l', 'r', 'y', 'w'):
        return max(3, min(8, round(dur * 0.25)))
    return max(3, min(10, round(dur * 0.3)))


def stop(phones, initial, start, end):
    """塞音照 Rhubarb 的 plosive：成阻段放在除阻之前，长度取前一个音素的一半、夹在 4～12 厘秒。"""
    prev = phones[-1].end - phones[-1].start if phones else 0
    occlusion = max(4, min(12, prev // 2))
    phones.append(Phone(max(0, start - occlusion), start, STOPS[initial]))
    phones.append(Phone(start, end, ANY if initial in 'bp' else ANY_OPEN))


def syllable(phones, initial, final, start, end):
    """一个音节铺到 [start, end)（厘秒）：声母、介音、韵腹（二合元音拆两段）、韵尾。"""
    dur = end - start
    if initial:
        n = consonant_len(initial, dur)
        if initial in STOPS:
            stop(phones, initial, start, start + n)
        else:
            phones.append(Phone(start, start + n, CONSONANTS[initial]))
        start += n
    medial, nucleus, coda = FINALS.get(final, ('', final[:1] if final[:1] in VOWELS else 'e', ''))
    if medial:
        n = max(3, round((end - start) * 0.2))
        phones.append(Phone(start, start + n, {'i': 'BCF', 'u': 'F', 'v': 'F'}[medial]))
        start += n
    coda_start = end - (max(3, round((end - start) * 0.3)) if coda else 0)
    span = coda_start - start
    if nucleus in DIPHTHONGS:
        first, second = DIPHTHONGS[nucleus]
        mid = start + round(span * 0.6)
        phones.append(Phone(start, mid, vowel_shapes(first, span), vowel=True))
        phones.append(Phone(mid, coda_start, second, vowel=True))
    else:
        phones.append(Phone(start, coda_start, vowel_shapes(nucleus, span), vowel=True))
    if coda:
        phones.append(Phone(coda_start, end, CODAS[coda]))


# ---------- 日语假名、英文字母 → 音节（声母、韵母套普通话的规则） ----------
KANA_ROWS = {
    'カキクケコ': 'k', 'ガギグゲゴ': 'g', 'サシスセソ': 's', 'ザジズゼゾ': 'z', 'タチツテト': 't', 'ダヂヅデド': 'd', 'ナニヌネノ': 'n',
    'ハヒフヘホ': 'h', 'バビブベボ': 'b', 'パピプペポ': 'p', 'マミムメモ': 'm', 'ヤユヨ': 'y', 'ラリルレロ': 'l', 'ワヲ': 'w',
}
KANA_VOWEL = {'アカガサザタダナハバパマヤラワァ': 'a', 'イキギシジチヂニヒビピミリィ': 'i', 'ウクグスズツヅヌフブプムユルゥ': 'u',
              'エケゲセゼテデネヘベペメレェ': 'ê', 'オコゴソゾトドノホボポモヨロヲォ': 'o'}


def kana_syllables(word):
    """假名 → [[声母, 韵母, 份数]]：长音ー拉长前一拍，促音ッ是一拍闭合，ン是鼻音，小ャュョ并进前一拍。"""
    word = ''.join(chr(ord(ch) + 0x60) if 'ぁ' <= ch <= 'ゖ' else ch for ch in word)  # 平假名转片假名
    out = []
    for ch in word:
        if ch == 'ー' and out:
            out[-1][2] += 1
        elif ch in 'ャュョ' and out:
            out[-1][1] = {'ャ': 'ia', 'ュ': 'iou', 'ョ': 'iao'}[ch]
        elif ch == 'ッ':
            out.append(['', '', 1])
        elif ch == 'ン':
            out.append(['', 'en', 1])
        else:
            vowel = next((v for row, v in KANA_VOWEL.items() if ch in row), None)
            if vowel:
                out.append([next((c for row, c in KANA_ROWS.items() if ch in row), ''), vowel, 1])
    return out


LATIN_INITIAL = {'b': 'b', 'p': 'p', 'm': 'm', 'f': 'f', 'v': 'f', 'w': 'w', 'd': 'd', 't': 't', 'n': 'n', 'l': 'l', 'r': 'r', 'g': 'g', 'k': 'k',
                 'c': 'k', 'q': 'k', 'h': 'h', 'j': 'j', 's': 's', 'z': 'z', 'x': 's', 'y': 'y'}


def latin_syllables(word):
    """英文单词粗拆：每组元音字母一个音节，前面的辅音取第一个当声母，词尾的辅音单独一小拍（boss → b+o, ss）。"""
    out = []
    for cons, vowels, tail in re.findall(r'([^aeiouy]*)([aeiouy]+)([^aeiouy]*$)?', word.lower()):
        out.append([LATIN_INITIAL.get(cons[:1], ''), {'a': 'a', 'e': 'ê', 'i': 'i', 'o': 'o', 'u': 'u', 'y': 'i'}[vowels[0]], 1])
        if tail:
            out.append([LATIN_INITIAL.get(tail[:1], 's'), '', 0.6])
    return out or [['', 'e', 1]]


def unit_phones(phones, unit, pys, start, end):
    """对齐出来的一个单位（汉字一个字，日语、英文一个词）铺成音素。pys：这句汉字的拼音队列（[声母, 韵母]），按顺序取。"""
    hanzi = re.findall(r'[一-鿿]', unit)
    if hanzi:
        syls = [[*pys.pop(0), 1] for _ in hanzi]
    elif re.search(r'[぀-ヿ]', unit):
        syls = kana_syllables(unit)
    else:
        syls = latin_syllables(unit)
    total = sum(s[2] for s in syls)
    t = start
    for i, (initial, final, weight) in enumerate(syls):
        t1 = end if i == len(syls) - 1 else t + round((end - start) * weight / total)
        if not final:  # 促音、词尾辅音：只有辅音
            phones.append(Phone(t, t1, 'A' if initial in ('', 'b', 'p', 'm') else CONSONANTS.get(initial, 'BF')))
        else:
            syllable(phones, initial, final, t, t1)
        t = t1


# ---------- 动画（照 Rhubarb 的 roughAnimation、timingOptimization、pauseAnimation、tweening） ----------
def runs(cells):
    """逐厘秒的数组 → [[起, 止, 值]] 连续段（Phone 没定义 ==，按是不是同一个对象分段）。"""
    out, i = [], 0
    while i < len(cells):
        j = i
        while j < len(cells) and cells[j] == cells[i]:
            j += 1
        out.append([i, j, cells[i]])
        i = j
    return out


def animate(phones, total_cs):
    silence = Phone(0, 0, 'X')
    rules = [silence] * total_cs
    for p in phones:
        for t in range(max(0, p.start), min(total_cs, p.end)):
            rules[t] = p
    segs = runs(rules)
    anim = ['X'] * total_cs

    def fill(seg, shape):
        anim[seg[0]:seg[1]] = [shape] * (seg[1] - seg[0])

    # 粗动画：从前往后就近选形；碰到只有一个可选形的元音，往回最多 20 厘秒提前摆好它
    ref, last_anticipated = 'X', -1
    for k, seg in enumerate(segs):
        rule = seg[2]
        shape = closest(ref, rule.shapes)
        fill(seg, shape)
        anticipate = rule.vowel and len(rule.shapes) == 1
        if anticipate:
            ref = shape
            for back in reversed(segs[:k]):
                if back[0] == last_anticipated or seg[0] - back[0] > MAX_ANTICIPATION_CS:
                    break
                back_shape = closest(ref, back[2].shapes)
                fill(back, back_shape)
                if BASIC[back_shape] != BASIC[shape]:
                    break
                ref = back_shape
            last_anticipated = seg[0]
        ref = shape if anticipate else RELAX[shape]

    # 防闪（timingOptimization 的简化）：短于 7 厘秒的形先从够长的邻居借时间，借不到就并进改动小的那个邻居
    while True:
        rs = runs(anim)
        short = [k for k, r in enumerate(rs) if r[1] - r[0] < MIN_SHAPE_CS and len(rs) > 1]
        if not short:
            break
        k = min(short, key=lambda k: rs[k][1] - rs[k][0])
        s, e, shape = rs[k]
        need = MIN_SHAPE_CS - (e - s)
        prev, nxt = (rs[k - 1] if k > 0 else None), (rs[k + 1] if k + 1 < len(rs) else None)
        if prev and prev[1] - prev[0] - need >= MIN_SHAPE_CS:
            anim[s - need:s] = [shape] * need
        elif nxt and nxt[1] - nxt[0] - need >= MIN_SHAPE_CS:
            anim[e:e + need] = [shape] * need
        else:
            target = min((r for r in (prev, nxt) if r), key=lambda r: EFFORT[shape].index(r[2]))
            anim[s:e] = [target[2]] * (e - s)

    # 停顿：句中的 X 段，短于 12 厘秒保持上一个形，35 厘秒以内放松一档（不和下一个形相同），再长才闭嘴
    rs = runs(anim)
    for k in range(1, len(rs) - 1):
        s, e, shape = rs[k]
        if shape != 'X':
            continue
        prev, nxt = rs[k - 1][2], rs[k + 1][2]
        pause = 'X'
        if e - s < 12:
            pause = prev
        elif e - s <= 35:  # 放松后的形别和下一个形相同，看着像没停
            cur = prev
            while True:
                relaxed = RELAX[cur]
                if relaxed != nxt:
                    pause = relaxed
                    break
                if relaxed == cur:
                    break
                cur = relaxed
        anim[s:e] = [pause] * (e - s)

    # 过渡形：4～8 厘秒
    rs = runs(anim)
    out = list(anim)
    for a, b in zip(rs, rs[1:]):
        tween = TWEENS.get((a[2], b[2]))
        if not tween:
            continue
        shape, timing = tween
        if timing == 'early':
            n = min((a[1] - a[0]) // 3, 8)
            s = a[1] - n
        elif timing == 'centered':
            n = min((a[1] - a[0]) // 4, (b[1] - b[0]) // 4, 8)
            s = a[1] - n // 2
        else:
            n = min((b[1] - b[0]) // 3, 8)
            s = b[0]
        if n >= 4:
            out[s:s + n] = [shape] * n
    return [[round(r[0] / 100, 2), r[2]] for r in runs(out)]


# ---------- 入口 ----------
def 拼音(hanzi: str) -> list[list[str]]:
    """一串汉字 → [[声母, 韵母]]（strict 拼音，ü 写 v）"""
    from pypinyin import Style, pinyin  # pyright: ignore[reportMissingImports]

    return [[i[0], f[0]] for i, f in zip(pinyin(hanzi, style=Style.INITIALS, strict=True), pinyin(hanzi, style=Style.FINALS, strict=True))]


def 是日语(念: str) -> bool:
    return bool(re.search(r'[぀-ヿ]', 念))


def 算嘴(念: str, 时长: float, 字: list) -> list:
    """念：对齐用的字（台词的「念」，没写同「文本」）；时长：配音成品的秒数（round 到 3 位）；字：[[单位, 起秒, 止秒]]。返回 [[秒, 嘴型]]"""
    hanzi = ''.join(re.findall(r'[一-鿿]', 念))
    pys = 拼音(hanzi) if hanzi else []
    phones: list[Phone] = []
    for unit, s, e in 字:
        if re.fullmatch(r'\W+', unit):
            continue
        unit_phones(phones, unit, pys, round(s * 100), max(round(e * 100), round(s * 100) + 4))
    return animate(phones, int(时长 * 100) + TAIL_SILENCE_CS)
