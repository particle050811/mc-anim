"""把扫描出的组分成拼名批次（只出表，不改代码），给拼名的模型一批一个文件。

分法：同一个中文名的组一定在同一批（一个名字的各处用法放一起看，才拼得一致）。
- 通用词：在 3 个以上区（pipeline、engine、库、wasm、各作品）出现，或 2 个区且 20 组以上的名字。
  按名字倒过来排（中文中心词在后：起帧、止帧、帧 挨着），装满一批换下一批；
- 其余的名字按「组最多的那个目录」排，同目录的挨着，区换了且这批过了六成就换批；
- Python 单独成批（用 py改名.py 的表），和 TS 共用的盘上字段标出来。
生成代码里的编号名按规则定，写 规则.tsv。
每批出两个文件：批NN.tsv（模型看：行号、名字、种类、标记、链、声明行、用法）和 批NN.ids.tsv（行号 → 组 id，合表用）。

用法：python3 pipeline/改名/分批.py --scan <TS 扫描目录> [--py-scan <目录>] --out <目录> [--size 1800]
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re

缩写 = [('作品/把回忆拼好给你/', '回忆/'), ('作品/亚波伦不放水/', '亚波伦/'), ('作品/应力转动/', '应力/')]
页长 = 250
区序 = ['作品/应力转动', '作品/把回忆拼好给你', '作品/亚波伦不放水', '库', 'engine', 'wasm', 'pipeline', 'sourcing', '.claude']


def 区(f: str) -> str:
    p = f.split('/')
    return '/'.join(p[:2]) if p[0] == '作品' else p[0]


def 短(f: str) -> str:
    for a, b in 缩写:
        if f.startswith(a):
            return b + f[len(a) :]
    return f


def 一行(s: str, 列: int, 宽: int) -> str:
    """截到宽字以内，围着名字所在的列取窗口；去掉制表符和首尾空白"""
    s = s.replace('\t', ' ')
    lead = len(s) - len(s.lstrip())
    s = s.strip()
    列 = max(0, 列 - 1 - lead)
    if len(s) <= 宽:
        return s
    起 = max(0, min(列 - 宽 // 3, len(s) - 宽))
    return ('…' if 起 > 0 else '') + s[起 : 起 + 宽] + ('…' if 起 + 宽 < len(s) else '')


def 用法(g: dict, n: int, 宽: int) -> list[str]:
    decl = g.get('decl') or {}
    外 = [u for u in g.get('uses', []) if u['file'] != decl.get('file')]
    内 = [u for u in g.get('uses', []) if u['file'] == decl.get('file')]
    out = []
    for u in (外[:1] + 内[:1] + 外[1:] + 内[1:])[:n]:
        loc = f':{u["line"]}' if u['file'] == decl.get('file') else f'{短(u["file"])}:{u["line"]}'
        t = u['text']
        i = t.find(g['name'])
        out.append(f'{loc} {一行(t, i + 1 if i >= 0 else 0, 宽)}')
    return out


def 标记(g: dict, 跨ts: set[str]) -> str:
    f = g.get('flags', {})
    m = []
    if f.get('disk') == '是':
        m.append('盘')
    elif f.get('disk') == '疑似':
        m.append('盘?')
    if f.get('stringRefs'):
        m.append(f'串{f["stringRefs"]}')
    if f.get('keyLike'):
        m.append('当键')
    if f.get('jsxComponent'):
        m.append('JSX')
    if g.get('exported'):
        m.append('导出')
    if f.get('cannotRename'):
        m.append('改不了')
    if g['name'] in 跨ts:
        m.append('跨TS')
    return ' '.join(m)


def 链(g: dict) -> str:
    i = g['id'].find('#')
    return g['id'][i + 1 :] if i >= 0 else g['id']


def 行(key: str, g: dict, 跨ts: set[str], 上一个: list[str]) -> str:
    """一组一行。和上一行同一个文件时文件写成 〃；链和名字一样时不写"""
    decl = g.get('decl')
    ctx = (g.get('context') or {}).get('line', '')
    if decl:
        f = 短(decl['file'])
        where = f'〃:{decl["line"]}' if 上一个 and 上一个[0] == f else f'{f}:{decl["line"]}'
        上一个[:] = [f]
        where += ' ' + 一行(ctx, decl['col'], 100)
    else:
        where = '(无声明)'
    多看 = g['kind'] in ('属性', '未解析属性', '无声明', '导入别名') or not decl
    us = 用法(g, 2 if 多看 else 1, 70)
    c = 链(g)
    cols = [key, g['name'], g['kind'], 标记(g, 跨ts), '' if c == g['name'] else c, where, ' ‖ '.join(us)]
    return '\t'.join(x.replace('\t', ' ').replace('\n', ' ') for x in cols)


def 规则名(g: dict) -> str | None:
    """生成代码里的编号名不给模型拼，照生成器的模板直接定（生成器 pipeline/段框架/生成.ts 的 `声${i}` 要同步改成 `sound${i}`）"""
    m = re.fullmatch(r'声(\d+)', g['name'])
    if m and g.get('decl') and g['decl']['file'].endswith('声音地址.生成.ts'):
        return f'sound{m.group(1)}'
    return None


def 目录(g: dict) -> str:
    f = (g.get('decl') or (g.get('uses') or [{'file': '?'}])[0])['file']
    return os.path.dirname(f)


def 装批(名字们: list[str], 组表: dict[str, list[dict]], size: int, 区of) -> list[list[str]]:
    批们: list[list[str]] = [[]]
    n = 0
    上区 = None
    for name in 名字们:
        k = len(组表[name])
        a = 区of(name)
        换 = n and (n + k > size * 1.1 or (a != 上区 and n > size * 0.6))
        if 换:
            批们.append([])
            n = 0
        批们[-1].append(name)
        n += k
        上区 = a
    批们 = [b for b in 批们 if b]
    if len(批们) > 1 and sum(len(组表[n]) for n in 批们[-1]) < size * 0.3:
        尾 = 批们.pop()
        批们[-1] += 尾
    return 批们


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--scan', required=True)
    ap.add_argument('--py-scan')
    ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=int, default=1800)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    gs = [json.loads(l) for l in open(os.path.join(a.scan, 'groups.jsonl'), encoding='utf-8')]
    规则 = [(g, 规则名(g)) for g in gs if 规则名(g)]
    with open(os.path.join(a.out, '规则.tsv'), 'w', encoding='utf-8') as f:
        f.write('# 按规则定的名字（不给模型拼），格式同 apply 的表\n' + ''.join(f'{g["id"]}\t{n}\n' for g, n in 规则))
    gs = [g for g in gs if not 规则名(g)]
    组表: dict[str, list[dict]] = collections.defaultdict(list)
    for g in gs:
        组表[g['name']].append(g)
    区们 = {n: collections.Counter(区(目录(g)) for g in l) for n, l in 组表.items()}
    通用 = [n for n, c in 区们.items() if len(c) >= 3 or (len(c) >= 2 and len(组表[n]) >= 20)]
    通用集 = set(通用)
    通用.sort(key=lambda n: (n[::-1], n))

    def 主目录(n: str) -> str:
        return collections.Counter(目录(g) for g in 组表[n]).most_common(1)[0][0]

    def 区键(n: str) -> int:
        top = 区们[n].most_common(1)[0][0]
        return 区序.index(top) if top in 区序 else len(区序)

    其余 = [n for n in 组表 if n not in 通用集]
    其余.sort(key=lambda n: (区键(n), 主目录(n), n[::-1], n))
    批们 = [('通用词', b) for b in 装批(通用, 组表, a.size, lambda n: '通用')]
    批们 += [('按目录', b) for b in 装批(其余, 组表, a.size, 区键)]

    py: list[dict] = []
    跨ts: set[str] = set()
    if a.py_scan:
        py = [json.loads(l) for l in open(os.path.join(a.py_scan, 'groups.jsonl'), encoding='utf-8')]
        ts盘 = {g['name'] for g in gs if g.get('flags', {}).get('disk')}
        跨ts = {g['name'] for g in py if g['kind'] == '字符串键' and g['name'] in ts盘}

    总表 = ['批\t语言\t分法\t组数\t页数\t名字数\t主要的区\t组最多的名字']
    for i, (分法, names) in enumerate(批们, 1):
        nn = f'{i:02d}'
        l = [g for name in names for g in sorted(组表[name], key=lambda g: (区序.index(区(目录(g))) if 区(目录(g)) in 区序 else 99, g['id']))]
        页数 = 写批(a.out, nn, 'ts', 分法, l, set())
        区计 = collections.Counter(区(目录(g)) for g in l)
        top = sorted(names, key=lambda n: -len(组表[n]))[:8]
        总表.append(f'{nn}\tts\t{分法}\t{len(l)}\t{页数}\t{len(names)}\t{"、".join(f"{k} {v}" for k, v in 区计.most_common(3))}\t{"、".join(f"{n}({len(组表[n])})" for n in top)}')
    if py:
        nn = f'{len(批们) + 1:02d}'
        py.sort(key=lambda g: (g['name'][::-1], g['id']))
        页数 = 写批(a.out, nn, 'py', 'Python', py, 跨ts)
        总表.append(f'{nn}\tpy\tPython\t{len(py)}\t{页数}\t{len({g["name"] for g in py})}\t\t')
    with open(os.path.join(a.out, '批次.tsv'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(总表) + '\n')
    print('\n'.join(总表))


def 写批(out: str, nn: str, 语言: str, 分法: str, gs: list[dict], 跨ts: set[str]) -> int:
    """写 批NN.tsv 和 批NN.ids.tsv，返回页数。每 页长 组插一行「## 页 N」，一个 Agent 一次读一页"""
    rows: list[str] = []
    ids: list[str] = []
    上一个: list[str] = []
    for i, g in enumerate(gs):
        if i % 页长 == 0:
            rows.append(f'## 页 {i // 页长 + 1}（{nn}-{i + 1:04d} 起）')
            上一个.clear()
        key = f'{nn}-{i + 1:04d}'
        rows.append(行(key, g, 跨ts, 上一个))
        ids.append(f'{key}\t{g["id"]}\t{g["name"]}')
    头 = [
        f'# 批 {nn}（{"Python" if 语言 == "py" else "TS"}，{分法}）：{len(gs)} 组，每页 {页长} 组。先读 拼名说明.md。',
        '# 列：行号  中文名  种类  标记  链（声明在哪个函数/类型下；和名字一样就空着）  声明处 文件:行 代码  用法（‖ 隔开；:行 = 同文件）',
        '# 标记：盘=盘上字段 盘?=疑似盘上 串N=N 处字符串里写了这个名字 当键=对象当表用、键是数据 JSX=组件 导出 改不了=声明在扫描范围外 跨TS=和 TS 共用的盘上字段',
        '# 路径简写：回忆/ = 作品/把回忆拼好给你/，亚波伦/ = 作品/亚波伦不放水/，应力/ = 作品/应力转动/；〃 = 和上一行同一个文件',
    ]
    with open(os.path.join(out, f'批{nn}.tsv'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(头 + rows) + '\n')
    with open(os.path.join(out, f'批{nn}.ids.tsv'), 'w', encoding='utf-8') as f:
        f.write(f'# 批 {nn} 行号 → 组 id（{语言}）\n' + '\n'.join(ids) + '\n')
    return (len(gs) + 页长 - 1) // 页长


if __name__ == '__main__':
    main()
