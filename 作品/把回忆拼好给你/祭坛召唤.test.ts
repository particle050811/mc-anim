import { describe, expect, it, vi } from 'vitest';
import type { AssetCue } from '@engine/段/段定义.ts';
import { heartStateAt, tamingHearts } from '@库/特效/爱心粒子.tsx';
import seg from './段/2-祭坛召唤/段.ts';
import { mainCutEvents, SegmentWindow, lineAt, fps, legacyFrameSec } from './分镜.ts';
import * as params from './场/2-祭坛/参数.ts';
import { events, frameToTick, youEyePos, keyRigs, CharArrange, HandItem, waveProgress, lastFrame, segWindow, shotAt, floatStates, lightPillar, cakeGoneFrame, turnHeadStartSec } from './场/2-祭坛/编排.ts';
import { groundHeight } from './场/2-祭坛/地形.ts';
import { liYingFinal, endRig, finalDist, finalSpeed, eyeBall } from './场/2-祭坛/末态.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

// 爱心粒子.tsx 顶上就解码贴图（打包时才有 asset:），这里只要它的出生和运动，换成一张 1×1 的 RGBA
vi.mock('asset:贴图/特效/爱心粒子', () => ({
  default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
}));

type Vec3 = [number, number, number];
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 点到轴对齐盒子的最近距离 */
const distToBox = (p: readonly number[], lo: Vec3, hi: Vec3) => Math.hypot(...[0, 1, 2].map((i) => Math.max(lo[i]! - p[i]!, 0, p[i]! - hi[i]!)));
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unitVec = (a: readonly number[]): Vec3 => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

