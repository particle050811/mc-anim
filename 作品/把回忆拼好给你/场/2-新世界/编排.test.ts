import { describe, expect, it } from 'vitest';
import { fps, mainCutEvents } from '../../分镜.ts';
import { skyBrightness } from '../../地点/天体.ts';
import { sectionColumn, crossSectionBlocks, stripBlocks, groundHeight, plainsFlower, trees, NewWorldBlocks } from './地形.ts';
import { you, crossSection, terrainRange, terrainFog, pit, cameraRigs, cherryGrove, chatOverlay, farHills, farGroves, fogColor, type CameraRigFrame } from './参数.ts';
import { youAt, settleFrame, skyTickAt, peeledRows, cameraRigAt, chatTickAt, walk } from './编排.ts';
import { starBrightness, starList, starDirAt } from './星.ts';

const pushDoneFrame = mainCutEvents.openingPushDone.帧;

/** 透视机位下一个点在成片（2560×1440）上的 y：针孔投影，z 朝上 */
const filmY = (rig: CameraRigFrame, p: readonly number[]) => {
  const d = [0, 1, 2].map((i) => p[i]! - rig.眼[i]!);
  const f0 = [0, 1, 2].map((i) => rig.看[i]! - rig.眼[i]!);
  const fl = Math.hypot(...f0);
  const F = f0.map((v) => v / fl);
  // 右 = F × 上(0,0,1)，上' = 右 × F
  const R0 = [F[1]!, -F[0]!, 0];
  const rl = Math.hypot(...R0);
  const R = R0.map((v) => v / rl);
  const U = [R[1]! * F[2]! - R[2]! * F[1]!, R[2]! * F[0]! - R[0]! * F[2]!, R[0]! * F[1]! - R[1]! * F[0]!];
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
  const ndc = dot(d, U) / (dot(d, F) * Math.tan((rig.fov * Math.PI) / 360));
  return ((1 - ndc) / 2) * 1440;
};

describe('新世界的地形', () => {
  it('出生点那格地面顶在 0，周围压平', () => {
    expect(groundHeight(0, 0)).toBe(0);
    for (const [i, j] of [[1, 0], [0, 1], [-1, -1], [1, 3]]) expect(Math.abs(groundHeight(i!, j!))).toBeLessThanOrEqual(1);
  });
  it('樱花林：落定时朝镜头这一边在雾前面（后半片按原版的雾淡进雾里）；落到剖面时林子还在地平线上、没全进雾', () => {
    const distanceTo = (rig: { 眼: readonly number[] }) => Math.hypot(cherryGrove.心[0] - rig.眼[0]!, cherryGrove.心[1] - rig.眼[1]!);
    expect(distanceTo(cameraRigs.落定) - cherryGrove.forestRadius).toBeLessThan(terrainFog.起);
    expect(distanceTo(cameraRigs.落定)).toBeLessThan(terrainFog.止);
    expect(distanceTo(cameraRigs.剖面) - cherryGrove.forestRadius).toBeLessThan(terrainFog.起);
  });
  it('原版的雾色：平原 12 区块（#c0d8ff 往天色 #78a7ff 拉 14.6%）', () => {
    expect(fogColor).toBe('#b5d1ff');
  });
  it('方块定死（铺两次一样多）、樱花林里有樱花树叶和粉红花簇、平原里没有', () => {
    const a = NewWorldBlocks(), b = NewWorldBlocks();
    expect(a.plains.length).toBe(b.plains.length);
    expect(a.cherryGrove.length).toBe(b.cherryGrove.length);
    expect(a.cherryGrove.some((x) => x.状态.startsWith('minecraft:cherry_leaves'))).toBe(true);
    expect(a.cherryGrove.some((x) => x.状态.startsWith('minecraft:pink_petals'))).toBe(true);
    expect(a.plains.some((x) => x.状态.includes('cherry'))).toBe(false);
  });
  it('樱花树照原版长出斜枝：有横着的樱花原木（axis=x 或 z），叶子团挂在枝头', () => {
    const { cherryGrove: cherryBlocks } = NewWorldBlocks();
    expect(cherryBlocks.some((x) => x.状态 === 'minecraft:cherry_log[axis=x]' || x.状态 === 'minecraft:cherry_log[axis=z]')).toBe(true);
    const logs = cherryBlocks.filter((x) => x.状态.startsWith('minecraft:cherry_log'));
    const leaves = cherryBlocks.filter((x) => x.状态 === 'minecraft:cherry_leaves');
    expect(leaves.length).toBeGreaterThan(logs.length * 3);
  });
  it('树枝树叶不钻进地里', () => {
    const { cherryGrove: cherryBlocks, plains: plains } = NewWorldBlocks();
    for (const b of [...cherryBlocks, ...plains]) if (/log|leaves/.test(b.状态)) expect(b.位[2]).toBeGreaterThanOrEqual(groundHeight(b.位[0], b.位[1]));
  });
  it('平原的花照原版 flower_plain：出生点到樱花林这一路上有郁金香，也有别的花', () => {
    const flowers = new Set<string>();
    for (let j = 0; j <= terrainRange.plantRadius; j += 2) for (let i = -40; i <= 60; i += 2) flowers.add(plainsFlower(i, j));
    expect([...flowers].some((x) => x.endsWith('_tulip'))).toBe(true);
    expect(flowers.has('minecraft:dandelion')).toBe(true);
    expect([...flowers].some((x) => /poppy|azure_bluet|oxeye_daisy|cornflower/.test(x))).toBe(true);
  });
  it('地平线不是一条直线（用户 10-24「超平坦背景 合理吗？」）：远处一圈起伏的山，樱花林那个方向让开；远处有两片树林', () => {
    const ringOffsets = (r: number) =>
      Array.from({ length: 72 }, (_, k) => {
        const a = (k / 72) * Math.PI * 2;
        return groundHeight(Math.round(Math.sin(a) * r), Math.round(Math.cos(a) * r));
      });
    // 起点以内是平原，远山不碰出生点那片
    expect(Math.max(...ringOffsets(farHills.起 - 2).map(Math.abs))).toBeLessThanOrEqual(3);
    const far = ringOffsets(120);
    expect(Math.max(...far) - Math.min(...far)).toBeGreaterThanOrEqual(6);
    expect(far.filter((h) => h >= 4).length).toBeGreaterThan(10);
    const allTrees = trees();
    for (const grove of farGroves) expect(allTrees.filter((t) => Math.hypot(t.i - grove.心[0], t.j - grove.心[1]) <= grove.radius).length).toBeGreaterThanOrEqual(5);
  });
  it('樱花林的山不是同心圆：同一个离心距离上，各方向的高差得出两格以上', () => {
    const heights = Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return groundHeight(Math.round(cherryGrove.心[0] + Math.cos(a) * 28), Math.round(cherryGrove.心[1] + Math.sin(a) * 28));
    });
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(2);
  });
});

