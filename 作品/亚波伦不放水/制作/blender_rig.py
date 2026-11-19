"""把 Remotion 的舞蹈做成可编辑骨架，并按骨名烘焙回输（帧号从 0 起）。

blender -b --python blender_rig.py -- build bundle.json dance.blend
blender -b dance.blend --python blender_rig.py -- export patch.json RightArm RightForeArm
"""

import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector


ZERO = (0.0, 0.0, 0.0)
ONE = (1.0, 1.0, 1.0)
AXES = tuple(Vector(axis) for axis in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))


def components(value):
    return (value,) * 3 if isinstance(value, (int, float)) else value


def scene_pivot(pivot, unit):
    return Vector((-pivot[0] * unit, -pivot[2] * unit, pivot[1] * unit))


def create_rig(records, unit):
    armature = bpy.data.armatures.new('基岩骨架')
    rig = bpy.data.objects.new('亚波伦 · 舞蹈骨架', armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    rig.show_in_front = True
    armature.show_names = False
    armature.display_type = 'OCTAHEDRAL'
    children = {name: [] for name in records}
    for record in records.values():
        if record.get('parent'):
            children[record['parent']].append(record['name'])
    bpy.ops.object.mode_set(mode='EDIT')
    directions = {}
    for name, record in records.items():
        head = scene_pivot(record['pivot'], unit)
        heights = [(records[child]['pivot'][1] - record['pivot'][1]) for child in children[name]]
        heights = [height for height in heights if abs(height) >= 0.5]
        geometry = record.get('mesh') or {}
        if not heights:
            heights = geometry.get('position', [])[1::3]
        height = max(heights, key=abs, default=1.5)
        sign = -1 if height < 0 else 1
        directions[name] = sign
        edit = armature.edit_bones.new(name)
        if edit.name != name:
            raise ValueError(f'Blender 无法原样存储骨名：{name!r}')
        edit.head = head
        edit.tail = head + Vector((0, 0, sign * min(6.0, max(0.65, abs(height))) * unit))
        edit.roll = 0
    for name, record in records.items():
        if record.get('parent'):
            armature.edit_bones[name].parent = armature.edit_bones[record['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    for name, record in records.items():
        bone = armature.bones[name]
        if (bone.parent.name if bone.parent else None) != (record.get('parent') or None):
            raise ValueError(f'不可用的父子关系：{name}')
        bone['bedrock_rest'] = record.get('rotation') or ZERO
        bone['bedrock_sign'] = directions[name]
    return rig


def skin_material(path):
    image = bpy.data.images.load(str(path.resolve()), check_existing=True)
    image.pack()
    material = bpy.data.materials.new('角色贴图 · 像素镂空')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = 0.9
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    texture.interpolation = 'Closest'
    texture.extension = 'EXTEND'
    cutoff = nodes.new('ShaderNodeMath')
    cutoff.operation = 'GREATER_THAN'
    cutoff.inputs[1].default_value = 0.499999
    links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    links.new(texture.outputs['Alpha'], cutoff.inputs[0])
    links.new(cutoff.outputs[0], shader.inputs['Alpha'])
    nodes.active = texture
    if hasattr(material, 'blend_method') and not hasattr(material, 'surface_render_method'):
        material.blend_method = 'CLIP'
    return material


def create_mesh(rig, records, unit, texture_path):
    vertices, coords, faces, groups, normals = [], [], [], {}, {}
    for name, record in records.items():
        mesh = record.get('mesh')
        if not mesh:
            continue
        positions, uv, indices = mesh['position'], mesh['uv'], mesh['index']
        count, remainder = divmod(len(positions), 3)
        if remainder or len(uv) != 2 * count or len(indices) % 3 or any(index < 0 or index >= count for index in indices):
            raise ValueError(f'{name} 网格的顶点、UV 或索引不匹配')
        offset = len(vertices)
        if 'normal' in mesh:
            if len(mesh['normal']) != len(positions):
                raise ValueError(f'{name} 的平滑法线数与顶点数不匹配')
            for index in range(count):
                right, up, back = mesh['normal'][3 * index:3 * index + 3]
                normals[offset + index] = (right, -back, up)
        origin = scene_pivot(record['pivot'], unit)
        for point in range(0, len(positions), 3):
            right, up, back = positions[point:point + 3]
            vertices.append((origin.x + unit * right, origin.y - unit * back, origin.z + unit * up))
        coords.extend((uv[point], 1 - uv[point + 1]) for point in range(0, len(uv), 2))
        faces.extend(tuple(offset + index for index in indices[point:point + 3]) for point in range(0, len(indices), 3))
        if count:
            groups[name] = range(offset, offset + count)
    if not faces:
        raise ValueError('bundle 没有可编辑的三角网格')
    mesh = bpy.data.meshes.new('角色 · 网格与 UV')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    if normals:
        for polygon in mesh.polygons:
            polygon.use_smooth = polygon.vertices[0] in normals
        mesh.normals_split_custom_set([normals.get(loop.vertex_index, ZERO) for loop in mesh.loops])
    layer = mesh.uv_layers.new(name='角色贴图')
    layer.data.foreach_set('uv', [value for loop in mesh.loops for value in coords[loop.vertex_index]])
    body = bpy.data.objects.new('亚波伦 · 蒙皮网格', mesh)
    bpy.context.collection.objects.link(body)
    body.parent = rig
    for name, indices in groups.items():
        body.vertex_groups.new(name=name).add(list(indices), 1.0, 'REPLACE')
    modifier = body.modifiers.new('基岩骨骼 · 刚性权重', 'ARMATURE')
    modifier.object = rig
    mesh.materials.append(skin_material(texture_path))
    return body


def animate(rig, records, frames, unit):
    action = bpy.data.actions.new('结算舞 · 可编辑关键帧')
    animation = rig.animation_data_create()
    if hasattr(action, 'slots'):
        slot = action.slots.new('OBJECT', rig.name)
        strip = action.layers.new('舞蹈').strips.new(type='KEYFRAME')
        curves = strip.channelbag(slot, ensure=True).fcurves
        animation.action = action
        animation.action_slot = slot
    else:
        animation.action = action
        curves = action.fcurves
    linear = bpy.types.Keyframe.bl_rna.properties['interpolation'].enum_items['LINEAR'].value
    for name, record in records.items():
        pose = rig.pose.bones[name]
        pose.rotation_mode = 'XYZ'
        rest = record.get('rotation') or ZERO
        sign = pose.bone['bedrock_sign']
        samples = [frame.get(name, {}) for frame in frames]
        for prop, key, default, multipliers, offsets in (
            ('rotation_euler', 'rot', ZERO, (-math.pi / 180, -sign * math.pi / 180, sign * math.pi / 180), rest),
            ('location', 'pos', ZERO, (-unit, sign * unit, sign * unit), ZERO),
            ('scale', 'scale', ONE, ONE, ZERO),
        ):
            source = [components(sample.get(key, default)) for sample in samples]
            first = source[0]
            setattr(pose, prop, [(first[axis] + offsets[axis]) * multipliers[axis] for axis in range(3)])
            if all(value == first for value in source):
                continue
            for axis in range(3):
                values = [(value[axis] + offsets[axis]) * multipliers[axis] for value in source]
                if min(values) == max(values):
                    continue
                keys = [index for index, value in enumerate(values) if index in (0, len(values) - 1) or not values[index - 1] == value == values[index + 1]]
                group_key = 'group_name' if hasattr(action, 'slots') else 'action_group'
                curve = curves.new(pose.path_from_id(prop), index=axis, **{group_key: name})
                points = curve.keyframe_points
                points.add(len(keys))
                points.foreach_set('co', [component for index in keys for component in (index, values[index])])
                points.foreach_set('interpolation', [linear] * len(keys))
                curve.update()


def configure_editor(rig, body, unit):
    bones = rig.data.bones
    primary = {'Root', 'root', 'Head', 'Neck', 'UpBody', 'DownBody', 'Body'}
    primary.update(side + part for side in ('Right', 'Left') for part in ('Arm', 'ForeArm', 'Hand', 'Leg', 'LowerLeg', 'Foot'))
    if len(bones) > 40 and 'RightArm' in bones and hasattr(rig.data, 'collections'):
        controls = rig.data.collections.new('舞蹈主骨')
        extras = rig.data.collections.new('附属骨 · 展开可编辑')
        for bone in bones:
            for collection in list(bone.collections):
                collection.unassign(bone)
            (controls if bone.name in primary else extras).assign(bone)
        extras.is_visible = False
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='DESELECT')
    active = bones.get('RightArm') or bones[0]
    bones.active = active
    selection = rig.pose.bones[active.name] if hasattr(rig.pose.bones[active.name], 'select') else active
    selection.select = True
    posed_body = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    bounds = [Vector(corner) for corner in posed_body.bound_box]
    center = sum(bounds, Vector(ZERO)) / len(bounds)
    extent = bounds[6] - bounds[0]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                view = area.spaces.active
                view.shading.type = 'MATERIAL'
                view.overlay.show_relationship_lines = False
                view.region_3d.view_rotation = Vector((0, 1, 0)).to_track_quat('Z', 'Y')
                view.region_3d.view_perspective = 'ORTHO'
                view.region_3d.view_location = center
                region = next(region for region in area.regions if region.type == 'WINDOW')
                aspect = region.width / region.height if min(region.width, region.height) > 1 else 1.75
                span = max(extent.x * max(1, 1 / aspect), extent.z * max(1, aspect), 4 * unit)
                view.region_3d.view_distance = 1.18 * span * view.lens / 72


def build(source, destination):
    bundle = json.loads(Path(source).read_text(encoding='utf-8'))
    count, fps, unit = bundle['frameCount'], bundle['fps'], bundle['scale']
    frames, bones = bundle['frames'], bundle['bones']
    if bundle['version'] != 1 or count != len(frames) or count <= 0 or fps <= 0 or not math.isfinite(unit) or unit <= 0:
        raise ValueError('不支持的 bundle 版本、帧数、帧率或单位')
    records = {bone['name']: bone for bone in bones}
    if not records or len(records) != len(bones):
        raise ValueError('骨骼为空或骨名重复')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.render.fps_base = 1.0
    scene.frame_start, scene.frame_end = 0, count - 1
    rig = create_rig(records, unit)
    rig['bedrock_version'], rig['bedrock_fps'], rig['bedrock_count'], rig['bedrock_unit'] = 1, fps, count, unit
    body = create_mesh(rig, records, unit, Path(bundle['texturePath']))
    animate(rig, records, frames, unit)
    scene.frame_set(0)
    configure_editor(rig, body, unit)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(destination).resolve()))
    print(f'已保存 {len(records)} 根骨骼、{count} 帧，PNG 已内嵌：{destination}', flush=True)


