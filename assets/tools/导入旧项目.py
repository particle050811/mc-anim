#!/usr/bin/env python3
"""把旧项目的资产按 assets/registry/*.toml 导进数据根，生成 assets/资产锁.json 和 assets/旧路径.tsv。

用法：python3 assets/tools/导入旧项目.py [--旧项目 <目录>] [--数据根 <目录>] [--只核对]
  旧项目默认取环境变量 SR_OLD，没有就是本仓库同级的 机械动力应力转动-AI漫画/；数据根默认 SR_DATA，没有就是同级的 stress-rotation-data/。
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
可见性取值 = ('公开', '提取', '发布', '私有')


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def 克隆(src: Path, dst: Path) -> None:
    """APFS 上用 cp -c（写时复制，几乎不占空间）；别的文件系统、别的平台退回普通拷贝。先写临时名再改名，中途断了不留半个文件"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + '.tmp')
    if sys.platform == 'darwin' and subprocess.run(['cp', '-c', str(src), str(tmp)], capture_output=True).returncode == 0:
        pass
    else:
        shutil.copyfile(src, tmp)
    os.chmod(tmp, 0o444)  # 对象只增不改
    os.replace(tmp, dst)


def 读资产表() -> list[dict]:
    条目 = []
    for p in sorted((ASSETS / 'registry').glob('*.toml')):
        for e in tomllib.loads(p.read_text(encoding='utf-8')).get('资产', []):
            e['_表'] = p.name
            条目.append(e)
    错 = []
    见过 = {}
    for e in 条目:
        for f in ('id', '类别', '来源', '许可', '可见性'):
            if not e.get(f):
                错.append(f'{e["_表"]} {e.get("id")}: 缺 {f}')
        if e.get('可见性') not in 可见性取值:
            错.append(f'{e["_表"]} {e.get("id")}: 可见性 {e.get("可见性")} 不在 {可见性取值}')
        if not str(e.get('来源', '')).startswith(('提取:', '手工:', '派生:')):
            错.append(f'{e["_表"]} {e.get("id")}: 来源要以 提取:/手工:/派生: 开头')
        if any(c in e['id'] for c in '<>:"|?*\\ '):
            错.append(f'{e["_表"]} {e["id"]}: id 里有 Windows 不认的字符或空格')
        if e['id'].split('/')[0] + '.toml' != e['_表']:
            错.append(f'{e["_表"]} {e["id"]}: 类前缀和所在的表对不上')
        if e['id'].lower() in 见过:
            错.append(f'{e["id"]} 和 {见过[e["id"].lower()]} 重复（不分大小写）')
        见过[e['id'].lower()] = e['id']
    if 错:
        sys.exit('资产表有错：\n' + '\n'.join(错))
    return 条目


def 库目录(数据根: Path, 库: str, sha: str) -> Path:
    return 数据根 / 库 / sha[:2] / sha


def 导入(旧: Path, 数据根: Path, 现有锁: dict) -> dict:
    锁 = {}
    新拷 = 0
    for e in 读资产表():
        if not e.get('旧路径'):
            # 不是从旧项目来的（sr assets add 登记的），照现有锁保留，不重算
            if e['id'] not in 现有锁:
                sys.exit(f'{e["id"]}: 没写旧路径，资产锁里也没有，先用 sr assets add 入库')
            锁[e['id']] = 现有锁[e['id']]
            continue
        src = 旧 / e['旧路径']
        if not src.is_file():
            sys.exit(f'{e["id"]}: 旧文件不在 {src}')
        s = sha256(src)
        库 = '私有' if e['可见性'] == '私有' else 'store'
        dst = 库目录(数据根, 库, s)
        if not dst.exists():
            克隆(src, dst)
            新拷 += 1
        elif dst.stat().st_size != src.stat().st_size:
            sys.exit(f'{dst} 已存在但大小不对，库里的对象被改过')
        锁[e['id']] = {'sha256': s, '大小': src.stat().st_size, '库': 库, '后缀': src.suffix.lower()}
    print(f'资产 {len(锁)} 条，新拷进库 {新拷} 个对象')
    return dict(sorted(锁.items()))


