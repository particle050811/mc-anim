// 第 4 幕（轰炸）的画面：编排在 场/1-台地/编排-齐放.ts，这里摆镜头和界面（血条；用户 11-10 定不出法术名签和计数）。
// 三镜，按戏剪不按时间拍（用户 11-11「这个画面未必要按时间推进」）：
//   侧：侧面全景，她在左、他在右，她按住不放地连放、往后下方一冲，弹一串串飞过去、结界飞到他身上罩严；
//   第一人称：他的眼睛（原版视角 70 度、右手断曜流光、挨打时原版 bobHurt 的抖），法术一发发朝镜头砸过来，她从画面一侧横着冲到另一侧；
//     索命劈中时晋升之环照原版不死图腾的样子从屏幕中间翻出来（库/界面/物品激活.tsx），身上冒金绿的图腾粒子；
//   挨炸：他侧前方近景，他在结界里挨炸、挥剑，她从他头顶斜着冲下来刹在他跟前上方，卫射照满打死他（幕末，接第 5 幕死亡界面）。
// 镜头照用户 11-10 说的：每个镜头里都有人在做动作，机位跟着动作走，1～3 秒一切。台地上留着仪式结构（祭坛、四角灵魂火），同第 2 幕。
// 机位、第一人称里的手和图腾都是 Agent 摆的，用户没看过。没做：猩红雨、伤害数字、第一人称的物品栏和血条（全片第一人称都没画 HUD，只留 boss 血条）。声音在 段.ts。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { lerp as 混, smoothstep01 as 平滑 } from '@engine/core/数学.ts';
import { 机位样条, type Cam, type 样条关键 } from '@engine/core/机位.ts';
import { png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 定义画面, use段 } from '@engine/段/段画面.tsx';
import { FirstPersonCanvas, FirstPersonHand, handTimeline, viewAngles } from '@库/角色/第一人称.tsx';
import { 物品激活 } from '@库/界面/物品激活.tsx';
import { 娘化亚波伦 } from '../../角色/娘化亚波伦.tsx';
import { 反应史蒂夫 } from '../../角色/反应史蒂夫.tsx';
import { 晋升之环图标 } from '../../角色/史蒂夫掉落.tsx';
import { 战斗界面 } from '../../界面/战斗界面.tsx';
import { 杖尖轮盘 } from '../../界面/杖尖轮盘.tsx';
import { 断曜流光, 断曜流光显示 } from '../../物品/断曜流光.tsx';
import { 默认外观 } from '../../物品/装备外观.ts';
import { 安息仪式演出 } from '../../特效/安息仪式.tsx';
import { 召唤方案们 } from '../../特效/安息仪式时序.ts';
import { 炼狱结界演出 } from '../../特效/炼狱结界演出.tsx';
import { 图腾粒子, 图腾粒子表 } from '../../特效/图腾粒子.tsx';
import { 祭坛 } from '../../场/1-台地/布局.ts';
import { 出手们 } from '../../场/1-台地/出手.tsx';
import { 近镜淡 } from '../../法术/演出/零件/面片.tsx';
import { 取镜头, 台地画布, 画幅, type 镜头 } from '../../场/1-台地/台地场.tsx';
import 线 from '../../场/1-台地/时间线.ts';
import { 每像素格, 盘摆 } from '../../场/1-台地/编排-开盘.ts';
import { 挥剑们, 挨打们, 他钟, 他回世界 } from '../../场/1-台地/齐放拍.ts';
import { 亚波伦位, 出手表, 况, 史蒂夫状态在, 史蒂夫脚, 图腾秒, 幕起, 幕长, 扔, 演, 秒在, 结界设定, 轮盘参, 镜起 } from '../../场/1-台地/编排-齐放.ts';
import 段 from './段.ts';
import 声音 from './声音地址.生成.ts';