describe('剖面', () => {
  const onGround = (bs: readonly { 状态: string; 位: readonly number[] }[], i: number, j: number) =>
    bs.filter((b) => b.位[0] === i && b.位[1] === j && b.位[2]! >= groundHeight(i, j) - 1).map((b) => `${b.状态}@${b.位[2]}`);
  it('坑那一格和左右几格是平地（地面顶 0），坑够深：挖三格后站在泥土上', () => {
    for (let di = -2; di <= 2; di++) expect(groundHeight(pit.i + di, pit.j)).toBe(0);
    expect(groundHeight(pit.i, pit.j + 1)).toBe(0);
    const pitColumn = crossSectionBlocks({ dugCount: pit.depth, dirtCovered: false }).filter((b) => b.位[0] === pit.i && b.位[1] === pit.j);
    expect(Math.max(...pitColumn.map((b) => b.位[2]))).toBe(-pit.depth - 1);
  });
  it('还没挖、没撤的时候，剖面那两截地面上的东西和 新世界方块 一样（只是坑左右不长草），镜头落下来前看不出换过', () => {
    const fullWorld = NewWorldBlocks().plains;
    const section = crossSectionBlocks({ dugCount: 0, dirtCovered: false }), peeled = stripBlocks(0);
    for (let i = pit.i - crossSection.stripHalfWidth; i <= pit.i + crossSection.stripHalfWidth; i++) {
      for (const j of [pit.j - crossSection.stripRows, pit.j - 3, pit.j - 1]) expect(onGround(peeled, i, j)).toEqual(onGround(fullWorld, i, j));
      if (Math.abs(i - pit.i) > crossSection.grassClearDist) for (const j of [pit.j, pit.j + 1]) expect(onGround(section, i, j)).toEqual(onGround(fullWorld, i, j));
    }
  });
  it('剖面列：坑这一排、后墙那一排是「剖」，坑和镜头之间的几排是「剥」', () => {
    expect(sectionColumn(pit.i, pit.j)).toBe('剖');
    expect(sectionColumn(pit.i, pit.j + 1)).toBe('剖');
    expect(sectionColumn(pit.i, pit.j - 1)).toBe('剥');
    expect(sectionColumn(pit.i, pit.j + 2)).toBeNull();
    expect(sectionColumn(pit.i, pit.j - crossSection.stripRows - 1)).toBeNull();
  });
  it('挖三填一：坑那一格按挖掉的格数空出来，填土在草方块原来的位置；后墙草方块以下压暗', () => {
    const isPitCell = (pitState: { dugCount: number; dirtCovered: boolean }) => crossSectionBlocks(pitState).filter((b) => b.位[0] === pit.i && b.位[1] === pit.j).map((b) => b.位[2]);
    expect(isPitCell({ dugCount: 0, dirtCovered: false })).toContain(-1);
    expect(isPitCell({ dugCount: 2, dirtCovered: false })).not.toContain(-2);
    expect(isPitCell({ dugCount: 2, dirtCovered: false })).toContain(-3);
    expect(isPitCell({ dugCount: 3, dirtCovered: true })).toContain(-1);
    expect(isPitCell({ dugCount: 3, dirtCovered: true })).not.toContain(-2);
    const backWall = crossSectionBlocks({ dugCount: 3, dirtCovered: false }).filter((b) => b.位[0] === pit.i && b.位[1] === pit.j + 1);
    expect(backWall.find((b) => b.位[2] === -1)?.brightness).toBeUndefined();
    expect(backWall.find((b) => b.位[2] === -2)?.brightness).toBe(crossSection.backWallLight);
  });
  it('撤排：剖开那一帧撤第一排，第 2 句首字前全撤完', () => {
    expect(peeledRows(mainCutEvents.groundCutaway.帧 - 1)).toBe(0);
    expect(peeledRows(mainCutEvents.groundCutaway.帧)).toBe(1);
    expect(peeledRows(pushDoneFrame - 1)).toBe(crossSection.stripRows);
    expect(stripBlocks(crossSection.stripRows)).toEqual([]);
  });
  it('剖面镜头：你站着的头顶在歌词那一条下面，坑底在画面里', () => {
    const section = cameraRigs.剖面;
    expect(filmY(section, [pit.i + 0.5, pit.j + 0.5, 1.8])).toBeGreaterThan(189 + 20);
    expect(filmY(section, [pit.i + 0.5, pit.j, -pit.depth])).toBeLessThan(1440 - 60);
    // 地面线在画面中间偏下，地平线在上半截
    const groundLineY = filmY(section, [pit.i + 0.5, pit.j, 0]);
    expect(groundLineY).toBeGreaterThan(720);
    expect(groundLineY).toBeLessThan(840);
  });
});

