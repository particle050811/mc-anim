// 毒镖。出处 goety 2.5.60.6：PoisonDartSpell、PoisonQuill（Arrow）、PoisonQuillRenderer、PoisonQuillModel、TrailParticle。
// - 弹：PoisonQuillModel（一根 1×14×1 的杆加两片交叉的羽），PoseStack YP(yaw − 90) · ZP(pitch + 90)，entityTranslucent，贴图 poison_quill。
// - 尾迹：每刻 4 颗 trail 粒子，出生在 位置 + 速度 + 各轴高斯 ÷ 2（竖直再 + 0.5），色 0xEFEC8B；TrailParticle 不动、寿命 10 刻、透明度 1 − 年龄 ÷ 寿命。
// 没做：命中后中毒的药水粒子。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减, 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 贴图粒子, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import { 各刻, 十六色, 箭角, 高斯 } from '../零件/甲/共用.ts';
import 元, { 毒镖道 } from './poison_dart.元.ts';
import 模型数据 from 'asset:模型/法术/goety/PoisonQuillModel';
import 镖图 from 'asset:贴图/法术/goety/entity/projectiles/poison_quill';
import 尾粒图 from 'asset:贴图/法术/goety/particle/trail';

const 模型 = 取模型(模型数据, 'PoisonQuillModel');
export const 尾粒类: 粒子类 = { 帧: [png(尾粒图)], 选帧: '按年龄', 摩擦: 0.96, 混合: '半透明', 透明度: (年龄, 寿命) => 1 - Math.floor(年龄) / 寿命 };

const 毒镖: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 道, 到刻 } = 毒镖道(起点, 目标);
  const r = rng(种子 * 5 + 2);
  const 色 = 十六色(0xefec8b);
  const 尾: 粒子出生[] = 各刻(1, Math.min(刻, 到刻)).flatMap((n) => {
    const [位, 速] = [道(n), 减(道(n + 1), 道(n))];
    return Array.from({ length: 4 }, () => ({ 刻: n, 位: [位[0] + 速[0] + 高斯(r) / 2, 位[1] + 速[1] + 高斯(r) / 2, 位[2] + 速[2] + 0.5 + 高斯(r) / 2] as const, 寿命: 10, 半径: 0.1 * (r() * 0.5 + 0.5) * 2 * 0.75, 色 }));
  });
  const { yaw, pitch } = 箭角(弹道方向(道, 刻));
  return (
    <>
      {刻 < 到刻 && (
        <MC空间 位={弹道位置(道, 刻)}>
          <group rotation={[0, 度(yaw - 90), 0]}>
            <group rotation={[0, 0, 度(pitch + 90)]}>
              <模型件 模型={模型} 图={png(镖图)} 画法="半透明" />
            </group>
          </group>
        </MC空间>
      )}
      <贴图粒子 类={尾粒类} 出生们={尾} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 毒镖);
