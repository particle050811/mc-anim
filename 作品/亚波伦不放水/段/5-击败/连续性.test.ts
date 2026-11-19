import { describe, expect, it } from 'vitest';
import { blendLayers } from '@engine/anim/基岩动画.ts';
import { animSkeletonTable } from '../../角色/娘化亚波伦.tsx';
import { spellDuration } from '../../法术/演出/接口.ts';
import { getSpellMeta } from '../../法术/演出/元表.ts';
import { cagePerformanceStateAt } from '../../特效/炼狱结界演出状态.ts';
import { launchFrom, launchTarget, type Launch } from '../../场/1-台地/出手表.ts';
import { cageSetup, castTable, sceneCtx, throwSec } from '../../场/1-台地/编排-齐放.ts';
import { actStart, landSec, secAt, standStillSec, yaBoLunPos } from '../../场/1-台地/击败拍.ts';
import { performAt } from '../../场/1-台地/编排-击败.ts';
import { soleHeight } from '../../场/1-台地/击败着地.ts';
import { footHeight } from '../../场/1-台地/布局.ts';
import { cageTailAt, remainingVolley } from './余术.ts';

describe('齐放接死亡', () => {
  it('只带入切幕时存活的原发，出手时钟、随机种子和弹道不重置；远端余效可以活过切镜', () => {
    const lifetime = (cast: Launch) => spellDuration(getSpellMeta(cast.id), launchFrom(cast, sceneCtx), launchTarget(cast, sceneCtx), cast.options).长秒;
    const alive = (cast: Launch, sec: number) => cast.sec < sec && (cast.end ?? Infinity) > sec && (cast.clock?.(sec) ?? sec) - cast.sec < lifetime(cast);
    const volley = remainingVolley();
    const sources = castTable.filter((cast) => alive(cast, actStart));
    expect(volley.length).toBeGreaterThan(0);
    expect(volley.length).toBeLessThan(castTable.length);
    expect(volley).toHaveLength(sources.length);
    for (const [index, cast] of volley.entries()) {
      const source = sources[index]!;
      expect(cast).toMatchObject({ id: source.id, sec: source.sec, seed: source.seed, from: launchFrom(source, sceneCtx), target: launchTarget(source, sceneCtx) });
      expect(cast.clock).toBe(source.clock);
      expect(cast.options).toBe(source.options);
      expect(cast.end).toBe(source.clock ? source.end : Math.min(source.end ?? Infinity, source.sec + lifetime(source)));
    }
    const counts = [0, 1.8, 5.3, 7.6, 30].map((elapsed) => volley.filter((cast) => alive(cast, secAt(elapsed))).length);
    expect(counts[0]).toBeGreaterThan(counts[1]!);
    expect(counts[1]).toBeGreaterThan(counts[2]!);
    expect(counts[2]).toBeGreaterThan(0);
    expect(counts[4]).toBe(0);
    console.log('余术在死亡、死亡界面、落地镜、段末及寿终后的发数', counts);
  });

  it('结界沿用罩住时的中心、大小和转动相位，随后淡出 30 刻', () => {
    const before = cagePerformanceStateAt(actStart - throwSec - 1 / 60, cageSetup);
    expect(before.stage).toBe('罩住');
    expect(cageTailAt(actStart).center).toEqual(before.center);
    expect(cageTailAt(actStart).radiusFactor).toBe(before.radiusFactor);
    expect(cageTailAt(actStart).spinSec - before.spinSec).toBeCloseTo(1 / 60, 10);
    expect(cageTailAt(actStart).opacity).toBe(1);
    expect(cageTailAt(secAt(0.75)).opacity).toBeCloseTo(0.5, 10);
    // 淡完那一刻按刻数算，秒换刻有浮点尾数
    expect(cageTailAt(secAt(1.5)).opacity).toBeCloseTo(0, 12);
  });
});

describe('亚波伦触地', () => {
  it('下降走水平弧，离地时已减速，接地速度连续', () => {
    const at = (offset: number) => yaBoLunPos(landSec + offset);
    const [start, middle, end] = [at(-0.7), at(-0.35), at(0)];
    const [east, north] = [end[0] - start[0], end[1] - start[1]];
    expect(Math.abs(east * (middle[1] - start[1]) - north * (middle[0] - start[0])) / Math.hypot(east, north)).toBeGreaterThan(0.5);
    const speed = (time: number) => Math.hypot(at(time + 1 / 60)[0] - at(time)[0], at(time + 1 / 60)[1] - at(time)[1]) * 60;
    expect(speed(-0.16)).toBeGreaterThan(2 * speed(-1 / 60));
    expect(Math.abs(speed(-1 / 60) - speed(0))).toBeLessThan(0.4);
    expect(at(-1 / 60)[2]).toBeGreaterThan(end[2]);
  });

  it('鞋底落在脚高表上，压低髋和躯干后手、袍迟一拍反摆再回稳', () => {
    const sample = (sec: number) => {
      const { props } = performAt(sec);
      const idle = animSkeletonTable(props.sec, props.act);
      const bones = blendLayers([{ skeleton: idle }, { skeleton: props.bonePose }], 'TLM');
      const [east, north, height] = props.pose.loc;
      return { gap: height + soleHeight(bones) - footHeight(east, -north), height, chest: bones.UpBody!.rot![0]!, arm: bones.LeftArm!.rot![0]!, skirt: bones.FrontSkirt!.rot![0]! };
    };
    expect(sample(landSec - 1 / 60).gap).toBeGreaterThan(0);
    for (const offset of [0, 0.085, 0.19, 0.42, 0.6, 0.9]) expect(sample(landSec + offset).gap).toBeCloseTo(0, 8);
    expect(sample(landSec + 0.085).height).toBeLessThan(sample(standStillSec).height - 0.05);
    expect(sample(landSec + 0.11).chest).toBeGreaterThan(sample(landSec + 0.42).chest + 12);
    expect(sample(landSec + 0.15).arm).toBeLessThan(sample(landSec + 0.48).arm - 12);
    expect(sample(landSec + 0.19).skirt).toBeLessThan(sample(landSec + 0.54).skirt - 15);
  });
});
