"""从本次 checkout 的正片角色取模型、皮肤、结算舞，验过重导才发布 zip。"""

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile

from 原文 import decoder, load, member, publish, require, splice
from 源包 import Source, read_work, register
from 通道 import pack_clip, project_model


here = Path(__file__).resolve().parent
repo = here.parents[3]
stock_zip_sha = '3799cdae87f6bf52ab949ef2f843ce79b82c7779e9b2fe7a4f29668d5c7b201f'
prefix = 'mc_anim_player'


def geometry_file(file, updates):
    return splice(file.read_bytes().decode('utf8'), {'minecraft:geometry': lambda array: splice(array, {
        0: lambda body: splice(body, updates)})})


def dimensions(width, height):
    return lambda desc: splice(desc, {'texture_width': width, 'texture_height': height})


def png_size(file):
    with file.open('rb') as stream:
        header = stream.read(24)
    require(header[:8] == b'\x89PNG\r\n\x1a\n' and header[12:16] == b'IHDR', f'不是 PNG：{file}')
    return struct.unpack('>II', header[16:24])


def materialize(source, capture, output):
    require(not source.locked, '原主模型含未支持的骨，整模合成拒绝覆盖')
    player = source.player
    require(set(player['model']) <= {'main', 'arm'}, '有其他共用图集的玩家模型，需先处理 UV 空间')
    require(not (source.root / prefix).exists(), f'保留的派生路径已存在：{prefix}')
    model, report = load(capture / 'model.json'), load(capture / '拓扑报告.json')
    width, height = model['texW'], model['texH']
    main = geometry_file(source.geometry, {'bones': model['bones'], 'description': dimensions(width, height)})
    checked, locked = project_model(decoder.decode(main))
    require(checked == model and not locked, f'正片含不可表示的骨/方盒：{locked}')
    names = {bone['name'] for bone in model['bones']}
    motion = load(capture / 'motion.json')
    file, clips = source.animation('extra')
    add_button = register(source, motion, clips)
    clip = pack_clip(motion['track'], names)
    extra = splice(file.read_bytes().decode('utf8'), {'animations': lambda text: splice(text, {motion['name']: clip})})
    shutil.copytree(source.root, output)
    dest = output / prefix
    dest.mkdir()
    (dest / 'main.json').write_bytes(main.encode())
    (dest / 'extra.animation.json').write_bytes(extra.encode())
    animation_file, _ = source.animation('main')
    main_animation = splice(animation_file.read_bytes().decode('utf8'), {'animations': lambda text: splice(text, {
        'pre_parallel1': load(capture / 'blink.json')})})
    (dest / 'main.animation.json').write_bytes(main_animation.encode())
    models = {'main': f'{prefix}/main.json'}
    if 'arm' in player['model'] and (width, height) != (source.model['texW'], source.model['texH']):
        arm = member(source.root, player['model']['arm'])
        arm_model, opaque = project_model(load(arm))
        require(not opaque, '第一人称手部含未知几何，无法安全调整图集尺寸')
        sizes = [dim * arm_model[key] / source.model[key] for dim, key in ((width, 'texW'), (height, 'texH'))]
        require(all(value > 0 and value.is_integer() for value in sizes), '手部图集尺寸不是正整数')
        (dest / 'arm.json').write_bytes(geometry_file(arm, {'description': dimensions(*map(int, sizes))}).encode())
        models['arm'] = f'{prefix}/arm.json'
    skins = []
    (dest / 'skins').mkdir()
    for item in player['texture']:
        require(type(item) is dict and set(item) == {'uv'}, '玩家主贴图有 PBR 或其他字段，不猜材质布局')
        original = member(source.root, item['uv'])
        image = member(capture / 'skins', original.name)
        require(png_size(original) == (source.model['texW'], source.model['texH']) and png_size(image) == (width, height), '皮肤尺寸不匹配')
        target = dest / 'skins' / image.name
        require(not target.exists(), f'皮肤重名：{image.name}')
        shutil.copyfile(image, target)
        skins.append({'uv': f'{prefix}/skins/{image.name}'})
    require({item.name for item in (dest / 'skins').iterdir()} == {item.name for item in (capture / 'skins').iterdir()}, '正片皮肤与源包清单不一致')
    require((dest / 'skins' / (report['defaultSkin'] + '.png')).is_file(), '缺正片默认皮肤')
    header = add_button(source.header.read_bytes().decode('utf8'))
    header = splice(header, {
        'properties': lambda props: splice(props, {'default_texture': report['defaultSkin']}),
        'files': lambda files: splice(files, {'player': lambda text: splice(text, {
            'model': lambda previous: splice(previous, models), 'texture': skins,
            'animation': lambda previous: splice(previous, {'main': f'{prefix}/main.animation.json', 'extra': f'{prefix}/extra.animation.json'})})})})
    (output / 'ysm.json').write_bytes(header.encode())


def run(out, stock, data, policy):
    blocked = False

    def node(*args):
        subprocess.run(['node', here / '结算舞.mjs', *args], cwd=repo, env={**os.environ, 'ANIM_DATA': str(data)}, check=True)

    def build(stage):
        nonlocal blocked
        with tempfile.TemporaryDirectory(dir=stage.parent) as temp:
            temp = Path(temp)
            root = stock
            if root is None:
                archive = data / 'game/缓存/ysm包/使徒娘化版ysm.zip'
                with archive.open('rb') as stream:
                    require(hashlib.file_digest(stream, 'sha256').hexdigest() == stock_zip_sha, '底包摘要不符；请自行核对并以 --source 指定可信目录')
                root = temp / 'stock'
                with zipfile.ZipFile(archive) as packed:
                    packed.extractall(root)
            source = Source(root)
            base, capture = temp / 'base', temp / 'capture'
            read_work(root, base)
            node('production', base, capture, policy)
            for name in ('拓扑报告.json', '非标准面.svg'):
                shutil.copyfile(capture / name, stage / name)
            report = load(stage / '拓扑报告.json')
            blocked = report['blocked']
            if blocked:
                return
            pack, back = stage / 'pack', stage / 'imported'
            materialize(source, capture, pack)
            read_work(pack, back, 'extra', 'mc_anim_settlement')
            node('verifyProduction', capture, back, pack)
            node('revision', back, stage / '舞修订.json')
            archive = stage / ('正片-已用原骨替代-结算舞.zip' if report['findings'] else '正片-原生方盒-结算舞.zip')
            with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as zipped:
                for item in sorted(pack.rglob('*')):
                    zipped.write(item, item.relative_to(pack))
            with zipfile.ZipFile(archive) as zipped:
                require(zipped.testzip() is None, 'zip 回读失败')
            print(f'发布：{out / archive.name}')

    publish(out, [repo, data, *([stock] if stock else [])], build)
    if blocked:
        raise ValueError(f'正片含非原生面；只写诊断，没有模型包。查看 {out / "非标准面.svg"} 和同目录拓扑报告。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='未存在的输出目录，父目录须存在')
    parser.add_argument('--source', type=Path, help='已核对且解压的原始 4911 源包；默认用数据根的已知 zip')
    parser.add_argument('--fallback-source', action='store_true', help='仅对有原包同名骨的四边形显式换回原方盒，保留报告、面原数据和线框；不转换任意面')
    args = parser.parse_args()
    try:
        run(args.output.resolve(), args.source.resolve() if args.source else None,
            Path(os.environ.get('ANIM_DATA', repo.parent / 'mc-anim-data')).resolve(), 'source-bones' if args.fallback_source else 'strict')
    except (OSError, ValueError, TypeError, KeyError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
