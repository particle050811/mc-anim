// 九头蛇（暮色森林 1.20.1-4.3.2508 的 Hydra）：模型、贴图、头和脖子的摆法都从 mod jar 照抄（npm run 取材 -- 九头蛇）。游戏里它是好几个实体拼的，这里照拼：
// - 身体（`HydraModel`）：只画 body、两条腿、尾巴（`renderFakeHeads` 为假时不画自带的假头）。身体 6×6×2.5 格往后仰 70°，腿 2×3×2，尾巴四节往后伸 8 格。贴图 hydra4.png（512×256）。
// - 头（`HydraHeadModel`）：头 2×1.5×2 格、吻部伸到 3.5 格、下颌、牙、背鳍和脑后 3×3 格褶边。`prepareMobModel`：头 yRot / xRot = 实体朝向 / 俯仰；张嘴 `mouthOpen`（0～1）时下颌 xRot = 张嘴 × 60°，头再抬 张嘴 × 15°。
// - 脖子（`HydraNeckModel`，5 节/头）：每节 2 格见方的方块带背鳍。
// 头和脖子的位置照 `HydraHeadContainer`：
// - 开局只有前三个头（共 7 个头位）。头的位置 = 九头蛇位置 + (0, 3, 0) + 长度 len 的向量先按 xRot（上抬）、再按 -(身体朝向 + yRot)（往两边）转；
//   IDLE：0 号头 (xRot 60°, yRot 0°, len 7)，1 号 (10°, 60°, 9)，2 号 (10°, -60°, 9)。头会晃：xRot + sin(刻/f11)×3、yRot + sin(刻/f12)×5，f11 / f12 按头号取 20/10、5/6、7/5（`setHeadPosition`）。
// - 脖子根（`setNeckPosition`）：0 号 (0, 3, -1)，1 号 (-1, 3, 3) 转 -90°，2 号 (1, 3, 3) 转 +90°（MC 坐标，朝南）；5 节脖子均匀摆在「头往后退 1 格」到「脖子根」之间，朝向从头的朝向渐变到身体朝向，俯仰渐变到 0。
// - 每个部件实体的模型原点在脚底上方 1.501 格（`TFPartRenderer`），所以头、脖子方块中心比算出的位置高 1.5 格。
// 坐标：原点在九头蛇脚底中心，Z 朝上，正面朝 -Y（实体坐标，同 贴图方盒.tsx），单位格。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import { EntityModel, EntityModelData } from '../../engine/model/实体模型.tsx';
import type { V3 } from '../../engine/model/parts.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw from 'asset:模型/角色/九头蛇';
import skin from 'asset:贴图/角色/九头蛇';

const MODELS = (raw as unknown as { models: Record<'身体' | '头' | '颈', EntityModelData> }).models;
const TEX = png(skin);

export const HYDRA = {
  heads: 3, // 开局的头数
  bodyTop: 4.6, // 身体最高处离地（往后仰的那块）
  partLift: 1.501, // 头、脖子实体的模型原点在实体位置上方这么多
  // IDLE 状态的头（度、格）
  idle: [
    { x: 60, y: 0, len: 7 },
    { x: 10, y: 60, len: 9 },
    { x: 10, y: -60, len: 9 },
  ],
  // 脖子根（MC 坐标、朝南）和 setNeckPosition 里的转角
  neckBase: [
    { v: [0, 3, -1], turn: 0 },
    { v: [-1, 3, 3], turn: 90 },
    { v: [1, 3, 3], turn: -90 },
  ],
  sway: [
    [20, 10],
    [5, 6],
    [7, 5],
  ],
  debris: ['#2f4a2a', '#3d5c34', '#1f3320', '#6a7a3a'], // 碎屑配色（取自贴图的鳞片绿）
};

// MC 实体坐标（朝南、x 东、y 上、z 南）→ 实体坐标（正面 -Y、Z 上）：(x, -z, y)
const fromMc = (v: number[]): V3 => [v[0], -v[2], v[1]];
// Vec3.xRot / yRot（1.20.1）
const xRotV = (v: number[], a: number) => [v[0], v[1] * Math.cos(a) + v[2] * Math.sin(a), v[2] * Math.cos(a) - v[1] * Math.sin(a)];
const yRotV = (v: number[], a: number) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], v[2] * Math.cos(a) - v[0] * Math.sin(a)];

// 一个头的状态：x / y / len 同 `HydraHeadContainer` 的 stateXRotations / stateYRotations / stateNeckLength（度、格）；张嘴 0～1；看：头朝向的目标点（实体坐标），不给就朝正前方 30 格外、高 3 格（faceIdle）
export type HydraHead = { x: number; y: number; len: number; mouthOpen?: number; 看?: V3; hidden?: boolean };

