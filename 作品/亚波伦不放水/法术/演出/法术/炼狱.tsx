// 炼狱。出处 goety 2.5.60.6 / revelationfix：RevelationSpell、RevelationCageEntity；本片演法见 特效/炼狱结界演出.tsx。
// 用户 11-09 定的「扔出去的结界」版：结界从 起点 飞向史蒂夫半身高、边飞边涨大、罩住他，再收缩焚烧。
// 画面直接用 特效/炼狱结界演出.tsx（线框是暗红的正十二面体，火是它自己说明过的占位）。
// 罩住只留 1 秒（见 炼狱.元.ts），全片里的 67.5 秒不在法术核对里演。
import React from 'react';
import { RevelationCagePerformance } from '../../../特效/炼狱结界演出.tsx';
import { cagePerformanceDefaults } from '../../../特效/炼狱结界演出状态.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import meta, { revelationFlySec, revelationShrinkSec, revelationCoverSec } from './炼狱.元.ts';

const Revelation: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target }) => (
  <RevelationCagePerformance
    sec={sec}
    settings={{ ...cagePerformanceDefaults, flyOutSec: revelationFlySec, coverSec: revelationCoverSec, shrinkBurnSec: revelationShrinkSec, from: [from[0], from[1], from[2]], target: [target[0], target[1], target[2] + 0.9] }}
  />
);

export default defineSpellPerformance(meta, Revelation);
