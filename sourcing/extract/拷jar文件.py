#!/usr/bin/env python3
"""从 jar（zip）里把一个文件原样拷出来，字节不动。给不用转换、直接读原文件的资产用（如 GeckoLib 的 .animation.json）。

用法（anim extract 按 sourcing/extract.toml 在暂存目录里调）：python3 拷jar文件.py <jar> <jar 里的路径> <输出文件>
  例：python3 拷jar文件.py <游戏环境>/缓存/mods/touhoulittlemaid-1.5.3-forge+mc1.20.1.jar \
        assets/touhou_little_maid/tlm_custom_pack/touhou_little_maid-1.0.0/assets/geckolib/animation/winefox_magical.main.animation.json \
        src/动画/角色/魔法酒狐.animation.json
"""
import sys
import zipfile
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    jar, 条目, 输出 = argv
    with zipfile.ZipFile(jar) as z:
        try:
            字节 = z.read(条目)
        except KeyError:
            print(f"jar 里没有 {条目}：{jar}", file=sys.stderr)
            return 1
    out = Path(输出)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(字节)
    print(f"{条目} → {out}（{len(字节)} 字节）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
