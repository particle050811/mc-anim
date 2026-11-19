"""YSM spec 2 可编辑目录 ↔ mc-anim 方盒骨架、局部姿势数值轨。"""

import argparse
from pathlib import Path
import re
import sys

from 原文 import copy_pack, dump, fingerprint, load, member, publish, require, splice
from 通道 import fields, geometry_change, pack_clip, project_model, unpack_clip


class Source:
    def __init__(self, root):
        self.root = root
        self.digest = fingerprint(root)
        self.header = member(root, 'ysm.json')
        self.manifest = load(self.header)
        require(self.manifest.get('spec') == 2, '只支持 spec 2 的可编辑目录')
        self.player = self.manifest['files']['player']
        self.geometry = member(root, self.player['model']['main'])
        self.model, self.locked = project_model(load(self.geometry))
        self.names = {bone['name'] for bone in self.model['bones']}

    def animation(self, slot):
        require(slot in ('main', 'extra'), '只编辑 main 或 extra 动作')
        file = member(self.root, self.player['animation'][slot])
        data = load(file)
        require(data.get('format_version') == '1.8.0' and type(data.get('animations')) is dict, f'{file} 不是 1.8.0 动作表')
        return file, data['animations']

    def basis(self, selection):
        return {'version': 1, 'sha256': self.digest, 'selection': selection, 'opaqueBones': self.locked}


def read_work(root, out, slot='main', clip=None):
    source = Source(root)
    selection = {'slot': slot, 'name': clip} if clip else None
    files = {'basis.json': source.basis(selection), 'model.json': source.model}
    if selection:
        _, clips = source.animation(slot)
        require(clip in clips, f'{slot} 中没有 {clip}')
        files['motion.json'] = {**selection, 'track': unpack_clip(clips[clip], source.names)}

    def build(stage):
        for name, data in files.items():
            (stage / name).write_bytes(dump(data).encode('utf8'))

    publish(out, [root], build)
    print(f'导入 {len(source.names)} 骨；只读骨 {source.locked}；动作 {selection or "未选择，其余直通"}')


def register(source, motion, clips):
    name = motion['name']
    require(motion['slot'] == 'extra' and re.fullmatch(r'[a-z][a-z0-9_]*', name), '只允许向 extra 新增 ASCII 动作名')
    label = motion.get('label')
    require(type(label) is str and label.strip() and not label.startswith('#'), '需要普通轮盘显示名 label')
    properties = source.manifest['properties']
    wheel = properties.get('extra_animation', {})
    require(type(wheel) is dict and name not in wheel and name not in clips, f'轮盘或动作已占用：{name}')
    update = (lambda text: splice(text, {name: label})) if 'extra_animation' in properties else {name: label}
    return lambda text: splice(text, {'properties': lambda props: splice(props, {'extra_animation': update})})


def write_work(root, work, out):
    source = Source(root)
    basis = load(work / 'basis.json')
    selection = basis['selection']
    require(basis == source.basis(selection), '源包或只读骨清单已变，请重新导入')
    expected = {'basis.json', 'model.json'}
    if selection is not None or (work / 'motion.json').exists():
        expected.add('motion.json')
    require({item.name for item in work.iterdir()} == expected, '制作目录文件缺失或含不识别的文件')
    changes = {}
    geometry = geometry_change(source.model, load(work / 'model.json'), source.locked)
    if geometry:
        changes[source.geometry] = geometry
    if 'motion.json' in expected:
        motion = load(work / 'motion.json')
        fields(motion, ('slot', 'name', 'track') if selection else ('slot', 'name', 'track', 'label'), 'motion')
        file, clips = source.animation(motion['slot'])
        name = motion['name']
        clip = pack_clip(motion['track'], source.names)
        if selection:
            require(selection == {'slot': motion['slot'], 'name': name}, '不重命名或移动原 clip')
            original = unpack_clip(clips[name], source.names)
        else:
            changes[source.header] = register(source, motion, clips)
            original = None
        if motion['track'] != original:
            changes[file] = lambda text: splice(text, {'animations': lambda animations: splice(animations, {name: clip})})

    def references(value):
        if type(value) is dict:
            for child in value.values():
                yield from references(child)
        elif type(value) is list:
            for child in value:
                yield from references(child)
        elif isinstance(value, str):
            yield value

    paths = [root / value for value in references(source.manifest['files']) if value and not Path(value).is_absolute()
             and '..' not in Path(value).parts and '\x00' not in value and (root / value).is_file()]
    for file in changes.keys() - {source.header}:
        require(sum(file.samefile(candidate) for candidate in paths) == 1, f'待改文件被多个资源共享：{file}')
    publish(out, [root, work], lambda stage: copy_pack(root, stage, changes))
    print('导出，改写：', ', '.join(str(file.relative_to(root)) for file in changes) or '无（全部逐字节直通）')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest='mode', required=True)
    reader = modes.add_parser('import')
    reader.add_argument('source', type=Path)
    reader.add_argument('work', type=Path)
    reader.add_argument('--slot', choices=['main', 'extra'], default='main')
    reader.add_argument('--clip')
    writer = modes.add_parser('export')
    for name in ('source', 'work', 'out'):
        writer.add_argument(name, type=Path)
    args = parser.parse_args()
    if args.mode == 'import':
        read_work(args.source, args.work, args.slot, args.clip)
    else:
        write_work(args.source, args.work, args.out)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, AttributeError) as error:
        sys.exit(f'YSM 源包：{error}')
