// 思索界面里三维那一层的共用画法（6-3-2、6-4-3a 两段思索都用）：场景板方块的几何和材质、描框、正交镜头、方块碎屑的逐刻推算，
// 以及整个界面层的叠法（背景暗色 → 三维场景板 → 标题、按钮、进度条、说明框 → 标题框里的物品）和关界面的按钮声。
// 场景板上摆什么、谁拿什么、说明和时间留在各段自己的 思索.tsx / 编排.ts；2D 外框的画法在 思索界面.tsx。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import type { EntityModelData } from '../../engine/model/实体模型.tsx';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import { png, type Png } from '../../engine/model/贴图.ts';
import giantRaw from 'asset:模型/角色/巨人';
import steveUri from 'asset:贴图/角色/巨人/史蒂夫';
import { sfxVolume } from '../../engine/audio/混音.ts';
import { ponderScreen, drawBackground, drawTitle, drawButtons, drawProgressBar, drawTextWindow, itemFramePos, type 说明框 } from './思索界面.tsx';
// 按钮声文件放在 6-3-2 段目录（那一段先做的）
import clickWav from 'asset:音效/镜头/6-3-2/点击';
import { 清单Audio } from '../../engine/audio/声音Sequence.tsx';

export const PLAYER = (giantRaw as unknown as { models: Record<'宽', EntityModelData> }).models.宽;
export const STEVE = png(steveUri);
export const PX_W = ponderScreen.W * ponderScreen.s;
export const PX_H = ponderScreen.H * ponderScreen.s;
type V3 = [number, number, number];
type BlockPos = { x: number; y: number; z: number };

// ---------- 场景板的方块 ----------
// 面朝向的明暗照原版主世界的 Level.getShade：上 1.0、南北 0.8、东西 0.6、下 0.5（原版直接乘在 sRGB 数值上，这里按 sRGB 换成顶点色）
export type Face = { n: V3; light: number };
export const faces: Face[] = [
  { n: [0, 1, 0], light: 1.0 },
  { n: [0, -1, 0], light: 0.5 },
  { n: [0, 0, -1], light: 0.8 },
  { n: [0, 0, 1], light: 0.8 },
  { n: [-1, 0, 0], light: 0.6 },
  { n: [1, 0, 0], light: 0.6 },
];

// 一个面的四个角（逆时针，从外面看）和贴图坐标
const faceVertices = (block: BlockPos, face: Face, height: number) => {
  const [x, y, z] = [block.x, block.y, block.z];
  const [nx, ny, nz] = face.n;
  const corner = (dx: number, dy: number, dz: number): V3 => [x + dx, y + dy * height, z + dz];
  let verts: V3[];
  if (ny > 0) verts = [corner(0, 1, 1), corner(1, 1, 1), corner(1, 1, 0), corner(0, 1, 0)];
  else if (ny < 0) verts = [corner(0, 0, 0), corner(1, 0, 0), corner(1, 0, 1), corner(0, 0, 1)];
  else if (nz < 0) verts = [corner(1, 0, 0), corner(0, 0, 0), corner(0, 1, 0), corner(1, 1, 0)];
  else if (nz > 0) verts = [corner(0, 0, 1), corner(1, 0, 1), corner(1, 1, 1), corner(0, 1, 1)];
  else if (nx < 0) verts = [corner(0, 0, 0), corner(0, 0, 1), corner(0, 1, 1), corner(0, 1, 0)];
  else verts = [corner(1, 0, 1), corner(1, 0, 0), corner(1, 1, 0), corner(1, 1, 1)];
  // 侧面贴图 v 从下往上：半格高的方块（台阶）侧面取下半张
  const v1 = ny === 0 ? height : 1;
  const uv = [0, 0, 1, 0, 1, v1, 0, v1];
  return { P: verts, uv };
};

