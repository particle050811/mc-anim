// 牙之。出处 goety 2.5.60.6：TeethSpell、ViciousTooth、ViciousToothRenderer、ViciousToothModel、ViciousPike、ViciousPikeRenderer、ViciousPikeModel、MinisterAnimations.SPIKE、FastFallDust。
// - 默认法杖：目标那格正上方 8 格出一颗大牙（上面有东西挡就低一些），悬停 60 刻（困难 40）后每刻加速 0.25 格/刻落下。
// - 大牙渲染器：mulPose(Y 90° − yRot)，scale(−f, −f, f)（头 20 刻 f = 悬停刻 ÷ 20），translate(0, −2.1, 0)；模型默认的 entityCutoutNoCull。
//   setupAnim：头 20 刻每画一帧 base.yRot += partialTick × 0.5（转速跟帧率走，这里按每刻 0.75 弧度算，60 帧时大致是这个数）。
// - 悬停时每刻 circularParticles(FAST_DUST 凝灰岩, 半径 0.25) = 1 颗：FastFallDust，白色（凝灰岩没有染色），generic 7 → 0 按年龄，
//   半边长 0.1 × (0.5～1) × 0.675，寿命 0.9 × 32 ÷ (随机 × 0.8 + 0.2) 刻，出生不带速度、每刻往下加速 0.01 到 0.14 封顶，落地停。
// - 落地或砸到人（onHit）：256 颗凝灰岩碎屑（散布半个碰撞箱，speed 1）；前后左右四个邻格各一根尖桩（位置是格子的整数角，不是格子中心，贴地抬 0.0625）。
// - 尖桩渲染器：scale(−2.25, −2.25, 2.25)（进度过 0.9 缩没），translate(0, −0.73, 0)，scale(0.5)；动作是关键帧 SPIKE（0.625 秒，线性）：
//   base、bone、bone2、bone3 分别从缩进 12、10、10、8 像素处在 0.125 秒里顶出来，停到 0.4167 秒，再在 0.625 秒缩回去；之后停在缩回的样子到第 22 刻消失。
// 没做 / 粗做：大牙碰撞箱的高度没查，按牙尖到史蒂夫头顶算命中；尖桩把人顶起一格（那是史蒂夫的事）。配灾厄法杖的 16 颗乱落不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 面片们, type 面片项 } from '../零件/面片.tsx';
import { 屑撒, 方块屑 } from '../零件/方块屑.tsx';
import 元, { 大牙命中刻, 大牙悬停刻, 大牙高, 尖桩寿命刻 } from './牙之.元.ts';
import 牙模型数据 from 'asset:模型/法术/goety/ViciousToothModel';
import 桩模型数据 from 'asset:模型/法术/goety/ViciousPikeModel';
import 牙图 from 'asset:贴图/法术/goety/entity/projectiles/vicious_tooth';
import 桩图 from 'asset:贴图/法术/goety/entity/projectiles/vicious_pike';
import 凝灰岩图 from 'asset:贴图/法术/minecraft/block/tuff';
import 尘0 from 'asset:贴图/特效/粒子/generic_0';
import 尘1 from 'asset:贴图/特效/粒子/generic_1';
import 尘2 from 'asset:贴图/特效/粒子/generic_2';
import 尘3 from 'asset:贴图/特效/粒子/generic_3';
import 尘4 from 'asset:贴图/特效/粒子/generic_4';
import 尘5 from 'asset:贴图/特效/粒子/generic_5';
import 尘6 from 'asset:贴图/特效/粒子/generic_6';
import 尘7 from 'asset:贴图/特效/粒子/generic_7';

const 牙模型 = 取模型(牙模型数据, 'ViciousToothModel');
const 桩模型 = 取模型(桩模型数据, 'ViciousPikeModel');
const 尘帧 = [尘7, 尘6, 尘5, 尘4, 尘3, 尘2, 尘1, 尘0].map(png);
const 凝灰岩 = png(凝灰岩图);

const 大牙: React.FC<{ 位: 点; 刻: number }> = ({ 位, 刻 }) => {
  const f = Math.min(1, Math.floor(刻) / 20);
  if (f <= 0) return null;
  const 姿态 = 刻 < 20 ? { base: { rot: [0, 刻 * 0.75, 0] } } : undefined;
  return (
    <MC空间 位={位}>
      <group rotation={[0, 度(90), 0]}>
        <group scale={[-f, -f, f]}>
          <group position={[0, -2.1, 0]}>
            <模型件 模型={牙模型} 图={png(牙图)} 姿态={姿态} />
          </group>
        </group>
      </group>
    </MC空间>
  );
};

