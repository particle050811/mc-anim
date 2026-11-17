// 地形覆盖（pipeline/渲/地形覆盖.ts）只要每帧挑了哪些区段：挑区段在 React 渲染和 useFrame 里算，不看画出来的像素，
// 所以覆盖页把 three 的绘制整个跳过（各画布、后期、屏幕 AO 的每一遍都走 WebGLRenderer.render），省下着色器编译和每帧的显卡活。
// 挂在原型上，同 engine/core/稳定排序.ts，漏不掉单独 new 出来的渲染器。调用时才看环境变量：模块求值时 Remotion 还没把 envVariables 挂上。
import * as THREE from 'three';
import { isCoverRun } from './地形用量.ts';

const draw = THREE.WebGLRenderer.prototype.render;
THREE.WebGLRenderer.prototype.render = function (scene, camera) {
  if (!isCoverRun()) draw.call(this, scene, camera);
};
