import { Vector3 } from 'three';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import type { BedrockBone, BedrockCube, BedrockModel } from '@engine/model/基岩模型.tsx';
import type { Png } from '@engine/model/贴图.ts';

type Geometry = Omit<BedrockModel, 'texture'>;
type Rect = readonly [number, number, number, number];
type Pixel = (col: number, row: number) => number | null;
const tile = (rect: Rect, pixel: Pixel) => ({ rect, pixel });

const velvet = (col: number, row: number) => {
  const fold = (col + (row < 4 ? 1 : 0)) % 12;
  return [0x20161d, 0x271b24, 0x2e2029, 0x32242d, 0x32242d, 0x30222b,
    0x2b1e26, 0x291c24, 0x291c24, 0x251a21, 0x22171e, 0x20161d][fold]!;
};
const eyeHeights = [9, 9, 9, 9, 8, 8, 8, 7, 7, 6, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0];
const irisHeights = [6, 6, 6, 5, 4, 3];
const eyePixel: Pixel = (col, row) => {
  const across = Math.abs(col - 24), high = Math.abs(row - 9), rim = eyeHeights[across]!;
  if (high > rim) return null;
  if (high >= rim - 1) {
    if (across >= 22) return row <= 9 ? 0xffe5a1 : 0xffbf56;
    if (high === rim) return row <= 9 ? (across % 5 < 3 ? 0xffbe52 : 0xff9c38) : 0xe87722;
    return across > 17 ? 0xff982e : row < 9 ? 0xe73327 : 0xb51b2a;
  }
  if (high === irisHeights[across] || (across === 6 && high <= 2)) return row < 9 ? 0xff453b : 0xd92836;
  if (across === 0 && high <= 2) return high === 2 ? 0xffcb61 : 0x320c1b;
  if (across === 1 && high <= 1) return col < 24 ? 0xf13728 : 0xff892e;
  if (across >= 9 && across <= 11 && row - 9 === (col < 24 ? 1 : -1) * (12 - across)) return 0xe43237;
  return null;
};

const fabric = tile([0, 22, 16, 16], velvet);
const lining = tile([16, 22, 4, 4], (col) => col === 0 ? 0x351a24 : 0x21131d);
const cuff = tile([20, 22, 12, 16], (col, row) => {
  if (row < 12) return velvet(col, row);
  if (row === 12) return 0x8d172f;
  if (row === 15) return 0xb01930;
  return col < 3 ? 0xf33247 : col < 9 ? 0xde2039 : 0xc91d35;
});
const hem = tile([32, 22, 16, 12], (col, row) => {
  if (row < 8 || (row < 10 && col % 4 !== 1 && col % 4 !== 2)) return velvet(col, row);
  return row === 11 ? 0xa31a30 : col % 4 === 1 ? 0xf03a48 : 0xd82238;
});
const stole = tile([48, 22, 10, 16], (col) =>
  [0x95182c, 0xec2c41, 0x3b202a, 0x21171e, 0x21171e, 0x281923, 0x281923, 0x3b1e29, 0xd62238, 0xa01a30][col]!);
const garnet = tile([58, 22, 7, 7], (col, row) => {
  if (row === 0 || col === 0) return 0xfd4b54;
  if (row === 6 || col === 6) return 0x971c34;
  if (col >= 2 && col <= 4 && row >= 2 && row <= 4) return col === 2 && row === 2 ? 0x793342 : 0x2c1522;
  return row + col < 7 ? 0xe72c41 : 0xc21c34;
});
const bodice = tile([65, 22, 15, 22], (col, row) => {
  const across = Math.abs(col - 7);
  if ((across <= 4 && row >= 12 && row <= 13) || (across <= 1 && row >= 10 && row <= 17)) {
    return across === 0 && row === 12 ? 0xff5758 : row === 17 || row === 13 ? 0x9f1a32 : 0xcf213a;
  }
  return velvet(col, row);
});
const chitin = tile([0, 46, 32, 6], (col, row) => {
  if (row === 0) return col < 4 ? 0x693043 : col < 19 ? 0x572536 : 0x452031;
  if (row === 1 && col > 2 && col < 14) return 0x522333;
  if (col < 2 || col > 29) return 0x331520;
  return row < 3 ? 0x421b29 : row < 5 ? 0x351420 : 0x27111a;
});
const ridge = tile([32, 46, 32, 4], (col, row) => {
  if (row === 1 && col >= 3 && col < 12) return 0x804150;
  if (col < 3 || col > 27) return 0x502233;
  return row <= 1 ? 0x633043 : 0x512536;
});
const joint = tile([64, 46, 4, 4], (col, row) => row === 0 ? 0x683144 : col + row < 4 ? 0x481c2b : 0x2e121c);
const eye = tile([0, 0, 49, 19], eyePixel);
const tiles = [eye, fabric, lining, cuff, hem, stole, garnet, bodice, chitin, ridge, joint];

