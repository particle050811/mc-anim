import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { boneGeometry, type BedrockBone, type BedrockModel } from '@engine/model/基岩模型.tsx';
import native from './YSM原生/亚波伦头脸.geo.json';
import blink from './YSM原生/亚波伦眨眼.animation.json';
import portraitLock from '../资产锁/贴图/角色/娘化亚波伦/YSM头脸.json';
import { png } from '@engine/model/贴图.ts';
import modelRaw from 'asset:模型/角色/娘化亚波伦';
import skin2 from 'asset:贴图/角色/娘化亚波伦/2default';
import skin3 from 'asset:贴图/角色/娘化亚波伦/3default';
import skin4 from 'asset:贴图/角色/娘化亚波伦/4default';
import skin5 from 'asset:贴图/角色/娘化亚波伦/5default';
import { GirlYaBoLunCreature, packCreature } from './娘化亚波伦.tsx';

const orig = modelRaw as unknown as Omit<BedrockModel, 'texture'>;
const prod = GirlYaBoLunCreature.getModel();
const bone = (model: typeof orig, name: string) => model.bones.find(part => part.name === name)!;

const sheet = native['minecraft:geometry'][0];
const authored = (sheet.bones as BedrockBone[]).filter(part => part.cubes !== undefined);

it('正片头脸的贴图锁与可编辑皮肤逐字节一致', () => {
  const source = readFileSync(new URL('./YSM原生/亚波伦头脸.png', import.meta.url));
  expect(source.byteLength).toBe(portraitLock.size);
  expect(createHash('sha256').update(source).digest('hex')).toBe(portraitLock.sha256);
});

it('正片头脸逐骨使用可编辑的 1.12 源，原生轴心、逐面 UV 和绑定完整', () => {
  expect(native.format_version).toBe('1.12.0');
  expect([sheet.description.texture_width, sheet.description.texture_height]).toEqual([prod.texW, prod.texH]);
  for (const part of authored) {
    expect(bone(prod, part.name), part.name).toEqual(part);
    expect(part.quads).toBeUndefined();
    if (part.parent) expect(sheet.bones.some(parent => parent.name === part.parent)).toBe(true);
    for (const cube of part.cubes!) {
      expect(cube.size.every(size => size > 0)).toBe(true);
      if (cube.rotation) expect(cube.pivot).toHaveLength(3);
      expect(Array.isArray(cube.uv)).toBe(false);
      for (const face of Object.values(cube.uv) as {uv: number[]; uv_size: number[]}[]) {
        for (const [axis, extent] of [prod.texW, prod.texH].entries()) {
          const ends = [face.uv[axis], face.uv[axis] + face.uv_size[axis]];
          expect(Math.min(...ends)).toBeGreaterThanOrEqual(axis === 0 ? orig.texW : 0);
          expect(Math.max(...ends)).toBeLessThanOrEqual(axis === 0 ? orig.texW + 128 : extent);
        }
      }
    }
  }
});

