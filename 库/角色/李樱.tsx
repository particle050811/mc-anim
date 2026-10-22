// 李樱：照 assets/src/角色/李樱/3D模型/build_li_ying.py（Blender 体素模型 v3）原样搬过来的精细模型，外观以设定图 设定图/李樱/三视图 为准。
// 几何和颜色不是手写的：同目录 李樱体素导出.py 调用那份脚本的体素生成函数，写出资产 体素/李樱（每面四角 + 法线 + 颜色，base64），这里同步建成带顶点色的网格。
// 改模型：改 Blender 脚本 → 重跑导出、按 assets/kits/李樱.toml「生成链」重新入库，这个文件不用动。
// 三个黄铜齿轮（左胸、左肩、左腿外侧）和左臂铜管不是体素：json 的 extras 里是参数，这里建成平滑几何（梯形齿齿轮、沿曲线圆管），用方块堆圆只会有锯齿。
// 没有背包：背面只有背带和胸带交叉。扳手和枯石太刀不在这里：手上、腰上的东西由 handR / handL / hipL 传入。尺寸单位见 骨架.tsx。
// 核对：作品的核对段 核对-角色包（新旧逐像素比）；量比例的「李樱对照」还在旧项目。
import React, { useContext, useMemo } from 'react';
import * as THREE from 'three';
import { Ghost } from '../../engine/model/parts.tsx';
import type { Mouth as MouthState } from './口型.ts';
import { Figure, type FigurePose } from './骨架.tsx';
import { type MouthSpec, TalkingMouth } from './嘴.tsx';
import raw from 'asset:体素/李樱';

// 配色：Blender 脚本调色板 P 里各部位的基色（取自参考图正对镜头的面），给镜头里的特效、碎屑取色用
export const LIYING = {
  hair: '#30231a',
  hairHi: '#45321f',
  skin: '#cfa07f',
  eye: '#7c0907',
  eyeWhite: '#e0d3cd',
  brow: '#1c0f07',
  jacket: '#373e41',
  jacketDark: '#31383b',
  pants: '#373d3f',
  leather: '#412d21',
  leatherDark: '#33231a',
  brass: '#c89d54',
  lens: '#3e6569',
  copper: '#9a5530',
};

type MatTag = 'cloth' | 'skin' | 'hair' | 'leather' | 'metal' | 'glass' | 'lacquer' | 'emit';
type Chunk = { mat: MatTag; n: number; pos: string; nor: string; col: string };
type PartName = 'head' | 'torso' | 'armR' | 'armL' | 'legR' | 'legL' | 'forearmR' | 'forearmL' | 'shinR' | 'shinL';
type GearSpec = { part: PartName; pos: number[]; dir: number[]; dia: number; thick: number; hub: string | null };
type PipeSpec = { part: PartName; pts: number[][]; r: number; ring?: boolean };
type Extras = {
  gears: GearSpec[];
  pipes: PipeSpec[];
  teeth: number;
  tooth: [number, number]; // 齿根宽、齿顶宽
  hole: number; // 孔半径 / 齿轮半径
  colors: { brass: string; brassLight: string; brassMid: string; copper: string; steel: string };
};
const { extras: EXTRAS, ...parts } = raw as unknown as Record<PartName, Chunk[]> & { extras: Extras };
const DATA = parts as Record<PartName, Chunk[]>;

// 各部位的材质参数，对应 Blender 脚本的 PBR 表。金属度压得很低：场景里没有环境贴图，金属度高了黄铜会发黑
const PBR: Record<MatTag, { rough: number; metal?: number; emissive?: string; emit?: number }> = {
  cloth: { rough: 0.9 },
  skin: { rough: 0.7 },
  hair: { rough: 0.82 },
  leather: { rough: 0.65 },
  metal: { rough: 0.45, metal: 0.15 },
  glass: { rough: 0.15, emissive: '#3e6569', emit: 0.35 },
  lacquer: { rough: 0.5 },
  emit: { rough: 0.5, emissive: '#5fc6bd', emit: 1.5 },
};

