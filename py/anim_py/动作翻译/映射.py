"""名字映射：把 jar 里的类名、成员名换成 Mojang 官方名，翻译器里认 API（ModelPart.xRot、Mth.cos…）一律按官方名。
- 恒等：jar 本来就是官方名（NeoForge 1.20.2 起的运行时、Minecraft 26.1 起不混淆的客户端、开发环境的 jar）
- ProGuard：官方发的 client.txt（官方名 → 混淆名），配混淆的原版客户端 jar（1.14.4 起每个版本都有）
- SRG：Forge 1.17～1.20.1 的运行时名（类名已是官方名，成员是 m_14089_、f_104203_）；mcp_config 的 obf→srg 表接上 client.txt 得到 srg→官方名。
  SRG 名全局唯一（覆写的方法共用一个），按名字直接查，不用沿类层级找
"""

from __future__ import annotations

import re
from typing import Any

_基本 = {"int": "I", "float": "F", "boolean": "Z", "byte": "B", "char": "C", "short": "S", "long": "J", "double": "D", "void": "V"}


def 换描述符(d: str, 换类) -> str:
    return re.sub(r"L([^;]+);", lambda m: "L" + 换类(m.group(1)) + ";", d)


class 恒等映射:
    名称 = "恒等"

    def 绑定(self, 路径: Any) -> None:
        self.路径 = 路径

    def 类(self, jar名: str) -> str:
        return jar名

    def 反查类(self, 名: str) -> str:
        return 名

    def 描述(self, d: str) -> str:
        return 换描述符(d, self.类)

    def 字段(self, 所属: str, 名: str, 描述: str) -> str:
        return 名

    def 方法(self, 所属: str, 名: str, 描述: str) -> str:
        return 名


class ProGuard映射(恒等映射):
    """client.txt：`官方类 -> 混淆类:`，下面缩进的成员行 `[行:行:]类型 名字[(参数)] -> 混淆名`"""

    名称 = "ProGuard"

    def __init__(self, 文件: str):
        官到混: dict[str, str] = {}
        成员: dict[str, list[tuple[str, str, str | None, str]]] = {}
        当前 = ""
        with open(文件, encoding="utf-8") as f:
            for 行 in f:
                if not 行.strip() or 行.startswith("#"):
                    continue
                if not 行[0].isspace():
                    m = re.match(r"(\S+) -> (\S+):", 行)
                    if not m:
                        continue
                    当前 = m.group(1).replace(".", "/")
                    官到混[当前] = m.group(2).replace(".", "/")
                    成员[当前] = []
                    continue
                m = re.match(r"\s+(?:\d+:\d+:)?(\S+) ([^\s(]+)(\(([^)]*)\))?(?::\d+:\d+)? -> (\S+)", 行)
                if m:
                    成员[当前].append((m.group(1), m.group(2), m.group(4) if m.group(3) else None, m.group(5)))
        self.官到混 = 官到混
        self.混到官 = {v: k for k, v in 官到混.items()}

        def 类型描述(t: str) -> str:
            n = 0
            while t.endswith("[]"):
                t, n = t[:-2], n + 1
            base = _基本.get(t) or "L" + 官到混.get(t.replace(".", "/"), t.replace(".", "/")) + ";"
            return "[" * n + base

        # 按混淆名建表：字段 (名, 描述) → 官方名，方法 (名, 描述) → 官方名
        self.字段表: dict[str, dict[tuple[str, str], str]] = {}
        self.方法表: dict[str, dict[tuple[str, str], str]] = {}
        for 官, 列 in 成员.items():
            混 = 官到混[官]
            字, 方 = self.字段表.setdefault(混, {}), self.方法表.setdefault(混, {})
            for 类型, 名, 参数, 混名 in 列:
                if 参数 is None:
                    字[(混名, 类型描述(类型))] = 名
                else:
                    ps = "".join(类型描述(p) for p in 参数.split(",") if p)
                    方[(混名, f"({ps}){类型描述(类型)}")] = 名
        self._原始: dict[str, Any] = {}

    def 类(self, jar名: str) -> str:
        if jar名.startswith("["):
            return 换描述符(jar名, self.类)
        return self.混到官.get(jar名, jar名)

    def 反查类(self, 名: str) -> str:
        return self.官到混.get(名, 名)

    def _父们(self, 混类: str) -> list[str]:
        if 混类 not in self._原始:
            self._原始[混类] = self.路径.原始类(混类) if hasattr(self, "路径") else None
        c = self._原始[混类]
        if c is None:
            return []
        return ([c.父类] if c.父类 else []) + list(c.接口)

    def _沿层级(self, 表: dict[str, dict[tuple[str, str], str]], 所属: str, 名: str, 描述: str) -> str:
        if 名 in ("<init>", "<clinit>"):
            return 名
        待, 见 = [所属], set()
        while 待:
            c = 待.pop(0)
            if c in 见:
                continue
            见.add(c)
            got = 表.get(c, {}).get((名, 描述))
            if got is not None:
                return got
            待.extend(self._父们(c))
        return 名

    def 字段(self, 所属: str, 名: str, 描述: str) -> str:
        return self._沿层级(self.字段表, 所属, 名, 描述)

    def 方法(self, 所属: str, 名: str, 描述: str) -> str:
        return self._沿层级(self.方法表, 所属, 名, 描述)


class SRG映射(恒等映射):
    """tsrg / tsrg2（mcp_config 的 config/joined.tsrg 或 forge 安装器生成的 mappings.txt，混淆名 → SRG 名）+ client.txt"""

    名称 = "SRG"

    def __init__(self, tsrg文件: str, 官方: ProGuard映射):
        self.srg到官: dict[str, str] = {}
        当前 = ""
        with open(tsrg文件, encoding="utf-8") as f:
            for 行 in f:
                if 行.startswith("tsrg2") or not 行.strip():
                    continue
                if not 行[0].isspace():
                    当前 = 行.split()[0]
                    continue
                if 行.startswith("\t\t"):
                    continue  # tsrg2 的参数、static 标记
                parts = 行.split()
                if len(parts) == 2:  # 字段：混淆名 srg名
                    for (混名, _d), 官 in 官方.字段表.get(当前, {}).items():
                        if 混名 == parts[0]:
                            self.srg到官[parts[1]] = 官
                elif len(parts) >= 3:  # 方法：混淆名 混淆描述 srg名
                    官 = 官方.方法表.get(当前, {}).get((parts[0], parts[1]))
                    if 官 is not None:
                        self.srg到官[parts[2]] = 官

    def 字段(self, 所属: str, 名: str, 描述: str) -> str:
        return self.srg到官.get(名, 名)

    def 方法(self, 所属: str, 名: str, 描述: str) -> str:
        return self.srg到官.get(名, 名)


def 读映射(说明: str | None):
    """命令行写法：不给 = 恒等；proguard:<client.txt>；srg:<tsrg>,<client.txt>"""
    if not 说明 or 说明 == "恒等":
        return 恒等映射()
    kind, _, rest = 说明.partition(":")
    if kind == "proguard":
        return ProGuard映射(rest)
    if kind == "srg":
        tsrg, client = rest.split(",", 1)
        return SRG映射(tsrg, ProGuard映射(client))
    raise ValueError(f"不认识的映射：{说明}（恒等 | proguard:<client.txt> | srg:<tsrg>,<client.txt>）")
