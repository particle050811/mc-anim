// 分圈算法和排盘：每圈格数加起来正好 N、不超容量、不重不漏；最里一圈的开合和原版 GenericRadialMenu 一样。
import { describe, expect, it } from 'vitest';
import { radialWheelConst, cellAngle, WheelState } from '@库/界面/径向轮盘数.ts';
import { spellTable } from '../法术/法术表.ts';
import { splitRings, ringRadius, ringCapacity, RingState, ringRotation, openDoneTick, retractRingState, minRingCount, moveOutState, moveOutSlot, placeCells, fitScale, defaultOpenClose, defaultRingShape, type SplitMode } from './分圈.ts';
import { schoolOrder, sortSpells, arrangeWheel, pickSpells } from './轮盘法术.ts';

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe('分圈', () => {
  it('圈半径和容量：最里一圈是原版的 30～60、20 格，往外每圈加 30', () => {
    expect(ringRadius(0)).toEqual({ 内: 30, outerRadius: 60, iconRadius: 45 });
    expect(ringRadius(2)).toEqual({ 内: 90, outerRadius: 120, iconRadius: 105 });
    expect([0, 1, 2, 3, 4].map((k) => ringCapacity(k))).toEqual([20, 33, 46, 60, 73]);
  });

  it('最少圈数：20 以内一圈，71 个三圈，128 个四圈', () => {
    expect([0, 1, 20, 21, 53, 54, 71, 99, 100, 128, 159, 160].map((n) => minRingCount(n))).toEqual([1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5]);
  });

  it('片子用到的两档：71 个 → 14、24、33；128 个 → 16、27、37、48', () => {
    expect(splitRings(71)).toEqual([14, 24, 33]);
    expect(splitRings(128)).toEqual([16, 27, 37, 48]);
    expect(splitRings(71, { splitMode: '均分' })).toEqual([20, 26, 25]);
    expect(splitRings(71, { splitMode: '填满内圈' })).toEqual([20, 33, 18]);
  });

  it('N 从 0 到 300、三种分法：总数正好 N，每圈不超容量，圈数是最少圈数', () => {
    for (const splitMethod of ['按周长', '均分', '填满内圈'] as SplitMode[]) {
      for (let N = 0; N <= 300; N++) {
        const perRing = splitRings(N, { splitMode: splitMethod });
        expect(sum(perRing)).toBe(N);
        expect(perRing.length).toBe(minRingCount(N));
        perRing.forEach((n, k) => {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(ringCapacity(k));
        });
      }
    }
  });

  it('按周长分时图标间距不小于原版 20 格的间距，各圈间距相差不到一格的量', () => {
    const vanillaSpacing = (2 * Math.PI * 45) / 20;
    for (const N of [71, 84, 128]) {
      const spacing = splitRings(N).map((n, k) => (2 * Math.PI * ringRadius(k).iconRadius) / n);
      for (const d of spacing) expect(d).toBeGreaterThanOrEqual(vanillaSpacing - 1e-9);
      expect(Math.max(...spacing) / Math.min(...spacing)).toBeLessThan(1.1);
    }
  });

  it('指定圈数：给多了照样分完，给少了报错', () => {
    expect(sum(splitRings(71, { ringCount: 5 }))).toBe(71);
    expect(splitRings(71, { ringCount: 5 }).length).toBe(5);
    expect(() => splitRings(71, { ringCount: 2 })).toThrow(/装不下/);
  });

  it('落格：每项一个（圈，格），不重不漏', () => {
    const perRing = splitRings(128);
    const slotPos = placeCells(perRing);
    expect(slotPos.length).toBe(128);
    expect(new Set(slotPos.map((p) => `${p.ring}|${p.cell}`)).size).toBe(128);
    perRing.forEach((n, k) => expect(slotPos.filter((p) => p.ring === k).map((p) => p.cell)).toEqual(Array.from({ length: n }, (_, i) => i)));
  });

  it('适配缩放：720 高、留 24，三圈取 8/3，四圈取 2', () => {
    expect(fitScale(120, 720, 24, 1 / 3, 8 / 3)).toBeCloseTo(8 / 3, 9);
    expect(fitScale(150, 720, 24, 1 / 3, 8 / 3)).toBeCloseTo(2, 9);
    expect(fitScale(60, 720, 24, 1 / 3, 8 / 3)).toBeCloseTo(8 / 3, 9);
  });
});

