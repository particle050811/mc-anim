// 天空与日光：天空穹顶、太阳、星星、云、直射光与天光。放在 Z 朝上的场景坐标系里使用；sun 为指向太阳的方向。两套：
// - 主世界（默认）：渐变天空（地平线偏暖、太阳方向有光晕），太阳是原版的方形太阳（environment/sun.png，加色混合）。
// - 暮色森林（twilight）：照游戏实拍（10-01 在片场存档截图取色）。维度把时间固定在 13000（刚日落），模组的天空渲染器（`TFSkyRenderer`）只画天色和星星、不画太阳月亮晚霞，
//   所以头顶深蓝、往下渐亮，地平线一圈很亮的薄荷绿（就是雾色），满天星星，云是灰青色。
// 云照原版：environment/clouds.png 每个不透明像素是一块 12×12 格、4 格厚的云，四面按原版明暗（顶 1.0、东西 0.9、南北 0.8、底 0.7）。贴图用 npm run 取材 -- 天空 从 client jar 导出到 天空.贴图/。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useState } from 'react';
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import { skyBandCount, waterSky, skyReflMax } from '../voxel/水面.ts';
import * as THREE from 'three';
import { rng } from '../model/parts.tsx';
import { overworldMix, brighten, twilightSunDir, twilightDusk } from './光照配比.ts';
import { ATMO_FN_GLSL, ATMO_PARS_GLSL, atmoOn, atmoUniforms, atmosphere } from './大气.ts';
import cloudsPng from 'asset:贴图/场景/天空/clouds';
import sunPng from 'asset:贴图/场景/天空/sun';

export const SKY = {
  top: '#7ea2cc',
  horizon: '#e9dcc4',
  sunGlow: '#fff1d0',
  cloud: '#f4efe6',
  sunLight: '#fff0d8',
  skyLight: '#cfe0f5',
  groundLight: '#6a6a3a',
  fog: '#d4d4c4',
};

// 暮色森林：截图里按仰角取的天色（仰角正弦 → 颜色），地平线以下都是雾色
export const TWILIGHT = {
  sky: [
    [0.0, '#c1ffe8'],
    [0.12, '#c1ffe8'],
    [0.18, '#9dcfc0'],
    [0.23, '#71948e'],
    [0.28, '#5a7576'],
    [0.36, '#3c4d55'],
    [0.5, '#2a3440'],
    [1.0, '#1b212d'],
  ] as [number, string][],
  fog: '#c1ffe8',
  cloud: '#8ba3a3', // 云顶的颜色；底面 ×0.7 = 截图里从下往上看到的 #617272
  // 灯的颜色（强度在 lib/光照配比.ts 的 暮色配比）。游戏里没有太阳直射，主光是艺术选择（见 光照配比.ts）。
  // 光是偏蓝的灰：原版光照贴图在天变暗时把天光往蓝里偏（天光颜色 ≈ (f, f, 1) 和白色按 0.35 混合），截图里石墙是 (51,51,66)、草地是 (56,86,57)
  light: '#9aa6e6',
  skyLight: '#7c8ad6',
  groundLight: '#30364a',
};

// 暮色的雾色（背景、线性雾）和原版方块云的颜色：黄昏档（lib/光照配比.ts 的 暮色黄昏）换成落日后的颜色，否则是游戏里的薄荷绿、灰青。云色取黄昏积云向光面、背光面之间（桃橙偏灰），6-1-1～6-1-3 头上那层原版云用
export const twilightFogColor = twilightDusk?.fogColor ?? TWILIGHT.fog;
export const twilightCloudColor = twilightDusk ? brighten('#c9998a') : TWILIGHT.cloud;

