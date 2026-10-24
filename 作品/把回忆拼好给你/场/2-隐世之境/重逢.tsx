// 第 15 句隐世之境这一场会动的画面（49.54–52.94），按歌曲帧画，一帧一个整页（1280×720）：
// - 推门（风散开到对视之前）：镜头在屋里她身前回看西门，她背对着门、看着窗外，门被你推开，门外的光从她背后灌进屋，头上挂着「( •́ _ •̀)」；
// - 对视以后：你的视角，49.96 那一帧就是封面帧（对视.tsx 同一套：机位、她、门光、气泡），之后蹲下（原版潜行眼高）、
//   手里换上蛋糕从画面下沿升上来、右键、驯服（爱心、蛋糕被吃掉），哭脸气泡「啵」地换成台词，最后两拍推向她的脸。
// 三渲二透视（平涂、不抗锯齿、角色描边）、归隐之地的调子、门光色调，外面整片后期；叠层（聊天栏、樱花风）由段传进来，放在整片后期里面。
// 手画在另一张三渲二画布上（原版手那一遍：竖直视角固定 70、不跟视角设置和推镜走），同样平涂、描边。
import type React from 'react';
import { ItemSprite } from '@engine/model/物品贴图.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { clamp01, rad } from '@engine/anim/anim.ts';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { HAND_FOV, HAND_NEAR, FirstPersonHand, handTimeline, type HandScript } from '@库/角色/第一人称.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { SteveFirstPersonArm } from '@库/角色/史蒂夫第一人称.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { magicalWineFoxBlinkAt } from '@库/角色/魔法酒狐动作.ts';
import { MagicalWineFoxEx, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 女仆气泡, 气泡像素格 } from '@库/界面/女仆气泡.tsx';
import { 成片倍数 } from '@库/界面/像素字表.ts';
import { 做透视相机, 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import { CAKE } from '@库/物品/蛋糕.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { fps, 画幅, 正片事件 } from '../../分镜.ts';
import { 画布调子, 描边 as 描边默认 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 隐世之境一楼开门, 开着的门洞 } from '../../地点/隐世之境主厅门.tsx';
import { 月铃兰 } from '../../物品/月铃兰.tsx';
import { 光向, 门光 } from '../../特效/门光.tsx';
import { 她看你, 进门, 门光台面, 重逢发光区 } from './布景.tsx';
import { 她, 气泡字 } from './参数.ts';
import { 对视气泡, 对视门光, 抬手, 门光色调 } from './对视参数.ts';
import { 推门, 推门你, 推门她, 推门镜, 推脸, 台词气泡字, 啵帧, 对视镜, 蹲下, 驯服爱心种子 } from './重逢参数.ts';
import { 窗外樱花林 } from './窗外.tsx';

const 调子 = '归隐之地' as const;
const 事 = 正片事件;
const 缓 = (t: number) => t * t * (3 - 2 * t);
const 插 = (a: readonly number[], b: readonly number[], k: number) => a.map((v, i) => v + (b[i]! - v) * k) as V3;

/** 门开多少（0～1）：推门那一刻起 开秒 内开到底，先快后慢 */
export const 门开 = (秒: number) => {
  const t = clamp01((秒 - 事.推门.秒) / 推门.开秒);
  return 1 - (1 - t) ** 2;
};

/** 这一帧是不是推门那一镜（对视之前） */
export const 是推门镜 = (帧: number) => 帧 < 事.第15句对视.帧;

// ---------- 推门 ----------

const 推门你的姿势 = (秒: number) => {
  // 右胳膊：推门前 0.1 秒抬起来，门开到底后 0.15 秒放下
  const 举 = clamp01((秒 - 事.推门.秒 + 0.1) / 0.1) * (1 - clamp01((秒 - 事.推门.秒 - 推门.开秒) / 0.15));
  const p = stevePose(推门你.脚, 推门你.朝向, { sec: 秒 });
  return { ...p, armR: p.armR + 推门.伸手 * 缓(举) };
};

const 推门场景: React.FC<{ 秒: number; 描边: boolean }> = ({ 秒, 描边: 描 }) => {
  const 开 = 门开(秒);
  const 光参 = 对视门光;
  const 洞 = 开 > 0 ? 开着的门洞(进门, 开, 光向(光参.方位, 光参.仰角)) : null;
  const 她姿势: FigurePose = { ...standPose(她.脚), yaw: 推门她.朝向 };
  return (
    <>
      <隐世之境一楼开门 开={{ 西门: 开 }} />
      <窗外樱花林 />
      {洞 && <门光 参数={光参} 洞={洞} 台面们={门光台面} 眼={推门镜.眼} 秒={秒} 人影={{ 脚: [推门你.脚[0], 推门你.脚[1]], 高: 1.8 }} 亮={开} 光带 />}
      <描边 开={描}>
        <Steve pose={推门你的姿势(秒)} />
        <MagicalWineFoxEx pose={她姿势} 姿势="站" 表情={推门她.表情} 看={推门她.看} 眨眼={0} 秒={秒} 右手={{ 物品: <月铃兰 /> }} />
      </描边>
    </>
  );
};

// ---------- 对视以后 ----------

/** 你的眼高：蹲下那一刻起照原版 Camera.tick 每刻往潜行眼高靠一半，按刻内插值 */
export const 眼高 = (秒: number) => {
  const 站 = 对视镜.脚[2] + 1.62;
  const 蹲 = 对视镜.脚[2] + 蹲下.眼高;
  const k = (秒 - 事.蹲下.秒) * 20;
  if (k <= 0) return 站;
  const n = Math.floor(k);
  const 第 = (i: number) => 蹲 + (站 - 蹲) * 0.5 ** i;
  return 第(n) + (第(n + 1) - 第(n)) * (k - n);
};

/** 这一刻的机位：对视那一帧照 对视参数.ts；蹲下后看点抬高，推向她的脸时视角收窄、看点挪到她脸上 */
export const 重逢机位 = (秒: number) => {
  const 眼: V3 = [对视镜.脚[0], 对视镜.脚[1], 眼高(秒)];
  const 抬 = 蹲下.看点抬高 * 缓(clamp01((秒 - 事.蹲下.秒) / 蹲下.抬头秒));
  const 看0: V3 = [对视镜.看[0], 对视镜.看[1], 对视镜.看[2] + 抬];
  const 推 = 缓(clamp01((秒 - 事.推向她的脸.秒) / (事.第15句段尾.秒 - 事.推向她的脸.秒)));
  // 视角按放大倍数的对数插值（同 1-一如既往 的推镜），推起来是匀匀地放大
  const 半 = (度: number) => Math.tan(rad(度) / 2);
  const 视角 = (2 * Math.atan(半(对视镜.视角) * (半(推脸.视角) / 半(对视镜.视角)) ** 推) * 180) / Math.PI;
  return { 种: '透视' as const, 眼, 看: 插(看0, 推脸.看, 推), 视角 };
};

const 对视姿势: FigurePose = { ...standPose(她.脚), yaw: 她.身子朝向 };

/** 她：同 对视.tsx 的 对视她（站、侧身、头转过来看你、认出你、月铃兰抬到嘴边），只是头跟着你的眼睛走（你蹲下她就低头看你），中间眨一次眼 */
const 重逢她: React.FC<{ 秒: number; 眼: V3 }> = ({ 秒, 眼 }) => {
  const pose = 对视姿势;
  const p: 魔法酒狐新动作Props = {
    pose,
    姿势: '站',
    表情: '认出你',
    看: 她看你(眼, pose),
    眨眼: magicalWineFoxBlinkAt(秒, [事.第15句眨眼.秒]),
    秒,
    右手: { 物品: <月铃兰 />, 朝向: { 偏: magicalWineFoxLookAt(pose, 眼, '站')[1] } },
  };
  const 表 = magicalWineFoxExBones(p);
  const 加x = (b: string, 度: number) => {
    const [x = 0, y = 0, z = 0] = 表[b]?.rot ?? [];
    return { ...表[b], rot: [x + 度, y, z] };
  };
  return <MagicalWineFoxEx {...p} 骨骼={{ RightForeArm: 加x('RightForeArm', -抬手), RightHand: 加x('RightHand', 抬手) }} />;
};

/** 驯服的 7 颗爱心（碰撞箱 0.6 × 1.5，同 1-一如既往） */
const 爱心 = tamingHearts(她.脚, 0.6, 1.5, 0, 驯服爱心种子);
/** 段内帧那一套换成歌曲帧：从某个事件那一帧起数的原版刻 */
const 刻 = (帧: number, 起帧: number) => ((帧 - 起帧) / fps) * 20;

const 对视后场景: React.FC<{ 帧: number; 秒: number; 眼: V3; 描边: boolean }> = ({ 帧, 秒, 眼, 描边: 描 }) => {
  const 光参 = 对视门光;
  const 洞 = 开着的门洞(进门, 1, 光向(光参.方位, 光参.仰角));
  return (
    <>
      <隐世之境一楼开门 开={{ 西门: 1 }} />
      <窗外樱花林 />
      {洞 && <门光 参数={光参} 洞={洞} 台面们={门光台面} 眼={眼} 秒={秒} 光带={false} />}
      <描边 开={描}>
        <重逢她 秒={秒} 眼={眼} />
      </描边>
      <HeartParticles spawns={爱心} 刻={刻(帧, 事.第15句驯服.帧)} />
    </>
  );
};

// 手：右键在第 0 刻；换上蛋糕在右键前 8 刻（分镜的 换上蛋糕）；第 1 刻蛋糕被吃掉（同 1-一如既往）。
// 对视那一帧不画手（对视.tsx 文件头：空手的右臂会压在她身上），蛋糕吃掉以后空手的右臂照原版升上来
const 换上蛋糕刻 = Math.round((事.换上蛋糕.秒 - 事.递蛋糕右键.秒) * 20);
const 手剧本: HandScript = { start: null, swings: [0], changes: [{ tick: 换上蛋糕刻, to: '蛋糕' }, { tick: 1, to: null }] };

const 手: React.FC<{ 帧: number; 描边: boolean }> = ({ 帧, 描边: 描 }) => {
  const k = 刻(帧, 事.递蛋糕右键.帧);
  const h = handTimeline(k, 手剧本);
  const 拿着 = h.item === '蛋糕';
  if (!拿着 && k < 1) return null;
  const t = 色板[调子];
  // 手那一遍的视图坐标（Y 朝上、−Z 朝前）放进三渲二画布 Z 朝上的场景里：画布的看点朝 +y（北）就是视图的 −Z，再把画布里那层 −90° 转回来
  return (
    <三渲二画布
      宽={画幅.宽}
      高={画幅.高}
      机位={{ 种: '透视', 眼: [0, 0, 0], 看: [0, 1, 0], 视角: HAND_FOV, 近: HAND_NEAR, 远: 16 }}
      色调={门光色调}
      描边={描边默认.开 ? { 宽: 描边默认.宽, 色: t.描边 } : false}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <group rotation={[Math.PI / 2, 0, 0]}>
        <描边 开={描}>
          <FirstPersonHand
            held={拿着 ? <ItemSprite layers={CAKE} emissive={0} shadow={false} /> : null}
            arm={<SteveFirstPersonArm />}
            swing={h.swing}
            equip={h.equip}
          />
        </描边>
      </group>
    </三渲二画布>
  );
};

type 透视机 = { 眼: V3; 看: V3; 视角: number };

/** 她头顶的气泡：按这一刻的机位挂在帽顶（对视气泡.锚高）。
 *  对视以后倍数同对视那一帧（片 16）；驯服那一帧起换成台词，「啵」地一级级弹到原来的倍数。
 *  推门那一镜她离镜头远，照游戏大小挂（一个气泡像素 0.025 格，按帽顶那一点的远近换成成片像素，取偶数：颜文字那两撇是半个气泡像素） */
const 气泡: React.FC<{ 帧: number; 机: 透视机; 游戏大小?: boolean }> = ({ 帧, 机, 游戏大小 = false }) => {
  const cam = 做透视相机({ 眼: Z朝上转three(机.眼), 看: Z朝上转three(机.看), 视角: 机.视角, 宽: 画幅.宽, 高: 画幅.高 });
  const p = 投影到页面(cam, Z朝上转three([她.脚[0], 她.脚[1], 她.脚[2] + 对视气泡.锚高]), 画幅.宽, 画幅.高);
  const s = 游戏大小 ? Math.max(2, Math.round((p.每格 * 气泡像素格 * 成片倍数) / 2) * 2) : 对视气泡.缩放.片;
  const 换了 = 帧 >= 事.第15句驯服.帧;
  const 弹出 = 换了 ? clamp01((帧 - 事.第15句驯服.帧 + 1) / 啵帧) : 1;
  return <女仆气泡 锚={{ x: p.x, y: p.y }} 缩放={s} 锚对齐={s} 文字={换了 ? 台词气泡字 : 气泡字} 字体={像素字} 弹出={弹出} />;
};

export type 重逢画面属性 = {
  /** 歌曲帧 */
  帧: number;
  /** 叠在 3D 和气泡上面、整片后期里面的 2D（聊天栏、樱花风） */
  叠层?: React.ReactNode;
  描边?: boolean;
  后期?: boolean;
};

/** 一整帧（1280×720 页面），自己铺满 */
export const 重逢画面: React.FC<重逢画面属性> = ({ 帧, 叠层, 描边: 描 = 描边默认.开, 后期 = true }) => {
  const 秒 = 帧 / fps;
  const t = 色板[调子];
  const 推门中 = 是推门镜(帧);
  const 机 = 推门中 ? { 种: '透视' as const, ...推门镜 } : 重逢机位(秒);
  return (
    <整片后期 调色={后期 ? t.调色 : null}>
      <三渲二画布 宽={画幅.宽} 高={画幅.高} 机位={机} {...画布调子(调子)} 色调={门光色调} 发光区={重逢发光区}>
        {推门中 ? <推门场景 秒={秒} 描边={描} /> : <对视后场景 帧={帧} 秒={秒} 眼={机.眼} 描边={描} />}
      </三渲二画布>
      {!推门中 && <手 帧={帧} 描边={描} />}
      <气泡 帧={帧} 机={机} 游戏大小={推门中} />
      {叠层}
    </整片后期>
  );
};
