# mc-anim：MC 动画项目

用 Remotion + three.js，拿 Minecraft 和模组里的真实模型、地形逐帧渲染动画。现在在做的作品是小说《机械动力应力转动》改编的漫剧：第 6、7 章从旧项目 `机械动力应力转动-AI漫画`（tag `冻结-1021` = `7d077904`）搬来，第 8 章起在这里做。回复、文档、注释、提交信息一律用中文。

## 目录
- `docs/`：架构、命名、迁移差异表、决策记录（`决策/`）、外部复用（`外部复用.md`）、`待办.md`（做完就删）。动手前先读 `docs/架构.md`、`docs/命名.md`
- `作品/<名>/`：一部作品自带的一切：`清单.ts`（唯一的段顺序表）、`场/<场键>/`、`段/<段键>/`、`核对/`、`注册.tsx`、`index.ts`、`台词.toml`、`旧名.tsv`、`默认.ts`（全片默认值）、`认可/<平台>/<段键>.toml`（用户认可的画面指纹），和本作品专有的角色、地点、配乐、配音。现有 `应力转动`、`把回忆拼好给你`、`亚波伦不放水`（Goety 短片，筹备中）。命令选作品：`--work <名>` > 当前目录 > `anim.local.toml` 的 `work` > 只有一部就用它（`docs/决策/0004-多作品.md`）。作品默认进 Git、开源（用户 10-22 定）；要私有的逐个挡：`.gitignore` 加 `/作品/<名>/`，或放 `作品/` 外用 `[works]` 登记
- `作品/应力转动/规矩.toml`：本作品的成片规矩（默认值、级别、原话、出处、落点、例外）。**规矩只登记在这里，不写进本文件**；`rules/通用.toml` 放各作品都守的，现在空着，升格要用户逐条定
- `engine/`：纯技术，不含剧情；`engine/段/` 是各作品共用的段框架。`库/`：多部作品会用的角色、生物、物品、界面、特效（原版、模组照原样做）。作品里引用写 `@engine/`、`@库/`
- `pipeline/`：`anim` 的实现。`py/anim_py/`：Python 叶子工具。`wasm/`：编成 WASM 的源码
- `sourcing/`：取材 mod、mcai、世界声明、jar 和提取配方
- `assets/registry/*.toml`：资产表（人写）；`assets/资产锁/<id>.json`：工具生成，不手改
- 数据根 `../mc-anim-data/`（`ANIM_DATA`，Git 外，各 worktree 共用）：`store/ 私有/ terrain/ cache/ game/ 基线/ 交付/ 发布/ archive/ run/`，缓存、交付按作品分子目录。发 B 站、抖音的成片（连封面、标题简介）放 `发布/<作品>/<UTC 月日-时分>-<一句话>/`：像软件发布一样一次一个夹，不编 V1、V2，旧版不删（用户 11-02 定）；`发布/<作品>/00-说明.md` 是发布记录，最新的写最前（用户 11-03 定）
- `预览/`：在主检出下，不进 Git；worktree 里生成的也写回主检出。Agent 自己看的中间稿，主题以「工作-」开头，写到数据根 `run/草稿/`，不进 `预览/`（用户 10-24 定）。冗余的自动删（用户 11-02 定）：`anim preview new` 顺手清，超过 3 天的夹只留文字挪进数据根 `archive/预览/`（规则见 `pipeline/预览/清理.ts`）；仓库里引用的 `预览/<夹>` 不在主检出就去那里找
- 路径语言：结构层（顶层目录、固定层级）用英文 ASCII；场、段、资产 id、台词 id、角色名用中文

## 常用命令（Mac/Linux 用 `anim`，Windows 用 `anim.cmd`；以 `anim help` 和各子命令 `--help` 为准）
```
anim sched [--json|--oneline] | sched watch | sched estimate <选择器> | sched lock-waits [--from <时刻>]    改调度必填 --why（docs/调度.md）
anim --low-priority <命令>                      排在全部普通票后面，给静帧让路（合并后统一渲用）
anim env | doctor | check [--fast|--deep] | studio        全局 --debug 打调用栈（或 ANIM_DEBUG=1）
anim film <选择器…> [--rerender] [--level 视频|预览] [--share] [--name <名>]   唯一的出片路：缺的段当场渲成切片再接成片（docs/决策/0014-单一出片路.md）
REMOTION_ANIM_TRIAL='{…}' anim film <段> [--frames a-b]   试看片：编码同切片、能和成片比，出到数据根 run/草稿/，不写切片、段签、交付（engine/core/试看.ts）
anim still <段> <帧…> --to-preview <主题> [--per-frame] [--tele …]   多帧默认同页连出，逐像素比用 --per-frame；看远处细节用 --tele 原生渲，不要裁图放大（docs/望远.md）
anim stale [<选择器>] [--strict]  |  anim bench <段> [--frames a-b]  |  anim timing [<段>] [--last n]
anim reuse <选择器…> --reason "…" [--sample N] [--dry-run]   过期段抽帧和旧切片比，在压缩噪声内就沿用，不比声音（docs/决策/0013-认指纹.md）
anim verify [<段>] [--render]  |  verify accept <段…> --reason …  |  verify backfill [<选择器>]
anim verify frames <选择器…> [--frames a-b] --save <名> | --compare <名> [--keep-images <目录>]   不写切片，不碰段签和认可
anim diff <A旧> <B新> [--to-preview <主题>] [--frames …|--every n] [--offset ±n]  |  anim still <段> <帧…> --to-preview <主题> --vs <检出|分支|main>   改前改后对比：出旧｜新｜差、块统计、最差几处的 --tele 复查命令
anim assets add <id> <文件> | measure [--check] | vendor | seed | pack [--upload] | pull   （0005、0006）
anim extract <配方|组…> | --all [--print-only|--check] [--register] | --licenses | --backfill-mesh | --download | --particle-frames […]
anim preview new <主题> | preview clean [--apply]   anim cache gc [--apply]
anim new work <作品> | new seg <段键> [--scene <场键>]   anim cues [--check]   段框架（docs/新段.md）
anim wt new <名> [--from <分支>]          开 worktree 并备好依赖
anim voice list|check|gen|review|use|lip|backends   配音链（台词.toml 一句一处）
anim world list|bake|transcode|far|decoder|edit|pregen|server|install-server|new|freeze|block|heightmap|map|slice   世界（docs/世界.md）
anim mcai <动作…>  |  anim gamedata export|verify    取材 mod 的命令行、从游戏导群系色和方块表
anim platform import <json>  |  anim platform analyze     B 站、抖音创作中心数据
```
还没实现：`anim music`、`anim assets import|verify`（字节核对用 `anim check --deep`）。取材 mod 的录制（`mcai record`）见 `docs/决策/0016-法术录制.md`。

