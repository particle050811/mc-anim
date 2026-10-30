#!/usr/bin/env python3
"""从游戏本体取原版音效：按声音事件名把 ogg 原样拷出来，连同 sounds.json 里的参数写进一张表。

1.20.1 的声音不在客户端 jar 里（jar 里连 sounds.json 都没有），都在资源索引里：Prism 的公共资源目录
~/Library/Application Support/PrismLauncher/assets/，indexes/5.json（1.20.1 用的资源索引 id 是 5）把
minecraft/sounds.json、minecraft/sounds/<路径>.ogg 映射到 objects/<hash 前两位>/<hash>。

模组的声音在模组 jar 里：assets/<命名空间>/sounds.json 和 assets/<命名空间>/sounds/<路径>.ogg。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调，目录布局照旧项目的 参考模型库/）：
  python3 导出音效.py <输出目录> [--jar <模组 jar>]... [--按产物 <产物清单.json>] [--来源 <产物来源.json>] <事件名>...
  例：python3 导出音效.py src/音效 block.sculk_shrieker.shriek entity.warden.emerge
      python3 导出音效.py src/音效 --jar <游戏环境>/缓存/mods/EpicFight-Nightfall-3.4.0.jar efn:parry
  原版事件不带命名空间（照旧）；模组事件写成 <命名空间>:<事件>，到给的 jar 里找。模组 sounds.json 里引用原版声音（名字不带命名空间）的，从资源索引取。
  --按产物：从资产 id 反推事件（anim extract 的 {产物清单}，[{id, 文件}]）。id 最后一段是输出文件名去掉 .ogg：
    <事件>（事件只有一个声音）或 <事件>.<序号>；第一段是给了 jar 的模组命名空间的算模组事件（create.cogs → create:cogs），
    别的算原版事件。反推不出的打到 stderr、不中断，anim extract 核对时会报缺。只导清单里的文件（同一事件别的序号不导）；命令行直接给的事件照旧全导。
  --来源：写 {输出文件（相对当前目录）: [字节取自的文件]}（anim extract 的 {产物来源}）：原版声音记资源索引 indexes/5.json，模组声音记那个 jar。
    anim extract --登记 照它给每件记真正用到的 jar（模组事件引用原版声音的，字节取自资源索引，记资源索引）。已有的合并。
输出：
  <输出目录>/<事件名>.ogg（事件只有一个声音时）或 <事件名>.<序号>.ogg（序号从 1 起，照 sounds.json 里的先后；模组事件的文件名
  把「:」换成「.」，如 efn.parry.1.ogg），
  字节和游戏里的一模一样，不转码；
  <输出目录>/游戏音效.json：每个事件的 subtitle 和每个声音的来源（索引路径、hash）、时长、volume、pitch、weight、
  attenuation_distance（sounds.json 没写的按游戏默认：volume 1、pitch 1、weight 1、attenuation_distance 16）。
  已有的表会合并（同名事件覆盖），所以可以分几次导。
资源目录读环境变量 ANIM_MC_ASSETS（anim extract 按配置传，默认 Prism 数据目录下的 assets/）。
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import zipfile
from pathlib import Path

if not os.environ.get('ANIM_MC_ASSETS'):
    sys.exit('要设 ANIM_MC_ASSETS：原版资源目录（indexes/、objects/），用 anim extract 跑会按配置传')
ASSETS = Path(os.environ['ANIM_MC_ASSETS'])
INDEX_ID = '5'  # 1.20.1 的 assetIndex.id（版本 json 里写的）

if len(sys.argv) < 3:
    sys.exit(__doc__)
out = Path(sys.argv[1])
jars: list[Path] = []
names: list[str] = []
products_file: Path | None = None
sources_file: Path | None = None
rest_args = sys.argv[2:]
while rest_args:
    if rest_args[0] == '--jar':
        jars.append(Path(rest_args[1]))
        rest_args = rest_args[2:]
    elif rest_args[0] == '--按产物':
        products_file = Path(rest_args[1])
        rest_args = rest_args[2:]
    elif rest_args[0] == '--来源':
        sources_file = Path(rest_args[1])
        rest_args = rest_args[2:]
    else:
        names.append(rest_args.pop(0))
out.mkdir(parents=True, exist_ok=True)

objects = json.loads((ASSETS / 'indexes' / f'{INDEX_ID}.json').read_text(encoding='utf-8'))['objects']


def obj(key: str) -> tuple[Path, str]:
    h = objects[key]['hash']
    return ASSETS / 'objects' / h[:2] / h, h


sounds_path, sounds_hash = obj('minecraft/sounds.json')
sounds = json.loads(sounds_path.read_text(encoding='utf-8'))


def get_duration(p: Path) -> float:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)],
                       capture_output=True, text=True, check=True, encoding='utf-8')
    return round(float(r.stdout.strip()), 6)


table_path = out / '游戏音效.json'
table = json.loads(table_path.read_text(encoding='utf-8')) if table_path.exists() else {}
table['_来源'] = {
    '资源目录': '~/Library/Application Support/PrismLauncher/assets（Prism 的公共资源目录，取材客户端实例用的就是它）',
    '资源索引': f'indexes/{INDEX_ID}.json（Minecraft 1.20.1）',
    'sounds.json': f'minecraft/sounds.json → objects/{sounds_hash[:2]}/{sounds_hash}',
    '默认值': 'volume 1、pitch 1、weight 1、attenuation_distance 16（1.20.1 SoundEventRegistrationSerializer.getSound 里的缺省值，javap 核对过）',
}
# 模组：命名空间 → (jar, sounds.json)
mod_sounds: dict[str, tuple[zipfile.ZipFile, dict, str]] = {}
for j in jars:
    z = zipfile.ZipFile(j)
    for n in z.namelist():
        m = re.fullmatch(r'assets/([^/]+)/sounds\.json', n)
        if m:
            mod_sounds[m.group(1)] = (z, json.loads(z.read(n)), f'{j.name}!/{n}')


INDEX_FILE = ASSETS / 'indexes' / f'{INDEX_ID}.json'


def fetch_sound(sound_name: str, default_namespace: str):
    """sounds.json 里一个声音的名字（[命名空间:]路径）→ (字节, 来源说明, sha1, 字节取自的文件：资源索引或模组 jar)"""
    ns, path = sound_name.split(':', 1) if ':' in sound_name else (default_namespace, sound_name)
    if ns == 'minecraft':
        src, h = obj(f'minecraft/sounds/{path}.ogg')
        return src.read_bytes(), f'minecraft/sounds/{path}.ogg', h, str(INDEX_FILE)
    z = mod_sounds[ns][0]
    data = z.read(f'assets/{ns}/sounds/{path}.ogg')
    return data, f'{Path(z.filename).name}!/assets/{ns}/sounds/{path}.ogg', hashlib.sha1(data).hexdigest(), str(z.filename)


def expand_event(ev: dict, ns: str, volume_mul=1.0, pitch_mul=1.0, weight_override=None):
    """事件的声音表；type: event 的条目（引用另一个事件，暮色森林的巫妖受伤就是引用原版烈焰人）展开成那个事件的声音，
    音量、音高相乘（WeighedSoundEvents 里 event 类型的条目播放时 volume、pitch 和被引用的那一个相乘），weight 照条目自己的"""
    out = []
    for e in ev['sounds']:
        e = e if isinstance(e, dict) else {'name': e}
        v, p = volume_mul * e.get('volume', 1.0), pitch_mul * e.get('pitch', 1.0)
        if e.get('type') == 'event':
            rns, rname = e['name'].split(':', 1) if ':' in e['name'] else ('minecraft', e['name'])
            ref = sounds[rname] if rns == 'minecraft' else mod_sounds[rns][1][rname]
            sub = expand_event(ref, rns, v, p, e.get('weight', 1))
            for x in sub:
                x['引用'] = e['name']
            out += sub
        else:
            n = e['name'] if ':' in e['name'] else f'{ns}:{e["name"]}'
            out.append({**e, 'name': n, 'volume': v, 'pitch': p, 'weight': weight_override if weight_override is not None else e.get('weight', 1)})
    return out


def count_sounds(ns: str, ev: dict) -> int:
    return len(expand_event(ev, ns))


def reverse(tail: str) -> str | None:
    """输出文件名（去掉 .ogg）→ 事件名（模组的带命名空间）；对不上 sounds.json 的返回 None"""
    head, _, rest = tail.partition('.')
    if head in mod_sounds and rest:
        ns, table, ev_tail, prefix = head, mod_sounds[head][1], rest, f'{head}:'
    else:
        ns, table, ev_tail, prefix = 'minecraft', sounds, tail, ''
    if ev_tail in table and count_sounds(ns, table[ev_tail]) == 1:
        return prefix + ev_tail
    base, _, n = ev_tail.rpartition('.')
    if n.isdigit() and base in table:
        c = count_sounds(ns, table[base])
        if c > 1 and 1 <= int(n) <= c:
            return prefix + base
    return None


wanted: set[str] | None = None  # --按产物 时只写产物清单里的文件（同一事件别的序号不写）
explicit = set(names)  # 命令行直接给的事件不按清单筛
if products_file:
    bad = []
    wanted = set()
    for p in json.loads(products_file.read_text(encoding='utf-8')):
        wanted.add(Path(p['文件']).name)
        tail = p['id'].rsplit('/', 1)[1]
        ev = reverse(tail)
        if ev is None:
            bad.append(p['id'])
        elif ev not in names:
            names.append(ev)
    for b in bad:
        print(f'反推不出事件：{b}（不是原版事件，第一段也不是给了 jar 的模组命名空间；或序号超出 sounds.json 里的个数）', file=sys.stderr)
    print(f'按产物反推出 {len(names)} 个事件', file=sys.stderr)

sources: dict[str, list[str]] = {}  # --来源：输出文件（相对当前目录）→ 字节取自的文件
for name in names:
    if ':' in name:
        ns, ev_name = name.split(':', 1)
        if ns not in mod_sounds:
            sys.exit(f'{name}：没给命名空间 {ns} 的 jar（--jar）')
        ev = mod_sounds[ns][1][ev_name]
        sounds_src = mod_sounds[ns][2]
        file_prefix = f'{ns}.{ev_name}'
    else:
        ns, ev, sounds_src, file_prefix = 'minecraft', sounds[name], 'minecraft/sounds.json', name
    entries = expand_event(ev, ns)
    items = []
    for i, e in enumerate(entries):
        data, key, h, from_file = fetch_sound(e['name'], ns)
        fn = f'{file_prefix}.ogg' if len(entries) == 1 else f'{file_prefix}.{i + 1}.ogg'
        if wanted is not None and fn not in wanted and name not in explicit:
            continue
        (out / fn).write_bytes(data)
        sources[Path(os.path.relpath(out / fn)).as_posix()] = [from_file]
        assert hashlib.sha1((out / fn).read_bytes()).hexdigest() == h
        items.append({
            '文件': fn,
            '索引路径': key,
            'hash': h,
            '时长': get_duration(out / fn),
            'volume': e.get('volume', 1.0),
            'pitch': e.get('pitch', 1.0),
            'weight': e.get('weight', 1),
            'attenuation_distance': e.get('attenuation_distance', 16),
            **({'引用事件': e['引用']} if '引用' in e else {}),
        })
        print(f'{fn:48s} ← {key}（{h}）')
    table[name] = {'subtitle': ev.get('subtitle'), '声音': items, **({'sounds.json': sounds_src} if ns != 'minecraft' else {})}
table_path.write_text(json.dumps(table, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已写 {table_path}')
if sources_file:
    old = json.loads(sources_file.read_text(encoding='utf-8')) if sources_file.exists() else {}
    sources_file.parent.mkdir(parents=True, exist_ok=True)
    sources_file.write_text(json.dumps({**old, **sources}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
