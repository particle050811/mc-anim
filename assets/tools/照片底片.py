#!/usr/bin/env python3
"""《把回忆拼好给你》全片六张照片的底片：渲干净帧、裁正方形、登记成资产。

用法：python3 assets/tools/照片底片.py [名…]      （名见下表，不给就六张都出）
  1. anim --作品 把回忆拼好给你 still 核对-照片底片 <帧…> --级别 视频 --到预览 工作-照片底片-<时分秒>（过资源闸，2560×1440，一次渲齐）
  2. 每张 ffmpeg crop=<边>:<边>:<x>:<y>、scale=256:256:flags=area、format=rgba
  3. anim --作品 把回忆拼好给你 assets add <资产 id> <png>
资产 id 先在 作品/把回忆拼好给你/资产表/贴图.toml 登记好。store 只增不改：哪句改了画面、底片字节变了，assets add 会拒绝，
这时给那张登一个新 id（后缀往下排：-二版、-三版…），改下表和引它的代码（特效/照片画.ts、特效/合照.ts、场/2-选择世界/图标源.ts）再跑。
合照（第 11 句）的画面里挂着夏天那四张，要等那四张换好、照片画.ts 引上新 id 以后再出。
只用标准库；Windows 上跑 anim.cmd。ffmpeg 取环境变量 ANIM_FFMPEG，没有就用 PATH 上的。
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
作品 = '把回忆拼好给你'
段 = '核对-照片底片'

# 名 → (核对-照片底片 第几帧（同 核对/照片底片/视图.ts）, 资产 id, 裁)。
# 裁：一个数 = 整幅高的正方形，中心在画面宽的几成；(x, y, 边) = 成片像素的正方形。挑法（Agent 按 10-24 的静帧定）写在每行后面
照片们: dict[str, tuple[int, str, float | tuple[int, int, int]]] = {
    '递蛋糕': (0, '贴图/照片/第3句递蛋糕-二版', 0.45),  # 她站在魔法阵里、头上冒爱心，左边你手里的蛋糕
    '日落划船': (1, '贴图/照片/第4句日落划船-二版', 0.60),  # 船上两个人，左边留半个落日；两样放不进一个正方形
    '扑龙蛋': (2, '贴图/照片/第5句扑龙蛋-二版', 0.58),  # 她扑在龙蛋上，右边你看着
    '光柱破云': (3, '贴图/照片/第7句光柱破云-二版', 0.55),  # 云洞、光柱、底下的屋子和两个人
    '合照': (4, '贴图/照片/第11句合照-二版', 0.5),  # 正中：同第 11 句下线缩成的图标（门口之夜照片.tsx 的 下线图标图），第 0 镜那一格要和它对上
    '新合照': (5, '贴图/照片/第15句新合照', (810, 340, 920)),  # 两个人的头和她手里的花：片尾图标在手机上只有六十来个像素，正中整幅高的正方形里脸太小
}
画宽, 画高, 边长 = 2560, 1440, 256


def 跑(参数: list[str]) -> str:
    r = subprocess.run(参数, cwd=REPO, capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        sys.exit(f'✗ {" ".join(参数)}\n{r.stdout}{r.stderr}')
    return r.stdout


def 裁框(裁: float | tuple[int, int, int]) -> tuple[int, int, int]:
    if isinstance(裁, tuple):
        x, y, 边 = 裁
    else:
        x, y, 边 = max(0, min(画宽 - 画高, round(裁 * 画宽 - 画高 / 2) // 2 * 2)), 0, 画高
    if x < 0 or y < 0 or x + 边 > 画宽 or y + 边 > 画高:
        sys.exit(f'✗ 裁框 {(x, y, 边)} 出了画面')
    return x, y, 边


def main() -> None:
    ap = argparse.ArgumentParser(description=(__doc__ or '').splitlines()[0])
    ap.add_argument('名', nargs='*', help=f'出哪几张（{"、".join(照片们)}），不给 = 全部')
    a = ap.parse_args()
    if 不认得 := [n for n in a.名 if n not in 照片们]:
        ap.error(f'没有这几张：{"、".join(不认得)}')
    名们 = a.名 or list(照片们)
    anim = str(REPO / ('anim.cmd' if os.name == 'nt' else 'anim'))
    ffmpeg = os.environ.get('ANIM_FFMPEG') or 'ffmpeg'
    帧们 = sorted({照片们[n][0] for n in 名们})
    出 = 跑([anim, '--作品', 作品, 'still', 段, *map(str, 帧们), '--级别', '视频', '--到预览', f'工作-照片底片-{time.strftime("%H%M%S")}'])
    m = re.search(r'静帧在 (.+)', 出)
    if not m:
        sys.exit(f'✗ anim still 没说静帧在哪：\n{出}')
    目录 = Path(m.group(1).strip())
    with tempfile.TemporaryDirectory() as d:
        for 名 in 名们:
            帧, 资产, 裁 = 照片们[名]
            x, y, 边 = 裁框(裁)
            png = Path(d) / f'{名}.png'
            跑([ffmpeg, '-loglevel', 'error', '-y', '-i', str(目录 / f'{段}-第{帧:04d}帧.png'), '-vf', f'crop={边}:{边}:{x}:{y},scale={边长}:{边长}:flags=area,format=rgba', str(png)])
            print(跑([anim, '--作品', 作品, 'assets', 'add', 资产, str(png)]).strip())


if __name__ == '__main__':
    main()