const skyShader = (twilight: boolean) => `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; uniform float glowK; varying vec3 vDir;
  ${twilight ? `uniform vec3 band[${TWILIGHT.sky.length}]; uniform float at[${TWILIGHT.sky.length}];` : ''}
  void main(){
    vec3 d = normalize(vDir);
    float h = d.z;
    ${
      twilight
        ? `vec3 col = band[0];
           for (int i = 1; i < ${TWILIGHT.sky.length}; i++) {
             col = mix(col, band[i], smoothstep(at[i - 1], at[i], h));
           }
           // 黄昏余晖（glowK > 0 才有）：太阳那一侧贴着地平线一圈暖色，越近太阳的方位越浓，再加一团太阳附近的光晕
           if (glowK > 0.0) {
             float az = max(dot(normalize(d.xy + 1e-5), normalize(sunDir.xy + 1e-5)), 0.0);
             col = mix(col, glow, glowK * pow(az, 3.0) * (1.0 - smoothstep(-0.05, 0.4, h)));
             col += glow * glowK * 0.6 * pow(max(dot(d, sunDir), 0.0), 40.0);
           }`
        : `vec3 col = mix(horizon, top, smoothstep(-0.02, 0.45, h));
           float s = max(dot(d, sunDir), 0.0);
           col += glow * pow(s, 6.0) * 0.35;`
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const R_SKY = 480;

// 大气打开时（lib/大气.ts）主世界穹顶换成物理天色：天色图 × 空气雾到地形远端的透过率 + 内散射，自己出色（线性 → 画面值）
const atmoSkyMaterial = () =>
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: { ...atmoUniforms, atmoSky: { value: null } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D atmoSky;
    ${ATMO_PARS_GLSL}
    ${ATMO_FN_GLSL}
    varying vec3 vDir;
    void main(){
      vec3 d = normalize(vDir);
      vec3 T;
      vec3 S = atmoAir(cameraPosition, cameraPosition + vec3(d.x, d.z, -d.y) * atmoP.y, T);
      gl_FragColor = vec4(atmoDisp(atmoSkyAt(atmoSky, d) * T + S), 1.0);
    }`,
  });

// 原版的星星：1500 颗，方向均匀分布，每颗是边长 0.3～0.5 格、放在 100 格外的小方块（这里换成同样角大小的方点）
const Stars: React.FC = () => {
  const points = useMemo(() => {
    const rand = rng(10842);
    const pos: number[] = [];
    while (pos.length < 1500 * 3) {
      const dir = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
      const len = Math.hypot(dir[0], dir[1], dir[2]);
      if (len < 0.1 || len > 1) continue;
      pos.push(...dir.map((c) => (c / len) * (R_SKY - 10)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
    return new THREE.Points(geo, mat);
  }, []);
  return <primitive object={points} renderOrder={-1} />;
};

// 原版的方形太阳：一张 32×32 的贴图（中间一块亮方块，四周一圈光晕，其余是黑的），加色混合叠在天上。
// 原版在 100 格外画边长 60 格的方片，这里按同样的角大小放在穹顶里
const Sun: React.FC<{ sun: [number, number, number] }> = ({ sun }) => {
  const mesh = useMemo(() => {
    const tex = new THREE.TextureLoader().load(sunPng);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const dist = R_SKY - 20;
    const mat = new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    // 太阳在无穷远：方片只放在 460 米外，按方片的深度做深度测试的话，云（lib/大气/云.ts）写回的深度（一公里以外）挡不住它。对数深度下把它的深度定在最远处（天空是 1.0），任何写了深度的东西都挡住它
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <logdepthbuf_fragment>',
        '#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n\tgl_FragDepth = 0.99999;\n#endif',
      );
    };
    const sunQuad = new THREE.Mesh(new THREE.PlaneGeometry(0.6 * dist, 0.6 * dist), mat);
    const dir = new THREE.Vector3(...sun).normalize();
    sunQuad.position.copy(dir.clone().multiplyScalar(dist));
    // 方片正对穹顶中心，边和地平线平行（原版太阳绕东西轴转，方片的一条边始终朝南北）
    sunQuad.up.set(0, 0, 1);
    sunQuad.lookAt(0, 0, 0);
    return sunQuad;
  }, [sun[0], sun[1], sun[2]]);
  return <primitive object={mesh} renderOrder={-1} />;
};

// 水面反射的天色和波纹时间（lib/水面.ts）：天色取穹顶按仰角的渐变，时间按帧号（Remotion 逐帧独立）。条：暮色天的色条；null = 主世界穹顶
const useWaterSky = (bands: [number, string][] | null) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  waterSky.time.value = frame / fps;
  waterSky.reflectionMax.value = skyReflMax(bands !== null);
  {
    const domeColors = [new THREE.Color(SKY.horizon), new THREE.Color(SKY.top)];
    for (let i = 0; i < skyBandCount; i++) {
      if (bands) {
        waterSky.skyColors.value[i].set(bands[Math.min(i, bands.length - 1)][1]);
        waterSky.elevation.value[i] = bands[Math.min(i, bands.length - 1)][0];
      } else if (atmoOn() && atmosphere.waterBands.length) {
        waterSky.skyColors.value[i].copy(atmosphere.waterBands[i]);
        waterSky.elevation.value[i] = [0, 0.05, 0.1, 0.15, 0.2, 0.28, 0.4, 1][i];
      } else {
        // 主世界穹顶：mix(地平, 天顶, smoothstep(-0.02, 0.45, h))，在 8 个仰角上取样
        const elev = [0, 0.05, 0.1, 0.15, 0.2, 0.28, 0.4, 1][i];
        const t = Math.min(1, Math.max(0, (elev + 0.02) / 0.47));
        waterSky.skyColors.value[i].copy(domeColors[0]).lerp(domeColors[1], t * t * (3 - 2 * t));
        waterSky.elevation.value[i] = elev;
      }
    }
  }
};
// 没挂 `SkyDome` 的画布（6-1-1 海岛：天是背景色）也要给水面写天色和时间，不然水反射的是 `waterSky` 的默认灰蓝、波纹不动
export const OverworldWaterSky: React.FC = () => {
  useWaterSky(null);
  return null;
};

