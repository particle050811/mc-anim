// three 的绘制顺序改成和出帧路径无关（用户 11-01 定：同一帧的像素不能取决于之前渲过哪些帧）。
// three 默认的不透明排序先比材质编号，材质编号取决于材质懒创建的先后，同一帧单独渲和接着别的帧渲时编号不同；两个物体有深度完全一样的面时，谁盖谁就跟着变。
// 这里把材质编号换成「这一遍场景遍历里第一次见到这个材质的先后」：不用创建先后，单帧渲染时它和材质编号基本是同一个顺序，所以共面的地方还是原来的那层盖上来。
// 不能干脆不比材质、直接按距离排：共面的两层谁盖谁就变成看物体中心的远近，用户看过的画面一块块变样（试过：2-祭坛召唤的草顶变亮绿，6-举锤砸穿的井壁差到 7% 的像素），远近还跟着镜头走。
// 其他照 three 的次序；距离再一样时比较结果是 0，数组排序是稳定的，就留在场景遍历的先后。不用物体编号决胜：编号也按创建先后发，后挂上的物体编号大。
// three 的 render 每次先调 scene.onBeforeRender 才排序，所以挂在 Scene 原型上，不用改每一处 <ThreeCanvas>，也漏不掉单独 new 出来的渲染器。
import * as THREE from 'three';

type 绘制项 = { groupOrder: number; renderOrder: number; materialVariant: number; z: number; material?: THREE.Material };

const 没见过 = Number.MAX_SAFE_INTEGER;
let 材质序 = new Map<THREE.Material, number>();
let 组起点 = new Map<object, number>();
let 下一个序 = 0;
const 成组 = new WeakMap<THREE.Material, { 组: object; 位: number; 共: number }>();
// 一组材质的相对先后要固定、不看谁先出现时用（体素五类材质：哪类先出现随挑到的区段变）。第一次见到组里任何一个，整组连号占位
export const 成组排 = (材质: THREE.Material, 组: object, 位: number, 共: number) => {
  成组.set(材质, { 组, 位, 共 });
};
// 导入的方块网格（engine/voxel/方块网格.tsx）的材质等资源取到才建，材质编号总比同一帧的其他材质大，于是它和手摆的方块共面时是它盖上来（6-举锤砸穿 的井壁和碎块，用户看过）。这个先后要留住
const 后排 = new WeakSet<THREE.Material>();
export const 排在后面 = (材质: THREE.Material) => {
  后排.add(材质);
};
const 后排起点 = 1e9;
const 记材质 = (材质: THREE.Material) => {
  if (材质序.has(材质)) return;
  if (后排.has(材质)) {
    材质序.set(材质, 后排起点 + 下一个序++);
    return;
  }
  const 所在 = 成组.get(材质);
  if (!所在) {
    材质序.set(材质, 下一个序++);
    return;
  }
  let 起 = 组起点.get(所在.组);
  if (起 === undefined) {
    起 = 下一个序;
    下一个序 += 所在.共;
    组起点.set(所在.组, 起);
  }
  材质序.set(材质, 起 + 所在.位);
};
export const 排材质 = (场景: THREE.Object3D) => {
  材质序 = new Map();
  组起点 = new Map();
  下一个序 = 0;
  场景.traverse((物体) => {
    const 材质 = (物体 as THREE.Mesh).material;
    if (Array.isArray(材质)) 材质.forEach(记材质);
    else if (材质) 记材质(材质);
  });
};
const 序 = (项: 绘制项) => (项.material && 材质序.get(项.material)) ?? 没见过;

export const 不透明先后 = (a: 绘制项, b: 绘制项) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || 序(a) - 序(b) || a.materialVariant - b.materialVariant || a.z - b.z;
export const 透明先后 = (a: 绘制项, b: 绘制项) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || b.z - a.z;