describe('开合', () => {
  it('最里一圈和原版 GenericRadialMenu 的 radiusIn、radiusOut、itemRadius 逐刻一样', () => {
    for (const tick of [0, 0.5, 1.25, 2.4, 2.5, 3, 40]) {
      const reference = WheelState(tick)!;
      const multiRing = RingState(0, tick)!;
      expect(multiRing.内).toBeCloseTo(reference.内, 12);
      expect(multiRing.outerRadius).toBeCloseTo(reference.outerRadius, 12);
      expect(multiRing.iconRadius).toBeCloseTo(reference.iconRadius, 12);
      expect(multiRing.animating).toBe(reference.animating);
    }
  });

  it('原版的数：2.5 刻线性，开完内 30 外 60，图标半径 45；第 0 格朝正上，顺时针', () => {
    expect(WheelState(-1)).toBeNull();
    expect(WheelState(1.25)).toMatchObject({ progress: 0.5, animating: true, 内: 15, outerRadius: 30, patternScale: 0.5 });
    expect(WheelState(0)!.内).toBeCloseTo(0.1, 12);
    expect(WheelState(2.5)).toMatchObject({ progress: 1, animating: false, 内: 30, outerRadius: 60, iconRadius: 45 });
    expect(radialWheelConst.底色).toBe(1056964608);
    expect(radialWheelConst.hoverColor).toBe(1073741823);
    expect(Math.sin(cellAngle(0, 20))).toBeCloseTo(-1, 12);
    expect(Math.cos(cellAngle(5, 20))).toBeCloseTo(1, 12);
  });

  it('外圈依次弹开：没轮到是 null，内沿不动、外沿长到位；相邻圈反向转', () => {
    expect(RingState(1, 2.4)).toBeNull();
    expect(RingState(1, 3.75)).toMatchObject({ progress: 0.5, animating: true, 内: 60, outerRadius: 75 });
    expect(RingState(2, 7.5)).toMatchObject({ progress: 1, animating: false, 内: 90, outerRadius: 120, iconRadius: 105 });
    expect(openDoneTick(3)).toBe(7.5);
    expect(RingState(0, 20)!.angleRad).toBeCloseTo((defaultOpenClose.rotSpeed * Math.PI) / 180, 12);
    expect(RingState(1, 20)!.angleRad).toBeCloseTo(-RingState(0, 20)!.angleRad, 12);
    expect(RingState(1, 20, defaultRingShape, { ...defaultOpenClose, rotSpeed: 0 })!.angleRad).toBeCloseTo(0, 12);
  });

  it('收盘：最外圈先缩、最里一圈最后缩回圆心，收完是 null；转角照总刻数接着转', () => {
    expect(retractRingState(2, 100, 0, 3)).toMatchObject({ progress: 1, 内: 90, outerRadius: 120 });
    expect(retractRingState(2, 100, 1.25, 3)).toMatchObject({ progress: 0.5, 内: 90, outerRadius: 105 });
    expect(retractRingState(2, 100, 3, 3)).toBeNull();
    expect(retractRingState(0, 100, 3, 3)).toMatchObject({ progress: 1, 内: 30 });
    expect(retractRingState(0, 100, 6.25, 3)!.内).toBeCloseTo(15, 12);
    expect(retractRingState(0, 100, 7.6, 3)).toBeNull();
    expect(retractRingState(1, 100, 2, 3)!.angleRad).toBeCloseTo(RingState(1, 100)!.angleRad, 12);
  });

  it('盘心移出：开盘时各圈图标都缩在圆心，那一圈弹完正好落定（之后 null，照常画），中间往外走、旋转都不回头', () => {
    for (const k of [0, 1, 2]) {
      expect(moveOutState(k, 0)).toEqual({ ratio: 0, roll: -Math.PI / 3 });
      const endTick = k * defaultOpenClose.ringGapTick + defaultOpenClose.ticksPerRing;
      expect(moveOutState(k, endTick)).toBeNull();
      expect(RingState(k, endTick)!.animating).toBe(false);
      expect(RingState(k, endTick - 1e-6)!.animating).toBe(true);
      const endState = moveOutState(k, endTick - 1e-6)!;
      expect([endState.ratio, endState.roll]).toEqual([expect.closeTo(1, 6), expect.closeTo(0, 6)]);
      let prev = moveOutState(k, 0)!;
      for (let tick = 0.1; tick < endTick; tick += 0.1) {
        const curState = moveOutState(k, tick)!;
        expect(curState.ratio).toBeGreaterThanOrEqual(prev.ratio);
        expect(Math.abs(curState.roll)).toBeLessThanOrEqual(Math.abs(prev.roll));
        prev = curState;
      }
    }
  });
});