def close_matrix(left, right):
    return all(math.isclose(left[row][col], right[row][col], abs_tol=2e-6, rel_tol=2e-6) for row in range(4) for col in range(4))


def channel_euler(pose, previous):
    if pose.rotation_mode == 'XYZ':
        return pose.rotation_euler.copy()
    if pose.rotation_mode == 'QUATERNION':
        rotation = pose.rotation_quaternion.to_matrix()
    elif pose.rotation_mode == 'AXIS_ANGLE':
        angle, *axis = pose.rotation_axis_angle
        rotation = Quaternion(axis, angle).to_matrix()
    else:
        rotation = pose.rotation_euler.to_matrix()
    return rotation.to_euler('XYZ', previous) if previous is not None else rotation.to_euler('XYZ')


def constrained_trs(matrix, channel_scale, reference):
    columns = [matrix.to_3x3().col[axis].copy() for axis in range(3)]
    scales = [math.copysign(column.length, channel_scale[axis]) for axis, column in enumerate(columns)]
    known = [axis for axis in range(3) if abs(scales[axis]) > 1e-8]
    for axis in known:
        columns[axis] /= scales[axis]
    if len(known) == 3 and columns[0].cross(columns[1]).dot(columns[2]) < 0:
        axis = min(known, key=lambda index: columns[index].dot(reference.to_matrix().col[index]))
        columns[axis].negate()
        scales[axis] *= -1
    if len(known) == 2:
        missing = next(axis for axis in range(3) if axis not in known)
        columns[missing] = columns[(missing + 1) % 3].cross(columns[(missing + 2) % 3])
    if len(known) >= 2:
        rotation = Matrix(columns).transposed().to_quaternion()
    elif known:
        axis = known[0]
        base = reference.to_quaternion()
        rotation = (base @ AXES[axis]).rotation_difference(columns[axis]) @ base
    else:
        rotation = reference.to_quaternion()
    location = matrix.to_translation()
    if not close_matrix(Matrix.LocRotScale(location, rotation, Vector(scales)), matrix):
        raise ValueError('约束产生了基岩 TRS 不能表示的局部剪切')
    return location, rotation.to_euler('XYZ', reference), scales


