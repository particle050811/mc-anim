// 体素地形里会动的方块贴图（火这类）：方块表图集每张贴图只放第一帧（真实方块图集.ts），会动的整条竖条另放一张小图集，着色器按游戏刻换帧。
// 用户 11-19「近处的火居然不会烧动，应该像灵魂火那样会烧动」。作品自己开（useBlockTextureAnimation，在体素世界外面调），开哪几张也由作品给；
// 没开的页面体素着色器源码、程序键都和以前一样（同 光体着色.ts 的开法），别的作品画面不变。
// 帧号在 JS 里算好、每帧传一个 uniform 数组（一页一个游戏刻），着色器只按贴图号查这张贴图在小图集的哪一行。
// 只换颜色：镂空按透明度丢像素、高光压花纹、远处并色都照取到的那一帧算；粗级合并、阴影的深度材质不管（远处看不出火动）。
import * as THREE from 'three';
import { png } from '../model/贴图.ts';
import { blockAtlas, buildMips } from './真实方块图集.ts';
import { textureNames } from './真实方块表.ts';

export type AnimatedBlockTexture = {
  /** 方块表里的贴图名（minecraft:block/fire_0） */
  name: string;
  /** 整条竖条（宽 × 宽·帧数）的 png 资产 */
  strip: string;
  /** 照 .png.mcmeta：帧序（不写 = 0…帧数−1）、每帧几刻（不写 = 1） */
  frames?: readonly number[];
  frametime?: number;
};

type Built = { atlas: THREE.DataTexture; rows: number; cols: number; layers: number[]; schedule: { frames: number[]; frametime: number }[] };
let built: Built | null = null;
let builtKey = '';
let on = false;

const MAX = 8; // 着色器里帧号数组的长度：一部作品开不了几张
export const textureAnimationUniforms = { animAtlas: { value: null as THREE.DataTexture | null }, animFrame: { value: new Array<number>(MAX).fill(0) } };

const build = (list: readonly AnimatedBlockTexture[]): Built => {
  if (list.length > MAX) throw new Error(`贴图动画最多 ${MAX} 张，给了 ${list.length} 张`);
  const { cell } = blockAtlas();
  // 方块表里没有的贴图没有面用它（如 fire_1：方块表导火的模型只导到了用 fire_0 的变体），跳过
  const strips = list.filter((a) => textureNames.includes(a.name)).map((a) => {
    const layer = textureNames.indexOf(a.name);
    const img = png(a.strip);
    if (img.h % img.w !== 0 || cell % img.w !== 0) throw new Error(`贴图动画「${a.name}」：竖条 ${img.w}×${img.h}，要是整帧、宽能整除图集格 ${cell}`);
    const count = img.h / img.w;
    const frames = a.frames ? [...a.frames] : Array.from({ length: count }, (_, i) => i);
    if (frames.some((f) => f < 0 || f >= count)) throw new Error(`贴图动画「${a.name}」：帧序里有超出 ${count} 帧的`);
    return { layer, img, count, frames, frametime: a.frametime ?? 1 };
  });
  if (!strips.length) throw new Error(`贴图动画：${list.map((a) => a.name).join('、')} 方块表里一张都没有`);
  const cols = Math.max(...strips.map((s) => s.count));
  const rows = strips.length;
  const levels = Array.from({ length: Math.log2(cell) + 1 }, (_, k) => {
    const cellPx = cell >> k;
    return { width: cols * cellPx, height: rows * cellPx, data: new Uint8Array(cols * cellPx * rows * cellPx * 4) };
  });
  strips.forEach((s, row) => {
    const scale = cell / s.img.w; // 图集格比竖条宽（高清材质包覆盖层）时最近邻放大，同 材质包.ts
    for (let frame = 0; frame < s.count; frame++) {
      const px = new Uint8Array(cell * cell * 4);
      for (let y = 0; y < cell; y++)
        for (let x = 0; x < cell; x++) {
          const src = ((frame * s.img.w + Math.floor(y / scale)) * s.img.w + Math.floor(x / scale)) * 4;
          px.set(s.img.px.subarray(src, src + 4), (y * cell + x) * 4);
        }
      buildMips(px, false, cell).forEach((mip, k) => {
        const cellPx = cell >> k;
        const level = levels[k]!;
        for (let y = 0; y < cellPx; y++) level.data.set(mip.subarray(y * cellPx * 4, (y + 1) * cellPx * 4), ((row * cellPx + y) * level.width + frame * cellPx) * 4);
      });
    }
  });
  const t = new THREE.DataTexture(levels[0]!.data, levels[0]!.width, levels[0]!.height, THREE.RGBAFormat);
  t.mipmaps = levels as unknown as THREE.DataTexture['mipmaps'];
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return { atlas: t, rows, cols, layers: strips.map((s) => s.layer), schedule: strips.map((s) => ({ frames: s.frames, frametime: s.frametime })) };
};

