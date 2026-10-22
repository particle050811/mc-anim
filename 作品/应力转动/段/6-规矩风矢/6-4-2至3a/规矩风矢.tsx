// 6-4-2至3a 规矩风矢：6-4-2 规矩接 6-4-3a 风矢，一个不切的镜头合成一段，两截怎么拼见 时间线.ts。
// 6-4-2 的声音不在接缝上截断，响到放完；6-4-3 的声音、台词排在它自己的时间线上，从后半截起放。
// 拾取的箱子界面（6-4-2/编排.ts 的「拾取」）跨过接缝，叠在两截上面，切黄叛（6-4-3a 的 A2）起不画。
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as K642 from '../6-4-2/编排.ts';
import { RulesView } from '../6-4-2/规矩.tsx';
import { RulesSound } from '../6-4-2/声音.tsx';
import { DeflectView } from '../../../场/6-古城/6-4-3/画面.tsx';
import { DeflectSound } from '../../../场/6-古城/6-4-3/声音.tsx';
import { camera as camera643 } from '../../../场/6-古城/6-4-3/编排.ts';
import { 段帧数, 段表, 帧小数, 切 } from '../../../场/6-古城/6-4-3/时间线.ts';
import { ChestScreen, chestWindowOverLid } from '@库/界面/箱子界面.tsx';
import { G4 } from '../../../地点/古城4x.tsx';
import { CHEST } from '@库/物品/箱子.tsx';
import { chestArchery } from '../../../地点/古城4x/布局.ts';
import { partStartFrame } from './时间线.ts';
import { 声音Sequence } from '@engine/audio/声音Sequence.tsx';

// 箱盖开满竖起来的上沿，窗口下沿贴在这（同 7-2-2至3/画面.tsx）
const lidTop = G4(chestArchery.block[0] + 0.5, chestArchery.block[1] + CHEST.开满盖沿高, chestArchery.block[2] + 0.5);
// 箱盖中点落在窗口宽度的这个比例处：机位在箱子南边，他站在画面正中、翻开的箱盖在他右下，窗口整个放到箱盖右上让开他（出了画面往里收，贴着右边）
const WIN_ANCHOR_X = -0.25;

const LootUiLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const windStart = partStartFrame['6-4-3a'];
  if (frame >= windStart + 帧小数(切.A2)) return null;
  const storyFrame = frame < windStart ? K642.toStoryFrame(frame) : K642.STORY_END + frame - windStart;
  const ui = K642.lootUi(storyFrame);
  if (ui.visibility <= 0) return null;
  const cam = frame < windStart ? K642.camera(storyFrame) : camera643(段表['6-4-3a'].起 + frame - windStart);
  const win = chestWindowOverLid(lidTop, cam, WIN_ANCHOR_X, width, height);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <ChestScreen s={win.s} x={win.x} y={win.y} title="箱子" visibility={ui.visibility} chest={ui.chest} hovered={ui.hovered} t={frame / K642.FPS} />
    </AbsoluteFill>
  );
};

export const RulesWindArrow: React.FC = () => {
  const frame = useCurrentFrame();
  const windStart = partStartFrame['6-4-3a'];
  return (
    <>
      {frame < windStart ? <RulesView f={K642.toStoryFrame(frame)} /> : <DeflectView g={段表['6-4-3a'].起 + frame - windStart} />}
      <LootUiLayer frame={frame} />
      <RulesSound />
      <声音Sequence from={windStart} name="6-4-3a 声音">
        <DeflectSound startFrame={段表['6-4-3a'].起} frameCount={段帧数('6-4-3a')} />
      </声音Sequence>
    </>
  );
};