const bytes = (b64: string) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// 各镜头都用 NeutralToneMapping，它会从每个像素里减一份"镜面反射底色"（最暗通道 x < 0.08 时减 x − 6.25x²，否则减 0.04）。这里没有环境贴图，
// 深色衣服（夹克线性值只有 0.04）会被压到接近黑，所以在顶点色里先把这份底色加回去：受光系数为 1 的面，出图正好是调色板颜色。
const liftForNeutral = (rgb: [number, number, number]): [number, number, number] => {
  const x = Math.min(...rgb);
  const lift = (x < 0.04 ? 0.4 * Math.sqrt(x) : x + 0.04) - x;
  return [rgb[0] + lift, rgb[1] + lift, rgb[2] + lift];
};

// 一块 = 同一材质的一批四边形。每个面四个顶点不共用，法线和颜色整面一致（干净的色块，不插值、不糊）
const chunkGeo = (chunk: Chunk) => {
  const quad = new Float32Array(bytes(chunk.pos).buffer);
  const fn = new Float32Array(bytes(chunk.nor).buffer);
  const fc = bytes(chunk.col);
  const nor = new Float32Array(chunk.n * 12);
  const col = new Float32Array(chunk.n * 12);
  const idx: number[] = [];
  for (let face = 0; face < chunk.n; face++) {
    const rgb = liftForNeutral([s2l(fc[face * 3] / 255), s2l(fc[face * 3 + 1] / 255), s2l(fc[face * 3 + 2] / 255)]);
    for (let corner = 0; corner < 4; corner++) {
      for (let axis = 0; axis < 3; axis++) {
        nor[face * 12 + corner * 3 + axis] = fn[face * 3 + axis];
        col[face * 12 + corner * 3 + axis] = rgb[axis];
      }
    }
    idx.push(face * 4, face * 4 + 1, face * 4 + 2, face * 4, face * 4 + 2, face * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};

const liftHex = (hex: string) => {
  const color = new THREE.Color(hex);
  const [red, green, blue] = liftForNeutral([color.r, color.g, color.b]);
  return new THREE.Color().setRGB(red, green, blue);
};

// ---------- 齿轮：圆环轮体 + 等宽梯形齿 + 中心圆孔，挤出成有厚度的实体，边缘带一点倒角 ----------
// 轮廓全用折线给出（圆按固定边数），不靠 curveSegments 细分：面数可控，6-1-2 每帧要画李樱加几个残影
const CIRCLE_SIDES = 24;
const circle = (path: THREE.Path, radius: number, cw: boolean) => {
  for (let i = 0; i <= CIRCLE_SIDES; i++) {
    const angle = ((cw ? -1 : 1) * i * Math.PI * 2) / CIRCLE_SIDES;
    if (i === 0) path.moveTo(radius * Math.cos(angle), radius * Math.sin(angle));
    else path.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  return path;
};

const withHole = (shape: THREE.Shape, inner: number) => {
  shape.holes.push(circle(new THREE.Path(), inner, true));
  return shape;
};

const ring = (outer: number, inner: number) => withHole(circle(new THREE.Shape(), outer, false) as THREE.Shape, inner);

// 齿形外轮廓：齿根圆上均布 teeth 个平顶梯形齿（齿根宽 rootW、齿顶宽 tipW），齿间的齿根圆弧用 3 段折线，第一个齿朝本地 +X
const toothed = (tipRadius: number, root: number, inner: number) => {
  const [rootW, tipW] = EXTRAS.tooth;
  const toothCount = EXTRAS.teeth;
  const ar = Math.asin(rootW / 2 / root);
  const at = Math.asin(tipW / 2 / tipRadius);
  const step = (Math.PI * 2) / toothCount;
  const shape = new THREE.Shape();
  const pt = (r: number, a: number) => [r * Math.cos(a), r * Math.sin(a)] as const;
  shape.moveTo(...pt(root, -ar));
  for (let k = 0; k < toothCount; k++) {
    const toothAngle = k * step;
    shape.lineTo(...pt(tipRadius, toothAngle - at));
    shape.lineTo(...pt(tipRadius, toothAngle + at));
    shape.lineTo(...pt(root, toothAngle + ar));
    for (let j = 1; j <= 3; j++) shape.lineTo(...pt(root, toothAngle + ar + ((step - 2 * ar) * j) / 3));
  }
  return withHole(shape, inner);
};

const BEVEL = 0.05;
const extrude = (shape: THREE.Shape, depth: number) => {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * BEVEL,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 1,
  });
  geo.translate(0, 0, BEVEL);
  return geo;
};

type Piece = { geo: THREE.BufferGeometry; color: THREE.Color; metal: number; rough: number; double?: boolean };

// 齿盘（含齿）厚 thick；孔边一圈轴套再高 0.2，颜色暗一档；孔整个凹到安装面，孔底是深色轴心（hub 为空时露出安装面）
const gearPieces = (gear: GearSpec): Piece[] => {
  const radius = gear.dia / 2;
  const hole = radius * EXTRAS.hole;
  const brass = { metal: 0.3, rough: 0.4 };
  const out: Piece[] = [
    { geo: extrude(toothed(radius, radius - 0.5, hole), gear.thick), color: liftHex(EXTRAS.colors.brass), ...brass },
    { geo: extrude(ring(hole + 0.3, hole), gear.thick + 0.2), color: liftHex(EXTRAS.colors.brassMid), ...brass },
  ];
  if (gear.hub) {
    const disc = new THREE.CircleGeometry(hole, CIRCLE_SIDES);
    disc.translate(0, 0, 0.02);
    out.push({ geo: disc, color: liftHex(gear.hub), metal: 0, rough: 0.8 });
  }
  return out;
};

// ---------- 铜管：沿导出的轴线点扫出的圆管，两端用半球封口（也盖住弯肘时上下两段的接缝）；钢箍是粗一圈的短管 ----------
const pipePieces = (pipe: PipeSpec): Piece[] => {
  const pts = pipe.pts.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, Math.max(4, pts.length), pipe.r, 12, false);
  if (pipe.ring) return [{ geo: tube, color: liftHex(EXTRAS.colors.steel), metal: 0.3, rough: 0.35, double: true }];
  const copper = liftHex(EXTRAS.colors.copper);
  const out: Piece[] = [{ geo: tube, color: copper, metal: 0.3, rough: 0.4 }];
  for (const end of [pts[0], pts[pts.length - 1]]) {
    const cap = new THREE.SphereGeometry(pipe.r, 12, 6);
    cap.translate(end.x, end.y, end.z);
    out.push({ geo: cap, color: copper, metal: 0.3, rough: 0.4 });
  }
  return out;
};

