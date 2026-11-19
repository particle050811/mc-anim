import os
from pathlib import Path
import tempfile
import unittest

from 原文 import dump, fingerprint, load
from 源包 import read_work, write_work


def put(path, data):
    path.write_bytes(dump(data).encode())


def edit(path, change):
    data = load(path)
    change(data)
    put(path, data)


class BridgeTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.temp = Path(temp.name)
        self.src, self.work, self.out, self.back = [self.temp / name for name in ('src', 'work', 'out', 'back')]
        self.src.mkdir()
        self.header = self.src / 'ysm.json'
        self.geo = self.src / 'body.json'
        self.extra = self.src / 'custom.json'
        self.main = self.src / 'moves.json'
        put(self.header, {'spec': 2, 'properties': {'extra_animation': {'old': '#button'}}, 'files': {'player': {
            'model': {'main': self.geo.name}, 'animation': {'main': self.main.name, 'extra': self.extra.name}}}})
        cube = {'size': [1, 2, 3], 'origin': [-2, 4, 0], 'uv': {'north': {'uv': [1, 1], 'uv_size': [-2, 3]}}}
        geo = {'description': {'texture_width': 16, 'texture_height': 8, 'identifier': 'geometry.real'}, 'bones': [
            {'name': 'Body', 'cubes': [cube]}, {'name': 'Child', 'parent': 'Body', 'poly_mesh': {'polys': []}}]}
        put(self.geo, {'format_version': '1.12.0', 'minecraft:geometry': [geo]})
        self.opaque = b'{"timeline": { "0" : "v.keep = q.foo;" }, "future":123456789012345678901234567890, "curve": 1.00000000000000000001}'
        self.extra.write_bytes(b'{\r\n "format_version":"1.8.0", "animations":{ "old" : ' + self.opaque + b'}\r\n}\r\n')
        self.main.write_bytes(b'{"format_version":"1.8.0","animations":{"opaque":' + self.opaque +
                              b',"walk":{"loop":true,"animation_length":1,"bones":{"Body":{"scale":0,"rotation":{"1.00":[4,5,6],"0.0":[1,2,3]}}}}}}')
        (self.src / 'sound.ogg').write_bytes(bytes(range(256)))
        (self.src / 'empty').mkdir()

    def test_noop_is_byte_exact(self):
        read_work(self.src, self.work, 'main', 'walk')
        self.assertIn('Child', load(self.work / 'basis.json')['opaqueBones'])
        write_work(self.src, self.work, self.out)
        self.assertEqual(fingerprint(self.src), fingerprint(self.out))

    def test_native_edits_reimport_with_opaque_siblings(self):
        read_work(self.src, self.work, 'main', 'walk')
        def sculpt(model):
            bone = model['bones'][0]
            bone['pivot'][2] = -2
            cube = bone['cubes'][0]
            cube.update(mirror=True, rotation=[8, 9, 10], inflate=-0.25)
            cube['uv']['north']['uv_size'][1] = -4
            bone['cubes'].append({'origin': [0, 0, 0], 'size': [2, 1, 3], 'uv': [4, 8]})
        edit(self.work / 'model.json', sculpt)
        def pose(motion):
            motion['track']['bones']['Body']['rot'][1][2] = -65
            motion['track']['bones']['Child'] = {'pos': [[0, 0, 1, 3]]}
        edit(self.work / 'motion.json', pose)
        write_work(self.src, self.work, self.out)
        read_work(self.out, self.back, 'main', 'walk')
        for name in ('model.json', 'motion.json'):
            self.assertEqual(load(self.back / name), load(self.work / name))
        self.assertIn(self.opaque, (self.out / self.main.name).read_bytes())
        self.assertIn(b'"poly_mesh":{"polys":[]}', (self.out / self.geo.name).read_bytes())
        self.assertEqual(self.extra.read_bytes(), (self.out / self.extra.name).read_bytes())

    def test_extra_does_not_replace_existing_clips_or_buttons(self):
        read_work(self.src, self.work)
        motion = {'label': '示范', 'name': 'spin', 'slot': 'extra', 'track': {'bones': {'Body': {'rot': [[0, 1, 2, 3]]}}}}
        put(self.work / 'motion.json', motion)
        write_work(self.src, self.work, self.out)
        self.assertIn(self.opaque, (self.out / self.extra.name).read_bytes())
        self.assertEqual(load(self.out / self.header.name)['properties']['extra_animation'], {'old': '#button', 'spin': '示范'})
        read_work(self.out, self.back, 'extra', 'spin')
        self.assertEqual(load(self.back / 'motion.json')['track'], motion['track'])
        put(self.work / 'motion.json', {**motion, 'name': 'old'})
        with self.assertRaisesRegex(ValueError, '占用'):
            write_work(self.src, self.work, self.temp / 'collision')
        self.assertFalse((self.temp / 'collision').exists())

    def test_reject_unknown_topology_and_edits_to_locked_bone(self):
        read_work(self.src, self.work)
        baseline = (self.work / 'model.json').read_bytes()
        for index, field, value in [(0, 'quads', [{'points': []}]), (1, 'cubes', []), (0, 'parent', 'Child')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                (self.work / 'model.json').write_bytes(baseline)
                edit(self.work / 'model.json', lambda model: model['bones'][index].update({field: value}))
                write_work(self.src, self.work, self.out)
            self.assertFalse(self.out.exists())

    def test_unknown_animation_not_silently_baked(self):
        with self.assertRaisesRegex(ValueError, 'timeline'):
            read_work(self.src, self.work, 'extra', 'old')
        self.assertFalse(self.work.exists())
        for value in ('q.head_yaw', {'0': {'post': [1, 2, 3], 'lerp_mode': 'catmullrom'}}, {'0': 1, '0.00': 2}):
            edit(self.main, lambda data: data['animations']['walk']['bones']['Body'].update(scale=value))
            with self.assertRaises(ValueError):
                read_work(self.src, self.work, 'main', 'walk')
            self.assertFalse(self.work.exists())

    def test_input_drift_missing_track_and_destination(self):
        read_work(self.src, self.work, 'main', 'walk')
        with self.assertRaisesRegex(ValueError, '嵌入'):
            write_work(self.src, self.work, self.src / 'nested')
        with self.assertRaisesRegex(ValueError, '已存在'):
            write_work(self.src, self.work, self.work)
        (self.work / 'motion.json').unlink()
        with self.assertRaisesRegex(ValueError, '缺失'):
            write_work(self.src, self.work, self.out)
        (self.src / 'sound.ogg').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, '重新导入'):
            write_work(self.src, self.work, self.out)
        self.assertFalse(self.out.exists())

    def test_no_escape_alias_or_duplicate(self):
        (self.src / 'outside').symlink_to(self.temp)
        with self.assertRaisesRegex(ValueError, '链接'):
            read_work(self.src, self.work)
        (self.src / 'outside').unlink()
        edit(self.header, lambda data: data['files']['player']['model'].update(arm=self.geo.name))
        read_work(self.src, self.work)
        edit(self.work / 'model.json', lambda model: model['bones'][0].update(rotation=[1, 2, 3]))
        with self.assertRaisesRegex(ValueError, '共享'):
            write_work(self.src, self.work, self.out)
        edit(self.header, lambda data: data['files']['player']['model'].update(main='../body.json'))
        with self.assertRaisesRegex(ValueError, '路径'):
            read_work(self.src, self.back)
        self.header.write_bytes(b'{"spec": 2,"spec": 1}')
        with self.assertRaisesRegex(ValueError, '重复键'):
            read_work(self.src, self.back)
        self.assertFalse(self.out.exists())


