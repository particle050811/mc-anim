// 门口这个机位屋后的远景（用户 10-24「而且怎么超平坦背景 合理吗？」）：小木屋四周地形.ts 铺的那片地（起伏的平原、西北边坡上的樱花林、橡树，同第 6、7 句），
// 头顶可以加一层原版云（原版云.ts，第 7 句光柱打散的那层），用一台透视相机画，夹在侧剖面的天（2D）和正交那一层（屋子、人）中间；正交那一层盖住的地方看不见。
// 透视相机挂在正交镜头上：眼睛在取景中心正南 视距 格，视距 处一格正好是 每格 个像素（和正交那一层的剖面同大），越远越小；
//   视距 6 时竖直视角约 50°（同第 1 句 场/2-新世界/参数.ts 落定的视角）。眼睛离地 眼高（原版玩家眼睛的高度），地平线放在屋前那条草地（四排，斜投影里往上升 4 × 顶面 ÷ N 格）上面一点。
// 镜头上下摇（落定 ≠ 取景）：眼睛按 落定 的取景放，相机往上仰 atan(高差 ÷ 视距)，画面正中那一行和正交那一层一起挪，远景、天和房子一起走，像一台相机仰起来；
//   再给 升，眼睛跟着升高（近处的地、树往下沉得多，远处的云沉得少），像摇臂从高处降下来。
// 雾照原版 1.20.1（12 区块：柱形，172.8～192 格 smoothstep，同 场/2-新世界/参数.ts 的 地形雾；地点不许引场，数照抄），
//   混进去的颜色取这一像素背后那一行天的颜色（地点/天空.tsx 的渐变，一个贴图像素一行，同一套算法、同一个取整），淡完就和天一样、看不出边。云也吃这层雾。
// 平涂、不描边、不抗锯齿（三渲二画布）。几十万个面的网格一个渲染页面只建一次；材质、雾的统一量每个画布一份。
import { useThree } from '@react-three/fiber';
import type React from 'react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { 拼搭缓冲, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { 小木屋上空云, type 云格子 } from './原版云.ts';
import { 原版云层, 做云材质们, type RGB } from './原版云层.tsx';
import type { 侧取景 } from './侧剖面.tsx';
import { 天亮 } from './天体.ts';
import type { 天色 as 天色类型 } from './天空.tsx';
import { 四周方块, 屋后远景范围 } from './小木屋四周地形.ts';
import { 格原点 } from './门口小木屋.tsx';

/** 透视相机离剖面（y = 0）多远（格）：越小远处缩得越快。6 时 N = 16 下屋后 30 格的樱花树约 300 成片像素高、100 格外的山坡一格约 14 像素
 *  （Agent 暂定，按第 1 句的视角取；先试过 20，屋后的林子大得像一堵墙，盖满半个画面） */
export const 远景视距 = 6;
/** 眼睛离远景地面多高（格）：原版玩家站着眼睛 1.62 格 */
export const 眼高 = 1.62;
/** 地平线比屋前草地的后沿高几格（Agent 暂定：N = 16 时 80 成片像素，一条窄窄的远处草地，再上面是坡和林子） */
export const 地平离草地 = 0.3125;
/** 原版 12 区块的地形雾（照 场/2-新世界/参数.ts 的 地形雾：起 = 192 − 19.2、止 = 192） */
export const 远景雾 = { 起: 172.8, 止: 192 };
/** 屋前草地几排（门口小木屋.tsx 的 j 0～3） */
const 草地排数 = 4;

/** 地平线在成片画面上离画面中心往下几格（按 落定 的取景算） */
export const 地平在中心下 = (落定: 侧取景, 顶面: number) => 落定.中心[1] - (草地排数 * 顶面) / (落定.每格 / 16) - 地平离草地;

/** 镜头往上摇了多少（度）：取景比落定高 高差 格，相机仰 atan(高差 ÷ 视距)，画面上正中那一行正好挪 高差 × 每格 像素（同正交那一层） */
export const 远景仰角 = (取景: 侧取景, 落定: 侧取景) => (Math.atan((取景.中心[1] - 落定.中心[1]) / 远景视距) * 180) / Math.PI;

type 雾统一量 = Record<string, { value: number | THREE.Vector3 }>;

