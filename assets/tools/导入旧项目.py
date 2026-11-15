#!/usr/bin/env python3
"""把旧项目的资产按 assets/registry/*.toml 导进数据根，生成 assets/资产锁/（一件资产一个 <id>.json）和 assets/旧路径.tsv。

用法：python3 assets/tools/导入旧项目.py [--旧项目 <目录>] [--数据根 <目录>] [--只核对]
  旧项目默认取环境变量 ANIM_OLD，没有就是本仓库同级的 机械动力应力转动-AI漫画/；数据根默认 ANIM_DATA，没有就是同级的 mc-anim-data/。
  --只核对：不拷、不写锁，只按现有资产锁全量回读 store/私有 和旧文件核对 sha。
只用标准库，可重跑：库里已有的对象不重拷（只增不改），拷进 assets/src/ 的文字源要和旧文件逐字节一致，地形按 地形版本.json 整目录拷。
最后核对 assets/kits/ 角色包引用的资产 id 和文字源都在。字段和目录约定见 assets/README.md。
"""
import argparse
import fnmatch
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / 'assets'
VISIBILITY_VALUES = ('公开', '提取', '发布', '私有')


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def clone_file(src: Path, dst: Path) -> None:
    """APFS 上用 cp -c（写时复制，几乎不占空间）；别的文件系统、别的平台退回普通拷贝。先写临时名再改名，中途断了不留半个文件"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + '.tmp')
    if sys.platform == 'darwin' and subprocess.run(['cp', '-c', str(src), str(tmp)], capture_output=True).returncode == 0:
        pass
    else:
        shutil.copyfile(src, tmp)
    os.chmod(tmp, 0o444)  # 对象只增不改
    os.replace(tmp, dst)


def read_asset_registry() -> list[dict]:
    entry_list = []
    for p in sorted((ASSETS / 'registry').glob('*.toml')):
        for e in tomllib.loads(p.read_text(encoding='utf-8')).get('资产', []):
            e['_表'] = p.name
            entry_list.append(e)
    errors = []
    seen_ids = {}
    for e in entry_list:
        for f in ('id', '类别', '来源', '许可', '可见性'):
            if not e.get(f):
                errors.append(f'{e["_表"]} {e.get("id")}: 缺 {f}')
        if e.get('可见性') not in VISIBILITY_VALUES:
            errors.append(f'{e["_表"]} {e.get("id")}: 可见性 {e.get("可见性")} 不在 {VISIBILITY_VALUES}')
        if not str(e.get('来源', '')).startswith(('提取:', '手工:', '派生:')):
            errors.append(f'{e["_表"]} {e.get("id")}: 来源要以 提取:/手工:/派生: 开头')
        if any(c in e['id'] for c in '<>:"|?*\\ '):
            errors.append(f'{e["_表"]} {e["id"]}: id 里有 Windows 不认的字符或空格')
        if e['id'].split('/')[0] + '.toml' != e['_表']:
            errors.append(f'{e["_表"]} {e["id"]}: 类前缀和所在的表对不上')
        if e['id'].lower() in seen_ids:
            errors.append(f'{e["id"]} 和 {seen_ids[e["id"].lower()]} 重复（不分大小写）')
        seen_ids[e['id'].lower()] = e['id']
    if errors:
        sys.exit('资产表有错：\n' + '\n'.join(errors))
    return entry_list


def library_dir(data_root: Path, library: str, sha: str) -> Path:
    return data_root / library / sha[:2] / sha


def import_old_project(old_root: Path, data_root: Path, existing_lock: dict) -> dict:
    asset_lock = {}
    new_copies = 0
    for e in read_asset_registry():
        if not e.get('旧路径'):
            # 不是从旧项目来的（anim assets add 登记的），照现有锁保留，不重算
            if e['id'] not in existing_lock:
                sys.exit(f'{e["id"]}: 没写旧路径，资产锁里也没有，先用 anim assets add 入库')
            asset_lock[e['id']] = existing_lock[e['id']]
            continue
        src = old_root / e['旧路径']
        if not src.is_file():
            sys.exit(f'{e["id"]}: 旧文件不在 {src}')
        s = sha256(src)
        library = '私有' if e['可见性'] == '私有' else 'store'
        dst = library_dir(data_root, library, s)
        if not dst.exists():
            clone_file(src, dst)
            new_copies += 1
        elif dst.stat().st_size != src.stat().st_size:
            sys.exit(f'{dst} 已存在但大小不对，库里的对象被改过')
        asset_lock[e['id']] = {'sha256': s, '大小': src.stat().st_size, '库': library, '后缀': src.suffix.lower()}
    print(f'资产 {len(asset_lock)} 条，新拷进库 {new_copies} 个对象')
    return dict(sorted(asset_lock.items()))


def copy_text_sources(old_root: Path) -> list[tuple[str, str]]:
    table = tomllib.loads((ASSETS / 'src' / '来源.toml').read_text(encoding='utf-8')).get('源文件', [])
    pairs = []
    for g in table:
        src, dst = old_root / g['旧路径'], REPO / g['路径']
        if not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
        if dst.read_bytes() != src.read_bytes():
            sys.exit(f'{g["路径"]} 和旧文件 {g["旧路径"]} 不一致')
        pairs.append((g['旧路径'], 'git:' + g['路径']))
    print(f'文字源 {len(table)} 个')
    return pairs


def pack_manifest(dir_path: Path) -> tuple[str, int, int]:
    """整个版本目录的指纹：按相对路径排好的「路径\\tsha256」逐行再取 sha256"""
    lines, total_size = [], 0
    for p in sorted(x for x in dir_path.rglob('*') if x.is_file()):
        lines.append(f'{p.relative_to(dir_path).as_posix()}\t{sha256(p)}\n')
        total_size += p.stat().st_size
    return hashlib.sha256(''.join(lines).encode('utf-8')).hexdigest(), len(lines), total_size


def import_terrain(old_root: Path, data_root: Path, check_only: bool) -> list[tuple[str, str]]:
    table_path = ASSETS / '地形版本.json'
    table = json.loads(table_path.read_text(encoding='utf-8'))
    pairs = []
    for pack_name, v in table['包'].items():
        if '旧路径' not in v:  # anim world bake、转码 出的版本，旧项目里没有
            continue
        dst = data_root / 'terrain' / pack_name / v['版本']
        src = old_root / v['旧路径']
        if not dst.exists() and not check_only:
            dst.parent.mkdir(parents=True, exist_ok=True)
            if sys.platform == 'darwin' and subprocess.run(['cp', '-cR', str(src), str(dst)]).returncode == 0:
                pass
            else:
                shutil.copytree(src, dst)
        fingerprint, file_count, total_size = pack_manifest(dst)
        if v.get('清单sha256') and v['清单sha256'] != fingerprint:
            sys.exit(f'地形 {pack_name}/{v["版本"]} 和 地形版本.json 记的清单指纹不一致')
        if pack_manifest(src)[0] != fingerprint:
            sys.exit(f'地形 {pack_name}/{v["版本"]} 和旧项目的不一致')
        v.update({'文件数': file_count, '大小': total_size, '清单sha256': fingerprint})
        pairs.append((v['旧路径'] + '/', f'terrain:{pack_name}/{v["版本"]}'))
        print(f'地形 {pack_name}/{v["版本"]}：{file_count} 个文件，{total_size / 2**20:.0f} MB，核对一致')
    if not check_only:
        table_path.write_text(json.dumps(table, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return pairs


def read_back(asset_lock: dict, old_root: Path, data_root: Path) -> None:
    """全量回读：库里每个对象的 sha 要等于锁里记的，也要等于旧文件的"""
    table = {e['id']: e for e in read_asset_registry()}
    if set(table) != set(asset_lock):
        sys.exit(f'资产锁和资产表的 id 对不上：多 {sorted(set(asset_lock) - set(table))[:5]}，少 {sorted(set(table) - set(asset_lock))[:5]}')
    count_by_visibility: dict[str, list[int]] = {k: [0, 0] for k in VISIBILITY_VALUES}
    by_path = {}
    for id_, v in asset_lock.items():
        p = library_dir(data_root, v['库'], v['sha256'])
        if p not in by_path:
            by_path[p] = sha256(p)
        if by_path[p] != v['sha256'] or p.stat().st_size != v['大小']:
            sys.exit(f'{id_}: 库里的对象 {p} 和锁不一致')
        if table[id_].get('旧路径') and sha256(old_root / table[id_]['旧路径']) != v['sha256']:
            sys.exit(f'{id_}: 旧文件 {table[id_]["旧路径"]} 和锁不一致')
        count_by_visibility[table[id_]['可见性']][0] += 1
        count_by_visibility[table[id_]['可见性']][1] += v['大小']
    total_size = sum(v['大小'] for v in asset_lock.values())
    actual_bytes = sum(p.stat().st_size for p in by_path)
    print(f'回读核对通过：{len(asset_lock)} 条，合计 {total_size / 2**20:.1f} MB（去重后 {len(by_path)} 个对象、{actual_bytes / 2**20:.1f} MB）')
    for k, (n, b) in count_by_visibility.items():
        print(f'  {k}：{n} 条，{b / 2**20:.1f} MB')


def check_character_packs(entry_list: list[dict]) -> None:
    """kits/*.toml 里写的资产 id、匹配、文字源、渲染代码、已搬的代码都要找得到，免得角色包指向已改名或没登记的东西"""
    ids = {e['id'] for e in entry_list}
    errors = []
    packs = sorted((ASSETS / 'kits').glob('*.toml'))
    for p in packs:
        k = tomllib.loads(p.read_text(encoding='utf-8'))
        if k.get('角色') != p.stem:
            errors.append(f'{p.name}: 「角色」要和文件名一致')
        for section in ('基准', '资产组'):
            for g in k.get(section, []):
                assets = g.get('资产', [])
                for i in [assets] if isinstance(assets, str) else assets:
                    if i not in ids:
                        errors.append(f'{p.name} {section}「{g.get("用途")}」: 资产表里没有 {i}')
                for pat in g.get('匹配', []):
                    if not fnmatch.filter(ids, pat):
                        errors.append(f'{p.name} {section}「{g.get("用途")}」: 匹配 {pat} 一个也没有')
                for f in g.get('文字源', []):
                    if not (REPO / f).is_file():
                        errors.append(f'{p.name} {section}「{g.get("用途")}」: 文字源 {f} 不在仓库里')
        if '渲染代码' in k and not (REPO / k['渲染代码']).is_file():
            errors.append(f'{p.name}: 渲染代码 {k["渲染代码"]} 不在仓库里')
        for c in k.get('代码', []):
            # 不写状态当未搬：还没开始搬的角色包不用逐条补
            if c.get('状态', '未搬') not in ('已搬', '未搬'):
                errors.append(f'{p.name} 代码「{c.get("旧位置")}」: 状态要写 已搬 或 未搬')
            elif c.get('状态') == '已搬' and not (REPO / c['新位置']).exists():
                errors.append(f'{p.name} 代码「{c.get("旧位置")}」: 写了已搬，新位置 {c["新位置"]} 不在仓库里')
    if errors:
        sys.exit('角色包有错：\n' + '\n'.join(errors))
    print(f'角色包 {len(packs)} 个，引用都找得到')


def main() -> None:
    ap = argparse.ArgumentParser(description=(__doc__ or '').splitlines()[0])
    ap.add_argument('--旧项目', type=Path, default=Path(os.environ.get('ANIM_OLD') or REPO.parent / '机械动力应力转动-AI漫画'))
    ap.add_argument('--数据根', type=Path, default=Path(os.environ.get('ANIM_DATA') or REPO.parent / 'mc-anim-data'))
    ap.add_argument('--只核对', action='store_true')
    a = ap.parse_args()
    # worktree 在 mc-anim-wt/<名>/ 下时，同级目录要再往上一层找
    for attr, name in (('旧项目', '机械动力应力转动-AI漫画'), ('数据根', 'mc-anim-data')):
        p = getattr(a, attr)
        if not p.exists() and (REPO.parent.parent / name).exists():
            setattr(a, attr, REPO.parent.parent / name)
    lock_dir = ASSETS / '资产锁'
    existing_lock = {f.relative_to(lock_dir).with_suffix('').as_posix(): json.loads(f.read_text(encoding='utf-8')) for f in sorted(lock_dir.rglob('*.json'))}
    pairs: list[tuple[str, str]] = []
    if a.只核对:
        asset_lock = existing_lock
    else:
        asset_lock = import_old_project(a.旧项目, a.数据根, existing_lock)
        pairs = [(e['旧路径'], e['id']) for e in read_asset_registry() if e.get('旧路径')] + copy_text_sources(a.旧项目)
    terrain_pairs = import_terrain(a.旧项目, a.数据根, a.只核对)
    if not a.只核对:
        for id_, v in asset_lock.items():
            f = lock_dir / f'{id_}.json'
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(json.dumps(v, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        for f in lock_dir.rglob('*.json'):
            if f.relative_to(lock_dir).with_suffix('').as_posix() not in asset_lock:
                f.unlink()
        lines = ['旧路径\t新\n'] + [f'{o}\t{n}\n' for o, n in sorted(pairs + terrain_pairs)]
        (ASSETS / '旧路径.tsv').write_text(''.join(lines), encoding='utf-8')
    read_back(asset_lock, a.旧项目, a.数据根)
    check_character_packs(read_asset_registry())


if __name__ == '__main__':
    main()