/** 页面（1280×720）上的投影：x、y、深度、这个深度上一格多少页面像素 */
const pageWidth = 1280;
const pageHeight = 720;
const project = (g: number, p: readonly number[]) => {
  const c = shotAt(g);
  const f = unitVec(sub(c.看, c.眼));
  const r = unitVec(cross(f, [0, 0, 1]));
  const u = cross(r, f);
  const d = sub(p, c.眼);
  const z = dot(d, f);
  const pixelPerUnit = pageHeight / 2 / (z * Math.tan(((c.fov / 2) * Math.PI) / 180));
  return { x: pageWidth / 2 + dot(d, r) * pixelPerUnit, y: pageHeight / 2 - dot(d, u) * pixelPerUnit, z, pixelPerUnit };
};
const inPicture = (p: { x: number; y: number; z: number }) => p.z > 0.05 && p.x >= 0 && p.x <= pageWidth && p.y >= 0 && p.y <= pageHeight;
/** 线段 a→b 穿不穿过轴对齐盒子（slab 法，两头各让 1e-6） */
const throughBox = (a: readonly number[], b: readonly number[], lo: Vec3, hi: Vec3) => {
  let t0 = 1e-6;
  let t1 = 1 - 1e-6;
  for (let i = 0; i < 3; i++) {
    const d = b[i]! - a[i]!;
    if (Math.abs(d) < 1e-12) {
      if (a[i]! < lo[i]! || a[i]! > hi[i]!) return false;
      continue;
    }
    let u = (lo[i]! - a[i]!) / d;
    let v = (hi[i]! - a[i]!) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
};
/** 六根柱子（截面 17 像素见方，3 格高） */
const pillarHalf = 17 / 32;
const pillarBoxes = params.pillarTopMaterials.map(({ pillarPos: [x, y] }) => [[x - pillarHalf, y - pillarHalf, 0], [x + pillarHalf, y + pillarHalf, 3]] as [Vec3, Vec3]);
/** 从这一帧的镜头看过去，这一点在画里、没被柱子挡住 */
const isVisible = (g: number, p: Vec3) => inPicture(project(g, p)) && pillarBoxes.every(([lo, hi]) => !throughBox(shotAt(g).眼, p, lo, hi));
/** 镜头的仰角（度） */
const elevationAt = (g: number) => {
  const c = shotAt(g);
  const f = unitVec(sub(c.看, c.眼));
  return (Math.asin(f[2]) * 180) / Math.PI;
};
/** 离她右眼眼珠多远的对数 */
const L = (g: number) => Math.log(distance(shotAt(g).眼, eyeBall.rightEye));
/** 24 fps 时离段首 n 帧那一刻，换成现在的歌曲帧（取整） */
const fromSegStart = (n: number) => segWindow.起帧 + Math.round(legacyFrameSec(n) * fps);
const songFrames = (a: number, b: number, stride = 1) => Array.from({ length: Math.floor((b - a) / stride) + 1 }, (_, i) => a + i * stride);

describe('2-祭坛召唤：第 3 句（祭坛的远景贴地升起，「光」那一拍切近景，推到右眼）', () => {
  it('窗口从第 3 句首字到第 4 句首字（歌曲帧 503～708）', () => {
    const w = SegmentWindow('2-祭坛召唤');
    expect([w.起帧, w.止帧]).toEqual([503, 708]);
    expect(w.起帧 / fps).toBeCloseTo(lineAt(3).起, 1);
    expect(w.止帧 / fps).toBeCloseTo(lineAt(4).起, 1);
    expect(frameCountOf(seg)).toBe(205);
    expect(sceneWindowFrames(seg)).toEqual({ 起帧: 503, 止帧: 708 });
    expect(lastFrame).toBe(707);
  });

  it('拍：点祭坛 9.48，现身 9.91，光 10.33（切），递蛋糕 10.76，推眼睛 11.19（差不到半帧）；远景先立住地方一秒多，每个动作至少隔 0.4 秒；只切一刀，两边各 1.4 秒以上', () => {
    const expected = [
      [mainCutEvents.第3句点祭坛, 9.48], [mainCutEvents.第3句现身, 9.91], [mainCutEvents.第3句光, 10.33], [mainCutEvents.第3句递蛋糕, 10.76], [mainCutEvents.第3句推眼睛, 11.19],
    ] as const;
    for (const [e, sec] of expected) expect(Math.abs(e.秒 - sec)).toBeLessThan(0.5 / fps + 0.01);
    expect(events.cutFrame).toBe(mainCutEvents.第3句光.帧);
    const order = [segWindow.起帧, events.tapAltar, events.appear, events.cutFrame, events.handOffFrame, events.photo, events.pushInEye, lastFrame];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect((events.tapAltar - segWindow.起帧) / fps).toBeGreaterThan(1);
    for (const [a, b] of [[events.tapAltar, events.appear], [events.appear, events.cutFrame], [events.cutFrame, events.handOffFrame], [events.handOffFrame, events.pushInEye], [events.pushInEye, lastFrame]] as const) expect((b - a) / fps).toBeGreaterThan(0.4);
    expect((events.cutFrame - segWindow.起帧) / fps).toBeGreaterThan(1.4);
    expect((lastFrame + 1 - events.cutFrame) / fps).toBeGreaterThan(1.4);
  });

  it('照片那一帧：在递蛋糕和推眼睛之间，手里的蛋糕还在、她已经笑了', () => {
    expect(events.photo).toBeGreaterThan(events.handOffFrame);
    expect(events.photo).toBeLessThan(events.pushInEye);
    expect(HandItem(events.photo)).toBe('蛋糕');
    expect(CharArrange(events.photo)).toEqual({ 转: 0, expression: '微笑' });
  });

  it('没有蛋糕盒（用户 10-24「这里拆盒过程就多余了」）：材料在柱顶 → 点祭坛变白 → 化光飞到圈心，她现身那一帧光汇齐、她直接站在光里', () => {
    expect(floatStates(events.tapAltar - 1).every((s) => s.kind === '物')).toBe(true);
    expect(floatStates(events.tapAltar).every((s) => s.kind === '亮')).toBe(true);
    expect(floatStates(events.tapAltar + Math.round(params.lightMelt.brightSec * fps)).every((s) => s.kind === '光')).toBe(true);
    expect(floatStates(events.appear)).toEqual([]);
    expect(CharArrange(events.appear - 1)).toBeNull();
    expect(CharArrange(events.appear)).toEqual({ 转: 0, expression: '无' });
    expect(CharArrange(lastFrame)).toEqual({ 转: 1, expression: liYingFinal.expression });
    expect(params.liYing.feet).toEqual(liYingFinal.feet);
    expect(params.liYing.facing).toBe(liYingFinal.facing);
  });

  it('你：远景里拿御币，切到近景已经拿着蛋糕（换东西在那一刀里），递出去以后蛋糕、爱心、她笑同框留半秒，她再转头；点祭坛、递蛋糕两下右键各挥一次手', () => {
    expect(HandItem(segWindow.起帧)).toBe('御币');
    expect(HandItem(events.cutFrame - 1)).toBe('御币');
    expect(HandItem(events.cutFrame)).toBe('蛋糕');
    expect(HandItem(events.handOffFrame)).toBe('蛋糕');
    expect(HandItem(cakeGoneFrame - 1)).toBe('蛋糕');
    expect(HandItem(cakeGoneFrame)).toBeNull();
    expect(HandItem(lastFrame)).toBeNull();
    expect((cakeGoneFrame - events.handOffFrame) / fps - params.smileStartSec).toBeGreaterThanOrEqual(0.5);
    expect(turnHeadStartSec - events.handOffFrame / fps).toBeGreaterThanOrEqual(0.5);
    for (let g = events.appear; g / fps < turnHeadStartSec; g++) expect(CharArrange(g)!.转).toBe(0);
    expect(turnHeadStartSec + params.turnHeadSec).toBeLessThan(lastFrame / fps);
    for (const c of [events.tapAltar, events.handOffFrame]) {
      expect(waveProgress(c - 1)).toBeNull();
      expect(waveProgress(c)).toBe(0);
    }
    expect(waveProgress(events.appear)).toBeNull();
  });

  it('够得着：你的眼睛离她的碰撞箱在 3 格内（原版生存模式实体交互距离）', () => {
    const [hx, hy] = params.liYing.feet;
    const w = params.hearts.宽 / 2;
    expect(distToBox(youEyePos, [hx - w, hy - w, 0], [hx + w, hy + w, params.hearts.高])).toBeLessThan(3);
  });

  it('背景不是超平坦：远景看得到的那片地（祭坛北边、东西两边）高低差好几格；祭坛脚下压平', () => {
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let x = -40; x <= 40; x += 2)
      for (let y = 8; y <= 70; y += 2) {
        const h = groundHeight(x, y);
        minHeight = Math.min(minHeight, h);
        maxHeight = Math.max(maxHeight, h);
      }
    expect(maxHeight - minHeight).toBeGreaterThanOrEqual(6);
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) expect(Math.abs(groundHeight(x, y))).toBe(0);
  });

  it('段首切过来就是祭坛（核查 10-24：洞底仰看只来得及三帧，删了）：镜头在地面上、平看着，圈心、两根前柱子一直在画里到切，头半秒鸟居也整个在画里', () => {
    for (let g = segWindow.起帧; g < events.cutFrame; g++) {
      expect(shotAt(g).眼[2], `歌曲帧 ${g}`).toBeGreaterThan(1.62);
      expect(elevationAt(g), `歌曲帧 ${g}`).toBeLessThanOrEqual(0.5);
      expect(inPicture(project(g, [0, 0, 0.05])), `歌曲帧 ${g} 圈心`).toBe(true);
      for (const x of [-1.5, 1.5]) expect(inPicture(project(g, [x, -3.5, 3])), `歌曲帧 ${g} 前柱顶 ${x}`).toBe(true);
    }
    // 头半秒鸟居整个在画里（认得出是祭坛），往下俯以后鸟居顶出画
    for (let g = segWindow.起帧; g < segWindow.起帧 + fps / 2; g++) expect(inPicture(project(g, [0, 3.5, 5.9])), `歌曲帧 ${g} 鸟居顶`).toBe(true);
  });

  it('远景看得懂因果（核查 10-24）：点祭坛起你一直露在两根前柱子中间，光柱罩下来、她出现都在远景里，切之前光柱亮着、她站着都有 5/24 秒以上', () => {
    const farStart = fromSegStart(22);
    expect(farStart).toBeLessThan(events.tapAltar);
    // 祭坛立住以后往下俯着看圈里
    for (let g = farStart; g < events.cutFrame; g++) expect(elevationAt(g)).toBeLessThan(0);
    for (let g = events.tapAltar; g < events.cutFrame; g++) {
      expect(isVisible(g, youEyePos), `歌曲帧 ${g} 你的头`).toBe(true);
      expect(isVisible(g, [params.you.feet[0], params.you.feet[1], 0.9]), `歌曲帧 ${g} 你的身子`).toBe(true);
      expect(isVisible(g, [0, 0, 0.05]), `歌曲帧 ${g} 圈心`).toBe(true);
    }
    for (let g = events.appear; g < events.cutFrame; g++) expect(isVisible(g, [0, -0.03, 1.24]), `歌曲帧 ${g} 她的脸`).toBe(true);
    let beamFrameCount = 0;
    for (let g = segWindow.起帧; g < events.cutFrame; g++) if (lightPillar(g).length > 0) beamFrameCount++;
    expect(beamFrameCount / fps).toBeGreaterThanOrEqual(legacyFrameSec(5));
    expect((events.cutFrame - events.appear) / fps).toBeGreaterThanOrEqual(legacyFrameSec(5));
  });

  it('镜头：近景各关键机位按拍落定；「光」那一帧切（远景 → 近景），末帧落在 末态.ts 的 末机', () => {
    const keys = keyRigs();
    expect(keys.map((k) => k.帧)).toEqual([events.cutFrame, events.handOffFrame, events.pushInEye, lastFrame]);
    for (const k of keys) {
      const c = shotAt(k.帧);
      expect(distance(c.眼, k.眼)).toBeLessThan(1e-9);
      expect(distance(c.看, k.看)).toBeLessThan(1e-9);
      expect(c.fov).toBeCloseTo(k.fov, 9);
    }
    const endState = shotAt(lastFrame);
    expect(distance(endState.眼, endRig.眼)).toBeLessThan(1e-9);
    expect(distance(endState.看, endRig.看)).toBeLessThan(1e-9);
    expect(endState.fov).toBeCloseTo(endRig.fov, 9);
    expect(distance(endState.眼, eyeBall.rightEye)).toBeCloseTo(finalDist, 9);
    // 切：两个镜头隔着好几格（是切，不是一帧里甩过去）
    expect(distance(shotAt(events.cutFrame - 1).眼, shotAt(events.cutFrame).眼)).toBeGreaterThan(5);
  });

  it('镜头不赶（规矩 看得懂的速度）：段首升起那一下每 1/24 秒不过 0.45 格、摇不过 8°；祭坛立住以后远景、近景各自一共走不到 2.5 格，每 1/24 秒不过 0.12 格；视角只收不放', () => {
    /** 一帧走的折成每 1/24 秒（24 fps 时的一帧）走多少 */
    const oldFrameLen = fps * legacyFrameSec(1);
    const walkFrames = (a: number, b: number, perOldFrame: number) => {
      let total = 0;
      for (let g = a; g < b; g++) {
        const d = distance(shotAt(g + 1).眼, shotAt(g).眼);
        expect(d * oldFrameLen, `歌曲帧 ${g}`).toBeLessThan(perOldFrame);
        expect(Math.abs(elevationAt(g + 1) - elevationAt(g)) * oldFrameLen, `歌曲帧 ${g}`).toBeLessThan(8);
        expect(shotAt(g + 1).fov).toBeLessThanOrEqual(shotAt(g).fov + 1e-9);
        total += d;
      }
      return total;
    };
    walkFrames(segWindow.起帧, fromSegStart(22), 0.45);
    expect(walkFrames(fromSegStart(22), events.cutFrame - 1, 0.12)).toBeLessThan(2.5);
    expect(walkFrames(events.cutFrame, lastFrame, 0.12)).toBeLessThan(2.5);
  });

  it('近景一路越推越近（离右眼眼珠只减不增），各关键机位两边速度连续；末帧推的速度正是 末速（第 4 句从这个速度接着推）', () => {
    for (let g = events.cutFrame; g < lastFrame; g += 0.25) expect(L(g + 0.25)).toBeLessThanOrEqual(L(g) + 1e-12);
    const ε = 1e-4;
    const eyeSpeed = (a: number, b: number) => sub(shotAt(b).眼, shotAt(a).眼).map((v) => v / (b - a));
    for (const k of keyRigs().slice(1, -1)) expect(distance(eyeSpeed(k.帧 - ε, k.帧), eyeSpeed(k.帧, k.帧 + ε))).toBeLessThan(1e-3);
    // 远景各条轨的关键帧上也不突然起速（24 fps 时的段内帧）
    for (const f of [4, 5, 10, 21, 22]) {
      const g = segWindow.起帧 + legacyFrameSec(f) * fps;
      expect(distance(eyeSpeed(g - ε, g), eyeSpeed(g, g + ε)), `24 fps 段内帧 ${f}`).toBeLessThan(1e-3);
    }
    // 末速 是每秒的
    expect(((L(lastFrame) - L(lastFrame - ε)) / ε) * fps).toBeCloseTo(finalSpeed, 3);
    expect(finalSpeed).toBeLessThan(0);
  });

  it('近景在柱子圈里：镜头一直在前面两根柱子北面里边，不穿过你的脑袋，前柱进不了画（两侧的柱子开头在画面左右两边框着）', () => {
    // 前柱：中心 (±1.5, −3.5)，截面 17 像素见方（半边 0.53 格），高 3 格
    const halfWidth = 17 / 32;
    const [px, py] = params.you.feet;
    for (let g = events.cutFrame; g <= lastFrame; g += 0.25) {
      const c = shotAt(g);
      expect(c.眼[1]).toBeGreaterThan(-3.5 + halfWidth);
      expect(distToBox(c.眼, [px - 0.45, py - 0.45, 1.35], [px + 0.45, py + 0.45, 2.15])).toBeGreaterThan(0);
    }
    for (const g of songFrames(events.cutFrame, lastFrame))
      for (const s of [-1, 1])
        for (let a = -halfWidth; a <= halfWidth; a += halfWidth / 4)
          for (let z = 0; z <= 3; z += 0.25)
            for (const p of [[s * 1.5 + a, -3.5 + halfWidth, z], [s * 1.5 + halfWidth * Math.sign(-s), -3.5 + a, z]] as Vec3[])
              expect(inPicture(project(g, p)), `歌曲帧 ${g} 前柱 ${p.map((v) => v.toFixed(2))}`).toBe(false);
  });

  it(`驯服爱心（种子 ${params.hearts.种子}）：照片那一帧 7 颗都整个在画里，照片前后不顶到歌词那一条，到末帧不从她脸前压过去，推眼睛时在 390 宽的手机上半边不过 40 像素`, () => {
    const hearts = tamingHearts(params.liYing.feet, params.hearts.宽, params.hearts.高, frameToTick(events.handOffFrame), params.hearts.种子);
    /** 她两眼中间（模型实测） */
    const headPos: Vec3 = [0, -0.03, 1.24];
    let inPictureCount = 0;
    for (const g of songFrames(events.handOffFrame, lastFrame)) {
      const face = project(g, headPos);
      for (const h of hearts) {
        const s = heartStateAt(h, frameToTick(g));
        if (!s || s.half === 0) continue;
        const p = project(g, s.p);
        if (p.z <= 0.05) continue;
        const halfSizePx = s.half * p.pixelPerUnit;
        if (p.x + halfSizePx < 0 || p.x - halfSizePx > pageWidth || p.y + halfSizePx < 0 || p.y - halfSizePx > pageHeight) continue;
        if (g === events.photo && p.x - halfSizePx > 0 && p.x + halfSizePx < pageWidth && p.y - halfSizePx > 0 && p.y + halfSizePx < pageHeight) inPictureCount++;
        // 一行歌词占画面上面 14%（界面/符文排版.ts），递蛋糕到照片后 1/12 秒（24 fps 时两帧）爱心刚冒出来，要整颗看得见
        if ((g - events.photo) / fps <= legacyFrameSec(2)) expect(p.y - halfSizePx, `歌曲帧 ${g}`).toBeGreaterThan(0.14 * pageHeight);
        if (g >= events.pushInEye) expect((halfSizePx * 390) / pageWidth).toBeLessThanOrEqual(40);
        // 她的眼睛、鼻子那一条（两眼连眉 0.44 × 0.24 格）
        const inFrontOfFace = p.z < face.z - 0.2;
        const pressingFace = Math.abs(p.x - face.x) < 0.22 * face.pixelPerUnit + halfSizePx && Math.abs(p.y - face.y) < 0.12 * face.pixelPerUnit + halfSizePx;
        expect(inFrontOfFace && pressingFace, `歌曲帧 ${g}`).toBe(false);
      }
    }
    expect(inPictureCount).toBe(7);
  });

  it('光柱在推眼睛之前退完；驯服爱心（活 17 刻）在末帧前没了，最后一帧干净', () => {
    expect(lightPillar(events.pushInEye)).toEqual([]);
    expect(lightPillar(events.appear)).toHaveLength(params.lightParams.lightPillar.宽.length);
    expect(frameToTick(lastFrame) - frameToTick(events.handOffFrame)).toBeGreaterThan(17);
  });

  it('cue：只有原声和祭坛合成声（拆盒声跟盒子一起删了）；原声铺满整段，合成声文件头对着点祭坛、峰值配到同一档，不过段尾', () => {
    const soundCues = toFrameCues(seg);
    expect(soundCues.map((c) => c.名)).toEqual(['原声', '祭坛合成']);
    expect(soundCues[0]).toMatchObject({ 帧: 0, 帧数: frameCountOf(seg), 入点秒: segWindow.起帧 / fps, 增益: params.originalGain });
    const soundCue = soundCues[1]!;
    expect(soundCue.帧).toBe(events.tapAltar - segWindow.起帧);
    expect(20 * Math.log10(soundCue.增益 as number) + params.soundFx.祭坛.峰值).toBeCloseTo(params.soundFx.峰值, 3);
    for (const c of soundCues) {
      expect(c.帧).toBeGreaterThanOrEqual(0);
      expect(c.帧 + (c.帧数 as number)).toBeLessThanOrEqual(frameCountOf(seg));
    }
  });
});
