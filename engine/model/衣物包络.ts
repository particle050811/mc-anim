import { Vector3 } from 'three';
import { boneGeometry, type BedrockBone, type BedrockModel, type BonePose } from './基岩模型.tsx';
import { skeletonMatrix } from './基岩正解.ts';

type ShellSpec = { referenceBone: string; shellRoot: string; innerRoot: string; heights: number[]; rays: number; closedAbove: number };
export const bindShellProbe = (model: BedrockModel, { referenceBone, shellRoot, innerRoot, heights, rays, closedAbove }: ShellSpec) => {
  if (![referenceBone, shellRoot, innerRoot].every(name => model.bones.some(bone => bone.name === name)) || !Number.isInteger(rays) || rays < 3 || !heights.length || !heights.every(Number.isFinite) || !Number.isFinite(closedAbove)) throw Error('无效的布料包络配置');
  const bones = new Map(model.bones.map(bone => [bone.name, bone]));
  const under = (bone: BedrockBone, root: string): boolean => bone.name === root || !!bone.parent && under(bones.get(bone.parent)!, root);
  const parts = model.bones.flatMap(bone => {
    const skirt = under(bone, shellRoot);
    if (!skirt && !under(bone, innerRoot)) return [];
    const geometry = boneGeometry(bone, model.texW, model.texH);
    if (!geometry) return [];
    const position = geometry.getAttribute('position');
    const points = Array.from({ length: position.count }, (_, index) => new Vector3().fromBufferAttribute(position, index));
    const indices = Array.from(geometry.index!.array);
    geometry.dispose();
    const rest = skeletonMatrix(model, referenceBone, {}, 1).invert().multiply(skeletonMatrix(model, bone.name, {}, 1));
    return [{ name: bone.name, skirt, points, indices, rest: points.map(point => point.clone().applyMatrix4(rest)) }];
  });

  if (![true, false].every(kind => parts.some(part => part.skirt === kind))) throw Error('碰撞对缺少可采样几何');
  const directions = Array.from({ length: rays }, (_, index) => [Math.sin(index * 2 * Math.PI / rays), Math.cos(index * 2 * Math.PI / rays)] as const);
  return (pose: Record<string, BonePose>) => {
    const pelvis = skeletonMatrix(model, referenceBone, pose, 1).invert();
    const radii = () => heights.map(() => new Float64Array(directions.length));
    const cloth = radii(), limbs = radii();
    let rise = 0, swing = 0;
    for (const part of parts) {
      const matrix = pelvis.clone().multiply(skeletonMatrix(model, part.name, pose, 1));
      if (matrix.determinant() === 0) continue;
      const vertices = part.points.map(point => point.clone().applyMatrix4(matrix));
      if (part.skirt) vertices.forEach((point, index) => {
        const rest = part.rest[index]!;
        if (rest.y >= closedAbove) return;
        rise = Math.max(rise, point.y - rest.y);
        swing = Math.max(swing, Math.hypot(point.x - rest.x, point.z - rest.z));
      });
      const depths = part.skirt ? cloth : limbs;
      for (let index = 0; index < part.indices.length; index += 3) {
        const triangle = part.indices.slice(index, index + 3).map(vertex => vertices[vertex]!);
        const bottom = Math.min(...triangle.map(point => point.y)), top = Math.max(...triangle.map(point => point.y));
        heights.forEach((height, row) => {
          if (height < bottom || height >= top) return;
          const ends: Vector3[] = [];
          triangle.forEach((point, edge) => {
            const next = triangle[(edge + 1) % 3]!;
            if ((point.y > height) !== (next.y > height)) ends.push(point.clone().lerp(next, (height - point.y) / (next.y - point.y)));
          });
          if (ends.length !== 2) return;
          const [start, end] = ends as [Vector3, Vector3];
          directions.forEach(([east, north], column) => {
            const first = start.x * north - start.z * east, last = end.x * north - end.z * east;
            if ((first > 0) === (last > 0)) return;
            const ratio = first / (first - last);
            const radius = (start.x + ratio * (end.x - start.x)) * east + (start.z + ratio * (end.z - start.z)) * north;
            depths[row]![column] = Math.max(depths[row]![column]!, radius);
          });
        });
      }
    }
    let exposure = 0, where = '';
    heights.forEach((height, row) => directions.forEach((_, column) => {
      const skin = limbs[row]![column]!, fabric = cloth[row]![column]!;
      if ((height >= closedAbove || fabric > 0) && skin - fabric > exposure) {
        exposure = skin - fabric;
        where = `${height}/${column}`;
      }
    }));
    return { rise, swing, exposure, where };
  };
};
