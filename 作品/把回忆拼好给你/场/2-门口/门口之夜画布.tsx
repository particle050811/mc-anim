// 第 9–11 句门这个机位的夜里（按歌曲帧画，三句一个镜头）：后面是夜空（地点/天空.tsx，月亮在左上）、星星（跟着天慢慢挪）、
// 屋后的远景（地点/屋后远景.tsx，同第 6–8 句那片地：起伏的地、樱花林、橡树，远处照原版的雾淡进夜空；不开云、不仰、不升，跟着正交那一层走）、烟花的闪光，
// 前面三渲二画布里小木屋（后墙挂着照片墙、门边没有箱子）、树苗、告示牌、你、她、烟花火箭和火花。烟花把近处照亮是演绎：平涂分三档（门口之夜参数.ts 的 亮档），树苗、牌子、你一组，门里的她一组，房子、地面、远景一组，各亮各的。
// 火花、火箭用原版贴图画成朝镜头的方片（不吃平涂），一个贴图像素取偶数个成片像素、中心吸到偶数像素上。闪光（原版 FLASH）画在天上那层，
// 不画平滑光晕：32×32 的光片按 N 的整数倍放大，透明度只留两档硬边（同美术定稿对太阳月亮的口径「最多一两圈硬边色阶」）。
// 捕获：给了 捕获，每帧三维画完以后把天、星星、远景、闪光、三维各层连同在画面上的位置按顺序交给它（第 11 句定格成照片、碎裂用，见 门口之夜照片.tsx）；
//   远景那块画布比画面高、不从画面顶边起，要按位置贴。
import { useFrame } from '@react-three/fiber';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { png } from '@engine/model/贴图.ts';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import { BlockAssembly } from '@engine/model/方块拼搭.tsx';
import { ToonCanvas, shadingScope } from '@engine/三渲二/画布.tsx';
import type { ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import { Outline } from '@engine/三渲二/描边.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { FlatShade } from '@engine/三渲二/平涂.tsx';
import { filmScale } from '@engine/三渲二/像素.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { ParticleQuads, particleTexture, type Particle } from '@库/特效/粒子面片.tsx';
import { rocketPos, fireworkDyeColors, fireworkSparks, fireworkFlash } from '@库/特效/烟花.ts';
import { fps } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第9至11句.ts';
import { sideRig, sideProjection } from '../../地点/侧剖面.tsx';
import { SideSectionSky } from '../../地点/天空.tsx';
import { Signboard } from '../../地点/告示牌.tsx';
import { SignPixelText } from '../../地点/告示牌字.tsx';
import { cherryTreeBlocks } from '../../地点/樱花树.ts';
import { photoWallCells } from '../../地点/照片墙格.ts';
import { BehindHouseVista } from '../../地点/屋后远景.tsx';
import { gridOrigin, entrance, EntranceCabin } from '../../地点/门口小木屋.tsx';
import { line8Photos } from '../../特效/照片画.ts';
import { outline as defaultOutline, pixelCount } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { skyColors, biome } from './参数.ts';
import { brightTier, brightTierRatio, nightShadingScene, nightTick, nightSkyArc, skyFraming, stars, fireworks, fireworkLightWhiteMix, signTextStyle, shotAt, shotFraming, type DoorNightShot } from './门口之夜参数.ts';
import { YouState, addWave, LiYingState, setupState, standRowY } from './门口之夜编排.ts';
import fireworkRocketPng from 'asset:贴图/物品/烟花火箭';
import cherrySaplingPng from 'asset:贴图/物品/樱花树苗';
import sparklePng from 'asset:贴图/粒子/闪光';
import spark0Png from 'asset:贴图/粒子/火花/0';
import spark1Png from 'asset:贴图/粒子/火花/1';
import spark2Png from 'asset:贴图/粒子/火花/2';
import spark3Png from 'asset:贴图/粒子/火花/3';
import spark4Png from 'asset:贴图/粒子/火花/4';
import spark5Png from 'asset:贴图/粒子/火花/5';
import spark6Png from 'asset:贴图/粒子/火花/6';
import spark7Png from 'asset:贴图/粒子/火花/7';

const night = palette.夜;
const heldImg = { 树苗: png(cherrySaplingPng), 烟花火箭: png(fireworkRocketPng) } as const;
const rocketImg = png(fireworkRocketPng);
const flashImg = png(sparklePng);

// 火花八张 8×8 拼成一条 64×8 的图集，第 n 张在 u ∈ [n/8, (n+1)/8)。材质包的高清火花（16×16）照样拼，图集 128×16；方片大小照原版 8 个像素算，不变
const sparkEdge = png(spark0Png).w;
const sparkAtlas = (() => {
  const sparkPngs = [spark0Png, spark1Png, spark2Png, spark3Png, spark4Png, spark5Png, spark6Png, spark7Png].map(png);
  const e = sparkEdge;
  const px = new Uint8Array(8 * e * e * 4);
  sparkPngs.forEach((p, n) => {
    if (p.w !== e || p.h !== e) throw new Error(`火花贴图 ${n} 不是 ${e}×${e}：${p.w}×${p.h}`);
    for (let y = 0; y < e; y++) px.set(p.px.subarray(y * e * 4, (y + 1) * e * 4), (y * 8 * e + n * e) * 4);
  });
  return px;
})();

// ---------- 颜色 ----------
const hexToRgb = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const toHex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
/** 这一组在这一档的平涂色调：夜色调往烟花色（掺白）走 比[档] */
const groupTone = (tier: 0 | 1 | 2, color: V3 | null, ratios: readonly number[]) => {
  const t0 = hexToRgb(night.tint);
  if (!color || tier === 0) return night.tint;
  const k = ratios[tier]!;
  return toHex(t0.map((v, i) => {
    const c = color[i]! + (1 - color[i]!) * fireworkLightWhiteMix;
    return v + (c - v) * k;
  }));
};

// ---------- 像素吸附 ----------
/** 场景点吸到镜头的偶数像素上：横 (x − 中心x)·16N、竖 (z + 斜·y − 中心z)·16N 都取偶数 */
const attractPoint = (j: DoorNightShot, p: V3): V3 => {
  const k = 16 * j.N;
  const oblique = j.topDepth / j.N;
  const roundToEven = (v: number) => 2 * Math.round(v / 2);
  const x = j.center[0] + roundToEven((p[0] - j.center[0]) * k) / k;
  const snappedZ = roundToEven((p[2] + oblique * p[1] - j.center[1]) * k) / k;
  return [x, p[1], snappedZ - oblique * p[1] + j.center[1]];
};
/** 方片一个贴图像素几个成片像素（偶数）→ 半边长（格）：贴图 边 个像素宽 */
const squareHalf = (j: DoorNightShot, origHalf: number, side: number) => {
  const pixelSize = 2 * Math.max(1, Math.round(((2 * origHalf * 16 * j.N) / side) / 2));
  return (pixelSize * side) / (2 * 16 * j.N);
};

// ---------- 烟花：火花、火箭 ----------
const FireworkSquare: React.FC<{ sec: number; shot: DoorNightShot; rocketColor: V3 }> = ({ sec: sec, shot, rocketColor }) => {
  const atlas = particleTexture(sparkAtlas, 8 * sparkEdge, sparkEdge, sparkAtlas);
  const rocketTexture = particleTexture(rocketImg.px, rocketImg.w, rocketImg.h, rocketImg);
  const sparks: Particle[] = [];
  const rockets: Particle[] = [];
  for (const firework of fireworks) {
    for (const h of fireworkSparks(firework, sec))
      sparks.push({ p: attractPoint(shot, h.p), half: squareHalf(shot, h.halfSize, 8), uv: [h.贴图 / 8, 0, (h.贴图 + 1) / 8, 1], color: h.色, alpha: h.alpha });
    const p = rocketPos(firework, sec);
    // 原版 GROUND 显示：半格见方的物品贴图，中心比实体高 0.125 格
    if (p) rockets.push({ p: attractPoint(shot, [p[0], p[1], p[2] + 0.125]), half: squareHalf(shot, 0.25, 16), uv: [0, 0, 1, 1], color: rocketColor });
  }
  return (
    <>
      <ParticleQuads tex={rocketTexture} items={rockets} />
      <ParticleQuads tex={atlas} items={sparks} translucent depthWrite={false} />
    </>
  );
};

// ---------- 2D 层：星星、闪光 ----------
const toFinalWidth = (width: number) => width * filmScale;

/** 星星：一张 W×H 的循环图（确定性随机），跟着天挪（偏 = 天取景 的中心比开场那一镜挪了多少成片像素），躲开月亮那一块（开场那一镜里月亮的位置；月亮跟着天走，
 *  到第 12 句只往西挪不到 80 像素） */
const StarLayer: React.FC<{ width: number; height: number; offset: { x: number; y: number }; month: { x: number; y: number } }> = ({ width: width, height: height, offset, month: moonPos }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = toFinalWidth(width), H = toFinalWidth(height);
  const starImg = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    let s = stars.seed >>> 0;
    const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    let placed = 0;
    for (let attempt = 0; placed < stars.starCount && attempt < stars.starCount * 20; attempt++) {
      const x = 2 * Math.floor((r() * W) / 2);
      const y = 2 * Math.floor((r() * H) / 2);
      const starSize = r() < 0.5 ? stars.starSize[0] : stars.starSize[1];
      const a = stars.brightRange[0] + r() * (stars.brightRange[1] - stars.brightRange[0]);
      if (Math.abs(x - moonPos.x) < 260 && Math.abs(y - moonPos.y) < 260) continue;
      ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
      ctx.fillRect(x, y, starSize, starSize);
      placed++;
    }
    return c;
  }, [W, H, moonPos.x, moonPos.y]);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // 偏移吸到偶数像素、按图的宽高取模，四张拼满
    const wrap = (v: number, m: number) => ((2 * Math.round(v / 2)) % m + m) % m;
    const ox = wrap(-offset.x, W), oy = wrap(offset.y, H);
    for (const dx of [ox - W, ox]) for (const dy of [oy - H, oy]) ctx.drawImage(starImg, dx, dy);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};

