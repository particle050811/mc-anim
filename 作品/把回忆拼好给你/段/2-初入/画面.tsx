// 2-初入 的画面：开头接着 2-六月樱 的启动器钻进图标，图标里的旧照片一格一格透掉，露出垫在下面的新世界（场/2-新世界，透视三渲二）；
// 钻完只剩新世界：聊天栏一行黄字「Steve加入了游戏」，你小小一个站在平原上，远处一点粉，镜头往粉色推。调子跟着透掉的比例从现实回暖到夏日白天。
// 最后 4 帧（三稿 4.79）聊天栏先弹出第 2 句的第一条白字死亡消息，切到 2-第一晚 时它在同一个位置（界面先入，画面后切）。
import type React from 'react';
import { useCurrentFrame } from 'remotion';
import { 整片后期 } from '@engine/三渲二/整片后期.tsx';
import { stevePose, vanillaWalk } from '@库/角色/史蒂夫.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { fps, 画幅, 段窗口, 正片事件 } from '../../分镜.ts';
import { 原声 } from '../../配乐/原声.ts';
import { 配乐音轨 } from '../../配乐/配乐音轨.tsx';
import { 像素字 } from '../../界面/像素字.ts';
import { 第15句聊天宽 } from '../../界面/聊天栏宽.ts';
import { 符文歌词, 符文歌词默认 } from '../../界面/符文歌词.tsx';
import { 正片歌词行 } from '../../界面/符文歌词数据.ts';
import { 启动器 } from '../../场/2-启动器/启动器.tsx';
import { 光标在, 行态在, 钻入取景, 钻入进度, 钻入透, 阈 } from '../../场/2-启动器/编排.ts';
import { 旧图标 } from '../../场/2-启动器/图标源.ts';
import { 聊天, 走速 } from '../../场/2-新世界/参数.ts';
import { 你在 } from '../../场/2-新世界/编排.ts';
import { 新世界 } from '../../场/2-新世界/世界.tsx';
import { 调子在, 钻完, 镜头在 } from './编排.ts';
import 段 from './段.ts';

const 起帧 = 段窗口('2-初入').起帧;
const 宽 = 画幅.宽, 高 = 画幅.高;
const 行们 = Array.from({ length: 15 }, (_, i) => 正片歌词行(i + 1, 起帧));

const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏
/** 聊天栏的钟（刻）从「加入了游戏」那一刻起算 */
const 刻 = (歌帧: number) => ((歌帧 - 正片事件.第1句加入游戏.帧) / fps) * 20;
/** 系统消息：加入游戏（黄）、第 2 句第一条死亡消息（白，原版 zh_cn death.attack.explosion.player；和 2-第一晚 那一行同一句、同一刻） */
const 聊天行们 = [
  { text: 'Steve加入了游戏', color: 黄, 起刻: 0 },
  { text: 'Steve被苦力怕炸死了', 起刻: 刻(正片事件.第1句尾死亡消息.帧) },
];

const 画面: React.FC = () => {
  const 歌帧 = 起帧 + useCurrentFrame();
  const 调 = 调子在(歌帧);
  const 样 = 你在(歌帧);
  const 你姿 = stevePose(样.脚, 样.朝向, { sec: 样.秒, ...(样.走秒 === null ? {} : vanillaWalk(走速, 样.走秒, true)) });
  const { q } = 钻入进度(歌帧);
  const 透 = 钻入透(q);
  return (
    <>
      <整片后期 调色={调.调色} 种子={歌帧}>
        <新世界 机位={镜头在(歌帧)} 你={你姿} 色调={调.色调} 宽={宽} 高={高} />
        {歌帧 < 钻完 && (
          <启动器 状态={{ 取景: 钻入取景(q), 行态: 行态在(歌帧), 光标: 光标在(歌帧), 图标: 旧图标, 图标透: (i, j) => 阈(i, j) < 透 }} 宽={宽} 高={高} />
        )}
        <像素聊天栏 lines={聊天行们} 刻={刻(歌帧)} 缩放={聊天.缩放} 字体={像素字} 宽={宽} 高={高} 聊天宽={第15句聊天宽} />
        <符文歌词 行们={行们} 样式={{ ...符文歌词默认, 描边色: 调.描边 }} />
      </整片后期>
      <配乐音轨 song={原声} 段={段} />
    </>
  );
};

export default 画面;
