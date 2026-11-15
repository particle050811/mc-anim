"""从 核对-封面帧 的静帧裁出交平台的封面和自查用的缩略图（ffmpeg，参数数组、不开 shell）。

用法：python3 -I 派生图.py <B站封面那帧.png> <抖音竖版那帧.png> <输出目录>
  两帧都是 anim still 出的 2560×1440，封面贴在左上角（尺寸见 视图.ts）：B 站 1920×1080、抖音 1080×1440。
出（文件名带编号 10～15，和 anim still 的静帧放进同一个预览文件夹）：B 站 16:9 整张、4:3 取中间 x240–1680（B 站首页推荐用）、两种的 320 宽缩略图；抖音 3:4 整张和 320 宽缩略图。
缩略图用面积平均缩（手机上看到的就是缩过的图），只给自己看认不认得出，不交。
"""

import subprocess
import sys
from pathlib import Path


def crop_image(src: Path, out_path: Path, width: int, height: int, x: int = 0, y: int = 0, scale_to_width: int | None = None) -> None:
    ffmpeg_filter = f"crop={width}:{height}:{x}:{y}"
    if scale_to_width:
        ffmpeg_filter += f",scale={scale_to_width}:-1:flags=area"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-vf", ffmpeg_filter, str(out_path)], check=True)


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    bilibili, portrait, dir_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    dir_path.mkdir(parents=True, exist_ok=True)
    crop_image(bilibili, dir_path / "10-B站封面-16比9-1920x1080.png", 1920, 1080)
    crop_image(bilibili, dir_path / "11-B站封面-4比3-1440x1080.png", 1440, 1080, 240)
    crop_image(bilibili, dir_path / "12-B站封面-16比9-缩略320.png", 1920, 1080, scale_to_width=320)
    crop_image(bilibili, dir_path / "13-B站封面-4比3-缩略320.png", 1440, 1080, 240, scale_to_width=320)
    crop_image(portrait, dir_path / "14-抖音封面-3比4-1080x1440.png", 1080, 1440)
    crop_image(portrait, dir_path / "15-抖音封面-3比4-缩略320.png", 1080, 1440, scale_to_width=320)


if __name__ == "__main__":
    main()
