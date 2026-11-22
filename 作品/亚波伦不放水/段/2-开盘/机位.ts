// 第 2 幕 偷袭的镜头表（纯模块）：画面.tsx 照它摆镜头，地形视图.ts 拿它给加载计划，两边同一份。
import type { Cam } from '@engine/core/机位.ts';
import { lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { altar } from '../../场/1-台地/布局.ts';
import { pickShot, followShot, type Shot } from '../../场/1-台地/台地机位.ts';
import { firstDir, secondDir, hoverFirst, beats, localGroundHeight } from '../../场/1-台地/开盘时刻.ts';
import { toWorldSec } from '../../场/1-台地/开盘拍.ts';
import { yaBoLunPos, stevePos, actStart } from '../../场/1-台地/编排-开盘.ts';
import { orbitBeat, orbitRig } from '../../场/1-台地/绕拍.ts';
import seg from './段.ts';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const lerpVec = (a: readonly number[], b: readonly number[], k: number): V3 => [lerp(a[0]!, b[0]!, k), lerp(a[1]!, b[1]!, k), lerp(a[2]!, b[2]!, k)];
/** 段内片秒 → 编排的钟（世界秒） */
const clock = (s: number) => actStart + toWorldSec(s);
const steveChest = (t: number) => addVec(stevePos(t), [0, 0, 1.0]);
const yaBoLunChest = (t: number) => addVec(yaBoLunPos(t), [0, 0, 1.1]);

/** 镜头从片秒 起 到 止，跟拍；摆(镜内片秒, 进度) */
const follow = (name: string, startSec: number, endSec: number, cameraPath: (s: number, k: number) => Cam, stepSec = 0.05): Shot => ({ name: name, start: startSec, cameraRig: followShot(endSec - startSec, (s, k) => cameraPath(startSec + s, k), stepSec) });

// 切点（片秒）：首冲→瞬移后回身→拉升绕拍，末镜直接接齐放。
const cuts = [0, beats.移, orbitBeat.start, orbitBeat.end] as const;
const shotTable: Shot[] = [
  // 2-01 他冲的那条线东边、和人差不多高（16 mm）：她从祭坛一蹬飞出来、刹在他东北边，他蹲下、挥剑冲出去，她冒烟一缩没了，他冲进烟里。
  // 固定地标，只摇不追，保留高速冲过祭坛的位移。
  follow('2-01', cuts[0], cuts[1], (_s, k) => {
    const caster = addVec(hoverFirst, [altar[0], altar[1], altar[2] + 1.1]);
    const fighter = steveChest(actStart);
    const separation = Math.hypot(caster[0] - fighter[0], caster[1] - fighter[1]);
    const pathMid = lerpVec(fighter, caster, 0.52);
    const right: V3 = [firstDir[1], -firstDir[0], 0];
    const pos = addVec(addVec(pathMid, right, 2.5 + 0.63 * separation), [0, 0, 1.7]);
    return { pos, tgt: lerpVec(pathMid, caster, 0.2 * smoothstep01(k)), lens: 16 };
  }),
  // 2-02 两人西边、略高：她从烟里冒出来带着冲势往东南一飘、刹住转向他；他滑停在她北边几格、原地横着打转，转完蹲着一扭身回头、蓄剑，她往下一沉。他在画面左、她在右
  follow('2-02', cuts[1], cuts[2], (s) => {
    const t = clock(s);
    const caster = yaBoLunChest(t), brake = smoothstep01((s - beats.移) / (beats.lookBack[0] - beats.移));
    const entry = steveChest(clock(beats.移)), stop = steveChest(clock(beats.lookBack[0]));
    const fighter = lerpVec(lerpVec(entry, stop, 0.5), stop, brake);
    const m = lerpVec(caster, fighter, 0.5);
    const distance = Math.hypot(caster[0] - fighter[0], caster[1] - fighter[1]);
    const corridor = Math.hypot(entry[0] - stop[0], entry[1] - stop[1]);
    const offset = Math.max(7, 0.79 * distance + 3.5, 0.66 * corridor * (1 - brake) + 7);
    const pos = addVec(m, [-secondDir[1] * offset, secondDir[0] * offset, 2.8]);
    pos[2] = Math.max(pos[2], altar[2] + localGroundHeight(pos[0] - altar[0], pos[1] - altar[1]) + 1.1);
    return { pos, tgt: m, lens: 18 };
  }),
  // 2-03 绕着她转 180 度（绕拍.ts）：她往上一拉，他冲过来从她脚底下过去（这一下起慢放），她一甩身对着他、伸杖、杖尖张盘、拉升到祭坛上空，
  // 镜头在世界里从她右后方逆时针绕到她左前方，四件事同时在这一镜里
  follow('2-03', cuts[2], cuts[3], (s) => orbitRig(s)),
];
/** 给测试查机位不入地、不穿基座（钟：片秒） */
export const actTwoShotTable = shotTable;
/** 段内第 sec 秒（片秒）的镜头 */
export const actTwoShotAt = (sec: number) => pickShot(shotTable, sec, seg.sec);
