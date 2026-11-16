// 门口核对的画面：按视图表一帧画一个视图（场/2-门口 的 门口画布），左上角写视图名。
// 门对比那帧左右各一个半屏、门都在正中。站位标尺那几帧：门外一步站史蒂夫、牌树之间站魔法酒狐（站姿、戴帽、面朝镜头），她头顶冒「˃ʍ˂」气泡、左下聊天栏一行「Steve加入了游戏」，气泡、聊天栏的缩放 = 这一帧的 N；
//   红线标门、箱子、树苗、告示牌的 x，黄线是地面，右边写人占画面高的比例。分屏那帧只画右半屏。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { STEVE, Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { MaidBubble, bubbleAnchorHeight } from '@库/界面/女仆气泡.tsx';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { aspect } from '../../分镜/时间.ts';
import { useCheckView } from '@engine/段/核对画面.tsx';
import { filmScale as filmScale } from '@engine/三渲二/像素.ts';
import { Outline } from '@engine/三渲二/描边.tsx';
import { sideProjection } from '../../地点/侧剖面.tsx';
import { celestialPosition } from '../../地点/天体.ts';
import { entrance } from '../../地点/门口小木屋.tsx';
import { pixelFont } from '../../界面/像素字.ts';
import { halfScreenFraming, fullScreenFraming, orthoTop, defaultSkyArc, type DoorFraming } from '../../场/2-门口/参数.ts';
import { DoorCanvas } from '../../场/2-门口/门口.tsx';
import { views } from './视图.ts';

const width = aspect.width, height = aspect.height;
const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入游戏
/** 魔法酒狐站着戴帽的头顶（格，脚底起）：N = 6 的站位帧上按像素量的帽尖最高那一行（172 像素）。不戴帽量到头发顶是 1.515（MAGICAL_WINE_FOX.headTop） */
const wineFoxHatTop = 1.79;
const standPos = { steve: entrance.standPos.oneStepOutside, wineFox: entrance.standPos.signTreeGap };

const textStyle = { position: 'absolute', fontFamily: uiFontFamily, color: '#ffffff', textShadow: '0 1px 2px #000', whiteSpace: 'nowrap' } as const;

const ScaleTicks: React.FC<{ framing: DoorFraming }> = ({ framing }) => {
  const project = sideProjection(framing, width, height);
  const verticalTicks = [
    { x: entrance.门.x, name: '门 x=0' },
    { x: entrance.chest[0], name: `箱子 x=${entrance.chest[0]}` },
    { x: entrance.saplingPos[0], name: `树苗 x=${entrance.saplingPos[0]}` },
    { x: entrance.signboardPos[0], name: `告示牌 x=${entrance.signboardPos[0]}` },
  ];
  const screenY = project(0, 0).y;
  const toPercent = (h: number) => `${((h * framing.pxPerCell) / (height * filmScale)) * 100}`.slice(0, 4);
  return (
    <>
      {verticalTicks.map((v) => (
        <React.Fragment key={v.name}>
          <div style={{ position: 'absolute', left: project(v.x, 0).x - 0.5, top: 0, width: 1, height: height, background: 'rgba(255,60,60,0.7)' }} />
          <div style={{ ...textStyle, fontSize: 14, left: project(v.x, 0).x + 4, top: 70 }}>{v.name}</div>
        </React.Fragment>
      ))}
      <div style={{ position: 'absolute', left: 0, top: screenY - 0.5, width: width, height: 1, background: 'rgba(255,230,60,0.8)' }} />
      <div style={{ ...textStyle, fontSize: 14, right: 16, top: screenY - 22 }}>地面 z=0（离底 {height - screenY} 页面像素）</div>
      <div style={{ ...textStyle, fontSize: 16, right: 16, top: 12, textAlign: 'right', lineHeight: 1.5 }}>
        <div>一个贴图像素 {framing.pxPerCell / 16} 成片像素 · 一屏 {((width * filmScale) / framing.pxPerCell).toFixed(1)} × {((height * filmScale) / framing.pxPerCell).toFixed(2)} 格</div>
        <div>史蒂夫 {STEVE.height} 格 = 画面高 {toPercent(STEVE.height)}%</div>
        <div>酒狐戴帽 {wineFoxHatTop} 格 = 画面高 {toPercent(wineFoxHatTop)}%</div>
      </div>
    </>
  );
};

const CelestialPath: React.FC<{ framing: DoorFraming }> = ({ framing }) => {
  const project = sideProjection(framing, width, height);
  const arc = defaultSkyArc(framing, width, height);
  return (
    <>
      {Array.from({ length: 24 }, (_, i) => {
        const p = celestialPosition(i * 1000, arc).sun;
        const q = project(p.x, p.z);
        return (
          <div key={i} style={{ position: 'absolute', left: q.x - 4, top: q.y - 4, width: 8, height: 8, borderRadius: 4, background: p.height > 0 ? '#ff5050' : '#666' }}>
            <span style={{ ...textStyle, fontSize: 12, left: 10, top: -4 }}>{i}</span>
          </div>
        );
      })}
    </>
  );
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  const houseProps = { doorOpen: v.doorOpen, chestOpen: v.chestOpen, treeProgress: v.treeProgress, hasSign: v.hasSign, 刻: v.刻, lightDarkAmp: v.lightDarkAmp, tone: v.tone, topDepth: v.topDepth };
  const framing = fullScreenFraming(v.N);
  const N = framing.pxPerCell / 16;
  const standY = entrance.standRowY;
  const anchor = sideProjection(framing, width, height, v.topDepth ?? orthoTop)(standPos.wineFox, bubbleAnchorHeight(), standY);
  return (
    <AbsoluteFill style={{ background: '#2a2d33' }}>
      {v.doorCompare ? (
        [false, true].map((doorOpen, i) => (
          <div key={i} style={{ position: 'absolute', left: (i * width) / 2, top: 0 }}>
            <DoorCanvas width={width / 2} height={height} framing={halfScreenFraming((width / 2) * filmScale, 0.5)} {...houseProps} doorOpen={doorOpen} />
            <div style={{ ...textStyle, left: 16, top: 60, fontSize: 20 }}>{doorOpen ? '门开' : '门关'}</div>
          </div>
        ))
      ) : v.halfScreen ? (
        <div style={{ position: 'absolute', left: width / 2, top: 0 }}>
          <DoorCanvas width={width / 2} height={height} framing={halfScreenFraming((width / 2) * filmScale, v.halfScreen.doorFrac)} {...houseProps} />
        </div>
      ) : (
        <DoorCanvas
          {...houseProps}
          framing={framing}
          overlay={
            v.showRuler && (
              <>
                <MaidBubble 锚={anchor} scale={N} 文字="˃ʍ˂" 字体={pixelFont} anchorAlign={N} />
                <PixelChatBar lines={[{ text: 'Steve加入了游戏', color: yellow, startTick: 0 }]} 刻={0} scale={N} 字体={pixelFont} width={width} height={height} />
                <ScaleTicks framing={framing} />
              </>
            )
          }
        >
          {v.showRuler && (
            <Outline>
              <Steve pose={stevePose([standPos.steve, standY, 0], 180)} />
              <MagicalWineFox pose={{ ...standPose([standPos.wineFox, standY, 0]), yaw: 180 }} stancePose="站" />
            </Outline>
          )}
        </DoorCanvas>
      )}
      {v.celestialPath && <CelestialPath framing={framing} />}
      <div style={{ ...textStyle, left: 16, top: 12, fontSize: 22 }}>核对-门口 · {v.name}</div>
    </AbsoluteFill>
  );
};

export default picture;