describe('镜头、时间', () => {
  it('钻完落定，起步前不动；起步后往剖面落，剖开那一帧落到，之后不动', () => {
    expect(cameraRigAt(1, mainCutEvents.startWalking.帧)).toEqual({ ...cameraRigs.落定, 眼: [...cameraRigs.落定.眼], 看: [...cameraRigs.落定.看] });
    const camMid = cameraRigAt(1, mainCutEvents.startWalking.帧 + 1);
    expect(Math.abs(camMid.眼[2] - cameraRigs.落定.眼[2])).toBeLessThan(0.1);
    for (const f of [mainCutEvents.groundCutaway.帧, pushDoneFrame - 1, pushDoneFrame + 1.25 * fps]) {
      const rig = cameraRigAt(1, f);
      rig.眼.forEach((v, i) => expect(v).toBeCloseTo(cameraRigs.剖面.眼[i]!, 9));
      expect(rig.fov).toBeCloseTo(cameraRigs.剖面.fov, 9);
    }
  });
  it('天：第 1 句整句天亮 1（看不见星星）；第 2 句首字起天亮缓起缓停地掉，填土那一拍黑透（星星满亮），之后照真时间走，不往回走', () => {
    const fillDirt = mainCutEvents.fillHole.帧;
    for (let f = mainCutEvents.joinGame.帧; f <= pushDoneFrame; f++) expect(skyBrightness(skyTickAt(f))).toBe(1);
    expect(skyBrightness(skyTickAt(pushDoneFrame + 1))).toBeLessThan(1);
    // 天黑铺满第 2 句首字到填土：中间那一帧天亮一半左右，挖第一格时还亮
    expect(skyBrightness(skyTickAt(Math.round((pushDoneFrame + fillDirt) / 2)))).toBeCloseTo(0.5, 1);
    expect(skyBrightness(skyTickAt(mainCutEvents.digFirst.帧))).toBeGreaterThan(0.8);
    expect(skyBrightness(skyTickAt(fillDirt - 1))).toBeGreaterThan(0);
    expect(skyBrightness(skyTickAt(fillDirt))).toBe(0);
    expect(starBrightness(skyTickAt(fillDirt))).toBeCloseTo(0.5, 6);
    // 第 1 句看不见星星：加到天上的 星亮² × 255 四舍五入是 0
    expect(Math.round(starBrightness(skyTickAt(pushDoneFrame)) ** 2 * 255)).toBe(0);
    for (let f = mainCutEvents.joinGame.帧 + 1; f < fillDirt + (40 * fps) / 24; f++) expect(skyTickAt(f)).toBeGreaterThan(skyTickAt(f - 1));
  });
  it('聊天栏的钟：「Steve加入了游戏」剖开那一帧正好 200 刻（原版那一行消失），淡掉的 20 刻铺在剖开前 聊天.淡秒 里；之前一直在走', () => {
    const cutOpenFrame = mainCutEvents.groundCutaway.帧;
    expect(chatTickAt(mainCutEvents.joinGame.帧)).toBe(0);
    expect(chatTickAt(cutOpenFrame)).toBeCloseTo(200, 9);
    expect(chatTickAt(cutOpenFrame - chatOverlay.fadeSec * fps)).toBeCloseTo(180, 9);
    for (let f = mainCutEvents.joinGame.帧 + 1; f < pushDoneFrame; f++) expect(chatTickAt(f)).toBeGreaterThan(chatTickAt(f - 1));
  });
});

