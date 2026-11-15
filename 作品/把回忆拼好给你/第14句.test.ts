import { describe, expect, it, vi } from 'vitest';
import type { AssetCue } from '@engine/段/段定义.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import retreatSegment from './段/2-归隐/段.ts';
import { fps, legacyFrameSec, SegmentWindow, mainCutEvents } from './分镜.ts';
import { SplitState } from './场/2-门口/分屏参数.ts';
import { fullScreenShot, fullScreenShotCount } from './场/2-门口/参数.ts';
import { liYingAt } from './场/2-门口/归隐她.ts';
import { retreatLyrics } from './场/2-门口/归隐歌词.ts';
import {
  splitLineX,
  photoStandPos,
  mergedScreenOffset,
  retreatCount,
  pressReachSec,
  hangBellStandPos,
  serverCenterX,
  photoWallEdge,
  fadeStart,
  fadeEnd,
  walkTo,
} from './场/2-门口/归隐参数.ts';
import { colorBackRange, bell } from './场/2-门口/第15句.ts';
import { paperSounds } from './场/2-门口/第8句参数.ts';
import {
  centerLine,
  changeDoneSec,
  tierCount,
  paperVariation,
  blocksLiYing,
  tierIndex,
  mixStart,
  pieceFrame,
  petalShape,
  isVisible,
  shardImages,
  paperFlowers,
  paperParams,
  paperAt,
  stepAside,
  windParams,
  windForce,
  type PaperPiece,
} from './场/2-门口/纸花.ts';
import { line14Sounds } from './场/2-门口/第14句声音.ts';
import { runeLyricDefault, charStates } from './界面/符文排版.ts';
import { mainCutLyricLine } from './界面/符文歌词数据.ts';
import { chatLineOpacity } from './场/2-隐世之境/重逢动作.ts';
import { photoWallCells, photoWallCellPos } from './地点/照片墙格.ts';
import { mapPixels, mapPalette, whiteBorder } from './特效/地图画.ts';
import { line8Photos } from './特效/照片画.ts';
import { paperWindows, building, downstairsCount } from './现实/楼下布局.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

