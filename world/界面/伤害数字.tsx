// 伤害数字：照抄「汇流来世」（Confluence: Otherworld，CurseForge 1209464）的伤害显示（用户 10-10 要直接用这个 mod 的效果）。
// 参考图 设定/界面/伤害数字参考.png（暴击的「5.7」：深红、像素字、右下一层更暗的投影）。
// 出处：ConfluenceOtherworld-forge-1.2.8+1.20.1-261008.jar（只解包读，没放进游戏），javap 反汇编读的常数：
// - 生成（服务端）：org/confluence/mod/common/particle/DamageIndicatorOptions.sendDamageParticle，在 LivingEntityEvents.damage$Post 里调
//   （护甲、抗性减完、扣血之前的实际伤害，不按剩余血量截断；out_of_world、generic_kill 不出数字）。
//   - 数值：Math.round(伤害 × 10) / 10，0 不出；整数不带小数点，否则一位小数（见 `damageText`）。
//   - 文字：原版默认字体加粗，暴击 DARK_RED #AA0000 且字放大 1.5 倍，普通 GOLD #FFAA00；治疗 GREEN #55FF55、不放大。
//   - 暴击标记（前置库 confluence_magic_lib 1.3.0，MIT）只有三处会打上：原版 Player.attack 的跳劈暴击、满弦暴击箭、玩家“暴击几率”属性掷中（默认 0）。
//     拔刀剑走自己的 AttackHelper.attack，它的跳劈暴击不会让这里变红。
//   - 位置：目标 x、z，y = 碰撞箱顶；sendParticles 散布 0.1，客户端每轴再加 nextGaussian() × 0.1（见 `damageNumberAnchor`）。
// - 画法（客户端）：client/particle/DamageIndicatorParticle，满亮度：
//   - 朝向：mulPose(camera.rotation()) 再 scale(-s, -s, s)：字面和镜头成像面平行，投到画面不变形，只近大远小，字号是世界里的固定大小。
//   - 一个字体像素 = s 格，s 从 0 长到 0.04（暴击 0.06）× cubicBezier(0.8, 0, 1, 1, 1) = 0.992 倍（见 `buildAnimTable`）。
//   - 文字左右居中（宽含加粗多出的 1 像素），字顶对着锚点往下长。
//   - 画三遍：先画不带投影的字（最近），往里挪 0.03 画带投影的（投影在字右下 1 像素、颜色 × 0.25），三遍都做深度测试，投影只露在字没盖住的地方。
//   - 加粗：每个字形在 x、x + 1 各画一次，步进多 1。
//   - 字形：font/ascii.png（client-1.20.1.jar，npm run 取材 -- 伤害数字 导出成 伤害数字.字体.png），8 像素高，字宽 = 最右不透明列 + 1，步进 = 字宽 + 1；alpha < 0.1 丢掉，最近邻。
// - 动画（DamageIndicatorParticle.tick，每刻 1/20 秒；cubicBezier 见 LibMathUtils）：
//   - 寿命 30 刻：第 0～4 刻每刻透明度 +80（从 17 起，封顶 255），字号按 cubicBezier(刻/5, 0, 1, 1, 1) 长出来；
//   - 每刻往上飘 0.1 - 0.1 × cubicBezier(刻/30, 0, 0.8, 1, 1) 格，一共约 0.95 格；
//   - 第 27 刻起每刻透明度 -60；第 30 刻 tick 完移除。两刻之间按 partialTick 插值（y、字号线性，透明度 Mth.lerpInt）。
//   - 生成那一帧通常紧接着 tick 一次，第 2 刻才开始长出来：画面上比受击变红晚 1～2 帧。
// - Forge 粒子视锥剔除按碰撞箱（生成处 0.2×0.2×0.2，上飘时不更新）：生成处出了画面，整串字都不画。
// 汇流来世另有“VIRTUAL”显示（客户端配置默认，自带方块数字、橙/红、随机倾斜），和参考图对不上，所以照参考图那种 PARTICLE 显示做。
// 许可：汇流来世代码 LGPL-3.0，美术资源 CC BY-NC-SA 4.0，前置库 MIT；这里只照算法和常数重写画法，没拷它的资源；字形是原版 ascii.png。
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { png } from '../../engine/model/贴图.ts';
import fontPng from 'asset:字体/伤害数字';

