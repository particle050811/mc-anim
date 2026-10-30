"""配音链（anim voice 调）：TTS 后端出候选、原件裁静音拉响度成成品、字级对齐、按字算口型。JSON 进、JSON 出，路径都由 anim 给。

入口是 python -m anim_py.配音 <动作> <请求.json>，结果 JSON 打在 stdout 最后一行，进度打 stderr。动作见 __main__.py。
"""
