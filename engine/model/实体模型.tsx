// 实体模型：渲染 工具/游戏取材/导出实体模型.py 从模组 jar 里算出来的 Java 版实体模型（生物）。
// 导出的是模型空间的原始数值（像素、y 朝下、正面朝 -z、旋转 ZYX），这里照游戏的规则拼出来：
// - 方盒的六个面和贴图坐标照 1.20.1 的 ModelPart.Cube / Polygon 逐个顶点搬过来（含 mirror 和 CubeDeformation 的膨胀）；
// - 部件的变换照 ModelPart.translateAndRotate：先平移 offset，再按 Z·Y·X 的顺序转；
// - 整个模型照 LivingEntityRenderer：模型原点在脚底上方 1.501 格，y 朝下翻成朝上。
// 输出坐标和 贴图方盒.tsx 的约定一致：原点在脚底中心，Z 朝上，正面朝 -Y，实体的右手边是 -X，单位格。
// 用法：<EntityModel model={数据.models.巫妖} tex={png(贴图)} pose={{ right_arm: { rot: [-1.57, 0, 0] } }} attach={{ right_arm: <手里的东西/> }} />
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { entityTexture } from './贴图方盒.tsx';
import type { Png } from './贴图.ts';

export type EntityCube = { uv: number[]; from: number[]; size: number[]; grow: number[]; mirror: boolean };
export type EntityPart = { name: string; pose: { offset: number[]; rot: number[] }; cubes: EntityCube[]; children: EntityPart[] };
export type EntityModelData = { texSize: number[]; root: EntityPart };
// 部件姿态（和游戏里 setupAnim 改 ModelPart 字段一样是绝对值）：rot 弧度，offset 像素；hide 不画（连子部件）；
// scale：ModelPart.xScale/yScale/zScale（关键帧动画的 SCALE 通道），照 translateAndRotate 在旋转之后缩放，不给 = 不缩放
export type PartPose = { rot?: number[]; offset?: number[]; hide?: boolean; scale?: number[] };
// 叠加的发光层（原版 WardenEmissiveLayer 那种）：同一套模型和姿态再画一遍、换一张贴图，只画 parts 里这些部件**自己的**方盒（子部件不在列表里就不画）。
// 材质照 RenderType.entityTranslucentEmissive：全亮、不受场景光和亮度图影响，只乘原版实体的方向明暗（`minecraft_mix_light`），
// 半透明、不写深度、两面都画；贴图 alpha < 0.1 丢掉，再乘层的 alpha，alpha ≤ 0 时不画
export type EntityLayer = { tex: Png; alpha: number; parts: string[] };

// 一个方盒的面：照 ModelPart.Cube 的构造函数（1.20.1）
const cubeFaces = (cube: EntityCube, texW: number, texH: number) => {
  let [x, y, z] = cube.from;
  const [width, height, depth] = cube.size;
  const [gx, gy, gz] = cube.grow;
  let xMax = x + width;
  let f1 = y + height;
  let f2 = z + depth;
  x -= gx; y -= gy; z -= gz;
  xMax += gx; f1 += gy; f2 += gz;
  if (cube.mirror) [x, xMax] = [xMax, x];
  const v0 = [x, y, z], v1 = [xMax, y, z], v2 = [xMax, f1, z], v3 = [x, f1, z];
  const v4 = [x, y, f2], v5 = [xMax, y, f2], v6 = [xMax, f1, f2], v7 = [x, f1, f2];
  const [texU, texV] = cube.uv;
  const f4 = texU, f5 = texU + depth, f6 = texU + depth + width, f7 = texU + depth + width + width, f8 = texU + depth + width + depth, f9 = texU + depth + width + depth + width;
  const f10 = texV, f11 = texV + depth, f12 = texV + depth + height;
  // [四个顶点, u1, v1, u2, v2, 法线（Direction.step）]
  const polys: [number[][], number, number, number, number, number[]][] = [
    [[v5, v4, v0, v1], f5, f10, f6, f11, [0, -1, 0]], // DOWN（模型空间 y 朝下，这是视觉上的顶面）
    [[v2, v3, v7, v6], f6, f11, f7, f10, [0, 1, 0]], // UP
    [[v0, v4, v7, v3], f4, f11, f5, f12, [-1, 0, 0]], // WEST
    [[v1, v0, v3, v2], f5, f11, f6, f12, [0, 0, -1]], // NORTH（正面）
    [[v5, v1, v2, v6], f6, f11, f8, f12, [1, 0, 0]], // EAST
    [[v4, v5, v6, v7], f8, f11, f9, f12, [0, 0, 1]], // SOUTH
  ];
  return polys.map(([vs, u1, va, u2, vb, normal]) => {
    // Polygon：0 → (u2, v1)，1 → (u1, v1)，2 → (u1, v2)，3 → (u2, v2)；mirror 时顶点倒序、法线 x 取反
    let verts = [
      { p: vs[0], uv: [u2 / texW, va / texH] },
      { p: vs[1], uv: [u1 / texW, va / texH] },
      { p: vs[2], uv: [u1 / texW, vb / texH] },
      { p: vs[3], uv: [u2 / texW, vb / texH] },
    ];
    const nn = [...normal];
    if (cube.mirror) {
      verts = verts.reverse();
      nn[0] *= -1;
    }
    return { verts, n: nn };
  });
};