// ---------- 规则 ----------
// ChatFormatting 的颜色
export const damageNumberColors = { normal: 0xffaa00, crit: 0xaa0000, heal: 0x55ff55 };
const glyphScale = { normal: 0.04, crit: 0.06 }; // 一个字体像素多少格（PoseStack.scale 的 s 的终值）
const lifetimeTicks = 30; // lifetime（刻）
const ticksPerSec = 20;

// 数值的写法（sendDamageParticle）：先四舍五入到 0.1；整数写成整数，否则写一位小数。
// Java 里是 float 运算、String.valueOf(float)（一千万以上会变成科学计数法，这里用不到）
export const damageText = (damage: number): string => {
  const rounded = Math.round(damage * 10) / 10;
  if (rounded === 0) return '';
  return rounded % 1 === 0 ? String(Math.trunc(rounded)) : rounded.toFixed(1);
};

// LibMathUtils.cubicBezier
const cubicBezier = (t: number, p0: number, p1: number, p2: number, p3: number) => {
  const oneMinusT = 1 - t;
  return oneMinusT * oneMinusT * oneMinusT * p0 + 3 * oneMinusT * oneMinusT * t * p1 + 3 * oneMinusT * t * t * p2 + t * t * t * p3;
};

// 每刻 tick 之后的状态：表[n] = 第 n 次 tick 之后（表[0] 是刚生成、还没 tick）。上升按格，从生成处起算
type TickState = { scale: number; prevScale: number; alpha: number; prevAlpha: number; rise: number; prevRise: number };
const buildAnimTable = (crit: boolean): TickState[] => {
  const k = crit ? glyphScale.crit : glyphScale.normal;
  const state: TickState = { scale: 0, prevScale: 0, alpha: 17, prevAlpha: 17, rise: 0, prevRise: 0 };
  const out: TickState[] = [{ ...state }];
  for (let age = 0; age <= lifetimeTicks; age++) {
    state.prevAlpha = state.alpha;
    state.prevScale = state.scale;
    state.prevRise = state.rise;
    if (age <= 4) {
      state.alpha = Math.min(state.alpha + 80, 255);
      state.scale = cubicBezier(age / 5, 0, 1, 1, 1) * k;
    }
    state.rise += 0.1 - cubicBezier(age / lifetimeTicks, 0, 0.8, 1, 1) * 0.1;
    if (age >= lifetimeTicks - 3) state.alpha = Math.max(state.alpha - 60, 0);
    out.push({ ...state });
  }
  return out;
};
const animTables = { normal: buildAnimTable(false), crit: buildAnimTable(true) };

// 生成之后第 刻 刻（可以带小数；第 1 次 tick 在 刻 = 0）的样子；已经移除（或还没生成）返回 null
export const damageNumberAnim = (ticks: number, crit: boolean) => {
  if (ticks < 0) return null;
  const tickCount = Math.floor(ticks) + 1; // 已经 tick 了几次
  if (tickCount > lifetimeTicks) return null; // 第 31 次 tick（age 30）完就移除
  const tickFrac = ticks - Math.floor(ticks);
  const state = (crit ? animTables.crit : animTables.normal)[tickCount];
  return {
    scale: state.prevScale + (state.scale - state.prevScale) * tickFrac,
    alpha: (state.prevAlpha + Math.floor(tickFrac * (state.alpha - state.prevAlpha))) / 255, // Mth.lerpInt
    rise: state.prevRise + (state.rise - state.prevRise) * tickFrac,
  };
};
// 一共显示多少秒（给编排、合成算帧范围用）
export const damageNumberDurationSec = lifetimeTicks / ticksPerSec;

