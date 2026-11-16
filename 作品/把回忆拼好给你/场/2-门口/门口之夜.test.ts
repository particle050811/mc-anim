import { describe, expect, it } from 'vitest';
import { addWave, waveProgress } from '@库/角色/挥手.ts';
import { rocketPos, fireworkSparks, burstSec, burstPoint, sphereRadius } from '@库/特效/烟花.ts';
import { celestialPosition } from '../../地点/天体.ts';
import { SurroundBlocks, behindHouseRange } from '../../地点/小木屋四周地形.ts';
import { fps, beatAt, legacyFrameSec, SegmentWindow, mainCutEvents, lineAt, toSongFrame } from '../../分镜.ts';
import { perChar } from '../../配乐/逐字.ts';
import { signRows, signWords } from './参数.ts';
import { line8Shot, line8ShotCount } from './第8句.ts';
import { segSounds, doorNightSounds } from './门口之夜声音.ts';
import { YouState, LiYingState, setupState } from './门口之夜编排.ts';
import {
  logoutIcon,
  brightTier,
  youStand,
  photoCard,
  skyFraming,
  nightTick,
  nightSkyArc,
  moonInPicture,
  herStand,
  freezeFrame,
  swapRocketSec,
  fireworks,
  photoFrame,
  photoLateSec,
  signLinesAt,
  signFace,
  signNearCount,
  saplingX,
  plantSec,
  chatScale,
  farCount,
  shotAt,
  shotSegment,
  pushPullMid,
} from './门口之夜参数.ts';

const segWindows = ['2-明年六月见', '2-烟花', '2-截图下线'].map(SegmentWindow);
const startFrame = segWindows[0]!.起帧;
/** 牌上写字的四个事件，按写的顺序（一行两个词） */
const writeEventNames = ['writeLine1Word1', 'writeLine1Word2', 'writeLine2Word1', 'writeLine2Word2'] as const;
const endFrame = segWindows[2]!.止帧;
const frameNums = Array.from({ length: endFrame - startFrame }, (_, i) => startFrame + i);
const plantFrame = Math.round(plantSec * fps);
const swapRocketFrame = Math.round(swapRocketSec * fps);

/** 场景点 → 成片像素（同 地点/侧剖面.tsx 的 侧投影 × 2） */
const project = (frame: number, x: number, z: number, y = 0.5) => {
  const j = shotAt(frame);
  const k = 16 * j.N;
  return { x: 1280 + (x - j.center[0]) * k, y: 720 - (z + (j.topDepth / j.N) * y - j.center[1]) * k };
};
/** 存档图标裁的画面正中的正方形（成片像素 x 560～2000） */
const inIconRange = (x: number) => x >= 560 && x <= 2000;
/** 月亮中心（成片像素）：天按 天取景（N 16）画；月亮本体 8 个贴图点加两圈各 1 点的光圈，共 12 点 = 192 像素，半边 96 */
const moonAt = (frame: number) => {
  const sky = skyFraming(shotAt(frame));
  const m = celestialPosition(nightTick(frame / fps), nightSkyArc).moon;
  return { x: 1280 + (m.x - sky.center[0]) * sky.pxPerCell, y: 720 - (m.z - sky.center[1]) * sky.pxPerCell };
};
const moonHalfWidth = 96;

/** 屋后远景（地点/屋后远景.tsx：视距 6、眼高 1.62、地平线在屋前四排草地上面 0.3125 格；那边引 three，测试引不进来，照抄）在这一帧画面上
 *  x 左～右 这一截里最高的那一点（成片像素 y）：相机挂在正交那一层上，眼睛在取景中心正南 6 格，方块 (i, j, k) 的前上沿离眼睛 j + 6 格 */
const farBlocks = SurroundBlocks(behindHouseRange);
const farViewTop = (frame: number, left: number, right: number) => {
  const j0 = shotAt(frame);
  const k = 16 * j0.N;
  const horizonPx = 720 + (j0.center[1] - (4 * j0.topDepth) / j0.N - 0.3125) * k;
  let farTop = Infinity;
  for (const b of [...farBlocks.plains, ...farBlocks.cherryGrove]) {
    const [i, j, layerY] = b.位 as [number, number, number];
    const height = layerY + 1 - 1.62;
    if (height <= 0) continue;
    const depthScale = (6 * k) / (j + 6);
    const x1 = 1280 + (i - 0.5 - j0.center[0]) * depthScale, x2 = 1280 + (i + 0.5 - j0.center[0]) * depthScale;
    if (x2 < left || x1 > right) continue;
    farTop = Math.min(farTop, horizonPx - height * depthScale);
  }
  return farTop;
};