// 场景遍历的先后（上面的材质先后、距离相同时的先后都靠它）也要和路径无关。R3F 重建物体（<primitive object> 换了对象、args 变了）时把新对象挂到父节点末尾（fiber 的 swapReconstructedInstances），
// 它自己的实例表（__r3f.children，按 JSX 的先后）不动，所以每次渲染前按实例表还原。不归 R3F 管的子节点留在原位，只在 R3F 管的那几个位置上换。
// 前提，现有 JSX 都满足：同一父节点不把同一对象声明两次（声明表没去重，会丢节点）；不写「条件子节点后面紧跟 attach 节点、再后面还有 Object3D」、createPortal、挂载后手动 add 进有声明子节点的父节点（世界.tsx 的 group 是 <primitive>，实例表为空，走不到这里）。这几种写法下实例表和单帧直挂的先后可能不同，真要用得跟着改。
type R3F实例 = { object?: THREE.Object3D; children: R3F实例[] };
export const 还原声明次序 = (物体: THREE.Object3D) => {
  const 实例们 = (物体 as THREE.Object3D & { __r3f?: R3F实例 }).__r3f?.children;
  if (!实例们 || 实例们.length < 2) return;
  // 大部分物体没有两个由 R3F 挂上的子节点（网格的 geometry/material 是 attach），不为它们每帧分配数组。
  let 声明数 = 0;
  for (const 实例 of 实例们) if (实例.object?.parent === 物体 && ++声明数 === 2) break;
  if (声明数 < 2) return;
  const 子们 = 物体.children;
  let 当前位置 = 0;
  for (const 实例 of 实例们) {
    const 子 = 实例.object;
    if (子?.parent !== 物体) continue;
    while (当前位置 < 子们.length && 子们[当前位置] !== 子) 当前位置++;
    if (当前位置 === 子们.length) {
      // 声明节点只占手动 add 的几千区段中的少数位置时，也不能反复从头 indexOf；游标单向走，乱序才建集合重排。
      const 声明: THREE.Object3D[] = [];
      for (const i of 实例们) if (i.object?.parent === 物体) 声明.push(i.object);
      const 声明集合 = new Set(声明);
      let 下一位 = 0;
      for (let i = 0; i < 子们.length; i++) if (声明集合.has(子们[i])) 子们[i] = 声明[下一位++];
      return;
    }
    当前位置++;
  }
};

// 包围球跟当前这一帧走。three 第一次渲染一个物体时才算它的包围球（InstancedMesh 算在 boundingSphere 上，普通物体算在 geometry 上），之后一直用这个缓存：距离排序、视锥剔除都看它。
// 每帧改实例或顶点的物体（6-举锤砸穿的填块、碎块），包围球就停在第一次渲染的那一帧，不同的帧开头算出不同的距离，后面每一帧的绘制先后都不同。
// 所以渲染前查一遍：实例矩阵、实例数、顶点从上次看到后变过，就扔掉缓存，让 three 按当前这一帧重算；手写的包围球（体素分块）内容不变，不会被扔。
type 带包围球 = THREE.Object3D & { isInstancedMesh?: boolean; instanceMatrix?: THREE.BufferAttribute; count?: number; boundingSphere?: THREE.Sphere | null; geometry?: THREE.BufferGeometry };
const 上次版本 = new WeakMap<object, number>();
const 变过 = (键: object, 版本: number) => {
  const 上次 = 上次版本.get(键);
  上次版本.set(键, 版本);
  return 上次 !== undefined && 上次 !== 版本;
};
export const 刷新包围球 = (物体: 带包围球) => {
  const 几何 = 物体.geometry;
  const 顶点 = 几何?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
  if (几何 && 顶点 && 变过(几何, 顶点.version)) 几何.boundingSphere = null;
  if (物体.isInstancedMesh && 变过(物体, 物体.instanceMatrix!.version * 1e7 + 物体.count!)) 物体.boundingSphere = null;
};

const 渲前刷新 = (物体: THREE.Object3D) => {
  刷新包围球(物体);
  还原声明次序(物体);
};

THREE.Scene.prototype.onBeforeRender = function (renderer: THREE.WebGLRenderer) {
  renderer.setOpaqueSort(不透明先后 as never);
  renderer.setTransparentSort(透明先后 as never);
  this.traverse(渲前刷新);
  排材质(this);
};
