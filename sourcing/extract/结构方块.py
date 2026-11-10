"""结构模板 .nbt → 体素方块列表 JSON，给 engine/model/方块拼搭.tsx 一格一格照方块表拼（不开游戏导网格的那条路）。
用法：结构方块.py <结构.nbt> <出.json>
出：{"尺寸": [x, y, z], "调色板": ["minecraft:…[属性,…]", …], "方块": [x, y, z, 调色板号, …]}
坐标是结构模板自己的（MC：x 东、y 上、z 南），空气不收；状态串的属性按名字排序，同结构模板调色板里的全部属性。
方块实体的数据（箱子里的东西、告示牌的字）不带。"""
import gzip, io, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import 读区块 as RD

AIR = ("minecraft:air", "minecraft:cave_air", "minecraft:void_air")


def main():
    src, out = sys.argv[1:3]
    d = RD._nbt(io.BytesIO(gzip.decompress(Path(src).read_bytes())))
    names, remap = [], {}
    flat = []
    # 按 (y, z, x) 排：输出和结构文件里方块的先后无关
    for b in sorted(d["blocks"], key=lambda b: (b["pos"][1], b["pos"][2], b["pos"][0])):
        p = d["palette"][b["state"]]
        if p["Name"] in AIR: continue
        if b["state"] not in remap:
            props = p.get("Properties", {})
            remap[b["state"]] = len(names)
            names.append(f"{p['Name']}[{','.join(f'{k}={v}' for k, v in sorted(props.items()))}]" if props else p["Name"])
        flat += [*b["pos"], remap[b["state"]]]
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(json.dumps({"尺寸": list(d["size"]), "调色板": names, "方块": flat}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{src}：{len(flat) // 4} 格、{len(names)} 种状态 → {out}")


if __name__ == "__main__":
    main()
