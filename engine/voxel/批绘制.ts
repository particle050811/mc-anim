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
import { 传顶点, 顶点属性, 还容器, type 顶点数组 } from './容器池.ts';

/** 各体素材质共用的 uniform 的默认值：逐网格画的（水）不平移不缩放。批绘制直接改显卡里的值，画完改回 */
export const 区段位移 = { value: new THREE.Vector4(0, 0, 0, 1) };
export const 位移声明 = 'uniform vec4 uSec;';
export const 位移顶点 = 'transformed = transformed * uSec.w + uSec.xyz;';

// 花草小面组用 16 位索引（WebGL2 保留 65535 作图元重启，不能画满第 16384 个四边形）
export const 花草短面数 = 16383;
export const 四边形索引 = <T extends Uint16Array | Uint32Array>(数组: T) => {
  for (let q = 0, n = 数组.length / 6; q < n; q++) 数组.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
  return 数组;
};

/** 一个区段里一类材质的面：批绘制的最小单位（不是 three 的物体） */
export type 批项 = {
  属性: THREE.GLBufferAttribute[]; // position、uv、tex、col，容器由 容器池.ts 管，`传` 过才有
  面: number;
  短: boolean; // 用 16 位共用索引
  段: number[]; // 各朝向组的起点（面号），见 网格.ts
  传: () => void; // 第一次被哪个视锥碰到才传顶点
  原点: number[]; // 体素块原点（世界组里的坐标，米）
  缩放: number; // 顶点整数 → 米
  球: THREE.Sphere; // 包围球（世界组里的坐标）
  vao: (WebGLVertexArrayObject | undefined)[]; // 按属性布局号
};

const _矩阵 = new THREE.Matrix4();
const _一 = new THREE.Quaternion();
export const 建批项 = (ctx: WebGL2RenderingContext, group: FaceGroup, 花草: boolean, origin: number[], k: number, box: number[]): 批项 => {
  const 数组: 顶点数组[] = [group.pos, group.uv, group.tex, group.col];
  const 属性 = [顶点属性(ctx, group.pos, 3), 顶点属性(ctx, group.uv, 2), 顶点属性(ctx, group.tex, 4), 顶点属性(ctx, group.col, 4, true)];
  // 包围球照原来网格的算法算（先按顶点整数单位给，再乘模型矩阵），z 排序、视锥剔除的数和原来逐位一样
  const 球 = new THREE.Sphere(
    new THREE.Vector3(((box[0] + box[3]) / 2 - origin[0]) * k, ((box[1] + box[4]) / 2 - origin[1]) * k, ((box[2] + box[5]) / 2 - origin[2]) * k),
    (Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) / 2) * k,
  ).applyMatrix4(_矩阵.compose(new THREE.Vector3(origin[0], origin[1], origin[2]), _一, new THREE.Vector3(1 / k, 1 / k, 1 / k)));
  // 传完不留数组的引用：CPU 这边那份归 世界.tsx 的 `kept` 管，被它挤掉就该放
  let 待传: 顶点数组[] | null = 数组;
  return {
    属性,
    面: group.n,
    短: 花草 && group.n <= 花草短面数,
    段: group.段,
    传: () => {
      if (!待传) return;
      for (let i = 0; i < 4; i++) 传顶点(ctx, 属性[i]!, 待传[i]!);
      待传 = null;
    },
    原点: origin,
    缩放: 1 / k,
    球,
    vao: [],
  };
};
/** 释放：顶点容器还回池，指着它们的 VAO 同一轮删掉（容器会被别的区段拿去用） */
/** 上下文恢复后旧的索引容器作废（只有 Studio 走得到，见 世界.tsx） */
export const 清批绘制 = (ctx: WebGL2RenderingContext) => void 索引表.delete(ctx);
export const 放批项 = (ctx: WebGL2RenderingContext, 项们: 批项[]) => {
  for (const 项 of 项们) {
    for (const vao of 项.vao) if (vao) ctx.deleteVertexArray(vao);
    项.vao.length = 0;
    for (const 属性 of 项.属性) 还容器(ctx, 属性.buffer);
  }
};

// ---- 共用索引：批绘制自己的两个容器（three 那份只有它自己拿得到）。长的按用到的最大面数翻倍长，换下来的还被旧 VAO 指着，没人指了由浏览器回收 ----
type 索引 = { 短: WebGLBuffer | null; 长: WebGLBuffer | null; 长面数: number };
const 索引表 = new WeakMap<WebGL2RenderingContext, 索引>();
// 要在自己的 VAO 绑着时调：ELEMENT_ARRAY_BUFFER 的绑定记在当前 VAO 上
const 绑索引 = (gl: WebGL2RenderingContext, 项: 批项) => {
  let s = 索引表.get(gl);
  if (!s) 索引表.set(gl, (s = { 短: null, 长: null, 长面数: 0 }));
  if (项.短) {
    if (s.短) return gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.短);
    s.短 = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.短);
    return gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 四边形索引(new Uint16Array(花草短面数 * 6)), gl.STATIC_DRAW);
  }
  if (s.长 && s.长面数 >= 项.面) return gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.长);
  s.长面数 = Math.max(项.面, s.长 ? s.长面数 * 2 : 1 << 16);
  s.长 = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, s.长);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 四边形索引(new Uint32Array(s.长面数 * 6)), gl.STATIC_DRAW);
};

