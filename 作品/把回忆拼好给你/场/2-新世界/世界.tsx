// 新世界：透视三渲二（平涂、不抗锯齿、不描边：全片不描边，用户 10-24 定）画 地形.ts 铺出来的平原和樱花林，后面一张 2D 画布画天和星星。
// 雾照原版 1.20.1（平原、渲染距离 12 区块）：地形按水平距离（柱形）从 172.8 格到 192 格 smoothstep 混进雾色；天按天幕（眼睛上方 16 格）那一点的距离（球形）
//   从 0 到 192 混，所以只有地平线上方几度是雾色，往上很快就是天色。混色在 sRGB 数值上做（同原版着色器）。天、雾的颜色按原版天亮程度从夜里的颜色插到白天的。
// 雾是自己补在材质上的（不用 three 的 fog）：平涂派生材质时先跑原材质的 onBeforeCompile，所以补在颜色编码之后，平涂的明暗、色调都在雾前面算好。
// 不画太阳月亮：原版太阳月亮走正东、头顶、正西那一圈，镜头一直朝北，它们离画面边还差三十几度。云先不画。
// 剖面附近的列（地形.ts 的 剖面列）不进大网格，按坑态、撤了几排另建网格（每个状态建一次）。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { 拼搭缓冲, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 做机位相机 } from '@engine/三渲二/机位.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { Steve, type StevePose } from '@库/角色/史蒂夫.tsx';
import { 天亮 } from '../../地点/天体.ts';
import { 剖面列, 剖面方块, 剥排方块, 新世界方块, type 坑态 } from './地形.ts';
import { 剖面原点, 地形雾, 天幕高, 天色, 夜天, 星, 渲染距离, 雾色, type 机位帧 } from './参数.ts';
import { 星亮, 星们, 星向在 } from './星.ts';

type 色 = [number, number, number];
const 拆 = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as 色;
const 混 = (a: 色, b: 色, k: number) => a.map((v, i) => v + (b[i]! - v) * k) as 色;

/** 第 刻 刻的地形雾色、地平线上的天色：夜里的地平色往白天的雾色插 */
const 雾色在 = (刻: number) => 混(拆(夜天.地平), 拆(雾色), 天亮(刻));

// ---------- 地形的雾 ----------

const 雾统一量 = {
  mcFogStart: { value: 地形雾.起 },
  mcFogEnd: { value: 地形雾.止 },
  mcFogColor: { value: new THREE.Vector3(...拆(雾色)) },
};

/** 给材质补原版的柱形雾：颜色编码（sRGB）之后按到相机的水平距离混雾色 */
const 补雾 = (m: THREE.Material) => {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, 雾统一量);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMcFogW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;\nuniform float mcFogStart;\nuniform float mcFogEnd;\nuniform vec3 mcFogColor;')
      .replace(
        '#include <colorspace_fragment>',
        [
          '#include <colorspace_fragment>',
          'float mcFogD = length( vMcFogW.xz - cameraPosition.xz );',
          'float mcFogV = mcFogD <= mcFogStart ? 0.0 : ( mcFogD < mcFogEnd ? smoothstep( mcFogStart, mcFogEnd, mcFogD ) : 1.0 );',
          'gl_FragColor.rgb = mix( gl_FragColor.rgb, mcFogColor, mcFogV );',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'mc柱形雾';
  return m;
};

type 类 = '实心' | '镂空';
let 材质们: Record<类, THREE.Material> | null = null;
const 材质 = (c: 类) => {
  if (!材质们) {
    const map = blockAtlas().original;
    const common = { map, vertexColors: true, roughness: 1, metalness: 0 };
    材质们 = {
      实心: 补雾(new THREE.MeshStandardMaterial(common)),
      镂空: 补雾(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide })),
    };
  }
  return 材质们[c];
};

const 建网格 = (方块们: readonly 方块[], 群系: string, 名: string): THREE.Mesh[] => {
  if (!方块们.length) return [];
  const 缓冲们 = 拼搭缓冲(方块们, { 群系 });
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空'] as const) {
    const b = 缓冲们[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, 材质(c));
    mesh.name = `新世界-${名}-${群系}-${c}`;
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  if (缓冲们.半透明.idx.length || 缓冲们.发光.idx.length) throw new Error('新世界里不该有半透明、发光的方块');
  return out;
};

// 一个渲染页面只建一次（几十万个面，建一次一两秒）；剖面那两截按状态各建一次
let 大网格: THREE.Mesh[] | null = null;
const 大地形网格 = () => {
  if (!大网格) {
    const 方块们 = 新世界方块();
    const 留 = (b: 方块) => 剖面列(b.位[0], b.位[1]) === null;
    大网格 = [...建网格(方块们.平原.filter(留), 'minecraft:plains', '大'), ...建网格(方块们.樱花林.filter(留), 'minecraft:cherry_grove', '大')];
  }
  return 大网格;
};
const 剖面网格们 = new Map<string, THREE.Mesh[]>();
const 按状态 = (名: string, 铺: () => 方块[]) => {
  let m = 剖面网格们.get(名);
  if (!m) {
    m = 建网格(铺(), 'minecraft:plains', 名);
    剖面网格们.set(名, m);
  }
  return m;
};

