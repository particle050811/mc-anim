import math
import re

from 原文 import require, splice


def number(value):
    return type(value) in (int, float) and math.isfinite(value) and (type(value) != int or abs(value) <= 2**53 - 1)


def vector(value, length):
    return type(value) is list and len(value) == length and all(number(axis) for axis in value)


def fields(value, allowed, where):
    require(type(value) is dict, f'{where} 应为对象')
    extra = value.keys() - set(allowed)
    require(not extra, f'{where} 不支持 {sorted(extra)}')


def valid_name(name):
    return isinstance(name, str) and name and name not in ('constructor', '__proto__', 'prototype', 'toString', 'valueOf', 'hasOwnProperty')


def cube_shape(cube, where):
    fields(cube, ('origin', 'size', 'uv', 'inflate', 'rotation', 'pivot', 'mirror'), where)
    for key in ('origin', 'size', 'pivot', 'rotation'):
        if key in ('origin', 'size') or key in cube:
            require(vector(cube.get(key), 3), f'{where}.{key} 需要三元数值')
    require('mirror' not in cube or type(cube['mirror']) is bool, f'{where}.mirror')
    require('inflate' not in cube or number(cube['inflate']), f'{where}.inflate')
    uv = cube.get('uv')
    if not vector(uv, 2):
        fields(uv, ('north', 'south', 'west', 'east', 'up', 'down'), f'{where}.uv')
        for face in uv.values():
            fields(face, ('uv', 'uv_size'), f'{where}.uv 面')
            require(all(vector(face.get(key), 2) for key in ('uv', 'uv_size')), f'{where}.uv 面矩形')


def bone_shape(bone):
    name = bone['name']
    fields(bone, ('name', 'parent', 'pivot', 'rotation', 'mirror', 'cubes'), name)
    require(valid_name(name) and ('parent' not in bone or valid_name(bone['parent'])), f'{name} 非法骨名或父骨名')
    require(vector(bone.get('pivot'), 3) and ('rotation' not in bone or vector(bone['rotation'], 3)), f'{name} pivot/rotation')
    require('mirror' not in bone or type(bone['mirror']) is bool, f'{name}.mirror')
    require(type(bone.get('cubes', [])) is list, f'{name}.cubes')
    for index, cube in enumerate(bone.get('cubes', [])):
        cube_shape(cube, f'{name}.cubes[{index}]')


def project_model(doc):
    require(doc.get('format_version') == '1.12.0' and len(doc.get('minecraft:geometry', [])) == 1, '只支持单一 1.12.0 geometry')
    geometry, = doc['minecraft:geometry']
    desc = geometry['description']
    bones, locked, parents = [], {}, {}
    for original in geometry['bones']:
        name = original['name']
        require(valid_name(name) and name not in parents, f'非法或重复骨名：{name}')
        parents[name] = original.get('parent')
        core = {key: original[key] for key in ('name', 'parent', 'pivot', 'rotation', 'mirror') if key in original}
        core.setdefault('pivot', [0, 0, 0])
        bone_shape(core)
        bone = {**original, **core}
        try:
            bone_shape(bone)
        except ValueError as error:
            locked[name] = str(error)
            bone = core
        bones.append(bone)
    for name in parents:
        seen = set()
        parent = name
        while parent is not None:
            require(parent in parents and parent not in seen, f'{name} 的骨链断开或有环：{parent}')
            seen.add(parent)
            parent = parents[parent]
    size = [desc['texture_width'], desc['texture_height']]
    require(all(type(value) is int and value > 0 for value in size), '非法贴图尺寸')
    return {'texW': size[0], 'texH': size[1], 'bones': bones}, locked


def geometry_change(before, edited, locked):
    fields(edited, before, 'model')
    require(all(edited.get(key) == before[key] and type(edited[key]) is int for key in ('texW', 'texH')), '不改图集尺寸')
    changes = {}
    require(len(before['bones']) == len(edited['bones']), '不增删或重排骨架')
    for index, (old, new) in enumerate(zip(before['bones'], edited['bones'])):
        bone_shape(new)
        name = old['name']
        require(all(old.get(key) == new.get(key) for key in ('name', 'parent')), f'{name} 不能换骨或换父级')
        require(not old.keys() - new.keys(), f'{name} 不支持删字段；清空方盒请设 cubes: []')
        diff = {key: value for key, value in new.items() if old.get(key) != value}
        if diff:
            require(name not in locked, f'{name} 含不支持的几何，整骨只读')
            changes[index] = lambda text, diff=diff: splice(text, diff)
    if changes:
        return lambda text: splice(text, {'minecraft:geometry': lambda array: splice(array, {
            0: lambda geometry: splice(geometry, {'bones': lambda bones: splice(bones, changes)})})})


channels = {'rotation': 'rot', 'position': 'pos', 'scale': 'scale'}


def unpack_clip(clip, names):
    fields(clip, ('animation_length', 'loop', 'bones'), '所选 clip（其余 clip 可原样直通）')
    motion = {'bones': {}}
    if 'animation_length' in clip:
        motion['lengthSec'] = clip['animation_length']
    if 'loop' in clip:
        motion['loop'] = clip['loop']
    for name, tracks in clip['bones'].items():
        fields(tracks, channels, name)
        dest = motion['bones'][name] = {}
        for key, values in tracks.items():
            rows = []
            for stamp, value in (values.items() if type(values) is dict else [('0', values)]):
                require(re.fullmatch(r'(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?', stamp), f'{name}.{key} 非数值时间：{stamp}')
                value = [value] * 3 if number(value) else value
                require(vector(value, 3), f'{name}.{key}@{stamp} 非数值线性键（拒绝近似转换）')
                rows.append([float(stamp), *value])
            dest[channels[key]] = sorted(rows)
    pack_clip(motion, names)
    return motion


def pack_clip(motion, names):
    fields(motion, ('lengthSec', 'loop', 'bones'), 'motion')
    clip = {'bones': {}}
    if 'lengthSec' in motion:
        length = motion['lengthSec']
        require(number(length) and length >= 0, '非法动作时长')
        clip['animation_length'] = length
    if 'loop' in motion:
        require(type(motion['loop']) is bool or motion['loop'] == 'hold_on_last_frame', '非法 loop')
        clip['loop'] = motion['loop']
    require(type(motion.get('bones')) is dict, 'motion.bones 应为对象')
    for name, tracks in motion['bones'].items():
        require(name in names, f'动作引用未知骨骼：{name}')
        fields(tracks, channels.values(), name)
        dest = clip['bones'][name] = {}
        for key, channel in channels.items():
            if channel not in tracks:
                continue
            rows = tracks[channel]
            require(type(rows) is list and rows, f'{name}.{channel} 没有键')
            values, previous = {}, -1
            for row in rows:
                require(vector(row, 4) and row[0] >= 0 and row[0] > previous, f'{name}.{channel} 非法键或时间重复/乱序')
                previous = row[0]
                values[str(previous)] = row[1:]
            dest[key] = rows[0][1:] if len(rows) == 1 and previous == 0 else values
    return clip
