# 取材 mod（mcai）

让 AI 用命令行控制 Minecraft 取材：摆机位、截图存文件、冻结世界、放方块、撤销。
由两部分组成：

- **mod**（`src/`）：Forge 1.20.1-47.4.10 的 mod，在游戏里开一个只监听本机的 HTTP 接口 `127.0.0.1:25590`（每个实例一个端口，默认实例是 25590）。
  客户端和取材服务端都装：服务端上只管世界生成：给装了「暮色放大4倍」数据包的世界放大暮色森林的地标网格（见「暮色森林放大 4 倍」），
  给「古城放大4倍」放开拼图上限（见「古城放大 4 倍」），给「主世界修整」提供生成时修整用的两种密度函数（见「主世界生成时修整」）。
- **`mcai`**（`sourcing/mcai/mcai.py`）：单文件 Python 命令行（只用标准库），调这个接口，并负责游戏外的事：启停游戏、看日志、编译安装、停服务端。
  本仓库里用 `anim mcai <动作…>` 调：anim 先过资源闸（开游戏时），再把游戏环境、JDK 这些按 anim 配置用 `MCAI_*` 环境变量传给它。

文中 `game/…` 指游戏环境目录（anim 配置 `ANIM_GAME`，mcai 读 `MCAI_GAME`，默认是数据根的 `game/`）。
装服务端、建世界、预生成、烘焙成地形包都是 `anim world`（`docs/世界.md`），这里只记 mod 本身、各数据包为什么这么做、各世界是怎么定的。
文中 `参考模型库/…` 开头的工具（选种、修整实测、古城对比等）没搬，用户 10-31 定直接定制地形，要离线预览、核对时从退役 bundle 取。

游戏只用来取材（参考图、量尺寸），不是成片。主用法是单人世界：把取材服务端的世界（`game/取材服务端/<世界>`）复制成客户端实例里的“片场存档”，只改复制品。

## 典型用法

```sh
anim mcai build                                   # 编译并装进 game/实例/取材客户端/.minecraft/mods/
anim mcai game copyworld name=片场 from=<世界>       # 把 game/取材服务端/<世界> 复制成存档「片场」（from 必须写；已有则加 overwrite=1 重置）
anim mcai game start world=片场                    # 起游戏、直接进存档、等到可以接命令（约 30 秒）

anim mcai cam pos=264,100,488 pitch=90 yaw=180 dim=twilightforest:twilight_forest   # 娜迦庭院正上方俯视，画面上方朝北
anim mcai freeze                                   # 冻结世界
anim mcai cmd effect give @s night_vision infinite 0 true    # 暮色森林很暗，对照贴图先给夜视
anim mcai shoot out=<数据根>/run/草稿/<月日-时分>-工作-实机对照/俯视.png   # Agent 看的中间稿放 run/草稿
anim mcai batch "cam pos=222,52,548 look=264,0,488" "shoot out=<数据根>/run/草稿/<月日-时分>-工作-实机对照/斜视.png size=3840x2160"

anim mcai fill from=250,1,490 to=262,12,500 block=minecraft:gold_block
anim mcai undo                                     # 撤销上一步
anim mcai game stop                                # 正常退出游戏（会存档）。忘了也会在空闲 30 分钟后自己退，见「空闲自动退出」
```

`mcai help` 列出全部动作和参数（游戏开着时，从 mod 的注册表实时生成）；`mcai --help` 是游戏外子命令的说明。
每个动作的输出都是 JSON；失败时退出码非 0，并打印「失败：原因」。

## 取材服务端：两个服务端、数据包、预生成

`game/取材服务端/` 是无界面的 Forge 1.20.1 服务端，`mods/` 里会影响世界生成的模组和整合包一致（暮色森林、冰火、匠魂、机械动力、车万女仆、夸克 + Zeta），
只差 Lootr：它会把结构里的宝箱换成 Lootr 箱子，没装。整合包里其余没装的 Cloudertinker、twilight_construct、拔刀剑、Epic Fight、YSM、JEI 不碰世界生成。
能同时开几个看资源闸（用户 2026-10-04：资源允许就能开多少开多少，负载太大再一个一个来）。

- 主世界和暮色各建一个世界（各自的种子）：暮色世界在 `game/取材服务端/`；主世界在主世界专用服务端 `game/取材服务端-主世界/`（见下一节）。
  分成两个世界是因为结构开关（level.dat 里的 generate_features）一个世界只有一份、管所有维度：主世界要结构全禁，暮色的地标必须生成。
  旧的 `world/`（种子 20260930，普通世界类型）不动。
- 种子、世界类型、结构开关只在建世界那一次生效，建错了只能删掉重建。世界类型用 `minecraft:normal`：地形模组改的是普通世界的地形，
  巨型生物群系（`minecraft:large_biomes`）和 Tectonic 互斥，配上它会悄悄得到原版巨型群系的地形。
- 数据包在第一次启动前放进新世界的 `datapacks/`（世界声明的 `数据包`，`anim world new` 放）。`sourcing/datapacks/` 下：
  - `通用/不生成龙巢`（两个世界都放）：冰火的地表龙巢、龙穴洞穴不生成；
  - `只给主世界/主世界不生成人造地物`：关掉不归 generate-structures 管的人造 feature（原版沙漠水井、地牢，冰火独眼巨人洞、精灵村、塞壬岛、九头蛇洞、蚁巢、龙骨架）
    和冰火生成区块时直接刷生物的 5 个 feature（死亡蠕虫、海马、海蟒、铜羽泽鹗、游荡独眼巨人），清单和原因写在它的 `pack.mcmeta` 里；
  - `暮色放大4倍`、`古城放大4倍`、`主世界修整`：要和 mcai 一起装才生效，见下面各节。
- 停服先发 stop 等它存完盘。别用 `kill -9`：没存盘的区块会丢，Chunky 的进度却可能已经记过它们，`chunky continue` 会跳过，世界里留下空洞。
- **预生成用 Chunky**（`anim world pregen`）。Distant Horizons 的预生成不比 Chunky 快、硬盘也只省四分之一左右，而且 DH 在暮色生成黑暗之塔时会出错
  （`DarkTowerMainComponent.makeFurnacePillar` 往熔炉里放东西，DH 的 FEATURES 生成环境里拿不到熔炉的容器，抛 NPE），那几个区块的 features 整步没生成；
  看得到的范围、暮色地标附近一律用 Chunky。Chunky 和 DH 不能一起装，一起装启动必崩。
  Chunky 的任务进度按维度存在 `config/chunky/tasks/<维度>.properties`，不分世界，换世界之前要么跑完，要么 `chunky cancel`。
  2026-10-04 量的大小：Chunky 主世界约 42～57 MB/km²，暮色约 26～29 MB/km²。
- **复制成片场**：`anim mcai game copyworld name=片场 from=<世界名>`。from 写世界名就到 `game/取材服务端/` 下找，也可以写世界目录的路径
  （主世界写路径，如 `from=../game/取材服务端-主世界/<世界名>`）。数据包、DH 的远景数据库都在世界目录里，会一起带过去。
- 新世界里有夸克的方块，客户端没装夸克就打不开，所以客户端实例都装了和取材服务端同一版的 Quark-4.0-462、Zeta-1.0-31（jar 在 `game/缓存/mods/`）。
  `quark-common.toml`、`zeta-common.toml` 也从取材服务端的 `config/` 拷了过去，三处一字不差：夸克的世界生成开关都在 `quark-common.toml` 里，
  客户端的集成服务端补生成区块时要和服务端生成的对得上。以后改了服务端的夸克配置，同样拷给每个客户端实例。
  夸克的客户端模块（`[client]` 一节）照默认全开，其中 Greener Grass 会把草和树叶的颜色调绿（`color_matrix` 绿 ×1.11、红蓝 ×0.89），截图和 `mesh` 导出的草叶颜色跟着变。

