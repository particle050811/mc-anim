// 三叉戟风暴。出处 goety 2.5.60.6：TridentStormSpell、WandUtil.summonTridentMinor / summonTridentStorm、TridentStorm、TridentStormRenderer、TridentStormModel（SHOOT 关键帧写在模型类里）、
// SLightningBoltPacket → ClientProxy.lightningBolt、SLightningPacket → ClientProxy.shock、CircleExplodeParticle。
// - 这个法术围着施法者放，不朝目标：施法者四周各 2.5 格一处，落到地面。每处先亮一个贴地的预警圆（模型的 circle，放大 1.25 倍），
//   warmUp 40 刻 + 各自随机 0～60 刻后激活：圆消失，三叉戟从 13 格多高处 0.25 秒落下（SHOOT：位置 posVec(0, −212, 0)）。
// - 渲染器：translate(0, 1.6, 0)，mulPose(Z 180°)；entityTranslucentEmissive（半透明、满亮度）。
// - 激活后第 5 刻：贴地扩散环 CircleExplode（白，大小 3，speed 1）；一道 lightningBolt 从正上方 250 格劈到落点（颜色 0x6464DC，寿命 5 刻）；
//   16 道 shock 小电弧从落点到落点上方 1 格、水平偏 0～1 格处（颜色 0xB1ABF1，寿命 2 刻）。warmUp + 40 + delay 时实体消失。
// 没做：SpellExplosion 的伤害和击退（没有画面）；头顶正上方有敌人时改劈那个敌人。配风暴法杖的四种大阵型不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { MC空间, 取模型, 模型件 } from '../零件/实体.tsx';
import { 关键帧姿态, type AnimDef } from '../零件/关键帧.ts';
import { 十六进制色 } from '../零件/材质.ts';
import { 圆环爆 } from '../零件/乙圆环.tsx';
import 元, { 戟偏, 戟炸隔刻, 戟留刻, 戟预警刻 } from './三叉戟风暴.元.ts';
import 模型数据 from 'asset:模型/法术/goety/TridentStormModel';
import 图数据 from 'asset:贴图/法术/goety/entity/projectiles/trident_storm';

const 模型 = 取模型(模型数据, 'TridentStormModel');
const 落: AnimDef = {
  length: 0.25,
  looping: false,
  bones: { trident: [{ target: 'position', keyframes: [{ t: 0, v: [0, 0, 0], interp: 'linear' }, { t: 0.25, v: [0, 212, 0], interp: 'linear' }] }] },
};
const 白: readonly [number, number, number] = [1, 1, 1];
const 大雷色 = 十六进制色(0x6464dc);
const 小雷色 = 十六进制色(0xb1abf1);

const 三叉戟风暴: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  return (
    <>
      {戟偏.map(([x, z], i) => {
        const r = rng(种子 * 883 + i);
        const 位: 点 = [起点[0] + x, 起点[1] - z, 目标[2]];
        const 落刻 = 戟预警刻 + Math.floor(r() * 61);
        const 炸刻 = 落刻 + 戟炸隔刻;
        const 激活 = 刻 >= 落刻;
        const 小终 = Array.from({ length: 16 }, (): 点 => [位[0] + r(), 位[1] - r(), 位[2] + 1]);
        return (
          <React.Fragment key={i}>
            {刻 < 落刻 + 戟留刻 && (
              <MC空间 位={位}>
                <group position={[0, 1.6, 0]}>
                  <group rotation={[0, 0, Math.PI]}>
                    <模型件
                      模型={模型}
                      图={png(图数据)}
                      画法="半透明"
                      姿态={激活 ? { ...关键帧姿态(模型, [[落, (刻 - 落刻) / 20]]), circle: { hide: true } } : { circle: { scale: [1.25, 1, 1.25] }, trident: { hide: true } }}
                    />
                  </group>
                </group>
              </MC空间>
            )}
            <圆环爆 位={位} 出生刻={炸刻} 秒={秒} 大小={3} 颜色={白} 加速={1} />
            <电弧 起={[位[0], 位[1], 位[2] + 250]} 终={位} 设定={电弧预设.lightningBolt} 刻={刻 - 炸刻} 寿命刻={5} 色={大雷色} 种子={种子 * 31 + i} />
            {小终.map((终, k) => (
              <电弧 key={k} 起={位} 终={终} 设定={电弧预设.shock} 刻={刻 - 炸刻} 寿命刻={2} 色={小雷色} 种子={种子 * 3001 + i * 20 + k} />
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
};

export default 定义法术演出(元, 三叉戟风暴);