describe('门口之夜的段（第 9–11 句）', () => {
  it('三段首尾相接，从第 9 句首字到第 12 句首字', () => {
    expect(startFrame).toBe(toSongFrame(lineAt(9).起));
    expect(endFrame).toBe(toSongFrame(lineAt(12).起));
    expect(segWindows[0]!.止帧).toBe(segWindows[1]!.起帧);
    expect(segWindows[1]!.止帧).toBe(segWindows[2]!.起帧);
    expect(mainCutEvents.nightfall.frame).toBe(startFrame);
  });

  it('按词写：四个词落在第 9 句那段里、按顺序，两行隔两拍；照片、碎裂、下线落在最后一段里', () => {
    const writeFrames = writeEventNames.map((k) => mainCutEvents[k].frame);
    for (const f of writeFrames) expect(f >= segWindows[0]!.起帧 && f < segWindows[0]!.止帧).toBe(true);
    expect([...writeFrames].sort((a, b) => a - b)).toEqual(writeFrames);
    expect(writeFrames[2]! - writeFrames[0]!).toBe(Math.round(beatAt(72.5) * fps) - Math.round(beatAt(70.5) * fps));
    for (const k of ['screenshotFreeze', 'worldShatters', 'logOff'] as const) {
      const f = mainCutEvents[k].frame;
      expect(f >= segWindows[2]!.起帧 && f < segWindows[2]!.止帧).toBe(true);
    }
    expect(freezeFrame).toBe(mainCutEvents.screenshotFreeze.frame);
    expect(photoFrame).toBe(freezeFrame + photoLateSec * fps);
  });

  it('牌上写字和歌词的字错开：写上一行那一帧离第 9、10 句每个字唱到的那一帧（和 1/24 秒以前拼齐）至少 1/8 秒（24 fps 时 3 帧）', () => {
    const singFrames = [...perChar[9]!, ...perChar[10]!].map(toSongFrame);
    for (const k of writeEventNames) {
      const f = mainCutEvents[k].frame;
      for (const g of singFrames) expect(Math.min(Math.abs(f - g), Math.abs(f - (g - fps * legacyFrameSec(1)))) / fps, `${k} 和第 ${g} 帧`).toBeGreaterThanOrEqual(legacyFrameSec(3));
    }
  });

  it('牌上的字只有 参数.ts 告示牌行们 一处：写字一之前空着，之后一个词一个词写上（核查 10-24：原来一行整行冒出来），写字二续写全', () => {
    const firstWritingFrame = mainCutEvents.writeLine1Word1.frame;
    expect(signLinesAt((firstWritingFrame - 1) / fps)).toEqual(['', '', '', '']);
    expect(setupState(firstWritingFrame).signLines).toEqual(['', signWords[0]![0], '', '']);
    expect(setupState(mainCutEvents.writeLine1Word2.frame).signLines).toEqual([signRows[0], signRows[1], '', signRows[3]]);
    expect(setupState(mainCutEvents.writeLine2Word1.frame).signLines).toEqual(['', signRows[1], signWords[1]![0], '']);
    expect(setupState(mainCutEvents.writeLine2Word2.frame).signLines).toEqual(signRows);
    expect(setupState(endFrame - 1).signLines).toEqual(signRows);
  });
});

