#!/usr/bin/env python3
"""取材配方「粒子翻译」的入口：转给 py/anim_py/动作翻译/粒子.py（实现和用法在那边，python -m anim_py.动作翻译.粒子 --help）。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "py"))
from anim_py.动作翻译.粒子 import main

sys.exit(main())