const 地形: React.FC<{ 坑: 坑态; 剥: number }> = ({ 坑, 剥 }) => {
  const 大 = useMemo(大地形网格, []);
  const meshes = [...大, ...按状态(`剖${坑.挖掉}${坑.顶土 ? '顶' : ''}`, () => 剖面方块(坑)), ...按状态(`剥${剥}`, () => 剥排方块(剥))];
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

// ---------- 天 ----------

/** 天的一格多大（成片像素）：和全片 像素N 一样 6，天的渐变一格一格地变，不是平滑的；一颗星也画成一格（大星两格见方） */
const 天格 = 6;

/** 仰角 θ（弧度）处的天色：原版天幕在眼睛上方 天幕高 格，那一点离眼睛 天幕高 / sin θ，球形雾 smoothstep(0, 渲染距离)；地平线以下是雾色。
 *  亮 = 天亮程度（地点/天体.ts），天、雾的颜色从夜里的往白天的插 */
export const 天色在 = (θ: number, 亮 = 1): 色 => {
  const 天 = 混(拆(夜天.顶), 拆(天色), 亮), 雾 = 混(拆(夜天.地平), 拆(雾色), 亮);
  if (θ <= 0) return 雾;
  const d = 天幕高 / Math.sin(θ);
  const t = Math.min(1, d / 渲染距离);
  return 混(天, 雾, t * t * (3 - 2 * t));
};

/** 透视镜头后面的天：一张成片分辨率的 2D 画布，每 天格 见方一格，按这一格中心的视线仰角取色；再把地平线以上的星星加上去（原版 SRC_ALPHA、ONE：加 星亮²，不吃雾） */
const 透视天: React.FC<{ 机位: 机位帧; 刻: number; 宽: number; 高: number }> = ({ 机位, 刻, 宽, 高 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const 画宽 = 宽 * 成片倍数, 画高 = 高 * 成片倍数;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cam = 做机位相机({ 种: '透视', ...机位 }, 宽, 高, 1);
    const nx = Math.ceil(画宽 / 天格), ny = Math.ceil(画高 / 天格);
    const 小 = document.createElement('canvas');
    小.width = nx;
    小.height = ny;
    const sctx = 小.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    const v = new THREE.Vector3();
    const 亮 = 天亮(刻);
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        v.set((((x + 0.5) * 天格) / 画宽) * 2 - 1, 1 - (((y + 0.5) * 天格) / 画高) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
        const c = 天色在(Math.asin(v.y), 亮);
        const o = (y * nx + x) * 4;
        img.data[o] = Math.round(c[0] * 255);
        img.data[o + 1] = Math.round(c[1] * 255);
        img.data[o + 2] = Math.round(c[2] * 255);
        img.data[o + 3] = 255;
      }
    const 加 = Math.round(星亮(刻) ** 2 * 255);
    if (加 > 0) {
      const 前 = cam.getWorldDirection(new THREE.Vector3());
      const 每弧度 = 画高 / 2 / Math.tan((机位.视角 * Math.PI) / 360);
      for (const s of 星们) {
        const [x, y, z] = 星向在(s, 刻);
        if (z <= 0) continue;
        v.set(x, z, -y);
        if (v.dot(前) <= 0) continue;
        v.add(cam.position).project(cam);
        const n = Math.max(1, Math.round(((2 * s.半边) / 星.距离) * 每弧度 / 天格));
        const cx = Math.round((((v.x + 1) / 2) * 画宽) / 天格 - n / 2), cy = Math.round((((1 - v.y) / 2) * 画高) / 天格 - n / 2);
        for (let dy = 0; dy < n; dy++)
          for (let dx = 0; dx < n; dx++) {
            const gx = cx + dx, gy = cy + dy;
            if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue;
            const o = (gy * nx + gx) * 4;
            for (let c = 0; c < 3; c++) img.data[o + c] = Math.min(255, img.data[o + c]! + 加);
          }
      }
    }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(小, 0, 0, nx * 天格, ny * 天格);
  });
  return <canvas ref={ref} width={画宽} height={画高} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};

// ---------- 整个世界 ----------

export type 新世界参数 = {
  机位: 机位帧;
  /** 你（史蒂夫）的姿势；null = 不画（2-第一晚 自己在 children 里画） */
  你: StevePose | null;
  /** 平涂色调（照调子） */
  色调: string;
  /** 游戏刻（地点/天体.ts）：天色、雾色、星星 */
  刻: number;
  /** 剖面：坑挖到哪一步、坑和镜头之间撤了几排（地形.ts） */
  剖: { 坑: 坑态; 剥: number };
  宽: number;
  高: number;
  /** 剖面里的东西（裂纹、掉落物、粒子……）：原点在 剖面原点（坑那一格南面的中点），x 东、y 北、z 上 */
  children?: React.ReactNode;
};

/** 铺满画面的新世界（天 + 地形 + 你），放在 position 不是 static 的容器里，自己贴左上角；整片后期、聊天栏、歌词由段套 */
export const 新世界: React.FC<新世界参数> = ({ 机位, 你, 色调, 刻, 剖, 宽, 高, children }) => {
  雾统一量.mcFogColor.value.set(...雾色在(刻));
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, overflow: 'hidden' }}>
      <透视天 机位={机位} 刻={刻} 宽={宽} 高={高} />
      <三渲二画布 宽={宽} 高={高} 机位={{ 种: '透视', ...机位, 远: 640 }} 色调={色调} style={{ position: 'absolute', left: 0, top: 0 }}>
        <地形 坑={剖.坑} 剥={剖.剥} />
        {你 && <Steve pose={你} />}
        {children && <group position={[...剖面原点]}>{children}</group>}
      </三渲二画布>
    </div>
  );
};
