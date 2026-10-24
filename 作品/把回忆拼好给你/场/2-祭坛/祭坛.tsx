// 第 3 句祭坛召唤的画法：三渲二透视（平涂、不抗锯齿；全片不描边，画布调子跟 画风.ts 走），夏日白天的调子，整句一个镜头。
// 钟是歌曲帧 g（段里 = 段内帧 + 段起帧），谁在哪、什么时候怎样全在 编排.ts，这里只按它画。
// 祭坛画面 界面={false} 就是不带聊天栏的干净画面（第 8 句第一张照片「祭坛前递蛋糕」取 照片-祭坛递蛋糕 那一帧，核对/祭坛照片 出它）；歌词、整片后期在段里套。
import React from 'react';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { serverSendParticles, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { 成就聊天行, type ChatLine } from '@库/界面/聊天栏.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { 画幅 } from '../../分镜.ts';
import { 画布调子 } from '../../画风.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 樱花林方块 } from './樱花林.ts';
import { 女仆祭坛, 柱顶物, 蛋糕盒 } from './模型.tsx';
import { 你, 她, 末机 } from './人物.tsx';
import { 祭坛光 } from './光.tsx';
import * as 参 from './参数.ts';
import { 事, 浮物态们, 盒态, 秒, 刻, 镜头态 } from './编排.ts';

const 调子 = 画布调子('夏日白天');
const 林 = 樱花林方块();

/** 第三下拆盒：EntityBox.kill 在盒子位置往上 0.25 格放的 20 个 explosion */
const 拆盒爆 = serverSendParticles('explosion', 刻(事.拆三), [参.盒.位[0], 参.盒.位[1], 参.盒.位[2] + 参.拆盒爆.高], 参.拆盒爆.数, 参.拆盒爆.散, 参.拆盒爆.速, 参.拆盒爆.种子);
/** 递蛋糕：驯服成功的 7 颗爱心 */
const 爱心 = tamingHearts(参.她.脚, 参.爱心.宽, 参.爱心.高, 刻(事.递), 参.爱心.种子);

/** 聊天栏那一行：成就广播「Steve达成了目标[欢迎回家，主人]」，递蛋糕那一刻进来（第 4 句接着用同一行，起刻不变） */
export const 第3句聊天行: ChatLine = 成就聊天行('Steve', '欢迎回家，主人', 'goal', 刻(事.递));
/** 聊天宽（界面像素）：原版「聊天栏宽度」设置收到刚好放下这一行（库/界面/像素聊天栏.tsx 的 原版聊天宽，设置连续可调）。
 *  第 15 句那两镜的 110（界面/聊天栏宽.ts）放不下这一行（144），原版会折成两行，这里另取 */
export const 第3句聊天宽 = 像素字.字宽(第3句聊天行.text as never);

/** 画布里的东西（场景坐标，画布已经转好 Z 朝上） */
export const 祭坛场景: React.FC<{ g: number }> = ({ g }) => {
  const 盒 = 盒态(g);
  return (
    <>
      <方块拼搭 方块们={林} 群系="minecraft:cherry_grove" />
      <女仆祭坛 />
      {盒 && <蛋糕盒 位={参.盒.位} 态={盒} />}
      {浮物态们(g).map((s) => (s.样 === '光' ? null : <柱顶物 key={s.名} 态={s} 亮色={参.光.色} />))}
      <你 g={g} />
      <她 g={g} />
      <祭坛光 g={g} />
      <VanillaParticles spawns={拆盒爆} 秒={秒(g)} />
      <HeartParticles spawns={爱心} 刻={刻(g)} />
    </>
  );
};

/** 三渲二画布（整页 1280×720），镜头按 编排.ts 的 镜头态 */
export const 祭坛画布: React.FC<{ g: number }> = ({ g }) => {
  const 机 = 镜头态(g, 末机);
  return (
    <三渲二画布 宽={画幅.宽} 高={画幅.高} 机位={{ 种: '透视', ...机 }} {...调子}>
      <祭坛场景 g={g} />
    </三渲二画布>
  );
};

/** 左下角的原版聊天栏（缩放 参.聊天.缩放、聊天宽 第3句聊天宽） */
export const 祭坛聊天: React.FC<{ g: number; 行们?: readonly ChatLine[] }> = ({ g, 行们 = [第3句聊天行] }) => (
  <像素聊天栏 lines={行们} 刻={刻(g)} 缩放={参.聊天.缩放} 字体={像素字} 宽={画幅.宽} 高={画幅.高} 聊天宽={第3句聊天宽} />
);

/** 整个画面（不含歌词、整片后期）：界面 = false 时不画聊天栏（照片用） */
export const 祭坛画面: React.FC<{ g: number; 界面?: boolean }> = ({ g, 界面 = true }) => (
  <>
    <祭坛画布 g={g} />
    {界面 && <祭坛聊天 g={g} />}
  </>
);
