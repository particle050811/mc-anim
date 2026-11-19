// 季风。出处 goety 2.5.60.6：MonsoonSpell、MonsoonCloud、AbstractSpellCloud、SThunderBoltPacket、BoltRenderInfo.thunderBolt、原版 RAIN。
// 半径 2、持续 100 刻（风暴系法术，下界魔杖没变化）。云在目标头上 4 格：
// - 每刻 13 颗 SPELL_CLOUD 撒在云面圆盘上，颜色 0x434343（深灰）；
// - 激活（20 刻后）起每刻 13 颗 RAIN 从云面落下；
// - 云下有目标时每刻 5% 概率落一道雷：SThunderBoltPacket 从云心到目标半身高，颜色 11660252 = 0xB1EBDC，寿命 10 刻，thunderBolt 预设。
// 自己定的：只下 60 刻；落雷按种子抽签（一刻一次 5%），一道都没抽中就在激活后 20 刻补一道；SPELL_CLOUD 颜色直接取 0x434343 乘贴图（按 ×0.5 算会黑成一团）。
// 下界里照样下 RAIN（蓝雨滴）：MonsoonCloud、AbstractSpellCloud、MonsoonSpell 和天启的 AbstractSpellCloudMixin 都不判维度，游戏里在下界放也是这样。
// 5-击败 的死亡画面里那阵蓝雨就是它：齐放时扔的季风被 余术.ts 接着放完，雨下到段内约 3.3 秒、云约 3.8 秒散。用户 11-19 定留着照游戏，不改。
// 没做：目标受伤、痉挛效果。落雷的声音按 种子 1 排在元数据里，别的种子画面里的落雷刻不同。
import React from 'react';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { hexColor } from '../零件/材质.ts';
import { cloudPieceClass, raindropClass } from '../零件/丁粒子.ts';
import { cloudFaceSpawns, raindropSpawns } from '../零件/丁云.ts';
import { TexturedParticles } from '../零件/粒子.tsx';
import meta, { monsoonRainTicks, monsoonActiveTick, monsoonStrikeTicks } from './季风.元.ts';

const radius = 2;
const thunderColor = hexColor(11660252);
const cloudGray = 0x43 / 255;

const Monsoon: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed }) => {
  const tick = sec * 20;
  const cloudCenter: [number, number, number] = [target[0], target[1], target[2] + 4];
  const endTick = monsoonActiveTick + monsoonRainTicks;
  return (
    <>
      <TexturedParticles type={cloudPieceClass} spawns={cloudFaceSpawns(seed * 17 + 1, cloudCenter, radius, endTick, [cloudGray, cloudGray, cloudGray])} sec={sec} />
      <TexturedParticles type={raindropClass} spawns={raindropSpawns(seed * 17 + 2, cloudCenter, radius, monsoonActiveTick, endTick)} sec={sec} />
      {monsoonStrikeTicks(seed).map((t) => (
        <ElectricArc key={t} start={cloudCenter} end={[target[0], target[1], target[2] + 0.9]} settings={arcPresets.thunderBolt} 刻={tick - t} lifeTicks={10} 色={thunderColor} seed={seed * 131 + t} />
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, Monsoon);
