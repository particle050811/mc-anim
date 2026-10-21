// 6-1-7 连穿两处在一镜到底里要画的东西：幽冥高塔 + 暮初恶魂（6-1-7a）、雪怪洞窟 + 雪怪首领 + 碎块（6-1-7b）。按 编排.ts，物理时间 t。
import React from 'react';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { png } from '../../../../engine/model/贴图.ts';
import { UrGhast, UR_GHAST } from '../../../../world/生物/暮初恶魂.tsx';
import { AlphaYeti, ALPHA_YETI } from '../../../../world/生物/雪怪首领.tsx';
import { DarkTower } from '../../../../world/地点/幽冥高塔.tsx';
import { LandmarkPlacement, landmarkHideOutsideCore } from '../../../../world/地点/暮色新世界.tsx';
import { YetiCave, YetiCave_ATLAS } from '../../../../world/地点/雪怪洞窟.tsx';
import { BlockDebris, DebrisData, debrisNearHide } from '../../../../world/特效/方块飞溅.tsx';
import { ExplosionBurst, PoofBurst } from '../../../../world/特效/生物死亡.tsx';
import { Debris } from '../../../../world/特效/烟尘.tsx';
import yetiDebrisRaw from 'asset:碎块/镜头/6-1-7/雪怪碎块';
import * as choreo from './编排.ts';

const YETI_DEBRIS = yetiDebrisRaw as unknown as DebrisData;
const YETI_ATLAS = png(YetiCave_ATLAS);
// 管子的盒子各自外扩一格后的范围（雪怪碎块.json 的 `hide`）：整块从网格里拿掉，由碎块和原地的外圈方块顶替
const YETI_HIDE = YETI_DEBRIS.hide ?? [];
const NO_HIDE: number[][] = [];
// 新世界里只用核心那一块（暮色新世界.tsx 的 `yetiCore`），外面的网格一直藏着：按方块藏（`hideBlocks`），核心边上补侧面
// 两个 boss 的模型正面朝 −Y：按穿刺线朝向（往左为正）整个转过去，正面对着冲来的扫帚；炸点、白烟也照这个转
const rotByHeading = (heading: number, vec: number[]): V3 => {
  const cos = Math.cos((heading * Math.PI) / 180);
  const sin = Math.sin((heading * Math.PI) / 180);
  return [vec[0] * cos - vec[1] * sin, vec[0] * sin + vec[1] * cos, vec[2]];
};
const add = (p: number[], q: number[]): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];

// 暮初恶魂：浮在塔顶，盯着从北偏东冲来的扫帚；被贯穿时变红、换成喷火那张脸，接着炸开（炸点、白烟放大）
export const UrGhastScene: React.FC<{ t: number; broom: V3 }> = ({ t, broom }) => {
  const show = t > choreo.ghastShowWindow.起 && t < choreo.ghastShowWindow.止;
  const foot = choreo.GHAST_FOOT;
  const ghastCenter = choreo.GHAST_AT;
  // 视线：朝扫帚（模型约定头仰正 = 往下看；在恶魂自己转过去以后的坐标里算）
  const broomLocal = choreo.towerFrame.toLocal(broom);
  const [dx, dy, dz] = rotByHeading(-choreo.GHAST_HEADING, [broomLocal[0] - ghastCenter[0], broomLocal[1] - ghastCenter[1], broomLocal[2] - ghastCenter[2]]);
  const look = t < 0 ? { 偏: Math.atan2(dx, -dy), 仰: -Math.atan2(dz, Math.hypot(dx, dy)) } : { 偏: 0, 仰: 0 };
  // 被贯穿就变红、一直红到炸开（同巫妖，用户 10-07 定）
  const hurt = t >= 0 ? 1 : 0;
  return (
    <LandmarkPlacement 名="幽冥高塔">
      <DarkTower />
      {show && (
        <>
          {t < choreo.GHAST_DEATH.gone && (
            <group position={foot} rotation={[0, 0, (choreo.GHAST_HEADING * Math.PI) / 180]}>
              <UrGhast 秒={t + 40} 头偏={Math.max(-0.6, Math.min(0.6, look.偏))} headPitch={Math.max(-0.5, Math.min(0.5, look.仰))} face={t >= 0 ? '喷火' : '睁眼'} 受伤={hurt} />
            </group>
          )}
          {[0, 1, 2].map((i) => (
            <ExplosionBurst key={i} center={add(choreo.GHAST_AT, rotByHeading(choreo.GHAST_HEADING, [(i - 1) * 3, 0, (i % 2) * 2]))} width={UR_GHAST.bodySize / 2} sec={t - choreo.GHAST_DEATH.boom - i * 0.06} seed={90 + i} />
          ))}
          <PoofBurst center={choreo.GHAST_AT} width={UR_GHAST.bodySize / 2} height={UR_GHAST.bodySize} sec={t - choreo.GHAST_DEATH.boom} seed={93} />
        </>
      )}
    </LandmarkPlacement>
  );
};

