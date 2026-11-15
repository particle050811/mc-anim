// 第 6、7 句（段 2-雷雨、2-拨开阴霾，一个镜头）：事件顺序、炸掉一角的屋子和掉落物、四周的地、镜头（歌词那条下面、眼在地上）、云洞、光柱、阳光、雨、声音。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { setPerspCamera } from '@engine/三渲二/机位.tsx';
import type { AssetCue } from '@engine/段/段定义.ts';
import thunderSegment from './段/2-雷雨/段.ts';
import clearHazeSegment from './段/2-拨开阴霾/段.ts';
import grabEggSegment from './段/2-抢龙蛋/段.ts';
import { fps, legacyFrameSec, SegmentWindow, mainCutEvents, type MainCutEventName } from './分镜.ts';
import * as params from './场/2-雷雨/参数.ts';
import { crater, cabin, dropPos, playerCanPickUp, chestCell, southWall, chestContents, chestDrops } from './场/2-雷雨/弹坑.ts';
import { SurroundBlocks, groundHeight, trees } from './场/2-雷雨/地形.ts';
import { cloudCells } from './场/2-雷雨/云.ts';
import { nearThunder, rainSoundStartFrame, rainAmount, thunder } from './场/2-雷雨/声音.ts';
import { cloudColor, weatherSky } from './场/2-雷雨/天气.ts';
import { sentences } from './配乐/网格.ts';
import { pushGap, lyricLayoutTable, lyricBox } from './界面/歌词排版表.ts';
import { runeLyricDefault } from './界面/符文排版.ts';
import {
  cloudRemain,
  cloudDrift,
  clearSkyAt,
  beamOpacity,
  beamTop,
  glowRegionsAt,
  houseFarthest,
  LiYingState,
  impactBrightness,
  CameraRig,
  holeRadius,
  holeCenter,
  clearing,
  perspectiveRainPlanes,
  shotEndFrame,
  shotStartFrame,
  isFlashing,
  sunRadius,
  circleSize,
} from './场/2-雷雨/编排.ts';
import { toFrameCues, frameCountOf, sceneWindowFrames } from './声音/回帧.ts';

const eventFrame = (eventName: MainCutEventName) => mainCutEvents[eventName].帧;
const thunderWindow = SegmentWindow('2-雷雨');
const clearHazeWindow = SegmentWindow('2-拨开阴霾');
const lastFrame = shotEndFrame - 1;
const allFrames = Array.from({ length: shotEndFrame - shotStartFrame }, (_, k) => shotStartFrame + k);
const posKey = (i: number, j: number, k: number) => `${i},${j},${k}`;

/** 场景点在画面上的位置（0～1：上 = 离顶边、左 = 离左边）；场景 Z 朝上，three Y 朝上 */
const subtitleAt = (f: number) => {
  const cam = new THREE.PerspectiveCamera();
  setPerspCamera(cam, CameraRig(f), 16 / 9);
  return ([x, y, z]: readonly number[]) => {
    const v = new THREE.Vector3(x!, z!, -y!).project(cam);
    return { 上: (1 - v.y) / 2, left: (1 + v.x) / 2 };
  };
};
const lineText = (lineIndex: number) => sentences.find((x) => x.序 === lineIndex)!.text;
/** 歌词那条的下沿（占画面高的比例） */
const lyricRatio = params.lyricBottomPx / 1440;