export const posKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
// 按给的方块建几何：每张贴图一份，面被相邻的整块挡住就不画（和游戏里一样剔掉看不见的面）。
// 只和传进来的这批方块比；高度不给就都是整格
export const buildBlockGeometry = <B extends BlockPos>(blocks: B[], textureName: (block: B, normal: number[]) => string, blockHeight: (block: B) => number = () => 1) => {
  const occupied = new Map<string, B>();
  for (const block of blocks) occupied.set(posKey(block.x, block.y, block.z), block);
  const groups = new Map<string, { pos: number[]; uv: number[]; col: number[]; idx: number[] }>();
  const color = new THREE.Color();
  for (const block of occupied.values()) {
    const height = blockHeight(block);
    for (const face of faces) {
      const nb = occupied.get(posKey(block.x + face.n[0], block.y + face.n[1], block.z + face.n[2]));
      // 挡住：邻居是整块；台阶的顶面不挡也不被挡；台阶的底面被下面的整块挡住
      if (nb && blockHeight(nb) === 1 && !(height < 1 && face.n[1] > 0)) continue;
      if (nb && blockHeight(nb) < 1 && face.n[1] > 0) continue; // 上面压着台阶（台阶底面是整面）
      const name = textureName(block, face.n);
      let group = groups.get(name);
      if (!group) groups.set(name, (group = { pos: [], uv: [], col: [], idx: [] }));
      const { P: verts, uv } = faceVertices(block, face, height);
      const base = group.pos.length / 3;
      color.setRGB(face.light, face.light, face.light, THREE.SRGBColorSpace);
      verts.forEach((vertex) => {
        group!.pos.push(...vertex);
        group!.col.push(color.r, color.g, color.b);
      });
      group.uv.push(...uv);
      group.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return [...groups.entries()].map(([name, group]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(group.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(group.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(group.col, 3));
    geo.setIndex(group.idx);
    return { name, geo };
  });
};

export const blockTexture = (tex: Png) => {
  const t = entityTexture(tex);
  t.flipY = false;
  return t;
};
// entityTexture 的 DataTexture 第一行在 v = 0；方块面的 v 从下往上，所以在 uv 里翻过来
export const flipMapV = (material: THREE.MeshBasicMaterial) => {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2(uv.x, 1.0 - uv.y);');
  };
  return material;
};
// 每段一份：按贴图名和不透明度缓存方块材质
export const blockMaterials = (TEX: Record<string, Png>) => {
  const materialCache = new Map<string, THREE.MeshBasicMaterial>();
  return (name: string, opacity: number) => {
    const key = `${name}|${opacity.toFixed(3)}`;
    let material = materialCache.get(key);
    if (!material) {
      material = flipMapV(new THREE.MeshBasicMaterial({ map: blockTexture(TEX[name]), vertexColors: true, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }));
      materialCache.set(key, material);
    }
    return material;
  };
};

// 描框（OutlinerElement）：12 条棱，每条 1/16 格粗，调色的颜色
export const Outline: React.FC<{ min: number[]; max: number[]; color: number; k: number }> = ({ min, max, color: color, k }) => {
  if (k <= 0.01) return null;
  const edgeWidth = 1 / 16;
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const edges: [number[], number[]][] = [];
  for (const y of [y0, y1]) for (const z of [z0, z1]) edges.push([[x0, y, z], [x1, y, z]]);
  for (const x of [x0, x1]) for (const z of [z0, z1]) edges.push([[x, y0, z], [x, y1, z]]);
  for (const x of [x0, x1]) for (const y of [y0, y1]) edges.push([[x, y, z0], [x, y, z1]]);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: k, depthTest: false, toneMapped: false });
  return (
    <>
      {edges.map(([from, to], i) => (
        <mesh key={i} position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]} material={mat} renderOrder={20}>
          <boxGeometry args={[Math.abs(to[0] - from[0]) + edgeWidth, Math.abs(to[1] - from[1]) + edgeWidth, Math.abs(to[2] - from[2]) + edgeWidth]} />
        </mesh>
      ))}
    </>
  );
};

// 正交镜头：照思索的默认视角，场景中心在画面中心，每格 pixelsPerBlock 个画面像素（三个数在各段 编排.ts）
export type PonderView = { viewRotation: THREE.Quaternion; sceneCenter: number[]; pixelsPerBlock: number };
// 透视（6-3-2 关界面后往场景板里推近用）：朝向同正交，位置、竖直视角（度）、远近裁剪面由段里给（游戏坐标）
export type PonderPerspective = { pos: V3; fov: number; near: number; far: number };
const PonderCamera: React.FC<{ view: PonderView; perspective?: PonderPerspective; toneMapping: THREE.ToneMapping }> = ({ view, perspective, toneMapping }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = toneMapping;
  const inv = view.viewRotation.clone().invert();
  if (perspective) {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...perspective.pos);
    cam.fov = perspective.fov;
    cam.near = perspective.near;
    cam.far = perspective.far;
  } else {
    const cam = camera as THREE.OrthographicCamera;
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(inv).multiplyScalar(500);
    cam.position.set(view.sceneCenter[0] + back.x, view.sceneCenter[1] + back.y, view.sceneCenter[2] + back.z);
    cam.zoom = view.pixelsPerBlock;
    cam.near = 1;
    cam.far = 1000;
  }
  camera.quaternion.copy(inv);
  (camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
  camera.updateMatrixWorld();
  return null;
};