const partGeometry = (cubes: EntityCube[], texW: number, texH: number) => {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const corner = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  for (const cube of cubes) {
    for (const face of cubeFaces(cube, texW, texH)) {
      const base = pos.length / 3;
      face.verts.forEach((vert) => {
        pos.push(...vert.p);
        nor.push(...face.n);
        uv.push(...vert.uv);
      });
      // 朝外的那一面按逆时针绕，背面剔除才正确：用几何法线和面的法线比一下
      corner.fromArray(face.verts[0].p);
      edgeA.fromArray(face.verts[1].p).sub(corner);
      edgeB.fromArray(face.verts[2].p).sub(corner);
      const geomNormal = edgeA.cross(edgeB);
      if (geomNormal.dot(new THREE.Vector3(...face.n)) >= 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  return geom;
};

const geoCache = new WeakMap<EntityPart, THREE.BufferGeometry>();
const geoOf = (part: EntityPart, texW: number, texH: number) => {
  let geom = geoCache.get(part);
  if (!geom) {
    geom = partGeometry(part.cubes, texW, texH);
    geoCache.set(part, geom);
  }
  return geom;
};
// 一个部件自己的方盒几何（模型空间、像素单位，不含子部件），给要自己配材质的模型用（铁魔法护盾的叠加发光、苦力怕头）
export const ownPartGeometry = (p: EntityPart, texSize: number[]) => geoOf(p, texSize[0], texSize[1]);

// 受伤变红（原版 OverlayTexture：红 (255,0,0)、alpha 0xB2，往纯红拉约 30%，再受光照）。原版只有满和无两档，这里 0～1 按比例给
const HURT_MIX = 1 - 0xb2 / 255;
type MatOpts = { emissive: number; opacity: number; alphaTest: number; color?: string; hurt?: number };
const matCache = new Map<string, THREE.Material>();
const material = (tex: Png, opts: MatOpts) => {
  const map = entityTexture(tex);
  const hurt = Math.round((opts.hurt ?? 0) * 10) / 10;
  const key = `${map.uuid}|${opts.emissive}|${opts.opacity}|${opts.alphaTest}|${opts.color ?? ''}|${hurt}`;
  let mat = matCache.get(key);
  if (!mat) {
    const mm = new THREE.MeshStandardMaterial({
      map,
      roughness: 0.9,
      alphaTest: opts.alphaTest,
      side: THREE.DoubleSide,
      transparent: opts.opacity < 1,
      opacity: opts.opacity,
      depthWrite: opts.opacity >= 1,
      color: opts.color ? new THREE.Color(opts.color) : undefined,
    });
    if (opts.emissive > 0) {
      mm.emissive = new THREE.Color('#ffffff');
      mm.emissiveMap = map;
      mm.emissiveIntensity = opts.emissive;
    }
    if (hurt > 0) {
      const k = (HURT_MIX * hurt).toFixed(4);
      mm.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.0, 0.0), ${k});`);
      };
      mm.customProgramCacheKey = () => `hurt${k}`;
    }
    mat = mm;
    matCache.set(key, mat);
  }
  return mat;
};

// 原版实体光照的材质：MeshBasicMaterial（不受场景光）+ 着色器里照原版算法上色：
// 贴图颜色（sRGB 数值）× 方向明暗 `minecraft_mix_light` × 亮度（亮度图），直接在 sRGB 数值上乘（线性空间里乘的话深色贴图偏暗，监守者这种近黑贴图差得明显）。
// 两种用法：
// - 发光层（见 `EntityLayer`）：照 entity_translucent_emissive，亮度恒 1，半透明、不写深度；alphaTest 0.1 对的是贴图 alpha，层的 alpha 在其后再乘（和 .fsh 一样）。
//   polygonOffset：和本体是同一份几何、本体可能是另一套着色器，深度差最后一位会闪，往镜头拉一点。
// - 本体（`EntityModel` 的 `mcLight`）：照 entity_cutout_no_cull，亮度 = mcLight（1 = 夜视 / 满亮度），alpha < 0.1 镂空。
const MC_LIGHT0 = new THREE.Vector3(0.2, 1, -0.7).normalize();
const MC_LIGHT1 = new THREE.Vector3(-0.2, 1, 0.7).normalize();
const mcMatCache = new Map<string, THREE.Material>();
const mcMaterial = (tex: Png, opts: { layer: boolean; alpha: number; bright: number; hurt?: number }) => {
  const map = entityTexture(tex);
  const alpha = Math.round(opts.alpha * 1000) / 1000;
  const bright = Math.round(opts.bright * 1000) / 1000;
  const hurtMix = Math.round((opts.hurt ?? 0) * HURT_MIX * 1000) / 1000;
  const key = `${map.uuid}|${opts.layer}|${alpha}|${bright}|${hurtMix}`;
  let mat = mcMatCache.get(key);
  if (!mat) {
    const see = opts.layer || alpha < 1;
    const mm = new THREE.MeshBasicMaterial({
      map,
      alphaTest: 0.1,
      transparent: see,
      depthWrite: !see,
      side: THREE.DoubleSide,
      ...(opts.layer ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}),
    });
    mm.onBeforeCompile = (shader) => {
      shader.uniforms.mcLight0 = { value: MC_LIGHT0 };
      shader.uniforms.mcLight1 = { value: MC_LIGHT1 };
      shader.uniforms.mcAlpha = { value: alpha };
      shader.uniforms.mcBright = { value: bright };
      shader.uniforms.mcHurt = { value: hurtMix };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMcNormal;')
        .replace('#include <begin_vertex>', 'vMcNormal = normalize( mat3( modelMatrix ) * normal );\n#include <begin_vertex>');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMcNormal;\nuniform vec3 mcLight0;\nuniform vec3 mcLight1;\nuniform float mcAlpha;\nuniform float mcBright;\nuniform float mcHurt;')
        .replace(
          '#include <opaque_fragment>',
          [
            'vec3 mcN = normalize( vMcNormal );',
            'float mcShade = min( 1.0, ( max( 0.0, dot( mcLight0, mcN ) ) + max( 0.0, dot( mcLight1, mcN ) ) ) * 0.6 + 0.4 ) * mcBright;',
            // 受伤变红：和原版一样在 sRGB 数值上先往纯红拉（mix(overlay, color, overlay.a)），再乘光照
            'outgoingLight = sRGBTransferEOTF( vec4( mix( sRGBTransferOETF( vec4( outgoingLight, 1.0 ) ).rgb, vec3( 1.0, 0.0, 0.0 ), mcHurt ) * mcShade, 1.0 ) ).rgb;',
            'diffuseColor.a *= mcAlpha;',
            '#include <opaque_fragment>',
          ].join('\n'),
        );
    };
    // 着色器代码都一样，只是 uniform 不同：材质按 alpha、亮度分开，程序共用
    mm.customProgramCacheKey = () => 'mc-entity-light';
    mat = mm;
    mcMatCache.set(key, mat);
  }
  return mat;
};

// 附魔光泽（用户 10-12 要边城卫兵穿附魔钻石甲），照 1.20.1 客户端 jar 反汇编和着色器原文：
// - RenderType.armorEntityGlint：贴图 misc/enchanted_glint_entity.png（128×128），线性过滤、重复平铺；深度 EQUAL、不写深度，只叠在盔甲本身画出来的像素上。
// - 滚动（RenderStateShard.setupGlintTexturing，scale = 0.16）：i = 毫秒 × glintSpeed（默认 0.5）× 8；f = (i mod 110000) / 110000，f1 = (i mod 30000) / 30000；
//   TextureMat = translation(−f, f1, 0) · rotateZ(10°) · scale(0.16)，uv' = TextureMat · (u, v)，即横向 27.5 秒、纵向 7.5 秒滚一圈。
// - 颜色（rendertype_armor_entity_glint.fsh）：c = 贴图 × glintStrength（默认 0.75），alpha < 0.1 丢掉；混合 blendFuncSeparate(SRC_COLOR, ONE, ZERO, ONE)：画面 = 底色 + c × c（sRGB 数值上加，不受光照）。
// 这里不另画一遍：在盔甲本体材质里受光后转 sRGB 加 c² 再转回线性（等价于深度 EQUAL，免半透明排序）。只在场景光材质（MeshStandardMaterial）上做。
const GLINT = { speed: 0.5, strength: 0.75, scale: 0.16, rotZ: 0.17453292 };
const glintTexCache = new WeakMap<Png, THREE.DataTexture>();
const glintTexture = (t: Png) => {
  let tex = glintTexCache.get(t);
  if (!tex) {
    // 原样的 sRGB 数值（不转线性），着色器里直接当 sRGB 数值用
    tex = new THREE.DataTexture(t.px, t.w, t.h, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    glintTexCache.set(t, tex);
  }
  return tex;
};
// 秒 → TextureMat（只取 uv 用到的 2D 部分，Matrix3）
const glintMatrix = (sec: number, out: THREE.Matrix3) => {
  const i = Math.floor(sec * 1000 * GLINT.speed * 8);
  const scrollU = (i % 110000) / 110000;
  const f1 = (i % 30000) / 30000;
  const cosScaled = Math.cos(GLINT.rotZ) * GLINT.scale;
  const sinScaled = Math.sin(GLINT.rotZ) * GLINT.scale;
  // translation(−f, f1) · rotZ · scale
  return out.set(cosScaled, -sinScaled, -scrollU, sinScaled, cosScaled, f1, 0, 0, 1);
};
export type EntityGlint = { tex: Png; 秒: number };
// 每个 EntityModel 自己一份材质（uniform 里的滚动矩阵各管各的），着色器程序共用
const glintMaterial = (tex: Png, glint: Png, opts: MatOpts) => {
  const base = material(tex, opts) as THREE.MeshStandardMaterial;
  const mat = base.clone();
  const uMat = { value: new THREE.Matrix3() };
  const uTex = { value: glintTexture(glint) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.glintMat = uMat;
    shader.uniforms.glintMap = uTex;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat3 glintMat;\nvarying vec2 vGlintUv;')
      .replace('#include <begin_vertex>', 'vGlintUv = ( glintMat * vec3( uv, 1.0 ) ).xy;\n#include <begin_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D glintMap;\nvarying vec2 vGlintUv;')
      .replace(
        '#include <opaque_fragment>',
        [
          'vec4 glintC = texture2D( glintMap, vGlintUv );',
          `if ( glintC.a >= 0.1 ) { vec3 gc = glintC.rgb * ${GLINT.strength.toFixed(2)}; outgoingLight = sRGBTransferEOTF( vec4( sRGBTransferOETF( vec4( outgoingLight, 1.0 ) ).rgb + gc * gc, 1.0 ) ).rgb; }`,
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  };
  mat.customProgramCacheKey = () => 'entity-glint';
  return { m: mat, uMat };
};

const Part: React.FC<{
  part: EntityPart;
  tex: Png;
  texSize: number[];
  pose?: Record<string, PartPose>;
  attach?: Record<string, React.ReactNode>;
  mat: THREE.Material;
  layers?: EntityLayer[];
}> = ({ part, tex, texSize, pose, attach, mat, layers }) => {
  const partPose = pose?.[part.name];
  if (partPose?.hide) return null;
  const off = partPose?.offset ?? part.pose.offset;
  const rot = partPose?.rot ?? part.pose.rot;
  const geo = geoOf(part, texSize[0], texSize[1]);
  return (
    <group position={off as [number, number, number]} rotation={[rot[0], rot[1], rot[2], 'ZYX']} {...(partPose?.scale ? { scale: partPose.scale as [number, number, number] } : {})}>
      {part.cubes.length > 0 && <mesh geometry={geo} material={mat} castShadow receiveShadow />}
      {layers &&
        part.cubes.length > 0 &&
        layers.map((l, i) => (l.alpha > 0 && l.parts.includes(part.name) ? <mesh key={`layer${i}`} geometry={geo} material={mcMaterial(l.tex, { layer: true, alpha: l.alpha, bright: 1 })} /> : null))}
      {part.children.map((c, i) => (
        <Part key={i} part={c} tex={tex} texSize={texSize} pose={pose} attach={attach} mat={mat} layers={layers} />
      ))}
      {attach?.[part.name]}
    </group>
  );
};

// 模型空间（像素，y 朝下，正面 -z）→ 实体坐标（格，Z 朝上，正面 -Y）：x → X，z → Y，y → -Z
export const MODEL_TO_ENTITY = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);

// scale：渲染器里额外的缩放（冰雪女王 1.2 这种），绕脚底缩放，和游戏一致
// layers：叠加的发光层（见 EntityLayer），按数组顺序画（和游戏里加层的顺序一致）；不给 = 不画
// mcLight：给了就照原版实体的光照画本体、不受场景光影响（见 `mcMaterial`）：值是亮度图亮度 0～1，1 = 夜视 / 满亮度；这时 emissive、color 不起作用（alphaTest 固定 0.1），受伤 照样起作用。不给 = 用场景光（MeshStandardMaterial）
// 受伤：原版受伤 / 死亡时的变红，0～1（见 HURT_MIX）
// 附魔：给了就在本体上叠附魔光泽（见 GLINT）：tex 是 enchanted_glint_entity 贴图，秒 是滚动用的时钟；只在不给 mcLight 时起作用
export const EntityModel: React.FC<{
  model: EntityModelData;
  tex: Png;
  pose?: Record<string, PartPose>;
  attach?: Record<string, React.ReactNode>;
  scale?: number;
  emissive?: number;
  opacity?: number;
  alphaTest?: number;
  color?: string;
  layers?: EntityLayer[];
  mcLight?: number;
  hurt?: number;
  glint?: EntityGlint;
}> = ({ model, tex, pose, attach, scale = 1, emissive = 0, opacity = 1, alphaTest = 0.1, color, layers, mcLight, hurt: hurt = 0, glint: glintSpec }) => {
  const modelMatrix = useMemo(() => new THREE.Matrix4().copy(MODEL_TO_ENTITY).multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16)), []);
  const glintTex = mcLight === undefined ? glintSpec?.tex : undefined;
  const glint = useMemo(
    () => (glintTex ? glintMaterial(tex, glintTex, { emissive, opacity, alphaTest, color, hurt }) : null),
    [tex, glintTex, emissive, opacity, alphaTest, color, hurt],
  );
  if (glint && glintSpec) glintMatrix(glintSpec.秒, glint.uMat.value);
  const mat = glint
    ? glint.m
    : mcLight === undefined
      ? material(tex, { emissive, opacity, alphaTest, color, hurt })
      : mcMaterial(tex, { layer: false, alpha: opacity, bright: mcLight, hurt });
  return (
    <group scale={scale}>
      <group position={[0, 0, 1.501]}>
        <group matrix={modelMatrix} matrixAutoUpdate={false}>
          <Part part={model.root} tex={tex} texSize={model.texSize} pose={pose} attach={attach} mat={mat} layers={layers} />
        </group>
      </group>
    </group>
  );
};

// 在模型树里找一个部件（按名字，深度优先）
export const findPart = (root: EntityPart, name: string): EntityPart | null => {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findPart(child, name);
    if (found) return found;
  }
  return null;
};