def sampled_trs(pose, rest_link, previous):
    base = pose.parent.matrix @ rest_link if pose.parent else rest_link
    channel = channel_euler(pose, previous)
    if close_matrix(base @ pose.matrix_basis, pose.matrix):
        return pose.location, channel, pose.scale
    try:
        local = base.inverted() @ pose.matrix
    except ValueError as exc:
        raise ValueError('父级为零缩放，约束结果无法表现为子骨局部变换') from exc
    return constrained_trs(local, pose.scale, previous if previous is not None else channel)


def sample_row(frame, values):
    return [frame, *(round(float(value), 6) for value in values)]


def export(destination, names):
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE' and obj.get('bedrock_version') == 1]
    if len(rigs) != 1:
        raise ValueError('场景里应恰有一套由本工具建立的骨架')
    rig = rigs[0]
    unit, count = rig['bedrock_unit'], rig['bedrock_count']
    names = list(dict.fromkeys(names))
    links, previous = {}, {}
    for name in names:
        bone = rig.data.bones.get(name)
        if bone is None or 'bedrock_sign' not in bone:
            raise ValueError(f'不是 bundle 中可回输的骨骼：{name}')
        links[name] = bone.parent.matrix_local.inverted() @ bone.matrix_local if bone.parent else bone.matrix_local.copy()
    tracks = {name: {'rot': [], 'pos': [], 'scale': []} for name in names}
    graph = bpy.context.evaluated_depsgraph_get()
    for frame in range(count):
        bpy.context.scene.frame_set(frame)
        evaluated = rig.evaluated_get(graph)
        for name in names:
            pose = evaluated.pose.bones[name]
            try:
                location, rotation, scales = sampled_trs(pose, links[name], previous.get(name))
            except ValueError as exc:
                raise ValueError(f'第 {frame} 帧 / {name}：{exc}') from exc
            previous[name] = rotation.copy()
            sign, rest = pose.bone['bedrock_sign'], pose.bone['bedrock_rest']
            angles = (-rotation.x, -sign * rotation.y, sign * rotation.z)
            tracks[name]['rot'].append(sample_row(frame, [math.degrees(angle) - rest[axis] for axis, angle in enumerate(angles)]))
            tracks[name]['pos'].append(sample_row(frame, (-location.x / unit, sign * location.y / unit, sign * location.z / unit)))
            tracks[name]['scale'].append(sample_row(frame, scales))
    result = {'version': 1, 'fps': rig['bedrock_fps'], 'frameCount': count, 'bones': tracks}
    Path(destination).write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'已烘焙 {count} 帧，仅回输 {", ".join(names)}：{destination}', flush=True)


if __name__ == '__main__':
    try:
        arguments = sys.argv[sys.argv.index('--') + 1:]
        if len(arguments) == 3 and arguments[0] == 'build':
            build(*arguments[1:])
        elif len(arguments) >= 3 and arguments[0] == 'export':
            export(arguments[1], arguments[2:])
        else:
            raise ValueError(__doc__)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
