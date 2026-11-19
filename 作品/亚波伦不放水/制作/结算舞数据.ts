import { boneGeometry, type BedrockBone, type BedrockModel } from '@engine/model/基岩模型.tsx';
import { segFps } from '@engine/段/段定义.ts';
import sourceModel from 'asset:模型/角色/娘化亚波伦';
import { danceEndSec } from '../角色/动作/忘情牛肉面时长.ts';
import { GirlYaBoLunCreature, outlineFace } from '../角色/娘化亚波伦.tsx';
import { danceFormat } from '../角色/动作/Blender舞轨.ts';
import { composeDanceLayers, settlementRig } from '../角色/结算舞姿势.ts';

type Mesh = { position: number[]; normal?: number[]; uv: number[]; index: number[] };
const sourceBones = new Map((sourceModel as unknown as { bones: BedrockBone[] }).bones.map(bone => [bone.name, bone]));

const exportMesh = (bone: BedrockBone, model: BedrockModel): Mesh | undefined => {
  const geometry = boneGeometry(bone, model.texW, model.texH);
  const mesh: Mesh = geometry ? {
    position: Array.from(geometry.getAttribute('position').array),
    ...(bone.quads?.some(quad => quad.normals) && { normal: Array.from(geometry.getAttribute('normal').array) }),
    uv: Array.from(geometry.getAttribute('uv').array),
    index: Array.from(geometry.getIndex()!.array),
  } : { position: [], uv: [], index: [] };
  geometry?.dispose();
  if (/^ysmGlowbone17[2-9]$/.test(bone.name)) {
    const source = sourceBones.get(bone.name)!;
    for (const cube of source.cubes ?? []) {
      if (Array.isArray(cube.uv)) continue;
      for (const face of outlineFace({ ...source, cubes: [cube] }, model.texture)) {
        const rect = cube.uv[face.面]!;
        const pixel = (axis: number, size: number) => (Math.min(size - 1, Math.max(0, Math.floor(rect.uv[axis]! + rect.uv_size[axis]! / 2))) + 0.5) / size;
        const uv = [pixel(0, model.texture.w), pixel(1, model.texture.h)];
        const base = mesh.position.length / 3;
        for (const point of face.angle) { mesh.position.push(...point); mesh.uv.push(...uv); }
        mesh.index.push(base, base + 3, base + 2, base, base + 2, base + 1);
      }
    }
  }
  return mesh.index.length ? mesh : undefined;
};

export const danceTexture = () => GirlYaBoLunCreature.getModel().texture;

export const makeDanceBundle = (texturePath: string) => {
  const frameCount = Math.round(danceEndSec * segFps);
  if (segFps !== danceFormat.fps || frameCount !== danceFormat.frameCount) throw new Error('舞长或帧率已变，不能写成 Blender v1 舞包');
  const model = GirlYaBoLunCreature.getModel();
  const bones = model.bones.map(bone => ({
    name: bone.name, parent: bone.parent, pivot: bone.pivot, rotation: bone.rotation, mesh: exportMesh(bone, model),
  }));
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const rig = settlementRig(frame / segFps);
    const posed = composeDanceLayers(rig.animation, rig.bonePose);
    return Object.fromEntries(bones.map(({ name }) => {
      const pose = posed[name] ?? {};
      return [name, typeof pose.scale === 'number' ? { ...pose, scale: [pose.scale, pose.scale, pose.scale] } : pose];
    }));
  });
  return { ...danceFormat, scale: GirlYaBoLunCreature.definition.scale!, texturePath, bones, frames };
};