/** 闪光透明度只留两档硬边：原版透明度（光片 alpha × 0.6～0.725）过 门[i] 就画 值[i]，低于 0.3 的外圈整片不画。
 *  原来按 0.18 一档切，三圈加一个亮心，手机上一眼是一团圆形光晕（核查 10-24）。值 Agent 暂定 */
const flashTier = { 门: [0.5, 0.3], value: [0.34, 0.17] } as const;
const SparkleLayer: React.FC<{ width: number; height: number; sec: number; shot: DoorNightShot }> = ({ width: width, height: height, sec: sec, shot }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = toFinalWidth(width), H = toFinalWidth(height);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const firework of fireworks) {
      const g = fireworkFlash(firework, sec);
      if (!g) continue;
      // 原版 OverlayParticle：边长 7.1·sin((age + pt − 1)·π/4)、alpha 0.6 − (age + pt − 1)·0.125
      const q = g.刻 - 1;
      const halfWidth = Math.abs(7.1 * Math.sin((q * Math.PI) / 4));
      const alpha = 0.6 - q * 0.125;
      // 一个光片像素几个成片像素：N 的整数倍（原版 32×32 的光片；材质包的高清光片是它的 倍 倍，一个像素 格 ÷ 倍）
      const pixelScale = flashImg.w / 32;
      const cellSize = (Math.max(1, Math.round(halfWidth)) * shot.N) / pixelScale;
      const screenCenter = attractPoint(shot, g.心);
      const k = 16 * shot.N;
      const cx = W / 2 + (screenCenter[0] - shot.center[0]) * k;
      const cy = H / 2 - (screenCenter[2] + (shot.topDepth / shot.N) * screenCenter[1] - shot.center[1]) * k;
      const [r, gg, b] = g.色.map((v) => Math.round(v * 255));
      for (let y = 0; y < flashImg.h; y++)
        for (let x = 0; x < flashImg.w; x++) {
          const a = (flashImg.px[(y * flashImg.w + x) * 4 + 3]! / 255) * alpha;
          const tier = a >= flashTier.门[0] ? flashTier.value[0] : a >= flashTier.门[1] ? flashTier.value[1] : 0;
          if (tier <= 0) continue;
          ctx.fillStyle = `rgba(${r}, ${gg}, ${b}, ${tier.toFixed(3)})`;
          ctx.fillRect(Math.round(cx + (x - flashImg.w / 2) * cellSize), Math.round(cy + (y - flashImg.h / 2) * cellSize), cellSize, cellSize);
        }
    }
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};