## 主世界专用服务端和客户端

用户 2026-10-04 定（「按照你推荐的来」）：主世界用史诗地形 compatible 1.0.3（数据包形式、默认配置，不加群系 4 倍包），单独一个世界、单独的服务端和客户端实例。
地形模组只装在这一套里：装进 `取材服务端` 或旧客户端的话，旧世界和旧片场以后再生成的区块会混进新地形，接缝处对不上；暮色放大 4 倍也是在没装地形模组的前提下做的。

- 服务端 `game/取材服务端-主世界/`（从 `取材服务端` 复制、不带世界，端口 25598；暮色那个 25599，两个能同时开）。也装 mcai：读方块碰上调色板扩容就重读的修复、
  生成时修整都要它（没有就读不进修整包，服务端起不来）。`anim mcai build` 装进所有 `game/取材服务端*/mods/`。
- 史诗地形是数据包（`epicterrain_compatible1.20.zip`），不装进 mods/：放在服务端的 `世界数据包/`（`game/缓存/数据包/` 另留一份），建世界时拷进新世界。
  它的高度到 y511。数据包跟着世界走，客户端不用装；但修整包要 mcai 认得，打开这个世界的实例都要装含修整的 mcai。
- 客户端实例：`anim mcai game newinstance name=取材客户端-主世界`；拍远景要 DH 的再 `newinstance name=取材客户端-主世界-远景 from=取材客户端-远景`。
  片场用 `MCAI_INSTANCE=取材客户端-主世界 anim mcai game copyworld name=片场 from=../game/取材服务端-主世界/<世界名>`。
- 只能在这个服务端里建主世界：别处没装地形模组，建出来是原版地形。修整包的区域定稿以前别建正式的主世界：已经生成的区块不会跟着包变。
- 测试世界（都是种子 116、结构全禁）：`测试-种子116`（不带修整）、`测试-修整-种子116`（带修整，预生成了岛、切口、航线三块，结果见 `sourcing/datapacks/主世界修整/说明.md`「游戏核对」）、
  `测试-无修整对照-种子116`（对照）。

### 正式主世界 `主世界-116`（2026-10-05）

用户 2026-10-05 出门前说「按你推荐的来」：种子 116、结构全禁、带定稿的 `主世界修整`（扇面 30°～240° 那一版）；基地小岛中心 (39680, -1216)、基地 (39740, -1130)；
航线 岛 → 转弯点 (20438, -8567) → 边城 (8960, -5376)（城中心，城占地 480×400 米，北墙在 z 小的一侧）。2026-10-05 09:15 建。

- 预生成分三批（岛、边城、航线），按镜头的先后生成、每批烘一次，后面的镜头能先用上；范围、原点写在世界声明 `sourcing/worlds/主世界-116.toml`。
  三批合计 569976 个区块、145.9 km²，纯生成约 5 小时 40 分，12G 堆没满、没停服续跑过；速度主要看别的任务抢不抢 CPU（10～50 区块/秒）。
  更远的地形由远景那一路（离线算的高度图）兜底。
- 核对（存档和离线叠修整的定稿包逐列比最高实心方块）：岛 97.0%、离岛最近的航线段 97.1%、边城 97.5%、转弯点和第二段山区陆地 98.5%～98.8%，群系同一格一致 99.9%～100%；
  对不上的主要是海底雕刻器挖的沟和游戏放的地物（珊瑚块）。岛 82575 m²、东西 310 m、南北 344 m、y 62～72；基地 16×14 m 的地面 y 64～69，往东 51 m、往南 78 m 到海。
  边城一带平原 53%、森林 32%，没有冰雪。和测试世界同包的那块逐列一致，同种子同包生成出来的地形一样。

## 多个 Agent 同时用

- **共用一个实例（平时用这个）**：几个 Agent 对同一个游戏发命令，会动镜头、改世界、截图的动作排队一个个做，`help`、`ready`、`state` 不排队。
  镜头只有一个，所以“摆机位 + 截图”要写进同一个 `batch`（整个 batch 算一个动作，别人插不进来）；分两条命令发，中间可能被别人的 `cam` 挪走。
  冻结状态和撤销栈也是共用的：`undo` 撤的是最近一次改动，不管是谁做的。
  `game start world=片场` 在游戏已经开着同一个存档时直接复用；存档不同会拒绝。`game stop` 会把别人正在用的游戏也关掉，关之前确认没人在用。
- **一人一个实例**：`anim mcai game newinstance name=<实例名>` 复制出一个新实例（同一批模组，约 150MB，端口自动分配，写在实例的 `config/mcai.port`），
  之后所有子命令前加 `MCAI_INSTANCE=<实例名>`。各实例有各自的镜头、世界（各自 `copyworld`）、撤销栈。`anim mcai game instances` 列出所有实例的端口和状态。
  **两个客户端同时开（其中一个带 DH）吃不消**（2026-09-30：10 核的 1 分钟负载到 70，交换区用掉 5G）；`MCAI_ONE_CLIENT=1` 时已有别的实例开着就不再起。无界面服务端轻得多，按资源闸看负载。
- 现有实例：`取材客户端`（默认，日常取材）；`取材客户端-远景`（多装了 Distant Horizons 3.3.3，只在拍宏大远景时开，远景逐步生成、很吃 CPU）。
  远景实例刚启动的头十几秒，DH 还在把存好的远景一级级读进来，这时拍到的中景是粗色块；等一会儿再拍。
- 实例都装了夸克和 Zeta（见「取材服务端」一节最后一条），和优化模组 Embeddium 0.3.31、ModernFix 5.27.83、FerriteCore 6.0.1、Canary 0.3.3
  （窗口隐藏空转时 CPU 从约 2 个核降到约 0.3 个；截图、`mesh`、DH 都正常）。`newinstance` 会一起带上，`anim mcai build` 会把 mod 装进所有实例。

## 构建和安装

- `anim mcai build` = 用 JDK 17（`MCAI_JAVA_HOME`，anim 从配置 `ANIM_JAVA_HOME` 传；不给就用 PATH 上的 java，不到 17 就拒绝）跑 `./gradlew build`，再把 `build/libs/mcai-*.jar` 拷进所有实例和所有 `game/取材服务端*/` 的 `mods/`。
  `game/` 是各 worktree 共用的，在哪个 worktree 跑 build，装的就是那里的代码：还没合并某个功能的 worktree 跑一次，就把它从游戏里换掉了
  （比如不含生成时修整的 jar 装进去，主世界服务端会读不进修整包；`anim world new`、`pregen` 起服前按 `核对.ts` 的模组要求表拦）。
- 编译要用到暮色森林的 jar（mixin 引用它的类），直接用 `game/取材服务端/mods/` 里那份，不另外下载。
  作者机器上 PATH 上和 `JAVA_HOME` 里的 JDK 是 8，编不了（所以 mcai 不读 `JAVA_HOME`，读 `MCAI_JAVA_HOME`）；手动跑 gradle 要先把 `JAVA_HOME` 指到 JDK 17、设好 `MCAI_GAME`。
- 第一次构建要下载 Gradle、Forge、反混淆 Minecraft，约 8 分钟（缓存在 `~/.gradle`）；之后十几秒。jar 是可复现打包，同一提交哪台机器编出来都一样。
- 改了 mod 代码要重启游戏才生效（`mcai game stop` 再 `start`）。
- 用的是官方 Mojmap；mixin 的 refmap 由 MixinGradle 生成。

