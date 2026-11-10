// 电涌。出处 goety 2.5.60.6：SurgingSpell（蓄力类，每 6 刻一颗）、SurgingOrb（SpellHurtingProjectile）、SurgingOrbRenderer、TrailEffect、SLightningPacket。
// - 配下界魔杖：setOrange(true)，贴图换 scatter_bolt_orange，尾迹和命中的颜色换金色（ChatFormatting.GOLD 0xFFAA00）。
// - 弹：朝镜头的方片，边长 0.25 + f1，f1 = (sin(年龄 ÷ 5) × 0.2 + 0.2) × clientScale（每刻 + 0.2 封顶 1），中心抬半个实体高；贴图横排 16 帧每刻一帧；entityTranslucent。
// - 三条尾迹：TrailEffect(宽 0.05, 长 1.75)，绕飞行轴半径 0.15、相位 年龄 ÷ 4 再各差 120°，pointed_trail 贴图、镂空、金色。
// - 命中：球爆（金色，尺寸 0.5，速 1）+ 8 道电弧（从命中点到各轴 ±1 格内的随机点，寿命 8 刻）。
// 自己定的：游戏里按住多久放多久，片里一次演 3 颗。没核：方片顶点是不是 ±0.5（照 ElectroOrbRenderer 的写法当成是）；电弧用的是 shock 那套参数（粗 0.04）。
// 没做：追踪转向（tickCount > 2 起方向往目标转，turnRate 0.2 ÷ 惯性）——目标不动，直线就是它。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 加, 乘, 单位, 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { 电弧 } from '../零件/电弧.tsx';
import { 电弧预设 } from '../零件/电弧形.ts';
import { 面片 } from '../零件/面片.tsx';
import { 球爆 } from '../零件/甲/爆.tsx';
import { 十六色, 道上 } from '../零件/甲/共用.ts';
import { 尾迹 } from '../零件/甲/尾迹.tsx';
import 元, { 电涌弹 } from './surging.元.ts';
import 球图 from 'asset:贴图/法术/goety/entity/projectiles/scatter_bolt_orange';
import 尾迹图 from 'asset:贴图/法术/goety/entity/projectiles/pointed_trail';

const 金 = 十六色(0xffaa00);
const 半高 = 0.15;

const 电涌: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  return (
    <>
      {电涌弹(起点, 目标).map((弹, i) => {
        const t = 刻 - 弹.出刻;
        if (t < 0) return null;
        if (t >= 弹.飞刻) {
          const 位 = 加(道上(弹.道, 弹.飞刻), [0, 0, 半高]);
          const r = rng(种子 * 19 + i);
          return (
            <React.Fragment key={i}>
              <球爆 位={位} 刻={t - 弹.飞刻} 色={金} 尺寸={0.5} 速={1} />
              {Array.from({ length: 8 }, (_, k) => (
                <电弧 key={k} 起={位} 终={[位[0] + r() * 2 - 1, 位[1] + r() * 2 - 1, 位[2] + r() * 2 - 1]} 设定={电弧预设.shock} 刻={t - 弹.飞刻} 寿命刻={8} 色={金} 透明度={0.8} 种子={种子 * 23 + i * 8 + k} />
              ))}
            </React.Fragment>
          );
        }
        const p = 弹道位置(弹.道, t);
        const 向 = 弹道方向(弹.道, t);
        // 和飞行方向垂直的两个轴
        const 甲: 点 = 单位([-向[1], 向[0], 0]);
        const 乙: 点 = [向[1] * 甲[2] - 向[2] * 甲[1], 向[2] * 甲[0] - 向[0] * 甲[2], 向[0] * 甲[1] - 向[1] * 甲[0]];
        const 螺 = (刻前: number, 相: number): 点 => {
          const 年龄 = Math.max(0, t - 刻前);
          const 角 = 年龄 / 4 + 相;
          return 加(加(弹道位置(弹.道, 年龄), [0, 0, 半高]), 加(乘(甲, Math.cos(角) * 0.15), 乘(乙, Math.sin(角) * 0.15)));
        };
        const 边 = 0.25 + (Math.sin(t / 5) * 0.2 + 0.2) * Math.min(1, t * 0.2);
        const u = (Math.floor(t) % 16) / 16;
        return (
          <React.Fragment key={i}>
            {[0, 1, 2].map((k) => (
              <尾迹 key={k} 点们={Array.from({ length: Math.min(12, Math.floor(t) + 1) }, (_, j) => 螺(j * 0.5, (k * 2 * Math.PI) / 3))} 宽={0.05} 长={1.75} 图={png(尾迹图)} 色={金} 实心 混合="镂空" />
            ))}
            <面片 图={png(球图)} 位={[p[0], p[1], p[2] + 半高]} 半宽={边 / 2} uv={[u, 0, u + 1 / 16, 1]} 混合="半透明" />
          </React.Fragment>
        );
      })}
    </>
  );
};

export default 定义法术演出(元, 电涌);
