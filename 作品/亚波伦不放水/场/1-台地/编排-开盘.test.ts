// 第 1、2 幕编排的硬约束：第 2 幕末的状态（第 4 幕的起点）不变、断曜流光冲刺照游戏、两次冲都没碰着她（第一次她瞬移走、第二次从她脚底下过去）、
// 两人站着不动的时间不超过两幕的 20%（用户 11-10 嫌「大部分时间都是在站着不动」）、快的那几下峰值不低于 20 格/秒（用户 11-11「起码得有个 20~30m/s」，慢放那段按世界秒算）、
// 他不穿基座和灵魂火、她不钻进地里。
import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import { skeletonMatrix } from '@engine/model/基岩正解.ts';
import { boneGeometry } from '@engine/model/基岩模型.tsx';


const { teleportTick, stevePos, yaBoLunPos, altarPoint, hoverHeight, afterAppear, steveRightHand, stillCheck, trappedLocal, openingTimeline, actionTable, localGroundHeight, actStart, actEnd, act2End, steveEye } = await import('./编排-开盘.ts');
const openingTimes = await import('./开盘时刻.ts');
const { calcDash, groundElevMax } = await import('../../物品/断曜流光冲刺.ts');
const { openDoneTick } = await import('../../界面/分圈.ts');
const { toWorldSec, toClipSec, slowRateAt } = await import('./开盘拍.ts');
const { baseCells, soulFireCells } = await import('../../特效/安息仪式时序.ts');
const timeline = (await import('./时间线.ts')).default;
const events = timeline.events;
/** 第 4 幕开头（编排的钟）：片上的 开盘完 减去慢放多出来的那段 = 幕末 */
const act4Start = (await import('./齐放拍.ts')).actStart;
const stepSec = 1 / 240;
const speedAt = (posAt: (t: number) => number[], t: number) => {
  const [a, b] = [posAt(t - stepSec / 2), posAt(t + stepSec / 2)];
  return Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!) / stepSec;
};
const relToAltar = (p: readonly number[]) => [p[0]! - altarPoint[0], p[1]! - altarPoint[1], p[2]! - altarPoint[2]];

