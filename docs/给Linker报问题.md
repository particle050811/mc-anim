# 给 Linker 报问题

Linker（BaiGave 的 Blender 插件，和我们同一定位）的问题都提到 GitHub 反馈仓库 `Linker-DEV-Team/linker-feedback`。作者那边每两小时自动查一次：AI 先分析、查重、尝试修复，再经测试和开发者评审，发版后在原 issue 回复。这个流程是用户在 Linker 交流群里提议的（用户 11-15 说）。群里的消息不会进这个流程，问题一律提 issue。

第一次按这份文档报的是 [#2](https://github.com/Linker-DEV-Team/linker-feedback/issues/2)（导入卡住，起初以为是 `cull_caves`，查下来是玩家死了），可以照着写。

## 先查重，一次一题

```
gh issue list -R Linker-DEV-Team/linker-feedback --state all --search "<报错关键词>"
```

- 已经有人报过：在原 issue 下补充，不新开。
- 一个 issue 只写一个问题；之后的补充都回复在原 issue 里。

## 先初步查一下原因

不要只报现象（用户 11-15 说）。报之前先缩小范围：哪一步开始坏、换参数或范围还坏不坏、重启后能不能恢复，再看日志和覆盖报告里卡在哪个阶段。查到的可能原因写进 issue，猜测要标明是猜测。

## 要收集的信息

模板（`.github/ISSUE_TEMPLATE/bug.yml`）的必填项是：模块、Linker 版本、Blender 版本、MC 与加载器、环境、复现步骤、预期、实际。不涉及的写「不适用」，不知道的写「未知」。

| 项 | 写什么、去哪找 |
|---|---|
| Linker 版本 | 插件包和游戏端 jar 的完整文件名，比如 `linker_blender-1.0.20-windows-x64-blender-5.zip`、`linker-1.0.20-neoforge-1.21.1.jar`。写一句和 Release 上的 sha256 对过 |
| Blender | 版本和构建号（启动日志第一行，如 `5.2.3 LTS (hash e13b728c6880)`）。注明是界面里操作，还是用自动化命令行（`transport/automation_client run --request …`） |
| MC 与加载器 | MC 版本、加载器版本、Java 版本；单人还是服务器 |
| 环境 | 系统版本、CPU、显卡和驱动版本、内存；`mods/` 里的全部模组（文件名带版本）、光影、资源包；世界种子、是否开结构、用到的区块是否预生成 |
| 复现步骤 | 按顺序列表，**成功的步骤也列上**（带耗时、产物大小），失败的地方才看得出差别。命令行跑的话附失败那步的完整请求 JSON。中途强制结束过游戏或 Blender 要写明，并写清第一次出错是在强制结束之前还是之后 |
| 预期、实际 | 实际结果写报错原文，不要转述 |

## 证据从哪拿

| 证据 | 位置 |
|---|---|
| 命令行跑的结果 | 输出目录里的 `result.json`：`failures`、`counts`（`source_chunks_processed`、`tiles_received`、`polygons`）、`effective_options`；还有 `blender.log` |
| 游戏端导入报告 | 游戏目录 `linker-reports/world-import/coverage-*.jsonl`。第一行是摘要（`stage`、`reason`、`elapsed_ms`、`expected_sections`、`processed_sections`），后面每行一个区块。文件名 0～7 循环覆盖，按时间认是哪一次的 |
| 游戏日志 | 游戏目录 `logs/latest.log`、`debug.log`，取出错时刻前后的几行。每次导入结束都有 `SocketException: Connection reset`，那是 Blender 断开连接，成功的导入也有，不算问题 |
| 诊断包 | Blender 顶栏「Linker 诊断包」（Linker Diagnostics）导出 ZIP。命令行没有对应子命令（11-15 在 [#2](https://github.com/Linker-DEV-Team/linker-feedback/issues/2#issuecomment-6906190884) 请作者加了），先用后台 Blender 调 `bpy.ops.linker.export_diagnostics(filepath=…, reveal=False)` 导，做法见下面。这样导的 Blender 没连过游戏，游戏端那几项是空的，issue 里要说明 |
| 截图、录屏 | 画面不对的问题要附 |

命令行导诊断包：把下面的脚本存成 `导诊断包.py`，然后运行 `blender.exe --background --factory-startup --disable-autoexec --python 导诊断包.py -- <插件包里的 linker_blender 目录> <输出.zip>`。

```python
import sys, pathlib, bpy
pkg, out = sys.argv[sys.argv.index("--") + 1:][:2]
sys.path.insert(0, str(pathlib.Path(pkg).parent))
import linker_blender
linker_blender.register()
print(bpy.ops.linker.export_diagnostics(filepath=out, reveal=False))
```

`gh` 传不了附件：正文里直接贴文字摘录。截图、诊断 ZIP 要在网页上编辑 issue 拖进去，这一步交给用户。

## 公开前脱敏

issue 的正文和附件都是公开的。

- 本机路径换成 `%LOCALAPPDATA%`、`<游戏目录>` 这类写法；不写用户名、主机名、局域网 IP。
- 激活码、订单号、私人素材不放进 issue，发邮件到 support@baigave.cn，并在 issue 里写一句「已发邮件」。
- 诊断包上传前先解开看一遍内容。1.0.20 的包已经把用户目录换成 `<USER>`、令牌换成 `<REDACTED>`，但仍要自己看一遍。

## 建 issue

正文先写进 scratchpad 里的 md 文件，各节标题照模板写（`### 问题模块 / Area`……），标题以 `[Bug] ` 开头：

```
gh issue create -R Linker-DEV-Team/linker-feedback --title "[Bug] <一句话>" --body-file <正文.md>
```

- 外部账号加不了标签，`--label` 写了也不会生效，不影响提交。
- 兼容问题用 `compatibility.yml` 的格式，功能建议用 `feature.yml`。
- 报完把 issue 链接告诉用户，作者回复了再跟进。

## 笔记本上的复现环境

Linker 只能在 Windows 上跑，用渲染笔记本（`ssh render-laptop`）。11-07 起的测试环境都在 `D:\linker-test`：

- `mc\`：portablemc 装的 NeoForge 1.21.1 客户端，存档是 `mc\saves\world`（种子 20261107）。玩家是生存模式，客户端开久了会被幻翼打死；玩家死着时导入会空等 5 分钟后报 `range_bake_progress_stalled`（#2），先在游戏里点「重生」。
- `launch-client-20.cmd`：用来起客户端。要用计划任务 `LinkerTestClient20` 在桌面会话里起（`schtasks /run`）；8765 端口开始监听就说明游戏进了存档。
- `req\`：请求 JSON。
- `runall-20.py <名…>`：按顺序跑这些请求，每次的耗时和峰值内存记在 `results\progress.log`，产物放在 `runs\<名>\`。
- `addon-1.0.20\`：解开的插件。换新版本时，新解一份插件，再把 `mc\mods` 里的 jar 换掉，旧 jar 挪到 `mc\mods-<版本>\`。
