# 0009 调模型的事归 image-flow

- 状态：已做（10-31）。
- 依据：用户 10-31 的话：「话说这个配音相关应该用我开发的那个 imageflow 插件 而不是耦合在这个项目里吧」「包括后续 可能用到的AI 绘图也是」「改成抽出无窗口的 cli 且把需要补充的全部补充好」。

## 边界

| 归谁 | 什么 |
| --- | --- |
| image-flow | 调模型：IndexTTS2、RunningHub、绘图、视频；密钥、计费、任务记录、产物落盘；渠道增减 |
| mc-anim | `台词.toml`、挑候选、音色和起伏复核、裁静音、拉响度、口型、对齐、资产登记（`anim voice use`、`anim assets add`） |

## 怎么落的

- `py/anim_py/配音/后端/` 只剩一个 `image-flow` 后端：一个候选一条 `imgflow speak`，把产物转成 wav。`anim voice` 的其余步骤不变，`--允许付费` 照旧要给。
- 删了 `indextts2-runninghub`、`indextts2-本机`、`firered-本机`、`firered-魔搭`、`gpt-sovits`、`openai-speech` 和配置 `firered`、`indextts`、`gpt_sovits`。对齐器 `aligner` 不动：它不是合成，`anim voice lip` 要用。资产表 `来源` 里的旧后端名是历史记录，不改。
- 壳的位置是配置 `image_flow`（`ANIM_IMAGE_FLOW`），默认 image-flow 仓库里的 `skills/image-flow/imgflow.mjs`，不用 `.claude/skills/` 那份副本：worktree 里没有副本。image-flow 不用开窗口，也能在 worktree 里跑。
- 模型默认 `custom:indextts2`，配在 `~/.image-flow/settings.json`。要别的模型写 `[配音.后端参数.image-flow]` 的 `模型`。本机模型（打包在外置硬盘）要再用，在 image-flow 里配成渠道，不回到这里。

## 和原来不一样的两点

- **种子**：IndexTTS2Run 节点没有种子输入，原来的 4 个种子也从没发给 RunningHub，只是 4 次采样的编号。现在照旧，`--param` 不传种子。
- **没有语气参考**：原来直接报错「IndexTTS2 要语气参考录音」，而全部台词只有 2 句写了语气参考，默认后端换成 IndexTTS2 后大多数句子出不了。现在拿音色录音当语气、强度固定 1（节点必须接一路语气）。

## AI 绘图

这边没有绘图代码要搬。以后一律用 image-flow 出图，定稿用 `anim assets add` 登记。还没启用的付费复核 `听写`、`语气`（`py/anim_py/配音/复核.py`，现在只有接口和 dry-run）启用时也走 image-flow，不在这里读密钥调接口。
