// 鼓风机：机械动力（Create）的 encased_fan，外壳和叶片照抄模组模型（npm run 取材 -- 鼓风机）。
// 单位：格，原点在方块中心。出风口朝 +Y（游戏里模型的北面），叶片绕这根轴转。模组里的叶片只是镂空贴图薄片（fan_blades），没有厚度。
// 放在世界里的鼓风机由三块拼成（create-1.20.1-6.0.8.jar 的 EncasedFanRenderer.renderSafe，javap 核对）：
// - 外壳：models/block/encased_fan/block.json（blockstates 的 facing=north 是 x 90，出风口朝北）；
// - 叶片：AllPartialModels.ENCASED_FAN_INNER = encased_fan/propeller.json，partialFacing(…, facing.getOpposite())，按 clamp(转速 × 5, 80, 1280) × 0.3 度/刻转；
// - 传动轴：AllPartialModels.SHAFT_HALF = shaft_half.json（半根轴，从中心伸到背面），按 转速 × 0.3 度/刻转，满速是叶片的 1/5。背面漏斗框里看得到轴头，漏了就是一个黑洞（见 预览/第6章收尾修改/09-*）。
// 物品栏、思索标题框画的是另一个模型：models/item/encased_fan.json → encased_fan/item.json（`EncasedFanItem`）：四边框 + 正面格栅 + 22.5° 斜放扇叶 + 背后齿轮箱板。
// `thickBlades`（给 6-1-5 李樱手前端虚化成鼓风机用）：薄片的视频模型看不出在转，所以按 fan_blades 贴图每个不透明像素拉出有厚度的小方块，四片叶子各绕自己的中线扭 28°，中间轮毂不扭。
// `ghost` 虚影（给 6-3 下坠脚底、6-4-3 黄叛弓前用）：整台照 动力压路机.tsx 的虚影画——贴图去色后染淡青白、自发光、半透明、不写深度、不投影（体内空间的应力转动之力化出来的）。
// 叶片转角由调用方传（`spin`，度），组件里不读时钟；按画面帧率换算用 `bladeDegPerFrame`、`bladeVisualAngle`。
// 接口：
//   <EncasedFan spin={度} 轴转角?={度} 厚叶片? opacity?={0~1} ghost? tint?="#cfeeff" 叶片?={{ 不透明度?, 亮度? }} />
//     单位格、原点在方块中心，出风口朝本地 +Y，叶片绕 Y 转。摆放时 rotation 把 +Y 转到风向上。
//     轴转角：背面那半根传动轴的转角，不给就是 spin / 5（游戏里轴转速是叶片的 1/5，见上）。
//   <EncasedFanItem />  物品模型（物品栏图标、思索标题框），坐标同上（北 = +Y、上 = +Z）；调用方自己套物品的 display 变换。
//   叶片角速度(rpm) → 度/剧情秒（游戏原速）
//   叶片每帧转角(rpm, 剧情秒每帧, 上限?) → 这一帧的画面转角（度，封顶）
//   叶片视觉转角(帧, 每帧, {起帧?, 上限?}) → 从 起帧 累加到 帧 的画面转角（度），每帧 = (f) => ({ rpm, 剧情秒 })
//   例：6-4-3 慢放：spin={叶片视觉转角(F, (f) => ({ rpm: 转速(T(f)), 剧情秒: T(f + 1) - T(f) }))}
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rad } from '../../engine/anim/anim.ts';
import { BlockModel, BlockModelData } from '../../engine/model/方块模型.tsx';
import { crop, png, type Png } from '../../engine/model/贴图.ts';
import data from 'asset:模型/物品/鼓风机';
import atlasPng from 'asset:贴图/物品/鼓风机';

const MODEL = data as unknown as BlockModelData;
const ATLAS = png(atlasPng);
// 虚影用的图集：去色、提亮（0.45 + 0.55 × 亮度）。外壳是黄褐色木框，直接染色还是褐色箱子读不出「虚影」，所以先去色再染
const GHOST_ATLAS: Png = (() => {
  const px = new Uint8Array(ATLAS.px);
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = Math.round(255 * 0.45 + 0.55 * y);
  }
  return { w: ATLAS.w, h: ATLAS.h, px };
})();

