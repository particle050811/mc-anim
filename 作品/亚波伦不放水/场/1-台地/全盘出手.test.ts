import { expect, it } from 'vitest';
import { arrangeWheel } from '../../界面/轮盘法术.ts';
import { getSpellPerformance } from '../../法术/演出/注册表.tsx';
import { castTable, cageSetup, throwSec } from './编排-齐放.ts';
import { castStart, actStart, deathTime } from './齐放拍.ts';
import { massCastSounds } from './齐放声.ts';
import { castSounds } from '../../法术/施放声.ts';
import { volleyLayers } from './齐放补演.ts';

it('盘上每种聚晶都接到真实出手及已注册画面；炼狱由独立结界出手，不重复排', () => {
  const ids = arrangeWheel().items.map(item => item.法.registryName);
  const used = new Set(castTable.map(cast => cast.id));
  expect(used.has('revelation')).toBe(false);
  expect(cageSetup).toBeDefined();
  expect(throwSec).toBeCloseTo(actStart + castStart, 9);
  expect([...used, 'revelation'].sort()).toEqual(ids.sort());
  expect(ids).toHaveLength(71);
  for (const cast of castTable) {
    expect(getSpellPerformance(cast.id).spellPerformance).toBeTypeOf('function');
    expect(cast.sec).toBeGreaterThanOrEqual(throwSec - 1e-9);
    expect(cast.sec).toBeLessThan(actStart + deathTime);
  }
  const sounds = massCastSounds();
  for (const { id } of volleyLayers) expect(castSounds[id]?.length).toBeGreaterThan(0);
  expect(sounds.some(sound => volleyLayers.some(layer => sound.name.startsWith(`施放-${layer.id}-`)))).toBe(true);
});

it('引导只启动一次，留场不重叠；补演的首个实例全部在侧镜结束前有画面', () => {
  expect(volleyLayers).toHaveLength(43);
  for (const layer of volleyLayers) {
    const launches = castTable.filter(cast => cast.id === layer.id);
    expect(launches[0]!.sec - actStart).toBeLessThan(1.8);
    if (!layer.period) expect(launches).toHaveLength(1);
    for (const [index, cast] of launches.entries()) {
      expect(cast.end!).toBeGreaterThan(cast.sec);
      if (index) expect(cast.sec + 1e-8).toBeGreaterThanOrEqual(launches[index - 1]!.end!);
    }
  }
});