def 拷文字源(旧: Path) -> list[tuple[str, str]]:
    表 = tomllib.loads((ASSETS / 'src' / '来源.toml').read_text(encoding='utf-8')).get('源文件', [])
    对照 = []
    for g in 表:
        src, dst = 旧 / g['旧路径'], REPO / g['路径']
        if not dst.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
        if dst.read_bytes() != src.read_bytes():
            sys.exit(f'{g["路径"]} 和旧文件 {g["旧路径"]} 不一致')
        对照.append((g['旧路径'], 'git:' + g['路径']))
    print(f'文字源 {len(表)} 个')
    return 对照


def 包清单(目录: Path) -> tuple[str, int, int]:
    """整个版本目录的指纹：按相对路径排好的「路径\\tsha256」逐行再取 sha256"""
    行, 大小 = [], 0
    for p in sorted(x for x in 目录.rglob('*') if x.is_file()):
        行.append(f'{p.relative_to(目录).as_posix()}\t{sha256(p)}\n')
        大小 += p.stat().st_size
    return hashlib.sha256(''.join(行).encode('utf-8')).hexdigest(), len(行), 大小


def 地形(旧: Path, 数据根: Path, 只核对: bool) -> list[tuple[str, str]]:
    表路径 = ASSETS / '地形版本.json'
    表 = json.loads(表路径.read_text(encoding='utf-8'))
    对照 = []
    for 名, v in 表['包'].items():
        dst = 数据根 / 'terrain' / 名 / v['版本']
        src = 旧 / v['旧路径']
        if not dst.exists() and not 只核对:
            dst.parent.mkdir(parents=True, exist_ok=True)
            if sys.platform == 'darwin' and subprocess.run(['cp', '-cR', str(src), str(dst)]).returncode == 0:
                pass
            else:
                shutil.copytree(src, dst)
        指纹, 数, 大小 = 包清单(dst)
        if v.get('清单sha256') and v['清单sha256'] != 指纹:
            sys.exit(f'地形 {名}/{v["版本"]} 和 地形版本.json 记的清单指纹不一致')
        if 包清单(src)[0] != 指纹:
            sys.exit(f'地形 {名}/{v["版本"]} 和旧项目的不一致')
        v.update({'文件数': 数, '大小': 大小, '清单sha256': 指纹})
        对照.append((v['旧路径'] + '/', f'terrain:{名}/{v["版本"]}'))
        print(f'地形 {名}/{v["版本"]}：{数} 个文件，{大小 / 2**20:.0f} MB，核对一致')
    if not 只核对:
        表路径.write_text(json.dumps(表, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return 对照


def 回读(锁: dict, 旧: Path, 数据根: Path) -> None:
    """全量回读：库里每个对象的 sha 要等于锁里记的，也要等于旧文件的"""
    表 = {e['id']: e for e in 读资产表()}
    if set(表) != set(锁):
        sys.exit(f'资产锁和资产表的 id 对不上：多 {sorted(set(锁) - set(表))[:5]}，少 {sorted(set(表) - set(锁))[:5]}')
    按可见性: dict[str, list[int]] = {k: [0, 0] for k in 可见性取值}
    对象 = {}
    for id_, v in 锁.items():
        p = 库目录(数据根, v['库'], v['sha256'])
        if p not in 对象:
            对象[p] = sha256(p)
        if 对象[p] != v['sha256'] or p.stat().st_size != v['大小']:
            sys.exit(f'{id_}: 库里的对象 {p} 和锁不一致')
        if 表[id_].get('旧路径') and sha256(旧 / 表[id_]['旧路径']) != v['sha256']:
            sys.exit(f'{id_}: 旧文件 {表[id_]["旧路径"]} 和锁不一致')
        按可见性[表[id_]['可见性']][0] += 1
        按可见性[表[id_]['可见性']][1] += v['大小']
    总 = sum(v['大小'] for v in 锁.values())
    实占 = sum(p.stat().st_size for p in 对象)
    print(f'回读核对通过：{len(锁)} 条，合计 {总 / 2**20:.1f} MB（去重后 {len(对象)} 个对象、{实占 / 2**20:.1f} MB）')
    for k, (n, b) in 按可见性.items():
        print(f'  {k}：{n} 条，{b / 2**20:.1f} MB')


def 核对角色包(条目: list[dict]) -> None:
    """kits/*.toml 里写的资产 id、匹配、文字源都要找得到，免得角色包指向已改名或没登记的资产"""
    ids = {e['id'] for e in 条目}
    错 = []
    包们 = sorted((ASSETS / 'kits').glob('*.toml'))
    for p in 包们:
        k = tomllib.loads(p.read_text(encoding='utf-8'))
        if k.get('角色') != p.stem:
            错.append(f'{p.name}: 「角色」要和文件名一致')
        for 节 in ('基准', '资产组'):
            for g in k.get(节, []):
                资产 = g.get('资产', [])
                for i in [资产] if isinstance(资产, str) else 资产:
                    if i not in ids:
                        错.append(f'{p.name} {节}「{g.get("用途")}」: 资产表里没有 {i}')
                for pat in g.get('匹配', []):
                    if not fnmatch.filter(ids, pat):
                        错.append(f'{p.name} {节}「{g.get("用途")}」: 匹配 {pat} 一个也没有')
                for f in g.get('文字源', []):
                    if not (REPO / f).is_file():
                        错.append(f'{p.name} {节}「{g.get("用途")}」: 文字源 {f} 不在仓库里')
    if 错:
        sys.exit('角色包有错：\n' + '\n'.join(错))
    print(f'角色包 {len(包们)} 个，引用都找得到')


def main() -> None:
    ap = argparse.ArgumentParser(description=(__doc__ or '').splitlines()[0])
    ap.add_argument('--旧项目', type=Path, default=Path(os.environ.get('SR_OLD') or REPO.parent / '机械动力应力转动-AI漫画'))
    ap.add_argument('--数据根', type=Path, default=Path(os.environ.get('SR_DATA') or REPO.parent / 'stress-rotation-data'))
    ap.add_argument('--只核对', action='store_true')
    a = ap.parse_args()
    # worktree 在 stress-rotation-wt/<名>/ 下时，同级目录要再往上一层找
    for attr, name in (('旧项目', '机械动力应力转动-AI漫画'), ('数据根', 'stress-rotation-data')):
        p = getattr(a, attr)
        if not p.exists() and (REPO.parent.parent / name).exists():
            setattr(a, attr, REPO.parent.parent / name)
    锁路径 = ASSETS / '资产锁.json'
    现有锁 = json.loads(锁路径.read_text(encoding='utf-8')) if 锁路径.exists() else {}
    对照: list[tuple[str, str]] = []
    if a.只核对:
        锁 = 现有锁
    else:
        锁 = 导入(a.旧项目, a.数据根, 现有锁)
        对照 = [(e['旧路径'], e['id']) for e in 读资产表() if e.get('旧路径')] + 拷文字源(a.旧项目)
    对照地形 = 地形(a.旧项目, a.数据根, a.只核对)
    if not a.只核对:
        锁路径.write_text(json.dumps(锁, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')
        行 = ['旧路径\t新\n'] + [f'{o}\t{n}\n' for o, n in sorted(对照 + 对照地形)]
        (ASSETS / '旧路径.tsv').write_text(''.join(行), encoding='utf-8')
    回读(锁, a.旧项目, a.数据根)
    核对角色包(读资产表())


if __name__ == '__main__':
    main()
