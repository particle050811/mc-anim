# 0003 改名 mc-anim

- 状态：已定（用户 10-21）
- 原名：仓库 `stress-rotation`、数据根 `stress-rotation-data`、命令 `sr`、环境变量前缀 `SR_`（`0001-另起新项目.md` 当时定的）。

## 背景

用户 10-21：「从广义来讲 这个应该是一个 MC 动画的项目 而不仅仅只是应力转动 要不换个名字？」仓库装的是用游戏和模组的真实模型、地形渲染动画的整套管线，《机械动力应力转动》只是现在在做的作品。

## 决定

- 仓库 `mc-anim`（以后 GitHub 仓库名也用它），数据根默认在主检出同级的 `mc-anim-data`。
- 命令 `anim`（Windows `anim.cmd`）。不用 `mca`：和取材命令 `mcai` 太像。
- 环境变量前缀 `ANIM_`（如 `ANIM_DATA`），本机配置 `anim.local.toml`，Python 包 `anim_py`，npm/pyproject 项目名 `mc-anim`。
- `mcai` 和 `MCAI_*` 不改：它是对外单独开源的取材工具，本仓库里经 `anim mcai` 调。
- 作品名不改：《机械动力应力转动》、章、场、段、角色、台词的名字和内容照旧。

## 后果

- 资源闸锁协议和锁目录不变（迁移期仍是旧项目 `.资源闸/`）。
- 段指纹和路径、项目名无关，改名后 37 段指纹都没变，不重渲。进段指纹的文件（`remotion.config.ts`、`pipeline/资产/webpack.ts`、`content/注册.tsx`、`content/段定义.ts`、`engine/` 里三处）注释和报错里还写着 `sr`：改一个字节所有段指纹都变，等以后真改这些文件时顺手换成 `anim`。
- 数据根里的历史记录（`交付/*/manifest.json`、旧运行记录、`run/logs/耗时.tsv` 的旧行）保留旧路径和旧命令名，不改。