it('下颌用不透明方盒构成两条浅斜边和短平底，正投影不靠裁图', () => {
  const head = bone(prod, 'Head');
  for (const cube of head.cubes!) {
    expect(Object.keys(cube.uv).sort()).toEqual(['down', 'east', 'north', 'south', 'up', 'west']);
    for (const { uv: [left, top], uv_size: [width, height] } of Object.values(cube.uv)) {
      for (let row = top; row < top + height; row++) for (let col = left; col < left + width; col++) {
        if (prod.texture.px[(row * prod.texW + col) * 4 + 3] !== 255) throw new Error(`下颌材质有镂空：${col},${row}`);
      }
    }
  }
  const geometry = boneGeometry(head, prod.texW, prod.texH)!;
  const vertices = geometry.getAttribute('position');
  const point = (index: number) => [head.pivot[0] - vertices.getX(index), head.pivot[1] + vertices.getY(index), head.pivot[2] + vertices.getZ(index)];
  const edges = Array.from({ length: vertices.count }, (_, index) => [point(index), point(index + (index % 4 === 3 ? -3 : 1))]);
  geometry.dispose();
  const axis = .08041, floor = 33.12, flat = .4536, outer = 2.8593, rise = .4131;
  const outline = [[axis - outer, floor + rise], [axis - flat, floor], [axis + flat, floor], [axis + outer, floor + rise]];
  for (const [index, start] of outline.slice(0, -1).entries()) {
    const end = outline[index + 1];
    const onLine = (pos: number[]) => Math.abs(pos[1] - start[1] - (end[1] - start[1]) * (pos[0] - start[0]) / (end[0] - start[0])) < .002;
    const spans = edges.filter(([left, right]) => onLine(left) && onLine(right)).map(([left, right]) =>
      [Math.min(left[0], right[0]), Math.max(left[0], right[0])]).sort(([first], [last]) => first - last);
    let reach = start[0];
    for (const [from, to] of spans) if (from <= reach + .002) reach = Math.max(reach, to);
    expect(reach).toBeGreaterThanOrEqual(end[0] - .002);
  }
  const cheeks = edges.flat().filter(([xpos, ypos]) => Math.abs(xpos-axis) > 2.70 && ypos < floor+rise+.65);
  expect(cheeks.length).toBeGreaterThan(0);
  for (const [xpos, , depth] of cheeks) {
    const cheekPlane = -3 + (Math.abs(xpos-axis) - 2.0655) * Math.tan(17 * Math.PI / 180);
    expect(depth, '下颌侧端越过上脸侧平面').toBeGreaterThanOrEqual(cheekPlane - .002);
  }
  for (let step = 1; step < 240; step++) {
    const xpos = axis - outer + 2 * outer * step / 240;
    const hits = edges.flatMap(([[x0,y0],[x1,y1]]) => {
      if (Math.abs(x1-x0) < 1e-7 || xpos < Math.min(x0,x1) || xpos > Math.max(x0,x1)) return [];
      return [y0 + (y1-y0) * (xpos-x0) / (x1-x0)];
    });
    const expected = floor + rise * Math.max(0, Math.abs(xpos-axis)-flat) / (outer-flat);
    expect(Math.abs(Math.min(...hits) - expected)).toBeLessThan(.002);
  }
});

it('刘海与鬓发有厚实宽面、折点及斜向侧壁', () => {
  const pieces = (name: string) => bone(prod, name).cubes!;
  for (const name of ['front_h1', 'corner_h1']) {
    const wide = pieces(name).filter(cube => cube.size[0] >= 1.4 && cube.size[2] >= .7 && cube.size[1] >= 1.5);
    expect(wide.length).toBeGreaterThan(4);
    expect(new Set(wide.map(cube => cube.rotation![2])).size).toBeGreaterThan(3);
    expect(pieces(name).some(cube => !Array.isArray(cube.uv) && Object.keys(cube.uv).length === 1 && cube.uv.up && Math.abs(cube.rotation![2]) > 25)).toBe(true);
  }
});