describe('烟花（原版 1.20.1 的走法）', () => {
  it('三发：炸开正好落在分镜的炸开事件上，飞的刻数在原版 Flight 0 的 11～22 刻里；最大那发炸在「绽」上，和咔哒同一帧', () => {
    const burstEvents = ['firework1Burst', 'firework3Burst', 'bigFireworkBurst'] as const;
    expect(fireworks.length).toBe(burstEvents.length);
    fireworks.forEach((firework, i) => {
      expect(burstSec(firework)).toBeCloseTo(mainCutEvents[burstEvents[i]!].sec, 9);
      expect(firework.flightTick).toBeGreaterThanOrEqual(11);
      expect(firework.flightTick).toBeLessThanOrEqual(22);
    });
    const bigFirework = fireworks[fireworks.length - 1]!;
    expect(bigFirework.ballSize).toBe('大球');
    // 定格帧那一刻已经炸了，前一帧还没炸
    expect(freezeFrame / fps).toBeGreaterThanOrEqual(burstSec(bigFirework));
    expect((freezeFrame - 1) / fps).toBeLessThan(burstSec(bigFirework));
    const bigBlastCue = doorNightSounds.find((s) => s.name.endsWith('大炸'))!;
    expect(bigBlastCue.起帧).toBe(freezeFrame);
  });

  it('最后一发升空：离地一格以后，火箭周围一格内前两发的火花都已经烧过一半、缩成小火花（spark_0～3，刚炸开的是 spark_7）', () => {
    const lastFirework = fireworks[fireworks.length - 1]!;
    for (let f = mainCutEvents.finalFireworkLaunch.frame + 1; f < freezeFrame; f++) {
      const p = rocketPos(lastFirework, f / fps)!;
      expect(p, `第 ${f} 帧`).not.toBeNull();
      if (p[2] < 1) continue;
      for (const firework of fireworks) {
        if (firework === lastFirework) continue;
        for (const h of fireworkSparks(firework, f / fps))
          if (Math.abs(h.p[0] - p[0]) < 1 && Math.abs(h.p[2] - p[2]) < 1) expect(h.贴图, `第 ${f} 帧 第${firework.name}发`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('小球 98 颗、大球 386 颗（createParticleBall 立方体外壳；炸开那一刻火箭也照常放出最后一颗白火花），炸开那一刻的半径', () => {
    const ballCount = (i: number) => {
      const firework = { ...fireworks[i]!, trail: false };
      const justBurst = fireworkSparks(firework, burstSec(firework) + 0.5 / 20).length;
      const notYetBurst = fireworkSparks(firework, burstSec(firework) - 0.5 / 20).length;
      return justBurst - notYetBurst - 1;
    };
    expect(ballCount(0)).toBe(98);
    expect(ballCount(fireworks.length - 1)).toBe(386);
    expect(sphereRadius('大球', 1)).toBeCloseTo(0.5, 9);
  });

  it('闪光亮档：大面积明暗一秒变不到 3 次；定格的照片那一帧正亮在最高档', () => {
    const brightStarts: number[] = [];
    for (let f = startFrame + 1; f < endFrame; f++) if (brightTier(f / fps).档 > 0 && brightTier((f - 1) / fps).档 === 0) brightStarts.push(f);
    for (const f of brightStarts) expect(brightStarts.filter((g) => g >= f && g < f + fps).length).toBeLessThanOrEqual(3);
    expect(brightTier(photoFrame / fps).档).toBe(2);
    for (const firework of fireworks) expect(burstPoint(firework)[2]).toBeGreaterThan(3.5);
  });
});

describe('镜头：一个镜头不切（第 8 句同机位 → 停住种树苗 → 推到牌子上 → 跟火箭上天 → 落回门口定格）', () => {
  const isPushing = (f: number) => pushPullMid(f / fps);
  it('推近牌子、从牌子拉开以外每一帧 N 是偶数、顶面 2；停住的帧中心落在偶数像素上（方块边、地面线都是整像素）', () => {
    for (const f of frameNums.filter((f) => !isPushing(f))) {
      const j = shotAt(f);
      const k = 16 * j.N;
      expect(j.N % 2, `第 ${f} 帧`).toBe(0);
      expect(j.topDepth).toBe(2);
      if (j.moving) continue;
      const ex = (0.5 + j.center[0]) * k;
      const ez = j.center[1] * k;
      expect(Math.abs(ex - Math.round(ex))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(ex) % 2)).toBe(0);
      expect(Math.abs(ez - Math.round(ez))).toBeLessThan(1e-6);
      expect(Math.abs(Math.round(ez) % 2)).toBe(0);
    }
  });

  it('推近、拉开时每帧都在变、一帧变不过 10%（N 不取整，不一顿一顿地跳）', () => {
    const pushPullFrames = frameNums.filter(isPushing);
    expect(pushPullFrames.length).toBeGreaterThan(80);
    for (const f of pushPullFrames.filter((f) => isPushing(f - 1))) {
      const [a, b] = [shotAt(f - 1).N, shotAt(f).N];
      expect(a, `第 ${f} 帧`).not.toBe(b);
      expect(Math.max(a / b, b / a), `第 ${f} 帧`).toBeLessThan(1.1);
    }
  });

  it('停住的帧不少（开场、牌子特写、定格），动着的帧中心每帧都在挪（不一帧挪、一帧不挪）', () => {
    const still = frameNums.filter((f) => !shotAt(f).moving);
    expect(still.length).toBeGreaterThan(60);
    for (const f of frameNums.filter((f) => shotAt(f).moving && shotAt(f - 1).moving)) {
      const [a, b] = [shotAt(f - 1).center, shotAt(f).center];
      expect(a[0] !== b[0] || a[1] !== b[1], `第 ${f} 帧`).toBe(true);
    }
  });

  it('连贯：相邻两帧 N 变不过 1.5 倍，画面中心那一点挪不过半屏宽', () => {
    for (let f = startFrame + 1; f < endFrame; f++) {
      const [a, b] = [shotAt(f - 1), shotAt(f)];
      expect(Math.max(a.N / b.N, b.N / a.N), `第 ${f} 帧`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(project(f, a.center[0], a.center[1], 0).x - 1280), `第 ${f} 帧`).toBeLessThan(1280);
    }
  });

  it('开场同第 8 句的机位（N 16、中心）匹配剪进来，原样停 1/6 秒（24 fps 时 4 帧）；N 16 一直留到 推起（0.58 秒）才往牌子推', () => {
    for (let f = startFrame; (f - startFrame) / fps < legacyFrameSec(4); f++) expect(shotAt(f), `第 ${f} 帧`).toEqual({ N: line8ShotCount, topDepth: 2, center: line8Shot.framing.center });
    let f = startFrame;
    while (shotAt(f).N === line8ShotCount) f++;
    expect(f / fps).toBeGreaterThan(shotSegment.pushStart);
    expect(f - startFrame).toBeGreaterThanOrEqual(0.55 * fps);
    expect(f - 1).toBeGreaterThanOrEqual(plantFrame);
  });

  it('种下树苗那一帧到往牌子推之前，树苗那一格整个在画里（离左边 64 像素以上）', () => {
    for (let f = plantFrame; f <= mainCutEvents.pushToSign.frame; f++) expect(project(f, saplingX - 0.5, 0).x, `第 ${f} 帧`).toBeGreaterThanOrEqual(64);
  });

  it('两行字都在牌子特写里写上（N 84）：牌字在画面正中、你在画外；写完的两行在特写里留 0.35 秒以上（按词写只留得出这么多），拉开头 1/8 秒（24 fps 时 3 帧）N 还在 60 以上', () => {
    for (let f = mainCutEvents.writeLine1Word1.frame; f < shotSegment.followStart * fps; f++) {
      expect(shotAt(f).N, `第 ${f} 帧`).toBe(signNearCount);
      const sign = project(f, signFace.x, signFace.z, signFace.y);
      expect(Math.abs(sign.x - 1280)).toBeLessThan(2);
      expect(Math.abs(sign.y - 720)).toBeLessThan(2);
      // 你朝西侧身：胳膊往前伸到 x − 0.375
      expect(project(f, YouState(f).x - 0.375, 1).x, `第 ${f} 帧`).toBeGreaterThan(2560);
    }
    expect(shotSegment.followStart - mainCutEvents.writeLine2Word2.frame / fps).toBeGreaterThanOrEqual(0.35);
    for (let f = Math.ceil(shotSegment.followStart * fps); f / fps < shotSegment.followStart + legacyFrameSec(3); f++) expect(shotAt(f).N, `第 ${f} 帧`).toBeGreaterThanOrEqual(60);
  });

  it('火箭到手时镜头已经拉开（N 36 以内），你整个人和伸出去的手都在画里，不从画框边戳进来', () => {
    for (let f = swapRocketFrame; f <= mainCutEvents.firework1Launch.frame; f++) {
      expect(shotAt(f).N, `第 ${f} 帧`).toBeLessThanOrEqual(36);
      expect(project(f, youStand - 0.8, 1).x, `第 ${f} 帧`).toBeGreaterThan(0);
      expect(project(f, youStand + 0.3, 1).x, `第 ${f} 帧`).toBeLessThan(2560);
      const handPos = project(f, youStand - 0.5, 0.7);
      expect(handPos.y, `第 ${f} 帧`).toBeLessThan(1440 - 32);
    }
  });

  it('两发小烟花都在画面中间炸开（离中心不到 32 像素）', () => {
    for (const firework of fireworks.slice(0, 2)) {
      const f = Math.ceil(burstSec(firework) * fps);
      expect(shotAt(f).N).toBe(farCount);
      const [x, y, z] = burstPoint(firework);
      const p = project(f, x, z, y);
      expect(Math.hypot(p.x - 1280, p.y - 720), `第${firework.name}发`).toBeLessThan(32);
    }
  });

  it('两发小烟花开到最大时整个在屋后林子上面的天里（林子跟正交那一层一起沉出画面下边，不压平地）', () => {
    for (const firework of fireworks.slice(0, 2)) {
      const f = Math.ceil(burstSec(firework) * fps) + 10;
      const [x, y, z] = burstPoint(firework);
      const p = project(f, x, z, y);
      const r = sphereRadius(firework.ballSize, (f / fps - burstSec(firework)) * 20) * 16 * shotAt(f).N;
      expect(p.y + r, `第${firework.name}发`).toBeLessThan(farViewTop(f, p.x - r, p.x + r));
    }
  });

  it('定格：你、她（连帽檐）、牌子、照片墙、最大那朵（照片那一帧开到的半径）都整个在存档图标裁的正中正方形里，树苗整个在外面', () => {
    const bigFirework = fireworks[fireworks.length - 1]!;
    const r = sphereRadius('大球', (photoFrame / fps - burstSec(bigFirework)) * 20);
    expect(r).toBeGreaterThan(1.5);
    const [bx, by, bz] = burstPoint(bigFirework);
    const screenCenter = project(photoFrame, bx, bz, by);
    const k = 16 * shotAt(photoFrame).N;
    expect(inIconRange(screenCenter.x - r * k) && inIconRange(screenCenter.x + r * k)).toBe(true);
    expect(screenCenter.y - r * k).toBeGreaterThan(0);
    for (const [x, halfWidth] of [[youStand, 0.3], [herStand, 0.56], [signFace.x, 0.5]] as const) {
      expect(inIconRange(project(photoFrame, x - halfWidth, 1).x), `x ${x}`).toBe(true);
      expect(inIconRange(project(photoFrame, x + halfWidth, 1).x), `x ${x}`).toBe(true);
    }
    // 照片墙（地点/门口小木屋.tsx：后墙 i 1～2 的框，x 0.5～2.5）整个在里面，屋里 x 3.5 起的摆设、树苗那格整个在外面
    expect(inIconRange(project(photoFrame, 0.5, 1, 2).x) && inIconRange(project(photoFrame, 2.5, 1, 2).x)).toBe(true);
    expect(project(photoFrame, 3.5, 1, 1.5).x).toBeGreaterThan(2000);
    expect(project(photoFrame, saplingX + 0.5, 0, 1.5).x).toBeLessThan(560);
  });

  it('月亮：匹配剪进来正好挂在 满月在画面；一直在左上、歌词那一行左边，定格那一刻整个在存档图标的正方形外面，不挨着烟花', () => {
    const moonPos = moonAt(startFrame);
    // 第 9 句起在 28.62 秒，第一帧在 28.625 秒，月亮往西挪了不到 0.1 像素
    expect(moonPos.x).toBeCloseTo(1280 + moonInPicture[0] * 256, 0);
    expect(moonPos.y).toBeCloseTo(720 - moonInPicture[1] * 256, 0);
    for (const f of frameNums) {
      const m = moonAt(f);
      expect(m.x + moonHalfWidth, `第 ${f} 帧`).toBeLessThanOrEqual(560);
      // 拉开那一下镜头先往下看你和火箭，天跟着往上挪一点，外圈光圈贴到画面上沿；月亮本体（半边 64）一直整个在画里
      expect(m.y - 64, `第 ${f} 帧`).toBeGreaterThan(0);
    }
    for (const firework of fireworks) {
      const f = Math.ceil(burstSec(firework) * fps) + 3;
      const [x, y, z] = burstPoint(firework);
      const p = project(f, x, z, y);
      const r = sphereRadius(firework.ballSize, (f / fps - burstSec(firework)) * 20) * 16 * shotAt(f).N;
      const m = moonAt(f);
      expect(Math.hypot(p.x - m.x, p.y - m.y) - r - moonHalfWidth, `第${firework.name}发`).toBeGreaterThan(0);
    }
  });
});

describe('人', () => {
  it('匹配剪进来几帧照第 8 句末态（闭眼歪头），之后睁眼；照片里她仰头看烟花，头转不过 30°（再转帽檐就把脸盖住）', () => {
    expect(LiYingState(startFrame).blink).toBe(1);
    expect(LiYingState(startFrame).头).toEqual([12, 30, 14]);
    expect(LiYingState(photoFrame).头[0]).toBeGreaterThanOrEqual(15);
    expect(Math.abs(LiYingState(photoFrame).头[1])).toBeLessThanOrEqual(30);
    expect(LiYingState(photoFrame).头[1] % 90).not.toBe(0);
  });

  it('你：一直站在 x −1.5 朝西；匹配剪进来拿着树苗、种下挥手，写字时空手，镜头拉开以后才换上火箭；放每一发都挥手；照片里仰头', () => {
    expect(YouState(startFrame)).toMatchObject({ x: youStand, yaw: 90, held: '树苗' });
    expect(YouState(plantFrame - 1).held).toBe('树苗');
    expect(YouState(plantFrame).held).toBe(null);
    expect(YouState(plantFrame + 1).wave).toBeGreaterThan(0);
    expect(YouState(swapRocketFrame - 1).held).toBe(null);
    expect(YouState(swapRocketFrame).held).toBe('烟花火箭');
    expect(swapRocketFrame).toBeGreaterThan(shotSegment.followStart * fps);
    for (const firework of fireworks) expect(YouState(Math.ceil(firework.launchSec * fps) + 1).wave).toBeGreaterThan(0);
    for (const f of frameNums) expect(YouState(f)).toMatchObject({ x: youStand, yaw: 90 });
    expect(YouState(photoFrame).held).toBe('烟花火箭');
    expect(YouState(photoFrame).headPitch).toBeGreaterThan(30);
  });

  it('树苗种下那一帧起就在地上', () => {
    expect(setupState(plantFrame - 1).saplingPlaced).toBe(false);
    expect(setupState(plantFrame).saplingPlaced).toBe(true);
  });

  it('挥手 6 刻挥完；没在挥时姿势原样', () => {
    expect(waveProgress(0)).toBe(0);
    expect(waveProgress(0.15)).toBeCloseTo(0.5, 9);
    expect(waveProgress(0.3)).toBe(0);
    const p = { loc: [0, 0, 0], pitch: 0, squash: 0, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0 };
    expect(addWave(p, 0)).toBe(p);
    expect(addWave(p, 0.3).armR).toBeGreaterThan(p.armR + 60);
  });
});

describe('下线：存档图标', () => {
  it('照原版：裁正中正方形，落定时 64×64 个点、一个点 8 个成片像素，斜度、相纸边收没', () => {
    // 缩好那一帧：下线那一帧已经走了一帧，缩秒 走完
    const c = photoCard(mainCutEvents.logOff.frame + Math.ceil(logoutIcon.shrinkSec * fps) - 1, 2560, 1440);
    expect(c.下).toBe(1);
    expect(c.points).toBe(64);
    expect(c.w).toBe(512);
    expect(c.h).toBe(512);
    expect(c.borderWidth).toBe(0);
    expect(c.bottomEdge).toBe(0);
    expect(c.angle).toBe(0);
    expect(c.源).toEqual([560, 0, 1440, 1440]);
    // 中心、上下沿落在偶数个成片像素上
    expect(c.cy % 2).toBe(0);
  });

  it('最后半秒是落定的图标和下线那行聊天', () => {
    expect((endFrame - mainCutEvents.logOff.frame) / fps - (logoutIcon.shrinkSec - 1 / fps)).toBeGreaterThanOrEqual(0.5);
  });

  it('手机 390 宽：聊天字（原版字高 8 个界面像素）至少 11 像素高；图标下沿让开聊天栏暗底（y 950 起）', () => {
    expect((8 * chatScale * 390) / 2560).toBeGreaterThanOrEqual(11);
    const c = photoCard(endFrame - 1, 2560, 1440);
    expect(c.cy + c.h / 2).toBeLessThanOrEqual(950);
  });
});

describe('声音', () => {
  it('每一声都整个落在三段里，三段切出来的截数加起来不少；种树苗的声音在种下那一帧，咔哒的起音落在定格那一帧', () => {
    const cues = segWindows.flatMap((w) => segSounds({ startSec: w.起帧 / fps, endSec: w.止帧 / fps }));
    for (const cue of doorNightSounds) {
      expect(Number.isInteger(cue.起帧)).toBe(true);
      expect(cue.起帧).toBeGreaterThanOrEqual(startFrame);
      expect(cues.some((c) => c.name === cue.name)).toBe(true);
    }
    expect(doorNightSounds.find((s) => s.name === '种樱花树苗')!.起帧).toBe(plantFrame);
    const clickCue = doorNightSounds.find((s) => s.name === '咔哒')!;
    expect(clickCue.起帧 + Math.round(0.13 * fps)).toBe(freezeFrame);
  });
});
