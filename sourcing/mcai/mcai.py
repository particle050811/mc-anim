#!/usr/bin/env python3
"""mcai：取材 mod 的命令行。只用标准库。

  mcai <动作> key=value ...     调游戏里的动作（游戏要开着）；mcai help 列出全部动作
  mcai cmd <命令原文>           执行游戏命令，后面整段都是命令，不用写 command=
  mcai batch '<动作 k=v ...>' '<动作 k=v ...>'   按顺序执行多步，算一次 undo
  mcai input on|off             默认 off：游戏窗口隐藏、鼠标键盘不生效；on：显示窗口，人自己进去操作
  mcai meta <截图.png>          读截图里存的机位、FOV、时间、天气

  mcai game start [world=<存档>|server=<地址>] [offline=<玩家名>] [timeout=300] [idle=30]
                                空闲 idle 分钟没收到 mcai 请求，游戏自己存档退出（默认 30，0 不自动退出；input on 期间不算）
  mcai game stop | status | log [n=40]
  mcai game instances           列出所有实例：端口、是否在运行、开着哪个存档
  mcai game newinstance name=<实例名> [from=取材客户端]   复制出一个新实例（同一批模组，另一个端口），给另一个 Agent 用
  mcai game copyworld name=<存档名> from=<世界> [overwrite=1]   把世界复制成片场存档；from 写取材服务端下的世界名，或世界目录的路径
  mcai build                    编译 mod 并装进所有实例和取材服务端的 mods/（游戏开着的话要重启才生效）
  mcai server stop server=<服务端目录名|路径> [timeout=300]
                                停取材服务端：走 RCON 发 stop、等它存完盘退出；没开 RCON 时 Mac/Linux 发 SIGTERM（Forge 收到也会存盘退出）

多个 Agent 同时取材：一个 Agent 一个实例，互不影响（各有各的镜头、世界、撤销栈）。
  MCAI_INSTANCE=<实例名> mcai ...   所有子命令都对这个实例生效（默认 取材客户端）
几个 Agent 共用一个实例也行，动作会排队一个个做；要保证“摆机位 + 截图”不被别人插队，写进同一个 batch。

只读环境变量，不推算本机路径（在 stress-rotation 仓库里用 sr mcai，按 sr 配置传）：
  MCAI_GAME 游戏环境目录（实例/、取材服务端*/）；MCAI_PRISM Prism 启动器（不给就在 PATH 上找）；MCAI_JAVA_HOME JDK 17（不给就用 PATH 上的 java）
  MCAI_MOD_DIR mod 工程（默认本文件旁的 ../mod）；MCAI_TIME_LOG 耗时记录（不给就只打到 stderr）
  MCAI_ONE_CLIENT=1 已有别的实例的游戏开着就不再起（两个客户端同时开会抢内存显存）
"""
import json, os, re, shlex, shutil, signal, socket, struct, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

IS_MAC = sys.platform == "darwin"
IS_WINDOWS = sys.platform == "win32"
DEFAULT_PORT = 25590  # 和 mod 里 HttpApi.DEFAULT_PORT 一致
MOD_DIR = Path(os.environ.get("MCAI_MOD_DIR") or Path(__file__).resolve().parent.parent / "mod")


def game_root():
    if not os.environ.get("MCAI_GAME"):
        sys.exit("要设环境变量 MCAI_GAME：游戏环境目录（里面有 实例/、取材服务端/）。在 stress-rotation 仓库里用 sr mcai，按配置 SR_GAME 传")
    return Path(os.path.abspath(os.environ["MCAI_GAME"]))


def default_prism():
    """Prism Launcher：MCAI_PRISM > PATH 上的 prismlauncher > Windows 的默认安装位置。"""
    if os.environ.get("MCAI_PRISM"):
        return os.environ["MCAI_PRISM"]
    found = shutil.which("prismlauncher")
    if found:
        return found
    if IS_WINDOWS:
        p = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local")) / "Programs/PrismLauncher/prismlauncher.exe"
        if p.exists():
            return str(p)
    sys.exit("找不到 Prism Launcher：设 MCAI_PRISM（sr 配置 SR_PRISM）")


