// 第 15 句 49.96「对视」这一帧（封面帧）的成片画法：三渲二透视（平涂、不抗锯齿、她描边）、归隐之地那套调子、整片后期，
// 上面叠她头顶的车万女仆气泡和左下的聊天（片里是原版聊天栏，封面、竖版是放大的那行大字）。参数见 对视参数.ts。
// 气泡这一镜不照游戏大小挂：底边压在她帽顶、按各画幅定的偶数倍画（对视参数.ts 的 对视气泡）。
// 你的手不画：原版空手会在右下画右臂、拿着东西会画东西，这一帧的右下正好是她的身子和花，画了就压在她身上；
// 50.39 递蛋糕时手从画面下沿升上来（原版换手就是从下面升起），这一帧手在画外看着也顺。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { MagicalWineFoxEx, magicalWineFoxExBones, type 魔法酒狐新动作Props } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 女仆气泡 } from '@库/界面/女仆气泡.tsx';
import { 做透视相机, 投影到页面, Z朝上转three } from '@库/界面/投影.ts';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { 画布调子 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 眼位 } from '../../地点/机位.tsx';
import { 月铃兰 } from '../../物品/月铃兰.tsx';
import { 她看你, 隐世之境重逢布景, 重逢发光区 } from './布景.tsx';
import { 封面聊天行 } from './叠层.tsx';
import { 她, 气泡字 } from './参数.ts';
import {
  对视取景,
  对视气泡,
  对视秒,
  对视脚,
  对视视角,
  对视门光,
  封面大字,
  片里聊天缩放,
  抬手,
  聊天年龄刻,
  门光色调,
  type 对视版,
} from './对视参数.ts';

const 调子 = '归隐之地' as const;
const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏

/** 你的眼睛（原版眼高 1.62） */
export const 对视眼: V3 = 眼位(对视脚);

/** 这一帧的透视机位（形状同 engine/三渲二/机位.tsx 的 透视机位参数） */
export const 对视机位 = (版: 对视版) => ({ 种: '透视' as const, 眼: 对视眼, 看: 对视取景[版].看, 视角: 对视视角 });

/** 她这一帧的姿势（脚底、身子朝向） */
export const 对视姿势: FigurePose = { ...standPose(她.脚), yaw: 她.身子朝向 };

/** 她这一帧的样子：站着（TLM 待机站姿）、身子侧着、头转过来看你（夹在 头转范围 上限）、认出你、睁着眼，右手拿月铃兰、花正面朝你、手抬到嘴边（对视参数.ts 的 抬手） */
export const 对视她: React.FC<{ 秒?: number }> = ({ 秒 = 对视秒 }) => {
  const pose = 对视姿势;
  const p: 魔法酒狐新动作Props = {
    pose,
    姿势: '站',
    表情: '认出你',
    看: 她看你(对视眼, pose),
    眨眼: 0,
    秒,
    右手: { 物品: <月铃兰 />, 朝向: { 偏: magicalWineFoxLookAt(pose, 对视眼, '站')[1] } },
  };
  // 在组件摆好的拿花姿势（右手胸前）上，前臂往上抬、手腕反着转回
  const 表 = magicalWineFoxExBones(p);
  const 加x = (b: string, 度: number) => {
    const [x = 0, y = 0, z = 0] = 表[b]?.rot ?? [];
    return { ...表[b], rot: [x + 度, y, z] };
  };
  return <MagicalWineFoxEx {...p} 骨骼={{ RightForeArm: 加x('RightForeArm', -抬手), RightHand: 加x('RightHand', 抬手) }} />;
};

/** 三渲二画布里的东西（网格本地坐标，画布已经转好 Z 朝上）：布景不放灯（平涂不吃灯），她描边；描边 = false 时不描 */
export const 对视场景: React.FC<{ 描边?: boolean; 秒?: number }> = ({ 描边: 描 = true, 秒 = 对视秒 }) => (
  <隐世之境重逢布景 眼={对视眼} 秒={秒} 灯光={false} 门光参数={对视门光}>
    <描边 开={描}>
      <对视她 秒={秒} />
    </描边>
  </隐世之境重逢布景>
);

/** 气泡挂在哪（页面像素）：她脚底正上方 对视气泡.锚高 那一点按这一版的机位投到画面上 */
export const 对视气泡锚 = (版: 对视版) => {
  const { 宽, 高, 看 } = 对视取景[版];
  const cam = 做透视相机({ 眼: Z朝上转three(对视眼), 看: Z朝上转three(看), 视角: 对视视角, 宽, 高 });
  const p = 投影到页面(cam, Z朝上转three([她.脚[0], 她.脚[1], 她.脚[2] + 对视气泡.锚高]), 宽, 高);
  return { x: p.x, y: p.y };
};

/** 她头顶的气泡：按 对视气泡 里这一版的缩放画，锚点吸到一个气泡像素的格子上（从页面左上角数） */
const 气泡: React.FC<{ 版: 对视版 }> = ({ 版 }) => {
  const s = 对视气泡.缩放[版];
  return <女仆气泡 锚={对视气泡锚(版)} 缩放={s} 锚对齐={s} 文字={气泡字} 字体={像素字} />;
};

/**
 * 一整帧（一个画幅）：宽高是 对视取景 里这一版的页面尺寸，放在 position 不是 static 的容器里，自己贴左上角。
 * 描边、后期、大字 只在核对里换（比较用）：大字 换掉封面、竖版那行大字的布局。
 */
export const 对视画面: React.FC<{ 版: 对视版; 描边?: boolean; 后期?: boolean; 秒?: number; 大字?: { 缩放: number; 左: number; 下: number } }> = ({
  版,
  描边: 描 = true,
  后期 = true,
  秒 = 对视秒,
  大字,
}) => {
  const { 宽, 高 } = 对视取景[版];
  const t = 色板[调子];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, overflow: 'hidden' }}>
      <整片后期 调色={后期 ? t.调色 : null}>
        <三渲二画布 宽={宽} 高={高} 机位={对视机位(版)} {...画布调子(调子)} 色调={门光色调} 发光区={重逢发光区}>
          <对视场景 描边={描} 秒={秒} />
        </三渲二画布>
        <气泡 版={版} />
        {版 === '片' ? (
          <像素聊天栏 lines={[{ text: 'Steve加入了游戏', color: 黄, 起刻: 0 }]} 刻={聊天年龄刻} 缩放={片里聊天缩放} 字体={像素字} 宽={宽} 高={高} />
        ) : (
          <封面聊天行 布局={大字 ?? 封面大字[版]} />
        )}
      </整片后期>
    </div>
  );
};