// 特效/照片画.ts 顶上就解码四张照片（真帧资产，打包时才有 asset:），这里换成一张 1×1 的 RGBA（同 祭坛召唤.test.ts）
const pixelPng = vi.hoisted(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
vi.mock('asset:贴图/照片/第3句递蛋糕-三版', () => ({ default: pixelPng }));
vi.mock('asset:贴图/照片/第4句日落划船-二版', () => ({ default: pixelPng }));
vi.mock('asset:贴图/照片/第5句扑龙蛋-二版', () => ({ default: pixelPng }));
vi.mock('asset:贴图/照片/第7句光柱破云-三版', () => ({ default: pixelPng }));

const events = mainCutEvents;
const toSec = (songFrame: number) => songFrame / fps;
/** 左屏（合屏前）看得到的 x 范围（格）：整屏镜头往左挪 合屏前偏 格的左半边 */
const leftScreenCell = (() => {
  const halfWidthCells = 640 / 2 / (fullScreenShot.framing.pxPerCell / filmScale);
  const centerX = fullScreenShot.framing.中心[0] + mergedScreenOffset - halfWidthCells;
  return [centerX - halfWidthCells, centerX + halfWidthCells] as const;
})();

describe('第 14 句：窗口和事件', () => {
  it('2-时差 [2495, 2704)、2-归隐 [2704, 2895)，首尾相接、接 2-摇铃（合屏到位，48.26）', () => {
    expect(SegmentWindow('2-时差')).toMatchObject({ 起帧: 2495, 止帧: 2704 });
    expect(SegmentWindow('2-归隐')).toMatchObject({ 起帧: 2704, 止帧: 2895, 帧数: 191 });
    expect(SegmentWindow('2-摇铃').起帧).toBe(2895);
    expect(events.合屏到位.帧).toBe(2895);
    expect(frameCountOf(retreatSegment)).toBe(191);
  });

  it('事件一拍一个动作：分屏、挂铃、走向照片墙、纸飘下、按框、打框、取照、她消失、合屏到位', () => {
    const order = [events.第14句分屏, events.挂铃, events.走向照片墙, events.纸飘下, events.手按合照, events.打框, events.取照, events.她消失, events.合屏到位].map((e) => e.帧);
    expect(order[0]).toBe(2704);
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    // 照片方案「拍前 2～3 帧她打一下框」（24 fps 的帧）
    expect((events.取照.帧 - events.打框.帧) / fps).toBeGreaterThanOrEqual(legacyFrameSec(2) - 1e-9);
    expect((events.取照.帧 - events.打框.帧) / fps).toBeLessThanOrEqual(legacyFrameSec(3) + 1e-9);
    // 她走以后门口空着停 0.3 秒上下再拉开，拉开用 10 帧以上（24 fps 的帧；核查 10-24：同一台机位连续拉开，不是一刀；她走、合屏、你上线一件一件来）
    expect((events.合屏起.帧 - events.她消失.帧) / fps).toBeGreaterThanOrEqual(0.25);
    expect((events.合屏到位.帧 - events.合屏起.帧) / fps).toBeGreaterThanOrEqual(legacyFrameSec(8) - 1e-9);
    expect((events.第15句加入游戏.帧 - events.合屏到位.帧) / fps).toBeGreaterThanOrEqual(legacyFrameSec(4) - 1e-9);
  });

  it('两屏、2-摇铃 像素一样大：门口、教学楼下都是整屏镜头的 N（合屏只挪不缩）', () => {
    expect([retreatCount, downstairsCount]).toEqual([fullScreenShotCount, fullScreenShotCount]);
  });
});

describe('合屏：同一台机位连续拉开', () => {
  const mergeFrames = Array.from({ length: events.合屏到位.帧 - events.合屏起.帧 + 1 }, (_, i) => events.合屏起.帧 + i);

  it('合屏前：左屏就是整屏镜头往左挪 合屏前偏 格的左半边，分屏线在中线；合屏到位：整屏镜头、分屏线出画', () => {
    expect(mergedScreenOffset).toBe(4);
    for (const f of [events.第14句分屏.帧, events.合屏起.帧]) {
      expect(serverCenterX(toSec(f))).toBe(mergedScreenOffset);
      expect(splitLineX(toSec(f))).toBe(centerLine);
    }
    expect(serverCenterX(toSec(events.合屏到位.帧))).toBe(fullScreenShot.framing.中心[0]);
    expect(splitLineX(toSec(events.合屏到位.帧))).toBe(1280);
  });

  it('每帧都往一个方向挪（不一帧挪、一帧不挪），没有一帧跳得特别远（两头慢）', () => {
    for (let i = 1; i < mergeFrames.length; i++) {
      const [a, b] = [mergeFrames[i - 1]!, mergeFrames[i]!].map((f) => serverCenterX(toSec(f)));
      expect(a! - b!, `第 ${mergeFrames[i]} 帧`).toBeGreaterThan(0);
      const [la, lb] = [mergeFrames[i - 1]!, mergeFrames[i]!].map((f) => splitLineX(toSec(f)));
      expect(lb! - la!).toBeGreaterThanOrEqual(0);
      // 线一帧不超过平均速度的 1.6 倍（smoothstep 峰值 1.5 倍）
      expect(lb! - la!).toBeLessThanOrEqual((1.6 * 640) / (mergeFrames.length - 1));
    }
  });

  it('合照格、告示牌在左屏里（告示牌 x −3.5 到合照格 x 3.5）', () => {
    expect(photoWallCellPos.groupPhoto).toEqual([3, 1]);
    expect(leftScreenCell[0]).toBeLessThanOrEqual(-3.5);
    expect(leftScreenCell[1]).toBeGreaterThanOrEqual(3.5);
  });
});

describe('她：挂铃 → 走进屋 → 取照 → 传送走', () => {
  it('第一帧在告示牌旁举着铃，帽檐不压牌子（牌子右沿 x −2.5）；挂铃 以后才起步', () => {
    const startPose = liYingAt(events.第14句分屏.帧)!;
    expect([startPose.x, startPose.yaw, startPose.rightHand]).toEqual([hangBellStandPos, 180, null]);
    expect(hangBellStandPos - 0.5).toBeGreaterThanOrEqual(bell.hangPoint[0]);
    expect(liYingAt(events.走向照片墙.帧)!.x).toBe(hangBellStandPos);
  });

  it('走路：一路往东、原版走路到疾跑之间的速度（4.3～5.6 格/秒），手按合照 前 按伸秒 停在取照站位', () => {
    const endFrame = events.手按合照.帧 - pressReachSec * fps;
    let maxSpeed = 0;
    for (let f = events.走向照片墙.帧 + 1; f <= endFrame; f++) {
      const d = walkTo(f).x - walkTo(f - 1).x;
      expect(d, `第 ${f} 帧`).toBeGreaterThanOrEqual(0);
      maxSpeed = Math.max(maxSpeed, d * fps);
    }
    expect(maxSpeed).toBeGreaterThan(4.3);
    expect(maxSpeed).toBeLessThanOrEqual(5.6);
    expect(walkTo(endFrame).x).toBeCloseTo(photoStandPos, 9);
    expect(liYingAt(endFrame)!.x).toBeCloseTo(photoStandPos, 9);
    // 帽檐右沿不压合照格（x 2.5～3.5）
    expect(photoStandPos + 0.5).toBeLessThanOrEqual(photoWallCellPos.groupPhoto[0] - 0.5);
    expect(photoStandPos + 0.5).toBeLessThanOrEqual(leftScreenCell[1]);
  });

  it('取照那一帧合照落进主手，之前手里没有；她消失 那一帧起不在了', () => {
    expect(liYingAt(events.取照.帧 - 1)!.rightHand).toBeNull();
    expect(liYingAt(events.取照.帧)!.rightHand).toBe('合照');
    expect(liYingAt(events.她消失.帧 - 1)).not.toBeNull();
    for (let f = events.她消失.帧; f < SegmentWindow('2-归隐').止帧; f++) expect(liYingAt(f), `第 ${f} 帧`).toBeNull();
  });
});

describe('照片墙', () => {
  it('第 8 句只挂四张、没有合照格；第 14 句取下以后合照格是空框', () => {
    const wallCells = photoWallCells(line8Photos);
    expect(wallCells).toHaveLength(4);
    const photoCells = photoWallCells(line8Photos, null);
    expect(photoCells).toHaveLength(5);
    expect(photoCells[4]).toEqual({ i: photoWallCellPos.groupPhoto[0], k: photoWallCellPos.groupPhoto[1], photo: null });
    const cellKeys = photoCells.map((g) => `${g.i},${g.k}`);
    expect(new Set(cellKeys).size).toBe(5);
  });

  it('地图画：一格的地图像素落在整成片像素上，外圈白边，里面全是原版地图色', () => {
    expect((16 * retreatCount) % photoWallEdge).toBe(0);
    // 合照（特效/合照.ts）是资产里的 PNG，测试引不进来；拿第 8 句四张核同一套算法
    for (const sideLength of [32, 64] as const)
      for (const photo of line8Photos) {
        const px = mapPixels(photo, sideLength);
        expect(px.length).toBe(sideLength * sideLength * 4);
        const border = whiteBorder(sideLength);
        const palette = new Set(mapPalette.map((c) => c.join(',')));
        for (let y = 0; y < sideLength; y++)
          for (let x = 0; x < sideLength; x++) {
            const k = (y * sideLength + x) * 4;
            const c = `${px[k]},${px[k + 1]},${px[k + 2]}`;
            const atEdge = x < border || y < border || x >= sideLength - border || y >= sideLength - border;
            if (atEdge) expect(c).toBe('255,255,255');
            else expect(palette.has(c), `${photo.名} (${x}, ${y}) ${c}`).toBe(true);
          }
      }
  });
});

describe('调子', () => {
  it('左屏从第 13 句末的褪色起，合屏到位那一拍到 2-摇铃 开头的调子', () => {
    expect(SplitState(events.第14句分屏.帧 - 1).褪色).toBeCloseTo(fadeStart, 9);
    expect(fadeEnd).toBeCloseTo(1 - colorBackRange.起, 12);
  });
});

describe('教学楼下', () => {
  it('扔纸的窗是一楼、二楼的窗，整扇在右屏里（N = 10 半屏 9 格高）', () => {
    const oblique = 2 / downstairsCount;
    for (const windowItem of paperWindows) {
      // 楼下.tsx 的窗：每层 层高 格，层里第 1、2 格是窗
      expect(windowItem.z[0] % building.floorHeight).toBe(1);
      expect(windowItem.z[1] - windowItem.z[0]).toBe(2);
      expect(windowItem.y).toBe(building.j);
      // 斜投影里窗顶的高度（地面线以上几格）不出画：地面线以上 720 页面像素里能放 (720 − 地面线离底) ÷ 每格页 格
      const groundLineY = (720 / 2) / (fullScreenShot.framing.pxPerCell / filmScale) + fullScreenShot.framing.中心[1];
      expect(windowItem.z[1] + oblique * windowItem.y).toBeLessThanOrEqual(groundLineY);
      expect(windowItem.x[0]).toBeGreaterThanOrEqual(-4);
      expect(windowItem.x[1]).toBeLessThanOrEqual(4);
    }
  });
});

describe('碎纸和花瓣（用户 10-24：两边方向、速度一样；用户 10-25：撕碎、被风吹过去、一边飘一边变成樱花瓣，落的路线斜着往左下）', () => {
  const flowers = paperFlowers();
  const papers = flowers.filter((q) => q.种 === '纸');
  const petals = flowers.filter((q) => q.种 === '瓣');
  const segmentFrames = Array.from({ length: SegmentWindow('2-摇铃').止帧 - events.第14句分屏.帧 }, (_, i) => events.第14句分屏.帧 + i);
  /** 这一刻露在 [左, 1280) × [0, 720) 里的 */
  const inPicture = (qs: readonly PaperPiece[], t: number, left = 0) =>
    qs.filter((q) => {
      if (!isVisible(q, t)) return false;
      const { x, y } = paperAt(q, t);
      const k = pieceFrame(q);
      return x + k.宽 > left && x < 1280 && y + k.高 > 0 && y < 720;
    });
  const centerX = (q: PaperPiece, t: number) => paperAt(q, t).x + pieceFrame(q).宽 / 2;
  /** 去掉晃（摆 = 0）：看这一片走的大势 */
  const noSway = (q: PaperPiece): PaperPiece => ({ ...q, swing: 0 });
  /** t 起 dt 秒里往哪走：往下斜几度（往左走时 0 = 水平、90 = 直着往下；往右走会大于 90） */
  const paperTilt = (q: PaperPiece, t: number, dt = 1 / 48) => {
    const [a, b] = [paperAt(q, t), paperAt(q, t + dt)];
    return (Math.atan2(b.y - a.y, a.x - b.x) * 180) / Math.PI;
  };
  /** 这一片从哪一刻起被风带满（纸花.ts 的 揽起 + 升） */
  const fullyAt = (q: PaperPiece) => Math.max(q.生, events.纸飘下.秒) + q.delay + q.rise;
  /** 窗里扔出来的（出发时有抛的初速）；其余的（楼上落下来、右沿外刮进来的碎纸，花瓣）出发时就在往下飘 */
  const tossed = (q: PaperPiece) => q.种 === '纸' && q.y0 >= 0 && q.x0 < 1280;

  it('碎纸、花瓣的飘法从同一套分布里取（没风时往下、往左的速度，吃风多少都在范围里）', () => {
    for (const q of flowers) {
      expect(q.vx).toBeGreaterThanOrEqual(paperParams.vx[0]);
      expect(q.vx).toBeLessThanOrEqual(paperParams.vx[1]);
      expect(q.vy).toBeGreaterThanOrEqual(paperParams.vy[0]);
      expect(q.vy).toBeLessThanOrEqual(paperParams.vy[1]);
      expect(q.windTake).toBeGreaterThanOrEqual(windParams.windRange[0]);
      expect(q.windTake).toBeLessThanOrEqual(windParams.windRange[1]);
    }
  });

  it('碎纸的样子：小块（3～5 格）、每张都有撕掉的缺口、至少一道字行，字行总是横的（只正着、倒着放）', () => {
    for (const imgRows of shardImages) {
      expect(new Set(imgRows.map((row) => row.length)).size).toBe(1);
      for (const n of [imgRows.length, imgRows[0]!.length]) {
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(5);
      }
      expect(imgRows.join('')).toContain('.');
      expect(imgRows.some((row) => row.includes('LL'))).toBe(true);
    }
    for (const q of papers) expect(q.转 % 2).toBe(0);
  });

  it('风：纸飘下 那一拍前后刮起来，一直刮到转向铃，摇铃那一拍停住（樱花风从铃那里接手）', () => {
    expect(windForce(events.纸飘下.秒 - 0.2)).toBe(0);
    for (let t = events.纸飘下.秒 + 0.3; t <= events.转向铃.秒; t += 0.05) expect(windForce(t)).toBeCloseTo(1, 9);
    expect(windForce(events.摇铃.秒)).toBe(0);
  });

  it('起风以后两边一个方向：被风带满以后，碎纸、花瓣都斜着往左下飘（大势往下斜 10°～28°；带上晃，每四分之一秒也都是往左、往下）', () => {
    let checkedCount = 0;
    for (let f = events.纸飘下.帧; f < events.转向铃.帧; f += 2) {
      const t = toSec(f);
      for (const q of flowers) {
        if (t < fullyAt(q) || t < q.生 + paperParams.tugSec * 3) continue;
        const d = paperTilt(noSway(q), t);
        expect(d, `第 ${f} 帧 ${q.种}`).toBeGreaterThan(10);
        expect(d, `第 ${f} 帧 ${q.种}`).toBeLessThan(28);
        const [a, b] = [paperAt(q, t), paperAt(q, t + 0.25)];
        expect(b.x - a.x, `第 ${f} 帧 ${q.种}`).toBeLessThan(0);
        expect(b.y - a.y, `第 ${f} 帧 ${q.种}`).toBeGreaterThan(0);
        checkedCount++;
      }
    }
    expect(checkedCount).toBeGreaterThan(1000);
  });

  it('每片走一道弧（用户 10-25「至少应该是斜着向左吧」画的那道）：先往下落，越往下越被吹向左，往下斜的角度一路变小；窗里扔出来的抛一下以后也是先落后吹', () => {
    for (const q of flowers) {
      const startSec = Math.max(q.生, events.纸飘下.秒);
      if (fullyAt(q) > events.转向铃.秒) continue;
      const tiltDeg = paperTilt(noSway(q), fullyAt(q));
      expect(tiltDeg, `${q.种} ${q.生.toFixed(2)}`).toBeLessThan(28);
      if (tossed(q)) {
        // 抛出去以后有一阵是在往下落的（比带满时陡得多）
        let steepest = -90;
        for (let t = q.生; t < fullyAt(q); t += 1 / 48) steepest = Math.max(steepest, paperTilt(noSway(q), t));
        expect(steepest, `窗里扔的 ${q.生.toFixed(2)}`).toBeGreaterThan(tiltDeg + 15);
        continue;
      }
      const steep = paperTilt(noSway(q), startSec);
      const midSlope = paperTilt(noSway(q), startSec + q.delay + q.rise / 2);
      expect(steep, `${q.种} ${q.生.toFixed(2)}`).toBeGreaterThan(60);
      expect(midSlope, `${q.种} ${q.生.toFixed(2)}`).toBeLessThan(steep);
      expect(midSlope, `${q.种} ${q.生.toFixed(2)}`).toBeGreaterThan(tiltDeg);
    }
  });

  it('大势同用户画的那道弧：合屏起 以前过分屏线的碎纸，过线时大多在画面上半（她屋檐以上），中间那一片在画面 25%～45% 高', () => {
    const crossHeights: number[] = [];
    for (const q of papers)
      for (let t = q.生; t < mixStart; t += 1 / 48)
        if (centerX(q, t) < centerLine) {
          crossHeights.push(paperAt(q, t).y + pieceFrame(q).高 / 2);
          break;
        }
    crossHeights.sort((a, b) => a - b);
    expect(crossHeights.filter((y) => y < 360).length / crossHeights.length).toBeGreaterThan(0.8);
    const midHeight = crossHeights[Math.floor(crossHeights.length / 2)]!;
    expect(midHeight).toBeGreaterThan(0.25 * 720);
    expect(midHeight).toBeLessThan(0.45 * 720);
  });

  it('碎、多：分屏里有一刻右屏里飘着六十片以上碎纸，上、中两截都有十几片', () => {
    const ok = segmentFrames
      .filter((f) => f < events.合屏起.帧)
      .some((f) => {
        const visible = inPicture(papers, toSec(f), centerLine);
        const halfCounts = [0, 1].map((i) => visible.filter((q) => Math.floor(Math.max(0, paperAt(q, toSec(f)).y) / 240) === i).length);
        return visible.length >= 60 && halfCounts.every((n) => n >= 15);
      });
    expect(ok).toBe(true);
    expect(pieceFrame(papers.find((q) => q.档 === paperParams.nearTier)!).宽).toBeLessThanOrEqual(50);
  });

  it('碎纸越过分屏线飘到她那边：合屏起 以前过了线的四成以上（先落再吹，路比横着走长，余下的合屏时随拉开的画面过去）；合屏起 那一刻左屏里飘着四十片以上', () => {
    const passed = papers.filter((q) => {
      for (let t = q.生; t < mixStart; t += 1 / 24) if (centerX(q, t) < centerLine) return true;
      return false;
    });
    expect(passed.length / papers.length).toBeGreaterThan(0.4);
    const inLeftScreen = inPicture(papers, mixStart).filter((q) => centerX(q, mixStart) < centerLine);
    expect(inLeftScreen.length).toBeGreaterThanOrEqual(40);
  });

  it('一张一张变：每片先当至少 纸秒 的碎纸，一档至少 旧帧(3) 秒，变完秒 以前变成樱花瓣；换到同一档的时刻前后错开半秒以上，旧帧(1) 秒里换档的不到三分之一（不是整片一起）', () => {
    for (const q of papers) {
      expect(q.tierSecs).toHaveLength(tierCount);
      expect(q.tierSecs[0]! - q.生).toBeGreaterThanOrEqual(paperVariation.paperSec - 1e-9);
      for (let k = 1; k < tierCount; k++) expect(q.tierSecs[k]! - q.tierSecs[k - 1]!).toBeGreaterThanOrEqual(legacyFrameSec(3) - 1e-9);
      expect(q.tierSecs[tierCount - 1]!).toBeLessThanOrEqual(changeDoneSec);
    }
    for (let k = 0; k < tierCount; k++) {
      const times = papers.map((q) => q.tierSecs[k]!);
      expect(Math.max(...times) - Math.min(...times), `第 ${k + 1} 档`).toBeGreaterThan(0.5);
    }
    for (const f of segmentFrames) {
      const changed = papers.filter((q) => tierIndex(q, toSec(f)) !== tierIndex(q, toSec(f) - legacyFrameSec(1))).length;
      expect(changed, `第 ${f} 帧`).toBeLessThan(papers.length / 3);
    }
  });

  it('越往左越像樱花：分屏里过了线的碎纸，平均档位比还在右屏的高', () => {
    let passCount = 0;
    for (let f = events.纸飘下.帧 + legacyFrameSec(12) * fps; f < events.合屏起.帧; f++) {
      const t = toSec(f);
      const visible = inPicture(papers, t);
      const [leftHalf, rightSide] = [visible.filter((q) => centerX(q, t) < centerLine), visible.filter((q) => centerX(q, t) >= centerLine)];
      if (leftHalf.length < 5 || rightSide.length < 5) continue;
      const mean = (qs: PaperPiece[]) => qs.reduce((n, q) => n + tierIndex(q, t), 0) / qs.length;
      expect(mean(leftHalf), `第 ${f} 帧`).toBeGreaterThan(mean(rightSide));
      passCount++;
    }
    expect(passCount).toBeGreaterThanOrEqual(legacyFrameSec(10) * fps);
  });

  it('形状按像素格一步步来：第 1、2 档只掉碎纸多出来的格（离瓣心远的先掉），第 2 档里樱花瓣形状的格都在，格数一档比一档少', () => {
    const cellCount = (g: readonly string[]) => g.join('').replace(/\./g, '').length;
    for (const q of papers) {
      const [g0, g1, g2] = q.cells as [string[], string[], string[]];
      expect(g0).toEqual([...shardImages[q.图]!]);
      expect(cellCount(g0)).toBeGreaterThan(cellCount(g1));
      expect(cellCount(g1)).toBeGreaterThan(cellCount(g2));
      expect(cellCount(g2)).toBeGreaterThan(7);
      for (let j = 0; j < g0.length; j++)
        for (let i = 0; i < g0[0]!.length; i++) if (g1[j]![i] !== '.') expect(g1[j]![i]).toBe(g0[j]![i]);
      const shape = petalShape(q.petal);
      const [ox, oy] = [Math.floor((g0[0]!.length - 3) / 2), Math.floor((g0.length - 3) / 2)];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (shape[j]![i] === 'X') expect(g2[oy + j]![ox + i]).not.toBe('.');
    }
  });

  it('合屏起 以后飘着的已经全是樱花瓣（用户 10-25：合成一整屏的时候已经都是樱花瓣）', () => {
    for (const f of segmentFrames.filter((g) => toSec(g) >= mixStart)) for (const q of inPicture(papers, toSec(f))) expect(tierIndex(q, toSec(f))).toBe(tierCount);
  });

  it('她按框、取下合照、传送走那几拍（手按合照 前 0.1 秒到 合屏起），她和照片墙那块没有碎纸、花瓣挡着', () => {
    expect(stepAside.起).toBeLessThan(events.手按合照.秒);
    expect(stepAside.止).toBeGreaterThanOrEqual(events.她消失.秒 + 0.3);
    // 让开框盖住取照时的她：取照站位在左屏 x = 320 + 80 × 站位 页面像素
    const liYingX = 640 / 2 + photoStandPos * (fullScreenShot.framing.pxPerCell / filmScale);
    expect(stepAside.left).toBeLessThan(liYingX - 40);
    expect(stepAside.right).toBeGreaterThan(liYingX + 40);
    for (const q of flowers) expect(blocksLiYing(q), `${q.种} ${q.生.toFixed(2)}`).toBe(false);
  });

  it('不会凭空冒出来：头一帧看得见时，碎纸是刚扔出窗、或者在画面外；花瓣在画面上沿外面，或者是合屏时分屏线推过去露出来的', () => {
    for (const f of segmentFrames) {
      const [t0, t1] = [toSec(f - 1), toSec(f)];
      for (const q of flowers) {
        if (isVisible(q, t0) || !isVisible(q, t1)) continue;
        const { x, y } = paperAt(q, t1);
        const k = pieceFrame(q);
        const offscreen = y + k.高 <= 0 || y >= 720 || x + k.宽 <= 0 || x >= 1280;
        if (q.种 === '纸') expect(t0 < q.生, `第 ${f} 帧的碎纸`).toBe(true);
        else expect(offscreen || t0 >= mixStart, `第 ${f} 帧的花瓣 (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(true);
      }
    }
    // 碎纸出发点：窗洞里（右屏）或者画面外
    for (const q of papers) {
      const offscreen = q.y0 + pieceFrame(q).高 <= 0 || q.x0 >= 1280;
      expect(offscreen || q.x0 > centerLine).toBe(true);
    }
  });
});

describe('歌词：第 15 句在底部', () => {
  const startFrame = SegmentWindow('2-归隐').起帧;
  const song = retreatLyrics(startFrame);
  const allLines = Array.from({ length: 15 }, (_, i) => mainCutLyricLine(i + 1, startFrame));

  it('顶上只有第 1～14 句，底部只有第 15 句', () => {
    expect(song.upperLines.map((r) => r.text)).toEqual(allLines.slice(0, 14).map((r) => r.text));
    expect(song.lowerLines.map((r) => r.text)).toEqual([allLines[14]!.text]);
  });

  it('第 14 句的退场和顶上还有第 15 句时逐帧一样（2-归隐、2-摇铃 两段）', () => {
    for (let f = 0; f < SegmentWindow('2-摇铃').止帧 - startFrame; f++)
      expect(charStates(song.upperLines, 13, f, runeLyricDefault), `段内第 ${f} 帧`).toEqual(charStates(allLines, 13, f, runeLyricDefault));
  });

  it('文字一时只走一路（核查 10-24）：你上线、聊天行弹出那一帧，顶上已经退完；底部第 15 句冒头那一帧，接过来的聊天行已经淡完', () => {
    const joinFrame = events.第15句加入游戏.帧 - startFrame;
    for (let i = 0; i < 14; i++) for (const z of charStates(song.upperLines, i, joinFrame, runeLyricDefault)) expect(z.shown, `第 ${i + 1} 句`).toBe(0);
    let f = 0;
    while (charStates(song.lowerLines, 0, f, runeLyricDefault).every((z) => z.shown === 0)) f++;
    expect(chatLineOpacity((startFrame + f) / fps)).toBe(0);
    for (let i = 0; i < 14; i++) for (const z of charStates(song.upperLines, i, f, runeLyricDefault)) expect(z.shown, `第 ${i + 1} 句、段内第 ${f} 帧`).toBe(0);
  });
});

describe('声音', () => {
  it('三个音效都在本段里放完（铃声不拖进 2-摇铃）', () => {
    const segmentWindow = SegmentWindow('2-归隐');
    for (const cue of line14Sounds) {
      const endFrame = cue.起帧 + (cue.帧数 ?? Math.ceil(cue.时长秒 * fps));
      expect(cue.起帧, cue.名).toBeGreaterThanOrEqual(segmentWindow.起帧);
      expect(endFrame, cue.名).toBeLessThanOrEqual(segmentWindow.止帧);
    }
    const names = toFrameCues(retreatSegment).filter((c) => c.资产 !== undefined).map((c) => c.名);
    expect(names).toEqual(['原声', ...line14Sounds.map((s) => s.名)]);
  });

  it('纸声最响那一下在纸飘下、取出声在取照、铃声起音不晚于挂铃', () => {
    const startFrames = Object.fromEntries(line14Sounds.map((s) => [s.名, s.起帧]));
    expect(startFrames.纸飘下! + Math.round(paperSounds[1]!.peakSec * fps)).toBe(events.纸飘下.帧);
    expect(startFrames.荧光框取出).toBe(events.取照.帧);
    expect(startFrames.挂铃).toBeLessThanOrEqual(events.挂铃.帧);
  });
});
