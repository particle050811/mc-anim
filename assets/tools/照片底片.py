#!/usr/bin/env python3
"""《把回忆拼好给你》照片墙上夏天那四张照片（第 8 句起挂在门口后墙荧光框里的地图画）的底片：渲干净帧、裁正方形、登记成资产。

用法：python3 assets/tools/照片底片.py [名…]      （名 = 递蛋糕 日落划船 扑龙蛋 光柱破云，不给就四张都出）
  每张三步：
  1. anim --作品 把回忆拼好给你 still <核对段> <帧> --级别 视频 --到预览 工作-照片底片-<名>-<时分秒>（过资源闸，2560×1440）
  2. ffmpeg crop=1440:1440:<x>:0、scale=256:256:flags=area、format=rgba（整幅高的正方形，横向按下表的 裁心 取）
  3. anim --作品 把回忆拼好给你 assets add 贴图/照片/<资产名> <png> --替换（字节变了才换，旧字节留在库里）
第 3、4、5、7 句改了画面就重跑这一条；核对段第几帧是干净的底片由各句那一路定（见各核对段的说明）。
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

# 名 → (核对段, 第几帧, 资产 id, 裁心)。裁心 = 正方形中心在画面宽的几成（Agent 按 10-24 的静帧挑的：人和那一幕的记号都在框里）
照片们: dict[str, tuple[str, int, str, float]] = {
    '递蛋糕': ('核对-祭坛照片', 0, '贴图/照片/第3句递蛋糕', 0.45),  # 她站在魔法阵里，左下你手里的蛋糕
    '日落划船': ('核对-日落划船', 0, '贴图/照片/第4句日落划船', 0.60),  # 船上两个人，左边留半个落日；两样放不进一个正方形
    '扑龙蛋': ('核对-扑龙蛋照片', 0, '贴图/照片/第5句扑龙蛋', 0.58),  # 她扑在龙蛋上，右边你看着
    '光柱破云': ('核对-光柱破云', 0, '贴图/照片/第7句光柱破云', 0.55),  # 云洞、光柱、底下的她和你
}
画宽, 画高, 边长 = 2560, 1440, 256


def 跑(参数: list[str]) -> str:
    r = subprocess.run(参数, cwd=REPO, capture_output=True, text=True, encoding='utf-8')
    if r.returncode:
        sys.exit(f'✗ {" ".join(参数)}\n{r.stdout}{r.stderr}')
    return r.stdout


def 出一张(名: str, anim: str, ffmpeg: str, 临时: Path) -> None:
    段, 帧, 资产, 裁心 = 照片们[名]
    出 = 跑([anim, '--作品', 作品, 'still', 段, str(帧), '--级别', '视频', '--到预览', f'工作-照片底片-{名}-{time.strftime("%H%M%S")}'])
    m = re.search(r'静帧在 (.+)', 出)
    if not m:
        sys.exit(f'✗ anim still 没说静帧在哪：\n{出}')
    源 = Path(m.group(1).strip()) / f'{段}-第{帧:04d}帧.png'
    x = max(0, min(画宽 - 画高, round(裁心 * 画宽 - 画高 / 2) // 2 * 2))
    png = 临时 / f'{名}.png'
    跑([ffmpeg, '-loglevel', 'error', '-y', '-i', str(源), '-vf', f'crop={画高}:{画高}:{x}:0,scale={边长}:{边长}:flags=area,format=rgba', str(png)])
    print(跑([anim, '--作品', 作品, 'assets', 'add', 资产, str(png), '--替换']).strip())


def main() -> None:
    ap = argparse.ArgumentParser(description=(__doc__ or '').splitlines()[0])
    ap.add_argument('名', nargs='*', help=f'出哪几张（{"、".join(照片们)}），不给 = 四张')
    a = ap.parse_args()
    if 不认得 := [n for n in a.名 if n not in 照片们]:
        ap.error(f'没有这几张：{"、".join(不认得)}')
    anim = str(REPO / ('anim.cmd' if os.name == 'nt' else 'anim'))
    ffmpeg = os.environ.get('ANIM_FFMPEG') or 'ffmpeg'
    with tempfile.TemporaryDirectory() as d:
        for 名 in a.名 or list(照片们):
            出一张(名, anim, ffmpeg, Path(d))


if __name__ == '__main__':
    main()
