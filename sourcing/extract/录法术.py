#!/usr/bin/env python3
"""在开着的取材客户端里放一发诡厄法术、录下粒子、实体、声音，整理成回放用的录制资产（docs/决策/0016-法术录制.md）。只用标准库。

用法（anim extract 按 sourcing/extract.录制.toml 在暂存目录里调；游戏要先开着：MCAI_INSTANCE=取材客户端-诡厄 anim mcai game start world=法术录制）：
  python 录法术.py <法术注册名> <输出.json> [--距离 12] [--刻 100] [--按住 <刻>] [--种子 1] [--半径 32] [--法杖 goety:nether_staff]
                   [--聚晶 goety:<名>_focus] [--场地 2000,200,2000] [--作品根 <目录>]
  python 录法术.py --整理 <原始.json> <输出.json> [--法术 <名>] [--作品根 <目录>]   只整理一份已经录好的原始录制（不开游戏，测试、重整用）

做法：在场地（主世界高空一块 49×49 平台，四周清空）上，施法者站在场地中心、面朝东边 距离 格外的目标（不动、不出声的尸壳），
主手拿法杖装好聚晶，mcai record 第 10 刻按一下右键（蓄力、引导的按住到不再使用或 --按住 刻），录 --刻 刻。
录完清掉目标和场地上生出来的实体。法术冷却中（同一个法术刚放过）会放不出来，脚本报错。

整理：原始录制是游戏坐标（y 朝上），整理成场景坐标的局部坐标（Z 朝上）：原点 = 施法者脚底，前 = 施法者到目标的水平方向，
右 = 前 × 上，上 = 竖直；刻号改成从出手算（出手前的蓄力粒子是负的）。回放组件按画面里的施法者、目标两点摆回去。
"""
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

MCAI = Path(__file__).resolve().parent.parent / "mcai" / "mcai.py"
格式 = "mcai-录制/1"
默认实例 = "取材客户端-诡厄"


# ---------- 开游戏录 ----------

