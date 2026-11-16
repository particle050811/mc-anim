// 体素世界的批绘制：一类材质一个代理物体，three 只给它设一次程序和 uniform，这一类的区段由它自己发绘制命令。
// 原来每个区段 × 材质类一个 THREE.Mesh，一帧两三万个：three 每次 render 遍历三遍场景（更新矩阵、稳定排序、挑物体），再逐个算矩阵、传三个矩阵、绑顶点数组，
// 提交绘制的 CPU 每帧 37～101 ms（docs/渲染性能.md「一帧拆解」）。水类还是逐网格：半透明要和别的半透明物体按远近穿插，真下界还要给它换熔岩材质。
// 做法：
// - 代理物体的几何是空的：three 的 renderBufferDirect 设完程序、材质状态后发现没东西可画就返回，接着调 onAfterRender / onAfterShadow，区段在那里画。
// - 区段的平移缩放不再是每个物体一个模型矩阵，改成一个 uniform（`区段位移`：原点相对代理物体的位置 + 缩放），顶点着色器里 `transformed = position * 缩放 + 位移`。
//   代理物体放在镜头附近的整数格点上：位移是整数、顶点是 1/64 格的整数倍，在 26 万米内 float 都精确，世界坐标（投影、随机转、阴影坐标）和原来逐位相同，
//   只有 gl_Position 那条乘法链的舍入不同（万分之一像素的量级）；相邻区段的公共顶点现在算出同一个值。
// - 先后照 three 原来的：同一类材质的网格按包围球中心的裁剪空间 z 从近到远，z 一样的留在挑区段的先后（engine/core/稳定排序.ts）。
// - 视锥剔除、第一次碰到才传顶点，照原来 `uploadWhenHit` 的算法（包围球对六个面），挪到画的时候做：主画面的视锥照 three 每次 render 开头的算法从镜头重算，
//   不存 three 挑物体时给的那个（挑物体和画之间隔着整个阴影遍，存下来的状态会被中间别的 render 盖掉）；阴影遍只认级联阴影的视锥，three 挑完紧接着就画，用它给的。
// - 顶点数组对象（VAO）按「区段 × 属性位置的组合」留着（主画面和阴影深度两种程序的属性位置不同），区段释放时删。
// - 画完把 `区段位移` 改回 (0,0,0,1)、VAO 绑回 three 的那个：three 记着它自己设过的值，不知道这里动过。
import * as THREE from 'three';
import { shadowFrustums } from '../light/级联阴影.ts';
import { groupCount, skirtGroupStart, type FaceGroup } from './网格.ts';
import { uploadVertices, vertexAttribute, returnBuffer, type VertexArray } from './容器池.ts';

/** 各体素材质共用的 uniform 的默认值：逐网格画的（水）不平移不缩放。批绘制直接改显卡里的值，画完改回 */
export const sectionDisplacement = { value: new THREE.Vector4(0, 0, 0, 1) };
export const displacementDecl = 'uniform vec4 uSec;';
export const displaceVertex = 'transformed = transformed * uSec.w + uSec.xyz;';

// 花草小面组用 16 位索引（WebGL2 保留 65535 作图元重启，不能画满第 16384 个四边形）
export const plantShortFaceLimit = 16383;
export const quadIndices = <T extends Uint16Array | Uint32Array>(indices: T) => {
  for (let q = 0, n = indices.length / 6; q < n; q++) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  return indices;
};

/** 一个区段里一类材质的面：批绘制的最小单位（不是 three 的物体） */
export type BatchItem = {
  attributes: THREE.GLBufferAttribute[]; // position、uv、tex、col，容器由 容器池.ts 管，`传` 过才有
  面: number;
  shortIndex: boolean; // 用 16 位共用索引
  segment: number[]; // 各朝向组的起点（面号），见 网格.ts
  upload: () => void; // 第一次被哪个视锥碰到才传顶点
  origin: number[]; // 体素块原点（世界组里的坐标，米）
  scale: number; // 顶点整数 → 米
  boundingSphere: THREE.Sphere; // 包围球（世界组里的坐标）
  vao: (WebGLVertexArrayObject | undefined)[]; // 按属性布局号
};

