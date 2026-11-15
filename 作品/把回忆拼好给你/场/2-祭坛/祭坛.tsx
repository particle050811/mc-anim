// 第 3 句祭坛召唤的画法：天（2D 画布）在后，三渲二透视画布（平涂、不抗锯齿；全片不描边，画布调子跟 画风.ts 走）透明叠在前面，夏日白天的调子；远景、近景两个镜头都在 编排.ts 的 镜头态。
// 钟是歌曲帧 g（段里 = 段内帧 + 段起帧），谁在哪、什么时候怎样全在 编排.ts，这里只按它画。
// 不画聊天栏：三稿递蛋糕时左下一行「Steve达成了目标[欢迎回家，主人]」，顶上已经有歌词，文字一时只走一路（用户 10-24 看整片粗剪定的规矩 看得懂的速度），爱心已经说了驯服。
// 祭坛画面 就是干净画面（第 8 句第一张照片「祭坛前递蛋糕」取 照片-祭坛递蛋糕 那一帧，核对/祭坛照片 出它）；歌词、整片后期在段里套。
import React from 'react';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { aspect } from '../../分镜/时间.ts';
import { canvasTone } from '../../画风.ts';
import { MaidAltar, PillarTopItem } from './模型.tsx';
import { You, LiYing } from './人物.tsx';
import { AltarLight } from './光.tsx';
import { AltarTerrain, AltarSky } from './天地.tsx';
import * as params from './参数.ts';
import { events, floatStates, frameToTick, shotAt, type CameraRig } from './编排.ts';

/** 天自己画（天地.tsx），画布透明：只取色调、描边 */
const tone = canvasTone('夏日白天');

/** 递蛋糕：驯服成功的 7 颗爱心 */
const hearts = tamingHearts(params.liYing.feet, params.hearts.宽, params.hearts.高, frameToTick(events.handOffFrame), params.hearts.种子);

/** 画布里的东西（场景坐标，画布已经转好 Z 朝上） */
export const AltarScene: React.FC<{ g: number }> = ({ g }) => (
  <>
    <AltarTerrain />
    <MaidAltar />
    {floatStates(g).map((s) => (s.kind === '光' ? null : <PillarTopItem key={s.名} floatState={s} brightColor={params.lightParams.色} />))}
    <You g={g} />
    <LiYing g={g} />
    <AltarLight g={g} />
    <HeartParticles spawns={hearts} 刻={frameToTick(g)} />
  </>
);

/** 整个画面（整页 1280×720，不含歌词、整片后期），放在 position 不是 static 的容器里；镜头按 编排.ts 的 镜头态。
 *  机：换一个镜头（第 4 句眼睛特写接着往里推，同一个场景、同一片天，接缝上不跳）；g 过了本句也行，她停在 末态.ts 那样 */
export const AltarPicture: React.FC<{ g: number; 机?: CameraRig }> = ({ g, 机: rigOverride }) => {
  const rig = rigOverride ?? shotAt(g);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: aspect.宽, height: aspect.高, overflow: 'hidden' }}>
      <AltarSky cameraRig={rig} 宽={aspect.宽} 高={aspect.高} />
      <ToonCanvas 宽={aspect.宽} 高={aspect.高} cameraRig={{ 种: '透视', ...rig, farPlane: 640 }} tint={tone.tint} outline={tone.outline} style={{ position: 'absolute', left: 0, top: 0 }}>
        <AltarScene g={g} />
      </ToonCanvas>
    </div>
  );
};
