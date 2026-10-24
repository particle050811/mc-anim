"""从 核对-封面帧 的静帧裁出交平台的封面和自查用的缩略图（ffmpeg，参数数组、不开 shell）。

用法：python3 -I 派生图.py <B站封面那帧.png> <抖音竖版那帧.png> <输出目录>
  两帧都是 anim still 出的 2560×1440，封面贴在左上角（尺寸见 视图.ts）：B 站 1920×1080、抖音 1080×1440。
出（文件名带编号 10～15，和 anim still 的静帧放进同一个预览文件夹）：B 站 16:9 整张、4:3 取中间 x240–1680（B 站首页推荐用）、两种的 320 宽缩略图；抖音 3:4 整张和 320 宽缩略图。
缩略图用面积平均缩（手机上看到的就是缩过的图），只给自己看认不认得出，不交。
"""

import subprocess
import sys
from pathlib import Path


def 裁(源: Path, 出: Path, 宽: int, 高: int, x: int = 0, y: int = 0, 缩到宽: int | None = None) -> None:
    滤镜 = f"crop={宽}:{高}:{x}:{y}"
    if 缩到宽:
        滤镜 += f",scale={缩到宽}:-1:flags=area"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(源), "-vf", 滤镜, str(出)], check=True)


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    b站, 竖版, 目录 = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    目录.mkdir(parents=True, exist_ok=True)
    裁(b站, 目录 / "10-B站封面-16比9-1920x1080.png", 1920, 1080)
    裁(b站, 目录 / "11-B站封面-4比3-1440x1080.png", 1440, 1080, 240)
    裁(b站, 目录 / "12-B站封面-16比9-缩略320.png", 1920, 1080, 缩到宽=320)
    裁(b站, 目录 / "13-B站封面-4比3-缩略320.png", 1440, 1080, 240, 缩到宽=320)
    裁(竖版, 目录 / "14-抖音封面-3比4-1080x1440.png", 1080, 1440)
    裁(竖版, 目录 / "15-抖音封面-3比4-缩略320.png", 1080, 1440, 缩到宽=320)


if __name__ == "__main__":
    main()