// ---------- 方块碎屑（原版 TerrainParticle，按刻算） ----------
export const makeRand = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    state ^= state >>> 12;
    return ((Math.imul(state, 0x297a2d39) >>> 0) % 1000003) / 1000003;
  };
};
// 一颗碎屑的初速度、寿命、半边长（ParticleEngine.destroy 在格子里 (dx, dy, dz) 处放的那颗）：
// Particle 构造函数把速度随机化：各轴 + (r×2 − 1)×0.4，再归一化乘 (r + r + 1)×0.15×0.4，竖直再 +0.1；
// 寿命 4/(r×0.9 + 0.1) 刻；quadSize：0.1×(0.5～1)×2，再减半（TerrainParticle）。随机数的取用顺序照原版，贴图偏移由调用方接着取
export const destroyParticle = (dx: number, dy: number, dz: number, rand: () => number) => {
  let xd = dx - 0.5 + (rand() * 2 - 1) * 0.4;
  let yd = dy - 0.5 + (rand() * 2 - 1) * 0.4;
  let zd = dz - 0.5 + (rand() * 2 - 1) * 0.4;
  const speedMag = (rand() + rand() + 1) * 0.15;
  const dirLen = Math.hypot(xd, yd, zd) || 1;
  xd = (xd / dirLen) * speedMag * 0.4;
  yd = (yd / dirLen) * speedMag * 0.4 + 0.1;
  zd = (zd / dirLen) * speedMag * 0.4;
  const v = [xd, yd, zd];
  const lifeTicks = Math.floor(4 / (rand() * 0.9 + 0.1));
  const 半 = 0.1 * (rand() * 0.5 + 0.5);
  return { v, lifeTicks, 半 };
};
// 碎屑在 t 秒的位置（`Particle.tick` 逐刻：yd −= 0.04，带碰撞挪一步，×0.98，着地时水平速度再 ×0.7）。
// 碰撞按「这一刻哪些方块还在」算（groundY：脚下最近的实心面，isSolid：这一点是不是实心），由各段给。
// 原版碎屑落地后不再动（`stoppedByCollision`），这里让它接着往下掉，免得砸穿的那一柱里飘着一层碎屑。到寿命或掉出板子就是 null
export const debrisPosAt = (
  debris: { p: number[]; v: number[]; lifeTicks: number },
  startSec: number,
  tickSec: number,
  t: number,
  groundY: (x: number, z: number, y: number, t: number) => number,
  isSolid: (x: number, y: number, z: number, t: number) => boolean,
) => {
  const ticks = (t - startSec) / tickSec;
  if (ticks < 0 || ticks > debris.lifeTicks) return null;
  const pos = [...debris.p];
  const vel = [...debris.v];
  let i = 0;
  for (; i + 1 <= ticks; i++) {
    const tt = startSec + (i + 1) * tickSec;
    vel[1] -= 0.04;
    let landed = false;
    const ny = pos[1] + vel[1];
    const floorY = vel[1] < 0 ? groundY(pos[0], pos[2], pos[1], tt) : -Infinity;
    if (ny < floorY) {
      pos[1] = floorY;
      vel[1] = 0;
      landed = true;
    } else pos[1] = ny;
    if (isSolid(pos[0] + vel[0], pos[1] + 0.01, pos[2], tt)) vel[0] = 0;
    else pos[0] += vel[0];
    if (isSolid(pos[0], pos[1] + 0.01, pos[2] + vel[2], tt)) vel[2] = 0;
    else pos[2] += vel[2];
    vel[0] *= 0.98;
    vel[1] *= 0.98;
    vel[2] *= 0.98;
    if (landed) {
      vel[0] *= 0.7;
      vel[2] *= 0.7;
    }
  }
  // 掉出场景板底下的不画（思索的场景外面是空的，碎屑会一直往下掉，掉到按钮和进度条上）
  if (pos[1] < 0) return null;
  // 刻之间插值：只插还能动的方向（落在地上的不往地里插）
  const frac = ticks - i;
  const tt = startSec + i * tickSec;
  const y = Math.max(pos[1] + vel[1] * frac, vel[1] < 0 ? groundY(pos[0], pos[2], pos[1], tt) : -Infinity);
  return [pos[0] + vel[0] * frac, y, pos[2] + vel[2] * frac];
};
// 碎屑画成朝着镜头的小方片（原版 SingleQuadParticle）：镜头的右、上两个方向，和方片四个角（左下起逆时针）
export const billboardAxes = (viewRotation: THREE.Quaternion) => ({
  camRight: new THREE.Vector3(1, 0, 0).applyQuaternion(viewRotation.clone().invert()),
  camUp: new THREE.Vector3(0, 1, 0).applyQuaternion(viewRotation.clone().invert()),
});
export const QUAD_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
// 颜色乘 0.6（TerrainParticle 的 rCol = gCol = bCol = 0.6）
export const debrisMaterial = (tex: Png) =>
  new THREE.MeshBasicMaterial({ map: entityTexture(tex), color: new THREE.Color().setRGB(0.6, 0.6, 0.6, THREE.SRGBColorSpace), side: THREE.DoubleSide, alphaTest: 0.5, toneMapped: false });