def default_java_home():
    """编译 1.20.1 的 mod 必须 JDK 17：MCAI_JAVA_HOME > PATH 上的 java。不读 JAVA_HOME：作者机器上 JAVA_HOME 是 JDK 8。"""
    if os.environ.get("MCAI_JAVA_HOME"):
        return os.environ["MCAI_JAVA_HOME"]
    java = shutil.which("java")
    return str(Path(java).resolve().parents[1]) if java else ""


def java_major(java_home):
    """JDK 主版本号（跑 bin/java -version，1.8 算 8），跑不起来返回 0。Homebrew 的 JAVA_HOME 根下没有 release 文件，所以不读它。"""
    java = Path(java_home) / "bin" / ("java.exe" if IS_WINDOWS else "java")
    try:
        out = subprocess.run([str(java), "-version"], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
    except OSError:
        return 0
    m = re.search(r'version "(\d+)(?:\.(\d+))?', out)
    if not m:
        return 0
    return int(m.group(2) or 0) if m.group(1) == "1" else int(m.group(1))


ROOT = Path(os.environ["MCAI_GAME"]).absolute() if os.environ.get("MCAI_GAME") else None
INSTANCE = os.environ.get("MCAI_INSTANCE", "取材客户端")
INSTANCES_DIR = ROOT / "实例" if ROOT else Path("实例")
INSTANCE_DIR = INSTANCES_DIR / INSTANCE
MC_DIR = INSTANCE_DIR / ".minecraft"
PRISM_LOG = INSTANCES_DIR / f"prism-{INSTANCE}.out"
SERVER_DIR = ROOT / "取材服务端" if ROOT else Path("取材服务端")
TIME_LOG = Path(os.environ["MCAI_TIME_LOG"]) if os.environ.get("MCAI_TIME_LOG") else None  # 每个动作、每次启停游戏花了多久，一行一条


# ---------- 平台差异：只有这几处分 macOS / Windows（Windows 分支没实测过） ----------

class PidLock:
    """独占锁：O_EXCL 建 <名>.lock、里面写 pid，放锁就是删掉；持有的进程死了、或空文件放了 10 秒以上算过期。
    和 sr 资源闸（pipeline/闸/锁.ts）同一套协议：回收过期锁时先改名成只有自己知道的临时名，确认改走的还是那把死锁才删，否则改回去。拿不到就等。"""

    def __init__(self, path):
        self.path = Path(path)

    @staticmethod
    def _read(path):
        try:
            text = path.read_text(encoding="utf-8").strip()
            return (int(text) if text.isdigit() else None), path.stat().st_mtime
        except FileNotFoundError:
            return None

    @staticmethod
    def _stale(seen):
        pid, mtime = seen
        return time.time() - mtime > 10 if pid is None else not pid_alive(pid)

    def _reclaim(self, dead_pid):
        tmp = self.path.with_name(f"{self.path.name}.过期-{os.getpid()}-{os.urandom(4).hex()}")
        try:
            os.rename(self.path, tmp)
        except FileNotFoundError:
            return  # 别人先改走了
        now = self._read(tmp)
        if not (now and now[0] == dead_pid and self._stale(now)):
            try:
                os.link(tmp, self.path)  # 改走的是别人刚建的新锁：改回原名，原名上又有了新锁就不覆盖
            except FileExistsError:
                pass
        tmp.unlink(missing_ok=True)

    def __enter__(self):
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(f"{os.getpid()}\n")
                return self
            except FileExistsError:
                pass
            seen = self._read(self.path)
            if seen is None:
                continue
            if self._stale(seen):
                self._reclaim(seen[0])
            else:
                time.sleep(0.5)

    def __exit__(self, *exc):
        seen = self._read(self.path)
        if seen and seen[0] == os.getpid():
            self.path.unlink(missing_ok=True)


def pid_alive(pid):
    if IS_WINDOWS:
        return any(p == pid for p, _ in process_list())
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def process_list():
    """[(pid, 命令行)]；Windows 上命令行里的反斜杠换成 /，好按 实例/<名>/natives 认。"""
    if IS_WINDOWS:
        out = subprocess.run(["powershell", "-NoProfile", "-Command",
                              "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
                              "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"],
                             capture_output=True, text=True, encoding="utf-8").stdout
    else:
        out = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, encoding="utf-8").stdout
    rows = []
    for line in out.splitlines():
        pid, _, cmd = line.strip().partition(" ")
        if pid.isdigit():
            rows.append((int(pid), cmd.replace("\\", "/") if IS_WINDOWS else cmd))
    return rows