### 实例要有的两处设置（`取材客户端` 已经设好，重建实例时照做）

| 文件 | 设置 | 原因 |
| --- | --- | --- |
| `game/实例/<实例>/instance.cfg` | `LowMemWarning=false`（要同时有 `OverrideMemory=true`） | 系统空闲内存低于分配值时 Prism 会弹确认框，没人点就永远卡在启动前，日志里只看到 `EnsureAvailableMemory` 开始、没有结束 |
| `.minecraft/config/fml.toml` | `earlyWindowControl = false` | 关掉 Forge 的早期加载窗口。开着的话它从进程启动就显示，mod 还没加载、藏不了；关掉后游戏窗口只闪现约 0.1 秒 |

## 不抢前台、输入锁定（默认行为）

- **窗口默认隐藏**：mod 在自己被构造的那一刻（mod 代码能在主线程上跑的最早时机）就 `glfwHideWindow`。
  截图是往离屏帧缓冲里画的，不需要窗口可见；窗口隐藏时服务端 tick、区块加载、截图都照常。
- **`mcai game start` 不抢前台**：启动前记下最前面的应用，启动期间每 0.3 秒检查一次，游戏或 Prism 抢到前台就用 `open <应用>` 还回去（不需要辅助功能权限）。
  管不到的一点：Prism 自己会在屏幕左上角显示一个约 480×180 的启动进度小窗 5～9 秒（不在前台）。
- **输入默认锁定**：鼠标移动/点击/滚轮、键盘在 mod 里直接丢掉，游戏也抓不到鼠标。即使窗口露出来被点到，机位不会动、不会触发交互、ESC 弹不出菜单。
- **`mcai input on`**：显示窗口并放开输入，给人自己进游戏操作；**`mcai input off`** 藏回去并重新锁定（同时把前台还给 `input on` 之前的应用）。
  `mcai state` 里的 `input`、`window.visible` 是当前状态。

## 空闲自动退出

- 游戏 **30 分钟**没收到 `mcai` 的请求（任何动作都算，包括 `state`、`ready`、`game status`），就自己走正常流程退出（会存档），Prism 也跟着退，不留进程。
- 起因（2026-10-03）：取材完没 `game stop`，游戏在后台空转了近 22 小时，合盖后被暗唤醒照常跑，一夜把电池从 80% 耗到 22%。
- 不算空闲：有动作正在执行（跑很久的 `mesh`、`shoot`）；`input on` 期间（人在游戏里自己操作）。
- 计时用墙上时间，合盖睡眠的时间也算进去，醒来后半分钟内就退（每 30 秒检查一次）。
- 改时长：`mcai game start world=片场 idle=<分钟>`，`idle=0` 不自动退出。只管这一次启动（写进实例的 `config/mcai.idle`，不给 `idle` 时 `mcai` 会把它删掉）；游戏已经开着、`game start` 直接复用时不改。
- 自动退出后再发命令会提示连不上，`mcai game start world=片场` 重开（约 35 秒）。自动退出只是兜底，用完照样 `mcai game stop`。

## 动作清单

| 动作 | 作用 | 线程 |
| --- | --- | --- |
| `ready` | 世界是否加载完、可以接命令；有界面挡着时列出界面和按钮 | 客户端 |
| `state` | 位置（镜头）、朝向、FOV、维度、时间天气、是否冻结、区块是否到齐且渲染完、挡着的界面、窗口/输入状态、撤销栈深度 | 客户端 |
| `cam` | 摆机位。`pos`（镜头位置）+ `look`（看向的点）或 `yaw`/`pitch`；可选 `fov`、`roll`、`dim`（跨维度）。会把玩家切成旁观模式，并等客户端到位才返回 | 自行调度 |
| `shoot` | 截图存 PNG。`out` 必填，`size=宽x高`（默认 1920x1080，和窗口大小无关），`timeout`（默认 60 秒） | 自行调度 |
| `cmd` | 以权限 4 执行任意命令并返回输出；执行者是摄像机玩家（`@s`、`~` 相对它）。`mcai cmd time set day` 后面整段都是命令 | 服务端 |
| `freeze` / `unfreeze` | 冻结/解冻世界 | 服务端 |
| `setblock` / `fill` | 放方块 / 填充长方体（没有 /fill 的 32768 格上限） | 服务端 |
| `mesh` | 把一块区域导出成场景网格。`out`（不带扩展名）必填，范围写 `from`、`to` 或 `structure`，见下面「导出场景网格」 | 客户端 |
| `undo` | 撤销上一次改世界的动作，可连续撤销（最多 50 步，只在内存里） | 服务端 |
| `batch` | 多个动作按顺序执行，遇错即停；里面的改动合成一次 undo | 自行调度 |
| `closescreen` | 关掉当前界面（暂停菜单、背包等） | 客户端 |
| `click` | 按当前界面上的按钮（`text=` 或 `index=`），用于必须选一下才能继续的界面 | 客户端 |
| `input` | 用户输入与窗口显示开关，见上一节 | 客户端 |
| `key` | 模拟按一下键（走真实键盘的入口，`input off` 时同样被挡，可用来验证锁定） | 客户端 |
| `quit` | 正常退出游戏 | 客户端 |
| `ui` | 游戏界面：`op=size` 设虚拟窗口和界面尺寸、`use` 右键用主手物品（打开物品的界面，要先切出旁观模式）、`click`/`scroll`/`type`/`key` 直接调当前界面的输入、`info` 列控件坐标、`shoot` 只拍界面（黑白两底解出透明度存成透明 PNG，`cursor=on/off` 定输入框光标亮灭）。2026-10-12 为 6-2-3 录结构罗盘界面加的 | 客户端 |
| `biomes` | 导出群系色表：每个注册群系的草、叶、水、天空、雾色，温度、降水、修饰规则；随位置变的记采样点上的值。`out`（不带扩展名）必填，`samples` 采样点数（默认 64）。结构见 `docs/游戏导表.md` | 客户端 |
| `blocks` | 导出方块表：每个方块状态烘焙好的面（贴图、染色索引、剔除）、层、发光、偏移，写 `<out>.json` 和 `<out>.png`。`out` 必填，`only=minecraft:*,create:*` 只导一部分。和手写方块表同结构，见 `docs/游戏导表.md` | 渲染线程取面，HTTP 线程写文件 |
| `hold` | 摄像机玩家主手拿一件物品：`item=`（如 `goety:nether_staff`），可选 `inner=` 装进这件物品的物品栏能力（法杖的聚晶）、`slot`（默认 0）。2026-11-10 为录法术加的 | 服务端 |
| `record` | 录一段：每刻记下半径内新生的粒子（类型、参数、类、构造完的字段、逐刻位置大小颜色透明度转角贴图格；改写了 render 的替它画一遍记顶点）、实体（出没、逐刻位姿、NBT）、声音（事件、位置、音量音高）、诡厄施法事件。`out`、`ticks` 必填；`radius`（默认 32）、`target=x,y,z`、`use=1` 第 `pre` 刻（默认 5）按右键用主手物品（蓄力的按住到 `hold` 刻或不再使用）、`seed` 先定服务端和玩家的随机数、`note`。写原始录制 `mcai-录制-原始/1`，整理和用法见 `sourcing/extract/录法术.py`、`docs/决策/0016-法术录制.md` | 自行调度 |
| `help` | 列出以上内容 | — |

“服务端”指单人世界的集成服务端线程，所以 `cam`、`cmd`、`freeze`、`setblock`、`fill`、`undo` 只能在单人世界里用；
连别的服务器时只有 `state`、`shoot`、`ready`、`closescreen`、`click`、`input`、`key`、`quit`、`biomes`、`blocks` 可用。