/** 给材质补原版柱形雾，雾色取这一像素背后那一行天的颜色（颜色编码之后、sRGB 数值上混，平涂的明暗、色调都在雾前面算好） */
const 补雾 = <M extends THREE.Material>(m: M, u: 雾统一量): M => {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMcFogW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vMcFogW;',
          'uniform float mcFogStart, mcFogEnd, mcTop, mcBufH, mcPx, mcGround, mcRowPx, mcGrad;',
          'uniform vec3 mcHorizon, mcZenith;',
        ].join('\n'),
      )
      .replace(
        '#include <colorspace_fragment>',
        [
          '#include <colorspace_fragment>',
          'float mcD = length( vMcFogW.xz - cameraPosition.xz );',
          'float mcV = mcD <= mcFogStart ? 0.0 : ( mcD < mcFogEnd ? smoothstep( mcFogStart, mcFogEnd, mcD ) : 1.0 );',
          // 这一像素在整个画面上离顶边几个成片像素 → 天的第几行（从地面线往上数，一行一个贴图像素）→ 那一行的天色（同 天空.tsx：sqrt 渐变、取整）
          'float mcRow = mcTop + ( mcBufH - gl_FragCoord.y ) * mcPx;',
          'float mcZ = ( floor( ( mcGround - mcRow ) / mcRowPx ) + 0.5 ) / 16.0;',
          'vec3 mcSky = floor( mix( mcHorizon, mcZenith, sqrt( clamp( mcZ / mcGrad, 0.0, 1.0 ) ) ) + 0.5 ) / 255.0;',
          'gl_FragColor.rgb = mix( gl_FragColor.rgb, mcSky, mcV );',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => '屋后远景雾';
  return m;
};

// 一个渲染页面只建一次几何
type 远景网格 = { g: THREE.BufferGeometry; 类: '实心' | '镂空'; 名: string };
let 几何缓存: 远景网格[] | null = null;
const 远景几何 = () => {
  if (几何缓存) return 几何缓存;
  const 块 = 四周方块(屋后远景范围);
  const out: 远景网格[] = [];
  for (const [方块们, 群系] of [
    [块.平原, 'minecraft:plains'],
    [块.樱花林, 'minecraft:cherry_grove'],
  ] as [方块[], string][]) {
    const 缓冲们 = 拼搭缓冲(方块们, { 原点: 格原点, 群系 });
    if (缓冲们.半透明.idx.length || 缓冲们.发光.idx.length) throw new Error('屋后远景里不该有半透明、发光的方块');
    for (const 类 of ['实心', '镂空'] as const) {
      const b = 缓冲们[类];
      if (!b.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      out.push({ g, 类, 名: `屋后远景-${群系}-${类}` });
    }
  }
  return (几何缓存 = out);
};

const 解色 = (s: string) => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const 混 = (a: number[], b: number[], t: number) => new THREE.Vector3(...a.map((v, i) => v + (b[i]! - v) * t));

/** 头顶的原版云（原版云.ts 的 小木屋上空云）：飘 = 往东挪了多少（格），剩 = 每一格还剩多少（云洞），色 = 云顶色（sRGB 数值） */
export type 远景云 = { 飘: number; 剩: (c: 云格子) => number; 色: RGB };

/** 画布里的东西：地形网格、云 + 每帧按画布的像素比更新统一量（预览级、成片级的 dpr 不一样） */
const 远景内容: React.FC<{ u: 雾统一量; 云?: 远景云 }> = ({ u, 云 }) => {
  const dpr = useThree((s) => s.viewport.dpr);
  const 页高 = useThree((s) => s.size.height);
  u.mcPx!.value = 成片倍数 / dpr;
  u.mcBufH!.value = 页高 * dpr;
  const [网格们, 云材质] = useMemo(() => {
    const common = { map: blockAtlas().original, vertexColors: true, roughness: 1, metalness: 0 };
    const 材质 = {
      实心: 补雾(new THREE.MeshStandardMaterial(common), u),
      镂空: 补雾(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide }), u),
    };
    const 网格们 = 远景几何().map(({ g, 类, 名 }) => {
      const m = new THREE.Mesh(g, 材质[类]);
      m.name = 名;
      m.frustumCulled = false;
      return m;
    });
    return [网格们, 做云材质们((m) => 补雾(m, u))] as const;
  }, [u]);
  return (
    <group>
      {网格们.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
      {云 && <原版云层 剩={云.剩} 飘={云.飘} 色={云.色} 底高={小木屋上空云.底高} 材质们={云材质} />}
    </group>
  );
};

/** 门口画布 的 远景 给对象时的选项 */
export type 屋后远景选项 = {
  /** 镜头摇的时候落定的那个取景：眼睛按它放，相机往上仰到这一帧的取景（不给 = 取景，平着看） */
  落定?: 侧取景;
  /** 眼睛比平时高几格（不给 = 0）：地不动，近处的樱花林往下沉、露出后面的云 */
  升?: number;
  /** 头顶的原版云；不给不画 */
  云?: 远景云;
};

export type 屋后远景属性 = 屋后远景选项 & {
  /** 这一帧正交那一层的取景（天也按它画） */
  取景: 侧取景;
  /** 整块画面的页面尺寸（同 门口画布） */
  宽: number;
  高: number;
  /** 正交那一层的斜投影俯角（画风.ts 的 正交顶面） */
  顶面: number;
  /** 平涂色调（同正交那一层，夜里压暗的也一样） */
  色调: string;
  /** 天色、刻、明暗幅度：同 侧剖面天空，雾淡进去的就是它画的那片天 */
  天色: 天色类型;
  刻: number;
  明暗幅度: number;
};

/** 放在 门口画布 的天和正交画布中间（绝对定位，自己算位置；比画面高的部分由 门口画布 的 overflow 裁掉） */
export const 屋后远景: React.FC<屋后远景属性> = ({ 取景, 落定 = 取景, 升 = 0, 云, 宽, 高, 顶面, 色调, 天色, 刻, 明暗幅度 }) => {
  const 每格 = 取景.每格;
  if (落定.每格 !== 每格) throw new Error(`屋后远景的 落定 和 取景 要同一个 N：${落定.每格} ≠ ${每格}`);
  const 下 = 地平在中心下(落定, 顶面);
  // 落定时地平线在画面上的位置（成片像素）= 相机画面正中那一行；画布上下对称地包住它
  const 地平行 = 高 * 成片倍数 * 0.5 + 下 * 每格;
  const 半高页 = Math.ceil(Math.max(地平行, 高 * 成片倍数 - 地平行) / 成片倍数);
  const 顶页 = 地平行 / 成片倍数 - 半高页;
  const 眼: [number, number, number] = [取景.中心[0], -远景视距, 落定.中心[1] - 下 + 升];
  const 仰 = (远景仰角(取景, 落定) * Math.PI) / 180;
  // 地形往下挪：不升时眼睛正好在远景地面上 眼高
  const 地形低 = 眼[2] - 升 - 眼高;
  const 视角 = (2 * Math.atan((半高页 * 成片倍数) / (每格 * 远景视距)) * 180) / Math.PI;
  const 亮 = 1 - 明暗幅度 * (1 - 天亮(刻));
  const u = useMemo<雾统一量>(
    () => ({
      mcFogStart: { value: 远景雾.起 },
      mcFogEnd: { value: 远景雾.止 },
      mcTop: { value: 0 },
      mcBufH: { value: 0 },
      mcPx: { value: 1 },
      mcGround: { value: 0 },
      mcRowPx: { value: 1 },
      mcGrad: { value: 1 },
      mcHorizon: { value: new THREE.Vector3() },
      mcZenith: { value: new THREE.Vector3() },
    }),
    [],
  );
  u.mcTop!.value = 顶页 * 成片倍数;
  u.mcGround!.value = 高 * 成片倍数 * 0.5 + 取景.中心[1] * 每格;
  u.mcRowPx!.value = 每格 / 16;
  u.mcGrad!.value = 天色.渐变高;
  u.mcHorizon!.value = 混(解色(天色.夜地平), 解色(天色.地平), 亮);
  u.mcZenith!.value = 混(解色(天色.夜顶), 解色(天色.顶), 亮);
  return (
    <三渲二画布
      宽={宽}
      高={半高页 * 2}
      机位={{ 种: '透视', 眼, 看: [眼[0], 眼[1] + Math.cos(仰), 眼[2] + Math.sin(仰)], 视角, 近: 1, 远: 远景雾.止 + 远景视距 + 16 }}
      色调={色调}
      style={{ position: 'absolute', left: 0, top: 顶页 }}
    >
      <group position={[0, 0, 地形低]}>
        <远景内容 u={u} 云={云} />
      </group>
    </三渲二画布>
  );
};