const extraCache = new Map<PartName, { pieces: Piece[]; pos?: number[]; dir?: number[] }[]>();
const partExtras = (name: PartName) => {
  let entries = extraCache.get(name);
  if (!entries) {
    entries = [
      ...EXTRAS.gears.filter((g) => g.part === name).map((g) => ({ pieces: gearPieces(g), pos: g.pos, dir: g.dir })),
      ...EXTRAS.pipes.filter((p) => p.part === name).map((p) => ({ pieces: pipePieces(p) })),
    ];
    extraCache.set(name, entries);
  }
  return entries;
};

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Extras: React.FC<{ name: PartName }> = ({ name }) => {
  const ghost = useContext(Ghost);
  const items = useMemo(() => partExtras(name), [name]);
  return (
    <>
      {items.map((it, i) => (
        <group
          key={i}
          position={(it.pos ?? [0, 0, 0]) as [number, number, number]}
          quaternion={it.dir ? new THREE.Quaternion().setFromUnitVectors(Z_AXIS, new THREE.Vector3(...it.dir)) : undefined}
        >
          {it.pieces.map((pc, j) => (
            <mesh key={j} geometry={pc.geo} castShadow={!ghost} receiveShadow={!ghost}>
              {ghost ? (
                <meshBasicMaterial color={ghost.color} transparent opacity={ghost.opacity} depthWrite={false} />
              ) : (
                <meshStandardMaterial color={pc.color} metalness={pc.metal} roughness={pc.rough} side={pc.double ? THREE.DoubleSide : THREE.FrontSide} />
              )}
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
};

const geoCache = new Map<PartName, { mat: MatTag; geo: THREE.BufferGeometry }[]>();
const partGeos = (name: PartName) => {
  let geos = geoCache.get(name);
  if (!geos) {
    geos = DATA[name].map((c) => ({ mat: c.mat, geo: chunkGeo(c) }));
    geoCache.set(name, geos);
  }
  return geos;
};

const Part: React.FC<{ name: PartName }> = ({ name }) => {
  const ghost = useContext(Ghost);
  const geos = useMemo(() => partGeos(name), [name]);
  return (
    <>
      {geos.map(({ mat, geo }) => {
        const pbr = PBR[mat];
        return (
          <mesh key={mat} geometry={geo} castShadow={!ghost} receiveShadow={!ghost}>
            {ghost ? (
              <meshBasicMaterial color={ghost.color} transparent opacity={ghost.opacity} depthWrite={false} />
            ) : (
              <meshStandardMaterial
                vertexColors
                roughness={pbr.rough}
                metalness={pbr.metal ?? 0}
                emissive={pbr.emissive ?? '#000000'}
                emissiveIntensity={pbr.emit ?? 0}
              />
            )}
          </mesh>
        );
      })}
      <Extras name={name} />
    </>
  );
};

// ---------- 说话的嘴（台词口型 口型.ts，画法见 嘴.tsx） ----------
// 脸上那道嘴（Blender 脚本的 MOUTH，颜色 P.mouth）在头插槽里是 x ±0.625、z 0.875～1.125，脸贴面在 y = 4.02、1/16 像素一格。
// 说话时先用肤色盖掉它，再按口型画；闭嘴那道线和它一样大。张到最大 0.625 高，下沿离下巴还有 0.5（用户 10-15 要小一点）
const MOUTH: MouthSpec = {
  cell: 1 / 16,
  w: 1.25,
  h: 0.625,
  closedW: 1.25,
  closedH: 0.25,
  colors: { lip: liftHex('#855847'), inside: liftHex('#5a2b27'), tongue: liftHex('#a8645c') },
};
const MOUTH_TOP = 1.125;
const FACE_SKIN = liftHex('#CFA07F');
const Mouth: React.FC<{ mouth: MouthState }> = ({ mouth }) => {
  const ghost = useContext(Ghost);
  if (ghost) return null;
  return (
    <>
      <mesh position={[0, 4.025, MOUTH_TOP - MOUTH.closedH / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[MOUTH.closedW, MOUTH.closedH]} />
        <meshStandardMaterial color={FACE_SKIN} roughness={PBR.skin.rough} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
      </mesh>
      {/* 嘴.tsx 的几何朝 +Z、往 −Y 张，转成朝 +Y（脸的正面）、往 −Z 张 */}
      <group position={[0, 4.03, MOUTH_TOP]} rotation={[Math.PI / 2, Math.PI, 0]}>
        <TalkingMouth mouth={mouth} spec={MOUTH} />
      </group>
    </>
  );
};

// handR / handL：手里拿的东西（握持点坐标系）；hipL：挂在左腰的东西（刀鞘），跟着髋、不跟胸扭转；嘴：说话时的口型（见 口型.ts）
export const LiYing: React.FC<{ pose: FigurePose; handR?: React.ReactNode; handL?: React.ReactNode; hipL?: React.ReactNode; 嘴?: MouthState }> = ({ pose, handR, handL, hipL, 嘴: mouth }) => (
  <Figure
    pose={pose}
    // 玩家模型 32 像素高，游戏里按 0.9375 倍渲染，实际 1.875 格（碰撞箱才是 1.8）。李樱的身体就是史蒂夫的标准尺寸（头 8、身 12、腿 12）
    height={1.875}
    head={
      <>
        <Part name="head" />
        {mouth && <Mouth mouth={mouth} />}
      </>
    }
    torso={<Part name="torso" />}
    // 左腰挂点：刀鞘等挂件
    hip={<group position={[-5.3, 1.6, 12.6]}>{hipL}</group>}
    armR={<Part name="armR" />}
    armL={<Part name="armL" />}
    legR={<Part name="legR" />}
    legL={<Part name="legL" />}
    forearmR={<Part name="forearmR" />}
    forearmL={<Part name="forearmL" />}
    shinR={<Part name="shinR" />}
    shinL={<Part name="shinL" />}
    handR={handR}
    handL={handL}
  />
);