游戏外：`mcai game start [world=<存档>|server=<地址>] [offline=<玩家名>] [timeout=300] [idle=30]`、`game stop`、`game status`、`game log [n=40]`、
`game instances`、`game newinstance name=<实例名> [from=取材客户端]`、`game copyworld name=<存档> from=<世界> [overwrite=1]`、`mcai build`、`mcai meta <png>`、
`mcai server stop server=<服务端目录名|路径> [timeout=300]`（走 RCON 发 stop 等存完盘；没开 RCON 时 Mac/Linux 发 SIGTERM）。

### 加新动作

在 `src/main/java/mcai/action/` 写一个实现 `Action` 的类（名称、说明、参数、跑在哪个线程、是否改世界），在 `Actions.java` 里 `register` 一行。
HTTP 接口（`POST /动作名`，请求体 `{"args": {...}, "cwd": "调用方目录"}`）和 `help` 都从注册表生成，不用另外登记。

## 坐标和朝向约定

- 坐标就是游戏坐标，写成 `x,y,z`。`cam` 的 `pos`、`state` 和截图元数据里的 `pos` 都是**镜头（眼睛）位置**，不是脚底。
- `yaw`：0 朝南（+Z），90 朝西（−X），180 朝北（−Z），−90 朝东（+X）。`pitch`：正值朝下，90 垂直俯视，−90 仰视。
  `look` 的朝向由 mod 计算，不用自己算角度。俯视时用 `yaw` 决定画面上方朝哪（`yaw=180` 上北）。
- `fov` 是**垂直**视角（度）。第一次 `cam` 起由 mod 接管，默认 70，之后沿用上次的值，`fov=0` 交还游戏。
  接管的原因：旁观模式在飞行，游戏会把设置里的 FOV 乘 1.1，不接管的话视角不固定（没调过 `cam` 时 `state` 里是 77）。
- `roll`：绕视线轴滚转（度），沿用上次的值，`roll=0` 复位。
- 截图元数据（`mcai meta 图.png`）：`pos`、`yaw`、`pitch`、`roll`、`fov`、`lens36`、`dim`、`dayTime`、`weather`、`frozen`、`world`、`size`。
  `lens36` 是换算好的 36mm 画幅焦距：`18 / (tan(fov/2) × 宽高比)`。
- 暮色森林维度 id 是 `twilightforest:twilight_forest`；旧世界 `world/` 的娜迦庭院中心在 `264, 488`，地面约 y=0。

## 各动作的行为细节

- **shoot**
  - 只调游戏的“画世界”那一步，HUD、准星、手、菜单都在它之外，天然拍不到；有界面开着也能拍（暂停菜单除外，见下）。
  - 拍之前要求连续 10 轮（每轮隔 30ms）都满足：镜头周围渲染距离内的区块到齐、网格编译队列为空、已加载区块总数不再变化。超时会说明卡在哪一条。
  - 输出尺寸任意，做法是临时把主帧缓冲改成输出尺寸再改回去。
  - 暂停菜单开着时（只有 `input on` 且按了 ESC 才会出现）集成服务端是停的，`shoot` 会直接报错让你先 `closescreen`。
- **freeze**：停的是服务端世界里的时间、天气、计划刻、随机刻、方块事件、方块实体、非玩家实体、自然刷怪和距离消失；
  玩家自己的 tick 和区块加载照常，所以冻结后仍可移动机位、加载新区块。客户端的时间推进也一并停掉。
- **setblock / fill**：只通知客户端，不给邻居发方块更新（沙子不会马上掉、红石水流不触发）；邻居的形状更新照常（栅栏会连上、失去支撑的花会掉）。要完整原版行为用 `cmd setblock ...`。
- **undo**：动作执行期间，服务端每一次方块写入都先记下“改之前”的方块状态和方块实体数据，所以 `cmd` 里的 /fill、/clone、/place 也能撤销；
  期间新生成的实体（掉落物、召唤物）打上 `mcai` 标签，撤销时删掉。
- **cmd**：输出是命令反馈的文字；`success=false` 时 `mcai` 退出码为 1。集成服务端没有 `save-all`，存盘靠自动保存和退出。
- **天气**：`game start world=...` 进存档后会关掉天气循环并设成晴天（下雨挡画面，也拖慢渲染）。剧情要雨就 `mcai cmd execute in minecraft:overworld run weather rain`（天气存在主世界里，在暮色森林里直接 `weather ...` 不生效），设了不会自己变；重启游戏回到晴天。
- **game start**：带模组维度的世界第一次在客户端打开会弹“实验性设置”确认，`mcai` 会自动点“继续”（每个存档只问一次）。

## 导出场景网格（mesh）

```sh
anim mcai cam pos=8,120,232 pitch=90 yaw=180 dim=twilightforest:twilight_forest    # 先把镜头挪到区域附近，区块要在渲染距离内
anim mcai mesh from=-40,0,195 to=56,95,270 out=<目录>/巫妖怪塔.网格 mark=twilightforest:lich_boss_spawner
```

- 做法：不自己解析方块模型，让游戏的渲染器把区域里的东西画一遍，把它吐出来的面接住。所以拿到的就是游戏实际画的面：
  被不透明方块挡住的面本来就不出（地下实心部分一个面都没有）；楼梯、栅栏、玻璃、模组异形方块、群系染色、环境光遮蔽都是渲染器算好的。
- 实体也导：画、物品展示框、盔甲架这类不会动的实体，以及箱子、告示牌、刷怪笼这类方块实体，调它们各自的渲染器。
  生物、掉落物默认不导（`entities=all` 才导，按当前姿势定格），`entities=0` 只要方块。结果里 `entities` 是导了的，`entitiesSkipped` 是跳过的。
- 输出 `out.json`（范围、原点、各层面数、标记点）、`out.bin`（顶点，gzip 压缩）、`out.png`（只含用到的贴图的小图集）。
  `out.json` 的 `sprites` 列出小图集里每张贴图的名字和位置，要按方块贴图取图集坐标就按名字查它，不要手写坐标、不要逐像素反推；
  `取材` 记着实例、存档、维度、mesh 参数、模组版本、资源包和 mcai 源码版本（`mcai 源码`：构建时 `sourcing/mod` 最后一次提交的 git describe，有没提交的改动带 `-dirty`）。同一区域、同一世界状态重导，图集排布和面的顺序不变。较早导出的网格没有这两项。
  渲染用 `engine/voxel/方块网格.tsx`；取材范围登记在 `sourcing/extract.toml` 的 mcai mesh 配方。
- **按结构取范围**：`structure=<结构id>` 代替 `from`/`to`，范围取那个结构的包围盒（含结构为贴合地形外扩的部分）。找的是水平方向含 `at=x,y,z`（默认镜头位置）的那一个，所以先把镜头挪到结构正上方；要在单人世界里（结构起点只在服务端有）。例：`anim mcai mesh structure=twilightforest:lich_tower out=…`。
- 文件大的是顶点（每个面 4 个顶点各带位置、贴图坐标、颜色），gzip 后约为原来的 1/6；贴图每种在小图集里一格，几十到一百多 KB。
- **自动分块**：范围超出镜头的渲染距离时，mod 自己把镜头挪到每一块（128×128 格）正上方、等区块到齐再导，面攒在同一份输出里，导完镜头还回原处。
- **优化**（都在导出时做）：
  - 被挡住的面渲染器本来就不出；被树叶六面包住的树叶不导（最外一层照常六面都出）。
  - 同一平面上挨着的、贴图和颜色都一样的整格面拼成大面（`merge=0` 关掉），贴图在大面上平铺；带环境光遮蔽渐变的面不合并。
    为了让同一群系里的草和树叶颜色完全一致，导出时不做群系之间的颜色过渡。
  - 结果里的 `quadsByBlockBeforeMerging` 列出最占面数的方块，面数太多时据此用 `skip` 去掉不需要的（比如城堡周围森林的树）。