// 叶片部件里除了扇叶薄片以外的部分（中间那根轴）
const BLADE_TEX = MODEL.textures.findIndex((t) => t.key === 'create:block/fan_blades');
const D_SHAFT: BlockModelData = {
  ...MODEL,
  parts: { ...MODEL.parts, 叶片轴: { color: MODEL.parts.叶片.color, quads: MODEL.parts.叶片.quads.filter((q) => q[0] !== BLADE_TEX) } },
};

export const FAN = {
  bladeThick: 1.5 / 16, // 厚叶片的厚度
  twist: 28, // 每片叶子绕自己中线扭的角度
};

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// 厚叶片的几何：贴图像素 → 小方块，按所在叶片扭转
const thickBlades = () => {
  const t = MODEL.textures[BLADE_TEX] as unknown as { x: number; y: number; size: number };
  const px = crop(ATLAS, t.x, t.y, t.size);
  const texSize = t.size;
  // 薄片在模型里的四个角（方块中心为原点）和对应的贴图坐标：从叶片部件里那张面片读
  const bladeQuad = MODEL.parts.叶片.quads.find((qq) => qq[0] === BLADE_TEX)!;
  const origin = [0.5, -0.5, 0.5];
  const corner = (k: number) => new THREE.Vector3(bladeQuad[1 + k * 3] - origin[0], bladeQuad[2 + k * 3] - origin[1], bladeQuad[3 + k * 3] - origin[2]);
  const uvOf = (k: number) => [bladeQuad[13 + k * 2], bladeQuad[14 + k * 2]];
  const c0 = corner(0), c1 = corner(1), c3 = corner(3);
  const [u0, v0] = uvOf(0);
  const [u1] = uvOf(1);
  const [, v3] = uvOf(3);
  const eu = c1.clone().sub(c0).divideScalar(u1 - u0); // 贴图 u 每 1 对应的位移
  const ev = c3.clone().sub(c0).divideScalar(v3 - v0);
  const at = (u: number, v: number) => c0.clone().addScaledVector(eu, u - u0).addScaledVector(ev, v - v0);
  const normal = eu.clone().cross(ev).normalize();
  const center = at(0.5, 0.5);
  // 每个不透明像素：位置、颜色、属于哪片叶子（按方向分四个扇区，轮毂 = -1）
  type Pix = { p: THREE.Vector3; c: number[]; arm: number };
  const pixels: Pix[] = [];
  for (let y = 0; y < texSize; y++)
    for (let x = 0; x < texSize; x++) {
      const i = (y * texSize + x) * 4;
      if (px[i + 3] === 0) continue;
      const pixelPos = at((x + 0.5) / texSize, (y + 0.5) / texSize);
      const radial = pixelPos.clone().sub(center);
      const dist = radial.length();
      // 扇区：以 u 方向为 0，每 90° 一片
      const ang = Math.atan2(radial.dot(ev.clone().normalize()), radial.dot(eu.clone().normalize()));
      const arm = dist < 0.12 ? -1 : ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
      pixels.push({ p: pixelPos, c: [s2l(px[i] / 255), s2l(px[i + 1] / 255), s2l(px[i + 2] / 255)], arm });
    }
  // 每片叶子的中线：方向 a（从中心往外），横向偏移取这片叶子像素的平均
  const arms = [0, 1, 2, 3].map((k) => {
    const ang = (k * Math.PI) / 2;
    const armDir = eu.clone().normalize().multiplyScalar(Math.cos(ang)).addScaledVector(ev.clone().normalize(), Math.sin(ang)).normalize();
    const sideDir = normal.clone().cross(armDir).normalize();
    const mine = pixels.filter((p) => p.arm === k);
    const sideOffset = mine.reduce((acc, p) => acc + p.p.clone().sub(center).dot(sideDir), 0) / Math.max(1, mine.length);
    const axisPoint = center.clone().addScaledVector(sideDir, sideOffset);
    const twistMat = new THREE.Matrix4().makeRotationAxis(armDir, rad(FAN.twist));
    return { axisPoint, R: twistMat };
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const half = 0.5 / texSize;
  const hz = FAN.bladeThick / 2;
  const ex = eu.clone().normalize().multiplyScalar(half);
  const ey = ev.clone().normalize().multiplyScalar(half);
  const ez = normal.clone().multiplyScalar(hz);
  for (const pix of pixels) {
    const arm = pix.arm >= 0 ? arms[pix.arm] : null;
    // 方块的 8 个角，按叶片扭转
    const corners: THREE.Vector3[] = [];
    for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) corners.push(pix.p.clone().addScaledVector(ex, sx).addScaledVector(ey, sy).addScaledVector(ez, sz));
    if (arm) for (const cornerPt of corners) cornerPt.sub(arm.axisPoint).applyMatrix4(arm.R).add(arm.axisPoint);
    // 六个面（角的编号：x 最低位、y、z）
    const faces = [
      [0, 2, 3, 1], [4, 5, 7, 6], // -z +z
      [0, 1, 5, 4], [2, 6, 7, 3], // -y +y
      [0, 4, 6, 2], [1, 3, 7, 5], // -x +x
    ];
    for (const face of faces) {
      const baseIdx = pos.length / 3;
      const a0 = corners[face[0]], a1 = corners[face[1]], a2 = corners[face[2]];
      const nn = a1.clone().sub(a0).cross(a2.clone().sub(a0)).normalize();
      face.forEach((k) => {
        pos.push(corners[k].x, corners[k].y, corners[k].z);
        nor.push(nn.x, nn.y, nn.z);
        col.push(...pix.c);
      });
      idx.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};
let bladesGeo: THREE.BufferGeometry | null = null;

// 厚叶片各像素颜色的平均（线性）：虚影的自发光用它，顶点色乘不到自发光上
let bladesMean: THREE.Color | null = null;
const meanBladeColor = () => {
  if (!bladesMean) {
    const colorAttr = (bladesGeo ??= thickBlades()).getAttribute('color');
    const sum = [0, 0, 0];
    for (let i = 0; i < colorAttr.count; i++) for (let k = 0; k < 3; k++) sum[k] += colorAttr.getComponent(i, k);
    bladesMean = new THREE.Color(sum[0] / colorAttr.count, sum[1] / colorAttr.count, sum[2] / colorAttr.count);
  }
  return bladesMean;
};

export const ThickFanBlades: React.FC<{ opacity?: number; ghost?: string }> = ({ opacity = 1, ghost }) => {
  if (!bladesGeo) bladesGeo = thickBlades();
  const mat = useMemo(
    () =>
      ghost
        ? new THREE.MeshStandardMaterial({
            vertexColors: true,
            color: ghost,
            emissive: new THREE.Color(ghost).multiply(meanBladeColor()),
            emissiveIntensity: 1.1,
            roughness: 0.6,
            side: THREE.DoubleSide,
            transparent: true,
            opacity,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.2,
            side: THREE.DoubleSide,
            transparent: opacity < 1,
            opacity,
            depthWrite: opacity >= 1,
          }),
    [opacity, ghost],
  );
  if (ghost) return <mesh geometry={bladesGeo} material={mat} renderOrder={10} />;
  return <mesh geometry={bladesGeo} material={mat} castShadow={opacity >= 1} receiveShadow />;
};

// `spin`：叶片转过的角度（度）；`thickBlades`：换成有厚度、扭转的叶片；`opacity`：整体透明度（虚化）；
// `ghost`：按虚影画（`tint` 虚影颜色，默认同压路机虚影），opacity 0 时不画；
// `叶片`：叶片（连中间的轴）单独的 `不透明度`、`brightness`（虚影色乘它，1 = 和外壳同色）。整台同一个不透明度时叶片被外壳多盖一层，白天只剩淡青玻璃方块（6-3 下坠脚底那台）；叶片调实调暗才隔着外壳读得出四片扇叶。
export const EncasedFan: React.FC<{
  spin?: number;
  shaftAngle?: number;
  thickBlades?: boolean;
  opacity?: number;
  ghost?: boolean;
  tint?: string;
  blades?: { opacity?: number; brightness?: number };
}> = ({ spin = 0, shaftAngle, thickBlades: thick, opacity = 1, ghost = false, tint = '#cfeeff', blades: bladeOpts }) => {
  const ghostTint = ghost ? tint : undefined;
  const at = ghost ? GHOST_ATLAS : ATLAS;
  if (ghost && opacity <= 0) return null;
  const bo = bladeOpts?.opacity ?? opacity;
  const bg = ghostTint && bladeOpts?.brightness !== undefined ? '#' + new THREE.Color(ghostTint).multiplyScalar(bladeOpts.brightness).getHexString() : ghostTint;
  return (
    <>
      <BlockModel data={MODEL} atlas={at} part="外壳" opacity={opacity} ghost={ghostTint} />
      {/* 背面的半根传动轴：和叶片同属转动的内件，不透明度、亮度跟叶片走 */}
      <group rotation={[0, rad(shaftAngle ?? spin / 5), 0]}>
        <BlockModel data={MODEL} atlas={at} part="传动轴" opacity={bo} ghost={bg} />
      </group>
      <group rotation={[0, rad(spin), 0]}>
        {thick ? (
          <>
            <BlockModel data={D_SHAFT} atlas={at} part="叶片轴" opacity={bo} ghost={bg} />
            <ThickFanBlades opacity={bo} ghost={bg} />
          </>
        ) : (
          <BlockModel data={MODEL} atlas={at} part="叶片" opacity={bo} ghost={bg} />
        )}
      </group>
    </>
  );
};

// 物品模型（思索标题框用，用户 10-10 嫌画的是方块模型、朝向反了，正对镜头的是背面）：
// 游戏物品栏画物品模型 models/block/encased_fan/item.json（display.gui 是 rotation [30, 225, 0]、scale 0.625）：正面（北）是框 + fan_casing 格栅，后面隔 3 像素是绕 Z 转 22.5° 的扇叶，再往后是齿轮箱板。已用 item_display 在游戏里摆出截图核对（预览/第6章收尾修改/09-*）
export const EncasedFanItem: React.FC = () => <BlockModel data={MODEL} atlas={ATLAS} part="物品" />;

// 叶片转速（EncasedFanRenderer.renderSafe，FanVisual 同）：每刻转 clamp(|rpm|×5, 80, 1280) × 0.3 度，方向随 rpm 正负，0 不转。返回 度/剧情秒（一秒 20 刻）。
export const bladeDegPerSec = (rpm: number) => (rpm === 0 ? 0 : Math.sign(rpm) * Math.min(1280, Math.max(80, Math.abs(rpm) * 5)) * 0.3 * 20);

// 画面上每帧最多转 30°：扇叶四片，每帧过 45° 会看成倒转（车轮效应）。所以原速满速风扇在 24 帧画面里只画成每秒 2 圈；慢放时真实转角小于它，按真实转速画。
export const BLADE_MAX_DEG_PER_FRAME = 30;

// 这一帧的画面转角（度）：真实角速度 × 这一帧经过的剧情秒数，绝对值封顶在 上限
export const bladeDegPerFrame = (rpm: number, storySecPerFrame: number, maxDeg = BLADE_MAX_DEG_PER_FRAME) => {
  const deg = bladeDegPerSec(rpm) * storySecPerFrame;
  return Math.sign(deg) * Math.min(Math.abs(deg), maxDeg);
};

// 第 `frame` 帧（可带小数）时叶片的画面转角（度）：从 `起帧` 起逐帧累加 `bladeDegPerFrame`。`perFrame(f)` 给出画面第 f 帧到 f+1 帧之间的转速和走过的剧情秒数（原速 = 1/fps）。纯函数，任意顺序出帧结果一样。
export const bladeVisualAngle = (frame: number, perFrame: (frameIdx: number) => { rpm: number; storySec: number }, opt: { startFrame?: number; maxDeg?: number } = {}) => {
  const { startFrame: startFrame = 0, maxDeg: maxDeg = BLADE_MAX_DEG_PER_FRAME } = opt;
  let angle = 0;
  const wholeFrames = Math.floor(frame);
  for (let frameIdx = startFrame; frameIdx < wholeFrames; frameIdx++) {
    const { rpm, storySec } = perFrame(frameIdx);
    angle += bladeDegPerFrame(rpm, storySec, maxDeg);
  }
  if (frame > wholeFrames && wholeFrames >= startFrame) {
    const { rpm, storySec } = perFrame(wholeFrames);
    angle += bladeDegPerFrame(rpm, storySec, maxDeg) * (frame - wholeFrames);
  }
  return angle;
};