@unittest.skipUnless(os.getenv('YSM_4911_SOURCE'), '设 YSM_4911_SOURCE 启用 4911 真实源包测试')
class RealPackTest(unittest.TestCase):
    def test_jump_and_cube_are_editable(self):
        source = Path(os.environ['YSM_4911_SOURCE'])
        with tempfile.TemporaryDirectory() as temp:
            work, out, back, unchanged = [Path(temp) / name for name in ('work', 'out', 'back', 'unchanged')]
            read_work(source, work, 'main', 'jump')
            write_work(source, work, unchanged)
            self.assertEqual(fingerprint(source), fingerprint(unchanged))
            def change_key(motion):
                motion['track']['bones']['LeftForeArm']['rot'][1][1] -= 9
            def change_cube(model):
                next(bone for bone in model['bones'] if bone['name'] == 'bone41')['cubes'][0]['size'][0] += 0.5
            edit(work / 'motion.json', change_key)
            edit(work / 'model.json', change_cube)
            write_work(source, work, out)
            read_work(out, back, 'main', 'jump')
            for file in ('motion.json', 'model.json'):
                self.assertEqual(load(work / file), load(back / file))
            different = {file.relative_to(source).as_posix() for file in source.rglob('*') if file.is_file()
                         and file.read_bytes() != (out / file.relative_to(source)).read_bytes()}
            self.assertEqual(different, {'models/main.json', 'animations/main.animation.json'})