// ---------- 捕获 ----------
/** 交出去的一层：画布和它在画面上的位置（占整个画面宽高的比例，左上角起） */
export type CaptureLayer = { image: HTMLCanvasElement; left: number; 上: number; width: number; height: number };
const LayerCapturer: React.FC<{ layers: React.RefObject<HTMLDivElement | null>; onCapture: (layers: readonly CaptureLayer[]) => void }> = ({ layers: layerRef, onCapture }) => {
  // 优先级 2：在 描边渲染（优先级 1，接管画布的渲染，描边关着也是它画）之后，这一帧的三维已经在画布上。
  // 位置用 getBoundingClientRect 量、除以外框：渲染时整页有缩放，比例不受影响
  useFrame(({ gl }) => {
    const snapshot = layerRef.current;
    if (!snapshot) return;
    const R = snapshot.getBoundingClientRect();
    const baseCanvases = [...snapshot.querySelectorAll('canvas')].filter((c) => c !== gl.domElement);
    onCapture([...baseCanvases, gl.domElement].map((canvasImg) => {
      const r = canvasImg.getBoundingClientRect();
      return { image: canvasImg, left: (r.left - R.left) / R.width, 上: (r.top - R.top) / R.height, width: r.width / R.width, height: r.height / R.height };
    }));
  }, 2);
  return null;
};