describe('串：第 6、7 句', () => {
  it('2-雷雨 是第 6 句（首字到第 7 句首字），2-拨开阴霾 到第 8 句首字；前接 2-抢龙蛋、后接 2-收集快乐', () => {
    expect(SegmentWindow('2-抢龙蛋').止帧).toBe(thunderWindow.起帧);
    expect(thunderWindow.止帧).toBe(clearHazeWindow.起帧);
    expect(thunderWindow.止帧).toBe(eventFrame('她站起'));
    expect(SegmentWindow('2-收集快乐').起帧).toBe(clearHazeWindow.止帧);
    expect([shotStartFrame, shotEndFrame]).toEqual([thunderWindow.起帧, clearHazeWindow.止帧]);
  });

  it('事件按顺序；阳光铺地以后、切第 8 句之前留至少半秒看阳光照着屋子', () => {
    const order: MainCutEventName[] = ['第6句开口', '她看你', '你看她', '雷照缺口', '她站起', '阵起', '光柱起', '拨', '破云', '云洞开大', '阳光铺地', '照片-光柱破云', '光柱退', '第8句开口'];
    const frames = order.map(eventFrame);
    for (let k = 1; k < frames.length; k++) expect(frames[k], order[k]).toBeGreaterThan(frames[k - 1]!);
    expect(eventFrame('第6句开口')).toBeGreaterThanOrEqual(thunderWindow.起帧);
    expect(clearHazeWindow.止帧 - eventFrame('阳光铺地')).toBeGreaterThanOrEqual(fps / 2);
    expect(eventFrame('照片-光柱破云')).toBeLessThan(clearHazeWindow.止帧);
  });

  it('5→6 接缝：闪电落在切点上（2-雷雨 第 0 帧就在闪），雨声在 2-抢龙蛋 段尾先淡进来、段尾那一帧已经满了', () => {
    expect(eventFrame('第6句闷雷')).toBe(thunderWindow.起帧);
    expect(isFlashing(thunderWindow.起帧)).toBe(true);
    const rainCues = toFrameCues(grabEggSegment).filter((c) => c.资产.includes('weather.rain'));
    expect(rainCues.length).toBeGreaterThan(0);
    const firstDrop = rainCues[0]!;
    expect(firstDrop.帧).toBeGreaterThan(SegmentWindow('2-抢龙蛋').止帧 - SegmentWindow('2-抢龙蛋').起帧 - fps);
    const gain = firstDrop.增益 as readonly number[];
    expect(Array.isArray(gain)).toBe(true);
    expect(gain[0]!).toBeLessThan(gain.at(-1)!);
    expect(rainSoundStartFrame).toBeLessThan(thunderWindow.起帧);
  });

  it('推到缺口近景那一帧又闪一道电，停住的近景里炸掉的格占画面四分之一以上、两个人整个在画面里（核查 10-24）', () => {
    expect(isFlashing(eventFrame('雷照缺口'))).toBe(true);
    // 每道闪电亮的帧数：段内帧 d 落在 [a, b) 秒里的个数（60 fps 下亮 5 帧、隔 8 帧再亮 2 帧）
    const perFlash = params.flashRanges.reduce((n, [a, b]) => n + Math.ceil(b * fps - 1e-9) - Math.ceil(a * fps - 1e-9), 0);
    expect(perFlash).toBe(7);
    expect(allFrames.filter(isFlashing).length).toBe(2 * perFlash);
    for (const f of [eventFrame('雷照缺口'), eventFrame('她站起') - 1]) expect(CameraRig(f)).toEqual(CameraRig(eventFrame('雷照缺口')));
    const p = subtitleAt(eventFrame('雷照缺口'));
    const cells = [...crater().destroyed].flatMap((s) => {
      const [i, j, k] = s.split(',').map(Number) as [number, number, number];
      return [-0.5, 0.5].flatMap((dx) => [0, 1].flatMap((dy) => [0, 1].map((dz) => p([i + dx, j + dy, k + dz]))));
    });
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const [lefts, topValues] = [cells.map((s) => clamp01(s.left)), cells.map((s) => clamp01(s.上))];
    expect((Math.max(...lefts) - Math.min(...lefts)) * (Math.max(...topValues) - Math.min(...topValues))).toBeGreaterThanOrEqual(0.25);
    for (const [x, y] of [params.standPos.liYingPos, params.standPos.你])
      for (const q of [[x! - 0.45, y!, 0], [x! + 0.45, y!, 0], [x!, y!, 1.5]]) {
        const s = p(q);
        expect(s.left).toBeGreaterThan(0.02);
        expect(s.left).toBeLessThan(0.98);
        expect(s.上).toBeLessThan(0.98);
      }
  });

  it('她看你、你看她：两下转头各自留够一秒（看得懂的速度）', () => {
    expect(eventFrame('你看她') - eventFrame('她看你')).toBeGreaterThanOrEqual(fps / 2);
    expect(eventFrame('她站起') - eventFrame('你看她')).toBeGreaterThanOrEqual(fps);
  });
});

