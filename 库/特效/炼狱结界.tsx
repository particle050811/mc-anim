// 炼狱结界的线框（启示录 2.3.6 炼狱聚晶 revelation_focus 放出来的 RevelationCageEntity；亚波伦死亡演出 ClientDeathPerformance 是同一个画法），照原版画。
// 出处（CFR 反编译行号；渲 = RevelationFix 4.9 `client/renderer/entity/RevelationCageEntityRenderer`，工具 = 主 jar `z1gned/goetyrevelation/util/RendererUtils`）：
// - 形状：正十二面体线框 50 段（函数名叫 Icosahedron，画的是 12 个五边形），线段表和数值在 炼狱结界线.ts。
// - 画法：工具 104 行 `RenderType.lines()`（SRG m_110504_），就是 F3+B 碰撞箱那种线：不带贴图、不吃光照（传进去的 0xF000F0 这个顶点格式里没有位置放，等于没用），
//   普通半透明混合（srcalpha, 1−srcalpha，不是加色发光），有深度测试、写深度、不剔面，吃雾。渲 47～48、56～57 的深度开关会被 RenderType 自己的状态盖掉。
// - 线宽：`RenderType.LINES` 没指定宽度，取 max(2.5, 窗口宽 ÷ 1920 × 2.5) 像素。原版着色器 rendertype_lines.vsh（client-1.20.1.jar）把每段撑成屏幕上的四边形：
//   起点、终点各自沿「法线投到屏幕上的方向」的垂直方向撑开半个线宽。这里的顶点着色器照那份逐行写。
//   原版写进去的法线是 (x2−x, 1, y2−y)，不是线的方向，所以每条线看上去的粗细随朝向变（法线投影和线垂直时细成一根丝）。照抄，不改成等宽。
//   法线在 1.20.1 里是先在 CPU 上转到镜头坐标系、各分量夹到 ±1、按 1/127 截断成字节再进着色器的（BufferVertexConsumer.normal），也照做。
// - 转动：渲 50～53，角度 = Blaze3D.getTime() × 50 度（真实秒，不是游戏刻），依次 mulPose 绕 X、Y、Z 转同一个角度（= three 的 Euler XYZ）。相位取决于游戏开了多久，这里 秒 = 0 是没转的样子。
// - 颜色 (0.5411765, 0, 0.105882354)，透明度 = RevelationCageEntity.alpha（30 刻淡入、停手后 30 刻淡出，见 炼狱结界透明度）。
// 没照的：原版的线段没有抗锯齿以外的处理，这里也没有；雾接的是 three 的场景雾，不是 MC 的雾参数。
// 坐标：组件放在场景坐标（Z 朝上）的 group 里，原点是结界中心（原版在施法者半身高处，RevelationSpell 第 62 行）；里面转回 MC 的轴再画。
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { 炼狱结界原版, 结界线段表 } from './炼狱结界线.ts';

const VERT = `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 lineNormal;
attribute float side;
uniform float lineWidth;
uniform vec2 screenSize;
const float VIEW_SHRINK = 1.0 - (1.0 / 256.0);
void main() {
  // 原版在 CPU 上做的：位置、法线转到镜头坐标系（法线只转不缩放），法线夹到 ±1、截成字节
  mat3 m = mat3(modelViewMatrix);
  mat3 rot = mat3(normalize(m[0]), normalize(m[1]), normalize(m[2]));
  vec3 n = trunc(clamp(rot * lineNormal, -1.0, 1.0) * 127.0) / 127.0;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // rendertype_lines.vsh
  vec4 linePosStart = projectionMatrix * vec4(mvPosition.xyz * VIEW_SHRINK, 1.0);
  vec4 linePosEnd = projectionMatrix * vec4((mvPosition.xyz + n) * VIEW_SHRINK, 1.0);
  vec3 ndc1 = linePosStart.xyz / linePosStart.w;
  vec3 ndc2 = linePosEnd.xyz / linePosEnd.w;
  vec2 lineScreenDirection = normalize((ndc2.xy - ndc1.xy) * screenSize);
  vec2 lineOffset = vec2(-lineScreenDirection.y, lineScreenDirection.x) * lineWidth / screenSize;
  if (lineOffset.x < 0.0) lineOffset *= -1.0;
  gl_Position = vec4((ndc1 + vec3(lineOffset, 0.0) * side) * linePosStart.w, linePosStart.w);
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;
const FRAG = `
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec4 lineColor;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = lineColor;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export type 炼狱结界属性 = {
  /** 时间（秒）：原版是 Blaze3D.getTime()，只管转动；0 = 没转 */
  秒: number;
  /** 整体倍数，默认原版结界的 5.8905764（顶点离中心约 9.70 格）；死亡演出是 11.781153 × 进度 */
  半径系数?: number;
  /** 0～1，默认 1；淡入淡出用 炼狱结界透明度 算了传进来 */
  透明度?: number;
  /** 每条边画到几成，默认 1（结界）；死亡演出传进度 */
  边比例?: number;
  /** 线宽（画布实际像素），不给照原版按画布实际宽度算 */
  线宽?: number;
  /** 颜色（sRGB 0～1），默认原版暗红 */
  颜色?: readonly [number, number, number];
};

export const 炼狱结界线框: React.FC<炼狱结界属性> = ({ 秒, 半径系数 = 炼狱结界原版.半径系数, 透明度 = 1, 边比例 = 1, 线宽, 颜色 = 炼狱结界原版.颜色 }) => {
  const gl = useThree((s) => s.gl);
  // 画布尺寸变了要重取实际像素
  useThree((s) => s.size);
  const mesh = useMemo(() => {
    const 段 = 结界线段表(边比例);
    const pos: number[] = [];
    const nor: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    段.forEach((s, i) => {
      // 原版 LINES 模式一段 4 个顶点：起点两个、终点两个，偶数号往 +、奇数号往 −，索引 0,1,2, 3,2,1
      for (const [p, sd] of [[s.起, 1], [s.起, -1], [s.止, 1], [s.止, -1]] as const) {
        pos.push(...p);
        nor.push(...s.法线);
        side.push(sd);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3, i * 4 + 2, i * 4 + 1);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('lineNormal', new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    geometry.setIndex(idx);
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { lineWidth: { value: 2.5 }, screenSize: { value: new THREE.Vector2(1, 1) }, lineColor: { value: new THREE.Vector4(1, 1, 1, 1) } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const m = new THREE.Mesh(geometry, material);
    m.frustumCulled = false;
    return m;
  }, [边比例]);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [mesh]);
  const u = (mesh.material as THREE.ShaderMaterial).uniforms;
  const 缓冲 = gl.getDrawingBufferSize(new THREE.Vector2());
  u.screenSize!.value.copy(缓冲);
  u.lineWidth!.value = 线宽 ?? Math.max(2.5, (缓冲.x / 1920) * 2.5);
  u.lineColor!.value.set(s2l(颜色[0]), s2l(颜色[1]), s2l(颜色[2]), Math.max(0, 透明度));
  if (透明度 <= 0 || 半径系数 <= 0) return null;
  const 角 = (秒 * 炼狱结界原版.每秒转度 * Math.PI) / 180;
  return (
    // 外层把场景坐标（Z 朝上）转回 MC 的轴（Y 朝上）
    <group rotation={[Math.PI / 2, 0, 0]}>
      <group rotation={[角, 角, 角]} scale={半径系数}>
        <primitive object={mesh} />
      </group>
    </group>
  );
};