// 头（实体位置，即脚底）在实体坐标里的位置
export const hydraHeadPos = (head: HydraHead, i: number, sec: number, swayScale = 1): V3 => {
  const tick = sec * 20;
  const [f11, f12] = HYDRA.sway[i] ?? [7, 5];
  const sx = Math.sin(tick / f11) * 3 * swayScale;
  const sy = Math.sin(tick / f12) * 5 * swayScale;
  let headVec = xRotV([0, 0, head.len], ((head.x + sx) * Math.PI) / 180);
  headVec = yRotV(headVec, (-(head.y + sy) * Math.PI) / 180);
  return fromMc([headVec[0], headVec[1] + 3, headVec[2]]);
};
export const hydraNeckBase = (i: number): V3 => {
  const neckBase = HYDRA.neckBase[i];
  return fromMc(yRotV(neckBase.v, (-neckBase.turn * Math.PI) / 180));
};

// 朝向：实体坐标里朝 d 方向的转角（绕 Z，0 = 朝 -Y）和仰角（正 = 往上）
const aim = (d: number[]) => ({ yaw: Math.atan2(d[0], -d[1]), pitch: Math.atan2(d[2], Math.hypot(d[0], d[1])) });

export type HydraPose = { heads: HydraHead[]; 腿?: number };

export const hydraParts = (p: HydraPose, sec: number) =>
  p.heads.map((head, i) => {
    const pos = hydraHeadPos(head, i, sec);
    const eye: V3 = [pos[0], pos[1], pos[2] + HYDRA.partLift];
    const target = head.看 ?? [pos[0], pos[1] - 30, 3 + HYDRA.partLift];
    const headAim = aim([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
    const look = [Math.sin(headAim.yaw) * Math.cos(headAim.pitch), -Math.cos(headAim.yaw) * Math.cos(headAim.pitch), Math.sin(headAim.pitch)];
    const neckTop = [pos[0] - look[0], pos[1] - look[1], pos[2] - look[2]];
    const neckRoot = hydraNeckBase(i);
    const necks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      pos: [neckTop[0] + (neckRoot[0] - neckTop[0]) * f, neckTop[1] + (neckRoot[1] - neckTop[1]) * f, neckTop[2] + (neckRoot[2] - neckTop[2]) * f] as V3,
      yaw: headAim.yaw * (1 - f),
      pitch: headAim.pitch * (1 - f),
    }));
    return { pos, yaw: headAim.yaw, pitch: headAim.pitch, necks, mouth: head.mouthOpen ?? 0, hide: head.hidden };
  });

const HIDE_FAKE = Object.fromEntries(
  ['head_1', 'head_2', 'head_3', 'neck_1a', 'neck_2a', 'neck_3a'].map((n) => [n, { hide: true }]),
);

// 秒：游戏时间（头晃动）；pose.heads 默认 IDLE 的三个头；发光：受击时闪白（0～1）；受伤：原版受伤 / 死亡时的变红（0～1，同巫妖，lib/实体模型.tsx）
export const Hydra: React.FC<{ sec: number; pose?: HydraPose; opacity?: number; hitFlash?: number; hurt?: number }> = ({ sec: sec, pose = { heads: HYDRA.idle }, opacity = 1, hitFlash = 0, hurt: hurt = 0 }) => {
  const em = Math.round(hitFlash * 10) / 10;
  const parts = hydraParts(pose, sec);
  const leg = pose.腿 ?? 0;
  return (
    <>
      <EntityModel model={MODELS.身体} tex={TEX} opacity={opacity} emissive={em} hurt={hurt} pose={{ ...HIDE_FAKE, leg_1: { rot: [leg, 0, 0] }, leg_2: { rot: [-leg, 0, 0] } }} />
      {parts.map((h, i) =>
        h.hide ? null : (
          <React.Fragment key={i}>
            <group position={h.pos} rotation={[0, 0, h.yaw]}>
              <EntityModel
                model={MODELS.头}
                tex={TEX}
                opacity={opacity}
                emissive={em} hurt={hurt}
                pose={{ head: { rot: [-h.pitch - h.mouth * rad(15), 0, 0] }, jaw: { rot: [h.mouth * rad(60), 0, 0] } }}
              />
            </group>
            {h.necks.map((n, j) => (
              <group key={j} position={n.pos} rotation={[0, 0, n.yaw]}>
                <EntityModel model={MODELS.颈} tex={TEX} opacity={opacity} emissive={em} hurt={hurt} pose={{ neck: { rot: [-n.pitch, 0, 0] } }} />
              </group>
            ))}
          </React.Fragment>
        ),
      )}
    </>
  );
};