const _matrix = new THREE.Matrix4();
const identityQuat = new THREE.Quaternion();
export const buildBatchItem = (ctx: WebGL2RenderingContext, group: FaceGroup, isPlant: boolean, origin: number[], k: number, box: number[]): BatchItem => {
  const attributeArrays: VertexArray[] = [group.pos, group.uv, group.tex, group.col];
  const attributes = [vertexAttribute(ctx, group.pos, 3), vertexAttribute(ctx, group.uv, 2), vertexAttribute(ctx, group.tex, 4), vertexAttribute(ctx, group.col, 4, true)];
  // 包围球照原来网格的算法算（先按顶点整数单位给，再乘模型矩阵），z 排序、视锥剔除的数和原来逐位一样
  const boundingSphere = new THREE.Sphere(
    new THREE.Vector3(((box[0] + box[3]) / 2 - origin[0]) * k, ((box[1] + box[4]) / 2 - origin[1]) * k, ((box[2] + box[5]) / 2 - origin[2]) * k),
    (Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) / 2) * k,
  ).applyMatrix4(_matrix.compose(new THREE.Vector3(origin[0], origin[1], origin[2]), identityQuat, new THREE.Vector3(1 / k, 1 / k, 1 / k)));
  // 传完不留数组的引用：CPU 这边那份归 世界.tsx 的 `kept` 管，被它挤掉就该放
  let pendingUpload: VertexArray[] | null = attributeArrays;
  return {
    attributes,
    面: group.n,
    shortIndex: isPlant && group.n <= plantShortFaceLimit,
    segment: group.segment,
    upload: () => {
      if (!pendingUpload) return;
      for (let i = 0; i < 4; i++) uploadVertices(ctx, attributes[i]!, pendingUpload[i]!);
      pendingUpload = null;
    },
    origin: origin,
    scale: 1 / k,
    boundingSphere,
    vao: [],
  };
};
/** 释放：顶点容器还回池，指着它们的 VAO 同一轮删掉（容器会被别的区段拿去用） */
/** 上下文恢复后旧的索引容器作废（只有 Studio 走得到，见 世界.tsx） */
export const clearBatchState = (ctx: WebGL2RenderingContext) => void indexBuffers.delete(ctx);
export const releaseBatchItems = (ctx: WebGL2RenderingContext, items: BatchItem[]) => {
  for (const batchItem of items) {
    for (const vao of batchItem.vao) if (vao) ctx.deleteVertexArray(vao);
    batchItem.vao.length = 0;
    for (const attribute of batchItem.attributes) returnBuffer(ctx, attribute.buffer);
  }
};

// ---- 共用索引：批绘制自己的两个容器（three 那份只有它自己拿得到）。长的按用到的最大面数翻倍长，换下来的还被旧 VAO 指着，没人指了由浏览器回收 ----
type IndexBuffers = { shortIndex: WebGLBuffer | null; length: WebGLBuffer | null; longFaceCount: number };
const indexBuffers = new WeakMap<WebGL2RenderingContext, IndexBuffers>();
// 要在自己的 VAO 绑着时调：ELEMENT_ARRAY_BUFFER 的绑定记在当前 VAO 上
const bindIndex = (gl: WebGL2RenderingContext, batchItem: BatchItem) => {
  let s = indexBuffers.get(gl);
  if (!s) indexBuffers.set(gl, (s = { shortIndex: null, length: null, longFaceCount: 0 }));
  if (batchItem.shortIndex) {
    if (s.shortIndex) return gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.shortIndex);
    s.shortIndex = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.shortIndex);
    return gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(new Uint16Array(plantShortFaceLimit * 6)), gl.STATIC_DRAW);
  }
  if (s.length && s.longFaceCount >= batchItem.面) return gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.length);
  s.longFaceCount = Math.max(batchItem.面, s.length ? s.longFaceCount * 2 : 1 << 16);
  s.length = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.length);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(new Uint32Array(s.longFaceCount * 6)), gl.STATIC_DRAW);
};

// ---- 程序：`区段位移` 的位置和四个属性的位置。属性位置的组合编成布局号，VAO 按它分 ----
type GlProgram = { program: WebGLProgram; getAttributes: () => Record<string, { location: number } | undefined> };
type ProgramLocation = { displacement: WebGLUniformLocation | null; layoutId: number; 位置: number[] };
const programLocations = new WeakMap<object, ProgramLocation>();
const layoutIndex = new Map<string, number>();
const attrNames = ['position', 'uv', 'tex', 'col'];
const getProgramLocation = (gl: WebGL2RenderingContext, program: GlProgram) => {
  let programLocs = programLocations.get(program);
  if (programLocs) return programLocs;
  const attributes = program.getAttributes();
  const glPosList = attrNames.map((attrName) => attributes[attrName]?.location ?? -1);
  const posKey = glPosList.join(',');
  let layoutId = layoutIndex.get(posKey);
  if (layoutId === undefined) layoutIndex.set(posKey, (layoutId = layoutIndex.size));
  programLocations.set(program, (programLocs = { displacement: gl.getUniformLocation(program.program, 'uSec'), layoutId, 位置: glPosList }));
  return programLocs;
};
const buildVao = (gl: WebGL2RenderingContext, batchItem: BatchItem, programLocs: ProgramLocation) => {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  for (let a = 0; a < 4; a++) {
    const glPos = programLocs.位置[a]!;
    if (glPos < 0) continue;
    const attribute = batchItem.attributes[a]!;
    gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer);
    gl.enableVertexAttribArray(glPos);
    gl.vertexAttribPointer(glPos, attribute.itemSize, attribute.type, attribute.normalized, 0, 0);
  }
  bindIndex(gl, batchItem);
  return vao;
};

