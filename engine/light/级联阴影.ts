// 级联阴影：暮色主光（lib/暮色光照.tsx 的 `TwilightSunLight`）、主世界日光（lib/飞行镜头.tsx）的软投影。用 three 0.186 自带的 SunLight 级联（examples/jsm/lights/SunLightShadow.js），
// 照 Photon 的思路（主光以直射为主、有影子才显得出起伏，见 lib/光照配比.ts），但不移植 Photon 的 PCSS：柔影用固定半径的 PCF。
// 和 three 原版的不同（`updateMatrices` 照 SunLightShadow.js 改写，three.js 是 MIT 许可）：
// - 三级（原版两级）：近级只管镜头前 `nearDist` 米，人物在这里。只有两级时近一级要盖到 300 米、一像素 18 厘米，比头发、耳朵这些层还粗，
//   人在世界里飞、像素格不跟着人走，人身上自己投的影子每帧换一种锯齿，跟拍时身上明暗一帧一跳（6-1-4至9 飞向终焉城堡，用户 10-19 指出）。近级一像素 3 厘米上下，半影（0.18 米）占五六个像素，影子软硬不变、不再闪。
// - 切分：原版 practical 切分在远处第 0 级只有几米一像素，这里中、远两级切在 `splitDist` 米附近（一镜到底取 max(300, 2 × 离地)），按四分之一个八度取整（否则影子边每帧换像素格而游动），最多切到投影远端（`shadow.camera.far`，见 暮色光照.tsx 的 `shadowFarFor`）的一半；近级不超过中级切分的一半。
// - 各级外接球半径也按四分之一个八度往上取整：变焦时（一镜到底 lens 逐帧变）半径每帧变，像素格对齐位置跟着变，城垛条状影子一直闪（用户 10-09 发现）。
// - 半影（影子边半宽，米）按到镜头的深度渐变：近处 `nearPenumbra`（6-1-2 原单张阴影图的软硬），留得住一两米的东西的影子；远一级至少 0.6 个像素（再窄是锯齿），一镜到底约 1 米。
//   近处和远一级不能一样宽：都取远一级则近处小东西影子没了；按像素数取同样半径（原版）则远一级影子边宽十来倍，交界有一道线（用户对「分界线」很敏感）。
//   所以按深度从 `splitDist` 的 0.45 倍到 0.9 倍（交接带起点）渐变到远一级半影，交接带里中、远两级一样宽；渐变按没取整的 `splitDist` 算，跳档时影子边不跳。近、中两级都是近处半影，交界看不出。
//   着色器按本点深度算半影再除以一像素多少米得 PCF 半径（`getSunShadow` 改写，见文件末），渐变止和远一级半影放在第一级、最后一级的 `_cascadeData[i].w`。
// - 远端淡出：原版最后 10% 淡掉会在地上留弧线；这里最后一级的后 40% 慢慢淡掉。
// - 影子采样：原版 5 点按像素随机转，半径大时是噪点；这里 24 个固定点（Vogel 圆盘，不转），每点是硬件 2×2 双线性比较。原版半径按单级 `shadowMapSize` 换算，图集横向像素只有一半宽，半影成椭圆；这里按图集实际像素换算。
// - 受光面采样点按受光面自己的斜率比深度（receiver plane depth bias），再往光源挪两个阴影像素：只按本点比，体素区段边上贴地的竖面「裙边」会在地上压出细线。不加大统一偏移（远一级要几米，近处影子会离开树根）。
//
// 体素世界的地形要投影，见 lib/体素/材质.ts 的 投影网格（只画背光面、只进阴影图），投影视锥 用来认出阴影遍。
import * as THREE from 'three';
import { SunLightShadow } from 'three/examples/jsm/lights/SunLightShadow.js';

