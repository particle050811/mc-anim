# 取材 mod（mcai）

让 AI（或你自己）在命令行里操纵 Minecraft 取材：摆机位、冻结世界、截图、放方块再撤销，把一块地方导出成三维网格。
漫剧《机械动力应力转动》里的场景、比例、地形都是用它从游戏里取的。

由两部分组成：

- **mod**（`src/`）：Forge 1.20.1 的 mod。客户端里开一个只监听本机的 HTTP 接口（默认 `127.0.0.1:25590`），接下面这些动作；
  装在服务端上时只管世界生成：把暮色森林的地标网格放大 4 倍、把远古城市铺大到约 4 倍宽、给主世界提供生成时修整地形用的密度函数。
- **`mcai`**（`sourcing/mcai/mcai.py`）：单文件 Python 命令行（只用标准库），调这个接口，也管游戏外的事：启停游戏、看日志、复制存档、编译安装、停服务端。
  本仓库里用 `anim mcai <动作…>` 调，anim 先过资源闸，再按 anim 配置把游戏环境、Prism、JDK 用 `MCAI_*` 环境变量传给它。

每个动作输出一行 JSON，失败时退出码非 0，适合脚本和 AI 调用。

## 能做什么

| 动作 | 作用 |
| --- | --- |
| `cam` | 摆机位：`pos` 加 `look`（看向的点）或 `yaw`/`pitch`，可选 `fov`、`roll`、`dim`（跨维度） |
| `shoot` | 截图存 PNG，分辨率和窗口大小无关（`size=3840x2160`）；机位、FOV、时间存进 PNG，`mcai meta` 读回 |
| `freeze` / `unfreeze` | 冻结、解冻世界 |
| `setblock` / `fill` / `undo` | 放方块、填长方体（没有 /fill 的 32768 格上限），可连续撤销 |
| `mesh` | 把一块区域导出成 `*.网格.json/.bin/.png`（几何 + 贴图图集），给 three.js 渲染 |
| `cmd` | 以最高权限执行任意游戏命令并返回输出 |
| `batch` | 几步按顺序执行，合成一次撤销（「摆机位 + 截图」不会被别人插队） |
| `ui` | 操作、截取游戏界面（透明底 PNG） |
| `biomes` / `blocks` | 导出群系色表（草、叶、水、天空、雾）和方块表（每个方块状态烘焙好的面、贴图、染色），模组和资源包的都带上；见 `docs/游戏导表.md` |

游戏窗口默认藏起来、锁住鼠标键盘，不抢前台；`mcai input on` 放开给人操作。
一个实例一个端口，几个 AI 可以各开一个实例同时取材。完整的动作和参数用 `anim mcai help` 看（游戏开着时从 mod 实时生成）。

## 要准备的

- 正版 Minecraft Java 版 1.20.1、Forge 1.20.1-47.4.10；
- [Prism Launcher](https://prismlauncher.org/)：`mcai` 用它的实例启停游戏，实例放在游戏环境目录（anim 配置 `ANIM_GAME`）的 `实例/<实例名>/`（默认实例叫 `取材客户端`）；
- JDK 17（编译 mod），Python 3.10 以上；
- 和取材世界一致的模组：版本、下载地址、sha256 见 `sourcing/jars.toml`（`anim world install-server` 按它装服务端）。

> 目前只在 macOS（Apple Silicon）上用过。`mcai` 只读环境变量：`MCAI_GAME`（游戏环境目录）、`MCAI_PRISM`（Prism 启动器，不给就在 PATH 上找）、
> `MCAI_JAVA_HOME`（JDK 17，不给就用 PATH 上的 java）；用 `anim mcai` 时这些由 anim 配置（`ANIM_GAME`、`ANIM_PRISM`、`ANIM_JAVA_HOME`）传。Windows 的分支写了但还没跑过。

## 用法

```sh
anim mcai build                                     # 编译，装进所有实例和 <游戏环境>/取材服务端*/ 的 mods/
anim mcai game copyworld name=片场 from=<世界>        # 把取材服务端生成的世界复制成存档「片场」，只改复制品
anim mcai game start world=片场                      # 起游戏、直接进存档，等到能接命令

anim mcai cam pos=264,100,488 pitch=90 yaw=180 dim=twilightforest:twilight_forest
anim mcai freeze
anim mcai shoot out=俯视.png size=3840x2160
anim mcai mesh from=-40,0,195 to=56,95,270 out=巫妖塔.网格
anim mcai fill from=250,1,490 to=262,12,500 block=minecraft:gold_block
anim mcai undo
anim mcai game stop                                 # 忘了也行，空闲 30 分钟自己存档退出
```

第一次构建要下载 Gradle、Forge 并反混淆 Minecraft，要几分钟；编译要用到暮色森林的 jar（从 `$MCAI_GAME/取材服务端/mods/` 读）。

## 数据包（服务端用）

`sourcing/datapacks/` 下 `主世界修整`、`古城放大4倍`、`暮色放大4倍` 三个数据包，要和 mod 一起装才生效，建新世界时放进世界的 `datapacks/`（`anim world new` 按世界声明放）：

- `暮色放大4倍`：暮色森林的群系放大 4 倍，mod 把首领地标的网格跟着放大，地标不会挤在一起；
- `古城放大4倍`：远古城市铺大到约 4 倍宽，mod 放开原版拼图 8 区块的上限；
- `主世界修整`：在史诗地形（Epic Terrain）之上按区域改地形（`mcai:region`、`mcai:edit` 两种密度函数），海、群系、树照常由游戏生成。
  史诗地形的密度函数原文不随仓库分发，要从它的 zip 里取，见 `sourcing/datapacks/主世界修整/说明.md`。

## 生成地形包

漫剧的地形（暮色森林、主世界）是用取材服务端生成世界、再烘焙成「区段包」读进渲染的。地形包不进 Git，挂在仓库的 GitHub Release 上，
**只想渲染的话直接下载就行**：`anim assets pull`（核过 sha 放进数据根的 `terrain/<包>/<版本>/`，见 `docs/决策/0006-挂Release发字节.md`）。

想从头自己生成：照世界声明（`sourcing/worlds/<世界>.toml`：种子、模组、数据包、预生成范围、烘焙范围）依次
`anim world install-server <世界>` → `anim world new <世界>` → `anim world pregen <世界> --执行` → `anim world bake <世界>`，`anim mcai build` 把 mcai 装进服务端。
用法见 `docs/世界.md`，各世界为什么这么建、踩过的坑见 [MANUAL.md](MANUAL.md)。预生成要几个小时、十几 GB 硬盘。
同一个种子、同一版模组和数据包生成的地形是一样的，所以生成出来的和成片里的是同一片地；不过现有世界声明还没在全新环境里从头生成核对过。

## 许可

MIT（见仓库根下 `LICENSE`）。mod 里不带 Minecraft 和其他模组的代码、资源；`sourcing/datapacks/主世界修整` 里史诗地形的那几份密度函数要自己取得。
