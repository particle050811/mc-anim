import assert from 'node:assert/strict';

const native = new Set(['name', 'parent', 'pivot', 'rotation', 'mirror', 'cubes']);
const cubeFields = new Set(['origin', 'size', 'uv', 'inflate', 'rotation', 'pivot', 'mirror']);
const faces = new Set(['north', 'south', 'east', 'west', 'up', 'down']);

export function partition(live, original, fallback) {
  const before = new Map(original.bones.map(bone => [bone.name, bone]));
  const names = new Set(live.bones.map(bone => bone.name));
  assert.equal(names.size, live.bones.length, '正片骨名重复');
  const removed = [...before.keys()].filter(name => !names.has(name));
  assert(!removed.length, `正片已删原包骨；不能保证保留原动作引用：${removed.join('、')}`);
  const findings = [];
  const bones = live.bones.map(bone => {
    const extra = Object.keys(bone).filter(key => !native.has(key) && key !== 'quads' && bone[key] !== undefined);
    for (const [index, cube] of (bone.cubes ?? []).entries()) {
      for (const key of Object.keys(cube)) if (!cubeFields.has(key)) extra.push(`cubes[${index}].${key}`);
      if (cube.uv && !Array.isArray(cube.uv)) for (const [face, rect] of Object.entries(cube.uv)) {
        if (!faces.has(face) || !rect || Object.keys(rect).some(key => key !== 'uv' && key !== 'uv_size')) extra.push(`cubes[${index}].uv.${face}`);
      }
    }
    const quads = bone.quads ?? [];
    if (extra.length || !Array.isArray(quads) || quads.length) {
      const old = before.get(bone.name);
      const canSubstitute = old !== undefined && !extra.length && Array.isArray(quads);
      findings.push({ name: bone.name, quadCount: Array.isArray(quads) ? quads.length : null, otherFields: extra, sourceCubes: old?.cubes?.length ?? 0,
        canSubstitute, action: fallback && canSubstitute ? '使用原包整骨方盒，不含该骨正片面' : '阻止出包', productionBone: bone });
      if (fallback && canSubstitute) return { ...Object.fromEntries(Object.entries(bone).filter(([key]) => native.has(key))), cubes: old.cubes ?? [] };
    }
    return Object.fromEntries(Object.entries(bone).filter(([key]) => key !== 'quads'));
  });
  return { model: { texW: live.texW, texH: live.texH, bones }, findings,
    added: [...names].filter(name => !before.has(name)), blocked: findings.some(item => item.action === '阻止出包') };
}

export function outlineSvg(findings) {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const panels = findings.map((item, index) => {
    const rows = (Array.isArray(item.productionBone.quads) ? item.productionBone.quads : []).map(quad => quad?.points).filter(row =>
      Array.isArray(row) && row.length === 4 && row.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)));
    const project = (axis, offset) => {
      if (!rows.length) return '';
      const all = rows.flat();
      const range = direction => all.reduce(([low, high], point) => [Math.min(low, point[direction]), Math.max(high, point[direction])], [Infinity, -Infinity]);
      const [minX, maxX] = range(axis), [minY, maxY] = range(1);
      const scale = 130 / Math.max(maxX - minX, maxY - minY, 0.001);
      return rows.map(row => `<polygon points="${row.map(point => `${offset + (point[axis] - minX) * scale},${34 + (maxY - point[1]) * scale}`).join(' ')}"/>`).join('');
    };
    return `<g transform="translate(0 ${40 + index * 185})"><text x="12" y="18">${escape(item.name)} · ${item.quadCount} quad · 原包 ${item.sourceCubes} 盒 ${escape(item.otherFields.join(' '))}</text><g fill="none" stroke="#805428" stroke-width="0.8">${project(0, 18)}${project(2, 230)}</g></g>`;
  });
  const svgNamespace = 'http://www.w3.org/2000/svg';
  return `<svg xmlns="${svgNamespace}" width="600" height="${52 + 185 * panels.length}"><rect width="100%" height="100%" fill="#fffaf0"/><text x="12" y="24">非标准面诊断：左 XY，右 ZY；不是游戏画面</text>${panels.join('')}</svg>`;
}
