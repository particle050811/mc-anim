// 箱子：全片共用的一个箱子（用户 10-20：「所有应该都用同一个箱子」）。古城的战利品箱、暮色 boss 的木箱、基地的箱子都是它，只换贴图；开盖、已开贴图、开关箱声都在这里，各段只给「几秒开、几秒关」。
// 形状照 1.20.1 ChestRenderer.createSingleBodyLayer（贴图 64×64）：箱体 texOffs(0,19) 14×10×14；箱盖 texOffs(0,0) 14×5×14 和锁扣 2×4×1 挂在箱体顶面后边（高 9 像素）的铰链上一起转。
// 开盖照 ChestLidController（Lootr、暮色箱子都沿用）：openness 每刻 ±0.1（开满、关上各 0.5 秒），ChestRenderer.render 换成 1 − (1 − o)³ 再乘 90° 往上翻。
// 贴图（导出模型.py 从 jar 取）：原版 entity/chest/normal.png（npm run 取材 -- 箱子）；Lootr 0.7.35.94 旧贴图（客户端配置 old_textures=true）old_chest.png 金边绿宝石，开过换 old_chest_opened.png 浅冰蓝边、紫角（npm run 取材 -- 战利品箱）；
//   暮色森林 4.3.2508 boss 死后装掉落物的木箱（`IBossLootBuffer.depositDropsIntoChest`，`TFChestBlock` 是原版箱子子类，只换贴图，npm run 取材 -- 暮色箱子）：巫妖、娜迦暮色橡木或林冠木随机，九头蛇、米诺菇红树木，雪怪首领林冠木，冰雪女王暮色橡木，暮初恶魂暗木。
// 已开贴图（用户 10-20：「这边打开箱子以后 箱子应该变白」）：盖子开始抬那一刻起画已开贴图，关上不换回，之后所有镜头都是开过的样子，不管谁开的、镜头站在谁那边
//   （`ChestUtil.handleLootChest` 先把人记进 openers 再开界面，所以盖子一翻就换；游戏里只给开过的玩家画已开贴图，`LootrChestBlockRenderer.getMaterial`，片子按世界状态画）。古城哪只在哪一段开过见 镜头/古城4x布局/箱子.ts。
// 单位：格，原点在底面中心，正面（锁扣）朝 -Y（南）。场景里要和方块网格一样亮的给 自发光 0.4（同 lib/光照配比.ts 的打底）。
import React from 'react';
import type { V3 } from '../../engine/model/parts.tsx';
import { Png, png, pngDir } from '../../engine/model/贴图.ts';
import { TexBox } from '../../engine/model/贴图方盒.tsx';
import vanillaPng from 'asset:贴图/物品/箱子';
import lootrPng from 'asset:贴图/物品/战利品箱';
import lootrOpenedPng from 'asset:贴图/物品/战利品箱-已开';
import { 资产目录 } from '../../engine/core/资产目录.ts';
import 资_0 from 'asset:贴图/物品/暮色箱子/暗木';
import 资_1 from 'asset:贴图/物品/暮色箱子/暮色橡木';
import 资_2 from 'asset:贴图/物品/暮色箱子/林冠木';
import 资_3 from 'asset:贴图/物品/暮色箱子/红树木';

export const VANILLA_CHEST_TEX = png(vanillaPng);
export const LOOTR_TEX = png(lootrPng);
export const LOOTR_OPENED_TEX = png(lootrOpenedPng);
const TF = pngDir(资产目录({ './暗木.png': 资_0, './暮色橡木.png': 资_1, './林冠木.png': 资_2, './红树木.png': 资_3 }));
export type TwilightChestWood = '暮色橡木' | '林冠木' | '红树木' | '暗木';
export const TWILIGHT_CHEST_TEX: Record<TwilightChestWood, Png> = { 暮色橡木: TF.暮色橡木, 林冠木: TF.林冠木, 红树木: TF.红树木, 暗木: TF.暗木 };
export const lootrTex = (开过: boolean) => (开过 ? LOOTR_OPENED_TEX : LOOTR_TEX);

const PX = 1 / 16;
export const CHEST = {
  openPerTick: 0.1, // openness 每刻变化
  开满盖沿高: 23 * PX, // 盖子开满竖起来的上沿：铰链高 9 像素 + 盖长 14 像素
};