def terminate(pid):
    if IS_WINDOWS:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        os.kill(pid, signal.SIGTERM)


def detached_popen_kwargs():
    """新会话起进程：mcai 退出、终端关掉后游戏继续跑。"""
    if IS_WINDOWS:
        return {"creationflags": subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


def front_app():
    """当前最前面的应用：(pid, 应用包路径)。lsappinfo 不需要辅助功能权限。只有 macOS 管前台，别的系统返回 (0, "")。"""
    if not IS_MAC:
        return 0, ""
    asn = subprocess.run(["lsappinfo", "front"], capture_output=True, text=True, encoding="utf-8").stdout.strip()
    out = subprocess.run(["lsappinfo", "info", "-only", "pid", "-only", "bundlepath", asn], capture_output=True, text=True, encoding="utf-8").stdout
    info = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    return int(info.get('"pid"', "0") or 0), info.get('"LSBundlePath"', "").strip('"')


def activate_app(path):
    """把前台还给某个应用（对已经在运行的应用，open 只是把它激活）。"""
    if IS_MAC:
        subprocess.run(["open", path])


def log_time(what, secs, ok):
    """耗时打到 stderr（不混进 stdout 的 JSON），给了 MCAI_TIME_LOG 就追加进去。"""
    print(f"[耗时] {what}：{secs:.1f} 秒", file=sys.stderr)
    if TIME_LOG is None:
        return
    TIME_LOG.parent.mkdir(parents=True, exist_ok=True)
    new = not TIME_LOG.exists()
    with open(TIME_LOG, "a", encoding="utf-8") as f:
        if new:
            f.write("时间\t实例\t动作\t秒\t成功\n")
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{INSTANCE}\t{what}\t{secs:.1f}\t{'是' if ok else '否'}\n")


def port_of(instance):
    """实例的接口端口：写在实例的 config/mcai.port 里（mod 启动时读同一个文件），没有这个文件就是默认端口。"""
    f = INSTANCES_DIR / instance / ".minecraft" / "config" / "mcai.port"
    return int(f.read_text(encoding="utf-8").strip()) if f.is_file() else DEFAULT_PORT


PORT = port_of(INSTANCE) if ROOT else DEFAULT_PORT


class NotRunning(Exception):
    pass


def call(action, args=None, timeout=600, port=None):
    """POST /动作名。游戏没开（连不上）抛 NotRunning。"""
    body = json.dumps({"args": args or {}, "cwd": os.getcwd()}).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{port or PORT}/{action}", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, ConnectionError) as e:
        raise NotRunning(str(e))


def parse_kv(tokens):
    args = {}
    for t in tokens:
        if "=" not in t:
            sys.exit(f"参数要写成 key=value，收到的是：{t}")
        k, v = t.split("=", 1)
        args[k] = v
    return args


def parse_action(tokens):
    """['cam', 'pos=1,2,3'] → ('cam', {...})。cmd 特殊：命令本身带空格和等号，整段原样当命令。"""
    name, rest = tokens[0], tokens[1:]
    if name == "cmd" and not (len(rest) == 1 and rest[0].startswith("command=")):
        return name, {"command": " ".join(rest)}
    if name == "input" and rest and "=" not in rest[0]:
        return name, {"state": rest[0]}  # mcai input on / off
    return name, parse_kv(rest)


def show(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def run_action(tokens):
    if tokens[0] == "batch":
        # 每一步是一个带引号的参数，里面再按 shell 规则拆词；步骤里的双引号（NBT 字符串）要写成 \"
        name, args = "batch", {"steps": []}
        for step in tokens[1:]:
            a, kv = parse_action(shlex.split(step))
            args["steps"].append({"action": a, "args": kv})
    else:
        name, args = parse_action(tokens)
    # input on 会把游戏窗口带到前台；记下当时的前台应用，input off 藏起窗口后把前台还给它
    # （否则前台会停在一个没有窗口的 java 上）
    remembered = INSTANCE_DIR / "mcai-front-app"
    if name == "input" and args.get("state") == "on" and front_app()[0] not in processes()[0]:
        remembered.write_text(front_app()[1], encoding="utf-8")
    t0 = time.time()
    try:
        reply = call(name, args)
        log_time(name if name != "batch" else "batch(" + ",".join(s["action"] for s in args["steps"]) + ")", time.time() - t0, reply["ok"])
    except NotRunning:
        sys.exit("连不上实例「%s」的游戏（127.0.0.1:%d）。游戏没开或还在启动：mcai game status / mcai game start world=<存档>" % (INSTANCE, PORT))
    if not reply["ok"]:
        sys.exit("失败：" + reply["error"])
    if name == "input" and args.get("state") == "off" and remembered.exists() and front_app()[0] in processes()[0]:
        activate_app(remembered.read_text(encoding="utf-8"))
    if name == "help":
        print_help(reply["result"])
    else:
        show(reply["result"])
        # 命令本身执行失败（语法错、目标不存在）也算失败，方便脚本判断
        if name == "cmd" and not reply["result"]["success"]:
            sys.exit(1)


def print_help(actions):
    where = {"CLIENT": "客户端线程", "SERVER": "服务端线程，需单人世界", "HTTP": "自行调度"}
    for a in actions:
        print(f"{a['name']}  —  {a['doc']}  [{where[a['where']]}{'，可 undo' if a['changesWorld'] else ''}]")
        for p in a["params"]:
            print(f"    {p['name']}=<{p['format']}>{'  必填' if p['required'] else ''}  {p['doc']}")
    print("\n游戏外的子命令（game start/stop/status/log/copyworld、build、meta）见 mcai --help")


# ---------- 游戏外：启停、日志、构建 ----------

def processes(instance=None):
    """返回 (游戏 java 进程 pid 列表, 为这个实例起的 Prism 进程 pid 列表)。靠命令行里的实例路径认。"""
    instance = instance or INSTANCE
    game, prism = [], []
    for pid, cmd in process_list():
        if f"实例/{instance}/natives" in cmd:
            game.append(pid)
        # 实例名按整个参数比：「取材客户端」不能把「取材客户端2」的 Prism 也认成自己的
        elif "prismlauncher" in cmd.lower().replace(" ", "") and f"--launch {instance} " in cmd + " ":
            prism.append(pid)
    return game, prism


def try_ready():
    try:
        return call("ready", timeout=5)["result"]
    except (NotRunning, TimeoutError, OSError):
        return None


def give_front_back(previous):
    """游戏或 Prism 抢到了前台，就把前台还给被抢之前的那个应用；返回“现在该记住的前台应用”。
    用户自己切到别的应用时不干预，只更新记录。"""
    pid, path = front_app()
    game, prism = processes()
    if pid not in game + prism:
        return path or previous
    if previous:
        activate_app(previous)
    return previous


def game_start(opts):
    if not INSTANCE_DIR.is_dir():
        sys.exit(f"没有实例「{INSTANCE}」。mcai game instances 看现有的，mcai game newinstance name={INSTANCE} 新建")
    # 两个 Agent 同时对同一个实例 start：后到的等前一个启动完，再走下面“已经在运行”的判断，不会起出两个游戏
    with PidLock(INSTANCE_DIR / "mcai-start.lock"):
        game_start_locked(opts)


def game_start_locked(opts):
    game, _ = processes()
    if game:
        r = try_ready()
        running = call("state")["result"]["world"] if r and r["inWorld"] else None
        if running and running == opts.get("world"):
            print(f"实例「{INSTANCE}」已经开着存档「{running}」，直接用")
            return
        sys.exit(f"实例「{INSTANCE}」的游戏已经在运行（pid {game[0]}，存档：{running or '未进入世界'}）。"
                 f"可能是别的 Agent 在用：要同时取材就另开一个实例（mcai game newinstance），确定要换存档才 mcai game stop")
    # 空闲自动退出的分钟数只管这一次启动：给了 idle 就写进 config/mcai.idle（mod 启动时读），
    # 没给就删掉，回到 mod 里的默认值（IdleQuit.DEFAULT_MINUTES），免得上次的设置留下来
    idle_file = MC_DIR / "config" / "mcai.idle"
    if "idle" in opts:
        idle_file.write_text(f"{int(opts['idle'])}\n", encoding="utf-8")
    else:
        idle_file.unlink(missing_ok=True)
    if os.environ.get("MCAI_ONE_CLIENT") == "1" and not game:
        others = [n for n in instances() if n != INSTANCE and processes(n)[0]]
        if others:
            sys.exit(f"实例「{others[0]}」的游戏还开着，两个客户端不能同时开：先 MCAI_INSTANCE={others[0]} mcai game stop")
    cmd = [default_prism(), "--launch", INSTANCE]
    if "world" in opts:
        if not (MC_DIR / "saves" / opts["world"]).is_dir():
            have = sorted(p.name for p in (MC_DIR / "saves").iterdir() if p.is_dir())
            sys.exit(f"实例里没有存档「{opts['world']}」。现有：{have or '无'}。用 mcai game copyworld name=... from=<世界> 复制一个")
        cmd += ["--world", opts["world"]]
    if "server" in opts:
        cmd += ["--server", opts["server"]]
    if "offline" in opts:
        cmd += ["--offline", opts["offline"]]
    in_world = "world" in opts or "server" in opts
    # 不抢前台：记下现在最前面的应用。游戏进程启动时 macOS 会把它激活、窗口会闪出来一下
    # （mod 要等加载到自己才能把窗口藏起来），这段时间里每 0.3 秒看一眼，被抢了就还回去
    _, previous = front_app()
    with open(PRISM_LOG, "w", encoding="utf-8") as log:
        subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **detached_popen_kwargs())
    deadline = time.time() + float(opts.get("timeout", 300))
    last, next_check = None, 0
    while time.time() < deadline:
        time.sleep(0.3)
        previous = give_front_back(previous)
        if time.time() < next_check:
            continue
        next_check = time.time() + 2
        r = try_ready()
        if r is None:
            state = "游戏启动中，接口还没起来"
        elif r["ready"] or (not in_world and r["atMenu"]):
            if "world" in opts:
                # 片场默认一直晴天：下雨时满屏雨丝挡画面，还明显拖慢渲染。剧情要雨再 mcai cmd execute in minecraft:overworld run weather rain，
                # 天气循环关着，设了就不会自己变；重启游戏会回到晴天
                call("cmd", {"command": "gamerule doWeatherCycle false"})
                # 天气存在主世界里，别的维度只是跟着读，所以要指到主世界去设（在暮色森林里直接 weather clear 不生效）
                call("cmd", {"command": "execute in minecraft:overworld run weather clear"})
            print("就绪：" + ("已进入世界" if r["inWorld"] else "停在标题界面（没指定 world/server）")
                  + "。窗口是隐藏的、输入是锁定的，要自己进游戏操作用 mcai input on")
            return
        elif r.get("screen", {}).get("titleKey") == "selectWorld.backupQuestion.experimental":
            # 带模组维度（暮色森林）的世界第一次在客户端打开，会问“实验性设置不受支持，是否继续”。
            # 片场存档都是从服务端世界复制来的，必然碰到，而且只改复制品，直接替用户点“继续”（每个存档只问一次）
            call("click", {"index": "0"})
            state = "已自动确认“实验性设置”提示"
        elif r.get("screen", {}).get("titleKey") == "datapackFailure.title":
            # 世界里的数据包读不进来，多半是这个实例的 mcai 不认得主世界的修整包（mcai:region、mcai:edit）。
            # 这个界面上的「安全模式」只用原版数据：史诗地形和修整都被丢掉，之后补生成的区块是原版地形，存档也记成只开原版数据包。
            # 绝不能替用户点，也不往下等
            sys.exit(f"实例「{INSTANCE}」打不开这个存档：数据包读不进来（游戏停在“数据包错误”界面，千万别点安全模式）。"
                     f"多半是 mods/ 里的 mcai 不含生成时修整：mcai game stop，再 mcai build 后重开。原因见 mcai game log")
        else:
            state = r["why"]
            if "screen" in r and r["screen"]["buttons"]:
                state += f"，按钮：{r['screen']['buttons']}（mcai click text=...）"
        if state != last:
            print(state, flush=True)
            last = state
    sys.exit(f"等了 {opts.get('timeout', 300)} 秒还没就绪（{last}）。mcai game log 看日志；卡在界面上用 mcai click / mcai closescreen")


def game_stop():
    game, prism = processes()
    if not game and not prism:
        print("游戏没在运行")
        return
    try:
        call("quit", timeout=5)  # 走游戏自己的退出流程，存档能正常保存
    except (NotRunning, TimeoutError, OSError):
        pass
    deadline = time.time() + 60
    while time.time() < deadline and processes()[0]:
        time.sleep(1)
    game, prism = processes()
    # 接口不通（卡在加载、崩溃对话框）或一分钟没退干净，才直接结束进程；游戏退了以后 Prism 的壳也一并收掉
    for pid in game + prism:
        terminate(pid)
    time.sleep(2 if game or prism else 0)
    left = processes()
    print("已停止" if not (left[0] or left[1]) else f"还有进程没退：{left}")


def game_status():
    game, prism = processes()
    print(f"实例：{INSTANCE}；游戏进程：{game or '无'}；Prism 进程：{prism or '无'}")
    r = try_ready()
    if r is None:
        print(f"接口 127.0.0.1:{PORT}：连不上")
        return
    print("接口：通；" + ("就绪" if r["ready"] else "未就绪：" + r["why"]))
    if r["inWorld"]:
        show(call("state")["result"])


def instances():
    return sorted(p.name for p in INSTANCES_DIR.iterdir() if (p / ".minecraft" / "mods").is_dir())


def game_instances():
    for name in instances():
        port = port_of(name)
        line = f"{name}  端口 {port}  "
        if not processes(name)[0]:
            print(line + "没在运行")
            continue
        try:
            r = call("ready", timeout=5, port=port)["result"]
            line += "运行中，存档：" + call("state", timeout=5, port=port)["result"]["world"] if r["inWorld"] else "运行中，未进入世界"
        except (NotRunning, TimeoutError, OSError):
            line += "运行中，接口连不上（还在启动？）"
        print(line)
    print("\n用某个实例：MCAI_INSTANCE=<实例名> mcai ...")


def game_newinstance(opts):
    if "name" not in opts:
        sys.exit("要给实例名：mcai game newinstance name=取材客户端2")
    src, dst = INSTANCES_DIR / opts.get("from", "取材客户端"), INSTANCES_DIR / opts["name"]
    if not (src / "instance.cfg").is_file():
        sys.exit(f"{src} 不是 Prism 实例")
    if dst.exists():
        sys.exit(f"实例「{opts['name']}」已存在")
    # 模组和配置照抄（约 150MB）；存档、日志不带，片场存档各实例自己 copyworld
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("saves", "logs", "crash-reports", "mcai-start.lock", "mcai-front-app", "mcai.port"))
    (dst / ".minecraft" / "saves").mkdir()
    cfg = (dst / "instance.cfg").read_text(encoding="utf-8").splitlines()
    (dst / "instance.cfg").write_text("\n".join(f"name={opts['name']}" if l.startswith("name=") else l for l in cfg) + "\n", encoding="utf-8")
    used = {port_of(n) for n in instances()}
    port = next(p for p in range(DEFAULT_PORT + 1, DEFAULT_PORT + 100) if p not in used)
    (dst / ".minecraft" / "config" / "mcai.port").write_text(f"{port}\n", encoding="utf-8")
    print(f"已建实例「{opts['name']}」，端口 {port}。接着：\n"
          f"  MCAI_INSTANCE={opts['name']} mcai game copyworld name=片场 from=<世界>\n"
          f"  MCAI_INSTANCE={opts['name']} mcai game start world=片场")