- 没有碰撞体积的方块（花草、蘑菇、火把、藤蔓）单独一层 `plants`，渲染时可以按矩形把角色跑位上的草清掉。
- 个别模组方块画不出来时跳过这一块，记在 `entitiesSkipped` 里（`（方块渲染出错）`），不让整个导出失败。
- `outside=1`：只要从外面看得到的（从区域顶上往里灌，灌不到的封闭洞穴不导）。大范围地形用；要拍室内的建筑不要开，封死的房间会被去掉。
- `origin=x,y,z` 导出坐标的原点，默认区域底面中心；`skip=firefly,*vine*` 不导的方块；`mark=方块id` 把这些方块的位置记进 json。
- 用图集的贴图（方块、箱子、告示牌、画、展示框里的物品）按小贴图放进导出的图集；不在图集里的实体贴图只抠用到的那一块。
- 量级（2026-09-30）：巫妖怪塔 112×96×79 格 15.2 万个面、约 1 秒、bin 15MB；终焉高原城堡整个范围（27 块、`outside=1`）去掉荆棘和周围的树、草后 115 万个面、130MB（不去是 795 万面、763MB）。
- 限制：朝向明暗没有烘进去（交给渲染的灯光）；贴图动画只取当前一帧；模型在渲染时才定贴图的少数模组方块，对不上贴图的面会丢掉并在结果里报 `quadsWithoutTexture`。

## 暮色森林放大 4 倍（数据包 + 地标网格）

用户 2026-10-04 定：不再自己写 16 倍地形，「全面改成原版的巨型生物群系（4x）吧，在游戏里面生成真实的地貌，然后导入」，暮色森林也放大 4 倍。
原版的巨型生物群系管不到暮色，所以分两半做，**两半缺一不可**：

- **数据包** `sourcing/datapacks/暮色放大4倍/`：覆盖暮色的群系层栈 `random_forest_biomes`，在原层栈外面再包两层 zoom（盐 2000、2001，不模糊），群系边长放大 4 倍。
  溪流层（`biomes_along_streams`）引用的就是它，所以溪流跟着新的群系边界走，宽度不变（用户 10-04 定：溪流先不加宽）。
- **mod 里的 mixin**（`TwilightGrid`、`mixin/LegacyLandmarkPlacementsMixin`、`mixin/ChunkGeneratorTwilightMixin`，终焉城堡另有两个，见下面「mixin 改了哪些地方」）：暮色的地标（首领建筑、小丘、树篱迷宫）摆在写死的 16 区块网格上，数据包改不了。
  只放大群系的话，一个关键群系里会落进十几个网格点，同一种首领建筑重复十几座。mixin 把网格放大到 64 区块（1024 格），中心的抖动也乘 4，得到原版布局整体放大 4 倍；建筑本身大小不变。
  mod 只认数据包里的标记文件 `data/mcai/twilight_x4.json`：服务端启动时（早于任何区块生成）有这个文件就放大，日志里打一行「暮色地标网格：64 区块」，没有就照原版 16 区块。
  所以旧的片场存档不受影响，客户端实例的集成服务端补生成区块时也和已有区块对得上。

只有数据包没有 mod：首领建筑重复十几座；只有 mod 没有数据包：什么都不放大。

### 新建放大 4 倍的世界

用户 2026-10-04 定种子 1752，世界名 `暮色放大-1752`（世界声明 `sourcing/worlds/暮色放大-1752.toml`）。
1752 的 7 座首领地标（游戏 x, z）：娜迦庭院 (-11191, -887)、巫妖塔 (-9015, 1032)、九头蛇巢 (-6327, 2184)、黑暗塔 (-7159, 5064)、
雪怪洞 (-3959, 5192)、极光宫殿 (-2935, 5128)、终焉城堡 (-3127, 2120)。

1. 服务端和所有客户端实例都装同一版 mod（`anim mcai build` 一次装齐）。
2. 建世界，当场在暮色里查 7 座地标：`anim world new 暮色放大-1752 -- '<locate 命令>' …`，每座一条
   `execute in twilightforest:twilight_forest positioned <x> 64 <z> run locate structure twilightforest:<naga_courtyard|lich_tower|hydra_lair|dark_tower|yeti_cave|aurora_palace|final_castle>`。
   7 条 `locate` 报的距离都应在一个区块以内；报出几百上千格，说明那个网格点上不是这座建筑，先别预生成。终焉城堡的主楼就在它的地标中心上。
   也可以用 `tf center`，它报最近的地标中心和那里是哪种地标。启动日志要有「暮色地标网格：64 区块」、没有 mixin 报错（mixin 配置要求每个注入点都找到，找不到会直接崩）。
   已经生成过的暮色区块不会跟着数据包变，放晚了只能删掉新世界重来。
3. 预生成：7 座地标的外包框（x -11191～-2935、z -887～5192）四边各外扩 2 km，`chunky corners -13191 -2887 -935 7192`
   （12.3 × 10.1 km，48.4 万个区块、124 km²，声明里的「原矩形」块；后来又补了北、南两块）。2026-10-04 的原矩形约 2 小时、region 3.5 GB。
   当时踩过的两个坑：一次开服跑太多（约 27 万区块）会堆满——内存里压着没卸的区块和几千万个树叶的计划刻（没有玩家的服务端区块不 tick，它们一直留着、随区块存盘），
   所以停服再 `chunky continue`（`anim world pregen` 的看守自动做）；读方块碰上调色板扩容的原版数据竞争（arm64 上容易碰）会让光照线程停掉、预生成卡死，`mixin/LevelChunkSectionMixin` 已修。
   跑完同一选区再扫一遍补洞；生成完的区块数可以拿 `Status` 是 `minecraft:full` 的数核对。
4. 片场存档照常 `anim mcai game copyworld name=<存档名> from=暮色放大-1752`，数据包跟着世界目录一起复制。

### mixin 改了哪些地方

暮色 4.3.2508 里所有按网格找地标的代码都走 `LegacyLandmarkPlacements` 的五个方法（字节码里逐条查过）：
`getNearestCenterXZ`（网格中心）、`pickLandmarkForChunk` 和 `getFeatureForRegion`（地形改造取群系的点）、`pickVarietyLandmark`（普通森林里的地标、每 8×8 格强制一组娜迦庭院和巫妖塔）、`landmarkCenterScanner`（`/locate`）。
用到它们的有：结构起点、地标附近起丘和压平、暗林树冠给黑暗塔让位、`/tf center`、装饰避让、魔法地图、进度限制、传送门落点、树篱迷宫刷怪。
别处另写死了网格的有两样，也一并改了：

- 云中小屋云层的形状（`ChunkGeneratorTwilight.deformTerrainForTrollCloud2`）另算了一遍网格编号，换成 64 区块的（`ChunkGeneratorTwilightMixin`）。
- 终焉城堡按 256 格（16 区块）的网格摆：主楼吸到 256 格网格点上（`FinalCastleMainComponent` 构造函数里 `x + 127 >> 8 << 8`），
  迷宫塔限定在「主楼旁边的 256 格网格点」128 格以内（`FinalCastleMazeTower13Component.buildContinueTowerTowards`）。
  64 区块网格下主楼会相对起点区块偏 -71、-7、+57、+121 格之一，偏 +121 时主楼超出原版 8 区块的结构引用半径，城堡被切掉一截（离线测试里 44% 的城堡会这样）。
  改成：主楼放在 64 区块网格的地标中心（`FinalCastleStructureMixin`，主楼刚造好时整体平移），迷宫的城堡中心取主楼中心
  （`FinalCastleMazeTower13ComponentMixin`，原版主楼就在网格点上，所以和原版是一回事）。这样主楼和迷宫塔都在起点区块 ±8 个区块里，
  城堡坐标就是选种图上标的地标中心。不是地标中心区块的城堡（别的维度里 `/place` 的）不动。