const cascadeCount = 3; // 级数：three 的 SunLightShadow 建了两级、着色器写死 SUN_LIGHT_CASCADES 2，这里补第三级、改着色器的定义（见构造和文件末）
const overlapFrac = 0.1; // 每级末尾和下一级重叠混合的比例（同原版）
const farFadeFrac = 0.4;
// 近处的半影（米）：6-1-2 原来那张单张阴影图的软硬（6 像素 × 3 厘米）
const nearPenumbra = 0.18;
// 近级管到镜头前多少米（按四分之一个八度取整）：一镜到底 26mm 时外接球半径 64 米、一像素 3 厘米，半影约 6 个像素
const nearDist = 64;

// 按四分之一个八度往上取整
export const quarterOctaveCeil = (x: number) => 2 ** (Math.ceil(Math.log2(x) * 4) / 4);

// 三维画布的阴影遍按这些视锥挑物体（WebGLShadowMap 的 renderObject 用 shadow.getFrustum(i)），主画面用的是画布自己的视锥：
// 只该进阴影图的网格靠这个分辨现在是哪一遍（lib/体素/材质.ts 的 投影网格）
export const shadowFrustums = new WeakSet<THREE.Frustum>();

type ShadowInternals = {
  _viewportCount: number;
  _frameExtents: THREE.Vector2;
  _cameras: THREE.OrthographicCamera[];
  _matrices: THREE.Matrix4[];
  _frustums: THREE.Frustum[];
  _cascadeSplits: number[];
  _cascadeData: THREE.Vector4[];
  _viewports: THREE.Vector4[];
  _updateMatrix: (camera: THREE.Camera, matrix: THREE.Matrix4, frustum: THREE.Frustum, viewport: THREE.Vector4) => void;
};

const _orient = new THREE.Matrix4();
const _toLight = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
const _apex = new THREE.Vector3();
const _ray = [0, 1, 2, 3].map(() => new THREE.Vector3());
const _corner = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
const _centers = Array.from({ length: cascadeCount }, () => new THREE.Vector3());
const _radii = new Array<number>(cascadeCount).fill(0);
const _minZ = new Array<number>(cascadeCount).fill(0);

export class CascadedShadow extends SunLightShadow {
  splitDist = 300; // 米，没取整的（取整在这里做）

  constructor() {
    super();
    // 原版建好两级，补到 cascadeCount 级；图集横排，每级 mapSize 大
    const internals = this as unknown as ShadowInternals;
    while (internals._cameras.length < cascadeCount) {
      internals._cameras.push(new THREE.OrthographicCamera());
      internals._matrices.push(new THREE.Matrix4());
      internals._frustums.push(new THREE.Frustum());
      internals._cascadeData.push(new THREE.Vector4());
      internals._viewports.push(new THREE.Vector4());
    }
    internals._viewportCount = cascadeCount;
    internals._frameExtents.set(cascadeCount, 1);
    internals._cascadeSplits = new Array(cascadeCount + 1).fill(0);
    for (let i = 0; i < cascadeCount; i++) shadowFrustums.add(this.getFrustum(i));
  }