export function paintDRobe(atlas: Png, atlasX: number): void {
  for (const { rect: [left, top, width, height], pixel } of tiles) {
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const color = pixel(col, row);
      const offset = ((top + row) * atlas.w + atlasX + left + col) * 4;
      atlas.px[offset] = (color ?? 0) >> 16;
      atlas.px[offset + 1] = (color ?? 0) >> 8;
      atlas.px[offset + 2] = color ?? 0;
      atlas.px[offset + 3] = color === null ? 0 : 255;
    }
  }
}

const face = (atlasX: number, [left, top, width, height]: Rect) =>
  ({ uv: [atlasX + left, top], uv_size: [width, height] } satisfies { uv: [number, number]; uv_size: [number, number] });

function eyeCubes(atlasX: number): BedrockCube[] {
  const cubes: BedrockCube[] = [];
  const [left, top, width, height] = eye.rect;
  const pixelWidth = 0.60, pixelHeight = 0.57, bottom = 45.6;
  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      if (eyePixel(col, row) === null) { col++; continue; }
      const start = col;
      while (col < width && eyePixel(col, row) !== null) col++;
      const span = col - start;
      const front = face(atlasX, [left + start, top + row, span, 1]);
      const back = face(atlasX, [left + col, top + row, -span, 1]);
      cubes.push({
        origin: [(start - width / 2) * pixelWidth, bottom + (height - 1 - row) * pixelHeight, 0.55], size: [span * pixelWidth, pixelHeight, 0.55],
        uv: { north: front, south: back, up: front, down: front,
          east: face(atlasX, [left + start, top + row, 1, 1]), west: face(atlasX, [left + col - 1, top + row, 1, 1]) },
      });
    }
  }
  return cubes;
}

const pendantBones = new Set(['bone147', 'bone99', 'bone91', 'bone26', 'bone79']);

const oppositeWingBones = new Map([
  ['c2', 'c1'], ['bone51', 'bone41'], ['bone50', 'bone40'], ['bone49', 'bone39'],
  ['bone48', 'bone38'], ['bone47', 'bone37'], ['bone46', 'bone36'],
  ['bone45', 'bone35'], ['bone44', 'bone34'], ['bone43', 'bone33'],
]);
type Point = BedrockBone['pivot'];
const reflectPoint = ([across, up, back]: Point): Point => [-across, up, back];
const reflectRotation = ([pitch, yaw, roll]: Point): Point => [pitch, -yaw, -roll];

function mirrorWing(source: BedrockBone, target: BedrockBone): BedrockBone {
  return { ...target, pivot: reflectPoint(source.pivot), rotation: source.rotation && reflectRotation(source.rotation),
    cubes: source.cubes?.map(cube => {
      const [across, up, back] = cube.origin;
      const faces = cube.uv;
      if (Array.isArray(faces)) throw new Error('D版背肢需要逐面 UV');
      const flip = (rect: NonNullable<typeof faces.north>) => face(0, [rect.uv[0] + rect.uv_size[0], rect.uv[1], -rect.uv_size[0], rect.uv_size[1]]);
      return { ...cube, origin: [-across - cube.size[0], up, back],
        pivot: cube.pivot && reflectPoint(cube.pivot), rotation: cube.rotation && reflectRotation(cube.rotation),
        uv: { north: flip(faces.north!), south: flip(faces.south!), east: flip(faces.west!), west: flip(faces.east!), up: flip(faces.up!), down: flip(faces.down!) } };
    }),
  };
}