describe('第 1、2 幕编排', () => {
  it('第 2 幕末：她在西北高位 停住、杖指他、盘全开；他在 受困本地 站住、拿着剑；到第 4 幕开头都不动', () => {
    const yaBoLun = yaBoLunPos(act4Start);
    expect(yaBoLun[0]).toBeCloseTo(altarPoint[0] + openingTimes.endLocal[0], 9);
    expect(yaBoLun[1]).toBeCloseTo(altarPoint[1] + openingTimes.endLocal[1], 9);
    expect(yaBoLun[2]).toBeCloseTo(altarPoint[2] + hoverHeight, 9);
    // 第 2 幕的钟走世界秒，比片秒短；第 4 幕的钟减掉慢放多出来的，开头正好是 幕末
    expect(act4Start).toBeCloseTo(actEnd, 9);
    expect(afterAppear(events.wheelOpenDone.sec)).toBeGreaterThan(actEnd);
    for (const t of [actEnd, actEnd + 0.3]) expect(Math.hypot(...yaBoLunPos(t).map((x, i) => x - yaBoLun[i]!))).toBeLessThan(1e-9);
    const steve = stevePos(act4Start);
    for (const t of [actEnd, actEnd - 0.1]) expect(Math.hypot(...stevePos(t).map((x, i) => x - steve[i]!))).toBeLessThan(1e-9);
    // 受困本地 [8, −6]：x 东、y 北；场景坐标里 祭坛点 往东 8、往北 −6（真下界场景是平移，不转）
    expect(steve[0] - altarPoint[0]).toBeCloseTo(trappedLocal[0], 6);
    expect(steve[1] - altarPoint[1]).toBeCloseTo(trappedLocal[1], 6);
    expect(steveRightHand(act4Start)).toBe('剑');
    expect(openingTimeline.at(-1)!.pose).toBe('侧身定杖');
    expect(openingTimeline.at(-1)!.dest!).toBeLessThan(actEnd);
    expect(act2End.disc.刻).toBeGreaterThanOrEqual(openDoneTick(3));
    // 末了站直了（眼高 1.62），第 4 幕的 眼高 照这个
    expect(steveEye(actEnd)[2] - steve[2]).toBeCloseTo(1.62, 2);
    console.log(`第 2 幕末（编排的钟 ${actEnd.toFixed(3)} 秒）：她脚底本地 ${relToAltar(act2End.yaBoLunPos).map((x) => x.toFixed(2))}、朝向 ${act2End.yaBoLunFacing.toFixed(1)} 度；他脚底本地 ${relToAltar(act2End.stevePos).map((x) => x.toFixed(2))}、朝向 ${act2End.steveFacing.toFixed(1)} 度；盘张开后 ${act2End.disc.刻.toFixed(1)} 刻`);
  });

  it('断曜流光冲刺照游戏：平地上一刻 3.6 格、视线不往上 10.8 格、仰 2～2.5 度 15.8 格；两次冲正好停在下一次的起点和受困位', () => {
    const flatSprint = (elevationDeg: number) => calcDash({ start: [0, 0, 0], dir: [1, 0], elevationDeg, groundHeight: () => 0 });
    expect(flatSprint(0).points[1]![0]).toBeCloseTo(3.6, 9);
    expect(flatSprint(0).farDist).toBeCloseTo(3.6 + (3.6 * 0.91) / (1 - 0.6 * 0.91), 1);
    expect(flatSprint(groundElevMax - 0.01).landTick).toBe(1);
    expect(flatSprint(groundElevMax + 0.01).landTick).toBe(2);
    expect(flatSprint(2.25).farDist).toBeCloseTo(15.82, 1);
    expect(openingTimes.firstDash.landTick).toBe(3);
    expect(openingTimes.secondDash.landTick).toBe(1);
    for (const [trail, position, spacing, stoppingDistance] of [[openingTimes.firstDash, openingTimes.hoverFirst, 24, 39.7], [openingTimes.secondDash, openingTimes.hoverSecond, 18, 24.19]] as const) {
      const [begin, nextTick] = trail.points;
      expect(Math.hypot(position[0] - begin![0], position[1] - begin![1])).toBeCloseTo(spacing, 6);
      expect(Math.hypot(nextTick![0] - begin![0], nextTick![1] - begin![1]) * 20).toBeCloseTo(180, 0);
      expect(trail.farDist).toBeCloseTo(stoppingDistance, 2);
    }
    expect(openingTimes.secondElevationDeg).toBeLessThanOrEqual(groundElevMax);
    const secondDashEnd = openingTimes.secondDash.points.at(-1)!;
    expect(Math.hypot(secondDashEnd[0] - trappedLocal[0], secondDashEnd[1] - trappedLocal[1])).toBeLessThan(0.01);
  });

  it('两次冲都没碰着她：第一次他冲到之前她已经挪走；第二次他从她脚底下过去，旋风顶上离她脚底还有 0.4 格以上', () => {
    // 他横躺着冲（头朝前，长 1.8 格），外面一层旋风半径 0.7：他身子前端离她那一竖条（她脚底到头顶）水平不到 0.9 格算碰着
    const frontSide = (w: number) => {
      const p = openingTimes.steveSecondLocal(w);
      const dir = w < openingTimes.beats.dashSecondSec ? openingTimes.firstDir : openingTimes.secondDir;
      return [p[0] + dir[0] * 1.8, p[1] + dir[1] * 1.8, p[2]];
    };
    let nearestDist = Infinity;
    for (let w = openingTimes.beats.dashFirstSec; w < openingTimes.beats.移; w += 1 / 240) {
      const [p, q] = [frontSide(w), openingTimes.yaBoLunSecondLocal(w)];
      nearestDist = Math.min(nearestDist, Math.hypot(p[0]! - q[0], p[1]! - q[1]));
    }
    let secondMinClear = Infinity;
    for (let w = openingTimes.beats.dashSecondSec; w < openingTimes.beats.dashSecondSec + 0.6; w += 1 / 240) {
      const p = openingTimes.steveSecondLocal(w);
      const q = openingTimes.yaBoLunSecondLocal(w);
      // 他身子那一段（脚底到前端）离她水平不到 0.9 格的时候，比高
      for (let u = 0; u <= 1.8; u += 0.1) {
        const [x, y] = [p[0] + openingTimes.secondDir[0] * u, p[1] + openingTimes.secondDir[1] * u];
        if (Math.hypot(x - q[0], y - q[1]) < 0.9) secondMinClear = Math.min(secondMinClear, q[2] - (p[2] + 0.3 + 0.7));
      }
    }
    console.log(`第一次冲：她挪走之前他身子前端离她最近 ${nearestDist.toFixed(2)} 格；第二次冲：他从她底下过去时旋风顶离她脚底最少 ${secondMinClear.toFixed(2)} 格`);
    expect(nearestDist).toBeGreaterThan(0.9);
    expect(Number.isFinite(secondMinClear)).toBe(true);
    expect(secondMinClear).toBeGreaterThan(0.4);
  });

  it('快的那几下峰值不低于 20 格/秒（世界秒；慢放那段另列片上看着多快），列成表', () => {
    const reportLines = actionTable.map((action) => {
      const posAt = action.who === '史蒂夫' ? stevePos : yaBoLunPos;
      let [peak, peakTime] = [0, 0];
      for (let t = action.start + stepSec; t < action.end - stepSec; t += stepSec)
        if (Math.abs(t - teleportTick) > stepSec) {
          const v = speedAt(posAt, t);
          if (v > peak) [peak, peakTime] = [v, t];
        }
      const clipSec = toClipSec(peakTime - actStart);
      return { ...action, 峰: peak, clipSpeed: peak * slowRateAt(clipSec) };
    });
    console.log(['第 2 幕每一下的峰值速度（格/秒）：', ...reportLines.map((r) => `  ${r.who} ${r.name}（编排 ${r.start.toFixed(2)}～${r.end.toFixed(2)}）：${r.峰.toFixed(1)}${r.slowMo ? `，片上 ${r.clipSpeed.toFixed(1)}` : ''}`)].join('\n'));
    for (const r of reportLines) expect(r.峰, `${r.who} ${r.name}`).toBeGreaterThanOrEqual(20);
  });

  it('第 2 幕里他不穿基座、灵魂火和地面，她不钻进地里', () => {
    const halfWidth = 0.3;
    for (let t = actStart; t < actEnd; t += 1 / 120) {
      const [x, y, feetZ] = relToAltar(stevePos(t)) as [number, number, number];
      for (const [i, j] of [...baseCells, ...soulFireCells]) {
        const topY = soulFireCells.some(([a, b]) => a === i && b === j) ? 2 : 1;
        const collides = Math.abs(x - i) < 0.5 + halfWidth && Math.abs(y - j) < 0.5 + halfWidth && feetZ < topY;
        expect(collides, `${t.toFixed(2)} 秒他撞上 (${i}, ${j})`).toBe(false);
      }
      expect(feetZ, `${t.toFixed(2)} 秒他钻进地里`).toBeGreaterThanOrEqual(localGroundHeight(x, y) - 1e-6);
      const yaBoLun = relToAltar(yaBoLunPos(t));
      const yaBoLunAboveGround = yaBoLun[2]! - localGroundHeight(yaBoLun[0]!, yaBoLun[1]!);
      expect(yaBoLunAboveGround, `${t.toFixed(2)} 秒她钻进地里`).toBeGreaterThan(0.15);
      // 她飞出来不从灵魂火上穿过去（火苗高到 2 格，她宽 0.6）
      for (const [i, j] of soulFireCells) expect(Math.abs(yaBoLun[0]! - i) < 0.8 && Math.abs(yaBoLun[1]! - j) < 0.8 && yaBoLun[2]! < 2.2, `${t.toFixed(2)} 秒她穿过灵魂火 (${i}, ${j})`).toBe(false);
    }
  });

  it('慢放：世界秒、片秒互逆，世界钟一阶连续、单调', () => {
    for (let s = 0; s < events.wheelOpenDone.sec - events.summonDone.sec; s += 0.01) {
      expect(toClipSec(toWorldSec(s))).toBeCloseTo(s, 6);
      expect(toWorldSec(s + 0.001) - toWorldSec(s)).toBeGreaterThan(0);
      expect(Math.abs((toWorldSec(s + 0.002) - toWorldSec(s + 0.001)) - (toWorldSec(s + 0.001) - toWorldSec(s)))).toBeLessThan(1e-5);
    }
  });

  it('两人站着不动的时间加起来不超过两幕总长的 20%', () => {
    const [startSec, end] = [afterAppear(events.开始.sec), actEnd];
    const stepSec = 1 / 60;
    let [steveStill, yaBoLunSteps] = [0, 0];
    for (let t = startSec; t < end; t += stepSec) {
      if (stillCheck.steve(t)) steveStill += stepSec;
      if (stillCheck.yaBoLun(t)) yaBoLunSteps += stepSec;
    }
    const share = (steveStill + yaBoLunSteps) / (end - startSec);
    console.log(`第 1、2 幕共 ${(end - startSec).toFixed(2)} 秒（世界秒）：史蒂夫静止 ${steveStill.toFixed(2)} 秒，亚波伦静止 ${yaBoLunSteps.toFixed(2)} 秒，合计占 ${(share * 100).toFixed(1)}%`);
    expect(share).toBeLessThanOrEqual(0.2);
  });
});