def mcai(*args, 读=True, 容错=False):
    env = dict(os.environ)
    env.setdefault("MCAI_INSTANCE", 默认实例)
    r = subprocess.run([sys.executable, str(MCAI), *args], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        if 容错:
            return None
        sys.exit(f"mcai {' '.join(args)} 失败：{(r.stderr or r.stdout).strip()}")
    if not 读:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return r.stdout


def 命令(c):
    out = mcai("cmd", c)
    if isinstance(out, dict) and not out.get("success", True):
        sys.exit(f"命令没成功：{c}\n{out.get('output')}")
    return out


def 等区块(x, y, z, 秒=30):
    """tp 过去之后等这一格所在区块加载（fill、summon 要区块在）"""
    t0 = time.time()
    while time.time() - t0 < 秒:
        out = mcai("cmd", f"execute in minecraft:overworld if loaded {x} {y} {z}", 容错=True)
        if isinstance(out, dict) and out.get("success"):
            return
        time.sleep(0.5)
    sys.exit(f"等了 {秒} 秒，{x} {y} {z} 所在区块还没加载")


def 录(法术, 输出, 距离, 刻, 按住, 种子, 半径, 法杖, 聚晶, 场地, 作品根):
    x0, y0, z0 = 场地
    原始 = Path(输出).with_suffix(".原始.json")
    if not mcai("ready").get("result", {}).get("inWorld", True):
        sys.exit("游戏没进世界：先 MCAI_INSTANCE=取材客户端-诡厄 anim mcai game start world=法术录制")
    命令("gamemode creative")
    mcai("unfreeze")
    for c in ("gamerule doMobSpawning false", "gamerule doDaylightCycle false", "gamerule doWeatherCycle false",
              "gamerule doFireTick false", "gamerule mobGriefing false", "time set 6000", "weather clear"):
        命令(c)
    cx, cz = x0 + 0.5, z0 + 0.5
    命令(f"execute in minecraft:overworld run tp @s {cx} {y0} {cz} -90 0")
    等区块(x0 + 24, y0, z0 + 24)
    等区块(x0 - 24, y0, z0 - 24)
    mcai("cmd", f"kill @e[type=!minecraft:player,x={cx},y={y0},z={cz},distance=..48]", 容错=True)  # 没有可杀的也算失败
    # fill 一格都没改（第二次录、本来就是空气）也报失败，不看结果
    mcai("cmd", f"execute in minecraft:overworld run fill {x0 - 24} {y0 - 1} {z0 - 24} {x0 + 24} {y0 - 1} {z0 + 24} minecraft:smooth_stone", 容错=True)
    for 低 in (0, 8):
        mcai("cmd", f"execute in minecraft:overworld run fill {x0 - 24} {y0 + 低} {z0 - 24} {x0 + 24} {y0 + 低 + 7} {z0 + 24} minecraft:air", 容错=True)
    tx = cx + 距离
    命令(f"execute in minecraft:overworld run summon minecraft:husk {tx} {y0} {cz} "
         '{NoAI:1b,Silent:1b,PersistenceRequired:1b,Rotation:[90f,0f],Tags:["mcai_target"],'
         'Attributes:[{Name:"generic.max_health",Base:1000d}],Health:1000f}')
    # 眼睛看着目标身子中间（尸壳 1.95 高）
    命令(f"execute in minecraft:overworld run tp @s {cx} {y0} {cz} facing {tx} {y0 + 1.0} {cz}")
    mcai("hold", f"item={法杖}", f"inner={聚晶}")
    参 = [f"out={原始}", f"ticks={刻}", f"radius={半径}", f"target={tx},{y0},{cz}", "use=1", "pre=10", f"seed={种子}",
         f"note=诡厄法术 {法术}：{法杖} 装 {聚晶}，目标尸壳在东边 {距离} 格"]
    if 按住 is not None:
        参.append(f"hold={按住}")
    r = mcai("record", *参)
    print(json.dumps(r, ensure_ascii=False))
    mcai("cmd", f"kill @e[type=!minecraft:player,x={cx},y={y0},z={cz},distance=..48]", 容错=True)  # 没有可杀的也算失败
    raw = json.loads(Path(原始).read_text(encoding="utf-8"))
    if not any(e.get("名") == "CastMagicEvent" and e.get("服务端") for e in raw["事件"]) and not raw["粒子"]:
        sys.exit(f"没录到施法（没有 CastMagicEvent、也没有粒子）：法术冷却中、聚晶 id 不对或者法杖不认这个学派？原始录制在 {原始}")
    最终 = 整理(raw, 法术, 作品根, {"法杖": 法杖, "聚晶": 聚晶, "距离": 距离, "种子": 种子})
    写(输出, 最终)
    Path(原始).unlink()
    打摘要(最终)


# ---------- 整理 ----------

def 场景(p):
    """游戏 (x, y 竖直, z 南) → 场景 (x 东, y 北, z 上)"""
    return (p[0], -p[2], p[1])


def 圆(x, n=4):
    v = round(x, n)
    return 0 if v == 0 else v


def 贴图资产(名):
    ns, _, path = 名.partition(":")
    if ns == "minecraft":
        return f"贴图/特效/粒子/{path}"
    return f"贴图/法术/{ns}/particle/{path}"


def 整理(raw, 法术=None, 作品根=None, 附=None):
    if raw.get("格式") != "mcai-录制-原始/1":
        raise SystemExit(f"不认识的原始录制格式：{raw.get('格式')}")
    施 = raw["施法者"]
    O = 场景(施["脚"])
    if raw.get("目标"):
        T = 场景(raw["目标"])
        fx, fy = T[0] - O[0], T[1] - O[1]
    else:
        yaw = math.radians(施["yaw"])
        fx, fy = -math.sin(yaw), -math.cos(yaw)  # 游戏朝向 (−sin yaw, cos yaw) 换成场景
        T = None
    n = math.hypot(fx, fy) or 1
    fx, fy = fx / n, fy / n
    rx, ry = fy, -fx
    # 前方向的游戏 yaw（度）：游戏里 yaw 0 朝南（+z），90 朝西；场景前 (fx, fy) = 游戏 (fx, −fy)
    yaw前 = math.degrees(math.atan2(-fx, -fy))

    def 局(p):
        s = 场景(p)
        d = (s[0] - O[0], s[1] - O[1], s[2] - O[2])
        return [圆(d[0] * fx + d[1] * fy), 圆(d[0] * rx + d[1] * ry), 圆(d[2])]

    def 局速(v):
        s = 场景(v)
        return [圆(s[0] * fx + s[1] * fy, 6), 圆(s[0] * rx + s[1] * ry, 6), 圆(s[2], 6)]

    def 局角(a):
        return 圆(((a - yaw前 + 180) % 360) - 180, 3)

    # 出手：服务端 CastMagicEvent 之后第一个粒子、声音那一刻；没有施法事件就取按下右键那刻
    施法刻 = [e["刻"] for e in raw["事件"] if e.get("名") == "CastMagicEvent" and e.get("服务端")]
    出手 = raw.get("按下刻", 0)
    if 施法刻:
        m = 施法刻[0]
        后 = [p["生"] for p in raw["粒子"] if p["生"] >= m] + [s["刻"] for s in raw["声音"] if s["刻"] >= m]
        出手 = min(后) if 后 else m
    出手 = max(出手, 0)

    贴图名 = raw["贴图名"]
    粒子 = []
    按类 = {}
    for p in raw["粒子"]:
        i = p["实例"]
        # 改写了 render 的，录制时替它画过：每刻都只画一个方片的照普通方片回放（轨里的大小、颜色已是画出来的）
        自画 = p["自画网格"] and not (p.get("改写render仍是方片") and not p.get("网格轨"))
        网格 = [[r[0] - 出手, *[v for k in range(int(r[1])) for v in (*局(r[2 + k * 9:5 + k * 9]), *(圆(x) for x in r[5 + k * 9:11 + k * 9]))]] for r in p.get("网格轨", [])]
        轨 = [[*局(r[:3]), 圆(r[3], 5), 圆(r[4]), 圆(r[5]), 圆(r[6]), 圆(r[7]), 圆(r[8], 5), int(r[9])] for r in p["轨"]]
        if not 轨:
            continue  # 出生那刻就被删掉的（没进快照）
        粒子.append({
            "类型": p["类型"], "类": p["类"].rsplit(".", 1)[-1], "画法": p["画法"], "自画网格": 自画,
            "生": p["生"] - 出手, "寿命": i["寿命"], "半边长": 圆(i.get("半边长", 0), 5), "重力": 圆(i["重力"], 5), "摩擦": 圆(i["摩擦"], 5),
            "碰撞": i["碰撞"], "色": [圆(c) for c in i["色"]], "位": 局(i["位"]), "速": 局速(i["速"]),
            **({"参数": p["参数"]} if p.get("参数") else {}), "轨": 轨, **({"网格轨": 网格} if 网格 else {}),
        })
        k = 按类.setdefault(p["类型"] + "|" + p["类"], {"类型": p["类型"], "类": p["类"], "画法": p["画法"], "自画网格": 自画, "数量": 0, "贴图": set()})
        k["数量"] += 1
        k["贴图"].update(贴图名[int(r[9])] for r in p["轨"] if r[9] >= 0)
    实体 = []
    for e in raw["实体"]:
        轨 = [[*局(r[:3]), 局角(r[3]), 圆(r[4], 3), 局角(r[5]), 局角(r[6])] for r in e["轨"]]
        实体.append({"类型": e["类型"], "类": e["类"].rsplit(".", 1)[-1], "生": e["生"] - 出手, "灭": (e["灭"] - 出手) if e["灭"] >= 0 else None,
                   "宽": e["宽"], "高": e["高"], "目标": "mcai_target" in (e.get("nbt") or ""), **({"nbt": e["nbt"]} if e.get("nbt") else {}), "轨": 轨})
    声音 = [{"刻": s["刻"] - 出手, "事件": s["事件"], **({"文件": s["文件"]} if s.get("文件") else {}), "类别": s["类别"],
           "位": [0, 0, 0] if s.get("相对") else 局(s["位"]), "相对": s.get("相对", False),
           "音量": 圆(s.get("音量", s.get("实际音量", 1))), "音高": 圆(s.get("音高", s.get("实际音高", 1)))} for s in raw["声音"]]
    事件 = [{**e, "刻": e["刻"] - 出手} for e in raw["事件"]]
    for e in 事件:
        e.pop("施法者", None)

    类表 = sorted(按类.values(), key=lambda k: -k["数量"])
    已登记 = set()
    if 作品根:
        for 名 in 贴图名:
            id = 贴图资产(名)
            if (Path(作品根) / "资产锁" / f"{id}.json").is_file() or (Path(__file__).resolve().parents[2] / "assets" / "资产锁" / f"{id}.json").is_file():
                已登记.add(名)
    摘要 = {
        "粒子数": len(粒子),
        "按类型": [{**{k: v for k, v in c.items() if k != "贴图"}, "贴图": sorted(c["贴图"])} for c in 类表],
        "自画网格（回放照录下的顶点画）": sorted({f'{p["类型"]}（{p["类"]}）' for p in 粒子 if p["自画网格"] and p.get("网格轨")}),
        "自画网格没录到顶点（回放跳过）": sorted({f'{p["类型"]}（{p["类"]}）' for p in 粒子 if p["自画网格"] and not p.get("网格轨")}),
        "实体（回放只画占位）": [f'{e["类型"]}（{e["类"]}，{e["生"]}～{e["灭"]} 刻）' for e in 实体 if not e["目标"]],
        "声音": [f'{s["刻"]} 刻 {s["事件"]}' for s in 声音],
        "半径外没记的粒子": raw.get("半径外没记的粒子", {}),
    }
    if 作品根:
        摘要["没登记的贴图"] = [n for n in 贴图名 if n not in 已登记]
    出手后刻数 = raw["刻数"] - 出手
    return {
        "格式": 格式,
        **({"法术": 法术} if 法术 else {}),
        **(附 or {}),
        "说明": raw.get("说明", ""),
        "坐标": "场景局部坐标（Z 朝上）：原点 = 施法者脚底，前 = 施法者到目标的水平方向，右 = 前 × 上，上 = 竖直，单位格；刻从出手算（出手前是负的）；角度是相对前方向的游戏 yaw（度）",
        "刻数": 出手后刻数,
        "出手刻": 出手,
        "施法者": {"眼高": 圆(施["眼"][1] - 施["脚"][1]), **({"目标": 局(raw["目标"])} if raw.get("目标") else {}), "轨": [[*局(r[:3]), 局角(r[3]), 圆(r[4], 3)] for r in 施["轨"]]},
        "粒子设置": raw.get("粒子设置"),
        "贴图名": 贴图名,
        "贴图资产": [贴图资产(n) for n in 贴图名],
        "摘要": 摘要,
        "粒子": 粒子,
        "实体": 实体,
        "声音": 声音,
        "事件": 事件,
        "轨列": {"粒子": ["前", "右", "上", "半边长", "r", "g", "b", "a", "转角", "贴图"], "实体": ["前", "右", "上", "yaw", "pitch", "头yaw", "身yaw"], "施法者": ["前", "右", "上", "yaw", "pitch"],
                "网格轨": "每行：刻, 然后每个顶点 9 个数 前, 右, 上, u, v（贴图格内 0～1）, r, g, b, a；连续 4 个顶点一个方片"},
    }


def 写(路径, 数据):
    Path(路径).parent.mkdir(parents=True, exist_ok=True)
    # 一行一个粒子：好 diff，又不至于一个数一行
    行 = json.dumps({k: v for k, v in 数据.items() if k not in ("粒子", "实体")}, ensure_ascii=False, indent=1)[:-2]
    for 键 in ("粒子", "实体"):
        行 += f',\n "{键}": [\n' + ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in 数据[键]) + "\n ]"
    Path(路径).write_text(行 + "\n}\n", encoding="utf-8")


