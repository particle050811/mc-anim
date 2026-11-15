import { describe, expect, it } from 'vitest';
import { oarPose, rowingStroke, boatToWorld, boatParams } from '@库/物品/船原版.ts';
import { mainCutEvents, segClock, lineAt, fps } from '../../分镜.ts';
import {
  events,
  crossfade,
  sunScreen,
  sunElevation,
  herPos,
  youPos,
  rowStartSec,
  pullBack,
  oarSoundSecs,
  pixelsPerCellAt,
  surgeIn,
  seaHorizonY,
  seaCameraRig,
  gameTick,
  photoFrame,
  eyeCameraRig,
  joinFrame,
  segWindow,
  BoatState,
  projectPoint,
  sightDir,
  projectDir,
  elevationAzimuthDiff,
} from './编排.ts';
import { lightPath, farTiers, sunHeight } from './参数.ts';
import { lightPathColor, seaPattern, farMix } from './光路.ts';
import { horizonColor, skyColorAt } from './天色.ts';
import { endRig, finalDist, finalSpeed, eyeBall } from '../2-祭坛/末态.ts';

// 第 4 句 2 行歌词在 2560×1440 上占 y 77～329（界面/符文排版.ts，字点 7），换成页面像素
const lyricBottomPx = 329 / 2;
const seaFrames = Array.from({ length: segWindow.止帧 - events.horizon.帧 }, (_, i) => events.horizon.帧 + i);

describe('第 4 句的窗口和事件', () => {
  it('窗口是第 4 句起到第 5 句起，事件都在窗口里、按顺序', () => {
    expect(segWindow.起帧).toBe(Math.round(lineAt(4).起 * fps));
    expect(segWindow.止帧).toBe(Math.round(lineAt(5).起 * fps));
    expect(segClock('2-日落划船').帧数).toBe(segWindow.止帧 - segWindow.起帧);
    const order = [events.line4VocalIn, events.eyeToSun, events.horizon, events.oarDips, events.pullBackDone, events.photoSunsetRowing, events.waveRises].map((e) => e.帧);
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    expect(order[0]).toBeGreaterThanOrEqual(segWindow.起帧);
    expect(order.at(-1)!).toBeLessThan(segWindow.止帧);
    expect(photoFrame).toBe(mainCutEvents.photoSunsetRowing.帧);
  });
  it('干净的镜头都不短于 0.5 秒：眼睛特写、海；浪从起到盖满至少 0.5 秒；拉远 0.8 秒以上，拉完停稳 0.8 秒以上才起浪（核查 10-24：原来只停 11 帧）', () => {
    expect((events.eyeToSun.帧 - segWindow.起帧) / fps).toBeGreaterThan(0.5);
    expect((events.waveRises.帧 - events.horizon.帧) / fps).toBeGreaterThan(0.5);
    expect((segWindow.止帧 - events.waveRises.帧) / fps).toBeGreaterThan(0.5);
    expect((events.pullBackDone.帧 - events.horizon.帧) / fps).toBeGreaterThanOrEqual(0.8);
    expect((events.waveRises.帧 - events.pullBackDone.帧) / fps).toBeGreaterThanOrEqual(0.8);
  });
  it('叠化、浪：起止对', () => {
    expect(crossfade(events.eyeToSun.帧)).toBe(0);
    expect(crossfade(events.horizon.帧)).toBe(1);
    expect(surgeIn(events.waveRises.帧)).toBe(0);
    expect(surgeIn(segWindow.止帧 - 1)).toBeLessThan(1);
    expect(surgeIn(segWindow.止帧)).toBe(1);
    expect(pullBack(events.pullBackDone.帧)).toBe(1);
    expect(pullBack(photoFrame)).toBe(1);
  });
});