// 雪怪首领：站在大厅正中，反应不过来、一动不动（用户 10-07 定）；被贯穿时变红，接着炸开化成白烟
// 镜头：世界坐标的镜头位置，飞散的碎块离镜头太近就淡出（模型/特效/方块飞溅.tsx 的 `NearHide`）
export const AlphaYetiScene: React.FC<{ t: number; camPos?: number[] }> = ({ t, camPos: camPos }) => {
  const show = t > choreo.yetiShowWindow.起 && t < choreo.yetiShowWindow.止;
  const tIn = choreo.yetiTimeAt(choreo.yetiTunnels.enterCave);
  const hurt = t >= 0 ? 1 : 0;
  const tube = t >= tIn - 0.02;
  // 三次撞击（编排.ts 的 雪怪撞击）：西口、雪怪头顶的刷怪笼、东口；沿路线方向飞，速度按扫帚
  const dir = (dist: number): V3 => {
    const behind = choreo.yetiTipLocal(dist - 1);
    const ahead = choreo.yetiTipLocal(dist + 1);
    const len = Math.hypot(ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]);
    return [(ahead[0] - behind[0]) / len, (ahead[1] - behind[1]) / len, (ahead[2] - behind[2]) / len];
  };
  const at = (a: number) => t - choreo.yetiTimeAt(a);
  const [h0, h1, h2] = choreo.yetiImpacts;
  const bursts = [
    { sec: at(h0.a), dir: dir(h0.a), origin: choreo.yetiTipLocal(h0.心), speed: 0.5 * choreo.speed, spread: 30, seed: 101, gravity: 16, stagger: 0.0004, chips: 14, spin: 60, hidden: tube, 管: choreo.yetiTubes[0] },
    { sec: at(h1.a), dir: dir(h1.a), origin: choreo.yetiTipLocal(h1.心), speed: 0.5 * choreo.speed, spread: 30, seed: 102, gravity: 16, stagger: 0.0004, chips: 14, spin: 60, hidden: tube, 管: choreo.yetiTubes[1] },
    { sec: at(h2.a), dir: dir(h2.a), origin: choreo.yetiTipLocal(h2.心), speed: 0.5 * choreo.speed, spread: 30, seed: 103, gravity: 16, stagger: 0.0004, chips: 14, spin: 60, hidden: tube, 管: choreo.yetiTubes[2] },
  ];
  // 两条隧道（编排.ts 的 `yetiTunnels`）的四个口各喷一把土（同九头蛇钻穿土丘，6-1-6/戏.tsx）
  const snowDirt = ['#f0f4f8', '#d8e0e8', '#6b4a2e', '#7a7a7a'];
  const iceStone = ['#a8c4e8', '#8fb0d8', '#7a7a7a', '#5e5e5e'];
  const tunnelMouths = [
    { a: choreo.yetiTunnels.enterGround, colors: snowDirt, count: 30, speed: 12, seed: 104 },
    { a: choreo.yetiTunnels.enterCave, colors: iceStone, count: 22, speed: 9, seed: 105 },
    { a: choreo.yetiTunnels.exitCave, colors: iceStone, count: 22, speed: 9, seed: 106 },
    { a: choreo.yetiTunnels.exitGround, colors: snowDirt, count: 34, speed: 12, seed: 107 },
  ];
  return (
    <LandmarkPlacement 名="雪怪洞窟">
      <YetiCave hide={tube ? YETI_HIDE : NO_HIDE} hideBlocks={landmarkHideOutsideCore.雪怪洞窟} />
      {show && (
        <>
          {t < choreo.YETI_DEATH.gone && (
            <group position={choreo.YETI_AT} rotation={[0, 0, (choreo.YETI_HEADING * Math.PI) / 180]}>
              <AlphaYeti sec={t + 40} state="暴走" hurt={hurt} />
            </group>
          )}
          <ExplosionBurst center={add(choreo.YETI_AT, rotByHeading(choreo.YETI_HEADING, [0, 2, ALPHA_YETI.chest]))} width={2.5} sec={t - choreo.YETI_DEATH.boom} seed={111} />
          <PoofBurst center={add(choreo.YETI_AT, rotByHeading(choreo.YETI_HEADING, [0, 2, ALPHA_YETI.height / 2]))} width={1.9} height={ALPHA_YETI.height} sec={t - choreo.YETI_DEATH.boom} seed={112} />
          {tunnelMouths.map((k) => (
            <Debris key={k.seed} sec={at(k.a)} origin={choreo.yetiTipLocal(k.a)} seed={k.seed} colors={k.colors} count={k.count} speed={k.speed} />
          ))}
          <BlockDebris data={YETI_DEBRIS} atlas={YETI_ATLAS} bursts={bursts} nearHide={camPos && { 镜头: choreo.caveFrame.toLocal(camPos), ...debrisNearHide }} />
        </>
      )}
    </LandmarkPlacement>
  );
};