  updateMatrices(light: THREE.Light, view?: THREE.Camera) {
    if (!view) return;
    const internals = this as unknown as ShadowInternals;
    const cam = view as THREE.PerspectiveCamera;
    const far = Math.min(this.camera.far, cam.far);
    const splits = internals._cascadeSplits;
    const midSplit = Math.min(quarterOctaveCeil(this.splitDist), far * 0.5);
    splits[0] = 0;
    splits[1] = Math.min(quarterOctaveCeil(nearDist), midSplit * 0.5);
    splits[2] = midSplit;
    splits[3] = far;
    // 半影渐变到远一级的深度：交接带起点（切分 × 0.9）按没取整的切分算，不超过取整后的
    const fadeEndDepth = (1 - overlapFrac) * Math.min(this.splitDist, far * 0.5);

    _dir.setFromMatrixPosition(light.matrixWorld).negate().normalize();
    _up.set(0, 1, 0);
    if (Math.abs(_up.dot(_dir)) > 0.99) _up.set(0, 0, 1);
    _orient.lookAt(_center.set(0, 0, 0), _dir, _up);
    _toLight.copy(_orient).transpose().multiply(cam.matrixWorld);

    // 镜头视锥的四条棱换到光的坐标里（只转不缩，距离不变）：棱上深度 d 的点 = 镜头位置 + 棱向 × d。
    // 从镜头位置（深度 0）算起、不管近裁面：各段近裁面不一样（0.05 或 0.1），按近裁面切的话级联大小差一点、像素格对不上，首尾相接的两帧影子边不再逐像素一样
    _apex.set(0, 0, 0).applyMatrix4(_toLight);
    let maxZ = _apex.z;
    for (let i = 0; i < 4; i++) {
      const x = i === 0 || i === 1 ? 1 : -1;
      const y = i === 0 || i === 3 ? 1 : -1;
      const ray = _ray[i].set(x, y, -1).applyMatrix4(cam.projectionMatrixInverse);
      ray.divideScalar(-ray.z).applyMatrix4(_toLight).sub(_apex);
      maxZ = Math.max(maxZ, _apex.z + ray.z * far);
    }
    // 天花板往光源方向再抬一个投影远端：视锥外、光源那边的东西也投得进来
    maxZ += far;

    // 每一级：视锥这一段的外接球（镜头转动时大小不变，影子不闪；变焦时会变，半径取整，见文件头）
    for (let i = 0; i < cascadeCount; i++) {
      const c0 = i === 0 ? splits[0] : internals._cascadeData[i - 1].z;
      const c1 = splits[i + 1];
      const fade = c1 - (i === cascadeCount - 1 ? farFadeFrac : overlapFrac) * (c1 - splits[i]);
      internals._cascadeData[i].set(i === 0 ? -1e10 : c0, c1, fade, 0);
      const ctr = _centers[i].set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        _corner[j * 2].copy(_ray[j]).multiplyScalar(c0).add(_apex);
        _corner[j * 2 + 1].copy(_ray[j]).multiplyScalar(c1).add(_apex);
        ctr.add(_corner[j * 2]).add(_corner[j * 2 + 1]);
      }
      ctr.multiplyScalar(1 / 8);
      let r2 = 0;
      let mz = Infinity;
      for (let j = 0; j < 8; j++) {
        r2 = Math.max(r2, _corner[j].distanceToSquared(ctr));
        mz = Math.min(mz, _corner[j].z);
      }
      // 先放大半个像素（对齐像素格时不会切掉视锥的角；四周留的那圈最多各占四分之一，一级至少有半张图宽）再取整，见文件头
      _radii[i] = quarterOctaveCeil(Math.sqrt(r2) / (1 - 2 / Math.min(this.mapSize.x, this.mapSize.y)));
      _minZ[i] = mz;
    }

    // 图集里每级四周留一圈，PCF 采样不会读到隔壁那级：按各级最大的半径（像素）留。近级只到 `splits[1]`，半影按那里的深度算；中、远级都可能在交接带里，按远一级的半影（至少 0.6 个远一级像素）算。
    // 这圈至少留 `minMarginPx` 个像素：按半径之比算的话，远一级跨档时别的级的像素格也跟着挪，地上的影子边会跳；一镜到底里只要七八个像素，留 32 个（少 1.5% 的分辨率），比值再大才按算出来的留
    const minMarginPx = 32;
    const farPenumbra = Math.max(nearPenumbra, (0.6 * 2 * _radii[cascadeCount - 1]) / this.mapSize.x);
    const smooth = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    const nearMax = nearPenumbra + (farPenumbra - nearPenumbra) * smooth(0.5 * fadeEndDepth, fadeEndDepth, splits[1]);
    let rMax = 0;
    for (let i = 0; i < cascadeCount; i++) rMax = Math.max(rMax, (i === 0 ? nearMax : farPenumbra) / ((2 * _radii[i]) / this.mapSize.x));
    const marginPx = Math.max(minMarginPx, Math.ceil(rMax) + 1);
    const insetX = Math.min(0.25, marginPx / this.mapSize.x);
    const insetY = Math.min(0.25, marginPx / this.mapSize.y);
    for (let i = 0; i < cascadeCount; i++) internals._viewports[i].set(i + insetX, insetY, 1 - 2 * insetX, 1 - 2 * insetY);
    const resX = this.mapSize.x * (1 - 2 * insetX);
    const resY = this.mapSize.y * (1 - 2 * insetY);

