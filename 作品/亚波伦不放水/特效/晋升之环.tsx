// 晋升之环的画：原版贴片（照游戏）和本片自制的三个候选（真几何的精工器物和光，见 晋升之环几何.ts、精工材质.ts），以及戴到头后的摆法
// （史蒂夫戴的那层在 角色/戴环史蒂夫.tsx）。游戏里的画法和出处在 晋升之环形.ts 的文件头；用户 11-10 定史蒂夫戴它、娘化亚波伦头后的眼形大光环也换成它，候选还没挑。
// 原版贴片：贴图 贴图/特效/晋升之环/halo（启示录 textures/entity/player/halo.png，16×16），两面都画、两面看都不镜像（照 ModelPart 方盒南北两面的 UV），
//   加色混合、不受光、透明度 < 0.1 丢掉（energy_swirl）。加色的东西在亮底上会发白，游戏里就这样。
// 候选：金、宝石受光并反射自带的环境；亮线、宝石的亮处用拔刀剑的泛光往外溢一小圈（只作用在这些网格上，不是全场景泛光）；
//   环后面垫一圈很淡的加色柔光（本片加的，游戏里没有）。
// 环坐标：环面在 XY 平面，+Z 朝正面的观众，+Y 朝上，单位是戴的人的模型像素。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import { KATANA_BLOOM_LAYER, useKatanaBloom } from '@库/物品/拔刀剑泛光.tsx';
import 贴片图 from 'asset:贴图/特效/晋升之环/halo';
import { 环体 } from './晋升之环几何.ts';
import { 亚波伦头轴, 原版环, 原版转角, 戴法, type 候选名, type 环款 } from './晋升之环形.ts';
import { 晕材质, 溢光类, 精工材质 } from './精工材质.ts';

const 度 = Math.PI / 180;

// ── 原版贴片 ──
const 贴片材质 = () =>
  new THREE.MeshBasicMaterial({ map: entityTexture(png(贴片图)), blending: THREE.AdditiveBlending, alphaTest: 0.1, transparent: true, side: THREE.FrontSide, toneMapped: false });
let 贴片材质缓存: THREE.MeshBasicMaterial | undefined;
const 贴片几何 = new THREE.PlaneGeometry(原版环.边长, 原版环.边长);

/** 原版那张片（环坐标，环心在原点），按秒自转 */
export const 晋升之环贴片: React.FC<{ 秒: number }> = ({ 秒 }) => {
  const 材质 = (贴片材质缓存 ??= 贴片材质());
  return (
    <group rotation={[0, 0, 原版转角(秒) * 度]}>
      <mesh geometry={贴片几何} material={材质} />
      <mesh geometry={贴片几何} material={材质} rotation={[0, Math.PI, 0]} />
    </group>
  );
};

// ── 候选 ──
const 晕缓存 = new Map<候选名, { 几何: THREE.PlaneGeometry; 材质: THREE.ShaderMaterial }>();
const 取晕 = (款: 候选名) => {
  let 出 = 晕缓存.get(款);
  if (!出) {
    const 体 = 环体(款);
    晕缓存.set(款, (出 = { 几何: new THREE.PlaneGeometry(体.晕半 * 2, 体.晕半 * 2), 材质: 晕材质(体.晕们) }));
  }
  return 出;
};
const 打层 = (溢: boolean) => (m: THREE.Mesh | null) => m?.layers[溢 ? 'enable' : 'disable'](KATANA_BLOOM_LAYER);

/** 一个候选（环坐标，环心在原点），各层按秒转；晕 默认画 */
export const 晋升之环候选: React.FC<{ 款: 候选名; 秒: number; 晕?: boolean }> = ({ 款, 秒, 晕 = true }) => {
  useKatanaBloom();
  const 体 = 环体(款);
  const 材质 = 精工材质();
  const 垫 = useMemo(() => 取晕(款), [款]);
  return (
    <>
      {体.层们.map((层, i) => (
        <group key={i} matrix={层.位姿(秒, new THREE.Matrix4())} matrixAutoUpdate={false}>
          {层.件们.map(({ 类, geo }) => (
            <mesh key={类} ref={打层(溢光类.has(类))} geometry={geo} material={材质[类]} renderOrder={类 === '芒' ? 2 : 0} />
          ))}
        </group>
      ))}
      {/* 柔光垫在环面上（加色、不写深度）；先画环再画它 */}
      {晕 && <mesh geometry={垫.几何} material={垫.材质} renderOrder={1} />}
    </>
  );
};

/** 原版贴片或一个候选（环坐标，环心在原点） */
export const 晋升之环: React.FC<{ 款: 环款; 秒: number; 晕?: boolean }> = ({ 款, 秒, 晕 }) => (款 === '原版' ? <晋升之环贴片 秒={秒} /> : <晋升之环候选 款={款} 秒={秒} 晕={晕} />);

/** 戴在头后（头坐标：原点 = 头的转轴，+Y 朝上，+Z 朝脸的前方，单位是那个人的模型像素）：位置、前倾、大小照 晋升之环形.ts 的 戴法 */
export const 头后环: React.FC<{ 款: 环款; 秒: number; 戴: '史蒂夫' | '亚波伦' }> = ({ 款, 秒, 戴 }) => {
  const 法 = 戴法[戴][款];
  return (
    <group position={[法.位[0], 法.位[1], 法.位[2]]} rotation={[法.前倾度 * 度, 0, 0]} scale={法.倍}>
      <晋升之环 款={款} 秒={秒} />
    </group>
  );
};

/** 挂到娘化亚波伦的 aaabody 骨骼上（不跟头转，原因见 戴法 的注释）：先挪到站姿时 Head 的转轴，骨骼坐标正面朝 −Z，绕 Y 转半圈换成头坐标 */
export const 亚波伦头后环 = (款: 环款, 秒: number): React.ReactNode => (
  <group position={[亚波伦头轴[0], 亚波伦头轴[1], 亚波伦头轴[2]]} rotation={[0, Math.PI, 0]}>
    <头后环 款={款} 秒={秒} 戴="亚波伦" />
  </group>
);