def game_log(opts):
    path = MC_DIR / "logs" / "latest.log"
    lines = path.read_text(errors="replace", encoding="utf-8").splitlines()
    print("\n".join(lines[-int(opts.get("n", 40)):]))


def game_copyworld(opts):
    if "name" not in opts:
        sys.exit("要给存档名：mcai game copyworld name=片场 from=<世界>")
    # 来源必须显式写：取材服务端下有旧 world 和换真实地貌后新建的世界（2026-10-04），默认来源配上 overwrite=1 会把片场悄悄换成别的世界
    if "from" not in opts:
        have = sorted(d.name for d in SERVER_DIR.iterdir() if (d / "level.dat").is_file())
        sys.exit(f"要给来源：from=<取材服务端下的世界名，或世界目录的路径>。取材服务端现有世界：{have or '无'}")
    src = (Path(opts["from"]) if "/" in opts["from"] else SERVER_DIR / opts["from"]).resolve()
    dst = MC_DIR / "saves" / opts["name"]
    if not (src / "level.dat").is_file():
        sys.exit(f"{src} 不是世界目录（没有 level.dat）")
    if dst.exists():
        if opts.get("overwrite") != "1":
            sys.exit(f"存档「{opts['name']}」已存在；确定要重置成原世界就加 overwrite=1")
        shutil.rmtree(dst)
    # 片场只改复制品，原世界不动；session.lock 是原世界的占用标记，不能带过来
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("session.lock"))
    print(f"已复制 {src} → {dst}\n进游戏：mcai game start world={opts['name']}")