def 打摘要(d):
    s = d["摘要"]
    print(f"出手刻 {d['出手刻']}，出手后 {d['刻数']} 刻；粒子 {s['粒子数']} 颗")
    for c in s["按类型"]:
        print(f"  {c['类型']}  {c['类'].rsplit('.', 1)[-1]}  {c['画法']}{'  自画网格' if c['自画网格'] else ''}  ×{c['数量']}  贴图 {len(c['贴图'])} 张")
    for k in ("自画网格（回放照录下的顶点画）", "自画网格没录到顶点（回放跳过）", "实体（回放只画占位）", "声音", "没登记的贴图"):
        if s.get(k):
            print(f"{k}：" + "；".join(s[k]))


def 选项(argv, 名, 默认=None, 转=str):
    if 名 in argv:
        i = argv.index(名)
        v = argv[i + 1]
        del argv[i:i + 2]
        return 转(v)
    return 默认


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    作品根 = 选项(argv, "--作品根")
    if argv[0] == "--整理":
        法术 = 选项(argv, "--法术")
        raw = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        d = 整理(raw, 法术, 作品根)
        写(argv[2], d)
        打摘要(d)
        return
    距离 = 选项(argv, "--距离", 12.0, float)
    刻 = 选项(argv, "--刻", 100, int)
    按住 = 选项(argv, "--按住", None, int)
    种子 = 选项(argv, "--种子", 1, int)
    半径 = 选项(argv, "--半径", 32.0, float)
    法杖 = 选项(argv, "--法杖", "goety:nether_staff")
    场地 = tuple(int(v) for v in 选项(argv, "--场地", "2000,200,2000").split(","))
    法术, 输出 = argv[0], argv[1]
    聚晶 = 选项(argv, "--聚晶", f"goety:{法术}_focus")
    录(法术, 输出, 距离, 刻, 按住, 种子, 半径, 法杖, 聚晶, 场地, 作品根)


if __name__ == "__main__":
    main()