// ---- 程序：`区段位移` 的位置和四个属性的位置。属性位置的组合编成布局号，VAO 按它分 ----
type 程序 = { program: WebGLProgram; getAttributes: () => Record<string, { location: number } | undefined> };
type 程序位 = { 位移: WebGLUniformLocation | null; 布局: number; 位置: number[] };
const 程序表 = new WeakMap<object, 程序位>();
const 布局表 = new Map<string, number>();
const 属性名 = ['position', 'uv', 'tex', 'col'];
const 取程序位 = (gl: WebGL2RenderingContext, 程序: 程序) => {
  let 位 = 程序表.get(程序);
  if (位) return 位;
  const 有 = 程序.getAttributes();
  const 位置 = 属性名.map((名) => 有[名]?.location ?? -1);
  const 键 = 位置.join(',');
  let 布局 = 布局表.get(键);
  if (布局 === undefined) 布局表.set(键, (布局 = 布局表.size));
  程序表.set(程序, (位 = { 位移: gl.getUniformLocation(程序.program, 'uSec'), 布局, 位置 }));
  return 位;
};
const 建VAO = (gl: WebGL2RenderingContext, 项: 批项, 位: 程序位) => {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  for (let a = 0; a < 4; a++) {
    const 位置 = 位.位置[a]!;
    if (位置 < 0) continue;
    const 属性 = 项.属性[a]!;
    gl.bindBuffer(gl.ARRAY_BUFFER, 属性.buffer);
    gl.enableVertexAttribArray(位置);
    gl.vertexAttribPointer(位置, 属性.itemSize, 属性.type, 属性.normalized, 0, 0);
  }
  绑索引(gl, 项);
  return vao;
};

