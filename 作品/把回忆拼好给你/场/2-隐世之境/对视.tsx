// 第 15 句 49.96「对视」这一帧（封面帧）的成片画法：三渲二透视（平涂、不抗锯齿、她描边）、归隐之地那套调子、整片后期，
// 上面叠她头顶的车万女仆气泡和左下的聊天（片里是原版聊天栏，封面、竖版是放大的那行大字）。参数见 对视参数.ts。
// 你的手不画：原版空手会在右下画右臂、拿着东西会画东西，这一帧的右下正好是她的身子和花，画了就压在她身上；
// 50.39 递蛋糕时手从画面下沿升上来（原版换手就是从下面升起），这一帧手在画外看着也顺。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { 女仆气泡 } from '@库/界面/女仆气泡.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { 画布调子 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 眼位 } from '../../地点/机位.tsx';
import { 月铃兰 } from '../../物品/月铃兰.tsx';
import { 她看你, 隐世之境重逢布景, 重逢发光区 } from './布景.tsx';
import { 封面聊天行, 气泡摆法 } from './叠层.tsx';
import { 她, 机位, 气泡字 } from './参数.ts';
import { 对视取景, 对视秒, 对视脚, 对视门光, 封面大字, 片里聊天缩放, 抬手, 聊天年龄刻, 门光色调, type 对视版 } from './对视参数.ts';

const 调子 = '归隐之地' as const;
const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
/** 库/角色/魔法酒狐新动作.ts 的 右手胸前 里前臂的转角（那边没导出） */
const 胸前前臂 = -94;

/** 你的眼睛（原版眼高 1.62） */
export const 对视眼: V3 = 眼位(对视脚);

/** 这一帧的透视机位（形状同 engine/三渲二/机位.tsx 的 透视机位参数） */
export const 对视机位 = (版: 对视版) => ({ 种: '透视' as const, 眼: 对视眼, 看: 对视取景[版].看, 视角: 机位.视角 });

/** 她这一帧的姿势（脚底、身子朝向） */
export const 对视姿势: FigurePose = { ...standPose(她.脚), yaw: 她.身子朝向 };

/** 她这一帧的样子：站着（TLM 待机站姿）、身子侧着、头转过来看你（夹在 头转范围 上限）、认出你、睁着眼，右手拿月铃兰、花正面朝你、手抬到嘴边（对视参数.ts 的 抬手） */
export const 对视她: React.FC<{ 秒?: number }> = ({ 秒 = 对视秒 }) => {
  const pose = 对视姿势;
  return (
    <MagicalWineFoxEx
      pose={pose}
      姿势="站"
      表情="认出你"
      看={她看你(对视眼, pose)}
      眨眼={0}
      秒={秒}
      右手={{ 物品: <月铃兰 />, 朝向: { 偏: magicalWineFoxLookAt(pose, 对视眼, '站')[1] } }}
      骨骼={{ RightForeArm: { rot: [胸前前臂 - 抬手, 0, 0] }, RightHand: { rot: [抬手, 0, 0] } }}
    />
  );
};

/** 三渲二画布里的东西（网格本地坐标，画布已经转好 Z 朝上）：布景不放灯（平涂不吃灯），她描边；描边 = false 时不描 */
export const 对视场景: React.FC<{ 描边?: boolean; 秒?: number }> = ({ 描边: 描 = true, 秒 = 对视秒 }) => (
  <隐世之境重逢布景 眼={对视眼} 秒={秒} 灯光={false} 门光参数={对视门光}>
    <描边 开={描}>
      <对视她 秒={秒} />
    </描边>
  </隐世之境重逢布景>
);

/** 她头顶的气泡，按这一版的机位和页面尺寸挂（游戏里的大小：一个气泡像素 0.025 格，取整数缩放） */
const 气泡: React.FC<{ 版: 对视版 }> = ({ 版 }) => {
  const { 宽, 高 } = 对视取景[版];
  const 机 = 对视机位(版);
  const { 锚, 缩放, 在前 } = 气泡摆法(机, 她.脚 as V3, 宽, 高);
  if (!在前) return null;
  return <女仆气泡 锚={锚} 缩放={缩放} 文字={气泡字} 字体={像素字} />;
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