def build():
    java_home = default_java_home()
    if java_major(java_home) < 17:
        sys.exit(f"编译要 JDK 17，现在的是 {java_home or '（没找到 java）'}：设 MCAI_JAVA_HOME（sr 配置 SR_JAVA_HOME）")
    env = dict(os.environ, JAVA_HOME=java_home, MCAI_GAME=str(game_root()))
    gradlew = str(MOD_DIR / "gradlew.bat") if IS_WINDOWS else str(MOD_DIR / "gradlew")
    r = subprocess.run([gradlew, "build", "--console=plain", "-q"], cwd=MOD_DIR, env=env)
    if r.returncode != 0:
        sys.exit("编译失败")
    jar = max((MOD_DIR / "build" / "libs").glob("mcai-*.jar"), key=lambda p: p.stat().st_mtime)
    # 所有实例都装同一版：实例之间只差端口和存档
    for name in instances():
        mods = INSTANCES_DIR / name / ".minecraft" / "mods"
        for old in mods.glob("mcai-*.jar"):
            old.unlink()
        shutil.copy2(jar, mods / jar.name)
        print(f"已安装 {jar.name} → {mods}")
        if processes(name)[0]:
            print(f"实例「{name}」的游戏正开着，要 mcai game stop 再 start 才会用上新版本")
    # 每个取材服务端（暮色的 取材服务端、主世界的 取材服务端-主世界）也装同一版：暮色放大 4 倍的世界由服务端预生成、客户端的集成服务端补生成，
    # 两边的地标网格必须一致（见 MANUAL.md「暮色森林放大 4 倍」）；读方块碰上调色板扩容就重读的修复对哪个世界的预生成都要有
    for server_mods in sorted(ROOT.glob("取材服务端*/mods")):
        for old in server_mods.glob("mcai-*.jar"):
            old.unlink()
        shutil.copy2(jar, server_mods / jar.name)
        print(f"已安装 {jar.name} → {server_mods}（服务端开着的话要重启才会用上）")


