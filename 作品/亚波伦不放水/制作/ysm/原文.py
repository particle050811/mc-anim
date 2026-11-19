"""只在已通过严格 JSON 校验的原文上替换选中的成员；不会重写兄弟值。"""

import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unique(pairs):
    result = dict(pairs)
    require(len(result) == len(pairs), 'JSON 有重复键')
    return result


def finite(text):
    value = float(text)
    require(math.isfinite(value), f'非有限数字 {text}')
    return value


decoder = json.JSONDecoder(object_pairs_hook=unique, parse_float=finite, parse_constant=finite)
white = re.compile(r'[ \t\r\n]*')


def dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def load(path):
    return decoder.decode(path.read_bytes().decode('utf8'))


def spans(text):
    start = white.match(text).end()
    is_object = text[start] == '{'
    require(is_object or text[start] == '[', '期待 JSON 容器')
    index = white.match(text, start + 1).end()
    result = {}
    while text[index] not in '}]':
        if is_object:
            key, end = decoder.raw_decode(text, index)
            index = white.match(text, white.match(text, end).end() + 1).end()
        else:
            key = len(result)
        _, end = decoder.raw_decode(text, index)
        result[key] = (index, end)
        index = white.match(text, end).end()
        if text[index] == ',':
            index = white.match(text, index + 1).end()
    return result, index


def splice(text, changes):
    if not changes:
        return text
    fields, close = spans(text)
    parts, end, added = [], 0, []
    for key, (left, right) in fields.items():
        if key in changes:
            change = changes[key]
            parts.extend((text[end:left], change(text[left:right]) if callable(change) else dump(change)))
            end = right
    for key, value in changes.items():
        if key not in fields:
            require(isinstance(key, str) and not callable(value), f'缺少容器 {key}')
            added.append(dump(key) + ':' + dump(value))
    return ''.join(parts) + text[end:close] + (',' if fields and added else '') + ','.join(added) + text[close:]


def fingerprint(root):
    require(root.is_dir() and not root.is_symlink(), f'请给解压后的源包目录：{root}')
    digest = hashlib.sha256()
    for item in sorted(root.rglob('*'), key=lambda item: item.relative_to(root).as_posix()):
        require(not item.is_symlink() and (item.is_file() or item.is_dir()), f'不接受链接或特殊文件：{item}')
        digest.update(item.relative_to(root).as_posix().encode() + b'\0')
        if item.is_file():
            with item.open('rb') as stream:
                digest.update(hashlib.file_digest(stream, 'sha256').digest())
        else:
            digest.update(b'/')
    return digest.hexdigest()


def member(root, name):
    require(isinstance(name, str) and all(part not in ('', '.', '..') for part in name.split('/'))
            and not any(char in name for char in ('\\', ':', '\x00')), f'非法源包路径 {name!r}')
    target = root / name
    require(target.is_file() and target.resolve().is_relative_to(root.resolve()), f'源包文件不存在：{name}')
    return target


def publish(output, inputs, build):
    output = Path(output).absolute()
    require(not os.path.lexists(output), f'目标已存在：{output}')
    for source in inputs:
        require(not output.resolve().is_relative_to(source.resolve()), '输出不能嵌入输入目录')
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        stage = Path(temp) / 'new'
        stage.mkdir()
        build(stage)
        require(not os.path.lexists(output), f'目标已存在：{output}')
        stage.rename(output)


def copy_pack(source, dest, changes):
    shutil.copytree(source, dest, dirs_exist_ok=True)
    for file, change in changes.items():
        original = file.read_bytes().decode('utf8')
        result = change(original)
        (dest / file.relative_to(source)).write_bytes(result.encode('utf8'))
