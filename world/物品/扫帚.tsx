// 扫帚（魔理沙的扫帚）：照抄车万女仆模组（Touhou Little Maid 1.5.3）的扫帚实体模型和贴图（几何、贴图原样）。
// 来源：touhoulittlemaid jar 的 models/bedrock/entity/broom.json + textures/bedrock/entity/broom.png（渲染器 EntityBroomRender；legacy_pack/ 是旧资源包，不用），
//   由 工具/游戏取材/导出模型.py 导出成 扫帚.模型.json / .png（npm run 取材 -- 扫帚）。
// 大小：实体渲染器无额外缩放（1 像素 = 1/16 格），全长 2.8 格，草束约 1 格长、最宽 0.78 格。
// 坐标：同 骨架.tsx，原点 = 实体原点（扫帚正下方的地面点），Z 朝上，扫帚头（杆）朝 +Y，草束在 -Y。
// 草丝（`grassStrands`，默认开）：模组的草束是几块 4 像素厚的扁方块，从正后方近看是一条扁片，盖不满画面（6-2-4 → 6-2-5 的遮挡转场要草束盖满画面），
//   所以在草束外面包一层细草丝：沿草束方向的扁椭圆一捆，在绑带里收紧、出了绑带往尾巴散开，颜色取模组草束贴图里的稻草色。
//   只加厚度和末端蓬松，不改草束长短和位置；要模组原样传 `grassStrands={false}`。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useContext } from 'react';
import { type BedrockModel, BedrockModelView } from '../../engine/model/基岩模型.tsx';
import { Ghost, rng } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw资产 from 'asset:模型/物品/扫帚';
import tex from 'asset:贴图/物品/扫帚';
const raw = raw资产 as unknown as any; // 迁移：类型待补

export const BROOM_MODEL = { ...raw, texture: png(tex) } as unknown as BedrockModel;

// 尺寸（格，扫帚本地坐标），由模型 cube 数值算出来，摆座位、算挂点用
export const BROOM = {
  length: 2.8, // 杆头（+Y 端）到草束末端
  headY: 1.39, // 杆头最前端
  tailY: -1.41, // 草束最后端
  stickZ: 0.16, // 两个座位处杆的中心高度（实体原点往上）
  stickTop: 0.27, // 座位处杆的顶面（前座 0.27～0.29，后座 0.22～0.25）
  bristle: { y0: -0.42, y1: -1.41, width: 0.78, z: 0.17 }, // 模组草束：从哪到哪、最宽多少（x ±0.39）、中心高度（z 0.03～0.31）
  // 车万女仆的座次（`EntityBroom.positionRider`）：两人时第一个乘客在实体前方 0.35 格，第二个（女仆）在后方 0.35 格；
  // 乘客脚底高度 = 实体高度 + 乘客自己的骑乘偏移（玩家 -0.35）
  seatFront: 0.35,
  seatBack: -0.35,
};

// 草丝的颜色：模组草束后半截贴图（uv [66,15]、[0,67]、[31,66]）里的五种稻草色；前半截是深紫色绑带，草丝从绑带里穿出
const STRAW = ['#7c4840', '#906547', '#a97d5e', '#87533c', '#b48d63'];

// 一捆草丝：n 根细长方条，每根两段：根部到绑带末端（y -1.12）收在绑带里，之后往尾巴散开。
// 截面是扁椭圆（半宽、半高，格）：绑带里 (0.3, 0.11)，末端 (0.5, 0.3)
const strawGeometry = () => {
  const rand = rng(4242);
  const strandCount = 460;
  const { y0, y1, z } = BROOM.bristle;
  const yb = -1.12;
  const [wb, hb] = [0.3, 0.11];
  const [w1, h1] = [0.5, 0.3];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const color = new THREE.Color();
  const box = (start: THREE.Vector3, end: THREE.Vector3, t: number) => {
    // a → b 的细方条，截面边长 t；整根同色
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const base = pos.length / 3;
    for (const [sx, sz, sy] of [
      [-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ]) {
      const vert = new THREE.Vector3((sx * t) / 2, sy * len, (sz * t) / 2).applyQuaternion(rot).add(start);
      pos.push(vert.x, vert.y, vert.z);
      col.push(color.r, color.g, color.b);
    }
    for (const face of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) {
      idx.push(base + face[0], base + face[1], base + face[2], base + face[0], base + face[2], base + face[3]);
    }
  };
  for (let i = 0; i < strandCount; i++) {
    // 截面上均匀撒点，同一根草丝在各段用同一个方向，顺着往外散
    const angle = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    const ex = Math.cos(angle) * rr;
    const ez = Math.sin(angle) * rr;
    const t = 0.03 + rand() * 0.025;
    color.set(STRAW[Math.floor(rand() * STRAW.length)]);
    const rootPt = new THREE.Vector3(ex * wb * 0.6, y0 - 0.05 - rand() * 0.2, z + ez * hb * 0.6);
    const bandPt = new THREE.Vector3(ex * wb, yb, z + ez * hb);
    const spread = 0.85 + rand() * 0.3;
    const tipPt = new THREE.Vector3(ex * w1 * spread, y1 + 0.06 - rand() * 0.14 + (1 - rr) * 0.08, z + ez * h1 * spread);
    box(rootPt, bandPt, t);
    box(bandPt, tipPt, t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
};
let strawCache: THREE.BufferGeometry | null = null;

const Straw: React.FC = () => {
  const ghost = useContext(Ghost);
  const geo = useMemo(() => (strawCache ??= strawGeometry()), []);
  return (
    <mesh geometry={geo} castShadow={!ghost} receiveShadow={!ghost}>
      {ghost ? (
        <meshBasicMaterial color={ghost.color} transparent opacity={ghost.opacity} depthWrite={false} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.95} flatShading />
      )}
    </mesh>
  );
};

// 出现：0～1，唤出扫帚时从扫帚中心放大出来（0 = 不画）
export const Broom: React.FC<{ grassStrands?: boolean; appear?: number }> = ({ grassStrands = true, appear = 1 }) => {
  if (appear <= 0) return null;
  return (
    <group position={[0, 0, BROOM.stickZ]} scale={appear}>
      <group position={[0, 0, -BROOM.stickZ]}>
        <BedrockModelView model={BROOM_MODEL} scale={1 / 16} />
        {grassStrands && <Straw />}
      </group>
    </group>
  );
};
