// 晋升之环：启示录的 goety_revelation:ascension_halo（饰品），戴上后头后面的那片光环（用户 11-10 定史蒂夫戴）。
// 游戏里（反编译）：PlayerHaloLayer（LivingEntityRendererMixin 加在 PlayerRenderer 上）找到饰品就画：先套玩家模型 head 的姿态（RevelationFix 的 HaloRendererMixin，跟着头转），
// 再到 halo 部件（PlayerHaloModel：相对头转轴 (0, −12, 5) 像素、绕 X 转 0.7854，即中心在头顶上方 4 像素、往后 5 像素，斜 45 度：上沿探到头顶正上方、下沿落在脑后），
// 再绕环面法线自转（mixin 把角度换成 Blaze3D.getTime() × 18，每秒 18 度），画 halo1：16×16×0 的方盒，贴图 textures/entity/player/halo.png（16×16）。
// RenderType.energySwirl：不受光、不剔除、加色混合 (ONE, ONE)、alpha < 0.1 丢（rendertype_energy_swirl.fsh）。零厚度方盒的南北两面叠在同一处：
// 北面取贴图 u 0～16，南面取 u 16～32（超出贴图、重复平铺），从同一侧看南面是左右镜像的，所以画出来 = 底色 + 贴图 + 左右镜像的贴图。
// 这里把「贴图 + 镜像」先在 sRGB 数值上加好成一张图，画一片；和画面的相加在线性空间做（游戏在 sRGB 数值上加），底色越亮差得越多、比游戏暗。
// 游戏里自转的相位跟着开机时间走，没有定值，这里从 0 起。getMeteoring() > 0 时换 halo_second.png，没做。
import { type FC, useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 贴图 from 'asset:贴图/角色/史蒂夫装备/晋升之环';

const 做材质 = () => {
  const t = png(贴图);
  const px = new Uint8Array(t.w * t.h * 4);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.w; x++) {
      const o = (y * t.w + x) * 4;
      let 有 = false;
      for (const 源x of [x, t.w - 1 - x]) {
        const s = (y * t.w + 源x) * 4;
        if (t.px[s + 3]! / 255 < 0.1) continue;
        有 = true;
        for (let k = 0; k < 3; k++) px[o + k] = Math.min(255, px[o + k]! + t.px[s + k]!);
      }
      px[o + 3] = 有 ? 255 : 0;
    }
  const tex = new THREE.DataTexture(px, t.w, t.h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
};
let 材质缓存: THREE.MeshBasicMaterial | null = null;

// 一片 16×16：u = (x + 8) / 16，v = (y + 8) / 16（模型空间 y 朝下，贴图第一行在上）
const 做几何 = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-8, -8, 0, 8, -8, 0, 8, 8, 0, -8, 8, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
};

/** 挂在人形模型 head 部件上（EntityModel 的 attach.head，部件坐标：模型像素、y 朝下、正面 −z）。秒：自转的时钟 */
export const 晋升之环: FC<{ 秒: number }> = ({ 秒 }) => {
  const 几何 = useMemo(做几何, []);
  return (
    <group position={[0, -12, 5]} rotation={[0.7854, 0, 0]}>
      <mesh geometry={几何} material={(材质缓存 ??= 做材质())} rotation={[0, 0, (秒 * 18 * Math.PI) / 180]} renderOrder={10} />
    </group>
  );
};
