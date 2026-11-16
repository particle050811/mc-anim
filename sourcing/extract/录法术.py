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
FORMAT = "mcai-录制/1"
DEFAULT_INSTANCE = "取材客户端-诡厄"


# ---------- 开游戏录 ----------

def mcai(*args, read_output=True, tolerate_errors=False):
    env = dict(os.environ)
    env.setdefault("MCAI_INSTANCE", DEFAULT_INSTANCE)
    r = subprocess.run([sys.executable, str(MCAI), *args], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        if tolerate_errors:
            return None
        sys.exit(f"mcai {' '.join(args)} 失败：{(r.stderr or r.stdout).strip()}")
    if not read_output:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return r.stdout


def send_command(c):
    out = mcai("cmd", c)
    if isinstance(out, dict) and not out.get("success", True):
        sys.exit(f"命令没成功：{c}\n{out.get('output')}")
    return out


def wait_for_chunks(x, y, z, timeout_sec=30):
    """tp 过去之后等这一格所在区块加载（fill、summon 要区块在）"""
    t0 = time.time()
    while time.time() - t0 < timeout_sec:
        out = mcai("cmd", f"execute in minecraft:overworld if loaded {x} {y} {z}", tolerate_errors=True)
        if isinstance(out, dict) and out.get("success"):
            return
        time.sleep(0.5)
    sys.exit(f"等了 {timeout_sec} 秒，{x} {y} {z} 所在区块还没加载")


def record(spell, out_path, distance, tick, hold_ticks, seed, radius, staff, focus, arena, work_root):
    if not mcai("ready").get("result", {}).get("inWorld", True):
        sys.exit("游戏没进世界：先 MCAI_INSTANCE=取材客户端-诡厄 anim mcai game start world=法术录制")
    send_command("gamemode creative")
    # game start 进存档默认冻结。摆场、清场要世界在动（被 kill 的生物要 tick 完死亡动画才消失），整段解冻，最后照原样冻回去
    was_frozen = mcai("state").get("frozen", False)
    mcai("unfreeze")
    try:
        _record(spell, out_path, distance, tick, hold_ticks, seed, radius, staff, focus, arena, work_root)
    finally:
        if was_frozen:
            time.sleep(2)  # 死亡动画 20 刻
            mcai("freeze")


def _record(spell, out_path, distance, tick, hold_ticks, seed, radius, staff, focus, arena, work_root):
    x0, y0, z0 = arena
    raw_path = Path(out_path).with_suffix(".原始.json")
    for c in ("gamerule doMobSpawning false", "gamerule doDaylightCycle false", "gamerule doWeatherCycle false",
              "gamerule doFireTick false", "gamerule mobGriefing false", "time set 6000", "weather clear"):
        send_command(c)
    cx, cz = x0 + 0.5, z0 + 0.5
    send_command(f"execute in minecraft:overworld run tp @s {cx} {y0} {cz} -90 0")
    wait_for_chunks(x0 + 24, y0, z0 + 24)
    wait_for_chunks(x0 - 24, y0, z0 - 24)
    mcai("cmd", f"kill @e[type=!minecraft:player,x={cx},y={y0},z={cz},distance=..48]", tolerate_errors=True)  # 没有可杀的也算失败
    # fill 一格都没改（第二次录、本来就是空气）也报失败，不看结果
    mcai("cmd", f"execute in minecraft:overworld run fill {x0 - 24} {y0 - 1} {z0 - 24} {x0 + 24} {y0 - 1} {z0 + 24} minecraft:smooth_stone", tolerate_errors=True)
    for y_offset in (0, 8):
        mcai("cmd", f"execute in minecraft:overworld run fill {x0 - 24} {y0 + y_offset} {z0 - 24} {x0 + 24} {y0 + y_offset + 7} {z0 + 24} minecraft:air", tolerate_errors=True)
    tx = cx + distance
    send_command(f"execute in minecraft:overworld run summon minecraft:husk {tx} {y0} {cz} "
         '{NoAI:1b,Silent:1b,PersistenceRequired:1b,Rotation:[90f,0f],Tags:["mcai_target"],'
         'Attributes:[{Name:"generic.max_health",Base:1000d}],Health:1000f}')
    # 眼睛看着目标身子中间（尸壳 1.95 高）
    send_command(f"execute in minecraft:overworld run tp @s {cx} {y0} {cz} facing {tx} {y0 + 1.0} {cz}")
    mcai("hold", f"item={staff}", f"inner={focus}")
    params = [f"out={raw_path}", f"ticks={tick}", f"radius={radius}", f"target={tx},{y0},{cz}", "use=1", "pre=10", f"seed={seed}",
         f"note=诡厄法术 {spell}：{staff} 装 {focus}，目标尸壳在东边 {distance} 格"]
    if hold_ticks is not None:
        params.append(f"hold={hold_ticks}")
    r = mcai("record", *params)
    print(json.dumps(r, ensure_ascii=False))
    mcai("cmd", f"kill @e[type=!minecraft:player,x={cx},y={y0},z={cz},distance=..48]", tolerate_errors=True)  # 没有可杀的也算失败
    raw = json.loads(Path(raw_path).read_text(encoding="utf-8"))
    if not any(e.get("名") == "CastMagicEvent" and e.get("服务端") for e in raw["事件"]) and not raw["粒子"]:
        sys.exit(f"没录到施法（没有 CastMagicEvent、也没有粒子）：法术冷却中、聚晶 id 不对或者法杖不认这个学派？原始录制在 {raw_path}")
    final = organize(raw, spell, work_root, {"法杖": staff, "聚晶": focus, "距离": distance, "种子": seed})
    write_file(out_path, final)
    Path(raw_path).unlink()
    print_summary(final)


# ---------- 整理 ----------

def scene_from_pos(p):
    """游戏 (x, y 竖直, z 南) → 场景 (x 东, y 北, z 上)"""
    return (p[0], -p[2], p[1])


def round_to(x, n=4):
    v = round(x, n)
    return 0 if v == 0 else v


def texture_asset_id(texture_name):
    ns, _, path = texture_name.partition(":")
    if ns == "minecraft":
        return f"贴图/特效/粒子/{path}"
    return f"贴图/法术/{ns}/particle/{path}"


def organize(raw, spell=None, work_root=None, extra=None):
    if raw.get("格式") != "mcai-录制-原始/1":
        raise SystemExit(f"不认识的原始录制格式：{raw.get('格式')}")
    caster = raw["施法者"]
    O = scene_from_pos(caster["脚"])
    if raw.get("目标"):
        T = scene_from_pos(raw["目标"])
        fx, fy = T[0] - O[0], T[1] - O[1]
    else:
        yaw = math.radians(caster["yaw"])
        fx, fy = -math.sin(yaw), -math.cos(yaw)  # 游戏朝向 (−sin yaw, cos yaw) 换成场景
        T = None
    n = math.hypot(fx, fy) or 1
    fx, fy = fx / n, fy / n
    rx, ry = fy, -fx
    # 前方向的游戏 yaw（度）：游戏里 yaw 0 朝南（+z），90 朝西；场景前 (fx, fy) = 游戏 (fx, −fy)
    forward_yaw = math.degrees(math.atan2(-fx, -fy))

    def to_local(p):
        s = scene_from_pos(p)
        d = (s[0] - O[0], s[1] - O[1], s[2] - O[2])
        return [round_to(d[0] * fx + d[1] * fy), round_to(d[0] * rx + d[1] * ry), round_to(d[2])]

    def local_speed(v):
        s = scene_from_pos(v)
        return [round_to(s[0] * fx + s[1] * fy, 6), round_to(s[0] * rx + s[1] * ry, 6), round_to(s[2], 6)]

    def local_angle(a):
        return round_to(((a - forward_yaw + 180) % 360) - 180, 3)

    # 出手：服务端 CastMagicEvent 之后第一个粒子、声音那一刻；没有施法事件就取按下右键那刻
    cast_ticks = [e["刻"] for e in raw["事件"] if e.get("名") == "CastMagicEvent" and e.get("服务端")]
    cast_tick = raw.get("按下刻", 0)
    if cast_ticks:
        m = cast_ticks[0]
        after_ticks = [p["生"] for p in raw["粒子"] if p["生"] >= m] + [s["刻"] for s in raw["声音"] if s["刻"] >= m]
        cast_tick = min(after_ticks) if after_ticks else m
    cast_tick = max(cast_tick, 0)

    texture_names = raw["贴图名"]
    particles = []
    by_class = {}
    for p in raw["粒子"]:
        i = p["实例"]
        # 改写了 render 的，录制时替它画过：每刻都只画一个方片的照普通方片回放（轨里的大小、颜色已是画出来的）
        self_drawn = p["自画网格"] and not (p.get("改写render仍是方片") and not p.get("网格轨"))
        mesh = [[r[0] - cast_tick, *[v for k in range(int(r[1])) for v in (*to_local(r[2 + k * 9:5 + k * 9]), *(round_to(x) for x in r[5 + k * 9:11 + k * 9]))]] for r in p.get("网格轨", [])]
        track = [[*to_local(r[:3]), round_to(r[3], 5), round_to(r[4]), round_to(r[5]), round_to(r[6]), round_to(r[7]), round_to(r[8], 5), int(r[9])] for r in p["轨"]]
        if not track:
            continue  # 出生那刻就被删掉的（没进快照）
        particles.append({
            "类型": p["类型"], "类": p["类"].rsplit(".", 1)[-1], "画法": p["画法"], "自画网格": self_drawn,
            "生": p["生"] - cast_tick, "寿命": i["寿命"], "半边长": round_to(i.get("半边长", 0), 5), "重力": round_to(i["重力"], 5), "摩擦": round_to(i["摩擦"], 5),
            "碰撞": i["碰撞"], "色": [round_to(c) for c in i["色"]], "位": to_local(i["位"]), "速": local_speed(i["速"]),
            **({"参数": p["参数"]} if p.get("参数") else {}), "轨": track, **({"网格轨": mesh} if mesh else {}),
        })
        k = by_class.setdefault(p["类型"] + "|" + p["类"], {"类型": p["类型"], "类": p["类"], "画法": p["画法"], "自画网格": self_drawn, "数量": 0, "贴图": set()})
        k["数量"] += 1
        k["贴图"].update(texture_names[int(r[9])] for r in p["轨"] if r[9] >= 0)
    entity_list = []
    for e in raw["实体"]:
        track = [[*to_local(r[:3]), local_angle(r[3]), round_to(r[4], 3), local_angle(r[5]), local_angle(r[6])] for r in e["轨"]]
        entity_list.append({"类型": e["类型"], "类": e["类"].rsplit(".", 1)[-1], "生": e["生"] - cast_tick, "灭": (e["灭"] - cast_tick) if e["灭"] >= 0 else None,
                   "宽": e["宽"], "高": e["高"], "目标": "mcai_target" in (e.get("nbt") or ""), **({"nbt": e["nbt"]} if e.get("nbt") else {}), "轨": track})
    sounds = [{"刻": s["刻"] - cast_tick, "事件": s["事件"], **({"文件": s["文件"]} if s.get("文件") else {}), "类别": s["类别"],
           "位": [0, 0, 0] if s.get("相对") else to_local(s["位"]), "相对": s.get("相对", False),
           "音量": round_to(s.get("音量", s.get("实际音量", 1))), "音高": round_to(s.get("音高", s.get("实际音高", 1)))} for s in raw["声音"]]
    events = [{**e, "刻": e["刻"] - cast_tick} for e in raw["事件"]]
    for e in events:
        e.pop("施法者", None)

    class_summaries = sorted(by_class.values(), key=lambda k: -k["数量"])
    registered = set()
    if work_root:
        for texture_name in texture_names:
            id = texture_asset_id(texture_name)
            if (Path(work_root) / "资产锁" / f"{id}.json").is_file() or (Path(__file__).resolve().parents[2] / "assets" / "资产锁" / f"{id}.json").is_file():
                registered.add(texture_name)
    summary = {
        "粒子数": len(particles),
        "按类型": [{**{k: v for k, v in c.items() if k != "贴图"}, "贴图": sorted(c["贴图"])} for c in class_summaries],
        "自画网格（回放照录下的顶点画）": sorted({f'{p["类型"]}（{p["类"]}）' for p in particles if p["自画网格"] and p.get("网格轨")}),
        "自画网格没录到顶点（回放跳过）": sorted({f'{p["类型"]}（{p["类"]}）' for p in particles if p["自画网格"] and not p.get("网格轨")}),
        "实体（回放只画占位）": [f'{e["类型"]}（{e["类"]}，{e["生"]}～{e["灭"]} 刻）' for e in entity_list if not e["目标"]],
        "声音": [f'{s["刻"]} 刻 {s["事件"]}' for s in sounds],
        "半径外没记的粒子": raw.get("半径外没记的粒子", {}),
    }
    if work_root:
        summary["没登记的贴图"] = [n for n in texture_names if n not in registered]
    ticks_after_cast = raw["刻数"] - cast_tick
    return {
        "格式": FORMAT,
        **({"法术": spell} if spell else {}),
        **(extra or {}),
        "说明": raw.get("说明", ""),
        "坐标": "场景局部坐标（Z 朝上）：原点 = 施法者脚底，前 = 施法者到目标的水平方向，右 = 前 × 上，上 = 竖直，单位格；刻从出手算（出手前是负的）；角度是相对前方向的游戏 yaw（度）",
        "刻数": ticks_after_cast,
        "出手刻": cast_tick,
        "施法者": {"眼高": round_to(caster["眼"][1] - caster["脚"][1]), **({"目标": to_local(raw["目标"])} if raw.get("目标") else {}), "轨": [[*to_local(r[:3]), local_angle(r[3]), round_to(r[4], 3)] for r in caster["轨"]]},
        "粒子设置": raw.get("粒子设置"),
        "贴图名": texture_names,
        "贴图资产": [texture_asset_id(n) for n in texture_names],
        "摘要": summary,
        "粒子": particles,
        "实体": entity_list,
        "声音": sounds,
        "事件": events,
        "轨列": {"粒子": ["前", "右", "上", "半边长", "r", "g", "b", "a", "转角", "贴图"], "实体": ["前", "右", "上", "yaw", "pitch", "头yaw", "身yaw"], "施法者": ["前", "右", "上", "yaw", "pitch"],
                "网格轨": "每行：刻, 然后每个顶点 9 个数 前, 右, 上, u, v（贴图格内 0～1）, r, g, b, a；连续 4 个顶点一个方片"},
    }


def write_file(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # 一行一个粒子：好 diff，又不至于一个数一行
    json_text = json.dumps({k: v for k, v in data.items() if k not in ("粒子", "实体")}, ensure_ascii=False, indent=1)[:-2]
    for section_key in ("粒子", "实体"):
        json_text += f',\n "{section_key}": [\n' + ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in data[section_key]) + "\n ]"
    Path(path).write_text(json_text + "\n}\n", encoding="utf-8")


def print_summary(d):
    s = d["摘要"]
    print(f"出手刻 {d['出手刻']}，出手后 {d['刻数']} 刻；粒子 {s['粒子数']} 颗")
    for c in s["按类型"]:
        print(f"  {c['类型']}  {c['类'].rsplit('.', 1)[-1]}  {c['画法']}{'  自画网格' if c['自画网格'] else ''}  ×{c['数量']}  贴图 {len(c['贴图'])} 张")
    for k in ("自画网格（回放照录下的顶点画）", "自画网格没录到顶点（回放跳过）", "实体（回放只画占位）", "声音", "没登记的贴图"):
        if s.get(k):
            print(f"{k}：" + "；".join(s[k]))


def get_opts(argv, option_name, default=None, convert=str):
    if option_name in argv:
        i = argv.index(option_name)
        v = argv[i + 1]
        del argv[i:i + 2]
        return convert(v)
    return default


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    work_root = get_opts(argv, "--作品根")
    if argv[0] == "--整理":
        spell = get_opts(argv, "--法术")
        raw = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        d = organize(raw, spell, work_root)
        write_file(argv[2], d)
        print_summary(d)
        return
    distance = get_opts(argv, "--距离", 12.0, float)
    tick = get_opts(argv, "--刻", 100, int)
    hold_ticks = get_opts(argv, "--按住", None, int)
    seed = get_opts(argv, "--种子", 1, int)
    radius = get_opts(argv, "--半径", 32.0, float)
    staff = get_opts(argv, "--法杖", "goety:nether_staff")
    arena = tuple(int(v) for v in get_opts(argv, "--场地", "2000,200,2000").split(","))
    spell, out_path = argv[0], argv[1]
    focus = get_opts(argv, "--聚晶", f"goety:{spell}_focus")
    record(spell, out_path, distance, tick, hold_ticks, seed, radius, staff, focus, arena, work_root)


if __name__ == "__main__":
    main()
