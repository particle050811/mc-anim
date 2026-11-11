// 冰风暴。出处 goety 2.5.60.6：IceStormSpell、IceStorm（SpellHurtingProjectile）、IceStormRenderer（照原版末影水晶的画法：三层套着转的方块）；原版 SnowflakeParticle。
// - 弹：size 从 0 起每刻 + 0.05。PoseStack：scale((1 + size ÷ 8) × 2) · YP(年龄 × 3°) · translate(0, 0.25, 0) · 绕 (sin45°, 0, sin45°) 转 60° → 外壳 alpha 0.25；
//   scale(0.875) · 再绕那根轴转 60° · YP(年龄 × 3°) → 外壳 alpha 0.5；scale(0.875) · 转 60° · YP(年龄 × 3°) → 芯 alpha 0.75。itemEntityTranslucentCull，贴图 ice_storm（64×32）。
//   外壳、芯都是 8×8×8 的方盒（贴图 (0,0) 和 (32,0)），渲染器里内联建的模型，这里手写。
// - 每刻三圈雪花（高 −0.5 + size ÷ 4、半径 size ÷ 4 + 0.5；高 1 + size ÷ 4、同半径；高 0.5 + size ÷ 4、半径 size ÷ 2 + 1），外加一颗跟在后面的雪花。
// 没核：每圈每刻几颗（ServerParticleUtil.addAuraParticles 没读，这里每圈 4 颗、角度随机）。没做：卷到人的冻结效果。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置 } from '../零件/弹道.ts';
import { MC空间, 度, 模型件, type EntityModelData } from '../零件/实体.tsx';
import { 贴图粒子, type 粒子出生 } from '../零件/粒子.tsx';
import { 各刻 } from '../零件/甲/共用.ts';
import { 雪花, 雪花类 } from '../零件/甲/原版粒子.ts';
import 元, { 冰风暴终刻, 冰风暴道 } from './ice_storm.元.ts';
import 冰图 from 'asset:贴图/法术/goety/entity/projectiles/ice_storm';

const 方盒 = (名: string, u: number): EntityModelData => ({
  texSize: [64, 32],
  root: { name: 'root', pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [], children: [{ name: 名, pose: { offset: [0, 0, 0], rot: [0, 0, 0] }, cubes: [{ uv: [u, 0], from: [-4, -4, -4], size: [8, 8, 8], grow: [0, 0, 0], mirror: false }], children: [] }] },
});
const 外壳 = 方盒('glass', 0);
const 芯 = 方盒('cube', 32);
const 斜转 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2), Math.PI / 3);

const 冰风暴: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子, 选项 }) => {
  const 刻 = 秒 * 20;
  const 道 = 冰风暴道(起点, 目标, 选项?.高速);
  const 终 = 冰风暴终刻(起点, 目标, 选项?.高速);
  const r = rng(种子 * 29 + 7);
  const 雪: 粒子出生[] = 各刻(1, Math.min(刻, 终)).flatMap((n) => {
    const [p, size] = [道(n), n * 0.05];
    const 圈 = (高: number, 半径: number) =>
      Array.from({ length: 4 }, () => {
        const 角 = r() * Math.PI * 2;
        return 雪花(r, n, [p[0] + Math.cos(角) * 半径, p[1] + Math.sin(角) * 半径, p[2] + 高]);
      });
    return [...圈(-0.5 + size / 4, size / 4 + 0.5), ...圈(1 + size / 4, size / 4 + 0.5), ...圈(0.5 + size / 4, size / 2 + 1), 雪花(r, n, p)];
  });
  const s = (1 + (刻 * 0.05) / 8) * 2;
  const 自转: [number, number, number] = [0, 度(刻 * 3), 0];
  const 图 = png(冰图);
  return (
    <>
      {刻 < 终 && (
        <MC空间 位={弹道位置(道, 刻)}>
          <group scale={[s, s, s]} rotation={自转}>
            <group position={[0, 0.25, 0]} quaternion={斜转}>
              <模型件 模型={外壳} 图={图} 画法="半透明" 透明度={0.25} />
              <group scale={[0.875, 0.875, 0.875]} quaternion={斜转}>
                <group rotation={自转}>
                  <模型件 模型={外壳} 图={图} 画法="半透明" 透明度={0.5} />
                  <group scale={[0.875, 0.875, 0.875]} quaternion={斜转}>
                    <group rotation={自转}>
                      <模型件 模型={芯} 图={图} 画法="半透明" 透明度={0.75} />
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </MC空间>
      )}
      <贴图粒子 类={{ ...雪花类, 地面: 目标[2] }} 出生们={雪} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 冰风暴);