// 余晖：暮色天空在太阳（sun）那一侧加的黄昏余晖（色、强 0～1），给 null 就没有；天色：换掉 `TWILIGHT.sky`（条数一样）。
// twilight 时不给 余晖、sun 就按 lib/光照配比.ts 的 `twilightDusk`、`twilightSunDir`
const duskAfterglow = twilightDusk && { 色: twilightDusk.afterglow, 强: twilightDusk.afterglowStrength, skyColors: twilightDusk.skyColors };
export const SkyDome: React.FC<{ sun?: [number, number, number]; twilight?: boolean; afterglow?: { 色: string; 强: number; skyColors?: [number, string][] } | null }> = ({
  sun: sunProp,
  twilight = false,
  afterglow: afterglowProp,
}) => {
  const sun = sunProp ?? (twilight ? twilightSunDir : [0, 0, 1]);
  const afterglow = afterglowProp === undefined && twilight ? duskAfterglow : afterglowProp;
  useWaterSky(twilight ? (afterglow?.skyColors ?? TWILIGHT.sky) : null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(SKY.top) },
          horizon: { value: new THREE.Color(SKY.horizon) },
          glow: { value: new THREE.Color(twilight && afterglow ? afterglow.色 : SKY.sunGlow) },
          glowK: { value: twilight && afterglow ? afterglow.强 : 0 },
          sunDir: { value: new THREE.Vector3(...sun).normalize() },
          band: { value: (afterglow?.skyColors ?? TWILIGHT.sky).map(([, color]) => new THREE.Color(color)) },
          at: { value: (afterglow?.skyColors ?? TWILIGHT.sky).map(([elev]) => elev) },
        },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: skyShader(twilight),
      }),
    [sun[0], sun[1], sun[2], twilight, afterglow?.色, afterglow?.强],
  );
  const atmoMat = useMemo(() => (twilight ? null : atmoSkyMaterial()), [twilight]);
  useEffect(() => () => atmoMat?.dispose(), [atmoMat]);
  const dome = React.useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!dome.current) return;
    const on = atmoMat !== null && atmoOn() && atmosphere.sky !== null;
    if (on) atmoMat.uniforms.atmoSky.value = atmosphere.sky;
    dome.current.material = on ? atmoMat : mat;
  });
  return (
    <group>
      <mesh ref={dome} material={mat} renderOrder={-2}>
        <sphereGeometry args={[R_SKY, 48, 24]} />
      </mesh>
      {twilight ? <Stars /> : <Sun sun={sun} />}
    </group>
  );
};

// ---------- 云 ----------
const CLOUD_CELL = 12;
const CLOUD_THICK = 4;
let cloudBits: Uint8Array | null = null;
const loadCloudBits = () =>
  new Promise<Uint8Array>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      const bits = new Uint8Array(img.width * img.height);
      for (let i = 0; i < bits.length; i++) bits[i] = pixels[i * 4 + 3] > 0 ? 1 : 0;
      resolve(bits);
    };
    img.onerror = reject;
    img.src = cloudsPng;
  });