- 终焉城堡外围的残塔、废塔（迷宫塔随机往外接，`buildDamagedTower`）原版不限远近，伸出起点区块 ±8 个区块引用半径的部分不生成（种子 1752 第一次建的世界里两座废塔整座没有）。
  改成：伸出引用半径的残塔、废塔当作撞上了别的结构件，暮色换个方向或不接（`FinalCastleMazeTower13ComponentMixin` 的 `mcai$collideOrOutOfReach`，
  判断在 `TwilightGrid.castleTowerFits`）；迷宫塔连屋顶也这样查（离中心正好 127 格的屋顶会伸出 1 格）。重建后的城堡结构件全在引用半径里。
  原版 16 区块网格的城堡同样会切，旧片场存档（开关关着）不动。
  暮色原版有个笔误没改：地牢出口往下一层的台阶 `x` 取了 `z`（`FinalCastleDungeonExitComponent` 里两处都是 `minZ + 15`），第二层以下的地牢从来不生成，不影响地面上的城堡。

查法：暮色 jar 的 1570 个类全部反编译，再扫字节码里的 `>> 8`、`<< 8`、`>> 9`、`>> 10`、256、255、-256、512、1024 等常量，逐处看和网格有没有关系。
其余写死尺寸的都没改，和地标网格无关或不影响取材：

- `TFTerrainWarp`（群系交界的地形平滑，±2 个 4 格）：和网格无关，所以 4 倍大的高地边缘比原版陡。
- 魔法森林的草和树叶颜色（`BiomeGrassColors.getEnchantedColor`）：彩虹圈以 256 格网格点为圆心。放大后一片魔法森林里有十几个圈心，和任务林地也对不上；只是颜色。
- 魔法地图的中心（`MagicMapItem.getMagicMapCenter`，2048 格一格）和传送门往「关键群系之间的中心」挪（`TFTeleporter.moveTowardsCenter`）：没跟着放大；取材不用魔法地图和传送门。
- `LandmarkBiomeSource`（1024 格）：另一种群系源，暮色森林维度不用它。
- 其余 256、1024 是高度、颜色位运算、物品耐久，和网格无关。

暮色版本一换就要重新核对字节码，`mods.toml` 里把暮色版本钉死在 4.3.2508。
离线核对（不开游戏）：`sh test/twilight-grid-test.sh`，两部分：

- `TwilightGridTest`：拿编好的 jar 对照暮色 jar 里的原函数，核对照抄没抄错、64 区块网格正好是原版放大 4 倍；
  终焉城堡的结构件离线造不出来，先从字节码核对 mixin 依据的原版写法，再按 mixin 的做法算主楼和迷宫塔的落点、外围的塔按引用半径的取舍。
- `MixinApplyTest`：用 Forge 同版的 Mixin 把 jar 里两端都织的 mixin 真的织进暮色 jar 和 Minecraft 的类，
  每个注入点都找得到（mixin 配置要求全部找到，否则游戏一启动就崩），处理函数接在该接的地方。不经过 Forge 的访问转换和 coremod，所以起服务端时照样看一眼日志。

## 古城放大 4 倍（数据包 + BigJigsaw）

用户 2026-10-13：「这个古城很有问题啊 首先是做得太小了 发展不开 应该改成4x的」。建筑是原版的模板、原版大小，只是城的布局铺大：
远古城市的拼图多拼几层、半径放大，不是把方块放大。也是两半缺一不可：

- **数据包** `sourcing/datapacks/古城放大4倍/`：覆盖 `minecraft:ancient_city` 的结构定义，只改两个数：`size` 7 → 40（拼几层）、`max_distance_from_center` 116 → 440。
  别的拼图结构（村庄、堡垒遗迹、古迹等）一个字没动。size 40 铺满 440 格半径时建筑密度和原版城最接近（试过 20、30、40、64）。
- **mod 的 `BigJigsaw`**（加 `mixin/` 下的 `JigsawStructureMixin`、`JigsawStructureAccessor`、`ChunkGeneratorMixin`、`StructureManagerMixin`、`ChunkSerializerMixin`）：
  原版 1.20.1 有四处把拼图结构卡在 8 个区块（128 格）以内，详细见 `BigJigsaw.java` 文件头：
  1. 编解码（`JigsawStructure.CODEC`）：size 只收 0～7、半径只收 1～128，半径加地形适配 12 格 ≤ 128。→ 放宽到 size 0～64、半径加适配 ≤ 1024，读法和原版一样。
  2. 引用（`ChunkGenerator.createReferences`）：只看周围 8 个区块里的起点。→ 再往外看到「引用半径」，远处的起点按种子自己算出来（和起点区块里存的一样）、缓存住。
  3. 取起点（`StructureManager.fillStartsForStructure`）：起点区块在 8 个区块外时超出这一步的 `WorldGenRegion`，原版直接崩。→ 拿不到就用算出来的那份。
  4. 读存档（`ChunkSerializer.unpackStructureReferences`）：读区块时丢掉 8 个区块外的引用（打 WARN「invalid structure reference」）。→ 引用半径以内的留着。
  地形给结构让位（Beardifier）和 `/locate` 都按引用找结构，跟着 2～4 就对了。
  引用半径按这个世界里最大的拼图结构算，服务端启动时打一行「大拼图结构：minecraft:ancient_city size 40、半径 440 格，引用半径 34 区块」。
  没有超出原版范围的结构（老片场、暮色世界）就是 8，和原版一模一样，所以别的世界不受影响。

只有数据包没有 mod：服务端读不进数据包（size 超范围），起不来；只有 mod 没有数据包：什么都不变。

### 新建世界

用户 10-13 定：同一个种子 20260930（老片场 `片场` 那座古城），新世界 `古城放大-20260930`，城心还在 (-720, 240)。还没写世界声明，重建时照下面的数写一份再 `anim world new`、`pregen`：

1. 服务端和所有客户端实例都装同一版 mod（`anim mcai build`）。
2. 数据包 `古城放大4倍`（外加 `通用/不生成龙巢`），建完查日志里有「大拼图结构」那一行；`execute positioned -720 -50 240 run locate structure minecraft:ancient_city` 应报 (-720, ~, 240)、0 格。
3. 预生成：城的范围四边外扩约 60 格，`chunky corners -1232 -272 -224 752`（65 × 65 = 4225 个区块，约 1 分钟）。起点在开头约 9 秒里算完（日志「大拼图结构起点 … 1311 件」）。
   10-13 第一遍有一个城外边上的区块存盘时撞上 ConcurrentModificationException、停在 structure_starts，补洞那一遍补上了。
4. 片场存档：`anim mcai game copyworld name=片场-古城4x from=古城放大-20260930`。导网格见 `作品/应力转动/地点/古城4x.tsx` 文件头。

### 测试

- `sh test/ancient-city-test.sh`（经资源闸跑）：`AncientCityTest` 离线（不开游戏）核对放宽的编解码和原版逐项一致、数据包原版读不进而放宽后读得进、
  1024 以外照样拒绝、没有大结构时引用半径是 8；再在种子 20260930 的起点区块 (-45, 15) 拼城：原版参数正好拼出老片场那座（74 件，包围盒逐格一样），
  数据包参数拼出 1311 件（约 5 秒），附近 1.6 km 内没有别的古城起点（大城不会和邻城叠在一起）。