const 加 = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const 渐 = (a: readonly number[], b: readonly number[], u: number): V3 => [混(a[0]!, b[0]!, u), 混(a[1]!, b[1]!, u), 混(a[2]!, b[2]!, u)];
const 高 = (z: number): V3 => [0, 0, z];
const S = 史蒂夫脚;
const s界 = 2;
/** 她在幕内第 s 秒的脚底、胸口 */
const 她 = (s: number) => 亚波伦位(秒在(s));
const 胸 = (s: number) => 加(她(s), 高(1.1));
/** 水平单位向量 a → b；侧 = 它往右转 90 度 */
const 向 = (a: readonly number[], b: readonly number[]): V3 => {
  const [x, y] = [b[0]! - a[0]!, b[1]! - a[1]!];
  const 长 = Math.hypot(x, y) || 1;
  return [x / 长, y / 长, 0];
};
const 侧 = (v: V3): V3 => [v[1], -v[0], 0];
/** 绕竖轴转 度（正 = 从上往下看逆时针） */
const 转 = (v: V3, 度: number): V3 => {
  const [c, s] = [Math.cos((度 * Math.PI) / 180), Math.sin((度 * Math.PI) / 180)];
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, 0];
};
const 关 = (s: number, pos: V3, tgt: V3, lens: number): 样条关键 => [s, { pos, tgt, lens }];
const 每 = (起: number, 止: number, n: number) => Array.from({ length: n + 1 }, (_, i) => 起 + ((止 - 起) * i) / n);
/** 跟拍：从 起 到 止 每 步 秒放一个关键机位（她一下冲 0.3～0.55 秒、峰值 24～29 格/秒，关键隔得稀样条就跟不上） */
const 跟 = (起: number, 止: number, 机位: (s: number) => [V3, V3, number], 步 = 0.1): 样条关键[] =>
  每(起, 止, Math.max(1, Math.ceil((止 - 起) / 步 - 1e-9))).map((s) => 关(s, ...机位(s)));
const 镜 = (名: string, 起: number, 关键: readonly 样条关键[]): 镜头 => ({ 名, 起, 机位: (_u, 镜内秒): Cam => 机位样条(关键, 起 + 镜内秒) });

// ── 第一人称：眼睛跟着他（挨打往后让、被结界拽回），视线慢 0.1 秒跟着她（玩家拿鼠标追着她）；原版视角 70 度 ──
/** 原版默认 fov 70（竖直）的焦距，同第 5 幕 */
const 第一人称焦距 = 14.46;
/** 原版 GameRenderer.bobHurt：挨打后 hurtTime 从 10 刻往下走，f = (hurtTime − partialTick) / 10，视角转 14·sin(f⁴π) 度，
 *  转轴按打来的方向（getHurtDir）：打他的都记在她名下、她在他正前方，hurtDir ≈ 90 度，这时整个是往下点头（不是侧倾）。damageTiltStrength 取默认 1 */
const 点头度 = (幕内秒: number): number => {
  const s = 他钟(幕内秒);
  const h = 挨打们.filter((x) => x.秒 <= s).pop();
  if (!h) return 0;
  const 刻 = (s - h.秒) * 20;
  if (刻 >= 10) return 0;
  const f = (10 - 刻) / 10;
  return 14 * Math.sin(f ** 4 * Math.PI);
};
const 第一人称眼 = (幕内秒: number) => 加(史蒂夫状态在(秒在(幕内秒)).位置, 高(1.62));
const 第一人称看 = (幕内秒: number) => 加(她(他回世界(他钟(幕内秒)) - 0.1), 高(1.3));
/** 视线往下压 度（绕镜头的右轴） */
const 压低 = (眼: V3, 看: V3, 度: number): V3 => {
  const d = [看[0] - 眼[0], 看[1] - 眼[1], 看[2] - 眼[2]];
  const 平 = Math.hypot(d[0]!, d[1]!);
  const 仰 = Math.atan2(d[2]!, 平) - (度 * Math.PI) / 180;
  const 长 = Math.hypot(平, d[2]!);
  return [眼[0] + (d[0]! / 平) * Math.cos(仰) * 长, 眼[1] + (d[1]! / 平) * Math.cos(仰) * 长, 眼[2] + Math.sin(仰) * 长];
};
const 第一人称机位 = (幕内秒: number): Cam => {
  const 眼 = 第一人称眼(幕内秒);
  return { pos: 眼, tgt: 压低(眼, 第一人称看(幕内秒), 点头度(幕内秒)), lens: 第一人称焦距 };
};
/** 右手：断曜流光照原版 ItemInHandRenderer 挥、挥完按攻击冷却升回来（剑攻速 1.6：12.5 刻）。挥剑的刻照他的局部钟（索命那 16 帧定住） */
const 手剧本 = { start: '剑', swings: 挥剑们.map((c) => Math.round(c * 20)), cooldown: 12.5 } as const;
/** 晋升之环的屏幕动画往哪一角飞（原版 random.nextFloat() × 2 − 1，这里取定）：右上 */
const 环偏 = [0.55, -0.7] as const;
const 环层 = [{ tex: png(晋升之环图标) }];

