// 第 15 句开头（48.61–49.54）门这个机位的一整帧：你上线出现在告示牌旁，抬头看长高的樱花树，转去摇响牌上挂着的寻风之铃，樱花风卷起来盖满画面。
// 按歌曲帧画（分镜.ts 的时间轴），站位、动作、铃、调子见 第15句.ts，像素密度、取景用 参数.ts 的 整屏镜头（N = 10，主会话 10-24 定），白天同第 8 句（白天刻）。
// 层次（从下往上）：门口画布（天、三维的屋子和你、铃）→ 左下原版聊天栏「Steve加入了游戏」→ 樱花风；外面整片后期（调色跟着樱花风从褪色回到夏日白天）。
// 歌词不在这里画（段画面在整片后期外面另叠）。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { clamp01, rad, sample } from '@engine/anim/anim.ts';
import { 描边 as 描边组 } from '@engine/三渲二/描边.tsx';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { 插调子 } from '@engine/三渲二/调子.ts';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { fps, 画幅, 正片事件 } from '../../分镜.ts';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 告示牌像素字 } from '../../地点/告示牌字.tsx';
import { 门口 } from '../../地点/门口小木屋.tsx';
import { 描边 as 描边默认 } from '../../画风.ts';
import { 色板 } from '../../色板.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 寻风之铃 } from '../../物品/寻风之铃.tsx';
import { 樱花风 } from '../../特效/樱花风.tsx';
import type { 樱花风时刻 } from '../../特效/樱花风参数.ts';
import { 告示牌行们, 白天刻, 整屏镜头, 正交顶面 } from './参数.ts';
import { 门口画布 } from './门口.tsx';
import { 回色, 你x, 你朝向, 你的头, 你的右臂, 铃, 铃摆 } from './第15句.ts';

const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
const 事 = 正片事件;

/** 樱花风的时间轴：摇铃起风，风散开（转场）那一拍整屏盖住。隐世之境那一镜接着用同一个 */
export const 第15句风: 樱花风时刻 = { 起: 事.摇铃.秒, 满: 事.风散开.秒 };

/** 「Steve加入了游戏」那一行进聊天栏以后过了多少刻（原版聊天按刻走）：歌曲帧 → 刻 */
export const 加入游戏刻 = (帧: number) => ((帧 - 事.第15句加入游戏.帧) / fps) * 20;

/** 原版聊天栏的缩放：2560×1440 下原版自动选的界面尺寸 6（同 场/2-隐世之境 对视那一帧，同一行字跨镜头一样大） */
export const 聊天缩放 = 6;

/** 左下的原版聊天栏，只有「Steve加入了游戏」一行（帧：歌曲帧） */
export const 加入游戏聊天: React.FC<{ 帧: number }> = ({ 帧 }) => (
  <像素聊天栏 lines={[{ text: 'Steve加入了游戏', color: 黄, 起刻: 0 }]} 刻={加入游戏刻(帧)} 缩放={聊天缩放} 字体={像素字} 宽={画幅.宽} 高={画幅.高} />
);

const 投 = 侧投影(整屏镜头.取景, 画幅.宽, 画幅.高, 正交顶面);
const 铃心: V3 = [铃.挂点[0], 铃.挂点[1], 铃.挂点[2] - 铃.垂];
/** 铃心在画面上的位置（页面坐标）：樱花风从这里起 */
export const 铃在画面 = 投(铃心[0], 铃心[2], 铃心[1]);

const 缓 = (t: number) => t * t * (3 - 2 * t);