describe('原版木船', () => {
  it('开划后速度照原版涨（每刻 ×0.9 + 0.04），最快 0.4 格/刻', () => {
    let v = 0;
    let travelled = 0;
    for (let n = 1; n <= 30; n++) {
      v = v * 0.9 + 0.04;
      travelled += v;
      expect(rowingStroke(n).速度).toBeCloseTo(v, 9);
      expect(rowingStroke(n).路).toBeCloseTo(travelled, 9);
    }
    expect(rowingStroke(1e4).速度).toBeCloseTo(boatParams.maxSpeed, 6);
  });
  it('桨不划时是原版静止的角度，划的时候在原版夹的范围里', () => {
    const rest = oarPose(null);
    expect(rest.left_paddle!.rot![0]).toBeCloseTo(-Math.PI / 3 + (Math.PI / 3 - 0.2617994) / 2, 6);
    for (let f = 0; f < 7; f += 0.3) {
      const p = oarPose(f).left_paddle!.rot!;
      expect(p[0]).toBeGreaterThanOrEqual(-Math.PI / 3 - 1e-9);
      expect(p[0]).toBeLessThanOrEqual(-0.2617994 + 1e-9);
    }
  });
  it('第二桨的水声落在「桨入水」，海上镜头里的桨声都在海平线和浪起之间、隔 0.8 秒', () => {
    const oarSecs = oarSoundSecs();
    expect(oarSecs.length).toBeGreaterThanOrEqual(2);
    expect(oarSecs[0]).toBeCloseTo(mainCutEvents.oarDips.秒, 6);
    for (let i = 1; i < oarSecs.length; i++) expect(oarSecs[i]! - oarSecs[i - 1]!).toBeCloseTo(0.8, 6);
    expect(rowStartSec + 2 / 20 + 0.8).toBeCloseTo(mainCutEvents.oarDips.秒, 6);
  });
  it('海平线那一刻船在原点、往南偏西走；你在前、她在后，她侧坐朝东偏南', () => {
    expect(BoatState(events.horizon.帧).loc[0]).toBeCloseTo(0, 9);
    expect(BoatState(events.horizon.帧).loc[1]).toBeCloseTo(0, 9);
    const arrivalPos = BoatState(events.pullBackDone.帧).loc;
    expect(arrivalPos[1]).toBeLessThan(0);
    expect(arrivalPos[0]).toBeLessThan(0);
    expect(Math.abs(arrivalPos[0])).toBeLessThan(Math.abs(arrivalPos[1]));
    const g = photoFrame;
    expect(youPos(g).loc[1]).toBeLessThan(herPos(g).loc[1]);
    expect(youPos(g).yaw).toBe(160);
    expect(herPos(g).yaw).toBe(250);
  });
});

