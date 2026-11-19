import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partition, outlineSvg } from './拓扑.mjs';

const cube = { size: [1, 0, 3], origin: [1, 2, 3], uv: [1, 2] };
const stock = { texW: 16, texH: 32, bones: [{ name: 'Root', pivot: [0, 0, 0] }] };
const hair = { name: 'NewHair', parent: 'Root', pivot: [1, 5, 0], cubes: [cube] };
const quad = { points: [[0, 0, 0], [2, 0, 0], [1, 3, 0], [0, 3, 0]], texels: [[0, 0], [2, 0], [1, 3], [0, 3]] };

test('未来原生骨片直接通过，骨架和图集尺寸不锁历史值', () => {
  const live = { texW: 32, texH: 48, bones: [...stock.bones, hair] };
  const result = partition(live, stock, false);
  assert.equal(result.blocked, false); assert.deepEqual(result.added, ['NewHair']);
  assert.deepEqual(result.model, live); assert.deepEqual(result.findings, []);
});

test('袍子任意面逐骨报告；显式替代不改其他原生骨片', () => {
  const robe = { name: 'Robe', parent: 'Root', pivot: [0, 0, 0], cubes: [cube] };
  const source = { ...stock, bones: [...stock.bones, robe] };
  const live = { ...source, bones: [...stock.bones, { ...robe, cubes: [], quads: [quad] }, hair] };
  assert(partition(live, source, false).blocked);
  const result = partition(live, source, true);
  assert(!result.blocked); assert.deepEqual(result.model.bones, [...source.bones, hair]);
  assert.deepEqual(result.findings[0].productionBone.quads, [quad]);
  assert.match(outlineSvg(result.findings), /Robe/); assert.match(outlineSvg(result.findings), /<polygon/);
});

test('新骨无原盒、未知面结构不做假替代', () => {
  for (const extra of [{ quads: [quad] }, { mesh: {} }, { quads: { polys: [] } }, { cubes: [{ ...cube, uv: { north: { material_instance: 'robe' } } }] }]) {
    const result = partition({ ...stock, bones: [...stock.bones, { ...hair, ...extra }] }, stock, true);
    assert(result.blocked); assert.doesNotThrow(() => outlineSvg(result.findings));
  }
});
