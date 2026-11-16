// 史蒂夫反应核对的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），
// 史蒂夫站在原点、面朝南（yaw 180），假想的亚波伦在南边高处（看点）；他的右手（拿剑的）在西边（−x）。
import type { V3 } from '@engine/model/parts.tsx';
import type { SteveState } from '../../角色/史蒂夫反应.ts';

export const aspect = { width: 1280, height: 720 } as const;

export type View = {
  name: string;
  眼: V3;
  看: V3;
  fov: number;
  /** 位置、朝向固定（原点、朝南），这里只写其余的 */
  state: Omit<SteveState, '位置' | 'facing'>;
  /** 箭出手后几秒（朝 状态.看 射，满弦） */
  arrowSec?: number;
  /** 距图腾触发几秒 */
  totemSec?: number;
  note?: string;
};

export const highPlace: V3 = [0, -10, 10];
const levelLook: V3 = [0, -10, 1.6];

const front = { 眼: [0, -8.5, 1.5] as V3, 看: [0, 0, 1.2] as V3, fov: 30 };
const rightFront = { 眼: [-5.2, -6.6, 2.0] as V3, 看: [0, -0.3, 1.15] as V3, fov: 30 };
const leftFront = { 眼: [5.2, -6.6, 2.0] as V3, 看: [0, -0.3, 1.15] as V3, fov: 30 };
const directSide = { 眼: [-8.5, 0, 1.5] as V3, 看: [0, 0, 1.2] as V3, fov: 30 };
const leftSide = { 眼: [8.5, 0, 1.5] as V3, 看: [0, 0, 1.2] as V3, fov: 30 };
const farRightFront = { 眼: [-7.5, -9.5, 3.2] as V3, 看: [0, -0.5, 1.4] as V3, fov: 34 };
const arrowSide = { 眼: [-14, -3, 3.5] as V3, 看: [0, -3, 3.6] as V3, fov: 40 };

export const views: readonly View[] = [
  { name: '戒备-右前斜', ...rightFront, state: { sec: 0.5, 看: levelLook }, note: '站着握剑平视（原版拿东西的站姿）' },
  { name: '戒备-带盾-正面', ...front, state: { sec: 0.5, 看: levelLook, leftHand: '盾' }, note: '左手提着盾没举（shield.json 的左手变换）' },
  { name: '仰头看-正侧', ...directSide, state: { sec: 0.5, 看: highPlace }, note: '头仰起看南边高处，身子不动' },
  { name: '仰头看-正面', ...front, state: { sec: 0.5, 看: highPlace } },
  { name: '举盾-右前斜', ...rightFront, state: { sec: 0.5, 看: levelLook, leftHand: '盾', shieldUp: true }, note: '原版 BLOCK 姿势 + shield_blocking.json' },
  { name: '举盾-正面', ...front, state: { sec: 0.5, 看: levelLook, leftHand: '盾', shieldUp: true } },
  { name: '举盾-左前斜-仰头', ...leftFront, state: { sec: 0.5, 看: highPlace, leftHand: '盾', shieldUp: true }, note: '仰头时原版举盾的手臂不变，盾举不过头顶' },
  { name: '拉弓-0.2秒', ...rightFront, state: { sec: 0.5, 看: highPlace, rightHand: '弓', drawSec: 0.2 }, note: '原版 BOW_AND_ARROW，贴图 bow_pulling_0' },
  { name: '拉弓-0.8秒', ...directSide, state: { sec: 0.5, 看: highPlace, rightHand: '弓', drawSec: 0.8 }, note: 'bow_pulling_1' },
  { name: '拉弓-满弦', ...leftFront, state: { sec: 0.5, 看: highPlace, rightHand: '弓', drawSec: 1.2 }, note: 'bow_pulling_2' },
  { name: '射出-0.1秒后', ...arrowSide, state: { sec: 0.5, 看: highPlace, rightHand: '弓' }, arrowSec: 0.1, note: '松手后弓回到没拉的贴图、手臂回拿东西的站姿；箭满弦初速 3 格/刻' },
  { name: '挣扎-甲', ...rightFront, state: { sec: 0.3, 看: highPlace, struggle: 1 }, note: '自己补的：原地摆腿加拧身，脚不挪（游戏里被钉住没有动作）' },
  { name: '挣扎-乙', ...rightFront, state: { sec: 0.7, 看: highPlace, struggle: 1 } },
  { name: '挣扎-丙', ...front, state: { sec: 1.1, 看: highPlace, struggle: 1 } },
  { name: '挨打-后仰到头', ...directSide, state: { sec: 0.5, 看: levelLook, hitReactSec: 0.06 }, note: '变红是原版（只红皮肤，盔甲不红）；后仰 10 度是自己补的' },
  { name: '挨打-0.2秒', ...rightFront, state: { sec: 0.5, 看: levelLook, hitReactSec: 0.2 } },
  { name: '挨打-只变红', ...front, state: { sec: 0.5, 看: levelLook, hitReactSec: 0.1, backLeanDeg: 0 }, note: '原版原样：身子不动' },
  { name: '持图腾', ...leftFront, state: { sec: 0.5, 看: levelLook, leftHand: '图腾' }, note: '副手不死图腾（触发前）' },
  { name: '图腾触发-0.25秒', ...farRightFront, state: { sec: 0.5, 看: levelLook, hitReactSec: 0.25 }, totemSec: 0.25, note: '原版图腾粒子（第三人称）：30 刻里每刻约 8 颗，黄绿两色；图腾用掉，左手空了' },
  { name: '图腾触发-1秒', ...farRightFront, state: { sec: 1.2, 看: levelLook }, totemSec: 1.0 },
  { name: '图腾触发-2.5秒', ...farRightFront, state: { sec: 2.7, 看: levelLook }, totemSec: 2.5, note: '发射停了，剩下的落地、变淡' },
  { name: '死亡-0.25秒', ...farRightFront, state: { sec: 0.5, 看: levelLook, afterDeathSec: 0.25 }, note: '原版：变红、往他左手边倒；物品死的那一刻就扔出来' },
  { name: '死亡-0.7秒', ...farRightFront, state: { sec: 0.5, 看: levelLook, afterDeathSec: 0.7 }, note: '倒平（第 13.5 刻）' },
  { name: '死亡-1.05秒', ...farRightFront, state: { sec: 0.5, 看: levelLook, afterDeathSec: 1.05 }, note: '第 20 刻人没了，20 个白烟' },
  { name: '死亡-3秒', ...farRightFront, state: { sec: 0.5, 看: levelLook, afterDeathSec: 3 }, note: '掉落物落地，原地浮动、自转' },
  { name: '挥剑-0.1秒', ...rightFront, state: { sec: 0.5, 看: levelLook, swingSec: 0.1 }, note: '库里现成的原版挥手' },
  { name: '挥剑-0.2秒', ...leftSide, state: { sec: 0.5, 看: levelLook, swingSec: 0.2 } },
];