describe('你', () => {
  it('起步前站在出生点；起步后朝坑那一格走，停在格子正中、不越过；第 2 句首字前转身朝东、低头', () => {
    expect(youAt(mainCutEvents.startWalking.帧 - 1).feet).toEqual(you.feet);
    let prevDistance = 0;
    for (let f = mainCutEvents.startWalking.帧; f <= pushDoneFrame; f++) {
      const p = youAt(f).feet;
      const d = Math.hypot(p[0] - you.feet[0], p[1] - you.feet[1]);
      expect(d).toBeGreaterThanOrEqual(prevDistance - 1e-9);
      prevDistance = d;
    }
    const settled = youAt(settleFrame);
    expect(settled.feet[0]).toBeCloseTo(pit.i + 0.5, 2);
    expect(settled.feet[1]).toBeCloseTo(pit.j + 0.5, 2);
    expect(settled.stride).toBeLessThan(0.05);
    const lastPose = youAt(pushDoneFrame - 1);
    expect(lastPose.facing).toBe(-90);
    expect(lastPose.头).toBe(-90);
  });
  it('原版走速 4.317：按住走一秒（起步加速一点点）差不多 4 格；松开以后滑一小段停下', () => {
    expect(walk(20).出).toBeGreaterThan(3.5);
    expect(walk(1000).出).toBeCloseTo(Math.hypot(pit.i + 0.5 - you.feet[0], pit.j + 0.5 - you.feet[1]), 6);
  });
});

describe('星星（原版 createStars）', () => {
  it('落在单位球壳里的才算：一千多颗、都是单位向量，半边 0.15～0.25', () => {
    expect(starList.length).toBeGreaterThan(700);
    expect(starList.length).toBeLessThan(1500);
    for (const s of starList) {
      expect(Math.hypot(...s.dir)).toBeCloseTo(1, 9);
      expect(s.半边).toBeGreaterThanOrEqual(0.15);
      expect(s.半边).toBeLessThan(0.25);
    }
  });
  it('天球照原版转：正午头顶的那一点，日出时在正东、午夜在脚下', () => {
    const topCap = { dir: [0, 1, 0] as const, 半边: 0.2 };
    starDirAt(topCap, 6000).forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i]!, 6));
    const starDirs = starDirAt(topCap, 0);
    expect(starDirs[0]).toBeGreaterThan(0.9);
    expect(Math.abs(starDirs[1])).toBeLessThan(1e-9);
    expect(starDirAt(topCap, 18000)[2]).toBeCloseTo(-1, 6);
  });
  it('白天没有星星，夜里亮 0.5', () => {
    expect(starBrightness(6000)).toBe(0);
    expect(starBrightness(18000)).toBeCloseTo(0.5, 9);
  });
});