describe('最外圈分段移出', () => {
  it.each([71, 128])('%i 格：全程跟同一枚次外圈聚晶；分流、落定两端的速度都接得上', (count) => {
    const counts = splitRings(count);
    const outer = counts.length - 1;
    const opening = { ...defaultOpenClose, spinStartTick: 1220 };
    const split = openDoneTick(outer, opening);
    const end = openDoneTick(outer + 1, opening);
    const epsilon = 1e-4;
    const pos = ({ radius, angle }: { radius: number; angle: number }) => [radius * Math.cos(angle), radius * Math.sin(angle)] as const;
    const slots = new Set<number>();
    for (let cell = 0; cell < counts[outer]!; cell++) {
      const at = (tick: number) => moveOutSlot(outer, cell, counts, tick, defaultRingShape, opening);
      const parent = at(split).carrier!.cell;
      slots.add(parent);
      for (const tick of [0, split / 2, split - epsilon, split]) {
        const carrier = moveOutSlot(outer - 1, parent, counts, tick, defaultRingShape, opening);
        expect(at(tick)).toMatchObject({ radius: carrier.radius, angle: carrier.angle, carrier: { cell: parent } });
      }
      const mid = at((split + end) / 2);
      const targetAngle = cellAngle(cell, counts[outer]!) + ringRotation(outer, (split + end) / 2, opening);
      expect(mid.radius).toBe((ringRadius(outer - 1).iconRadius + ringRadius(outer).iconRadius) / 2);
      expect(Math.cos(mid.angle - targetAngle)).toBeGreaterThan(0.99);
      for (const boundary of [split, end]) {
        const before = pos(at(boundary - epsilon)), on = pos(at(boundary)), after = pos(at(boundary + epsilon));
        for (const axis of [0, 1] as const) expect(Math.abs(after[axis] - 2 * on[axis] + before[axis]) / epsilon).toBeLessThan(0.01);
      }
      expect(at(end).radius).toBe(ringRadius(outer).iconRadius);
      expect(at(end).angle).toBeCloseTo(cellAngle(cell, counts[outer]!) + ringRotation(outer, end, opening), 10);
    }
    expect(slots.size).toBe(counts[outer - 1]);
  });

  it('只有一圈没有可跟随的格；圈间隔为零仍能同时落定', () => {
    for (const counts of [[12], [12, 19]]) {
      const outer = counts.length - 1;
      const opening = { ...defaultOpenClose, ringGapTick: 0 };
      expect(moveOutSlot(outer, 0, counts, 1.25, defaultRingShape, opening).radius).toBe(ringRadius(outer).iconRadius / 2);
      expect(moveOutSlot(outer, 0, counts, 2.5, defaultRingShape, opening).carrier).toBeUndefined();
    }
  });
});

describe('排盘', () => {
  it('有画面档 71 个三圈，全部档 128 个四圈（去掉 5 个空壳），每个法术正好落一格', () => {
    const defaults = arrangeWheel();
    expect(defaults.cellsPerRing).toEqual([14, 24, 33]);
    expect(defaults.items.length).toBe(71);
    expect(defaults.items.every((item) => item.inReveal)).toBe(true);
    const allRings = arrangeWheel({ 放: '全部' });
    expect(allRings.cellsPerRing).toEqual([16, 27, 37, 48]);
    expect(new Set(allRings.items.map((item) => item.key)).size).toBe(128);
    expect(new Set(allRings.items.map((item) => `${item.ring}|${item.cell}`)).size).toBe(128);
    expect(allRings.items.filter((item) => item.inReveal).length).toBe(71);
    expect(new Set(allRings.items.map((item) => item.法)).size).toBe(spellTable.filter((spell) => spell.类 !== '空壳').length);
  });

  it('按学派排：同学派连成一段，学派表盖住法术表里出现的全部学派；照注册排就是法术表的顺序', () => {
    expect(new Set(spellTable.map((spell) => spell.school))).toEqual(new Set(schoolOrder));
    const arranged = sortSpells(pickSpells('全部'), '学派');
    expect(arranged.length).toBe(128);
    const segCount = arranged.filter((spell, i) => i === 0 || arranged[i - 1]!.school !== spell.school).length;
    expect(segCount).toBe(new Set(arranged.map((spell) => spell.school)).size);
    expect(sortSpells(pickSpells('有画面'), '注册')).toEqual(spellTable.filter((spell) => spell.类 === '有画面'));
  });

  it('聚晶键的形状：命名空间:注册名_focus', () => {
    const { items: items } = arrangeWheel({ 放: '全部' });
    expect(items.find((item) => item.法.registryName === 'fireball')!.key).toBe('goety:fireball_focus');
    expect(items.find((item) => item.法.registryName === 'revelation')!.key).toBe('goety_revelation:revelation_focus');
  });
});