// ---------- 界面层 ----------
const Canvas2D: React.FC<{ draw: (ctx: CanvasRenderingContext2D) => void; dep: unknown }> = ({ draw: draw, dep }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, PX_W, PX_H);
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
  }, [dep]);
  return <canvas ref={ref} width={PX_W} height={PX_H} style={{ position: 'absolute', left: 0, top: 0, width: PX_W, height: PX_H }} />;
};

// 标题框里的物品：思索里放大 2 倍（GuiGameElement.scale(2)），各段给物品模型和 display.gui 的变换
const ItemCamera: React.FC = () => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NoToneMapping;
  const cam = camera as THREE.OrthographicCamera;
  cam.position.set(0, 0, 100);
  cam.lookAt(0, 0, 0);
  cam.zoom = 16 * 2 * ponderScreen.s;
  cam.near = 1;
  cam.far = 200;
  cam.updateProjectionMatrix();
  return null;
};
const TitleItem: React.FC<{ a: number; children: React.ReactNode }> = ({ a: alpha, children }) => {
  const sizePx = itemFramePos.size * ponderScreen.s;
  return (
    <ThreeCanvas orthographic flat width={sizePx} height={sizePx} style={{ position: 'absolute', left: itemFramePos.x * ponderScreen.s, top: itemFramePos.y * ponderScreen.s, opacity: alpha }}>
      <ItemCamera />
      <ambientLight intensity={1.3} />
      <directionalLight position={[-0.3, 1, 0.8]} intensity={1.6} />
      {children}
    </ThreeCanvas>
  );
};

// 整个思索界面（不含底下的世界画面）：背景暗色 → 三维场景板（children，正交镜头和灯光这里给）→ 标题、按钮、进度条、说明框 → 标题框里的物品（item）
// 可选（6-3-2 用）：backdrop 底色不透明（暗色铺在黑底上，同没有世界画面时原版 Screen.renderBackground 的 fillGradient 叠在黑屏上）；
// chrome 只淡标题、按钮、说明框、物品（场景板照画）；perspective 换透视镜头；lights、toneMapping 换掉默认的灯和色调映射
// （方块、碎屑、描框是不受光的材质，不做色调映射，换了也不变）。
export const PonderUiLayer: React.FC<{
  frame: number;
  opacity: number;
  view: PonderView;
  title: string;
  progress: number;
  keyframes: number[];
  captions: 说明框[];
  item: React.ReactNode;
  children: React.ReactNode;
  backdrop?: boolean;
  chrome?: number;
  perspective?: PonderPerspective;
  lights?: React.ReactNode;
  toneMapping?: THREE.ToneMapping;
}> = ({ frame, opacity, view, title: title, progress, keyframes, captions, item, children, backdrop = false, chrome = 1, perspective, lights, toneMapping = THREE.NoToneMapping }) => (
  <AbsoluteFill style={{ opacity, backgroundColor: backdrop ? '#000' : undefined }}>
    <Canvas2D dep={frame} draw={(ctx) => drawBackground(ctx, 1)} />
    <ThreeCanvas key={perspective ? '透视' : '正交'} orthographic={!perspective} flat width={PX_W} height={PX_H} style={{ position: 'absolute', left: 0, top: 0 }} gl={{ antialias: true }}>
      <PonderCamera view={view} perspective={perspective} toneMapping={toneMapping} />
      {lights ?? (
        <>
          <ambientLight intensity={1.4} />
          <directionalLight position={[-3, 8, -4]} intensity={1.6} />
        </>
      )}
      {children}
    </ThreeCanvas>
    {chrome > 0 && (
      <>
        <Canvas2D
          dep={`${frame}|${chrome}`}
          draw={(ctx) => {
            drawTitle(ctx, title, chrome);
            drawButtons(ctx, chrome);
            drawProgressBar(ctx, progress, keyframes, chrome);
            for (const caption of captions) drawTextWindow(ctx, caption, chrome);
          }}
        />
        <TitleItem a={chrome}>{item}</TitleItem>
      </>
    )}
  </AbsoluteFill>
);

// 关界面那一下原版按钮声（思索的 jar 里没有自己的音效，游戏里按住按键打开不出声），乘音效总线；at 是第几帧
export const CloseClick: React.FC<{ at: number }> = ({ at }) => (
  <清单Audio kind="音效清单" 名="关界面按钮声" src={clickWav} 文件="镜头/6-3-2/点击.wav" 时长={0.28} from={at} volume={0.5 * sfxVolume} />
);