// ---------- 原版默认字体（ascii.png） ----------
type Glyph = { width: number; dots: boolean[][] };
const glyphCache = new Map<string, Glyph>();
const getGlyph = (ch: string): Glyph => {
  let glyph = glyphCache.get(ch);
  if (glyph) return glyph;
  const tex = png(fontPng);
  const charCode = ch.charCodeAt(0);
  if (charCode > 255) throw new Error(`伤害数字只有 ascii.png 里的字：「${ch}」`);
  const cx = (charCode % 16) * 8;
  const cy = Math.floor(charCode / 16) * 8;
  const alphaAt = (x: number, y: number) => tex.px[((cy + y) * tex.w + cx + x) * 4 + 3];
  // BitmapProvider.getActualGlyphWidth：从右往左找第一列有不透明像素的
  let glyphWidth = 0;
  for (let x = 7; x >= 0 && !glyphWidth; x--) for (let y = 0; y < 8; y++) if (alphaAt(x, y)) { glyphWidth = x + 1; break; }
  const dots = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => alphaAt(x, y) > 0));
  glyph = { width: glyphWidth, dots: dots };
  glyphCache.set(ch, glyph);
  return glyph;
};

// 一串字在字体像素格子上的覆盖：字（加粗两遍）叠了几层、露出来的投影叠了几层。坐标从字串左上角起，x 往右、y 往下
const layoutText = (text: string) => {
  const textCells = new Map<string, number>();
  const shadowCells = new Map<string, number>();
  const addCell = (m: Map<string, number>, x: number, y: number) => m.set(`${x},${y}`, (m.get(`${x},${y}`) ?? 0) + 1);
  let x = 0;
  for (const ch of text) {
    const glyph = getGlyph(ch);
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        if (!glyph.dots[row][col]) continue;
        for (const boldOffset of [0, 1]) {
          addCell(textCells, x + col + boldOffset, row);
          addCell(shadowCells, x + col + boldOffset + 1, row + 1);
        }
      }
    x += glyph.width + 1 + 1; // 步进 = 字宽 + 1，加粗再 + 1
  }
  for (const k of textCells.keys()) shadowCells.delete(k); // 前面那遍字挡住的投影
  return { width: x, textCells: textCells, shadow: shadowCells };
};