// 阴影代理物体自己的材质（只为 three 取正反面这些状态，不出画面）和阴影遍的深度材质：three 自带的那个加上 `区段位移`
export const shadowMaterial = new THREE.MeshBasicMaterial();
let shadowDepthMaterial: THREE.MeshDepthMaterial | null = null;
const makeShadowDepthMaterial = () => {
  if (shadowDepthMaterial) return shadowDepthMaterial;
  shadowDepthMaterial = new THREE.MeshDepthMaterial();
  shadowDepthMaterial.onBeforeCompile = (sh) => {
    sh.uniforms.uSec = sectionDisplacement;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${displacementDecl}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n  ${displaceVertex}`);
  };
  shadowDepthMaterial.customProgramCacheKey = () => '体素-影';
  return shadowDepthMaterial;
};

const _projView = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _inverse = new THREE.Matrix4();
const _normalMatrix = new THREE.Matrix3();
const _planes = [0, 1, 2, 3, 4, 5].map(() => new THREE.Plane());
let warned = false;

/** 一类材质（或阴影）的代理物体。每帧 `清` 之后按挑区段的先后 `加`，有东西才挂进世界组 */
export class ClassBatch extends THREE.Mesh {
  items: BatchItem[] = [];
  // 项 i 要画的段：段[段起[i]] 到 段[段起[i + 1]]，两个一对（起点、个数，单位是索引）
  drawRangeStarts: number[] = [0];
  segment: number[] = [];
  private 见 = new Int32Array(1024); // 这一遍在视锥里的项号
  private farDepths = new Float64Array(1024); // 排序用：各项离镜头的纵深
  private shadowFrustum: THREE.Frustum | null = null;

  readonly shadow: boolean;

  constructor(material: THREE.Material, shadow: boolean) {
    super(new THREE.BufferGeometry(), material);
    this.shadow = shadow;
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    this.matrixAutoUpdate = false;
    this.castShadow = shadow;
    this.receiveShadow = !shadow;
    if (shadow) this.customDepthMaterial = makeShadowDepthMaterial();
  }

  reset(refPoint: number[]) {
    this.items.length = 0;
    this.drawRangeStarts.length = 1;
    this.segment.length = 0;
    this.position.set(refPoint[0]!, refPoint[1]!, refPoint[2]!);
    this.updateMatrix();
  }

  /** 只画看得见的几组朝向：连续几组并成一段。只给了前 7 组时，裙边四组跟着各自朝向走（和 材质.ts 的 pickDirs 同一个算法） */
  加(batchItem: BatchItem, visibleFlags: boolean[]) {
    const groupStart = batchItem.segment;
    const faceGroupStarts = this.segment;
    const origLength = faceGroupStarts.length;
    let startIndex = -1;
    for (let k = 0; k <= groupCount; k++) {
      const on = k < groupCount && (k < visibleFlags.length ? visibleFlags[k] : visibleFlags[k - skirtGroupStart]);
      if (on && startIndex < 0) startIndex = groupStart[k]!;
      if (!on && startIndex >= 0) {
        if (groupStart[k]! > startIndex) faceGroupStarts.push(startIndex * 6, (groupStart[k]! - startIndex) * 6);
        startIndex = -1;
      }
    }
    if (faceGroupStarts.length === origLength) return;
    this.items.push(batchItem);
    this.drawRangeStarts.push(faceGroupStarts.length);
  }

  // three 挑物体时调（主画面每次 render 一次，阴影遍每级一次）。主画面不画阴影那个、阴影遍只画阴影那个；逐区段的剔除在画的时候做
  override intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray) {
    if (this.shadow !== shadowFrustums.has(frustum as THREE.Frustum) || !this.items.length) return false;
    if (this.shadow) this.shadowFrustum = frustum as THREE.Frustum;
    return true;
  }

  // 逐区段视锥剔除，在里面的传顶点、项号记进 `见`，返回个数。
  // 世界组挂在转成 Y 朝上的父节点下：不逐项把包围球乘到世界里，把六个面换到世界组自己的坐标里比（父节点只有旋转平移，半径不变）
  private cull(worldPlanes: THREE.Plane[]) {
    const items = this.items;
    const n = items.length;
    if (this.见.length < n) {
      this.见 = new Int32Array(n * 2);
      this.farDepths = new Float64Array(n * 2);
    }
    const visible = this.见;
    let faceCount = worldPlanes;
    if (this.parent) {
      _inverse.copy(this.parent.matrixWorld).invert();
      _normalMatrix.getNormalMatrix(_inverse);
      faceCount = _planes;
      for (let p = 0; p < 6; p++) faceCount[p]!.copy(worldPlanes[p]!).applyMatrix4(_inverse, _normalMatrix);
    }
    let count = 0;
    for (let i = 0; i < n; i++) {
      const batchItem = items[i]!;
      const c = batchItem.boundingSphere.center;
      const negRadius = -batchItem.boundingSphere.radius;
      let active = true;
      for (let p = 0; p < 6; p++) {
        const plane = faceCount[p]!;
        if (plane.normal.x * c.x + plane.normal.y * c.y + plane.normal.z * c.z + plane.constant < negRadius) {
          active = false;
          break;
        }
      }
      if (!active) continue;
      batchItem.upload();
      visible[count++] = i;
    }
    return count;
  }

  override onAfterRender(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera, _geometry: THREE.BufferGeometry, material: THREE.Material) {
    _projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const n = this.cull(_frustum.setFromProjectionMatrix(_projView, THREE.WebGLCoordinateSystem, camera.reversedDepth).planes);
    if (!n) return;
    // 照 three 的不透明排序从近到远；一样的留在加进来的先后。three 排的是裁剪空间的 z，这里取 w（纵深）：
    // 屏幕 AO 第 1 遍 three 排完才把投影换成反向深度（engine/core/光栅深度.ts），到这里 z 已经近大远小，照 z 排成了从远到近，被挡住的片元先全额着色。
    // 正交投影 w 恒为 1，仍取 z
    if (this.parent) _projView.multiply(this.parent.matrixWorld);
    const e = _projView.elements;
    const row = camera.projectionMatrix.elements[11] ? 3 : 2;
    const { 见: visible, farDepths, items: items } = this;
    for (let i = 0; i < n; i++) {
      const k = visible[i]!;
      const c = items[k]!.boundingSphere.center;
      farDepths[k] = e[row]! * c.x + e[row + 4]! * c.y + e[row + 8]! * c.z + e[row + 12]!;
    }
    visible.subarray(0, n).sort((a, b) => farDepths[a]! - farDepths[b]! || a - b);
    this.draw(renderer, material, n);
  }

  override onAfterShadow(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, _camera: THREE.Camera, _shadowCamera: THREE.Camera, _geometry: THREE.BufferGeometry, depthMaterial: THREE.Material) {
    if (!this.shadowFrustum) return;
    const n = this.cull(this.shadowFrustum.planes);
    if (n) this.draw(renderer, depthMaterial, n);
  }

  private draw(renderer: THREE.WebGLRenderer, material: THREE.Material, n: number) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const programLocs = getProgramLocation(gl, (renderer.properties.get(material) as { currentProgram: GlProgram }).currentProgram);
    if (!programLocs.displacement) {
      // 被换成了不认 `区段位移` 的材质（scene.overrideMaterial 之类）：画出来位置是错的，不画。照体素材质克隆、onBeforeCompile 接着原来的（engine/三渲二/描边.tsx 的变体）认
      if (!warned) console.warn(`[体素批绘制] 材质 ${material.type} 的着色器里没有 uSec，这一遍的体素地形没画`);
      warned = true;
      return;
    }
    const { 见: visible, items: items, drawRangeStarts, segment: faceGroupStarts } = this;
    const R = this.position;
    const origVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    for (let i = 0; i < n; i++) {
      const k = visible[i]!;
      const batchItem = items[k]!;
      gl.bindVertexArray(batchItem.vao[programLocs.layoutId] ?? (batchItem.vao[programLocs.layoutId] = buildVao(gl, batchItem, programLocs)));
      gl.uniform4f(programLocs.displacement, batchItem.origin[0]! - R.x, batchItem.origin[1]! - R.y, batchItem.origin[2]! - R.z, batchItem.scale);
      const indexType = batchItem.shortIndex ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
      const indexWidth = batchItem.shortIndex ? 2 : 4;
      for (let j = drawRangeStarts[k]!, endIndex = drawRangeStarts[k + 1]!; j < endIndex; j += 2) gl.drawElements(gl.TRIANGLES, faceGroupStarts[j + 1]!, indexType, faceGroupStarts[j]! * indexWidth);
    }
    gl.uniform4f(programLocs.displacement, 0, 0, 0, 1);
    gl.bindVertexArray(origVao);
  }
}