// SPIKE 的四个通道都是同一条时间线，只差缩进多少像素
const 桩缩 = (秒: number) => (秒 <= 0.125 ? 1 - 秒 / 0.125 : 秒 <= 0.4167667 ? 0 : Math.min(1, (秒 - 0.4167667) / (0.625 - 0.4167667)));
const 尖桩: React.FC<{ 位: 点; 刻: number }> = ({ 位, 刻 }) => {
  if (刻 < 0 || 刻 >= 尖桩寿命刻) return null;
  const 进 = 1 - (尖桩寿命刻 - 刻) / 20;
  const f1 = 2.25 * (进 > 0.9 ? Math.max(0, (1 - 进) / 0.1) : 1);
  if (f1 <= 0) return null;
  const 缩 = 桩缩(刻 / 20);
  // posVec(0, −n, 0) 加到部件上是 y + n（模型 y 朝下：缩回地里）
  const 姿态 = { base: { offset: [0, 12 * 缩, 0] }, bone: { offset: [0, -12 + 10 * 缩, 0] }, bone2: { offset: [0, -10 + 10 * 缩, 0] }, bone3: { offset: [0, -10 + 8 * 缩, 0] } };
  return (
    <MC空间 位={位}>
      <group rotation={[0, 度(90), 0]}>
        <group scale={[-f1, -f1, f1]}>
          <group position={[0, -0.73, 0]}>
            <group scale={[0.5, 0.5, 0.5]}>
              <模型件 模型={桩模型} 图={png(桩图)} 姿态={姿态} />
            </group>
          </group>
        </group>
      </group>
    </MC空间>
  );
};

/** 悬停时往下掉的灰尘：每刻一颗 */
const 落尘 = (牙位: 点, 地: number, 刻: number, 种子: number): Map<number, 面片项[]> => {
  const 按帧 = new Map<number, 面片项[]>();
  for (let t = 0; t <= Math.min(Math.floor(刻), 大牙悬停刻); t++) {
    const r = rng(种子 * 613 + t);
    const [角, 距] = [r() * Math.PI * 2, Math.sqrt(r()) * 0.25];
    const 寿命 = Math.max(1, Math.floor(Math.floor(32 / (r() * 0.8 + 0.2)) * 0.9));
    const 年龄 = 刻 - t;
    if (年龄 >= 寿命) continue;
    const 半 = 0.1 * (r() * 0.5 + 0.5) * 0.675;
    const [转速, 转0] = [(r() - 0.5) * 0.1, r() * Math.PI * 2];
    // 第 j 刻移动用的速度是 −min(0.14, 0.01 × j)
    let 落 = 0;
    for (let j = 0; j < Math.floor(年龄); j++) 落 += Math.min(0.14, 0.01 * j);
    落 += Math.min(0.14, 0.01 * Math.floor(年龄)) * (年龄 % 1);
    const z = Math.max(地, 牙位[2] - 落);
    const 帧 = Math.min(7, Math.floor((年龄 * 8) / 寿命));
    if (!按帧.has(帧)) 按帧.set(帧, []);
    按帧.get(帧)!.push({ 位: [牙位[0] + Math.cos(角) * 距, 牙位[1] + Math.sin(角) * 距, z], 半宽: 半 * Math.min(1, (年龄 / 寿命) * 32), 转角: z > 地 ? 转0 + Math.PI * 转速 * 2 * 年龄 : 0 });
  }
  return 按帧;
};

const 牙之: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 牙位: 点 = [目标[0], 目标[1], 目标[2] + 大牙高(Math.min(刻, 大牙命中刻))];
  const 尘 = 落尘([目标[0], 目标[1], 目标[2] + 大牙高(0)], 目标[2], 刻, 种子);
  // 命中时牙还在史蒂夫头顶；碎屑从牙身中间（碰撞箱按 1 × 1.5 估）炸开
  const 砸位: 点 = [目标[0], 目标[1], 目标[2] + 大牙高(大牙命中刻) + 0.75];
  // 尖桩在邻格的整数角上：格子中心往西北退半格（游戏的 −x、−z）再加方向
  const 桩位 = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]): 点 => [目标[0] - 0.5 + dx, 目标[1] + 0.5 + dy, 目标[2] + 0.0625]);
  return (
    <>
      {刻 < 大牙命中刻 && <大牙 位={牙位} 刻={刻} />}
      {尘帧.map((图, i) => (
        <面片们 key={i} 图={图} 项={尘.get(i) ?? []} 混合="镂空" />
      ))}
      <方块屑 出生们={屑撒(砸位, 256, [0.5, 0.5, 0.75], 1, 大牙命中刻, 种子 * 17)} 秒={秒} 图={凝灰岩} 地面={目标[2]} />
      {桩位.map((位, i) => (
        <尖桩 key={i} 位={位} 刻={刻 - 大牙命中刻 - 1} />
      ))}
    </>
  );
};

export default 定义法术演出(元, 牙之);