export function dRobeGeometry(model: Geometry, atlasX: number): Geometry {
  const bones = new Map(model.bones.map(bone => [bone.name, bone]));
  const under = (bone: BedrockBone, ...roots: string[]) => {
    for (let current: BedrockBone | undefined = bone; current; current = bones.get(current.parent ?? '')) {
      if (roots.includes(current.name)) return current;
    }
    return undefined;
  };
  const uv = (swatch: typeof fabric) => face(atlasX, swatch.rect);
  const wrap = (broad: typeof fabric, side = broad, cap = lining) => ({
    north: uv(broad), south: uv(broad), east: uv(side), west: uv(side), up: uv(cap), down: uv(cap),
  });
  const dressed = model.bones.map((bone): BedrockBone => {
    if (bone.name === 'ysmGlowbone24') return { ...bone, cubes: eyeCubes(atlasX) };
    if (!bone.cubes?.length) return bone;
    const root = under(bone, 'c1');
    if (root) {
      const anchor = new Vector3().setFromMatrixPosition(skeletonMatrix(model, root.name, {}, 1))
        .applyMatrix4(skeletonMatrix(model, bone.name, {}, 1).invert());
      const center = [bone.pivot[0] - anchor.x, bone.pivot[1] + anchor.y, bone.pivot[2] + anchor.z];
      const reach = 0.64;
      return { ...bone, cubes: bone.cubes.map(cube => {
        const size: BedrockCube['size'] = [cube.size[0] * reach + 2 * (cube.inflate ?? 0) * (reach - 1), cube.size[1], cube.size[2]];
        const coord = (axis: number) => center[axis] + (cube.origin[axis] + cube.size[axis] / 2 - center[axis]) * reach - size[axis] / 2;
        return { ...cube, size, origin: [coord(0), coord(1), coord(2)] as BedrockCube['origin'],
          uv: { ...wrap(chitin, joint), up: uv(ridge) } };
      }) };
    }
    const skirt = under(bone, 'Skirt');
    const band = under(bone, 'pf1', 'pf2', 'pfh1', 'pfh2');
    const sleeve = bone.parent === 'xiu' || bone.parent === 'xiu2';
    const upperArm = bone.name === 'LeftArm' || bone.name === 'RightArm';
    const foreArm = bone.name === 'LeftForeArm' || bone.name === 'RightForeArm';
    if (!skirt && !band && !sleeve && !upperArm && !foreArm && !pendantBones.has(bone.name) && bone.name !== 'UpperBody2' && bone.name !== 'bust') return bone;
    return { ...bone, cubes: bone.cubes.map(cube => {
      if (foreArm && cube.size[1] !== 5) return cube;
      if (pendantBones.has(bone.name)) return { ...cube, uv: wrap(garnet, lining) };
      if (band) return { ...cube, uv: wrap(stole, lining) };
      if (sleeve) return { ...cube, uv: wrap(cuff) };
      if (skirt && cube.origin[1] < 7) {
        const edge = (width: number) => face(atlasX, [hem.rect[0], hem.rect[1], 2 * Math.round(width), hem.rect[3]]);
        const front = edge(cube.size[0]), side = edge(cube.size[2]);
        return { ...cube, uv: { north: front, south: front, east: side, west: side, up: uv(fabric), down: uv(lining) } };
      }
      const faces = wrap(fabric);
      if (bone.name === 'UpperBody2' && cube.size[1] > 10) faces.north = uv(bodice);
      return { ...cube, uv: faces };
    }) };
  });
  const byName = new Map(dressed.map(bone => [bone.name, bone]));
  return { ...model, bones: dressed.map(bone => {
    const opposite = oppositeWingBones.get(bone.name);
    return opposite ? mirrorWing(byName.get(opposite)!, bone) : bone;
  }) };
}