describe('海上的镜头', () => {
  it('海平线那一刻太阳中心高 太阳高 度，往下落（原版速度）', () => {
    expect(sunElevation(gameTick(events.horizon.帧))).toBeCloseTo(sunHeight, 6);
    expect(sunElevation(gameTick(segWindow.止帧))).toBeLessThan(sunHeight);
    expect(sunElevation(gameTick(segWindow.止帧))).toBeGreaterThan(sunHeight - 1);
  });
  it('投影和视线互逆', () => {
    const rig = seaCameraRig(photoFrame);
    for (const [x, y] of [[100, 50], [640, 360], [1200, 700]] as const) {
      const p = projectDir(rig, sightDir(rig, x, y))!;
      expect(p[0]).toBeCloseTo(x, 6);
      expect(p[1]).toBeCloseTo(y, 6);
    }
    const westAngle = elevationAzimuthDiff([-1, 0, 0]);
    expect(westAngle.elevation).toBeCloseTo(0, 9);
    expect(westAngle.差).toBeCloseTo(0, 9);
    expect(Math.abs(elevationAzimuthDiff([1, 0, 0]).差)).toBeCloseTo(180, 9);
  });
  it('海上每一帧太阳（连两圈光圈）都在歌词下面、在画里、在海平线上', () => {
    for (const g of seaFrames) {
      const rig = seaCameraRig(g);
      const sun = sunScreen(rig, gameTick(g))!;
      const marginPx = (sun.side / 8) * 2;
      expect(sun.y - sun.side / 2 - marginPx, `歌曲帧 ${g}`).toBeGreaterThan(lyricBottomPx + 8);
      expect(sun.x - sun.side / 2 - marginPx).toBeGreaterThan(0);
      expect(sun.y + sun.side / 2).toBeLessThan(seaHorizonY(rig));
    }
  });
  it('拉远到位以后船和你们俩在画里、在太阳右边', () => {
    const rig = seaCameraRig(photoFrame);
    const sun = sunScreen(rig, gameTick(photoFrame))!;
    const boat = projectPoint(rig, BoatState(photoFrame).loc)!;
    const liYingScreen = projectPoint(rig, herPos(photoFrame).loc)!;
    expect(boat[0]).toBeGreaterThan(sun.x + sun.side);
    expect(boat[0]).toBeLessThan(1280);
    expect(boat[1]).toBeLessThan(720);
    expect(liYingScreen[1]).toBeGreaterThan(seaHorizonY(rig) - 40);
  });
  it('拉远到位以后你露侧脸、她正对镜头（核查 10-24：原来你一直背着镜头）', () => {
    // 人朝向和「人 → 镜头」的夹角（度）；yaw 同 FigurePose：朝向 (−sin, cos)
    const angleBetween = (person: { loc: readonly number[]; yaw: number }, eye: readonly number[]) => {
      const dir = [-Math.sin((person.yaw * Math.PI) / 180), Math.cos((person.yaw * Math.PI) / 180)];
      const toCamera = [eye[0]! - person.loc[0]!, eye[1]! - person.loc[1]!];
      return (Math.acos((dir[0]! * toCamera[0]! + dir[1]! * toCamera[1]!) / Math.hypot(toCamera[0]!, toCamera[1]!)) * 180) / Math.PI;
    };
    for (const g of [events.pullBackDone.帧, photoFrame, events.waveRises.帧]) {
      const eye = seaCameraRig(g).眼;
      expect(angleBetween(youPos(g), eye), `歌曲帧 ${g}`).toBeLessThan(80);
      expect(angleBetween(herPos(g), eye), `歌曲帧 ${g}`).toBeLessThan(30);
    }
  });
  it('照片帧上人船够大：船那里一格在手机 390 宽上至少 60 像素（坐着的人一格半高，至少 90 像素）', () => {
    const rig = seaCameraRig(photoFrame);
    expect((pixelsPerCellAt(rig, BoatState(photoFrame).loc) * 390) / 1280).toBeGreaterThan(60);
  });
});