// ---------- 在 3D 世界里的位置 ----------
// 伤害数字的锚点（three.js 世界坐标，Y 朝上）：实体脚底 + 碰撞箱高，三个轴各加 N(0, 0.1²) 的随机偏移（种子固定，每次渲染一样）
export const damageNumberAnchor = (feetPos: THREE.Vector3, hitboxHeight: number, seed: number) => {
  let rngState = seed >>> 0 || 1;
  const randUniform = () => {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randGaussian = () => Math.sqrt(-2 * Math.log(1 - randUniform())) * Math.cos(2 * Math.PI * randUniform());
  return new THREE.Vector3(feetPos.x + randGaussian() * 0.1, feetPos.y + hitboxHeight + randGaussian() * 0.1, feetPos.z + randGaussian() * 0.1);
};

// 和各镜头 Rig 一样的透视镜头：焦距按 36mm 横向画幅换算成竖向视角，up 朝 +Y、不滚转
export const makePerspectiveCamera = (focalMm: number, position: THREE.Vector3, target: THREE.Vector3, width: number, height: number) => {
  const cam = new THREE.PerspectiveCamera((2 * Math.atan(18 / focalMm / (width / height)) * 180) / Math.PI, width / height, 0.1, 1200);
  cam.position.copy(position);
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
};

export type DamageNumberItem = {
  damage: number;
  crit: boolean;
  anchor: THREE.Vector3; // 生成处（伤害数字锚）
  ticks: number; // 生成之后过了几刻（秒 × 20）
};

// 画一个伤害数字到 2D 画布上（ctx 的单位是画面像素 × 倍数）
const drawDamageNumber = (ctx: CanvasRenderingContext2D, cam: THREE.PerspectiveCamera, width: number, height: number, pixelRatio: number, item: DamageNumberItem) => {
  const anim = damageNumberAnim(item.ticks, item.crit);
  const text = damageText(item.damage);
  if (!anim || !text || anim.alpha < 0.1) return;
  // 视锥剔除：生成处 0.2 格见方的粒子碰撞箱整个在视锥外就不画
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const anchor = item.anchor;
  if (!frustum.intersectsBox(new THREE.Box3(new THREE.Vector3(anchor.x - 0.1, anchor.y, anchor.z - 0.1), new THREE.Vector3(anchor.x + 0.1, anchor.y + 0.2, anchor.z + 0.1)))) return;
  // 锚点（往上飘过以后）在镜头坐标里：镜头看 -Z，纵深 d
  const viewPos = new THREE.Vector3(anchor.x, anchor.y + anim.rise, anchor.z).applyMatrix4(cam.matrixWorldInverse);
  const depth = -viewPos.z;
  if (depth <= cam.near) return;
  const focalPx = height / 2 / Math.tan((cam.fov * Math.PI) / 360); // 画面像素的焦距
  const cx = (width / 2 + (viewPos.x / depth) * focalPx) * pixelRatio;
  const cy = (height / 2 - (viewPos.y / depth) * focalPx) * pixelRatio;
  const cellPx = ((anim.scale * focalPx) / depth) * pixelRatio; // 一个字体像素在画布上多大
  if (cellPx <= 0) return;
  const { width: textWidth, textCells: textCells, shadow: shadowCells } = layoutText(text);
  const x0 = -textWidth / 2;
  const color = item.crit ? damageNumberColors.crit : damageNumberColors.normal;
  const rgb = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const shadowRgb = rgb.map((c) => Math.floor(c * 0.25)); // Font 投影 dimFactor 0.25
  const α = Math.floor(anim.alpha * 255) / 255;
  const drawCells = (cells: Map<string, number>, fillRgb: number[]) => {
    for (const [k, layerCount] of cells) {
      const [x, y] = k.split(',').map(Number);
      // 最近邻：画面像素中心落在格子里才算，格子边按四舍五入对到像素
      const X0 = Math.round(cx + (x0 + x) * cellPx);
      const X1 = Math.round(cx + (x0 + x + 1) * cellPx);
      const Y0 = Math.round(cy + y * cellPx);
      const Y1 = Math.round(cy + (y + 1) * cellPx);
      if (X1 <= X0 || Y1 <= Y0) continue;
      ctx.fillStyle = `rgba(${fillRgb[0]},${fillRgb[1]},${fillRgb[2]},${1 - (1 - α) ** layerCount})`;
      ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    }
  };
  drawCells(shadowCells, shadowRgb);
  drawCells(textCells, rgb);
};

// 整个画面一层（透明底），只画伤害数字。相机用 透视镜头 建，和画面那个镜头同一组参数
export const DamageNumberLayer: React.FC<{ camera: THREE.PerspectiveCamera; width: number; height: number; numbers: DamageNumberItem[] }> = ({ camera, width: width, height: height, numbers: numbers }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  // 渲染时 --scale 就是 devicePixelRatio：画布按输出像素画，字的边对到输出的像素上（不是 1280×720 画好再放大）
  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const canvasWidth = Math.round(width * pixelRatio);
  const canvasHeight = Math.round(height * pixelRatio);
  useLayoutEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    for (const item of numbers) drawDamageNumber(ctx, camera, width, height, pixelRatio, item);
  });
  return <canvas ref={ref} width={canvasWidth} height={canvasHeight} style={{ position: 'absolute', left: 0, top: 0, width, height }} />;
};