// 阴影代理物体自己的材质（只为 three 取正反面这些状态，不出画面）和阴影遍的深度材质：three 自带的那个加上 `区段位移`
export const 影材质 = new THREE.MeshBasicMaterial();
let 影深度: THREE.MeshDepthMaterial | null = null;
const 影深度材质 = () => {
  if (影深度) return 影深度;
  影深度 = new THREE.MeshDepthMaterial();
  影深度.onBeforeCompile = (sh) => {
    sh.uniforms.uSec = 区段位移;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${位移声明}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n  ${位移顶点}`);
  };
  影深度.customProgramCacheKey = () => '体素-影';
  return 影深度;
};

const _投影 = new THREE.Matrix4();
const _锥 = new THREE.Frustum();
const _逆 = new THREE.Matrix4();
const _法 = new THREE.Matrix3();
const _面 = [0, 1, 2, 3, 4, 5].map(() => new THREE.Plane());
let 报过 = false;

/** 一类材质（或阴影）的代理物体。每帧 `清` 之后按挑区段的先后 `加`，有东西才挂进世界组 */
export class 类批 extends THREE.Mesh {
  项: 批项[] = [];
  // 项 i 要画的段：段[段起[i]] 到 段[段起[i + 1]]，两个一对（起点、个数，单位是索引）
  段起: number[] = [0];
  段: number[] = [];
  private 见 = new Int32Array(1024); // 这一遍在视锥里的项号
  private 远 = new Float64Array(1024); // 排序用：各项离镜头的纵深
  private 影锥: THREE.Frustum | null = null;

  readonly 影: boolean;

  constructor(材质: THREE.Material, 影: boolean) {
    super(new THREE.BufferGeometry(), 材质);
    this.影 = 影;
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    this.matrixAutoUpdate = false;
    this.castShadow = 影;
    this.receiveShadow = !影;
    if (影) this.customDepthMaterial = 影深度材质();
  }

  清(参考点: number[]) {
    this.项.length = 0;
    this.段起.length = 1;
    this.段.length = 0;
    this.position.set(参考点[0]!, 参考点[1]!, 参考点[2]!);
    this.updateMatrix();
  }

  /** 只画看得见的几组朝向：连续几组并成一段。只给了前 7 组时，裙边四组跟着各自朝向走（和 材质.ts 的 pickDirs 同一个算法） */
  加(项: 批项, 看得见: boolean[]) {
    const 组起 = 项.段;
    const 段 = this.段;
    const 原长 = 段.length;
    let 起 = -1;
    for (let k = 0; k <= groupCount; k++) {
      const on = k < groupCount && (k < 看得见.length ? 看得见[k] : 看得见[k - skirtGroupStart]);
      if (on && 起 < 0) 起 = 组起[k]!;
      if (!on && 起 >= 0) {
        if (组起[k]! > 起) 段.push(起 * 6, (组起[k]! - 起) * 6);
        起 = -1;
      }
    }
    if (段.length === 原长) return;
    this.项.push(项);
    this.段起.push(段.length);
  }

  // three 挑物体时调（主画面每次 render 一次，阴影遍每级一次）。主画面不画阴影那个、阴影遍只画阴影那个；逐区段的剔除在画的时候做
  override intersectsFrustum(frustum: THREE.Frustum | THREE.FrustumArray) {
    if (this.影 !== shadowFrustums.has(frustum as THREE.Frustum) || !this.项.length) return false;
    if (this.影) this.影锥 = frustum as THREE.Frustum;
    return true;
  }

  // 逐区段视锥剔除，在里面的传顶点、项号记进 `见`，返回个数。
  // 世界组挂在转成 Y 朝上的父节点下：不逐项把包围球乘到世界里，把六个面换到世界组自己的坐标里比（父节点只有旋转平移，半径不变）
  private 挑(世界面: THREE.Plane[]) {
    const 项们 = this.项;
    const n = 项们.length;
    if (this.见.length < n) {
      this.见 = new Int32Array(n * 2);
      this.远 = new Float64Array(n * 2);
    }
    const 见 = this.见;
    let 面 = 世界面;
    if (this.parent) {
      _逆.copy(this.parent.matrixWorld).invert();
      _法.getNormalMatrix(_逆);
      面 = _面;
      for (let p = 0; p < 6; p++) 面[p]!.copy(世界面[p]!).applyMatrix4(_逆, _法);
    }
    let 数 = 0;
    for (let i = 0; i < n; i++) {
      const 项 = 项们[i]!;
      const c = 项.球.center;
      const 负半径 = -项.球.radius;
      let 在 = true;
      for (let p = 0; p < 6; p++) {
        const 平面 = 面[p]!;
        if (平面.normal.x * c.x + 平面.normal.y * c.y + 平面.normal.z * c.z + 平面.constant < 负半径) {
          在 = false;
          break;
        }
      }
      if (!在) continue;
      项.传();
      见[数++] = i;
    }
    return 数;
  }

  override onAfterRender(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera, _geometry: THREE.BufferGeometry, material: THREE.Material) {
    _投影.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const n = this.挑(_锥.setFromProjectionMatrix(_投影, THREE.WebGLCoordinateSystem, camera.reversedDepth).planes);
    if (!n) return;
    // 照 three 的不透明排序从近到远；一样的留在加进来的先后。three 排的是裁剪空间的 z，这里取 w（纵深）：
    // 屏幕 AO 第 1 遍 three 排完才把投影换成反向深度（engine/core/光栅深度.ts），到这里 z 已经近大远小，照 z 排成了从远到近，被挡住的片元先全额着色。
    // 正交投影 w 恒为 1，仍取 z
    if (this.parent) _投影.multiply(this.parent.matrixWorld);
    const e = _投影.elements;
    const 行 = camera.projectionMatrix.elements[11] ? 3 : 2;
    const { 见, 远, 项: 项们 } = this;
    for (let i = 0; i < n; i++) {
      const k = 见[i]!;
      const c = 项们[k]!.球.center;
      远[k] = e[行]! * c.x + e[行 + 4]! * c.y + e[行 + 8]! * c.z + e[行 + 12]!;
    }
    见.subarray(0, n).sort((a, b) => 远[a]! - 远[b]! || a - b);
    this.画(renderer, material, n);
  }

  override onAfterShadow(renderer: THREE.WebGLRenderer, _scene: THREE.Scene, _camera: THREE.Camera, _shadowCamera: THREE.Camera, _geometry: THREE.BufferGeometry, depthMaterial: THREE.Material) {
    if (!this.影锥) return;
    const n = this.挑(this.影锥.planes);
    if (n) this.画(renderer, depthMaterial, n);
  }

  private 画(renderer: THREE.WebGLRenderer, 材质: THREE.Material, n: number) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const 位 = 取程序位(gl, (renderer.properties.get(材质) as { currentProgram: 程序 }).currentProgram);
    if (!位.位移) {
      // 被换成了不认 `区段位移` 的材质（scene.overrideMaterial 之类）：画出来位置是错的，不画。照体素材质克隆、onBeforeCompile 接着原来的（engine/三渲二/描边.tsx 的变体）认
      if (!报过) console.warn(`[体素批绘制] 材质 ${材质.type} 的着色器里没有 uSec，这一遍的体素地形没画`);
      报过 = true;
      return;
    }
    const { 见, 项: 项们, 段起, 段 } = this;
    const R = this.position;
    const 原VAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
    for (let i = 0; i < n; i++) {
      const k = 见[i]!;
      const 项 = 项们[k]!;
      gl.bindVertexArray(项.vao[位.布局] ?? (项.vao[位.布局] = 建VAO(gl, 项, 位)));
      gl.uniform4f(位.位移, 项.原点[0]! - R.x, 项.原点[1]! - R.y, 项.原点[2]! - R.z, 项.缩放);
      const 型 = 项.短 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
      const 宽 = 项.短 ? 2 : 4;
      for (let j = 段起[k]!, 止 = 段起[k + 1]!; j < 止; j += 2) gl.drawElements(gl.TRIANGLES, 段[j + 1]!, 型, 段[j]! * 宽);
    }
    gl.uniform4f(位.位移, 0, 0, 0, 1);
    gl.bindVertexArray(原VAO);
  }
}