describe('匹配剪辑', () => {
  it('眼睛特写接着第 3 句最后一帧推：接帧的镜头就是 末机，推的速度就是 末速（接缝上推镜不停、不跳）', () => {
    const rig = eyeCameraRig(joinFrame);
    for (const i of [0, 1, 2]) expect(rig.眼[i]).toBeCloseTo(endRig.眼[i], 9);
    expect(rig.fov).toBe(endRig.fov);
    const lookDir = (m: { 眼: readonly number[]; 看: readonly number[] }) => {
      const d = [0, 1, 2].map((i) => m.看[i]! - m.眼[i]!);
      const l = Math.hypot(d[0]!, d[1]!, d[2]!);
      return d.map((v) => v / l);
    };
    for (const i of [0, 1, 2]) expect(lookDir(rig)[i]).toBeCloseTo(lookDir(endRig)[i]!, 9);
    const L = (g: number) => Math.log(Math.hypot(...[0, 1, 2].map((i) => eyeCameraRig(g).眼[i]! - eyeBall.rightEye[i]!)));
    expect(L(joinFrame)).toBeCloseTo(Math.log(finalDist), 9);
    const ε = 1e-4;
    // 末速 是每秒的
    expect(((L(joinFrame + ε) - L(joinFrame)) / ε) * fps).toBeCloseTo(finalSpeed, 3);
    // 第 4 句第 0 帧（歌曲帧 窗.起帧）已经往里推了一帧
    expect(L(segWindow.起帧)).toBeLessThan(L(joinFrame));
  });
  it('叠化的时候（眼化日到海平线）画里只有太阳、光路和海：船身和你们俩的头都在画框右边、下边外头（一次一个看点）', () => {
    for (let g = events.eyeToSun.帧; g <= events.horizon.帧; g++) {
      const rig = seaCameraRig(g);
      const b = BoatState(g);
      // 船身：船本地 长 ±0.9、宽 ±0.65，高到船帮；头：你（玩家模型 15/16）实体脚底往上 1.4～1.9 格、她 0.6～1.4 格，±0.25 格见方。
      // 盒子里外按 6 × 6 × 6 取点。桨伸出船外，桨梢会在右下角露一点（出静帧看过，二十来个成片像素）
      const levels = (a: number, b: number) => Array.from({ length: 6 }, (_, i) => a + ((b - a) * i) / 5);
      const points: [number, number, number][] = [];
      for (const x of levels(-0.65, 0.65)) for (const y of levels(-0.9, 0.9)) for (const z of levels(0, 0.6)) points.push(boatToWorld(b.loc, b.yaw, [x, y, z]));
      for (const [person, low, maxHeight] of [[youPos(g), 1.4, 1.9], [herPos(g), 0.6, 1.4]] as const)
        for (const dx of levels(-0.25, 0.25)) for (const dy of levels(-0.25, 0.25)) for (const dz of levels(low, maxHeight)) points.push([person.loc[0] + dx, person.loc[1] + dy, person.loc[2] + dz]);
      for (const q of points) {
        const p = projectPoint(rig, q);
        if (p) expect(p[0] > 1280 || p[1] > 720, `歌曲帧 ${g} (${p.map((v) => v.toFixed(0))})`).toBe(true);
      }
    }
  });
  it('眼化日那一刻右眼眼珠落在太阳上、一样高', () => {
    const g = events.eyeToSun.帧;
    const rig = eyeCameraRig(g);
    const sun = sunScreen(seaCameraRig(g), gameTick(g))!;
    const eyeballPoint = projectPoint(rig, eyeBall.rightEye)!;
    expect(eyeballPoint[0]).toBeCloseTo(sun.x, 3);
    expect(eyeballPoint[1]).toBeCloseTo(sun.y, 3);
    const eyeTop = projectPoint(rig, [eyeBall.rightEye[0], eyeBall.rightEye[1], eyeBall.rightEye[2] + eyeBall.高 / 2])!;
    const bottomProj = projectPoint(rig, [eyeBall.rightEye[0], eyeBall.rightEye[1], eyeBall.rightEye[2] - eyeBall.高 / 2])!;
    expect(bottomProj[1] - eyeTop[1]).toBeCloseTo(sun.side, 1);
  });
  it('眼睛特写一路往里推（眼珠越来越大）', () => {
    let prev = 0;
    for (let g = segWindow.起帧; g <= events.eyeToSun.帧; g++) {
      const rig = eyeCameraRig(g);
      const eyeTop = projectPoint(rig, [eyeBall.rightEye[0], eyeBall.rightEye[1], eyeBall.rightEye[2] + eyeBall.高 / 2])!;
      const bottomProj = projectPoint(rig, [eyeBall.rightEye[0], eyeBall.rightEye[1], eyeBall.rightEye[2] - eyeBall.高 / 2])!;
      expect(bottomProj[1] - eyeTop[1]).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = bottomProj[1] - eyeTop[1];
    }
  });
});

