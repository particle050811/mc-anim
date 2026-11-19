import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAnimationFile, sampleAnim } from 'mc-anim/engine/anim/基岩动画.ts';
import { bindMotion } from './项目动作.ts';

const [source, imported] = process.argv.slice(2);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const motion = read(path.join(imported, 'motion.json'));
const model = read(path.join(imported, 'model.json'));
const poseAt = bindMotion(motion, new Set(model.bones.map(bone => bone.name)));
const header = read(path.join(source, 'ysm.json'));
const file = read(path.join(source, header.files.player.animation[motion.slot]));
const animation = parseAnimationFile({ animations: { clip: file.animations[motion.name] } }).clip;
const times = new Set([0, 0.03125, 0.5, 1, 2, (motion.track.lengthSec ?? 1) * 1.25]);
for (const bone of Object.values(motion.track.bones)) for (const rows of Object.values(bone)) {
  for (const [index, row] of rows.entries()) {
    times.add(row[0]);
    if (index) times.add((row[0] + rows[index - 1][0]) / 2);
  }
}
for (const sec of times) assert.deepEqual(poseAt(sec), sampleAnim(animation, sec).skeleton, `原包与制作轨姿势不同 @ ${sec}`);
console.log(`${motion.slot}/${motion.name}：原包与项目 bindMotion 在 ${times.size} 个采样时刻姿势一致`);
