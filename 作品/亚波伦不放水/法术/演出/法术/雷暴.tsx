// 雷暴。出处 goety 2.5.60.6：ThunderstormSpell、MagicLightningTrap、AoEParticle、SLightningBoltPacket、SLightningPacket。
// 举杖 20 刻后每刻放 2 处（下界魔杖 rightStaff；前 20 刻围着目标 ±16 格，之后围着施法者 ±16 格）。每处：
// - 预警圈 AoEParticle：白色贴地方片，半边长从 3 格每刻缩 3÷40 到 0，透明度 0.25，活 40 刻；
// - 40 刻后落雷：CircleExplode（0xB1EBDC，大小 3）、SphereExplode（同色，大小 3）、一道 lightningBolt 从高空劈下（寿命 10 刻）、
//   施法者头顶也劈一道往天上去的（寿命 10 刻）、16 道 shock 小电弧（从落点上方 1 格往四周偏 ±4，寿命 12 刻）。
// 选项 无预警圈：不画预警圈，落雷照旧（亚波伦第 4 幕连放时地上铺满白圈，用户 11-11「雷暴预警圈全部删掉」；核对段照旧画）。
// 这里把 目标 当成目标脚底；起点只取水平位置（围着施法者的那批也落在目标脚底的地面高度）。
// 自己定的：只放到第 50 刻；闪电起点取 40 格高（游戏里 250 格，画面里看不出差别）。
// 没做：GatherTrailParticle 八条汇聚拖尾；落点不贴地（取目标脚底高度，没有 moveDownToGround）；伤害、痉挛。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 地面贴花 } from '../零件/地面贴花.tsx';
import { 十六进制色 } from '../零件/材质.ts';
import { 圆爆, 球爆 } from '../零件/甲/爆.tsx';
import 元, { 雷暴落点们, 雷暴预警刻 } from './雷暴.元.ts';
import 预警图数据 from 'asset:贴图/法术/goety/particle/aoe_indicator';

const 预警图 = png(预警图数据);
const 雷色 = 十六进制色(11660252);
const 白 = 十六进制色(0xffffff);

const 雷暴: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子, 选项 }) => {
  const 刻 = 秒 * 20;
  const 头: 点 = [起点[0], 起点[1], 起点[2] + 1.5];
  return (
    <>
      {雷暴落点们(种子).map((p, i) => {
        const 心 = p.近目标 ? 目标 : 起点;
        // 圈和落雷都贴目标脚底的地面高度（起点悬在演出机位的空中，围着它的那批也落到地面）
        const 位: 点 = [心[0] + p.偏x, 心[1] - p.偏z, 目标[2]];
        const 龄 = 刻 - p.生;
        const 劈 = 龄 - 雷暴预警刻;
        const r = rng(种子 * 733 + i);
        return (
          <React.Fragment key={i}>
            {!选项?.无预警圈 && 龄 >= 1 && 龄 < 雷暴预警刻 && <地面贴花 位={位} 图={预警图} 半径={3 * (1 - (龄 - 1) / 雷暴预警刻)} 色={白} 透明度={0.25} 抬高={0.1} />}
            {劈 >= 0 && 劈 < 12 && (
              <>
            <圆爆 位={位} 刻={劈} 色={雷色} 尺寸={3} 速={1} />
            <球爆 位={位} 刻={劈} 色={雷色} 尺寸={3} 速={1} />
            <电弧 起={[位[0], 位[1], 位[2] + 40]} 终={位} 设定={电弧预设.lightningBolt} 刻={劈} 寿命刻={10} 色={雷色} 种子={种子 * 31 + i} />
            <电弧 起={头} 终={[头[0], 头[1], 头[2] + 40]} 设定={电弧预设.lightningBolt} 刻={劈} 寿命刻={10} 色={雷色} 种子={种子 * 37 + i} />
            {Array.from({ length: 16 }, (_, k) => {
              const 终: 点 = [位[0] + Math.floor(r() * 9 - 4) * r(), 位[1] + Math.floor(r() * 9 - 4) * r(), 位[2] + 1 + r()];
              return <电弧 key={k} 起={[位[0], 位[1], 位[2] + 1]} 终={终} 设定={电弧预设.shock} 刻={劈} 寿命刻={12} 色={雷色} 种子={种子 * 3001 + i * 20 + k} />;
            })}
              </>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default 定义法术演出(元, 雷暴);
