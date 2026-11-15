"""中文标识符改英文的 Python 半边（迁移做完整个 pipeline/改名/ 删掉）。只用标准库：ast 拿位置，symtable 定作用域，tokenize 找 def/class 名。

组怎么分（Python 没有类型，成员按名字保守归一组）：
- 函数里的局部变量、参数、闭包变量：按 symtable 解到声明它的那个函数作用域，一个函数一组；
- 模块级的名字：一个模块一组，`from m import 名`（不改名）把导入方并进 m 的组，`m.名`（m 是仓库里的模块）也并进去；
- 成员：类体里的名字、`x.名` 属性、解不到被调函数的关键字实参 `f(名=…)`、方法的同名参数，全仓按名字一组（保守：同名的成员一起改）；
- 关键字实参解得到被调函数（同文件的函数、从仓库模块导入的函数）就并进那个参数的组；
- 模块名（文件名留中文）不改；`d['名']`、`.get('名')`、字典字面量的键这类字符串键单独成组（种类「字符串键」），是盘上字段，和 TS 的盘上字段用同一张字段表。
核对：改前改后对改了的文件把全部名字（不只含汉字的）各分一次组，按改名前位置比划分，一样才算过（遮住内置名、撞名都会让划分变）；再 py_compile。

用法：
  python3 pipeline/改名/py改名.py scan --out <目录>                 # groups.jsonl、scan.json、stats.json
  python3 pipeline/改名/py改名.py apply --scan <目录> --table <tsv> [--write]
  python3 pipeline/改名/py改名.py boundary --scan <目录> --ts-scan <TS 扫描目录>   # 两边都出现的盘上字段
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import io
import json
import os
import py_compile
import re
import subprocess
import symtable
import sys
import tempfile
import time
import tokenize
from dataclasses import dataclass, field

HAN = re.compile(r"[㐀-鿿豈-﫿\U00020000-\U0003134f]")
IDENT_LIKE = re.compile(r"^[\w]+$")
IO_HINT = re.compile(r"json\.(load|dump)|tomllib|tomli|\.json['\"]|\.toml['\"]")


@dataclass
class Occ:
    file: str
    line: int  # 1 起
    col: int  # 字符列，0 起
    text: str
    key: str
    kind: str  # 声明的种类；引用为空
    string: bool = False


@dataclass
class FileInfo:
    rel: str
    text: str
    lines: list[str]
    tree: ast.Module
    table: symtable.SymbolTable
    module: str  # 点分模块名（猜的），给 import 解析用


class UF:
    def __init__(self) -> None:
        self.p: dict[str, str] = {}

    def find(self, a: str) -> str:
        self.p.setdefault(a, a)
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def git_py_files(root: str) -> list[str]:
    out = subprocess.run(["git", "-c", "core.quotepath=off", "ls-files", "-z", "--", "*.py"], cwd=root, capture_output=True, check=True).stdout
    return sorted(f for f in out.decode().split("\0") if f and os.path.exists(os.path.join(root, f)))


def module_name(rel: str) -> str:
    p = rel[:-3]
    if p.startswith("py/"):
        p = p[3:]
    if p.endswith("/__init__"):
        p = p[: -len("/__init__")]
    return p.replace("/", ".")


def char_col(line: str, byte_col: int) -> int:
    return len(line.encode("utf-8")[:byte_col].decode("utf-8", errors="replace"))


SCOPE_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)
COMP_NAME = {ast.ListComp: "listcomp", ast.SetComp: "setcomp", ast.DictComp: "dictcomp", ast.GeneratorExp: "genexpr"}


def scope_key(n: ast.AST) -> tuple[str, int]:
    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return (n.name, n.lineno)
    if isinstance(n, ast.Lambda):
        return ("lambda", n.lineno)
    return (COMP_NAME[type(n)], n.lineno)


class Scanner:
    """all_names=False 只收含汉字的名字；核对时 True，收全部名字（看有没有遮住、撞上原来的名字）"""

    def __init__(self, root: str, files: list[str], all_names: bool = False, texts: dict[str, str] | None = None) -> None:
        self.root = root
        self.all_names = all_names
        self.uf = UF()
        self.occs: list[Occ] = []
        self.errors: list[str] = []
        self.infos: dict[str, FileInfo] = {}
        self.by_module: dict[str, FileInfo] = {}
        self.defs: dict[str, tuple[str, list[str], bool]] = {}  # 绑定键 → (函数作用域键, 参数名, 是不是类)
        self.method_params: list[tuple[str, str]] = []  # (参数键, 名)
        self.kw_sites: list[tuple[Occ, str | None]] = []  # (关键字出现处, 被调者绑定键)
        self.unmapped: list[str] = []
        for rel in files:
            text = texts[rel] if texts and rel in texts else open(os.path.join(root, rel), encoding="utf-8").read()
            try:
                tree = ast.parse(text, rel)
                table = symtable.symtable(text, rel, "exec")
            except SyntaxError as e:
                self.errors.append(f"{rel}: 解析不了 {e}")
                continue
            info = FileInfo(rel, text, text.split("\n"), tree, table, module_name(rel))
            self.infos[rel] = info
            self.by_module[info.module] = info
            # sourcing/ 这类脚本按同目录 import：再按文件名登记一次
            self.by_module.setdefault(os.path.basename(rel)[:-3], info)

    def want(self, name: str) -> bool:
        return self.all_names or bool(HAN.search(name))

    def add(self, info: FileInfo, line: int, col: int, text: str, key: str, kind: str = "", string: bool = False) -> Occ | None:
        if not self.want(text) and not string:
            return None
        o = Occ(info.rel, line, col, text, key, kind, string)
        self.occs.append(o)
        self.uf.find(key)
        return o

    # ---- 解析 import 指到哪个仓库模块 ----
    def resolve_module(self, info: FileInfo, mod: str | None, level: int) -> FileInfo | None:
        if level:
            base = info.module.split(".")
            if not info.rel.endswith("__init__.py"):
                base = base[:-1]
            base = base[: len(base) - (level - 1)] if level > 1 else base
            full = ".".join(base + ([mod] if mod else []))
        else:
            full = mod or ""
        return self.by_module.get(full)

    def run(self) -> None:
        for info in self.infos.values():
            self.scan_file(info)
        # 关键字实参：解得到被调函数就并进参数组，解不到并进成员组；方法的同名参数也并进成员组
        unresolved_kw: set[str] = set()
        def_by_root = {self.uf.find(k): v for k, v in self.defs.items()}
        for occ, callee in self.kw_sites:
            d = def_by_root.get(self.uf.find(callee)) if callee else None
            if d and not d[2] and occ.text in d[1]:
                self.uf.union(occ.key, f"L:{d[0]}:{occ.text}")
            else:
                self.uf.union(occ.key, f"M:{occ.text}")
                unresolved_kw.add(occ.text)
        for key, name in self.method_params:
            if name in unresolved_kw:
                self.uf.union(key, f"M:{name}")

    def scan_file(self, info: FileInfo) -> None:
        # symtable 子表按 (名, 行) 排队，和 ast 的作用域节点配对
        queue: dict[tuple[str, int], list[symtable.SymbolTable]] = {}

        def index(t: symtable.SymbolTable) -> None:
            for c in t.get_children():
                queue.setdefault((c.get_name(), c.get_lineno()), []).append(c)
                index(c)

        index(info.table)
        tables: dict[int, symtable.SymbolTable] = {}
        parents: dict[int, symtable.SymbolTable | None] = {info.table.get_id(): None}

        def pair(n: ast.AST, parent_table: symtable.SymbolTable) -> None:
            for c in ast.iter_child_nodes(n):
                if isinstance(c, SCOPE_NODES):
                    q = queue.get(scope_key(c))
                    if q:
                        t = q.pop(0)
                        tables[id(c)] = t
                        parents[t.get_id()] = parent_table
                        pair(c, t)
                        continue
                    self.errors.append(f"{info.rel}:{c.lineno} 作用域配不上 symtable")
                pair(c, parent_table)

        pair(info.tree, info.table)
        by_id = {info.table.get_id(): info.table}
        for t in tables.values():
            by_id[t.get_id()] = t
        mod_bound = {s.get_name() for s in info.table.get_symbols() if s.is_assigned() or s.is_imported()}
        imported_mods: dict[str, FileInfo] = {}  # 模块级名字 → 它指向的仓库模块（import x as y、from pkg import 子模块）
        rel = info.rel

        def tkey(t: symtable.SymbolTable, name: str) -> str:
            if t.get_type() == "module":
                return f"G:{rel}:{name}" if name in mod_bound else f"B:{name}"
            if t.get_type() == "class":
                return f"M:{name}"
            return f"L:{rel}:{t.get_id()}:{name}"

        def resolve(t: symtable.SymbolTable, name: str) -> str:
            """名字在作用域 t 里指向哪个绑定"""
            try:
                s = t.lookup(name)
            except KeyError:
                return tkey(info.table, name)
            if t.get_type() == "module":
                return tkey(t, name)
            if s.is_global() or s.is_declared_global():
                return tkey(info.table, name)
            if s.is_free() or (hasattr(s, "is_nonlocal") and s.is_nonlocal()):
                p = parents.get(t.get_id())
                while p is not None:
                    if p.get_type() == "function":
                        try:
                            ps = p.lookup(name)
                            if ps.is_local() and not ps.is_free():
                                return tkey(p, name)
                        except KeyError:
                            pass
                    p = parents.get(p.get_id())
                return tkey(info.table, name)
            if s.is_local() or s.is_parameter():
                if t.get_type() == "class":
                    return f"M:{name}"
                return tkey(t, name)
            return tkey(info.table, name)

        tokens = list(tokenize.generate_tokens(io.StringIO(info.text).readline))
        names_at: dict[tuple[int, int], str] = {}
        for tk in tokens:
            if tk.type == tokenize.NAME:
                names_at[(tk.start[0], tk.start[1])] = tk.string

        def next_name_after(line: int, col: int, kw: str | None = None, want: str | None = None) -> tuple[int, int] | None:
            seen_kw = kw is None
            for tk in tokens:
                if tk.start < (line, col) or tk.type != tokenize.NAME:
                    continue
                if not seen_kw:
                    if tk.string == kw:
                        seen_kw = True
                    continue
                if want is None or tk.string == want:
                    return tk.start
            return None

        def pos_of(node: ast.AST, end: bool = False, length: int = 0) -> tuple[int, int]:
            if end:
                line = node.end_lineno or 0
                return line, char_col(info.lines[line - 1], node.end_col_offset or 0) - length
            line = node.lineno
            return line, char_col(info.lines[line - 1], node.col_offset)

        mapped: set[tuple[int, int]] = set()

        def occ(line: int, col: int, text: str, key: str, kind: str = "") -> Occ | None:
            mapped.add((line, col))
            return self.add(info, line, col, text, key, kind)

        def call_target(t: symtable.SymbolTable, f: ast.expr) -> str | None:
            if isinstance(f, ast.Name):
                return resolve(t, f.id)
            if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name):
                k = resolve(t, f.value.id)
                m = imported_mods.get(k)
                if m:
                    return f"G:{m.rel}:{f.attr}"
            return None

        def visit(n: ast.AST, t: symtable.SymbolTable, in_class: bool) -> None:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                for d in n.decorator_list:
                    visit(d, t, in_class)
                p = next_name_after(n.lineno, char_col(info.lines[n.lineno - 1], n.col_offset), "class" if isinstance(n, ast.ClassDef) else "def", n.name)
                bkey = resolve(t, n.name)
                if p:
                    kind = "类" if isinstance(n, ast.ClassDef) else ("方法" if in_class else "函数")
                    occ(p[0], p[1], n.name, bkey, kind)
                inner = tables.get(id(n))
                if isinstance(n, ast.ClassDef):
                    for b in n.bases + [k.value for k in n.keywords]:
                        visit(b, t, in_class)
                    self.defs[bkey] = ("", [], True)
                    if inner:
                        for s in n.body:
                            visit(s, inner, True)
                    return
                args = n.args
                for d in args.defaults + [x for x in args.kw_defaults if x is not None]:
                    visit(d, t, in_class)
                for a in args.posonlyargs + args.args + args.kwonlyargs + ([args.vararg] if args.vararg else []) + ([args.kwarg] if args.kwarg else []):
                    if a.annotation:
                        visit(a.annotation, t, in_class)
                if n.returns:
                    visit(n.returns, t, in_class)
                if inner:
                    params = [a.arg for a in args.posonlyargs + args.args + args.kwonlyargs]
                    self.defs[bkey] = (f"{rel}:{inner.get_id()}", params, False)
                    for a in args.posonlyargs + args.args + args.kwonlyargs + ([args.vararg] if args.vararg else []) + ([args.kwarg] if args.kwarg else []):
                        k = tkey(inner, a.arg)
                        l, c = pos_of(a)
                        occ(l, c, a.arg, k, "参数")
                        if in_class:
                            self.method_params.append((k, a.arg))
                    for s in n.body:
                        visit(s, inner, False)
                return
            if isinstance(n, ast.Lambda):
                for d in n.args.defaults:
                    visit(d, t, in_class)
                inner = tables.get(id(n), t)
                for a in n.args.posonlyargs + n.args.args + n.args.kwonlyargs:
                    l, c = pos_of(a)
                    occ(l, c, a.arg, tkey(inner, a.arg), "参数")
                visit(n.body, inner, False)
                return
            if isinstance(n, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
                inner = tables.get(id(n), t)
                gens = n.generators
                # 第一个 iter 在外层作用域求值
                visit(gens[0].iter, t, in_class)
                for i, g in enumerate(gens):
                    visit(g.target, inner, False)
                    if i:
                        visit(g.iter, inner, False)
                    for c in g.ifs:
                        visit(c, inner, False)
                for e in [getattr(n, "elt", None), getattr(n, "key", None), getattr(n, "value", None)]:
                    if e is not None:
                        visit(e, inner, False)
                return
            if isinstance(n, ast.Name):
                l, c = pos_of(n)
                k = resolve(t, n.id)
                kind = ""
                if isinstance(n.ctx, ast.Store):
                    kind = "成员" if in_class else ("模块变量" if t.get_type() == "module" else "局部变量")
                occ(l, c, n.id, k, kind)
                return
            if isinstance(n, ast.Attribute):
                visit(n.value, t, in_class)
                l, c = pos_of(n, end=True, length=len(n.attr))
                key = f"M:{n.attr}"
                if isinstance(n.value, ast.Name):
                    m = imported_mods.get(resolve(t, n.value.id))
                    if m:
                        key = f"G:{m.rel}:{n.attr}"
                occ(l, c, n.attr, key, "成员" if isinstance(n.ctx, ast.Store) else "")
                return
            if isinstance(n, (ast.Import, ast.ImportFrom)):
                src = self.resolve_module(info, n.module, n.level) if isinstance(n, ast.ImportFrom) else None
                if isinstance(n, ast.ImportFrom):
                    # from 包.模块 import …：模块路径是文件名，不改
                    start = (n.lineno, char_col(info.lines[n.lineno - 1], n.col_offset))
                    for tk in tokens:
                        if tk.start < start or tk.type != tokenize.NAME:
                            continue
                        if tk.string == "import":
                            break
                        mapped.add(tk.start)
                for a in n.names:
                    l, c = pos_of(a)
                    if isinstance(n, ast.Import):
                        # import a.b.c [as x]：模块路径是文件名，不改；as 的名字是本地别名
                        for part in a.name.split("."):
                            mapped.add((l, c))
                            c += len(part) + 1
                        if a.asname:
                            l2, c2 = pos_of(a, end=True, length=len(a.asname))
                            k = resolve(t, a.asname)
                            m = self.by_module.get(a.name)
                            if m:
                                imported_mods[k] = m
                            occ(l2, c2, a.asname, k, "导入别名")
                        else:
                            m = self.by_module.get(a.name.split(".")[0])
                        continue
                    if a.name == "*":
                        continue
                    local = a.asname or a.name
                    k = resolve(t, local)
                    sub = self.resolve_module(info, f"{n.module}.{a.name}" if n.module else a.name, n.level)
                    if sub:
                        # from pkg import 子模块：模块名是文件名，不改
                        imported_mods[k] = sub
                        mapped.add((l, c))
                        if a.asname:
                            l2, c2 = pos_of(a, end=True, length=len(a.asname))
                            occ(l2, c2, a.asname, k, "导入别名")
                        else:
                            self.add(info, l, c, a.name, f"F:{a.name}", "模块名")
                        continue
                    target = f"G:{src.rel}:{a.name}" if src else None
                    if a.asname:
                        if target:
                            occ(l, c, a.name, target)
                        else:
                            mapped.add((l, c))
                        l2, c2 = pos_of(a, end=True, length=len(a.asname))
                        occ(l2, c2, a.asname, k, "导入别名")
                    else:
                        o = occ(l, c, a.name, k)
                        if target and o:
                            self.uf.union(k, target)
                        elif target:
                            self.uf.union(k, target)
                return
            if isinstance(n, (ast.Global, ast.Nonlocal)):
                line = n.lineno
                col = char_col(info.lines[line - 1], n.col_offset)
                for name in n.names:
                    p = next_name_after(line, col + 1, None, name)
                    if p:
                        occ(p[0], p[1], name, resolve(t, name))
                return
            if isinstance(n, ast.ExceptHandler):
                if n.type:
                    visit(n.type, t, in_class)
                if n.name:
                    p = next_name_after(n.lineno, char_col(info.lines[n.lineno - 1], n.col_offset), "as", n.name)
                    if p:
                        occ(p[0], p[1], n.name, resolve(t, n.name), "局部变量")
                for s in n.body:
                    visit(s, t, in_class)
                return
            if isinstance(n, ast.Call):
                visit(n.func, t, in_class)
                for a in n.args:
                    visit(a, t, in_class)
                callee = call_target(t, n.func)
                for kw in n.keywords:
                    if kw.arg:
                        l, c = pos_of(kw)
                        o = occ(l, c, kw.arg, f"KW:{rel}:{l}:{c}")
                        if o:
                            self.kw_sites.append((o, callee))
                    visit(kw.value, t, in_class)
                # 字符串键：x.get('名')、getattr(x, '名')
                if isinstance(n.func, ast.Attribute) and n.func.attr in ("get", "pop", "setdefault") and n.args:
                    self.string_key(info, n.args[0])
                if isinstance(n.func, ast.Name) and n.func.id in ("getattr", "setattr", "hasattr") and len(n.args) > 1:
                    self.string_key(info, n.args[1], "M")
                return
            if isinstance(n, ast.Subscript):
                self.string_key(info, n.slice)
            if isinstance(n, ast.Dict):
                for k in n.keys:
                    if k is not None:
                        self.string_key(info, k)
            if isinstance(n, ast.Compare) and any(isinstance(o, (ast.In, ast.NotIn)) for o in n.ops):
                self.string_key(info, n.left)
            if isinstance(n, (ast.MatchAs, ast.MatchStar)) and n.name:
                p = next_name_after(n.lineno, char_col(info.lines[n.lineno - 1], n.col_offset), None, n.name)
                if p:
                    occ(p[0], p[1], n.name, resolve(t, n.name), "局部变量")
            for c in ast.iter_child_nodes(n):
                visit(c, t, in_class)

        for s in info.tree.body:
            visit(s, info.table, False)
        for (line, col), name in names_at.items():
            if HAN.search(name) and (line, col) not in mapped:
                self.unmapped.append(f"{rel}:{line}:{col + 1} {name}")

    def string_key(self, info: FileInfo, node: ast.AST, ns: str = "S") -> None:
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and HAN.search(node.value) and IDENT_LIKE.match(node.value):
            line = node.lineno
            seg = info.lines[line - 1]
            c0 = char_col(seg, node.col_offset)
            i = seg.find(node.value, c0)
            if i >= 0 and node.lineno == node.end_lineno:
                self.add(info, line, i, node.value, f"{ns}:{node.value}" if ns == "S" else f"M:{node.value}", "字符串键", string=True)


# ---------- 成组、输出 ----------


def build_groups(sc: Scanner) -> list[dict]:
    members: dict[str, list[Occ]] = {}
    for o in sc.occs:
        members.setdefault(sc.uf.find(o.key), []).append(o)
    groups: list[dict] = []
    used: dict[str, int] = {}
    io_files = {rel for rel, i in sc.infos.items() if IO_HINT.search(i.text)}
    for root_key, occs in members.items():
        occs.sort(key=lambda o: (o.file, o.line, o.col))
        names = sorted({o.text for o in occs})
        name = next((x for x in names if HAN.search(x)), names[0])
        if not HAN.search(name):
            continue
        keys = {o.key for o in occs}
        decls = [o for o in occs if o.kind]
        kinds = sorted({o.kind for o in decls})
        anchor = decls[0] if decls else occs[0]
        if any(k.startswith("F:") for k in keys):
            kind = "模块名"
        elif any(k.startswith("S:") for k in keys) and all(o.string for o in occs):
            kind = "字符串键"
        elif any(k.startswith("M:") for k in keys):
            kind = "成员"
        elif any(k.startswith("G:") for k in keys):
            kind = next((k for k in ("类", "函数") if k in kinds), "模块变量")
        else:
            kind = next((k for k in ("类", "函数", "参数", "局部变量", "导入别名") if k in kinds), "局部变量")
        if kind == "字符串键":
            gid = f"'{name}'"
        elif kind in ("成员", "模块名"):
            gid = f".{name}" if kind == "成员" else f"模块:{name}"
        elif any(k.startswith("G:") for k in keys):
            gfile = next(k for k in sorted(keys) if k.startswith("G:")).split(":")[1]
            gid = f"{gfile}#{name}"
        else:
            gid = f"{anchor.file}#{name}@{anchor.line}"
        n = used.get(gid, 0)
        used[gid] = n + 1
        if n:
            gid += f"~{n + 1}"
        info = sc.infos[anchor.file]
        files = sorted({o.file for o in occs})
        uses = []
        for o in occs:
            if len(uses) >= 3:
                break
            if o is anchor or any(u["file"] == o.file for u in uses):
                continue
            uses.append({"file": o.file, "line": o.line, "text": sc.infos[o.file].lines[o.line - 1].strip()[:200]})
        flags: dict = {}
        if kind in ("字符串键", "成员"):
            strs = [o for o in occs if o.string]
            if strs:
                flags["stringKeys"] = len(strs)
            io = [f for f in files if f in io_files]
            if kind == "字符串键" or (strs and io):
                flags["disk"] = "是" if io else "疑似"
                if io:
                    flags["diskEvidence"] = io[:5]
        if kind == "模块名":
            flags["fileName"] = True
        groups.append(
            {
                "id": gid,
                "name": name,
                "kind": kind,
                "kinds": kinds,
                "files": len(files),
                "count": len(occs),
                "decl": {"file": anchor.file, "line": anchor.line, "col": anchor.col + 1},
                "context": {
                    "before": [info.lines[i] for i in range(max(0, anchor.line - 3), anchor.line - 1)],
                    "line": info.lines[anchor.line - 1][:200],
                    "after": [info.lines[i][:200] for i in range(anchor.line, min(len(info.lines), anchor.line + 2))],
                },
                "uses": uses,
                "flags": flags,
                "locs": [[o.file, o.line, o.col, o.text, 1 if o.string else 0] for o in occs],
            }
        )
    groups.sort(key=lambda g: g["id"])
    return groups


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode()).hexdigest()


def cmd_scan(root: str, out: str) -> None:
    t0 = time.time()
    files = git_py_files(root)
    sc = Scanner(root, files)
    sc.run()
    groups = build_groups(sc)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "groups.jsonl"), "w") as f:
        for g in groups:
            f.write(json.dumps({k: v for k, v in g.items() if k != "locs"}, ensure_ascii=False) + "\n")
    by_kind: dict[str, int] = {}
    for g in groups:
        by_kind[g["kind"]] = by_kind.get(g["kind"], 0) + 1
    stats = {
        "seconds": round(time.time() - t0, 1),
        "files": len(sc.infos),
        "groups": len(groups),
        "distinctNames": len({g["name"] for g in groups}),
        "occurrences": sum(g["count"] for g in groups),
        "byKind": by_kind,
        "disk是": sum(1 for g in groups if g["flags"].get("disk") == "是"),
        "disk疑似": sum(1 for g in groups if g["flags"].get("disk") == "疑似"),
        "unmappedHanTokens": sc.unmapped[:50],
        "unmappedCount": len(sc.unmapped),
        "errors": sc.errors,
    }
    hashes = {rel: sha1(i.text) for rel, i in sc.infos.items()}
    with open(os.path.join(out, "scan.json"), "w") as f:
        json.dump({"root": root, "hashes": hashes, "groups": groups}, f, ensure_ascii=False)
    with open(os.path.join(out, "stats.json"), "w") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


def partition(root: str, files: list[str], texts: dict[str, str], back: dict[str, dict[tuple[int, int], tuple[int, int]]]) -> set[frozenset]:
    """全部名字分组后，只看这些文件里的出现处，按改名前位置给出划分"""
    sc = Scanner(root, git_py_files(root), all_names=True, texts=texts)
    sc.run()
    groups: dict[str, set] = {}
    fs = set(files)
    for o in sc.occs:
        if o.file not in fs:
            continue
        pos = back.get(o.file, {}).get((o.line, o.col), (o.line, o.col))
        groups.setdefault(sc.uf.find(o.key), set()).add((o.file, *pos))
    return {frozenset(g) for g in groups.values()}


def cmd_apply(root: str, scan_dir: str, table_path: str, write: bool) -> int:
    t0 = time.time()
    scan = json.load(open(os.path.join(scan_dir, "scan.json")))
    by_id = {g["id"]: g for g in scan["groups"]}
    errors: list[str] = []
    edits: dict[str, list[tuple[int, int, str, str]]] = {}
    for raw in open(table_path, encoding="utf-8"):
        line = raw.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        gid, new = parts[0].strip(), parts[1].strip()
        g = by_id.get(gid)
        if not g:
            errors.append(f"扫描结果里没有组 {gid}")
            continue
        if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", new) or new in ("None", "True", "False") or __import__("keyword").iskeyword(new):
            errors.append(f"{gid} 的新名 {new} 不能用")
            continue
        if g["kind"] == "模块名":
            errors.append(f"{gid} 是模块名（文件名），不改")
            continue
        for f, ln, col, old, _s in g["locs"]:
            edits.setdefault(f, []).append((ln, col, old, new))
    files = sorted(edits)
    texts: dict[str, str] = {}
    back: dict[str, dict[tuple[int, int], tuple[int, int]]] = {}
    for f in files:
        text = open(os.path.join(root, f), encoding="utf-8").read()
        if sha1(text) != scan["hashes"].get(f):
            errors.append(f"{f} 在扫描以后改过，重新扫")
            continue
        lines = text.split("\n")
        per_line: dict[int, list[tuple[int, str, str]]] = {}
        seen: dict[tuple[int, int], str] = {}
        for ln, col, old, new in edits[f]:
            if seen.get((ln, col), new) != new:
                errors.append(f"{f}:{ln}:{col + 1} 要改成两个名字")
            seen[(ln, col)] = new
            if lines[ln - 1][col : col + len(old)] != old:
                errors.append(f"{f}:{ln}:{col + 1} 不是「{old}」")
                continue
            per_line.setdefault(ln, []).append((col, old, new))
        m: dict[tuple[int, int], tuple[int, int]] = {}
        for ln, items in per_line.items():
            cols = sorted(set(items))
            s = lines[ln - 1]
            for col, old, new in reversed(cols):
                s = s[:col] + new + s[col + len(old) :]
            lines[ln - 1] = s
            # 改后列 → 改前列：落在新名里的映到名字起点，其余减去前面的长度差
            spans = []
            shift = 0
            for col, old, new in cols:
                spans.append((col + shift, col + shift + len(new), col, shift + len(new) - len(old)))
                shift += len(new) - len(old)
            for c in range(len(s) + 1):
                d = 0
                for a_start, a_end, b_start, after_shift in spans:
                    if c < a_start:
                        break
                    if c < a_end:
                        d = None
                        m[(ln, c)] = (ln, b_start)
                        break
                    d = after_shift
                if d is not None:
                    m[(ln, c)] = (ln, c - d)
        texts[f] = "\n".join(lines)
        back[f] = m
    report: dict = {"ok": False, "written": False, "files": files, "edits": sum(len(v) for v in edits.values()), "errors": errors}
    if not errors:
        for f in files:
            try:
                compile(texts[f], f, "exec")
            except SyntaxError as e:
                errors.append(f"{f} 改后编译不过：{e}")
        before = partition(root, files, {}, {})
        after = partition(root, files, texts, back)
        diff_b = sorted(sorted(g) for g in before - after)
        diff_a = sorted(sorted(g) for g in after - before)
        report["partitionBeforeOnly"] = [list(map(list, g))[:6] for g in diff_b[:30]]
        report["partitionAfterOnly"] = [list(map(list, g))[:6] for g in diff_a[:30]]
        report["ok"] = not errors and not diff_b and not diff_a
        if report["ok"] and write:
            tmp = tempfile.mkdtemp()
            for f in files:
                with open(os.path.join(root, f), "w", encoding="utf-8") as fh:
                    fh.write(texts[f])
                py_compile.compile(os.path.join(root, f), doraise=True, cfile=os.path.join(tmp, "x.pyc"))
            report["written"] = True
    report["seconds"] = round(time.time() - t0, 1)
    json.dump(report, open(os.path.join(scan_dir, "apply-report.json"), "w"), ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k != "files"}, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


def cmd_boundary(scan_dir: str, ts_dir: str) -> None:
    """Python 的字符串键、成员和 TS 的盘上字段同名的：这些字段两边要起同一个英文名（写进同一张字段表）"""
    py = [json.loads(line) for line in open(os.path.join(scan_dir, "groups.jsonl"))]
    ts_groups = [json.loads(line) for line in open(os.path.join(ts_dir, "groups.jsonl"))]
    ts_by_name: dict[str, list[dict]] = {}
    for g in ts_groups:
        if g["flags"].get("disk") or g["kind"] in ("属性", "未解析属性"):
            ts_by_name.setdefault(g["name"], []).append(g)
    rows = []
    for g in py:
        if g["kind"] not in ("字符串键", "成员"):
            continue
        hit = ts_by_name.get(g["name"])
        if hit:
            rows.append((g["name"], g["id"], g["kind"], ";".join(h["id"] for h in hit[:5]), ";".join(sorted({str(h["flags"].get("disk", "")) for h in hit}))))
    out = os.path.join(scan_dir, "boundary.tsv")
    with open(out, "w") as f:
        f.write("名\tPython 组\tPython 种类\tTS 组（前 5）\tTS 盘上标记\n")
        for r in sorted(rows):
            f.write("\t".join(r) + "\n")
    print(f"两边同名的字段 {len(rows)} 个 → {out}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["scan", "apply", "boundary"])
    ap.add_argument("--root", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    ap.add_argument("--out")
    ap.add_argument("--scan")
    ap.add_argument("--table")
    ap.add_argument("--ts-scan")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if a.cmd == "scan":
        cmd_scan(a.root, a.out)
    elif a.cmd == "apply":
        return cmd_apply(a.root, a.scan, a.table, a.write)
    else:
        cmd_boundary(a.scan, a.ts_scan)
    return 0


if __name__ == "__main__":
    sys.exit(main())