describe('光路、远档（Agent 加的，原版没有）', () => {
  const sunHalfDeg = (Math.atan(7.5 / 100) * 180) / Math.PI;
  /** 光路离太阳方位最远能到多少度：最宽处半宽 ×（抖 + 一截最长的半长） */
  const maxOffset = sunHalfDeg * (lightPath.宽 + lightPath.spread * lightPath.near) * (lightPath.jitter + 0.55);
  it('只在海平线以下、太阳正下方那一条里；近过 近 就没有了；同一处同一刻每次一样', () => {
    for (let tick = 0; tick < 200; tick += 7)
      for (let azimuthDiff = -40; azimuthDiff <= 40; azimuthDiff += 0.5) {
        expect(lightPathColor(0, azimuthDiff, tick)).toBeNull();
        expect(lightPathColor(-1, azimuthDiff, tick)).toBeNull();
        expect(lightPathColor(lightPath.near + 0.1, azimuthDiff, tick)).toBeNull();
        for (const depthBelow of [0.3, 1, 3, 8, 15]) {
          const c = lightPathColor(depthBelow, azimuthDiff, tick);
          if (Math.abs(azimuthDiff) > maxOffset) expect(c).toBeNull();
          expect(lightPathColor(depthBelow, azimuthDiff, tick)).toEqual(c);
        }
      }
  });
  it('贴着海平线那一道连成一片、和太阳差不多宽；一行一行隔开；光路在闪（隔几刻有的截换了位置）', () => {
    expect(lightPathColor(0.2, 0, 0)).not.toBeNull();
    expect(lightPathColor(0.2, sunHalfDeg * lightPath.宽 * 1.01, 0)).toBeNull();
    // 往下一行一行：同一刻同一方位，有亮的行也有空的行
    const column = Array.from({ length: 200 }, (_, i) => lightPath.startDist + (i * (lightPath.near - lightPath.startDist)) / 200).map((depthBelow) =>
      Array.from({ length: 41 }, (_, j) => lightPathColor(depthBelow, -maxOffset + (j * 2 * maxOffset) / 40, 10)).some((c) => c !== null),
    );
    expect(column.filter((v) => v).length).toBeGreaterThan(20);
    expect(column.filter((v) => !v).length).toBeGreaterThan(20);
    let changeCount = 0;
    for (let tick = 0; tick < 40; tick++)
      for (let azimuthDiff = -5; azimuthDiff <= 5; azimuthDiff += 0.25) if (JSON.stringify(lightPathColor(3, azimuthDiff, tick)) !== JSON.stringify(lightPathColor(3, azimuthDiff, tick + 1))) changeCount++;
    expect(changeCount).toBeGreaterThan(0);
  });
  it('远档：海平线以上不混，越往近混得越少，最近一档以外是原样的水', () => {
    expect(farMix(0)).toBe(0);
    expect(farMix(-2)).toBe(0);
    let prev = 1;
    for (let depthBelow = 0.01; depthBelow < 10; depthBelow += 0.01) {
      expect(farMix(depthBelow)).toBeLessThanOrEqual(prev);
      prev = farMix(depthBelow);
    }
    expect(farMix(farTiers.at(-1)![0] + 0.01)).toBe(0);
  });
  it('整帧的图：海平线以上一块都不盖（天归 天.tsx），太阳底下贴着海平线有光路', () => {
    const rig = seaCameraRig(photoFrame);
    const tileSize = 4;
    const { 字节: bytes, 列: cols, 行: rows } = seaPattern(rig, gameTick(photoFrame), 1280, 720, tileSize);
    const horizonY = seaHorizonY(rig);
    for (let j = 0; j < rows; j++)
      if ((j + 0.5) * tileSize < horizonY - 1) for (let i = 0; i < cols; i++) expect(bytes[(j * cols + i) * 4 + 3]).toBe(0);
    const sun = sunScreen(rig, gameTick(photoFrame))!;
    const j = Math.floor((horizonY + 2) / tileSize);
    const i = Math.floor(sun.x / tileSize);
    expect(bytes[(j * cols + i) * 4 + 3]).toBe(255);
  });
});

describe('天色', () => {
  it('地平线以下和地平线上同色（海的最远一档雾接得上），朝太阳那边比背着太阳红', () => {
    expect(skyColorAt(-3, 20)).toEqual(horizonColor(20));
    expect(skyColorAt(0, 20)).toEqual(horizonColor(20));
    expect(horizonColor(0)[0]).toBeGreaterThan(horizonColor(150)[0]);
    expect(horizonColor(0)[2]).toBeLessThan(horizonColor(150)[2]);
  });
});