describe('2-03 绕拍（用户 11-11「我要环绕 180 度」）', async () => {
  const { orbitBeat, orbitAzimuth, orbitRel, orbitRig } = await import('./绕拍.ts');
  const { projectToScreen } = await import('../../界面/指杖机位.ts');
  const times = Array.from({ length: Math.floor((orbitBeat.end - orbitBeat.start) * 60) + 1 }, (_, i) => orbitBeat.start + i / 60);

  it('世界里绕 180 度；扣掉她提前转正的 32 度仍有超过四分之一圈的独立绕拍', () => {
    expect(orbitAzimuth(orbitBeat.end) - orbitAzimuth(orbitBeat.start)).toBeCloseTo(180, 6);
    // 相对角逐帧累加（跨 ±180 不跳）
    let totalDeg = 0;
    for (let i = 1; i < times.length; i++) {
      if (times[i]! < orbitBeat.orbit[0]) continue;
      totalDeg += ((((orbitRel(times[i]!) - orbitRel(times[i - 1]!) + 180) % 360) + 360) % 360) - 180;
    }
    expect(totalDeg).toBeGreaterThanOrEqual(118);
  });

  it('她整个在画里，头不顶到血条底下（八版 10.6～10.9 秒顶着血条）；机位不入地', () => {
    for (const s of times) {
      const t = actStart + toWorldSec(s);
      const c = orbitRig(s);
      const p = yaBoLunPos(t);
      const headScreen = projectToScreen(c, 16 / 9, [p[0], p[1], p[2] + 2]);
      const feetScreen = projectToScreen(c, 16 / 9, p);
      // 血条（亚波伦血条 s=2）底边约在画面高 0.2
      expect(headScreen.y, `片秒 ${s.toFixed(3)}`).toBeGreaterThan(0.25);
      expect(feetScreen.y, `片秒 ${s.toFixed(3)}`).toBeLessThan(0.9);
      for (const q of [headScreen, feetScreen]) expect(q.x).toBeGreaterThan(0.15), expect(q.x).toBeLessThan(0.85), expect(q.depth).toBeGreaterThan(1);
      expect(c.pos[2] - altarPoint[2] - localGroundHeight(c.pos[0] - altarPoint[0], c.pos[1] - altarPoint[1])).toBeGreaterThanOrEqual(0.8 - 1e-9);
    }
  });

  it('实际右手持杖与机位反向旋转；定杖时人物在左、杖尖在右，跨幕不换手', async () => {
    const { perform } = await import('./编排-开盘.ts');
    const { releaseRig } = await import('./绕拍.ts');
    const sample = (frame: number) => {
      const time = frame / 60;
      const wand = perform.杖(actStart + toWorldSec(time));
      const rig = orbitRig(time), actorTime = actStart + toWorldSec(time);
      return { wand, camera: orbitAzimuth(time), screen: projectToScreen(rig, 16 / 9, wand.tip), actor: projectToScreen(rig, 16 / 9, yaBoLunPos(actorTime)) };
    };
    const start = sample(115), mid = sample(169), end = sample(241);
    const azimuth = (snap: typeof start) => Math.atan2(snap.wand.axis[1], snap.wand.axis[0]);
    expect(azimuth(start) - azimuth(end)).toBeGreaterThan(Math.PI / 6);
    expect(end.camera - mid.camera).toBeGreaterThan(10);
    expect(end.actor.x).toBeLessThan(0.48);
    expect(end.screen.x).toBeGreaterThan(0.52);
    expect(end.screen.x - end.actor.x).toBeGreaterThan(0.09);
    expect(releaseRig(0)).toEqual(orbitRig(orbitBeat.end));
  });

  it('正片开盘全开近景：双眼不隔盘、脸朝镜头，盘完整且比人物小', async () => {
    const { perform, wheelPlace, wheelRadius, act2WheelParams } = await import('./编排-开盘.ts');
    const { actTwoShotTable } = await import('../../段/2-开盘/画面.tsx');
    const { pickShot } = await import('./台地场.tsx');
    const { animSkeletonTable, GirlYaBoLunCreature } = await import('../../角色/娘化亚波伦.tsx');
    const { pictureSelfCheck } = await import('../../界面/指杖机位.ts');
    const { staffTipPlatePose } = await import('../../界面/杖尖盘位姿.ts');
    const model = GirlYaBoLunCreature.getModel();
    const bodyMeshes = model.bones.filter(part => part.name === 'mao' || part.parent === 'RightFoot' || part.parent === 'LeftFoot').map(part => {
      const geometry = boneGeometry(part, model.texW, model.texH)!;
      const vertices = geometry.getAttribute('position');
      const points = Array.from({ length: vertices.count }, (_, index) => new Vector3().fromBufferAttribute(vertices, index));
      geometry.dispose();
      return { name: part.name, points };
    });
    const release = await import('./编排-齐放.ts');
    const { releaseRig } = await import('./绕拍.ts');
    const peakFrame = Math.round(orbitBeat.end * 60);
    for (const frame of [221, 222, 223, 224, 231, 241, peakFrame]) {
      const peak = frame === peakFrame;
      const sec = frame / 60, time = peak ? release.secAt(0) : actStart + toWorldSec(sec);
      const cameraRig = peak ? releaseRig(0) : pickShot(actTwoShotTable, sec, orbitBeat.end).cameraRig;
      const actor = peak ? release.perform : perform;
      const { props } = actor.在(time);
      const skeleton = blendLayers([{ skeleton: animSkeletonTable(props.sec, props.act) }, { skeleton: props.bonePose }], 'TLM');
      const world = new Matrix4().makeRotationZ((props.pose.yaw ?? 0) * Math.PI / 180).setPosition(...props.pose.loc);
      const bone = (name: string) => world.clone().multiply(skeletonMatrix(model, name, skeleton, GirlYaBoLunCreature.definition.scale));
      const direction = new Vector3(0, 0, -1).transformDirection(bone('Head')).toArray();
      const bodyPoints = bodyMeshes.flatMap(mesh => {
        const matrix = bone(mesh.name);
        return mesh.points.map(point => point.clone().applyMatrix4(matrix).toArray());
      });
      const staff = actor.杖(time), plate = staffTipPlatePose(staff, wheelPlace);
      expect((peak ? release.wheelParams(time) : act2WheelParams(time))!.刻).toBeGreaterThanOrEqual(openDoneTick(3));
      for (const eye of ['ysmGlowLeftEyesBase', 'ysmGlowRightEyesBase']) {
        const face = new Vector3().setFromMatrixPosition(bone(eye)).toArray();
        const check = pictureSelfCheck({ cameraRig, aspectRatio: 16 / 9, 心: plate.心, d: plate.normal, radius: wheelRadius, staffTail: staff.tail, face, faceDir: direction, bodyDir: direction, bodyPoints });
        if (peak && eye === 'ysmGlowRightEyesBase') console.log(`蓄光峰值占画高：人物 ${(100 * check.bodyHeightFrac).toFixed(1)}%，盘 ${(100 * (check.discBox[3] - check.discBox[1])).toFixed(1)}%`);
        expect(check.faceDistToEdge).toBeGreaterThan(0.10);
        expect(check.faceTowardShot).toBeGreaterThan(0.8);
        expect(check.shortLongRatio).toBeGreaterThan(0.75);
        expect(check.bodyBox[1]).toBeGreaterThan(0.20);
        expect(check.bodyBox[3]).toBeLessThan(0.98);
        expect(check.bodyHeightFrac).toBeGreaterThan(0.60);
        expect(check.discBox[3] - check.discBox[1]).toBeGreaterThan(0.50);
        expect(check.plateToHerRatio).toBeLessThan(0.9);
        expect(check.plateInFrame).toBe(1);
      }
    }
  });
});