# ---------- 取材服务端 ----------

def server_dir(opts):
    if "server" not in opts:
        sys.exit("要给服务端：server=取材服务端（MCAI_GAME 下的目录名）或服务端目录的路径")
    d = Path(opts["server"]) if ("/" in opts["server"] or "\\" in opts["server"]) else ROOT / opts["server"]
    if not (d / "server.properties").is_file():
        sys.exit(f"{d} 不是服务端目录（没有 server.properties）")
    return d.resolve()


def server_properties(d):
    props = {}
    for line in (d / "server.properties").read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            props[k.strip()] = v.strip()
    return props


def rcon_command(port, password, command, timeout=10):
    """RCON 协议（Source RCON）：登录包 type 3，命令包 type 2；返回服务端回的文本。"""
    def packet(req_id, kind, body):
        payload = struct.pack("<ii", req_id, kind) + body.encode("utf-8") + b"\0\0"
        return struct.pack("<i", len(payload)) + payload

    def read(sock):
        head = b""
        while len(head) < 4:
            chunk = sock.recv(4 - len(head))
            if not chunk:
                raise ConnectionError("RCON 连接断了")
            head += chunk
        (length,) = struct.unpack("<i", head)
        data = b""
        while len(data) < length:
            chunk = sock.recv(length - len(data))
            if not chunk:
                raise ConnectionError("RCON 连接断了")
            data += chunk
        req_id, _ = struct.unpack("<ii", data[:8])
        return req_id, data[8:-2].decode("utf-8", errors="replace")

    with socket.create_connection(("127.0.0.1", port), timeout=timeout) as sock:
        sock.sendall(packet(1, 3, password))
        if read(sock)[0] == -1:
            raise PermissionError("RCON 密码不对")
        sock.sendall(packet(2, 2, command))
        try:
            return read(sock)[1]
        except (ConnectionError, socket.timeout):
            return ""  # stop 时服务端可能不回就断开