- `sh test/twilight-grid-test.sh` 里的 `MixinApplyTest` 一起核对这几个 mixin 的注入点都找得到（按 SRG 名）。

### 幽匿地形（mcai.FillBiome，10-13）

用户 10-13：「这个扩大后的古城怎么没有幽匿地形了」。原版古城的幽匿块、幽匿脉络、随机的感测体/尖啸体是深暗之域群系的地物，不是模板带的；
城铺到 440 格以后大半座落在别的群系下面（旧世界城底下 y −64 那层深暗之域只占 17%）。

- `FillBiome` + `mixin/NoiseBasedChunkGeneratorMixin`、`StructureManagerAccessor`：区块 BIOMES 这一步写群系时，结构标签 `mcai:fill_biome` 里的大拼图结构
  （只允许一种群系的，远古城市 → deep_dark）包围盒水平外扩 32 格、y ≤ 44、气候 depth ≥ 0.2 的群系格写成那个群系。起点照 BigJigsaw 的路子算（停服再开也对）。
- 只改写进区块的群系：噪声地形、雕刻洞穴（applyCarvers 问 biomeSource）、结构起点不受影响；地表规则按群系分的只在预估地表 8 格内。变的只有地物
  （多了幽匿，少了滴水石、地下熔岩湖、泉、矿井件——矿井原版就不进深暗之域）。
- 标签在 `sourcing/datapacks/古城放大4倍/data/mcai/tags/worldgen/structure/fill_biome.json`，10-13 起建的世界才有；开服日志「铺满群系：minecraft:ancient_city → minecraft:deep_dark」，
  `anim world new` 见到这个标签就查这一行。织入核对在 `MixinApplyTest`。
- 世界 `古城放大幽匿-20260930`（同种子，建法同上，世界名换掉），片场 `片场-古城4x幽匿`。片场里另补了 4 格剧情要的感测体/尖啸体（见 `作品/应力转动/地点/古城4x.tsx` 文件头）。
  旧世界 `古城放大-20260930`、`片场-古城4x` 留着。

## 主世界生成时修整（mcai:region、mcai:edit）

用户 2026-10-04 定「不找天然的，直接修整」，以后还会要山、平地、峡湾、湖，所以做成通用的、加区域和操作就行的机制；
2026-10-05 定用生成时修整：航线起点（李樱的基地）外一望无际的海由游戏自己生成。（不开游戏改方块用编辑层，见 `docs/世界.md`「编辑层」。）

做法：mod 注册两种密度函数（`src/main/java/mcai/terrain/`），数据包 `sourcing/datapacks/主世界修整/` 覆盖史诗地形的某个密度函数文件，把原内容原样包进 `mcai:edit`，
在区域里改这个量。海底、海岸、群系、地表方块、树都由游戏照常生成，游戏截图、`mcai mesh` 导出、DH 远景是同一片地。
区域外权重正好是 0，原值原样返回，一格都不变。这份包的区域为什么这么划见 `sourcing/datapacks/主世界修整/说明.md`。

### 数据包怎么配

- `sourcing/datapacks/主世界修整/`：`pack.mcmeta`；`data/etn/worldgen/density_function/overworld/continents.json` 等是覆盖文件；
  `data/mcai/worldgen/density_function/region/*.json` 是区域（单独成文件，几个覆盖文件可以共用一个区域）；`data/mcai/worldgen/noise/*.json` 是边界噪声。
- **区域** `mcai:region`，值是 0～1 的权重：形状里面离边界 `falloff` 格以上是 1，边界上和外面是 0，中间 smoothstep 过渡。
  ```json
  { "type": "mcai:region", "shape": <形状>, "falloff": 3000, "edge": <密度函数，可省，默认 0> }
  ```
  形状的坐标是游戏坐标 `[x, z]`（x 朝东、z 朝南），朝向按罗盘（0 = 北、90 = 东），长度单位是格：
  - `{"type": "circle", "center": [x, z], "radius": r}`
  - `{"type": "sector", "center": [x, z], "facing": 度, "half_angle": 度, "radius": r}`：半角 ≥ 180 就是整圆
  - `{"type": "polygon", "points": [[x, z], ...]}`：至少 3 个点，可以凹
  - `{"type": "path", "points": [[x, z], ...], "width": w}`：折线两边各 w/2 的带子（峡湾、河道），至少 2 个点

  `edge` 加在「到边界的有向距离」上（格，正 = 边界往里缩），填一个噪声边界就不是几何直线、圆弧。clamp 到 ≥ 0 时形状本身就是外边界，形状外一格都不变；
  有负值时边界最多往外推 `-edge` 的下界那么多格。edge 只用随 x、z 变的（噪声的 `y_scale` 写 0）：区域通常包在 `cache_2d` 里，一列只算一次。
  形状的边是直线、圆弧，从别处航拍看得出（2026-10-05 复核：扇面两条边各留下十几公里的直海岸）：加大 edge 的幅度和波长，或者用多边形沿天然海峡走。
- **修整** `mcai:edit`：把 `input` 按顺序套上几条修整，每条是「区域 + 操作 + 目标值」。
  ```json
  { "type": "mcai:edit", "input": <原内容>, "edits": [ { "region": "mcai:region/xxx", "op": "toward", "value": -0.8 }, ... ] }
  ```
  `op`：`toward` 往目标值拉（权重 1 时等于目标值）、`add` 加上 权重×value、`min` 只往下压到目标值、`max` 只往上抬到目标值。
  `value` 可以是数，也可以是密度函数（带噪声的目标）；`region` 可以是任何密度函数（比如区域乘一个数），值大于 1 按 1 算、不大于 0 这条跳过。
- **覆盖哪个密度函数**：要改哪个量就覆盖哪个文件，原内容原样放进 `input`，外层的 `cache_2d`、`flat_cache` 留在外面。
  - 大陆度 `etn:overworld/continents` 经 `minecraft:overworld/continents` 流到地形（offset、factor、jaggedness）和噪声路由的 continents（群系），
    海陆和海洋群系一起变。目标值不能低于 -1：史诗地形的 offset 样条在大陆度 ≤ -1.05 时走山那一支。
  - 温度（只影响群系挑哪个，比如不让修出来的海是冻洋）：`etn:overworld/temperature`（`flat_cache` 包着 `shifted_noise`，修整放进 flat_cache 里面）。
    山的强度、侵蚀这些在史诗地形的 `data/etn/worldgen/density_function/overworld/` 下找对应文件（解开的在 `game/缓存/选种/史诗地形/`）。
  - 覆盖文件去掉 `mcai:edit`（换回它的 input）要和史诗地形的原文件一字不差；史诗地形更新、原文件变了，这里抄的原文就过时了。
  - 世界 `datapacks/` 里的包按 id 排序加载，后面的盖前面的：`file/主世界修整` 排在 `file/epicterrain_compatible1.20.zip` 之上。改名字前想想排序，`anim world new` 开服后会查。
- **读包是严格的**：字段写错、类型名拼错、数超范围，游戏读不进来（专用服务端起不来，客户端停在数据包错误界面）。
  1.20.1 的 DFU 遇到「可省字段」写错会悄悄当成没写，`edge` 另写了严格的读法；deepslate 遇到写错的类型名会悄悄当成 0，离线的 `生成修整.mjs` 也拦了。
- **许可**：覆盖文件里抄了史诗地形 compatible 1.0.3 的大陆度样条点，这个版本在 Modrinth 上标的是保留所有权利（All Rights Reserved）。

### 离线预览