// ---------- 开盖 ----------
// 按「开始开盖的秒数、开始关盖的秒数」算 openness（0~1）：每刻 ±0.1（每秒 ±2），夹在 0~1。关盖秒不给就是一直开着；关盖时还没开满，从当时的开度往回关
export const chestOpenness = (sec: number, openSec: number, closeSec = Infinity) => {
  const rate = CHEST.openPerTick * 20;
  if (sec <= openSec) return 0;
  if (sec <= closeSec) return Math.min(1, (sec - openSec) * rate);
  const top = Math.min(1, Math.max(0, (closeSec - openSec) * rate));
  return Math.max(0, top - (sec - closeSec) * rate);
};
// 盖子转过的角度（弧度，往上翻为正）：(1 − (1 − o)³) × 90°
export const chestLidAngle = (openness: number) => (1 - (1 - Math.min(1, Math.max(0, openness))) ** 3) * (Math.PI / 2);

// 一段里开关一只箱子，都按这一段自己的钟（秒）：开 = 右键开箱、盖子开始抬；关 = 关界面、盖子开始合，不给 = 一直开着；秒 = 这一帧
export type 开关 = { 开: number; 关?: number; 秒: number };
// 这一帧的开度和开过没有：开过从盖子开始抬（秒 > 开）起算，关上也不换回
export const chestState = ({ 开, 关, 秒 }: 开关) => ({ 开度: chestOpenness(秒, 开, 关), 开过: 秒 > 开 });

// 开关箱声：原版 ChestBlockEntity.playSound（Lootr 沿用）block.chest.open / close，volume 0.5、pitch 0.9 + r × 0.1，在开关那一刻、箱子中心响。
// rand 先取音高、再取挑文件（各段的随机数串照这个顺序排过，不能换）
export const chestSound = (动作: '开' | '关', rand: () => number) => ({
  事件: 动作 === '开' ? 'block.chest.open' : 'block.chest.close',
  音量: 0.5,
  音高: 0.9 + rand() * 0.1,
  选: rand(),
});

// ---------- 模型 ----------
export type 箱子朝向 = 'north' | 'south' | 'east' | 'west';
// 正面朝 -Y（南）转到 朝向 那边
const FACING_Z: Record<箱子朝向, number> = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };

// 箱子的展开图是上下颠倒的：箱子模型直接画在 Y 朝上的方块空间里，不像生物模型先上下翻转，且带锁扣的正面在模型 +Z 侧（展开图第 4 格）。所以把 TexBox 绕 X 轴转 180°。
const Part: React.FC<{ tex: Png; px: [number, number, number]; uv: [number, number]; c: V3; emissive: number }> = ({ tex, px, uv, c: center, emissive }) => (
  <group position={center} rotation={[Math.PI, 0, 0]}>
    <TexBox tex={tex} px={px} uv={uv} s={[px[0] * PX, px[2] * PX, px[1] * PX]} emissive={emissive} />
  </group>
);

// 贴图：不给 = Lootr 没开过的；开度：0~1（chestState / chestOpenness 算）；p：底面中心；朝向：锁扣朝哪边
export const Chest: React.FC<{ 贴图?: Png; 开度?: number; p?: V3; 朝向?: 箱子朝向; 自发光?: number }> = ({ 贴图: tex = LOOTR_TEX, 开度: openness = 0, p, 朝向: facing = 'south', 自发光: emissive = 0 }) => (
  <group position={p} rotation={[0, 0, FACING_Z[facing]]}>
    {/* 箱体：高 0..10 像素 */}
    <Part tex={tex} px={[14, 10, 14]} uv={[0, 19]} c={[0, 0, 5 * PX]} emissive={emissive} />
    {/* 铰链：箱体后面（+Y 7 像素）、高 9 像素；往上翻 = 绕 X 转负角，正面那条边往上抬 */}
    <group position={[0, 7 * PX, 9 * PX]} rotation={[-chestLidAngle(openness), 0, 0]}>
      {/* 箱盖：高 9..14 像素（和箱体重叠 1 像素，原版如此） */}
      <Part tex={tex} px={[14, 5, 14]} uv={[0, 0]} c={[0, -7 * PX, 2.5 * PX]} emissive={emissive} />
      {/* 锁扣：高 7..11 像素，贴在正面外 1 像素 */}
      <Part tex={tex} px={[2, 4, 1]} uv={[0, 0]} c={[0, -14.5 * PX, 0]} emissive={emissive} />
    </group>
  </group>
);
