// 女仆气泡和像素聊天栏的核对画面：中性灰底，气泡按视图摆，锚点画红点；聊天栏贴左下，几行是片里要出的（加入、死亡、进度、退出）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { MaidBubble } from '@库/界面/女仆气泡.tsx';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { type ChatLine, achievementChatLine, extraChatColors } from '@库/界面/聊天栏.tsx';
import { chatColors } from '@库/界面/基础.tsx';
import { aspect } from '../../分镜/时间.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏

const chatLines = (startTicks: number[]): ChatLine[] => [
  { text: 'Steve加入了游戏', color: yellow, startTick: startTicks[0]! },
  { text: 'Steve被苦力怕炸死了', startTick: startTicks[1]! },
  { text: 'Steve试图在熔岩里游泳', color: chatColors.white, startTick: startTicks[2]! },
  achievementChatLine('Steve', '欢迎回家，主人', 'goal', startTicks[3]!),
  { text: 'Steve退出了游戏', color: yellow, startTick: startTicks[4]! },
];

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#808080' }}>
      {v.bubbles.map((b, i) => (
        <React.Fragment key={i}>
          <MaidBubble 锚={{ x: b.锚[0], y: b.锚[1] }} scale={b.scale} 文字={b.char} 字体={pixelFont} popProgress={b.popProgress} bottomStyle={b.bottomStyle} 位置={b.位置} />
          <div style={{ position: 'absolute', left: b.锚[0] - 1, top: b.锚[1] - 1, width: 2, height: 2, background: '#ff2020' }} />
        </React.Fragment>
      ))}
      {v.chatScale !== undefined && <PixelChatBar lines={chatLines(v.chatStartTicks ?? [0, 0, 0, 0, 0])} 刻={v.chatTick ?? 0} scale={v.chatScale} 字体={pixelFont} width={aspect.width} height={aspect.height} />}
      <div style={{ position: 'absolute', right: 20, top: 16, fontFamily: uiFontFamily, fontSize: 20, color: '#f2f2f2', textShadow: '0 1px 3px #000' }}>
        核对-气泡聊天栏 · {v.name}
      </div>
      <div style={{ position: 'absolute', right: 20, top: 44, fontFamily: uiFontFamily, fontSize: 14, color: '#e0e0e0', textShadow: '0 1px 3px #000' }}>
        聊天绿 {extraChatColors.green} · 黄 {yellow} · 红点是气泡锚点
      </div>
    </AbsoluteFill>
  );
};

export default picture;