// height：云底离场景原点的高度（场景 z）；radius：只铺到离原点多远；color：云顶的颜色；offset：贴图在世界里的平移（格）
export const Clouds: React.FC<{ height?: number; radius?: number; color?: string; offset?: [number, number] }> = ({
  height = 129,
  radius = 460,
  color = '#ffffff',
  offset = [0, 0],
}) => {
  const [bits, setBits] = useState(cloudBits);
  const [handle] = useState(() => (cloudBits ? null : delayRender('取云的贴图')));
  useEffect(() => {
    if (handle === null) return;
    loadCloudBits()
      .then((loaded) => {
        cloudBits = loaded;
        setBits(loaded);
      })
      .catch((e) => cancelRender(e));
  }, [handle]);
  const mesh = useMemo(() => {
    if (!bits) return null;
    const geo = new THREE.BoxGeometry(CLOUD_CELL, CLOUD_CELL, CLOUD_THICK);
    // 原版的四面明暗：顶 1.0、底 0.7、东西 0.9、南北 0.8（`BoxGeometry` 的面依次是 +x -x +y -y +z -z）
    const shade = [0.9, 0.9, 0.8, 0.8, 1.0, 0.7];
    const cols: number[] = [];
    for (let face = 0; face < 6; face++) for (let vert = 0; vert < 4; vert++) cols.push(shade[face], shade[face], shade[face]);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const cells: [number, number][] = [];
    const halfCells = Math.ceil(radius / CLOUD_CELL);
    for (let i = -halfCells; i <= halfCells; i++)
      for (let j = -halfCells; j <= halfCells; j++) {
        if (Math.hypot(i, j) * CLOUD_CELL > radius) continue;
        const texU = (((i + Math.floor(offset[0] / CLOUD_CELL)) % 256) + 256) % 256;
        const texV = (((j + Math.floor(offset[1] / CLOUD_CELL)) % 256) + 256) % 256;
        if (bits[texV * 256 + texU]) cells.push([i, j]);
      }
    const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    const instanced = new THREE.InstancedMesh(geo, mat, cells.length);
    const dummy = new THREE.Object3D();
    cells.forEach(([i, j], k) => {
      // 贴图的 v 往南（游戏 +Z）增大，场景南是 -Y
      dummy.position.set(i * CLOUD_CELL, -j * CLOUD_CELL, height + CLOUD_THICK / 2);
      dummy.updateMatrix();
      instanced.setMatrixAt(k, dummy.matrix);
    });
    instanced.frustumCulled = false;
    return instanced;
  }, [bits, height, radius, color, offset[0], offset[1]]);
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    if (!mesh || handle === null) return;
    advance(performance.now());
    continueRender(handle);
  }, [mesh, handle, advance]);
  return mesh ? <primitive object={mesh} /> : null;
};

// 直射光（带软阴影，阴影范围以 center 为中心、半径 extent）+ 天光，主世界的。暮色森林的灯是 lib/暮色光照.tsx 的 `TwilightSunLight`
// sky：天光强度（不给就是 overworldMix 的）
export const SunLight: React.FC<{ sun: [number, number, number]; center: [number, number, number]; extent: number; intensity?: number; sky?: number }> = ({
  sun,
  center,
  extent,
  intensity,
  sky = overworldMix.天光,
}) => {
  const light = useMemo(() => {
    const dirLight = new THREE.DirectionalLight(SKY.sunLight, intensity ?? overworldMix.直射);
    const sunOffset = new THREE.Vector3(...sun).normalize().multiplyScalar(150);
    dirLight.position.set(center[0] + sunOffset.x, center[1] + sunOffset.y, center[2] + sunOffset.z);
    dirLight.target.position.set(...center);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(4096, 4096);
    Object.assign(dirLight.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 320 });
    dirLight.shadow.bias = -0.0003;
    dirLight.shadow.normalBias = 0.04;
    dirLight.shadow.radius = 3;
    return dirLight;
  }, [sun[0], sun[1], sun[2], center[0], center[1], center[2], extent, intensity]);
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
      {/* 天光的"上"是灯的位置方向，场景坐标 Z 朝上 */}
      <hemisphereLight args={[SKY.skyLight, SKY.groundLight, sky]} position={[0, 0, 1]} />
    </>
  );
};