Remotion 官方 skill `remotion-best-practices` 只当 API 参考：它说的 `npx remotion …` 一律换成 `anim studio|film|still`，不照它自行升级 Remotion；装法和其余差别见 `docs/新段.md`「Remotion skill」。

## 两条元规则（用户 10-21）
1. **看过的实现为准**：用户看过的已实现画面，优先于旧规矩、原设计和 Agent 写的规矩。冲突时留现状，列给用户，写清规矩出处和「现状是用户看过的」；用户这次点名才改。
2. **Agent 不得把规矩推广到全片**：用户针对某一处说的话，只按那一处做。觉得该全片通用的，在预览的 `00-说明.md` 里提议，用户点头后再登记进 `作品/应力转动/规矩.toml`。

## 工作纪律
- 逐文件 `git add <文件>`，不用 `-A` 或 `.`；按逻辑拆提交。不 push，要推送先问用户。
- 并行任务（包括子 Agent）各开 worktree，一律用 `anim wt new <名>`：不手动 `git worktree add`、不在 worktree 里自己装依赖、不整份克隆 `node_modules`（缓存会跟过去，一个 worktree 涨到 25 GB）、不软链主检出的（用户 11-06 定）。worktree 里不用 `git stash`：stash 列表各 worktree 共用，别人会 pop 走你的改动；要暂存就提交临时提交或拷到 scratchpad（用户 11-17 定）。依赖用 pnpm（用户 11-06 定），只留 `pnpm-lock.yaml`，加减依赖用 `pnpm add`，不用 npm 装。做完当次 `git merge --no-ff` 合进 main，`git cherry main <分支>` 没有 `+` 才删分支和 worktree，删前先清点被忽略的文件。不留没合并的分支。
- 子 Agent 在 worktree 里只出静帧看效果（看动作可 `anim still` 连出几帧），不渲整段、不做逐帧校验；这些由主 Agent 合并后用 `anim --low-priority …` 排（用户 11-06 定，依据见 `docs/决策/0012-调度.md`）。改渲染管线本身、必须真渲才验得了的活例外，派活时写明。
- 合并前 `anim check` 必须过。说「改好了」之前在 main 上核对：用户这次定的每一条都要在代码里查到，或者出静帧确认。
- 预期不改画面的改动（重构、搬代码、提速）用 `anim reuse` 验收，不要求逐字节不变（用户 11-11 定）；认不下的出改前改后并排静帧给用户定。`anim verify frames` 只用来查同一份代码走不同路径出的图是否一致。
- 要看清远处或小处的细节（自己判断、给用户看都算），一律用 `anim still --tele` 原生渲（`docs/望远.md`），不把整张静帧裁一块放大；裁图放大的图不能当证据（用户 11-15 定）。派子 Agent 出静帧时，任务书里写上这条。
- 给用户看的东西放 `预览/<月日-时分>-<主题>/`，时间用 UTC（`date -u +%m%d-%H%M`，代码里用 `time.gmtime()`）。一层平铺，文件名带编号，附 `00-说明.md`，末尾留「你的回复：」。数据根里已有的大文件（成片、整段视频）不复制进来，在 `00-说明.md` 里写 `![名](绝对路径)`，用户在 image-flow 侧栏「本页引用」里看（用户 11-05 定）。不覆盖旧的；换了变量就另开一个文件夹。
- **版本锁死**：Remotion 4.0.537（用户 10-22 定）、three 0.186.1、react 19.3.0、esbuild 0.28.1、Node 24，升级要用户点名。
- 全片默认值改在共用的地方（`作品/应力转动/默认.ts` 或对应的共用模块），段里不覆盖。确实要例外的，写成 `exception('规矩id', 值, {段, 原因})`（`engine/core/例外.ts`），同时登记进规矩表。
- 渲染、烘焙地形、开游戏这类重任务，先过资源闸。两个 MC 客户端不同时开。长任务开跑前，按 `run/logs/耗时.tsv` 报预计耗时。
- 作品不商用（用户 11-05 说没商用过）：取材、材质包、模组资产只记许可是什么，不问用户会不会商用、会不会踩线；非商用许可（如 CC BY-NC）照用。
- 大文件复制用 `cp -c`（APFS 克隆）。`store/` 只增不改；不进 Git 的字节一律按资产 id 登记（`docs/决策/0002-资产标准.md`）。
- 代码注释只写看代码看不出来的：用途、为什么（用户的决定写「用户 MM-DD 定」）、出处、坑。不写耗时和改动经过（这些看 git log）。文件头一般不超过 10 行。
- 旧项目 10-31 退役（用户定，以后只用 mc-anim），打包在外置硬盘，见 `docs/迁移.md`。
