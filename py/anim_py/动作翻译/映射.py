"""名字映射：把 jar 里的类名、成员名换成 Mojang 官方名，翻译器里认 API（ModelPart.xRot、Mth.cos…）一律按官方名。
- 恒等：jar 本来就是官方名（NeoForge 1.20.2 起的运行时、Minecraft 26.1 起不混淆的客户端、开发环境的 jar）
- ProGuard：官方发的 client.txt（官方名 → 混淆名），配混淆的原版客户端 jar（1.14.4 起每个版本都有）
- SRG：Forge 1.17～1.20.1 的运行时名（类名已是官方名，成员是 m_14089_、f_104203_）；mcp_config 的 obf→srg 表接上 client.txt 得到 srg→官方名。
  SRG 名全局唯一（覆写的方法共用一个），按名字直接查，不用沿类层级找
"""

from __future__ import annotations

import re
from typing import Any

_basic_desc = {"int": "I", "float": "F", "boolean": "Z", "byte": "B", "char": "C", "short": "S", "long": "J", "double": "D", "void": "V"}


def remap_descriptor(d: str, remap_class) -> str:
    return re.sub(r"L([^;]+);", lambda m: "L" + remap_class(m.group(1)) + ";", d)


class IdentityMapping:
    mapping_name = "恒等"

    def bind_path(self, classpath: Any) -> None:
        self.路径 = classpath

    def 类(self, jar_name: str) -> str:
        return jar_name

    def reverse_lookup_class(self, class_name: str) -> str:
        return class_name

    def map_descriptor(self, d: str) -> str:
        return remap_descriptor(d, self.类)

    def field(self, owner: str, field_name: str, descriptor: str) -> str:
        return field_name

    def method_ref(self, owner: str, method_name: str, descriptor: str) -> str:
        return method_name


class ProGuardMapping(IdentityMapping):
    """client.txt：`官方类 -> 混淆类:`，下面缩进的成员行 `[行:行:]类型 名字[(参数)] -> 混淆名`"""

    mapping_name = "ProGuard"

    def __init__(self, file_path: str):
        official_to_mixed: dict[str, str] = {}
        members: dict[str, list[tuple[str, str, str | None, str]]] = {}
        current_class = ""
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                if not line.strip() or line.startswith("#"):
                    continue
                if not line[0].isspace():
                    m = re.match(r"(\S+) -> (\S+):", line)
                    if not m:
                        continue
                    current_class = m.group(1).replace(".", "/")
                    official_to_mixed[current_class] = m.group(2).replace(".", "/")
                    members[current_class] = []
                    continue
                m = re.match(r"\s+(?:\d+:\d+:)?(\S+) ([^\s(]+)(\(([^)]*)\))?(?::\d+:\d+)? -> (\S+)", line)
                if m:
                    members[current_class].append((m.group(1), m.group(2), m.group(4) if m.group(3) else None, m.group(5)))
        self.official_to_mixed = official_to_mixed
        self.obf_to_official = {v: k for k, v in official_to_mixed.items()}

        def type_descriptor(t: str) -> str:
            n = 0
            while t.endswith("[]"):
                t, n = t[:-2], n + 1
            base = _basic_desc.get(t) or "L" + official_to_mixed.get(t.replace(".", "/"), t.replace(".", "/")) + ";"
            return "[" * n + base

        # 按混淆名建表：字段 (名, 描述) → 官方名，方法 (名, 描述) → 官方名
        self.field_map: dict[str, dict[tuple[str, str], str]] = {}
        self.method_map: dict[str, dict[tuple[str, str], str]] = {}
        for official, column_entries in members.items():
            mixed_name = official_to_mixed[official]
            fields, methods = self.field_map.setdefault(mixed_name, {}), self.method_map.setdefault(mixed_name, {})
            for value_type, name, params, obf_name in column_entries:
                if params is None:
                    fields[(obf_name, type_descriptor(value_type))] = name
                else:
                    ps = "".join(type_descriptor(p) for p in params.split(",") if p)
                    methods[(obf_name, f"({ps}){type_descriptor(value_type)}")] = name
        self._raw_cache: dict[str, Any] = {}

    def 类(self, jar_name: str) -> str:
        if jar_name.startswith("["):
            return remap_descriptor(jar_name, self.类)
        return self.obf_to_official.get(jar_name, jar_name)

    def reverse_lookup_class(self, class_name: str) -> str:
        return self.official_to_mixed.get(class_name, class_name)

    def _parents(self, mixed_class: str) -> list[str]:
        if mixed_class not in self._raw_cache:
            self._raw_cache[mixed_class] = self.路径.raw_class(mixed_class) if hasattr(self, "路径") else None
        c = self._raw_cache[mixed_class]
        if c is None:
            return []
        return ([c.parent_class] if c.parent_class else []) + list(c.is_interface)

    def _walk_hierarchy(self, table: dict[str, dict[tuple[str, str], str]], owner: str, member_name: str, descriptor: str) -> str:
        if member_name in ("<init>", "<clinit>"):
            return member_name
        pending, seen = [owner], set()
        while pending:
            c = pending.pop(0)
            if c in seen:
                continue
            seen.add(c)
            got = table.get(c, {}).get((member_name, descriptor))
            if got is not None:
                return got
            pending.extend(self._parents(c))
        return member_name

    def field(self, owner: str, field_name: str, descriptor: str) -> str:
        return self._walk_hierarchy(self.field_map, owner, field_name, descriptor)

    def method_ref(self, owner: str, method_name: str, descriptor: str) -> str:
        return self._walk_hierarchy(self.method_map, owner, method_name, descriptor)