/** 你这一刻的姿势（秒：歌上的秒） */
const 你的姿势 = (秒: number) => {
  const 转 = 事.转向铃.秒;
  const 摇 = 事.摇铃.秒;
  // 头：看树 → 转向铃时转去看铃（0.15 秒转过去）→ 摇铃后 0.1 秒起抬头看风（0.2 秒）
  const 看 = (a: [number, number], b: [number, number], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  let 头 = 你的头.看树 as number[];
  if (秒 >= 转) 头 = 看(你的头.看树, 你的头.看铃, 缓(clamp01((秒 - 转) / 0.15)));
  if (秒 >= 摇 + 0.1) 头 = 看(你的头.看铃, 你的头.看风, 缓(clamp01((秒 - 摇 - 0.1) / 0.2)));
  // 右胳膊：转向铃起抬到铃上（摇铃那一刻到位），摇铃时晃几下，之后放下
  const 起 = 缓(clamp01((秒 - 转) / (摇 - 转)));
  const 落 = 缓(clamp01((秒 - 摇 - 你的右臂.晃秒) / 你的右臂.放下秒));
  const 举 = 起 * (1 - 落);
  const 晃 = 秒 >= 摇 && 秒 < 摇 + 你的右臂.晃秒 ? Math.sin((秒 - 摇) * 你的右臂.晃频 * Math.PI * 2) * 你的右臂.晃 : 0;
  const p = stevePose([你x, 门口.站排y, 0], 你朝向, { sec: 秒, scale: 1, headPitch: 头[0], headYaw: 头[1] });
  return { ...p, armR: p.armR + 你的右臂.够铃.抬 * 举, armRRoll: p.armRRoll + 你的右臂.够铃.张 * 举 + 晃 };
};

/** 铃绕挂点摆的角（度，正 = 铃往画面右边甩）：摇铃时被手往左一拨，之后衰减着摆 */
const 铃角 = (秒: number) => {
  const t = 秒 - 事.摇铃.秒;
  if (t < 0) return 0;
  return -铃摆.振幅 * Math.sin((t / 铃摆.周期) * Math.PI * 2) * 铃摆.衰减 ** t;
};

/** 挂着的铃：一个正对镜头的物品薄片，绕挂点（朝镜头的轴）摆；挂绳是一个铃像素宽的竖条 */
const 挂着的铃: React.FC<{ 秒: number }> = ({ 秒 }) => {
  const s = 铃.大小;
  return (
    <group position={铃.挂点} rotation={[0, rad(-铃角(秒)), 0]}>
      <mesh position={[0, 0, -(铃.垂 - s / 2) / 2]}>
        <boxGeometry args={[s / 16, s / 16, 铃.垂 - s / 2]} />
        <meshStandardMaterial color="#5a3a22" roughness={1} />
      </mesh>
      <group position={[0, 0, -铃.垂]} rotation={[Math.PI / 2, 0, 0]} scale={s}>
        <寻风之铃 />
      </group>
    </group>
  );
};

export type 摇铃画面属性 = {
  /** 歌曲帧 */
  帧: number;
  描边?: boolean;
  后期?: boolean;
};

/** 一整帧（1280×720 页面），自己铺满 */
export const 摇铃画面: React.FC<摇铃画面属性> = ({ 帧, 描边 = 描边默认.开, 后期 = true }) => {
  const 秒 = 帧 / fps;
  const 回 = 回色.起 + (回色.止 - 回色.起) * sample([[第15句风.起, 0], [第15句风.满, 1]], 秒);
  const 调 = 插调子(色板.褪色, 色板.夏日白天, 回);
  const 你 = 你的姿势(秒);
  return (
    <整片后期 调色={后期 ? 调.调色 : null}>
      <门口画布
        宽={画幅.宽}
        高={画幅.高}
        {...整屏镜头}
        刻={白天刻}
        调子={调}
        门开
        箱子开度={0}
        树进度={1}
        告示牌
        告示牌字={<告示牌像素字 行们={告示牌行们} />}
        叠层={
          <>
            <加入游戏聊天 帧={帧} />
            <樱花风 秒={秒} 时刻={第15句风} 源={铃在画面} />
          </>
        }
      >
        <挂着的铃 秒={秒} />
        <描边组 开={描边}>
          <贴图像素对齐 锚={你.loc as V3}>
            <Steve pose={你} />
          </贴图像素对齐>
        </描边组>
      </门口画布>
    </整片后期>
  );
};