旧项目 `参考模型库/工具/选种/` 的离线工具（deepslate）读同一份包：环境变量 `MCAI_PACKS=<数据包目录>`（几个用冒号隔开）叠在史诗地形上面，不设就是原样；
两种 mcai 类型用 `生成修整.mjs`（和 Java 逐行对应），`地形.mjs` 载入时核对覆盖文件和原文一字不差。和游戏比：修整本身逐位一致，地表高度一致率平地约 98%、山区约 94%。
这套工具没搬（见文首），要用从退役 bundle 取。

### 测试

在 `sourcing/mod/` 下 `sh test/terrain-edit-test.sh`（约 20 秒，不开游戏）。改了 `mcai.terrain`、`生成修整.mjs` 或修整包都跑一遍；
`--包 <目录>` 核对另一份修整包（改区域时先拷一份改，过了再换回去）。
它引导原版注册表、把两种类型注册进去，用游戏读数据包的同一个 `RegistryDataLoader` 读 原版 + 史诗地形 + 修整包，再按种子接噪声（`RandomState`）：
1. 整套世界生成注册表读得进，写了 `mcai:edit` 的覆盖文件读出来真的带着修整；
2. 往返：每个密度函数文件读 JSON 再写回去和原文一致；
3. 错例（`test/terrain-edit-cases/bad-cases.json`）都读不进来，离线版那边也都报错；
4. 用例（`test/terrain-edit-cases/`：四种形状各种参数、四种操作、链式和嵌套、区域值超出 0～1、边界噪声）在离线版取的同一批点上和 `生成修整.mjs` 逐位相同；
5. 真包里每个密度函数叠在史诗地形上（种子 116）和离线预览差不超过 1e-5（含 interpolated 的三维函数不比：游戏和离线版都按格角插值，测试里是逐点精确值）；
6. 重混淆后的 jar（装进游戏的那个文件）实现了 DensityFunction 的全部方法；
7. 同一个密度函数被引用两次，接上噪声后是同一个对象（见下面「性能」）。

`--性能` 另外量开销（约 1 分钟，经资源闸跑）。

### 加一种形状、一种操作

- 形状：`Shape.java` 加一个 record（`distance` 给有向距离、`box` 给包围盒、`type`），`permits` 和 `codecOf` 各加一处；`生成修整.mjs` 的 `parseShape()` 加同样一支
  （三角函数只在解析时算一次，逐列只用加减乘除和 sqrt，两边才逐位一致）；`test/terrain-edit-cases/` 加一个用它的区域、`points.json` 加它的框、`bad-cases.json` 加它的错误写法。
- 操作：`TerrainEdit.Op` 加一个值、`compute` 的 switch 加一支、`minValue`/`maxValue` 按最宽的算；`生成修整.mjs` 的 `editOps` 列表、`Edit.compute` 和取值范围同样加；用例加一个用它的修整。
- 新写的密度函数类：`mapAll` 先把 visitor 传给每个子密度函数、再 `visitor.apply(新对象)`（噪声才接得上）；`minValue`/`maxValue` 要是真的上下界，宁宽勿窄
  （原版拿它做 min/max 的短路和样条的取值范围，窄了会出怪地形）；`equals`/`hashCode` 按内容比；类型名登记在 `TerrainTypes.CODECS`。

### 建世界、每一端都要装

- 生成这个世界的每一端都要装含修整的 mcai：主世界专用服务端、打开这个世界的每个客户端实例（集成服务端补生成区块、DH 生成远景走的是同一套密度函数）。`anim mcai build` 一次装齐。
- 专用服务端：jar 不含修整时读数据包失败，日志 `Registry loading errors` … `Unknown registry key in … density_function_type]: mcai:edit`，
  接着 `Failed to load datapacks, can't proceed with server load` 退出；不带 `--safeMode` 不会退回原版数据。`anim world new`、`pregen` 起服前查 jar，开服后查数据包启用和排序。
- 客户端：
  - 「实验性设置」提示（Worlds using Experimental Settings are not supported）：每个存档第一次在客户端打开时弹一次，和修整包无关：
    世界数据包读进来的世界生成设置都算实验性，加上史诗地形就是 Experimental；暮色维度也会触发。`mcai game start` 自动点继续。
  - 安全模式提示（Errors in currently selected data packs prevented the world from loading，按钮 Safe Mode）：只在实例的 mcai 不含修整、或修整包写坏了时出现。
    **千万别点**：安全模式只用原版数据，史诗地形和修整都被丢掉，之后补生成的区块是原版地形，存档也记成只开原版数据包。`mcai game start` 碰到这个界面直接报错退出，不替你点。

### 性能

2026-10-05 离线量（`--性能`，单线程，定稿包）：
- 区域每次求值：不带边界噪声 7～13 ns，带边界噪声 35～166 ns；多边形 4、64、256、1024 个点分别约 18、155、415、1421 ns，点数别上千。
- 区块生成（群系 + 噪声两步）：修整区和过渡带里群系这一步慢 35%～42%，区域外慢 14%～20%；噪声这一步不受影响。两步合计修整区约 +13%、区域外约 +4%。
  群系这一步慢，是因为 9 个覆盖里有 5 个是气候量，群系取样时 `cache_2d` 几乎不命中；温度那条修整没有缓存，每次都要算一遍多边形的距离。
- 坑：最初的实现 equals 按对象比，游戏接噪声（`RandomState`）和建区块缓存（`NoiseChunk`）时按 equals 合并重复引用，大陆度被引用的几处并不成一个，
  各算一遍史诗地形的大陆度样条，群系一步慢 44%～61%、噪声一步慢 28%～36%（连区域外都慢）。所以新写的类一定按内容比，测试第 7 项会拦。

## 已知限制

- **锁屏时能否截图：没有实测。** 窗口隐藏、在后台、在前台三种情况截图都正常；原理上截图不经过屏幕（离屏帧缓冲），但锁屏后 macOS 是否会给进程降速没验证过。
  要验证就先 `sleep 20; anim mcai shoot out=x.png`，再按 Ctrl+Cmd+Q 锁屏。
- 冻结只停服务端。客户端自己的动画照常：粒子、萤火虫、水面贴图、生物的待机摆动。所以同一机位连拍两张，这些地方会有像素差异。
- undo 的边界：
  - 只改方块实体数据而不换方块的操作（`/data merge block`、往箱子里放东西）不记录；
  - 动作返回之后才发生的连锁变化（沙子下落、水流）不算在内——要撤得干净，先 `freeze` 再改；
  - 被命令删掉的实体不会复活；撤销记录不跨游戏重启。
- `batch` 不是“同一个 tick 内执行”（`shoot` 要跨很多帧），只是按顺序；需要画面静止就先 `freeze`。
- `batch` 的每一步会按 shell 规则再拆一次词，步骤里的双引号（NBT 字符串）要写成 `\"`；不想转义就别放进 batch，单独调用。
- zsh 里带方括号的选择器要加引号：`anim mcai cmd 'kill @e[type=item]'`。
- 发光描边（发光效果的实体轮廓）不会出现在截图里。
- 游戏在跑但窗口隐藏时，它照样按正常帧率渲染，一个实例常驻占 2 个核左右和 GPU；不用时 `mcai game stop`（忘了的话空闲 30 分钟后自己退，见「空闲自动退出」）。
- 进别的服务器（`server=`）时只能看和拍，摆机位要靠那边的权限自己发命令；没有实测过。
- 玩家死亡时的死亡界面 `closescreen` 关不掉（游戏立刻重新打开它）。要用 `mcai click text=重生`，但按钮在界面出现后约 1 秒内是灰的，得等一下再点。当摄像机用的旁观模式玩家不会死，正常取材碰不到。
