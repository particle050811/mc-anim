// 绝对零度。出处 revelationfix 2.x：IceSpell（EverChargeSpell）、IceSpear / IceSpike（goety）、FoggyCloudParticleOption。
// 按住时每刻往施法者射一颗冰矛（下界魔杖是 rightStaff → IceSpear，伤害 +6，画法同冰刺，贴图 ice_spike），
// 生在头顶周围 ±48 格的立方体（radius4 = 领域半径 24 × 4 的一半）里，每颗生出来放一片白雾云（MapColor.SNOW，尺寸 1.5）。
// 自己定的：只放 60 刻；领域半径按 12 + 12（下界魔杖）= 24；没有天花板，头顶取 15.5 格；地面以下的生点按「在方块里」重抽竖直。
// 没做：脚下的霜冻法阵（客户端 WandUsingCircle 程序画的，没读）、领域边界的粒子环（IceSpellParticlePacket，没读）、减速和扣血、
// 落地的冰碎屑。看不到的：生位大多离镜头很远，画面里只有靠近施法者的几支。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 落雨们 } from '../零件/甲/落雨画.tsx';
import 元, { 冰矛们 } from './绝对零度.元.ts';
import 冰刺图 from 'asset:贴图/法术/goety/entity/projectiles/ice_spike';

const 绝对零度: React.FC<法术演出属性> = ({ 秒, 起点, 种子 }) => <落雨们 弹们={冰矛们(起点, 种子)} 秒={秒} 图={png(冰刺图)} 雾色={[1, 1, 1]} 种子={种子} />;

export default 定义法术演出(元, 绝对零度);