describe('炸掉一角的屋子（种子 91）', () => {
  const { remainingBlocks, destroyed, drops } = crater();
  const hasBlock = (i: number, j: number, k: number) => remainingBlocks.some((b) => b.位[0] === i && b.位[1] === j && b.位[2] === k);

  it('屋子的格同 地点/门口小木屋.tsx（那边带组件、引不了，读源码对）；后墙补过的那块是 i 1～2、k 0～2', () => {
    const sourceText = readFileSync(fileURLToPath(new URL('./地点/门口小木屋.tsx', import.meta.url)), 'utf8');
    expect(sourceText).toContain(`westWall: ${cabin.westWall}, eastWall: ${cabin.eastWall}, backWall: ${cabin.backWall}`);
    expect(sourceText).toContain('const wallPatch = { i: [1, 2], k: [0, 2] } as const;');
    expect(sourceText).toContain(`chest: [${chestCell[0]}, ${chestCell[1] + 0.5}, ${chestCell[2]}]`);
  });

  it('箱子炸没了，掉出箱子本身；门也炸没了（方块拼搭 画不了箱子、门不掉图标，画面不另画这两样）', () => {
    expect(destroyed.has(posKey(...chestCell))).toBe(true);
    expect(drops.map((d) => d.item)).toContain('minecraft:chest');
    expect(remainingBlocks.filter((b) => /^minecraft:(chest|oak_door)/.test(b.状态))).toEqual([]);
    expect(drops.map((d) => d.item)).not.toContain('minecraft:oak_door');
  });

  it('西南角：那根原木、南墙西半截（i 0～3）炸穿', () => {
    for (let k = 0; k <= 1; k++) expect(hasBlock(cabin.westWall, southWall, k), `原木 k ${k}`).toBe(false);
    for (let i = 1; i <= 3; i++) expect(remainingBlocks.filter((b) => b.位[0] === i && b.位[1] === southWall && b.位[2] >= 0 && b.位[2] <= 1).length, `南墙 i ${i}`).toBe(0);
  });

  it('后墙炸开的格都在第 8 句补过的那块里；屋里东边（i ≥ 4）、东墙一格没炸；屋顶外面（k ≥ 4）完好', () => {
    const backWallBlown = [...destroyed].map((k) => k.split(',').map(Number)).filter(([, j, k]) => j === cabin.backWall && k! >= 0);
    expect(backWallBlown.length).toBeGreaterThan(0);
    for (const [i, , k] of backWallBlown) expect(i! >= 1 && i! <= 2 && k! >= 0 && k! <= 2, `后墙 ${i},${k}`).toBe(true);
    for (const s of destroyed) {
      const [i, j, k] = s.split(',').map(Number);
      if (j! >= southWall && j! <= cabin.backWall && k! >= 0) expect(i!, `屋里 ${s}`).toBeLessThan(4);
      expect(k!, `屋顶 ${s}`).toBeLessThan(4);
    }
  });

  it('掉落物浮在坑里，离你、离她都够远，照原版不会被捡走', () => {
    for (const d of drops) {
      const pos = dropPos(remainingBlocks, d);
      expect(Number.isFinite(pos[2]), d.item).toBe(true);
      expect(playerCanPickUp(pos, params.standPos.你), `你 ${d.item}`).toBe(false);
      expect(playerCanPickUp(pos, params.standPos.liYingPos), `她 ${d.item}`).toBe(false);
    }
  });

  it('箱子里的东西全洒出来（不受衰减）、都停在坑底，和炸出来的几堆隔开半格以上，也不会被捡走（核查 10-24「掉落物多一点、大一点」）', () => {
    const dropped = chestDrops(remainingBlocks);
    expect(dropped.map((d) => d.item)).toEqual(chestContents.map((d) => d.item));
    const allPositions = [...drops.map((d) => dropPos(remainingBlocks, d)), ...dropped.map((d) => d.位)];
    for (const d of dropped) {
      expect(d.位[2], d.item).toBe(-1);
      expect(playerCanPickUp(d.位, params.standPos.你), `你 ${d.item}`).toBe(false);
      expect(playerCanPickUp(d.位, params.standPos.liYingPos), `她 ${d.item}`).toBe(false);
      for (const p of allPositions) if (p !== d.位) expect(Math.hypot(p[0] - d.位[0], p[1] - d.位[1]), d.item).toBeGreaterThan(0.5);
    }
  });

  it('两个人紧挨着炸开的西南角坐（她离屋子西南外角不到 1.7 格、你在她旁边一格多），近景从南边看过去两人并排、都在缺口左边', () => {
    const corner = [cabin.westWall - 0.5, southWall] as const;
    expect(Math.hypot(params.standPos.liYingPos[0] - corner[0], params.standPos.liYingPos[1] - corner[1])).toBeLessThan(1.7);
    expect(Math.hypot(params.standPos.你[0] - params.standPos.liYingPos[0], params.standPos.你[1] - params.standPos.liYingPos[1])).toBeLessThan(1.3);
    const p = subtitleAt(eventFrame('她站起') - 1);
    const [liYingScreen, you, wallGap] = [p([params.standPos.liYingPos[0], params.standPos.liYingPos[1], 0.6]), p([params.standPos.你[0], params.standPos.你[1], 0.6]), p([1.5, southWall, 0.5])];
    expect(liYingScreen.left - you.left).toBeGreaterThan(0.06);
    expect(wallGap.left - liYingScreen.left).toBeGreaterThan(0.12);
  });

  it('她、你坐的那两格地面没炸（顶 z 0）', () => {
    for (const p of [params.standPos.liYingPos, params.standPos.你]) expect(hasBlock(Math.round(p[0]), Math.floor(p[1]), -1), `${p}`).toBe(true);
  });
});