// ---------- 画布 ----------
export type DoorNightCanvasProps = {
  /** 歌曲帧 */
  frame: number;
  /** 同一段时间线上的上一帧（歌曲帧；段首那一帧不给），给屋后远景算画布高（见 地点/屋后远景.tsx 的 前取景）。原来是 1/24 秒以前（24 fps 时的上一帧），用户 11-03「统统改成 60 帧」 */
  prevFrame?: number;
  width?: number;
  height?: number;
  /** 每帧画完把各层（天、星星、远景、闪光、三维）连同位置交出来 */
  capture?: (layers: readonly CaptureLayer[]) => void;
  style?: React.CSSProperties;
  /** 光影的样式（段里传 默认.ts 的 光影段[段键]）：屋后远景和前面的三维一起开；不给 = 不开。夜里的时段按平涂色调认，月光方向见 夜光影场 */
  shading?: ShadingOptions | null;
};

export const DoorNightCanvas: React.FC<DoorNightCanvasProps> = ({ frame: frame, prevFrame, width: width = 1280, height: height = 720, capture, style, shading }) => {
  const sec = frame / fps;
  const shot = shotAt(frame);
  const framing = shotFraming(shot);
  const layerRef = useRef<HTMLDivElement>(null);
  const { 档: tier, 发: firework } = brightTier(sec);
  // 照亮的颜色取这一发的第一种颜色（同原版闪光）
  const lightColor = firework ? hexToRgb(`#${fireworkDyeColors[firework.fireworkColors[0]!].toString(16).padStart(6, '0')}`) : null;
  const near = groupTone(tier, lightColor, brightTierRatio.near);
  const herTone = groupTone(tier, lightColor, brightTierRatio.liYingBright);
  const far = groupTone(tier, lightColor, brightTierRatio.far);
  const you = YouState(frame);
  const liYing = LiYingState(frame);
  const placement = setupState(frame);
  const sky = skyFraming(shot);
  const openingSky = skyFraming(shotAt(mainCutEvents.nightfall.frame));
  const moonPos = sideProjection(openingSky, width, height)(nightSkyArc.心[0], nightSkyArc.心[1] + nightSkyArc.radius);
  const saplingBlocks = useMemo(() => cherryTreeBlocks(false, [entrance.saplingPos[0], 1, 0]), []);
  const photoWall = useMemo(() => photoWallCells(line8Photos), []);
  const youPose = addWave({ ...stevePose([you.x, standRowY, 0], you.yaw, { headPitch: you.headPitch, holdR: !!you.held }), armRRoll: 0, armLRoll: 0 }, you.wave);
  const liYingLoc: V3 = [liYing.x, standRowY, 0];
  return (
    <shadingScope.Provider value={{ shading, shadingScene: nightShadingScene }}>
      <div style={{ position: 'relative', width: width, height: height, overflow: 'hidden', ...style }}>
        <div ref={layerRef} style={{ position: 'absolute', inset: 0 }}>
          <SideSectionSky framing={sky} width={width} height={height} 色={skyColors} 刻={nightTick(sec)} arc={nightSkyArc} />
          <StarLayer
            width={width}
            height={height}
            offset={{ x: (sky.center[0] - openingSky.center[0]) * sky.pxPerCell, y: (sky.center[1] - openingSky.center[1]) * sky.pxPerCell }}
            month={{ x: moonPos.x * filmScale, y: moonPos.y * filmScale }}
          />
          {/* 远景的色调同房子、地面那一组（烟花亮的时候一起亮一点）；明暗幅度同 侧剖面天空 的默认。
              远景按这一帧的取景跟着正交那一层走（推到牌子上时林子跟着放大，近处的地才接得上屋前的草地；给 天取景 试过，特写里林子底下露出天）。
              雾按这一帧的取景找背后那一行天色，天却按 天取景 画，两边差一截：雾淡完的远处（172 格外）在这三句里不是在画外就是被近处的林子、房子挡着，看不出 */}
          <BehindHouseVista framing={framing} frontFraming={shotFraming(shotAt(prevFrame ?? frame))} width={width} height={height} topDepth={shot.topDepth} tint={far} skyColors={skyColors} 刻={nightTick(sec)} lightDarkAmp={1} />
          {/* 闪光在远景前面：原版 FLASH 是炸点上的粒子，比屋后的地近 */}
          <SparkleLayer width={width} height={height} sec={sec} shot={shot} />
          <ToonCanvas
            width={width}
            height={height}
            cameraRig={sideRig(framing, shot.topDepth)}
            tint={far}
            outline={defaultOutline.开 ? { width: (shot.N * defaultOutline.width) / pixelCount, 色: night.outlineColor } : false}
            style={{ position: 'absolute', left: 0, top: 0 }}
          >
            {/* 照片墙一格 64 个地图像素：镜头停下来的 N（16、84、12）都是 4 的倍数，一个地图像素是整数个成片像素 */}
            <EntranceCabin doorOpen biome={biome} photoWall={photoWall} photoWallEdge={64} />
            <FlatShade tint={near}>
              {placement.saplingPlaced && <BlockAssembly blocks={saplingBlocks} origin={gridOrigin} biome={biome} frontPlants />}
              <Signboard 位={entrance.signboardPos}>
                <SignPixelText lines={placement.signLines} {...signTextStyle} />
              </Signboard>
              {/* 描边组跟着 画风.ts 的 描边.开 走（全片不描边，用户 10-24 定），留着组是为了开关只改一处 */}
              <Outline>
                <TexturePixelAlign 锚={youPose.loc as V3}>
                  <Steve pose={youPose} handR={you.held ? <ItemSprite layers={[{ tex: heldImg[you.held] }]} emissive={0} shadow={false} /> : undefined} />
                </TexturePixelAlign>
              </Outline>
            </FlatShade>
            <FlatShade tint={herTone}>
              <Outline>
                <TexturePixelAlign 锚={liYingLoc}>
                  <MagicalWineFoxEx
                    pose={{ ...standPose(liYingLoc), yaw: 180 }}
                    stancePose="站"
                    expression={liYing.expression}
                    skeleton={{ Head: { rot: [-liYing.头[0], -liYing.头[1], liYing.头[2]] } }}
                    blink={liYing.blink}
                    sec={sec}
                    backStaff={false}
                  />
                </TexturePixelAlign>
              </Outline>
            </FlatShade>
            <FireworkSquare sec={sec} shot={shot} rocketColor={hexToRgb(far)} />
            {capture && <LayerCapturer layers={layerRef} onCapture={capture} />}
          </ToonCanvas>
        </div>
      </div>
    </shadingScope.Provider>
  );
};