// 登记过的材质（开关、换表时要重编）：体素材质自己登记
const registered = new Set<THREE.Material>();
export const registerTextureAnimationMaterial = (m: THREE.Material) => {
  registered.add(m);
};
export const textureAnimationOn = () => on;
/** 程序键后缀：关着是空串（键和没有贴图动画时一样） */
export const textureAnimationKey = () => (on ? `|贴图动画${builtKey}` : '');

/**
 * 着色器里取方块贴图的函数：开着时把 fragMap 里取本面贴图的 textureLod(blockAtlas, auv, …) 换成它（贴图号是动的就去小图集取当前帧）。
 * 只在开着时编进去
 */
export const textureAnimationGlsl = () => {
  const b = built!;
  const rowOf = b.layers.map((layer, row) => `  if (abs(layer - ${layer}.0) < 0.5) row = ${row};`).join('\n');
  return `
uniform sampler2D animAtlas;
uniform float animFrame[${MAX}];
vec4 sampleBlockTex(float layer, vec2 f, vec2 auv, float lod) {
  layer = floor(layer + 0.5);
  int row = -1;
${rowOf}
  if (row < 0) return textureLod(blockAtlas, auv, lod);
  return textureLod(animAtlas, (vec2(animFrame[row], float(row)) + f) / vec2(${b.cols}.0, ${b.rows}.0), lod);
}`;
};
/** onBeforeCompile 里调（只在开着时）：挂 uniform、把本面贴图的取样换成会动的 */
export const patchTextureAnimation = (sh: THREE.WebGLProgramParametersWithUniforms) => {
  // 派生材质（真下界的熔岩材质这类）会先跑原材质的 onBeforeCompile，已经换过的不再换
  if (sh.fragmentShader.includes('vec4 sampleBlockTex(')) return;
  Object.assign(sh.uniforms, textureAnimationUniforms);
  const before = sh.fragmentShader;
  // 先换取样、再插函数：函数里自己那句 textureLod(blockAtlas, auv, …) 不能也被换掉
  sh.fragmentShader = sh.fragmentShader.split('textureLod(blockAtlas, auv, ').join('sampleBlockTex(layer, f, auv, ').replace('void main() {', `${textureAnimationGlsl()}\nvoid main() {`);
  if (!sh.fragmentShader.includes('sampleBlockTex(layer, f, auv, ') || sh.fragmentShader === before) throw new Error('贴图动画：体素着色器里没有 textureLod(blockAtlas, auv, …)，接不上（材质.ts 的 fragMap 改过？）');
};

/** 第 tick 个游戏刻这张贴图显示竖条里的第几帧（同原版 SpriteContents.AnimatedTexture：每帧停 frametime 刻，按帧序循环） */
export const frameAtTick = (frames: readonly number[], frametime: number, tick: number) => frames[Math.floor(tick / frametime) % frames.length]!;

/**
 * 作品里调（每帧，在体素世界旁边）：开贴图动画、这一帧走到第几个游戏刻（游戏刻 = 秒 × 20 取整）。list 要是模块级常量（换了会重建小图集、重编着色器）
 */
export const useBlockTextureAnimation = (list: readonly AnimatedBlockTexture[], sec: number) => {
  const key = list.map((a) => `${a.name}:${a.frametime ?? 1}:${(a.frames ?? []).join(',')}`).join(';');
  if (!built || key !== builtKey) {
    built = build(list);
    builtKey = key;
    textureAnimationUniforms.animAtlas.value = built.atlas;
    for (const m of registered) m.needsUpdate = true;
  }
  if (!on) {
    on = true;
    for (const m of registered) m.needsUpdate = true;
  }
  const tick = Math.floor(sec * 20);
  built.schedule.forEach((s, row) => (textureAnimationUniforms.animFrame.value[row] = frameAtTick(s.frames, s.frametime, tick)));
};