describe('四周的地（用户 10-24「怎么超平坦背景」）', () => {
  it('有起伏：屋子北边一百格里地面高低差至少 4 格；樱花林那道坡比平地高', () => {
    const heights: number[] = [];
    for (let j = 20; j <= 120; j += 5) for (let i = -60; i <= 60; i += 5) heights.push(groundHeight(i, j));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(4);
    expect(groundHeight(-16, 40)).toBeGreaterThanOrEqual(4);
  });

  it('有树：樱花林十几棵、橡树几棵，都长在地形里', () => {
    const t = trees();
    expect(t.filter((x) => x.种 === '樱').length).toBeGreaterThanOrEqual(10);
    expect(t.filter((x) => x.种 === '橡').length).toBeGreaterThanOrEqual(3);
    const m = SurroundBlocks();
    expect(m.cherryGrove.some((b) => b.状态.startsWith('minecraft:cherry_leaves'))).toBe(true);
    expect(m.plains.some((b) => b.状态.startsWith('minecraft:oak_leaves'))).toBe(true);
  });

  it('东北（第 7 句仰机位的右半边）地平线不是一条直线：屋子右后方 80～130 格有一道比平地高 6 格以上的山梁，梁上长着橡树', () => {
    const eye = params.cameraRigs.仰.眼;
    let maxGroundHeight = 0;
    for (let angle = 30; angle <= 50; angle += 2)
      for (let d = 80; d <= 130; d += 4) {
        const r = (angle * Math.PI) / 180;
        maxGroundHeight = Math.max(maxGroundHeight, groundHeight(Math.round(eye[0] + d * Math.sin(r)), Math.floor(eye[1] + d * Math.cos(r))));
      }
    expect(maxGroundHeight).toBeGreaterThanOrEqual(6);
    const beamTrees = trees().filter((t) => t.种 === '橡' && Math.atan2(t.i - eye[0], t.j - eye[1]) > (25 * Math.PI) / 180 && Math.hypot(t.i - eye[0], t.j - eye[1]) > 70);
    expect(beamTrees.length).toBeGreaterThanOrEqual(5);
  });

  it('屋前那块平地和四周接得上：平地边上一圈地面高 0～1', () => {
    for (let i = -17; i <= 17; i++) expect(Math.abs(groundHeight(i, 13)), `i ${i}`).toBeLessThanOrEqual(1);
  });
});

