import { describe, expect, it } from 'vitest';
import { fps, legacyFrameSec } from '../../分镜.ts';
import * as params from './参数.ts';
import { events, youWaveAt, YouState, teleportParticles, vanillaFall, frameCount, LiYingState, landFrame, cameraRig, surgeIn, eggCell, portalCells, javaRandom } from './编排.ts';

describe('原版算法照搬', () => {
  it('java随机 同 java.util.Random(432).nextFloat()（JDK 8 跑出来的头两个数）', () => {
    const r = javaRandom(432);
    expect(r()).toBeCloseTo(0.76393366, 7);
    expect(r()).toBeCloseTo(0.8275849, 7);
  });

  it('出口传送门 20 格（5×5 去四角、去中间柱子）', () => {
    expect(portalCells.length).toBe(20);
    expect(portalCells.some(([i, j]) => i === 0 && j === 0)).toBe(false);
  });

  it('龙蛋只瞬移一次，128 颗传送粒子', () => {
    expect(teleportParticles.length).toBe(128);
  });
});

describe('第 5 句的时间线（用户 10-24「画面转太快就删」：只留扑龙蛋扑空一件事）', () => {
  it('伏着扭屁股 → 扑起 → 落在蛋上 → 照片 → 你点 → 她摔趴 → 坐起，都在段里', () => {
    const order = ['buttWiggle', 'pounceStart', 'landOnEgg', 'photoEggPounce', 'clickEgg', 'pounceMiss', 'sitUp'];
    const frames = order.map((k) => (events as Record<string, number>)[k]);
    for (const f of frames) expect(f).toBeTypeOf('number');
    for (let i = 1; i < frames.length; i++) expect(frames[i]!).toBeGreaterThan(frames[i - 1]!);
    expect(events.sitUp).toBeLessThan(frameCount - 1);
  });

  it('每个动作至少停 1 秒左右看得清：坐起来噘嘴一直到段尾超过 1 秒；扑之前伏着扭屁股超过半秒', () => {
    expect((frameCount - events.sitUp) / fps).toBeGreaterThan(1);
    expect((events.pounceStart - events.buttWiggle) / fps).toBeGreaterThan(0.5);
  });

  it('她在蛋上抱住至少 1/3 秒（24 fps 时 8 帧；核查 10-24：原来 3 帧，手机上看不出抓到了）；照片那一帧她在蛋上、蛋还在原处', () => {
    expect((events.clickEgg - events.landOnEgg) / fps).toBeGreaterThanOrEqual(legacyFrameSec(8));
    expect((events.photoEggPounce - events.landOnEgg) / fps).toBeGreaterThanOrEqual(params.landBounceSec);
    expect(events.photoEggPounce).toBeLessThan(events.clickEgg);
    expect(eggCell(events.photoEggPounce)).toEqual(params.eggSpots.start);
  });

  it('扑空（分镜.ts）和照原版重力算出来的落地差不到一帧；落地前她一直在往下掉', () => {
    expect(Math.abs(landFrame - events.pounceMiss)).toBeLessThan(1);
    expect(vanillaFall(1)).toBeCloseTo(0, 9);
    for (let t = 1; t < 6; t++) expect(vanillaFall(t + 1)).toBeGreaterThan(vanillaFall(t));
  });

  it('你的手比蛋先动（核查 10-24：原来蛋先没、手后动），蛋瞬移那帧还在挥；整句只挥这一下', () => {
    expect(youWaveAt(events.clickEgg - 1)).not.toBeNull();
    expect(youWaveAt(events.clickEgg)).not.toBeNull();
    expect(youWaveAt(events.clickEgg - legacyFrameSec(3) * fps)).toBeNull();
    let waveFrames = 0;
    for (let f = 0; f < frameCount; f++) if (youWaveAt(f) !== null) waveFrames++;
    expect(waveFrames).toBeLessThanOrEqual(Math.ceil((params.waveTicks / 20) * fps) + 1);
  });

  it('你整句站在原地不动', () => {
    for (let f = 0; f < frameCount; f++) expect(YouState(f).loc).toEqual(params.you.位);
  });

  it('坐起以后她一直坐着噘嘴，到段尾不变', () => {
    for (let f = Math.ceil(events.sitUp); f < frameCount; f++) {
      const s = LiYingState(f);
      expect(s.poseName).toBe('坐');
      expect(s.expression).toBe('难过');
    }
  });

  it('蛋：点之前在 起、点完在 一；两处都不在传送门上', () => {
    expect(eggCell(events.clickEgg - 1)).toEqual(params.eggSpots.start);
    expect(eggCell(events.clickEgg)).toEqual(params.eggSpots.一);
    for (const [x, y] of Object.values(params.eggSpots)) expect(portalCells.some(([i, j]) => i === x && j === y)).toBe(false);
  });

  it('机位从段首一路推到段尾', () => {
    expect(cameraRig(0).眼).toEqual(params.cameraRig.eyeStart);
    expect(cameraRig(0).看).toEqual(params.cameraRig.lookStart);
    for (let k = 0; k < 3; k++) expect(cameraRig(frameCount - 1).眼[k]).toBeCloseTo(params.cameraRig.eyeEnd[k]!, 9);
    const pushDistance = (f: number) => Math.hypot(...cameraRig(f).眼.map((v, k) => v - params.cameraRig.eyeEnd[k]!));
    for (let f = 1; f < frameCount; f++) expect(pushDistance(f)).toBeLessThanOrEqual(pushDistance(f - 1) + 1e-9);
  });

  it('开头接第 4 句那道浪：段首盖满（进 1），照涌上来的速度退完（进 2），退完以后不再动', () => {
    expect(surgeIn(0)).toBe(1);
    for (let f = 1; f < frameCount; f++) expect(surgeIn(f)).toBeGreaterThanOrEqual(surgeIn(f - 1));
    expect(surgeIn(frameCount - 1)).toBe(2);
    // 浪一程 2/3 秒左右，她扑起来之前已经退完，扑这一下整个看得见
    expect(surgeIn(events.pounceStart - 1)).toBe(2);
  });
});
