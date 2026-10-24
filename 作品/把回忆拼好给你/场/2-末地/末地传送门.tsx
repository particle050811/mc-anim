// 出口传送门的星空面：照 1.20.1 TheEndPortalRenderer（只画顶面，高 0.75 格）+ rendertype_end_portal 着色器（client jar 里的 .vsh/.fsh 原样搬来，GLSL 3）。
// 星空是屏幕空间的：贴图坐标取片元在画面上的位置（projection_from_position），所以镜头推、她飞过去，星空不跟着透视走，这是原版的样子。
// Sampler0 = end_sky.png、Sampler1 = end_portal.png，最近邻、平铺；EndPortalLayers = 15（末地折跃门是 16）；GameTime = (游戏刻 % 24000 + 刻内) / 24000。
// 颜色在 sRGB 数值上算、原样写出（同 末地天空.tsx），平涂、描边都不碰它。
// 坑：three 对 glslVersion = GLSL3 的 ShaderMaterial 不 #define gl_FragColor，输出要自己声明（原版也是 out vec4 fragColor）。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import 星图 from 'asset:贴图/特效/末地传送门';
import { 门格们 } from './编排.ts';
import { 原样贴图, 末地天空贴图 } from './末地天空.tsx';

/** 传送门方块顶面离方块底多高（TheEndPortalRenderer.getOffsetUp） */
const 顶面 = 0.75;

const 顶点 = /* glsl */ `
out vec4 texProj0;
vec4 projection_from_position(vec4 position) {
  vec4 projection = position * 0.5;
  projection.xy = vec2(projection.x + projection.w, projection.y + projection.w);
  projection.zw = position.zw;
  return projection;
}
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  texProj0 = projection_from_position(gl_Position);
}`;

const 片元 = /* glsl */ `
uniform sampler2D Sampler0;
uniform sampler2D Sampler1;
uniform float GameTime;
uniform int EndPortalLayers;
in vec4 texProj0;
out vec4 fragColor;

mat2 mat2_rotate_z(float radians) {
  return mat2(
    cos(radians), -sin(radians),
    sin(radians), cos(radians)
  );
}

const vec3[] COLORS = vec3[](
  vec3(0.022087, 0.098399, 0.110818),
  vec3(0.011892, 0.095924, 0.089485),
  vec3(0.027636, 0.101689, 0.100326),
  vec3(0.046564, 0.109883, 0.114838),
  vec3(0.064901, 0.117696, 0.097189),
  vec3(0.063761, 0.086895, 0.123646),
  vec3(0.084817, 0.111994, 0.166380),
  vec3(0.097489, 0.154120, 0.091064),
  vec3(0.106152, 0.131144, 0.195191),
  vec3(0.097721, 0.110188, 0.187229),
  vec3(0.133516, 0.138278, 0.148582),
  vec3(0.070006, 0.243332, 0.235792),
  vec3(0.196766, 0.142899, 0.214696),
  vec3(0.047281, 0.315338, 0.321970),
  vec3(0.204675, 0.390010, 0.302066),
  vec3(0.080955, 0.314821, 0.661491)
);

const mat4 SCALE_TRANSLATE = mat4(
  0.5, 0.0, 0.0, 0.25,
  0.0, 0.5, 0.0, 0.25,
  0.0, 0.0, 1.0, 0.0,
  0.0, 0.0, 0.0, 1.0
);

mat4 end_portal_layer(float layer) {
  mat4 translate = mat4(
    1.0, 0.0, 0.0, 17.0 / layer,
    0.0, 1.0, 0.0, (2.0 + layer / 1.5) * (GameTime * 1.5),
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0
  );
  mat2 rotate = mat2_rotate_z(radians((layer * layer * 4321.0 + layer * 9.0) * 2.0));
  mat2 scale = mat2((4.5 - layer / 4.0) * 2.0);
  return mat4(scale * rotate) * translate * SCALE_TRANSLATE;
}

void main() {
  vec3 color = textureProj(Sampler0, texProj0).rgb * COLORS[0];
  for (int i = 0; i < EndPortalLayers; i++) {
    color += textureProj(Sampler1, texProj0 * end_portal_layer(float(i + 1))).rgb * COLORS[i];
  }
  fragColor = vec4(color, 1.0);
}`;

const 门几何 = (() => {
  const pos: number[] = [], idx: number[] = [];
  const z = -1 + 顶面;
  门格们.forEach(([i, j], n) => {
    pos.push(i, j, z, i + 1, j, z, i + 1, j + 1, z, i, j + 1, z);
    const b = n * 4;
    idx.push(b, b + 1, b + 2, b + 2, b + 3, b);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
})();

/** 传送门星空。刻：游戏刻（连续，带刻内小数） */
export const 末地传送门: React.FC<{ 刻: number }> = ({ 刻 }) => {
  const 材质 = useMemo(
    () =>
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          Sampler0: { value: 末地天空贴图() },
          Sampler1: { value: 原样贴图(星图) },
          GameTime: { value: 0 },
          EndPortalLayers: { value: 15 },
        },
        vertexShader: 顶点,
        fragmentShader: 片元,
        toneMapped: false,
      }),
    [],
  );
  材质.uniforms.GameTime!.value = (((刻 % 24000) + 24000) % 24000) / 24000;
  return <mesh geometry={门几何} material={材质} />;
};