def server_pids(d):
    """在这个目录里跑的 Forge 服务端 java 进程。Forge 的启动参数里没有目录，按进程的工作目录认。"""
    pids = []
    for pid, cmd in process_list():
        if "unix_args.txt" not in cmd and "win_args.txt" not in cmd:
            continue
        if sys.platform.startswith("linux"):
            try:
                cwd = os.readlink(f"/proc/{pid}/cwd")
            except OSError:
                continue
        elif IS_MAC:
            out = subprocess.run(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"], capture_output=True, text=True, encoding="utf-8").stdout
            cwd = next((row[1:] for row in out.splitlines() if row.startswith("n")), "")
        else:
            continue  # Windows 上读不到别的进程的工作目录，只能走 RCON
        if cwd and Path(cwd).resolve() == d:
            pids.append(pid)
    return pids


def server_stop(opts):
    d = server_dir(opts)
    props = server_properties(d)
    timeout = float(opts.get("timeout", 300))
    pids = server_pids(d)
    if props.get("enable-rcon") == "true":
        try:
            rcon_command(int(props.get("rcon.port", "25575")), props.get("rcon.password", ""), "stop")
            print("已经 RCON 发了 stop，等它存完盘退出", flush=True)
        except OSError as e:
            if not pids:
                print(f"服务端没在运行（RCON 连不上：{e}）")
                return
            print(f"RCON 连不上（{e}），改发 SIGTERM", flush=True)
            sigterm(pids)
    elif not pids:
        print(f"服务端 {d.name} 没在运行" + ("" if not IS_WINDOWS else "（Windows 上没开 RCON 认不出进程）"))
        return
    else:
        sigterm(pids)
    # 不强杀：没存盘的区块会丢，预生成的进度却可能已记过它们
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not (server_pids(d) if pids else rcon_alive(props)):
            print("已停止")
            return
        time.sleep(2)
    sys.exit(f"等了 {timeout:.0f} 秒服务端还没退，没有强杀（会丢没存盘的区块）；看 {d / 'logs' / 'latest.log'}")


def sigterm(pids):
    if IS_WINDOWS:
        sys.exit("Windows 上停服务端要开 RCON（server.properties 里 enable-rcon=true、设 rcon.password）")
    for pid in pids:
        os.kill(pid, signal.SIGTERM)
    print(f"已发 SIGTERM 给 {pids}（Forge 收到会存盘退出），等它退出", flush=True)


def rcon_alive(props):
    try:
        with socket.create_connection(("127.0.0.1", int(props.get("rcon.port", "25575"))), timeout=2):
            return True
    except OSError:
        return False


def meta(path):
    """读 shoot 写进 PNG 的 iTXt 文本块（关键字 mcai）。"""
    data = Path(path).read_bytes()
    pos = 8
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        if kind == b"iTXt" and chunk.startswith(b"mcai\0"):
            show(json.loads(chunk[len("mcai") + 5:].decode()))
            return
        pos += 12 + length
    sys.exit("这张图里没有 mcai 的元数据（不是 shoot 拍的）")


def main():
    argv = sys.argv[1:]
    if argv[:1] == ["game"] and argv[1:2] and argv[1] in ("start", "stop"):
        t0, ok = time.time(), True
        try:
            dispatch(argv)
        except SystemExit as e:
            ok = e.code in (None, 0)
            raise
        finally:
            log_time("game " + argv[1], time.time() - t0, ok)
        return
    dispatch(argv)


def dispatch(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    if argv[0] != "meta":
        game_root()  # 别的子命令都要游戏环境
    if argv[0] == "game":
        sub = argv[1] if len(argv) > 1 else ""
        opts = parse_kv(argv[2:])
        if sub == "start":
            game_start(opts)
        elif sub == "stop":
            game_stop()
        elif sub == "status":
            game_status()
        elif sub == "log":
            game_log(opts)
        elif sub == "instances":
            game_instances()
        elif sub == "newinstance":
            game_newinstance(opts)
        elif sub == "copyworld":
            game_copyworld(opts)
        else:
            sys.exit("用法：mcai game start|stop|status|log|copyworld|instances|newinstance")
    elif argv[0] == "build":
        build()
    elif argv[0] == "server":
        if argv[1:2] != ["stop"]:
            sys.exit("用法：mcai server stop server=<服务端目录名|路径> [timeout=300]")
        server_stop(parse_kv(argv[2:]))
    elif argv[0] == "meta":
        meta(argv[1])
    else:
        run_action(argv)


if __name__ == "__main__":
    main()
