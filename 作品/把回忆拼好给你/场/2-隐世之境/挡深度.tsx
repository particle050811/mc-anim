// 描边的挡板：只在描边遮罩那一遍写深度、而且最先画的盒子，放在西门门扇、门洞南墙和门楣上，挡住她被墙、门扇挡着的那截。
// 为什么要：engine/三渲二/描边.tsx（归全片画风那一路）遮罩那遍里，不描边的东西换成 colorWrite = false 的只写深度材质，描边对象写 1。
// three 画不透明物体按 renderOrder → 材质 id → 远近排，派生材质是第一次用到时才建的，墙、门扇的派生材质 id 比她的大，
// 就排在她后面画：深度盖上了，可遮罩里她那截的 1 擦不掉，你在门外、门洞里时她被门洞南墙挡住的尾巴、法杖、帽檐，描边照样画在墙面上。
// （核查 10-24 实验：遮罩那遍把不描边的网格统一换成一个模块里早早建好的只写深度材质就没了，去掉派生材质的着色器补丁、改双面都不管用。）
// 这里的挡板 renderOrder 排在最前，遮罩那遍先把深度写上，她在挡板后面的那截过不了深度测试、进不了遮罩。引擎修好以后这个文件可以删。
// 只在遮罩那遍写深度：主画面画到屏幕（渲染目标是 null），遮罩那遍画到描边自己的渲染目标；onBeforeRender 拿到的是这一遍用的材质，按渲染目标开关写深度。
// userData.平涂 让平涂、背景褪色都不再派生它（它们按这个标记跳过）。
import React from 'react';
import * as THREE from 'three';
import { rad } from '@engine/anim/anim.ts';
import { 主厅门们 } from '../../地点/隐世之境主厅门.tsx';

type 盒 = readonly [number, number, number, number, number, number];

const 材质 = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
材质.userData.平涂 = true;

const 只在遮罩那遍写深度 = (renderer: THREE.WebGLRenderer, _s: THREE.Scene, _c: THREE.Camera, _g: THREE.BufferGeometry, m: THREE.Material) => {
  m.depthWrite = renderer.getRenderTarget() !== null;
};

/** 挡板和墙、门扇一样大：小了墙边上会漏出一条她被挡住的遮罩，描出一道虚线（试过缩 1/128）；大了会把墙边上露出来的她挡出遮罩 */
const 缩 = 0;

const 挡板: React.FC<{ 盒: 盒 }> = ({ 盒: [x0, y0, z0, x1, y1, z1] }) => (
  <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} material={材质} renderOrder={-1e6} onBeforeRender={只在遮罩那遍写深度}>
    <boxGeometry args={[x1 - x0 - 2 * 缩, y1 - y0 - 2 * 缩, z1 - z0 - 2 * 缩]} />
  </mesh>
);

const 扇 = 主厅门们.西门.扇们[0]!;
/** 门扇关着时的那块（盒按面心挑面，四边各多 0.01，这里取回门扇本身：x 6～6.1875、y −11～−10、z 0～2） */
const 门扇盒: 盒 = [6, -11, 0, 6.1875, -10, 2];
/** 门洞南边那段墙（x 6～7、y −12～−11，两格高）：你在门外、门洞里往东南看她时挡着她右半边（核查时用红色挡板对过，正好盖住那块墙） */
const 南墙盒: 盒 = [6, -12, 0, 7, -11, 2];
/** 门楣（门洞上面那一格，x 6～7、y −11～−10、z 2～3）：帽尖、气泡底下那截 */
const 门楣盒: 盒 = [6, -11, 2, 7, -10, 3];

/** 放进和布景同一个坐标系（网格本地，Z 朝上）；开：西门开多少（0～1），同 隐世之境一楼开门 的门扇那样绕门轴转 */
export const 西门描边挡板: React.FC<{ 开: number }> = ({ 开 }) => (
  <>
    <group position={[扇.轴[0], 扇.轴[1], 0]} rotation={[0, 0, rad(扇.开角 * 开)]}>
      <group position={[-扇.轴[0], -扇.轴[1], 0]}>
        <挡板 盒={门扇盒} />
      </group>
    </group>
    <挡板 盒={南墙盒} />
    <挡板 盒={门楣盒} />
  </>
);