describe('镜头：一个镜头不切', () => {
  it('每一帧眼都在地面以上 1.5 格以上', () => {
    for (const f of allFrames) {
      const eye = CameraRig(f).眼;
      expect(eye[2] - groundHeight(Math.round(eye[0]), Math.floor(eye[1])), `帧 ${f}`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('每一帧和上一帧机位差得不多（没有跳）', () => {
    for (const f of allFrames.slice(1)) {
      const [a, b] = [CameraRig(f - 1), CameraRig(f)];
      expect(Math.hypot(a.眼[0] - b.眼[0], a.眼[1] - b.眼[1], a.眼[2] - b.眼[2]), `帧 ${f}`).toBeLessThan(1.2);
    }
  });

  it('第 6 句：两个人的头、屋檐都在顶上那条下面、画面里；第 6 句放在右下（歌词排版表），两个人的头和脚都在那块字外面（左边）', () => {
    const box = lyricBox(lineText(6), lyricLayoutTable[6]!);
    for (const f of allFrames.filter((x) => x < eventFrame('她站起'))) {
      const p = subtitleAt(f);
      for (const [x, y] of [params.standPos.liYingPos, params.standPos.你])
        for (const z of [0, 1.3]) {
          const s = p([x, y, z]);
          if (z > 0) expect(s.上, `帧 ${f}`).toBeGreaterThan(lyricRatio);
          expect(s.上, `帧 ${f}`).toBeLessThan(1);
          expect(s.left, `帧 ${f}`).toBeGreaterThan(0);
          expect(s.left, `帧 ${f}`).toBeLessThan(box.left - 0.03);
        }
    }
  });

  it('第 7 句被光柱劈成两半（歌词排版表 拨开缝）：光柱起以后，光柱那一竖在两半中间的缝里、碰不到描边', () => {
    const halfGap = ((pushGap / 2 - 1) * runeLyricDefault.glyphScale) / 2560;
    for (const f of allFrames.filter((x) => x >= eventFrame('光柱起'))) {
      const p = subtitleAt(f);
      for (const z of [0, params.cloudBottomHeight, 60]) expect(Math.abs(p([holeCenter()[0], holeCenter()[1], z]).left - 0.5), `帧 ${f}`).toBeLessThan(halfGap - 0.004);
    }
  });

  it('第 7 句：撞云那一点在歌词那条下面（镜头跟着光柱往上抬，拨 时停稳；光柱头冲出画面顶是从歌词中间的缝里过）；她的脚、屋子整座在画面里', () => {
    for (const f of allFrames.filter((x) => x >= eventFrame('光柱起'))) {
      const p = subtitleAt(f);
      if (f >= eventFrame('拨')) expect(p([holeCenter()[0], holeCenter()[1], params.cloudBottomHeight]).上, `帧 ${f}`).toBeGreaterThan(lyricRatio);
      expect(p(params.standPos.liYingPos).上, `帧 ${f}`).toBeLessThan(1);
      for (const x of [cabin.westWall - 1.5, cabin.eastWall + 1.5]) {
        const s = p([x, southWall, 0]);
        expect(s.left, `帧 ${f}`).toBeGreaterThan(0);
        expect(s.left, `帧 ${f}`).toBeLessThan(1);
        expect(s.上, `帧 ${f}`).toBeLessThan(1);
      }
    }
  });
});

describe('第 7 句：魔法阵、光柱、云洞、阳光', () => {
  it('她站起来以前不施法、没有阵', () => {
    expect(LiYingState(eventFrame('她站起') - 1).casting).toBe(false);
    expect(LiYingState(eventFrame('她站起')).casting).toBe(true);
    expect(circleSize(eventFrame('阵起') - 1)).toBe(0);
    expect(circleSize(eventFrame('光柱起'))).toBe(1);
  });

  it('光柱：光柱起 从底往上冲，零点几秒冲出画面顶，拨 那一帧冲到 顶高；光柱退 以后淡掉', () => {
    expect(beamTop(eventFrame('光柱起') - 1, 2)).toBe(2);
    expect(beamTop(eventFrame('拨'), 2)).toBe(params.lightPillar.topHeight);
    const exitFrame = Math.ceil(eventFrame('光柱起') + 0.25 * fps);
    expect(subtitleAt(exitFrame)([holeCenter()[0], holeCenter()[1], beamTop(exitFrame, 2)]).上).toBeLessThan(0);
    expect(beamOpacity(eventFrame('光柱退') - 1)).toBe(1);
    expect(beamOpacity(lastFrame)).toBe(0);
  });

  it('撞云：拨 起亮，破云 以后退掉', () => {
    expect(impactBrightness(eventFrame('拨') - 1)).toBe(0);
    expect(impactBrightness(eventFrame('拨'))).toBeGreaterThan(0);
    expect(impactBrightness(lastFrame)).toBe(0);
  });

  it('云洞：破云 前没有，之后只开不合，镜头止前一帧（段的最后一帧）开到 r2、停到段尾', () => {
    expect(holeRadius(eventFrame('破云') - 1)).toBe(0);
    const fullOpenFrame = shotEndFrame - 1;
    for (let f = eventFrame('破云') + 1; f <= lastFrame; f++) {
      if (f < fullOpenFrame) expect(holeRadius(f), `帧 ${f}`).toBeGreaterThan(holeRadius(f - 1));
      else expect(holeRadius(f), `帧 ${f}`).toBeCloseTo(params.cloudHole.r2, 6);
    }
    expect(holeRadius(lastFrame)).toBeCloseTo(params.cloudHole.r2, 6);
  });

  it('云：破云 前每格都在，段尾洞心 r1 以内的云散完', () => {
    const allCells = cloudCells(() => true);
    for (const c of allCells.slice(0, 200)) expect(cloudRemain(c, eventFrame('破云') - 1)).toBe(1);
    const nearby = allCells.filter((c) => Math.hypot(c.a * 12 + 6 - holeCenter()[0], c.b * 12 + 6 - holeCenter()[1]) < params.cloudHole.r1);
    for (const c of nearby) expect(cloudRemain(c, lastFrame), `${c.a},${c.b}`).toBe(0);
  });

  it('阳光：破云 以后从洞心一小圈铺开，阳光铺地 那一帧铺过整座屋子、之前没铺满', () => {
    expect(sunRadius(eventFrame('破云') - 1)).toBe(0);
    expect(sunRadius(eventFrame('阳光铺地'))).toBeGreaterThanOrEqual(houseFarthest());
    expect(sunRadius(eventFrame('云洞开大'))).toBeLessThan(houseFarthest());
    for (const f of allFrames) expect(glowRegionsAt(f).length, `帧 ${f}`).toBeLessThanOrEqual(16);
  });

  it('洞里的天跟着散完的云格变蓝：破云 前没有；云还在（剩 > 0）的那一格底下透不出满的晴天，散完的格底下是晴天', () => {
    expect(clearSkyAt(eventFrame('破云') - 1)).toBeNull();
    const allCells = cloudCells(() => true);
    const afterCloudBreak = eventFrame('破云') + legacyFrameSec(2) * fps;
    for (const f of [eventFrame('破云'), afterCloudBreak, eventFrame('云洞开大'), lastFrame]) {
      const clearAmount = clearSkyAt(f)!;
      const drift = cloudDrift(f);
      let partialCount = 0, fullyScattered = 0;
      for (const c of allCells) {
        const remain = cloudRemain(c, f);
        const v = clearAmount(c.a * 12 + 6 + drift, c.b * 12 + 6);
        expect(v, `帧 ${f} 格 ${c.a},${c.b}`).toBeCloseTo(1 - remain, 6);
        if (remain > 0 && remain < 1) partialCount++;
        if (remain === 0) fullyScattered++;
      }
      if (f === afterCloudBreak) expect(partialCount + fullyScattered).toBeGreaterThan(0);
    }
  });

  it('转晴：破云 那一帧还是雷雨，阳光铺地 走完', () => {
    expect(clearing(eventFrame('破云'))).toBe(0);
    expect(clearing(eventFrame('阳光铺地'))).toBe(1);
  });
});

describe('天气、雨、声音', () => {
  it('原版的天色、云色：雷雨里云比天亮一档、都比晴天暗', () => {
    const [skyRgb, cloud, clearSky] = [weatherSky(1, params.thunderStrength), cloudColor(1, params.thunderStrength), weatherSky(0, 0)];
    const brightnessOf = (c: readonly number[]) => c[0]! * 0.3 + c[1]! * 0.59 + c[2]! * 0.11;
    expect(brightnessOf(cloud)).toBeGreaterThan(brightnessOf(skyRgb));
    expect(brightnessOf(clearSky)).toBeGreaterThan(brightnessOf(skyRgb));
  });

  it('闪电只在第 6 句', () => {
    expect(allFrames.filter(isFlashing).every((f) => f < eventFrame('她站起'))).toBe(true);
    expect(allFrames.some(isFlashing)).toBe(true);
  });

  it('雨量：破云 前满，阳光铺地 停；透视雨每一帧都有片（雨停前）', () => {
    expect(rainAmount(eventFrame('破云'))).toBe(1);
    expect(rainAmount(eventFrame('阳光铺地'))).toBe(0);
    for (const f of [shotStartFrame, eventFrame('她站起'), eventFrame('拨')]) expect(perspectiveRainPlanes(CameraRig(f).眼).length, `帧 ${f}`).toBeGreaterThan(50);
  });

  it('两段都有雨声；闷雷整个落在 2-雷雨，信标声在 2-拨开阴霾', () => {
    const assetsOf = (seg: typeof thunderSegment) => (seg.声音 ?? []).map((c) => (c as { 资产?: string }).资产);
    expect(assetsOf(thunderSegment).filter((a) => a?.includes('weather.rain')).length).toBeGreaterThan(0);
    expect(assetsOf(clearHazeSegment).filter((a) => a?.includes('weather.rain')).length).toBeGreaterThan(0);
    expect(assetsOf(thunderSegment).filter((a) => a === params.thunderSound.资产).length).toBe(2);
    expect(assetsOf(clearHazeSegment)).toContain(params.beaconSoundParams.资产);
    // 雷声文件前 0.25 秒几乎没声（参.雷声.提前秒），起点可以早于段首被切掉；滚雷那一下（闪）和结尾都在 2-雷雨 里
    expect(eventFrame('第6句闷雷')).toBeGreaterThanOrEqual(thunderWindow.起帧);
    expect(thunder.起帧 + (thunder.帧数 ?? Infinity)).toBeLessThanOrEqual(thunderWindow.止帧);
    expect(nearThunder.起帧 + (nearThunder.帧数 ?? Infinity)).toBeLessThanOrEqual(thunderWindow.止帧);
  });
});