it('真实投影的眼白与虹膜逐折收底、鼻侧留白少；外侧发梢不跟随闭眼', () => {
  const section = (part: BedrockBone, height: number, sign: number) => {
    const geo = boneGeometry(part, prod.texW, prod.texH)!;
    const vertices = geo.getAttribute('position');
    const hits: number[] = [];
    for (let index = 0; index < vertices.count; index++) {
      const next = index + (index % 4 === 3 ? -3 : 1);
      const start = part.pivot[1] + vertices.getY(index), end = part.pivot[1] + vertices.getY(next);
      if ((start > height) === (end > height)) continue;
      const xpos = vertices.getX(index) + (vertices.getX(next) - vertices.getX(index)) * (height-start)/(end-start);
      hits.push(sign * (part.pivot[0] - xpos - .08041));
    }
    geo.dispose();
    expect(hits.length).toBeGreaterThan(0);
    return [Math.min(...hits), Math.max(...hits)];
  };
  const fringe = bone(prod, 'front_h1');
  expect(fringe.parent).toBe('Hair');
  for (const side of ['Left', 'Right']) {
    const lid = bone(prod, `${side}Eyelid`), iris = bone(prod, `ysmGlow${side}EyesBase`), pupil = bone(prod, `ysmGlow${side}Pupil`);
    expect([iris.parent, pupil.parent]).toEqual([lid.name, iris.name]);
    const sign = side === 'Left' ? 1 : -1;
    for (const part of [lid, iris]) {
      const samples = [34.82, 34.90, 34.98, 35.06, 35.14, 35.22, 35.30, 35.38].map(ypos => section(part, ypos, sign));
      expect(new Set(samples.map(([, end]) => Math.round(end*100))).size).toBeGreaterThanOrEqual(6);
      expect(samples.at(-1)![1] - samples[0][1]).toBeGreaterThan(.14);
    }
    const white = section(lid, 35.33, sign), purple = section(iris, 35.33, sign);
    expect(white[0]).toBeGreaterThan(.97);
    expect(purple[0] - white[0]).toBeLessThan(.10);
    expect(white[1] - purple[1]).toBeGreaterThan(.69);
    const temple = fringe.cubes!.filter(cube => sign*(cube.origin[0]+cube.size[0]/2-.08041)>2.45 && cube.origin[2]<-3.4);
    const [hairEdge] = section({ ...fringe, cubes: temple }, 35.40, sign);
    const [, irisEdge] = section(iris, 35.40, sign);
    const clearance = hairEdge - irisEdge;
    const [minClearance, maxClearance] = side === 'Left' ? [.55, .69] : [.65, .79];
    expect(clearance, `${side} 发束挤进外眼白`).toBeGreaterThan(minClearance);
    expect(clearance, `${side} 发束退出外眼角`).toBeLessThan(maxClearance);
    const left = 576, top = 304, width = 32, height = 35;
    const redAt = (fractionX: number, fractionY: number) => prod.texture.px[
      ((top + Math.floor(fractionY * height)) * prod.texW + left + Math.floor(fractionX * width)) * 4];
    expect(Math.min(redAt(.23, .58), redAt(.73, .58))).toBeGreaterThan(redAt(.5, .58) + 70);
    expect(redAt(.5, .8)).toBeGreaterThan(redAt(.5, .58) + 100);
    const span = (row: number) => Array.from({length: width}, (_, col) => col).filter(col =>
      prod.texture.px[((top + row) * prod.texW + left + col) * 4 + 3] >= 128).length;
    expect(span(height - 1)).toBeGreaterThan(width * .60);
    expect(span(height - 1)).toBeLessThan(span(Math.floor(height * .72)));
    expect(span(Math.floor(height * .18))).toBeGreaterThan(width * .93);
    const track = blink.animations.pre_parallel1.bones;
    expect(track[`${side}Eyelid` as 'LeftEyelid'].scale['0.0833'][1]).toBe(0);
    expect(track[`${side}Eyebrow` as 'LeftEyebrow'].scale['0.0833'][0]).toBeLessThan(.87);
    expect(track).not.toHaveProperty(fringe.name);
    expect(track).not.toHaveProperty('Face');
    expect(bone(prod, 'Face').cubes!.length).toBeGreaterThan(1);
  }
});

