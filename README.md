# mc-anim

用 [Remotion](https://www.remotion.dev/) + [three.js](https://threejs.org/) 逐帧渲 Minecraft 动画：模型、贴图、音效、地形都取自原版和模组里的真实资源，不重画。仓库里有两部作品：

- `作品/把回忆拼好给你/`：MC 短片，配歌「把回忆拼好给你」。**clone 下来就能渲**，渲片要用的贴图、模型、音效都在 `作品/把回忆拼好给你/字节/` 里，只有歌不带（见下面「加上歌」）。
- `作品/应力转动/`：小说《机械动力应力转动》改编的漫剧（第 6、7 章）。要的字节和地形包太大，挂在 GitHub Release，先 `anim assets pull` 拉下来（2.39 GB）再渲，见下面「渲「应力转动」」。

## 要装的

- Node 24（`.nvmrc`）和 npm
- ffmpeg、ffprobe（在 PATH 上，或用环境变量 `ANIM_FFMPEG`、`ANIM_FFPROBE` 指定）
- Git；先 `git config --global core.quotepath false`（中文路径照原样显示），Windows 上再 `git config --global core.longpaths true`
- 第一次渲染时 Remotion 会自己下载 Chrome Headless Shell，要联网

## 渲「把回忆拼好给你」

Windows（cmd 或 PowerShell 都行）：

```
git clone <仓库地址> mc-anim
cd mc-anim
npm ci
.\anim.cmd doctor
.\anim.cmd --作品 把回忆拼好给你 render 2
.\anim.cmd --作品 把回忆拼好给你 film 2
```

Mac / Linux：

```
git clone <仓库地址> mc-anim
cd mc-anim
npm ci
./anim doctor
./anim --作品 把回忆拼好给你 render 2
./anim --作品 把回忆拼好给你 film 2
```

- 刚 clone 下来跑 `doctor`，「数据根/…不在」「资产字节：…件不在数据根」这几项会报 ✗、退出码 1：数据根第一次渲染时自动建，第 2 章要的字节渲染前从 `字节/` 补进去，剩下缺的是别的段和《应力转动》的，不影响第 2 章。其余几项（Node、npm 依赖、ffmpeg、git 设置）要过。
- `render 2` 把第 2 章各段渲成母版，`film 2` 接成成片，出到数据根的 `交付/把回忆拼好给你/<UTC 月日-时分>-2/2.mp4`（`--名 <名>` 换掉文件夹和文件名里的 `2`）。
- 母版、成片这些大文件放在 Git 外的数据根，默认是仓库旁边的 `mc-anim-data/`，用环境变量 `ANIM_DATA` 可以换。`anim env` 列出本机各项配置。
- 改一次代码重渲一次，旧版本母版会越攒越多：`./anim cache gc` 列出能删的旧母版、旧草稿、旧 webpack 缓存和能省多少，看过再加 `--执行` 删。
- 渲染前会把 `作品/把回忆拼好给你/字节/` 里的文件核过 sha256 补进数据根的 `store/`，也可以手动跑 `anim assets seed`。
- 仓库只带第 2 章和封面帧要用的字节。别的段（`1-一如既往` 和几个核对画面）要的九胡、李樱模型、私有截图等不带，打包时每段提示一行「这段打进包的是占位」，渲它们才报错，不影响第 2 章。
- 只想先看一眼：`./anim --作品 把回忆拼好给你 still 选择世界 30 --到预览 试渲`（Windows 把 `./anim` 换成 `.\anim.cmd`，下同），静帧写到 `预览/` 下。
- 其他命令看 `./anim help`，单条命令的参数看 `./anim <命令> --help`。

## 加上歌

歌是第三方音乐，不随仓库发。没有歌也能渲，那段就是静音，渲的时候会提示一行；`film` 还会多报几处「接缝…首帧重复」（接缝两边都静音时的判法），只是提醒，不丢帧。

1. 歌是抖音拍同款原声「@杀死比赛创作的原声」（cici 版，56 秒）。仓库只认登记的那一份：m4a，sha256 是 `cf59eff8cbfa99743db00fc882f3332a6b1d8a07b0f29357c1dda7aded79869e`，来历记在 `作品/把回忆拼好给你/资产表/配乐.toml`（从一条拍同款视频的音轨用 ffmpeg `-c copy` 原样抽出，没重编码）。
2. 收进数据根（只放进 `私有/`，不进 Git）：

   ```
   .\anim.cmd --作品 把回忆拼好给你 assets add 配乐/把回忆拼好给你-抖音原声 <你的 m4a 路径>
   ./anim --作品 把回忆拼好给你 assets add 配乐/把回忆拼好给你-抖音原声 <你的 m4a 路径>
   ```

   sha256 对不上会被拒，说明不是同一份文件（开头可能差几十毫秒，歌词和画面的卡点就错开了）。不要加 `--替换`，那会改掉资产锁。
3. 重新 `render 2`、`film 2`。歌的有无记在段指纹里，加上歌以后用到它的段会自动重渲。

## 渲「应力转动」

```
./anim --作品 应力转动 assets pull
./anim --作品 应力转动 render 6
./anim --作品 应力转动 film 6
```

- `assets pull` 从 Release `assets-v1` 下 4 个 tar（共 2.39 GB：字节 224 MB，三个地形包），核过 sha256 解进数据根的 `store/`、`terrain/`；断了重跑会接着下，已经有的跳过。走代理就先设 `HTTPS_PROXY`。
- 没 pull 就渲，开头会提示一行缺多少；用到缺的东西的段渲不了。
- 只想先看一眼：`./anim --作品 应力转动 still 6-飞越主世界俯冲边城 60 --到预览 试渲`。
- 耗时参考：MacBook Air（M 系列）上 `render 6-7` 连同核对段约 43 分钟，单个地形段 10～17 分钟。

## 给台词配音（anim voice）

作品的 `台词.toml` 是台词的唯一来源；配音、口型由 `anim voice` 从它出。要 [uv](https://docs.astral.sh/uv/)（Python 工具跑在它管的项目 venv 里，版本按 `uv.lock`；复核第一次跑会装 torch），TTS 和对齐模型在各自的仓库里自己装，位置写进 `anim.local.toml`（见 `anim.local.toml.example`）。

```
./anim voice backends                       有哪些 TTS 后端、这台机器上缺什么
./anim voice gen <台词 id> --dry-run        看要发给后端的请求，不合成
./anim voice gen <台词 id>                  按 [配音] 的种子各出一个候选，进数据根 run/草稿/配音/
./anim voice review <台词 id>               复核候选：音色相似度、音高和响度起伏（gen 完自动跑），报告在候选目录的 复核.md
./anim voice use <台词 id> <候选.wav>       定稿：裁静音、拉响度、登记成私有资产、写回 台词.toml、出 台词/<id>.ts
./anim voice lip [前缀]                     重出口型（字的起止 → 嘴型）
./anim voice check [前缀]                   核对配音、句模块、口型能不能按字重算出来
```

- 云端后端要加 `--允许云端`，按次收费的要加 `--允许付费`；本机模型和渲染一样排队过资源闸。
- 细节见 `docs/架构.md`「配音」。

## 素材来源和版权

- Minecraft 的贴图、模型、音效、字体和从游戏世界导出的场景版权归 Mojang。本项目是非官方作品，与 Mojang 无关。NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
- 车万女仆（Touhou Little Maid）的模型、贴图、音效，和魔法酒狐模型：模型作者星海ELIYA、伊蕾娜教代行教皇，贴图作者百花，CC BY-NC-SA 4.0。
- 万法皆通（Touhou Little Maid: Spell，作者 yimeng261）的贴图和音效：MIT。
- 铁魔法（Iron's Spells 'n Spellbooks）、Lootr、暮色森林（The Twilight Forest）的贴图归各自作者。
- 大气光照代码改写自 Photon 光影，许可见 `engine/light/大气/Photon-LICENSE.txt`。
- 每件素材的来源、许可登记在 `assets/registry/*.toml` 和 `作品/<名>/资产表/*.toml`，规则见 `assets/README.md`。

本仓库自己的代码用什么开源协议还没定，暂时不写，以后再决定。

## 改地形、看地形

地形从 Minecraft 存档烘成区段包再渲染，世界的来龙去脉写在 `sourcing/worlds/<世界>.toml`，不开游戏改地形写在同名的 `.编辑.toml`（MC 命令写法：fill、setblock、clone、摆 .nbt / .schem 结构）。要有取材服务端的存档（`ANIM_GAME`），只看烘好的地形包加 `--包 <名>`。

```
./anim world list                                   列世界声明、要烘的包、登记的版本
./anim world bake <世界> [--包 <名>] [--不登记]       读存档、套编辑、烘区段包、登记版本
./anim world edit check|replay <世界>                校验编辑；生成游戏里重放的命令
./anim world map <世界> <x1> <z1> <x2> <z2>          俯视图（PNG，带坐标网格）
./anim world slice <世界> x|z <位置> <起> <止>        切面图
./anim world block|heightmap …                       查方块、高度图
./anim world pregen <世界>                           打印预生成（Chunky）命令
```

详见 `docs/世界.md`。

## 再往下

- 架构、命名、决策记录在 `docs/`，先看 `docs/架构.md`。
- 新段、新作品怎么写看 `docs/新段.md`：`anim new work <作品名>`、`anim new seg <段键> --场 <场键>` 照模板建文件，`anim cues` 按 `段.ts` 的声音 cue 生成本段的声音表和地址表（render、still、studio 开跑前自动跑）；跨段的声音写在场时间线上。
- `作品/把回忆拼好给你/字节/` 由 `anim assets vendor` 照 `作品/把回忆拼好给你/随仓库.toml` 现算重写，`anim check` 核对它和代码的引用一致，见 `docs/决策/0005-随仓库发字节.md`。
- 应力转动 挂 Release 的附件由 `anim assets pack --上传` 照 `作品/应力转动/随发布.toml` 打、传，`作品/应力转动/发布锁.json` 记每个附件的 sha256，`anim check` 核对它和代码要的一致，见 `docs/决策/0006-挂Release发字节.md`。