/** 镜头表（幕内秒） */
const 镜头表: readonly 镜头[] = [
  // 侧：机位在两人连线的右侧（她在画面左、他在右）、离连线中点 14 格，镜头跟着两人中点慢慢往他那边推、略往下压
  镜('侧', 镜起.侧, 跟(镜起.侧, 镜起.第一人称, (s) => {
    const u = 平滑(s / 镜起.第一人称);
    const 中 = 渐(她(s), S, 混(0.48, 0.56, u));
    const 右 = 向(她(0), S);
    return [加(加(加(中, 侧(右), 混(14, 12.5, u)), 右, 混(-1, 1, u)), 高(混(-1.2, -0.4, u))), 加(中, 高(混(0.4, 0, u))), 20];
  }, 0.25)),
  { 名: '第一人称', 起: 镜起.第一人称, 机位: (_u, 镜内秒) => 第一人称机位(镜起.第一人称 + 镜内秒) },
  // 挨炸：他侧前方（按幕末她在的方向往左转 55 度）、离他 6.5 格往 5.2 格推，略仰；她从画面右上冲进来、刹在他跟前上方，人、结界、打到身上的都在画面里
  镜('挨炸', 镜起.挨炸, [
    关(镜起.挨炸, 加(加(S, 转(向(S, 她(幕长)), 55), 6.5), 高(1.1)), 加(加(S, 向(S, 她(幕长)), 1.2), 高(2.2)), 22),
    关(幕长, 加(加(S, 转(向(S, 她(幕长)), 50), 5.2), 高(0.9)), 加(加(S, 向(S, 她(幕长)), 1.6), 高(2.6)), 22),
  ]),
];

const 图腾表 = 图腾粒子表(S, 1, { 地面: S[2] });

const 第一人称手: React.FC<{ 幕内秒: number }> = ({ 幕内秒 }) => {
  const 手 = handTimeline(他钟(幕内秒) * 20, 手剧本);
  const 眼 = 第一人称眼(幕内秒);
  return (
    <FirstPersonCanvas width={画幅.宽} height={画幅.高} view={viewAngles(眼, 第一人称看(幕内秒))}>
      {/* bobHurt 手那一遍也套：绕视图的 x 轴转（往下点头） */}
      <group rotation={[(点头度(幕内秒) * Math.PI) / 180, 0, 0]}>
        <FirstPersonHand held={<断曜流光 光泽秒={幕内秒} />} display={断曜流光显示[默认外观].firstperson_righthand} swing={手.swing} equip={手.equip} />
      </group>
    </FirstPersonCanvas>
  );
};

export default 定义画面(段, 声音, () => {
  const { 秒, 段: 本段 } = use段(段);
  const t = 幕起 + 秒;
  const 她此刻 = 演.在(t);
  const { 镜, 机位 } = 取镜头(镜头表, 秒, 本段.秒);
  const 第一人称 = 镜.名 === '第一人称';
  return (
    <台地画布
      仪式结构
      机位={机位}
      界面={
        <>
          {第一人称 && (
            <AbsoluteFill>
              <第一人称手 幕内秒={秒} />
              <物品激活 宽={画幅.宽} 高={画幅.高} s={s界} 秒={t - 图腾秒} 偏={环偏} 物品={环层} />
            </AbsoluteFill>
          )}
          <战斗界面 宽={画幅.宽} 高={画幅.高} s={s界} 血条={{ 血比: 1 }} />
        </>
      }
    >
      <近镜淡.Provider value={第一人称 ? [1.5, 3.5] : [1, 3]}>
        {/* 仪式做完后留在台地上的结构和四角灵魂火，同第 2 幕 */}
        <group position={祭坛}>
          <安息仪式演出 秒={线.事件.开盘完.秒 - 线.事件.放环.秒 + 秒} 方案={召唤方案们.短} />
        </group>
        <娘化亚波伦 {...她此刻.属性} 持杖 />
        <杖尖轮盘 杖={演.杖(t)} {...盘摆} 参={轮盘参(t)} 每像素格={每像素格} />
        <炼狱结界演出 秒={t - 扔} 设定={结界设定} />
        <出手们 表={出手表} 秒={t} 况={况} />
        <图腾粒子 表={图腾表} 秒={t - 图腾秒} />
        {/* 第一人称镜头就在他眼睛里，不画他自己 */}
        {!第一人称 && <反应史蒂夫 状态={史蒂夫状态在(t)} />}
      </近镜淡.Provider>
    </台地画布>
  );
});