    for (let i = 0; i < cascadeCount; i++) {
      // 外接球（上面已放大半个像素、取过整）；中心对齐像素格，镜头平移时影子边不爬
      const radius = _radii[i];
      const tx = (2 * radius) / resX;
      const ty = (2 * radius) / resY;
      const ctr = _centers[i];
      ctr.x = Math.round(ctr.x / tx) * tx;
      ctr.y = Math.round(ctr.y / ty) * ty;
      ctr.z = maxZ + this.camera.near;
      ctr.applyMatrix4(_orient);
      // 着色器读的半影参数（米）：第一级放渐变止，最后一级放远一级的半影（至少是它的 0.6 个像素），中间的不用
      internals._cascadeData[i].w = i === 0 ? fadeEndDepth : i === cascadeCount - 1 ? Math.max(nearPenumbra, 0.6 * tx) : 0;
      const cascadeCam = internals._cameras[i];
      cascadeCam.position.copy(ctr);
      cascadeCam.quaternion.setFromRotationMatrix(_orient);
      cascadeCam.left = -radius;
      cascadeCam.right = radius;
      cascadeCam.top = radius;
      cascadeCam.bottom = -radius;
      cascadeCam.near = this.camera.near;
      cascadeCam.far = maxZ - _minZ[i] + 2 * this.camera.near;
      cascadeCam.updateProjectionMatrix();
      cascadeCam.updateMatrixWorld();
      internals._updateMatrix(cascadeCam, internals._matrices[i], internals._frustums[i], internals._viewports[i]);
    }
  }
}

// ---------- 着色器：暮色主光的影子按本点深度的半影（米）、固定的 24 个点采样 ----------
const sampleCount = 24;
const diskPoints = Array.from({ length: sampleCount }, (_, i) => {
  const radius = Math.sqrt((i + 0.5) / sampleCount);
  const t = i * 2.399963229728653;
  return `vec2(${(radius * Math.cos(t)).toFixed(6)}, ${(radius * Math.sin(t)).toFixed(6)})`;
}).join(', ');

