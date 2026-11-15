// 方块场景数据（工具/游戏取材/导出场景.py 导出的长方体 + 花草面片 + 贴图）的格式，和从图集切贴图的 makeTexture；方块模型.tsx、基地工坊、动力钻头 在用。
import * as THREE from 'three';
import { type Png, crop } from './贴图.ts';

export type BlockSceneData = {
  uvOffset: number[];
  // 贴图都拼在和数据同名的图集 .png 里，x、y 是这一张在图集里的位置
  textures: { key: string; size: number; cutout: boolean; avg: string; x: number; y: number }[];
  // faces：+X、-X、+Y、-Y、+Z、-Z 六个面各 [贴图下标, u 方向 xyz, v 方向 xyz]（v 指向贴图图像的下方）；null = 只有纯色
  materials: { color: string; opacity: number; faces: number[][] | null }[];
  boxes: number[][]; // [中心 X, Y, Z, 尺寸 X, Y, Z, 材质下标]
  crosses: number[][]; // [底面中心 X, Y, Z, 贴图下标]
  // 按模型元素原样导出的方块（螺旋砖这类异形方块）：quads 每项 [贴图下标, 四个角各 xyz（相对方块最小角）, 四个角各 uv, 法线 xyz, 是否不受光]
  models: { color: string; quads: number[][] }[];
  instances: number[][]; // [模型下标, 方块最小角对应的 X, Y, Z]
  bodyRange: { x: number[]; y: number[] };
  markers: Record<string, number[][]>;
};

// 从图集里切出这一张，单独建成一张贴图（要各自重复平铺，不能直接用图集）
export const makeTexture = (atlas: Png, t: BlockSceneData['textures'][number]) => {
  const tex = new THREE.DataTexture(crop(atlas, t.x, t.y, t.size), t.size, t.size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  // 镂空贴图（花草、栏杆）不做多级缩小：缩小后透明度被平均，面片边缘会冒出细线
  tex.minFilter = t.cutout ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = !t.cutout;
  tex.needsUpdate = true;
  return tex;
};
