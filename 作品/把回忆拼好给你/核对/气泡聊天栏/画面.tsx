// 女仆气泡和像素聊天栏的核对画面：中性灰底，气泡按视图摆，锚点画红点；聊天栏贴左下，几行是片里要出的（加入、死亡、进度、退出）。
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { 女仆气泡 } from '@库/界面/女仆气泡.tsx';
import { 像素聊天栏 } from '@库/界面/像素聊天栏.tsx';
import { type ChatLine, 成就聊天行, 聊天色 } from '@库/界面/聊天栏.tsx';
import { chatColors } from '@库/界面/基础.tsx';
import { 画幅 } from '../../分镜.ts';
import { 像素字 } from '../../界面/像素字.ts';
import { 视图们 } from './视图.ts';

const 黄 = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏

const 聊天行们 = (起刻: number[]): ChatLine[] => [
  { text: 'Steve加入了游戏', color: 黄, 起刻: 起刻[0]! },
  { text: 'Steve被苦力怕炸死了', 起刻: 起刻[1]! },
  { text: 'Steve试图在熔岩里游泳', color: chatColors.white, 起刻: 起刻[2]! },
  成就聊天行('Steve', '欢迎回家，主人', 'goal', 起刻[3]!),
  { text: 'Steve退出了游戏', color: 黄, 起刻: 起刻[4]! },
];

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#808080' }}>
      {v.气泡们.map((b, i) => (
        <React.Fragment key={i}>
          <女仆气泡 锚={{ x: b.锚[0], y: b.锚[1] }} 缩放={b.缩放} 文字={b.字} 字体={像素字} 弹出={b.弹出} 底={b.底} 位置={b.位置} />
          <div style={{ position: 'absolute', left: b.锚[0] - 1, top: b.锚[1] - 1, width: 2, height: 2, background: '#ff2020' }} />
        </React.Fragment>
      ))}
      {v.聊天缩放 !== undefined && <像素聊天栏 lines={聊天行们(v.聊天起刻 ?? [0, 0, 0, 0, 0])} 刻={v.聊天刻 ?? 0} 缩放={v.聊天缩放} 字体={像素字} 宽={画幅.宽} 高={画幅.高} />}
      <div style={{ position: 'absolute', right: 20, top: 16, fontFamily: uiFontFamily, fontSize: 20, color: '#f2f2f2', textShadow: '0 1px 3px #000' }}>
        核对-气泡聊天栏 · {v.名}
      </div>
      <div style={{ position: 'absolute', right: 20, top: 44, fontFamily: uiFontFamily, fontSize: 14, color: '#e0e0e0', textShadow: '0 1px 3px #000' }}>
        聊天绿 {聊天色.green} · 黄 {黄} · 红点是气泡锚点
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