it('正片保留原骨架、持杖手心和腿裙碰撞盒，只允许衣料换 UV', () => {
  const rig = (model: typeof orig) => Object.fromEntries(model.bones.map(({ name, parent, pivot, rotation }) =>
    [name, /^(?:c2|bone(?:4[3-9]|5[01]))$/.test(name) ? { parent } : { parent, pivot, rotation }]));
  expect(rig(prod)).toEqual(rig(orig));
  const geometry = (part: BedrockBone) => part.cubes?.map(({ uv, ...shape }) => shape);
  const checkBranch = (name: string) => {
    expect(geometry(bone(prod, name)), name).toEqual(geometry(bone(orig, name)));
    orig.bones.filter(part => part.parent === name).forEach(part => checkBranch(part.name));
  };
  ['RightForeArm', 'Skirt', 'LeftLeg', 'RightLeg'].forEach(checkBranch);
  const palm = bone(orig, 'RightForeArm').cubes!.find(cube => cube.size[1] === 7)!;
  expect(bone(prod, 'RightForeArm').cubes).toContainEqual(palm);
});

it('正片实际 UV 读得到双眼紫阶和高光，以及袍区的红金眼环；原图逐行不变', () => {
  const { texture } = prod, base = packCreature.getModel().texture;
  expect([prod.texW, prod.texH, texture.w, texture.h]).toEqual([orig.texW + 256, orig.texH, orig.texW + 256, orig.texH]);
  for (let row = 0; row < base.h; row++) {
    const start = row * texture.w * 4, len = base.w * 4;
    expect(Buffer.compare(texture.px.subarray(start, start + len), base.px.subarray(row * len, (row + 1) * len)), `原图区第 ${row} 行`).toBe(0);
  }
  const colors = (name: string, panel: number) => {
    const visible = new Set<number>();
    for (const cube of bone(prod, name).cubes ?? []) {
      const face = !Array.isArray(cube.uv) && cube.uv.north;
      if (!face) continue;
      const { uv: [left, top], uv_size: [width, height] } = face;
      const min = Math.min(left, left + width), max = Math.max(left, left + width);
      expect(min >= panel && max <= panel + 128 && Math.min(top, top + height) >= 0 && Math.max(top, top + height) <= texture.h, name).toBe(true);
      for (let row = Math.min(top, top + height); row < Math.max(top, top + height); row++) for (let col = min; col < max; col++) {
        const offset = (row * texture.w + col) * 4, [red, green, blue, alpha] = texture.px.subarray(offset, offset + 4);
        if (alpha >= 128) visible.add((red << 16) | (green << 8) | blue);
      }
    }
    return [...visible].map(rgb => [rgb >>> 16, (rgb >>> 8) & 255, rgb & 255]);
  };
  for (const side of ['Left', 'Right']) {
    const iris = colors(`ysmGlow${side}EyesBase`, base.w);
    expect(iris.filter(([red, green, blue]) => blue > green + 35 && red > green + 20).length).toBeGreaterThanOrEqual(3);
    expect(colors(`${side}Eyelid`, base.w).some(rgb => Math.min(...rgb) > 220)).toBe(true);
    expect(colors(`ysmGlow${side}Pupil`, base.w).some(rgb => Math.max(...rgb) < 70)).toBe(true);
    expect(iris.some(([red, green, blue]) => red > 240 && blue > 230 && green > 140)).toBe(true);
  }
  const ring = colors('ysmGlowbone24', base.w + 128);
  expect(ring.some(([red, green]) => red > 175 && green < 85)).toBe(true);
  expect(ring.some(([red, green, blue]) => red > 210 && green > 145 && blue < green)).toBe(true);
});

it('四种旧包贴图仍是各自的原始像素，不使用 D 版眼睛或扩展图集', () => {
  for (const [贴图, uri] of [['2default', skin2], ['3default', skin3], ['4default', skin4], ['5default', skin5]] as const) {
    const old = packCreature.getModel({ 贴图 });
    expect([old.texW, old.texH, old.texture.w, old.texture.h]).toEqual([orig.texW, orig.texH, orig.texW, orig.texH]);
    expect(Buffer.compare(old.texture.px, png(uri).px), 贴图).toBe(0);
    expect(bone(old, 'ysmGlowLeftEyesBase')).toEqual(bone(orig, 'ysmGlowLeftEyesBase'));
  }
});
