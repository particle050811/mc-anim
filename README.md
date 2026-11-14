# mc-anim

用 [Remotion](https://www.remotion.dev/) + [three.js](https://threejs.org/) 逐帧渲 Minecraft 动画。方块、模型、贴图、动作、音效、地形都取自原版和模组里的真实资源，不重画；画面在浏览器里用 WebGL 一帧一帧算出来，再接成成片。

现在能渲的有两部作品，渲片要的全部素材（连配乐和配音）都挂在本仓库的 GitHub Release 上。clone 下来、拉完素材，就能在自己电脑上渲出和作者一样的成片：

| 作品 | 是什么 | 成片长度 | 素材 |
|---|---|---|---|
| 把回忆拼好给你 | MC 短片，配歌 | 约 56 秒 | 25 MB |
| 应力转动 | 小说《机械动力应力转动》改编的漫剧，第 6、7 章 | 约 5 分 55 秒 | 1.05 GB |

## 在自己电脑上渲出来

两种做法，步骤是同一份：

- **自己照着做**：[docs/从零渲染.md](docs/从零渲染.md)。从一台什么都没装的 Windows 电脑写起，每一步都写了「应该看到什么」；Mac / Linux 的差别在最后一节。
- **交给 AI 编程助手**（DeepSeek、Claude Code、Codex、Cursor 之类能在终端里跑命令的）：把下面的 prompt 复制给它。

### 复制给 AI 助手：两部都渲

```text
请在这台电脑上，把 GitHub 仓库 particle050811/mc-anim 里的「把回忆拼好给你」和「应力转动」两部作品渲成成片。
文档里写到的别的作品是还在做的，那几步跳过。

完整步骤在仓库的 docs/从零渲染.md。先读这份文档：
  curl.exe -L -o 从零渲染.md https://raw.githubusercontent.com/particle050811/mc-anim/main/docs/%E4%BB%8E%E9%9B%B6%E6%B8%B2%E6%9F%93.md
（Mac / Linux 把 curl.exe 换成 curl。读不到就告诉我，我把文档内容贴给你。）
clone 下来以后，以仓库里的 docs/从零渲染.md 为准。

照文档一步一步做，规矩：
1. 每一步跑完，核对文档写的「应该看到」，对上了再往下走。
2. 不改仓库里的任何文件，不用 npx remotion，装依赖只用 pnpm install --frozen-lockfile。
3. 要装软件、要我点管理员确认的时候，先说一声。
4. 碰到文档「常见问题」里没有的报错，停下来，把完整的命令和输出给我看，不要自己改代码绕过去。
5. 我的代理是 http://127.0.0.1:7890 ，连 GitHub 的步骤照文档「6. 代理」设上。（没有代理就删掉这一条。）

做完告诉我两部成片 mp4 的完整路径，和 ffprobe 量出来的时长。
```

### 复制给 AI 助手：只渲一部

```text
请照 GitHub 仓库 particle050811/mc-anim 的 docs/从零渲染.md，在这台电脑上只把「把回忆拼好给你」渲成成片。
（文档地址：https://raw.githubusercontent.com/particle050811/mc-anim/main/docs/%E4%BB%8E%E9%9B%B6%E6%B8%B2%E6%9F%93.md ）
第 5 步只拉这一部的素材，第 7 步只出这一部的静帧，第 8 步只跑这一部的 film。
别的规矩照文档开头「给 AI 助手的规矩」。做完告诉我成片的完整路径和时长。
```

把「把回忆拼好给你」换成「应力转动」就是渲另一部。

### 复制给 AI 助手：渲到一半出错了

```text
我在照 mc-anim 仓库的 docs/从零渲染.md 渲片，卡在下面这一步。请先读这份文档的「常见问题」和对应的那一步，
判断是哪种情况、该怎么做；文档里没写的情况，先告诉我你的判断，不要改仓库里的文件。

我跑的命令：
（贴命令）

完整输出：
（贴输出）
```

### 复制给 AI 助手：想改作品、做自己的

```text
我想基于 mc-anim 仓库改作品（或者做一部自己的）。请先读 docs/二次开发.md、docs/架构.md、docs/命名.md，
再告诉我要改的东西在哪些文件、怎么改、改完用哪条 anim 命令出静帧看效果。我想做的是：
（写你想做什么）
```

## 要准备什么

| 项 | 大概 |
|---|---|
| 电脑 | Windows 10 / 11（64 位）、Mac 或 Linux；独立显卡最好；内存 16 GB 起 |
| 硬盘 | 留 40 GB（代码和依赖 2 GB，素材 1.1 GB，渲染用的浏览器 0.6 GB，切片和成片 10～20 GB） |
| 时间 | 装工具、下载 0.5～1 小时。出片：作者的 Mac 上应力转动约 2 小时，把回忆拼好给你几十分钟，Windows 一般慢一半左右 |

## 下载源

考虑到不是人人都有代理，能走国内镜像的都走国内镜像：

- **国内镜像（不用代理）**：Git、Node、ffmpeg 的安装包，pnpm 和全部 npm 依赖，渲染用的浏览器。都从 [npmmirror](https://npmmirror.com/) 下。
- **只在 GitHub 上（国外，最好走代理）**：代码、一个 npm 依赖（`gelatin-game-engine`）、素材（Release 附件）。直连有时也能下，只是慢、容易断，断了重跑会接着下；素材每个附件都核 sha256，换个下载地址也不怕下到被改过的。

怎么设代理、没代理怎么办，见 [docs/从零渲染.md](docs/从零渲染.md)「6. 代理」。

## 文档

| 文档 | 给谁看 |
|---|---|
| [docs/从零渲染.md](docs/从零渲染.md) | 想在自己电脑上渲出成片的人（和他们的 AI 助手） |
| [docs/二次开发.md](docs/二次开发.md) | 想改作品、加素材、做自己作品的人 |
| [docs/架构.md](docs/架构.md)、[docs/命名.md](docs/命名.md) | 要读代码的人，先看这两篇 |
| [docs/新段.md](docs/新段.md)、[docs/世界.md](docs/世界.md)、[docs/游戏导表.md](docs/游戏导表.md) | 写新段、改地形、从游戏取数据 |
| [docs/决策/](docs/决策/) | 每个大决定为什么这样做；公开素材的来龙去脉在 [0017-全部公开.md](docs/决策/0017-全部公开.md) |
| [assets/README.md](assets/README.md) | 素材怎么登记、存在哪、怎么核对 |

`anim help` 列出全部命令，单条命令看 `anim <命令> --help`（Windows 用 `.\anim.cmd`）。

## 素材来源和版权

- Minecraft 的贴图、模型、音效、字体和从游戏世界导出的场景版权归 Mojang。本项目是非官方作品，与 Mojang 无关。NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
- 车万女仆（Touhou Little Maid）的模型、贴图、音效，和魔法酒狐模型：模型作者星海ELIYA、伊蕾娜教代行教皇，贴图作者百花，CC BY-NC-SA 4.0。九胡的音色参考取自车万女仆自定义模型包里的语音。
- 万法皆通（Touhou Little Maid: Spell，作者 yimeng261）的贴图和音效：MIT。
- 铁魔法（Iron's Spells 'n Spellbooks）、Lootr、暮色森林（The Twilight Forest）、机械动力（Create）和其他模组、整合包的模型、贴图、音效、结构归各自作者。
- 大气光照代码改写自 Photon 光影，许可见 `engine/light/大气/Photon-LICENSE.txt`。
- 「把回忆拼好给你」的原版贴图换成了 Faithful 64x 材质包（Faithful Resource Pack，https://faithfulpack.net ），按 Faithful License v4（https://faithfulpack.net/license ）使用和再分发；换了哪些见 `作品/把回忆拼好给你/材质包.锁.json`。本项目和 Faithful 团队无关。
- 配乐里有第三方的歌和曲子（如「把回忆拼好给你」用的抖音原声），版权归原作者，这里只为能复现作品而附带，不授予任何使用许可。
- 每件素材的来源、许可登记在 `assets/registry/*.toml` 和 `作品/<名>/资产表/*.toml`。
- 作品不商用。**权利人如果不希望自己的东西出现在这里，请开 issue**，作者会把它撤下、重打附件。

本仓库自己的代码用什么开源协议还没定，暂时不写。
