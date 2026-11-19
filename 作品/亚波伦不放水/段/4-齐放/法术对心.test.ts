import type { ReactElement } from 'react';
import { expect, it } from 'vitest';
import { CastLaunches, launchFrom, launchTarget } from '../../场/1-台地/出手.tsx';
import { cageSetup, castTable, coverFull, perform, sceneCtx, steveStateAt } from '../../场/1-台地/编排-齐放.ts';
import { escapeGap, secAt } from '../../场/1-台地/齐放拍.ts';
import { getSpellPerformance } from '../../法术/演出/注册表.tsx';
import type { SpellPerformanceProps, Vec3 } from '../../法术/演出/接口.ts';
import { FrostWall } from '../../法术/演出/零件/丁霜.tsx';
import type { ParticleBirth } from '../../法术/演出/零件/粒子.tsx';
import type { ArrowRainShot } from '../../法术/演出/零件/甲/落雨.ts';

const first = (id: string) => castTable.find(cast => cast.id === id)!;
const propsAt = (id: string, frame: number) => {
  const scene = CastLaunches({ 表: [first(id)], sec: secAt(frame / 60), sceneCtx }) as ReactElement<{ children: ReactElement<SpellPerformanceProps>[] }>;
  return scene.props.children[0]!.props;
};
const iceAt = (frame: number) => {
  const props = propsAt('ice', frame);
  const ice = getSpellPerformance('ice').spellPerformance(props) as ReactElement<{ children: [ReactElement<{ 位: Vec3; radius: number }> | false, ReactElement<{ spawns: ParticleBirth[] }>, ReactElement<{ projectiles: ArrowRainShot[] }>] }>;
  return ice.props.children;
};

it('实出手组件：领域墙逐帧对角色根；冲走不搬运已出生的粒子和冰矛，收术后只余在途实体', () => {
  const birth = iceAt(46);
  for (const frame of [46, 66, 93, 105, 144]) {
    const [wall, frost, spears] = iceAt(frame);
    const foot = perform.在(secAt(frame / 60)).props.pose.loc;
    expect(wall && wall.type).toBe(FrostWall);
    expect(wall && wall.props.位).toEqual(foot);
    expect(wall && wall.props.radius).toBe(24);
    expect(frost.props.spawns[0]).toEqual(birth[1].props.spawns[0]);
    expect(spears.props.projectiles[0]!.trajectory(8)).toEqual(birth[2].props.projectiles[0]!.trajectory(8));
    if (frame === 144) {
      const pulse = frost.props.spawns.find(spawn => spawn.刻 === 40)!;
      const origin = perform.在(first('ice').sec + 2).props.pose.loc;
      expect(pulse.位).toEqual([origin[0] + 24, origin[1], origin[2] + 0.3]);
    }
  }
  expect(iceAt(205)[0]).toBe(false);
});

it('杖尖弹道不追身、持续束跟杖；瞬发绕身取出生时半身，而非杖尖', () => {
  for (const frame of [66, 93, 105]) {
    expect(propsAt('prisma_beam', frame).from).toEqual(perform.杖(secAt(frame / 60)).tip);
    expect(propsAt('prisma_beam', frame).target).toEqual(steveStateAt(secAt(frame / 60)).位置);
  }
  for (const frame of [18, 30]) expect(propsAt('ice_spike', frame).from).toEqual(perform.杖(first('ice_spike').sec).tip);
  for (const id of ['shockwave', 'frost_nova', 'weakening', 'trembling', 'discharge', 'temblor_clap', 'fire_blast']) {
    const cast = first(id), foot = perform.在(cast.sec).props.pose.loc;
    expect(launchFrom(cast, sceneCtx)).toEqual([foot[0], foot[1], foot[2] + 0.5]);
  }
});

it('五种落地阵取目标当时的脚，不强跟；结界罩严取半身，封退路的雷仍然打空地', () => {
  for (const id of ['ghost_fire', 'barricade', 'biomine', 'overgrowth', 'flame_strike']) {
    const cast = first(id), foot = steveStateAt(cast.sec).位置;
    expect(propsAt(id, 66).target).toEqual(foot);
    expect(propsAt(id, 105).target).toEqual(foot);
  }
  const placed = propsAt('ghost_fire', 93);
  expect(placed.target).not.toEqual(steveStateAt(secAt(93 / 60)).位置);
  expect(placed.landAt!([898.5, 299.5, 80])).toEqual([898.5, 299.5, 50]);
  const foot = steveStateAt(coverFull).位置;
  expect(cageSetup.target).toEqual([foot[0], foot[1], foot[2] + 0.9]);
  expect(launchTarget(castTable.find(cast => cast.target === escapeGap)!, sceneCtx)).toBe(escapeGap);
});
