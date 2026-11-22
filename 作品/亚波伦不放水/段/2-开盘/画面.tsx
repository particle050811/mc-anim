// 第 2 幕 偷袭的画面（用户 11-11 重排）：走位、她的姿势、盘在 场/1-台地/编排-开盘.ts，慢放的快慢在 场/1-台地/开盘拍.ts，这里换钟、摆镜头。
// 画面的钟是段内片秒，人、盘、烟、火都走世界秒（世界秒(片秒)）：慢放里一起慢下来，镜头照片秒走（绕她转的那一镜在慢放里照常速度转）。
// 用户 11-11「亚波伦被偷袭第一次瞬移走 第二次就迅速拉升 史蒂夫砍不到 飞行的时候伸出法杖 圆环缓缓张开，环绕镜头慢放（这几个动作同时发生）」：
// 第二次冲他从她脚底下冲过去那一下起慢放，她拉升、一甩身伸杖、杖尖张盘、镜头在世界里绕她转 180 度（用户 11-11 看八版「我要环绕 180 度诶」，绕拍.ts），四件事在同一镜里；慢放完她刹在祭坛上空、盘张开、杖指他。
// 拍他都从前方、侧前方（他脑后斜挂着晋升之环，从背后拍挡脸，11-11 看片意见），广角跟着动作，不震屏。镜头都是 Agent 摆的，用户没看过。
import React from 'react';
import { smoothstep01 } from '@engine/core/数学.ts';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { withCastingHem } from '../../角色/空中施法袍摆.ts';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { guiScale, YaBoLunHealthBar } from '../../界面/战斗界面.tsx';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans } from '../../特效/安息仪式时序.ts';
import { TeleportSmoke } from '../../特效/瞬移烟.tsx';
import { altar } from '../../场/1-台地/布局.ts';
import { TerraceCanvas, aspect } from '../../场/1-台地/台地场.tsx';
import { beats } from '../../场/1-台地/开盘时刻.ts';
import { toWorldSec, toClipSec } from '../../场/1-台地/开盘拍.ts';
import timeline from '../../场/1-台地/时间线.ts';
import { steveStateAt, actStart, perform, teleports, act2WheelParams, wheelPlace, cellsPerPixel } from '../../场/1-台地/编排-开盘.ts';
import seg from './段.ts';
import { actTwoShotAt } from './机位.ts';
import soundUrl from './声音地址.生成.ts';

if (Math.abs(toClipSec(beats.dashSecondSec) - beats.dashSecondSec) > 1e-9) throw new Error('2-开盘：慢放要在第二次冲之后才起');

export default definePicture(seg, soundUrl, () => {
  const { sec: sec } = useSeg(seg);
  const w = toWorldSec(sec);
  const t = actStart + w;
  const yaBoLun = perform.在(t);
  // 飞的时候两腿一前一后错开（角色/动作/亚波伦演出.ts 的 飞行、升空、升指），腿从袍子里戳出来的地方袍摆让开（同 6-结算舞）；腿收着时不改
  const yaBoLunPose = withCastingHem(yaBoLun.props);
  const { cameraRig } = actTwoShotAt(sec);
  const disc = act2WheelParams(t);
  const wand = disc && perform.杖(t);
  return (
    <TerraceCanvas ritualStructure cameraRig={cameraRig} ui={<YaBoLunHealthBar width={aspect.width} s={guiScale} healthRatio={1} />}>
      {/* 仪式做完后留在台地上的结构：方案的 总秒 之后就是静态的结构和火 */}
      <group position={altar}>
        <RestRitualPerformance sec={timeline.events.summonDone.sec - timeline.events.placeRing.sec + w} plan={summonPlans.短} />
      </group>
      <GirlYaBoLun {...yaBoLun.props} bonePose={yaBoLunPose} holdWand />
      {disc && wand && <>
        <pointLight position={wand.tip} color="#ffdfc2" intensity={6 * smoothstep01(disc.刻 / 5) * smoothstep01((beats.endSec - w) / 0.18)} distance={3.5} decay={2} />
        <WandTipWheel 杖={wand} {...wheelPlace} params={disc} cellsPerPixel={cellsPerPixel} />
      </>}
      <TeleportSmoke teleports={teleports} sec={t} />
      <ReactingSteve state={steveStateAt(t, w)} />
    </TerraceCanvas>
  );
});