// 换掉 three 的 getSunShadow（从函数头到它的 return shadow; 后面那个右括号；打包过的 three 去掉了空行，按正则找）
const cascadeDefine = /#define SUN_LIGHT_CASCADES \d+/;
if (!cascadeDefine.test(THREE.ShaderChunk.shadowmap_pars_fragment)) throw new Error('级联阴影：three 的 shadowmap_pars_fragment 变了，SUN_LIGHT_CASCADES 找不到');
const origChunk = THREE.ShaderChunk.shadowmap_pars_fragment.replace(cascadeDefine, `#define SUN_LIGHT_CASCADES ${cascadeCount}`);
const funcStart = origChunk.indexOf('float getSunShadow(');
const tailPattern = /return shadow;\s*\}/g;
tailPattern.lastIndex = funcStart;
const tailMatch = funcStart < 0 ? null : tailPattern.exec(origChunk);
if (!tailMatch) throw new Error('级联阴影：three 的 shadowmap_pars_fragment 变了，getSunShadow 找不到');
const funcEnd = tailMatch.index + tailMatch[0].length;
THREE.ShaderChunk.shadowmap_pars_fragment =
  origChunk.slice(0, funcStart) +
  /* glsl */ `
		#if defined( SHADOWMAP_TYPE_PCF )

			const vec2 SUN_PCF_DISK[ ${sampleCount} ] = vec2[ ${sampleCount} ]( ${diskPoints} );

			// penumbra：半影（米）；m：这一级的阴影矩阵（正交投影，w = 1）；dpx、dpy：本点世界坐标对屏幕 x、y 的导数（在分支外面求，分支里求导数不可靠）
			float sunShadowPCF( sampler2DShadow shadowMap, float shadowIntensity, float shadowBias, float penumbra, mat4 m, vec4 worldPosition, vec3 dpx, vec3 dpy ) {

				vec3 c = ( m * worldPosition ).xyz;
				vec2 size = vec2( textureSize( shadowMap, 0 ) );
				// 深度单位每米多少、这一级一个阴影像素多少米
				float zm = length( vec3( m[ 0 ][ 2 ], m[ 1 ][ 2 ], m[ 2 ][ 2 ] ) );
				float texel = 1.0 / ( length( vec3( m[ 0 ][ 0 ], m[ 1 ][ 0 ], m[ 2 ][ 0 ] ) ) * size.x );
				c.z += shadowBias - 2.0 * texel * zm;
				if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
				// 受光面的深度对阴影图 uv 的斜率：解 dz = a du + b dv（屏幕 x、y 两个方向各一条）
				vec3 cx = ( m * vec4( dpx, 0.0 ) ).xyz;
				vec3 cy = ( m * vec4( dpy, 0.0 ) ).xyz;
				float det = cx.x * cy.y - cx.y * cy.x;
				vec2 dz = abs( det ) > 1e-20 ? vec2( cx.z * cy.y - cy.z * cx.y, cx.x * cy.z - cy.x * cx.z ) / det : vec2( 0.0 );
				// PCF 半径（像素）：至少 0.6 个这一级的像素
				vec2 r = max( penumbra / texel, 0.6 ) / size;
				// 掠射的面斜率极大：每个点的修正最多 4 米深
				float lim = 4.0 * zm;
				float s = 0.0;
				for ( int i = 0; i < ${sampleCount}; i ++ ) {
					vec2 o = SUN_PCF_DISK[ i ] * r;
					s += texture( shadowMap, vec3( c.xy + o, c.z + clamp( dot( dz, o ), - lim, lim ) ) );
				}
				return mix( 1.0, s / ${sampleCount}.0, shadowIntensity );

			}

		#endif

		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {

			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			vec3 dpx = dFdx( shadowWorldPosition.xyz );
			vec3 dpy = dFdy( shadowWorldPosition.xyz );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			// 半影（米）：近处 ${nearPenumbra} 米，深度从渐变止的一半到渐变止渐变到远一级的半影（第一级的 w 是渐变止，最后一级的 w 是远一级的半影）
			float fadeEnd = sunShadowCascade[ cascadeOffset ].w;
			float penumbra = mix( ${nearPenumbra.toFixed(3)}, sunShadowCascade[ cascadeOffset + SUN_LIGHT_CASCADES - 1 ].w, smoothstep( 0.5 * fadeEnd, fadeEnd, viewDepth ) );
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					#if defined( SHADOWMAP_TYPE_PCF )
						float cascadeShadow = sunShadowPCF( shadowMap, sunLightShadow.shadowIntensity, sunLightShadow.shadowBias, penumbra, sunShadowMatrix[ cascadeOffset + i ], shadowWorldPosition, dpx, dpy );
					#else
						float cascadeShadow = getShadow( shadowMap, sunLightShadow.shadowMapSize, sunLightShadow.shadowIntensity, sunLightShadow.shadowBias, sunLightShadow.shadowRadius, sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition );
					#endif
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;

		}` +
  origChunk.slice(funcEnd);
