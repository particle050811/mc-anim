# stress-rotation：《机械动力应力转动》漫剧

把小说《机械动力应力转动》改编成漫剧：用 Remotion + three.js，拿游戏和模组里的真实模型、地形逐帧渲染成片。第 6、7 章从旧项目 `机械动力应力转动-AI漫画`（tag `冻结-1021` = `7d077904`）搬来，第 8 章起在这里做。回复、文档、注释、提交信息一律用中文。

## 目录
- `docs/`：架构、命名、迁移差异表、决策记录（`决策/`）、`旧名.tsv`。动手前先读 `docs/架构.md`、`docs/命名.md`
- `rules/规矩.toml`：成片规矩，写默认值、级别、原话、出处、落点、例外。**规矩只登记在这里，不写进本文件**
- `story/`：剧本、`台词.toml`、`角色.toml`
- `content/`：`清单.ts`（唯一的段顺序表）、`场/<场键>/`、`段/<段键>/`、`核对/`、`注册.tsx`、`设置.ts`
- `engine/`：纯技术，不含剧情。`world/`：跨场共用的角色、生物、物品、地点、界面、特效；全片默认值放 `world/默认.ts`
- `pipeline/`：`sr` 的实现（环境、闸、指纹、渲、合成、剪辑包、适配器、检查）。`py/sr_py/`：Python 叶子工具
- `sourcing/`：取材 mod、mcai、世界声明、jar 和提取配方
- `assets/registry/*.toml`：资产表（人写）；`assets/资产锁.json`：工具生成，不手改
- `verify/accepted/<平台>/<段键>.toml`：用户认可的画面指纹
- 数据根 `../stress-rotation-data/`（环境变量 `SR_DATA`，Git 外，各 worktree 共用这一份）：`store/ 私有/ terrain/ cache/ 基线/ 交付/ archive/ run/`
- `预览/`：在主检出下，不进 Git；worktree 里生成的预览也写回主检出
- 路径语言：结构层（顶层目录、固定层级）用英文 ASCII；场、段、资产 id、台词 id、角色名用中文

## 常用命令（Mac/Linux 用 `sr`，Windows 用 `sr.cmd`；以 `sr help` 为准）
```
sr env | doctor | check [--快|--深] | studio
sr render <选择器> [--到预览 <主题>]     选择器全字匹配：段键、段名、编号、场键、章
sr still <段> <帧…> --到预览 <主题>      sr stale [<选择器>]
sr verify [<段>]  |  sr verify accept <段> --理由 …
sr film <范围>  |  sr assets add <id> <文件>  |  sr preview new <主题>
sr extract <配方|组…> | --全部 [--只打印|--检查]   按 sourcing/extract.toml 从 jar 导出，sha 和资产锁一样才入库
sr mcai <动作…>                          取材 mod 的命令行；开游戏、编译过资源闸
```
还没实现（方案三-5）：`sr edit-package`、`sr jianying export|readback`（M3）；`sr world`（M10，现在只有模板 `sourcing/worlds/`）；`sr voice`、`sr music`、`sr assets import|verify|pull|gc`（没排阶段；字节核对现在用 `sr check --深`，旧项目导入用 `assets/tools/导入旧项目.py`）。

## 两条元规则（用户 10-21）
1. **看过的实现为准**：用户看过的已实现画面，优先于旧规矩、原设计和 Agent 写的规矩。冲突时留现状，列给用户，写清规矩出处和「现状是用户看过的」；用户这次点名才改。
2. **Agent 不得把规矩推广到全片**：用户针对某一处说的话，只按那一处做。觉得该全片通用的，在预览的 `00-说明.md` 里提议，用户点头后再登记进 `rules/规矩.toml`。

## 工作纪律
- 逐文件 `git add <文件>`，不用 `-A` 或 `.`；按逻辑拆提交。不 push，要推送先问用户。
- 并行任务各开 worktree：`git worktree add ../stress-rotation-wt/<名> -b <名> main`。做完当次 `git merge --no-ff` 合进 main，`git cherry main <分支>` 没有 `+` 才删分支和 worktree；删之前先清点被忽略的文件。不留没合并的分支。
- 合并前 `sr check` 必须过。说「改好了」之前在 main 上核对：用户这次定的每一条都要在代码里查到，或者出静帧确认。
- 给用户看的东西放 `预览/<月日-时分>-<主题>/`，时间用 UTC（`date -u +%m%d-%H%M`，代码里用 `time.gmtime()`）。文件夹里一层平铺，文件名带编号，附一份 `00-说明.md`，末尾留「你的回复：」。不覆盖旧的；换了变量就另开一个文件夹。
- **迁移不改画面**：搬迁期间不改任何画面、规矩数值、镜头、台词，不借机「顺手统一」。版本锁死 Remotion 4.0.530、three 0.186.1、react 19.3.0、esbuild 0.28.1、Node 24，旧项目退役前不升级。和旧版对不上时，只能按 `docs/迁移.md` 的两种情况接受，并逐条登记。
- 全片默认值改在共用的地方（`world/默认.ts` 或对应的共用模块），段里不覆盖。确实要例外的，写成 `例外('规矩id', 值, {段, 原因})`，同时登记进规矩表。
- 渲染、烘焙地形、开游戏这类重任务，先过资源闸；迁移期间 `SR_LOCK_DIR` 指向旧项目的 `.资源闸/`。两个 MC 客户端不同时开。长任务开跑前，按 `run/logs/耗时.tsv` 报预计耗时。
- 大文件复制用 `cp -c`（APFS 克隆）。`store/` 只增不改；不进 Git 的字节一律按资产 id 登记（见 `docs/决策/0002-资产标准.md`）。
- 代码注释只写看代码看不出来的：用途、为什么（用户的决定写「用户 MM-DD 定」）、出处、坑。不写耗时和改动经过（这些看 git log）。文件头一般不超过 10 行。
- 旧项目只读；那边只为出片做小修，见 `docs/迁移.md`。