class SrgMapping(IdentityMapping):
    """tsrg / tsrg2 表，两种方向都认：
    - 混淆名 → SRG：mcp_config 的 obf_to_srg.tsrg（tsrg）、config/joined.tsrg（tsrg2「obf srg id」），要配 client.txt 经混淆名接到官方名
    - 官方名 → SRG：ForgeGradle 的 build/createMcpToSrg/output.tsrg（tsrg2「left right」），直接反过来，不要 client.txt
    方向按整个文件定：tsrg2 头写 obf 的是前一种；否则看第一个改了名的类，第一列在 client.txt 的混淆类名里就是前一种。
    成员行按第二列是不是描述符分字段、方法：tsrg2 的字段行也是三列（多一列 id），不能按列数分"""

    mapping_name = "SRG"

    def __init__(self, tsrg_path: str, official_mapping: ProGuardMapping | None = None):
        self.srg_to_official: dict[str, str] = {}
        current_class = ""
        obf_direction: bool | None = False if official_mapping is None else None
        mixed_fields: dict[str, str] = {}
        with open(tsrg_path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                if line.startswith("tsrg2"):
                    if obf_direction is None and line.split()[1:2] == ["obf"]:
                        obf_direction = True
                    continue
                if not line[0].isspace():
                    current_class = line.split()[0]
                    if obf_direction is None and official_mapping is not None and official_mapping.obf_to_official.get(current_class, current_class) != current_class:
                        obf_direction = True
                    elif obf_direction is None and official_mapping is not None and official_mapping.official_to_mixed.get(current_class, current_class) != current_class:
                        obf_direction = False
                    if obf_direction and official_mapping is not None:
                        mixed_fields = {obf_name: official for (obf_name, _d), official in official_mapping.field_map.get(current_class, {}).items()}
                    continue
                if line.startswith("\t\t"):
                    continue  # tsrg2 的参数、static 标记
                parts = line.split()
                is_method = len(parts) >= 3 and parts[1].startswith("(")
                srg = parts[2] if is_method else parts[1]
                if srg == parts[0]:
                    continue  # <init>、没改名的覆写（toString 等）
                if not obf_direction or official_mapping is None:
                    self.srg_to_official[srg] = parts[0]
                    continue
                official = official_mapping.method_map.get(current_class, {}).get((parts[0], parts[1])) if is_method else mixed_fields.get(parts[0])
                if official is not None:
                    self.srg_to_official[srg] = official

    def field(self, owner: str, field_name: str, descriptor: str) -> str:
        return self.srg_to_official.get(field_name, field_name)

    def method_ref(self, owner: str, method_name: str, descriptor: str) -> str:
        return self.srg_to_official.get(method_name, method_name)


def read_mapping(spec: str | None):
    """命令行写法：不给 = 恒等；proguard:<client.txt>；srg:<tsrg>[,<client.txt>]（混淆名 → SRG 的表要带 client.txt）"""
    if not spec or spec == "恒等":
        return IdentityMapping()
    kind, _, rest = spec.partition(":")
    if kind == "proguard":
        return ProGuardMapping(rest)
    if kind == "srg":
        tsrg, _, client = rest.partition(",")
        return SrgMapping(tsrg, ProGuardMapping(client) if client else None)
    raise ValueError(f"不认识的映射：{spec}（恒等 | proguard:<client.txt> | srg:<tsrg>[,<client.txt>]）")
