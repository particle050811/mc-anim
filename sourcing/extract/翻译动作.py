#!/usr/bin/env python3
"""取材配方「动作翻译」的入口：转给 py/anim_py/动作翻译（实现、用法和测试都在那边，python -m anim_py.动作翻译 --help）。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "py"))
from anim_py.动作翻译.__main__ import main

sys.exit(main())
