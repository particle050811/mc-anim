# 取材 mod（mcai）

让 AI（或你自己）在命令行里操纵 Minecraft 取材：摆机位、冻结世界、截图、放方块再撤销，把一块地方导出成三维网格。
漫剧《机械动力应力转动》里的场景、比例、地形都是用它从游戏里取的。

由两部分组成：

- **mod**（`src/`）：Forge 1.20.1 的 mod。客户端里开一个只监听本机的 HTTP 接口（默认 `127.0.0.1:25590`），接下面这些动作；
  装在服务端上时只管世界生成：把暮色森林的地标网格放大 4 倍、把远古城市铺大到约 4 倍宽、给主世界提供生成时修整地形用的密度函数。
- **`mcai`**：单文件 Python 命令行（只用标准库），调这个接口，也管游戏外的事：启停游戏、看日志、复制存档、编译安装。

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

游戏窗口默认藏起来、锁住鼠标键盘，不抢前台；`mcai input on` 放开给人操作。
一个实例一个端口，几个 AI 可以各开一个实例同时取材。完整的动作和参数用 `./mcai help` 看（游戏开着时从 mod 实时生成）。

## 要准备的

- 正版 Minecraft Java 版 1.20.1、Forge 1.20.1-47.4.10；
- [Prism Launcher](https://prismlauncher.org/)：`mcai` 用它的实例启停游戏，实例放在仓库根下 `game/实例/<实例名>/`（默认实例叫 `取材客户端`）；
- JDK 17（编译 mod），Python 3.10 以上；
- 和取材世界一致的模组：版本、下载地址、sha256 见 `参考模型库/工具/取材/模组清单.json`，`python3 取材/下载.py` 能下载其中大部分。

> 目前只在 macOS（Apple Silicon）上用过。`mcai` 里 Prism 和 JDK 的路径在 Mac 上默认用 Homebrew 的（`/opt/homebrew/...`），
> 别的位置用环境变量 `MCAI_PRISM`（Prism 启动器）、`MCAI_JAVA_HOME`（JDK 17）指定；Windows 的分支写了但还没跑过（缺 `gradlew.bat`）。

## 用法

```sh
cd 取材mod
./mcai build                                     # 编译，装进所有实例和 game/取材服务端*/ 的 mods/
./mcai game copyworld name=片场 from=<世界>        # 把取材服务端生成的世界复制成存档「片场」，只改复制品
./mcai game start world=片场                      # 起游戏、直接进存档，等到能接命令

./mcai cam pos=264,100,488 pitch=90 yaw=180 dim=twilightforest:twilight_forest
./mcai freeze
./mcai shoot out=俯视.png size=3840x2160
./mcai mesh from=-40,0,195 to=56,95,270 out=../参考模型库/src/模型/场景/巫妖塔.网格
./mcai fill from=250,1,490 to=262,12,500 block=minecraft:gold_block
./mcai undo
./mcai game stop                                 # 忘了也行，空闲 30 分钟自己存档退出
```

第一次构建要下载 Gradle、Forge 并反混淆 Minecraft，要几分钟；编译要用到暮色森林的 jar（从 `game/取材服务端/mods/` 读）。

## 数据包（服务端用）

`数据包/` 下三个数据包，要和 mod 一起装才生效，建新世界时放进世界的 `datapacks/`（`参考模型库/工具/游戏取材/取材服务端.py --new` 会自动放）：

- `暮色放大4倍`：暮色森林的群系放大 4 倍，mod 把首领地标的网格跟着放大，地标不会挤在一起；
- `古城放大4倍`：远古城市铺大到约 4 倍宽，mod 放开原版拼图 8 区块的上限；
- `主世界修整`：在史诗地形（Epic Terrain）之上按区域改地形（`mcai:region`、`mcai:edit` 两种密度函数），海、群系、树照常由游戏生成。
  史诗地形的密度函数原文不随仓库分发，要从它的 zip 里取，见 `数据包/主世界修整/说明.md`。

## 生成地形包

漫剧的远景地形（暮色森林、主世界）是用取材服务端生成世界、再烘焙成「区段包」读进渲染的。地形包约 2.1 GB，不进 Git，挂在仓库的 GitHub Release 上，
**只想渲染的话直接下载就行**：`python3 取材/下载发布附件.py`（校验后解压到数据根的 `渲染/区段包/<名>/<版本>/`，数据根默认是仓库根下 `数据/`，见仓库根下 README「场景网格和地形包」）。

想从头自己生成（进阶），大致步骤如下（命令都在仓库根下执行，细节和踩过的坑见 [手册.md](手册.md)），烘焙出的包自动写成数据根下的新版本，并登记进 `参考模型库/src/lib/体素/区段包版本.json`：

1. **服务端**：`python3 取材/下载.py` 下载 Forge 安装器和模组，用安装器在 `game/取材服务端/` 装好 Forge 1.20.1-47.4.10 服务端，
   再复制一份 `game/取材服务端-主世界/` 给主世界用（史诗地形只装在这一份里）。预生成用的 [Chunky](https://modrinth.com/plugin/chunky) 放进服务端的 `预生成模组/`。
   `./mcai build` 把 mcai 装进两个服务端。
2. **暮色森林**（种子 1752，第 1 场用）：
   ```sh
   python3 参考模型库/工具/游戏取材/取材服务端.py --world 暮色放大-1752 --new --seed 1752 --twilight-x4
   python3 参考模型库/工具/游戏取材/取材服务端.py --world 暮色放大-1752 --pregen chunky \
     'chunky world twilightforest:twilight_forest' 'chunky corners -13191 -2887 -935 7192' 'chunky start' \
     'wait:Task finished for twilightforest:twilight_forest'
   cd 参考模型库 && npm run 导入:暮色放大1752扩展
   ```
3. **主世界**（种子 116，第 2、3 场用）：
   ```sh
   python3 参考模型库/工具/游戏取材/取材服务端.py --server 取材服务端-主世界 --world 主世界-116 --new --seed 116 --no-structures
   ```
   按 `参考模型库/工具/游戏取材/主世界范围.py` 的三批（岛、边城、航线）用 `预生成看守.py` 预生成，然后：
   ```sh
   cd 参考模型库
   npm run 导入:主世界116
   npm run 远景:主世界-116 && npm run 远景:中层 && npm run 远景:细带
   ```

预生成要几个小时、十几 GB 硬盘。同一个种子、同一版模组和数据包生成的地形是一样的，所以生成出来的和成片里的是同一片地。

> 这一步还没有一键脚本，上面的范围也还没在全新环境里从头核对过；暮色森林第 1 场用的预生成范围比上面的矩形更大，见 `参考模型库/工具/游戏取材/暮色范围.py`。

## 许可

MIT（见仓库根下 `LICENSE`）。mod 里不带 Minecraft 和其他模组的代码、资源；`数据包/主世界修整` 里史诗地形的那几份密度函数要自己取得。
