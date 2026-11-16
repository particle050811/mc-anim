// 第 15 句 49.96「对视」这一刻的封面（封面帧）画法：三渲二透视（平涂、不抗锯齿、不描边）、归隐之地那套调子、整片后期，
// 上面叠她头顶的车万女仆气泡和左下的聊天（片那一版是原版位置的聊天栏，B站封面、竖版是放大的那行黄字）。参数见 对视参数.ts。
// 机位、她同片里 2-重逢 的这一帧，片里这一帧不挂气泡、不留聊天行（重逢.tsx），封面上两样都有
// （封面定为「加入了游戏」：用户 10-24 定，预览/1024-0233-正片三版三稿-歌词与画面/00-说明.md）。
// B站封面、竖版的 C 位是她头上的气泡「您的手艺，一如既往呢」，「Steve加入了游戏」那行黄字在左下角（用户 10-25 定：「加入游戏放左下角 然后 C 位应该是您的手艺 一如既往那一句话」）。
// 气泡这一镜不照游戏大小挂：底边压在她帽顶、按各画幅定的偶数倍画，封面上盒子左右居中（对视参数.ts 的 对视气泡）。
// 你的手不画：原版空手会在右下画右臂、拿着东西会画东西，这一帧的右下正好是她的身子和花，画了就压在她身上；片里换上蛋糕时手才从画面下沿升上来。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import {
  MagicalWineFoxEx,
  magicalWineFoxBoneAt,
  magicalWineFoxExBones,
  type HeldItem,
  type MagicalWineFoxExProps,
} from '@库/角色/魔法酒狐新动作组件.tsx';
import { MaidBubble, maidBubbleGeom } from '@库/界面/女仆气泡.tsx';
import { filmScale } from '@库/界面/像素字表.ts';
import { makePerspectiveCamera, projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { PixelChatBar } from '@库/界面/像素聊天栏.tsx';
import { canvasTone } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { eyePos } from '../../地点/机位.tsx';
import { liYingLookAt, HiddenLandReunionBackdrop, reunionGlowRegions } from './布景.tsx';
import { CoverChatLine } from './叠层.tsx';
import { BrightMoonLily } from './铃兰.tsx';
import { NoFade, BackgroundFade } from './褪色.tsx';
import { liYing } from './参数.ts';
import {
  eyeContactFraming,
  eyeContactBubble,
  eyeContactSec,
  eyeContactFoot,
  eyeContactFov,
  eyeContactDoorLight,
  coverBigText,
  backgroundFadeParams,
  movieChatWidth,
  movieChatScale,
  holdFlower,
  hatLift,
  pupilShift,
  browForward,
  chatAgeTick,
  doorLightTint,
  type EyeContactVersion,
} from './对视参数.ts';

const tone = '归隐之地' as const;
const yellow = '#FFFF55'; // ChatFormatting.YELLOW：加入、退出游戏

/** 你的眼睛（原版眼高 1.62） */
export const eyeContactEye: V3 = eyePos(eyeContactFoot);

/** 这一帧的透视机位（形状同 engine/三渲二/机位.tsx 的 透视机位参数） */
export const eyeContactRig = (edition: EyeContactVersion) => ({ kind: '透视' as const, 眼: eyeContactEye, 看: eyeContactFraming[edition].看, fov: eyeContactFov });

/** 她这一帧的姿势（脚底、身子朝向） */
export const eyeContactPose: FigurePose = { ...standPose(liYing.feet), yaw: liYing.bodyFacing };

/** 她这一帧的样子：站着（TLM 待机站姿）、身子侧着、头转过来看你（夹在 头转范围 上限）、认出你、睁着眼，右手举着月铃兰（拿花、铃兰.tsx） */
export const LiYingEyeContact: React.FC<{ sec?: number }> = ({ sec: sec = eyeContactSec }) => {
  const pose = eyeContactPose;
  const p: MagicalWineFoxExProps = { pose, stancePose: '站', expression: '认出你', 看: liYingLookAt(eyeContactEye, pose), blink: 0, sec: sec, rightHand: holdNothing };
  return <LiYingHoldingFlower p={p} />;
};

/** 骨骼的转角上再加一个滚转（度）：她笑、靠肩时歪头（重逢.tsx、合照.tsx） */
export const addRoll = (b: BonePose | undefined, roll: number): BonePose => {
  const [x = 0, y = 0, z = 0] = b?.rot ?? [];
  return { ...b, rot: [x, y, z + roll] };
};

/** 组件按「右手拿着东西」摆手，东西本身不挂在握持点上（花另画，见 铃兰.tsx） */
export const holdNothing: HeldItem = { item: null, facing: '原样' };

/** 拿花的手在 举 = 0 时的样子（大臂、前臂、手各再转多少度，同 拿花），举起来时从这里转到 拿花；不给就是组件原样（右手胸前） */
export type HoldFlowerStart = { upperArm: readonly number[]; foreArm: readonly number[]; 手: readonly number[] };

/** 她和她手里的花：骨骼照 对视她骨骼 改（举：手举起来多少，0～1；起：举 = 0 时手在哪），花的握点放在改完以后的右手握持点上，正面朝 眼（不给 = 对视眼）。
 *  叠骨骼：改完以后再整条盖上去的骨骼（她笑、靠肩要歪头） */
export const LiYingHoldingFlower: React.FC<{ p: MagicalWineFoxExProps; raiseAmount?: number; start?: HoldFlowerStart; overlaySkeleton?: Record<string, BonePose>; 眼?: V3 }> = ({
  p,
  raiseAmount = 1,
  start: startPose,
  overlaySkeleton,
  眼: eye = eyeContactEye,
}) => {
  const skeletonWithOverlay = overlaySkeleton ? { ...eyeContactSkeleton(p, raiseAmount, startPose), ...overlaySkeleton } : eyeContactSkeleton(p, raiseAmount, startPose);
  const handAnchor = magicalWineFoxBoneAt(p.pose, { ...magicalWineFoxExBones(p), ...skeletonWithOverlay }, 'RightHandLocator');
  return (
    <>
      <MagicalWineFoxEx {...p} skeleton={skeletonWithOverlay} />
      <BrightMoonLily 在={handAnchor} 眼={eye} tilt={holdFlower.tilt} />
    </>
  );
};

/** 对视那一帧起她在组件摆好的姿势上再改的几根骨骼（重逢.tsx 回头以后也用）：
 *  拿花（拿花：大臂、前臂、手）；瞳孔放回眼睛中间（瞳孔挪）、眉毛挪到刘海前面（眉毛往前），认出你才挪；帽子抬高（帽子抬） */
export const eyeContactSkeleton = (p: MagicalWineFoxExProps, raiseAmount = 1, startPose?: HoldFlowerStart): Record<string, BonePose> => {
  const boneTable = magicalWineFoxExBones(p);
  const addBone = (b: string, rot: readonly number[], pos: readonly number[] = [0, 0, 0]): BonePose => {
    const [x = 0, y = 0, z = 0] = boneTable[b]?.rot ?? [];
    const [px = 0, py = 0, pz = 0] = boneTable[b]?.pos ?? [];
    return { ...boneTable[b], rot: [x + rot[0]!, y + rot[1]!, z + rot[2]!], pos: [px + pos[0]!, py + pos[1]!, pz + pos[2]!] };
  };
  const recognized = p.expression === '认出你';
  const lerpVec = (b: readonly number[], a: readonly number[] = [0, 0, 0]) => b.map((v, i) => a[i]! * (1 - raiseAmount) + v * raiseAmount);
  return {
    RightArm: addBone('RightArm', lerpVec(holdFlower.upperArm, startPose?.upperArm)),
    RightForeArm: addBone('RightForeArm', lerpVec(holdFlower.foreArm, startPose?.foreArm)),
    RightHand: addBone('RightHand', lerpVec(holdFlower.手, startPose?.手)),
    witchcap: addBone('witchcap', [0, 0, 0], [0, hatLift, 0]),
    ...(recognized
      ? {
          // pos 的 x 是模型里的 x（她右手边是负），右眼在负的那边
          ysmGlowRightEyePublic: addBone('ysmGlowRightEyePublic', [0, 0, 0], [-pupilShift.outward, -pupilShift.下, 0]),
          ysmGlowLeftEyePublic: addBone('ysmGlowLeftEyePublic', [0, 0, 0], [pupilShift.outward, -pupilShift.下, 0]),
          EyeBrow: addBone('EyeBrow', [0, 0, 0], [0, 0, -browForward]),
        }
      : {}),
  };
};

/** 三渲二画布里的东西（网格本地坐标，画布已经转好 Z 朝上）：布景不放灯（平涂不吃灯）、褪色（背景褪色参数），她不褪 */
export const EyeContactScene: React.FC<{ sec?: number }> = ({ sec: sec = eyeContactSec }) => (
  <BackgroundFade params={backgroundFadeParams}>
    <HiddenLandReunionBackdrop 眼={eyeContactEye} sec={sec} lighting={false} doorLightParams={eyeContactDoorLight}>
      <NoFade>
        <LiYingEyeContact sec={sec} />
      </NoFade>
    </HiddenLandReunionBackdrop>
  </BackgroundFade>
);

/** 气泡挂在哪（页面像素）：高是她脚底正上方 对视气泡.锚高 那一点按这一版的机位投到画面上的高；
 *  横着，对视气泡.居中 的那几版（封面）挪到让盒子（不算尾巴）左右居中在画面正中，别的就在那一点正上方 */
export const eyeContactBubbleAnchor = (edition: EyeContactVersion) => {
  const { width: width, height: height, 看: lookAt } = eyeContactFraming[edition];
  const cam = makePerspectiveCamera({ 眼: zUpToThree(eyeContactEye), 看: zUpToThree(lookAt), fov: eyeContactFov, width: width, height: height });
  const p = projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + eyeContactBubble.anchorHeight]), width, height);
  if (!eyeContactBubble.centered[edition]) return { x: p.x, y: p.y };
  const bottomBox = maidBubbleGeom(eyeContactBubble.char[edition], pixelFont, eyeContactBubble.位置[edition]).bottomBox;
  return { x: width / 2 - ((bottomBox.x + bottomBox.width / 2) * eyeContactBubble.scale[edition]) / filmScale, y: p.y };
};

/** 她头顶的气泡：按 对视气泡 里这一版的字、缩放、摆法画，锚点吸到一个气泡像素的格子上（从页面左上角数） */
const EyeContactBubble: React.FC<{ 版: EyeContactVersion }> = ({ 版: edition }) => {
  const s = eyeContactBubble.scale[edition];
  return <MaidBubble 锚={eyeContactBubbleAnchor(edition)} scale={s} anchorAlign={s} 文字={eyeContactBubble.char[edition]} 位置={eyeContactBubble.位置[edition]} 字体={pixelFont} />;
};

/**
 * 一整帧（一个画幅）：宽高是 对视取景 里这一版的页面尺寸，放在 position 不是 static 的容器里，自己贴左上角。
 * 后期、大字、气泡、聊天 只在核对里换（比较用）：大字 换掉封面、竖版那行大字的布局；气泡、聊天 关掉就是片里这一帧的样子。
 */
export const EyeContactPicture: React.FC<{
  版: EyeContactVersion;
  withPost?: boolean;
  sec?: number;
  bigText?: { scale: number; left: number; 下: number };
  showBubble?: boolean;
  showChat?: boolean;
}> = ({ 版: edition, withPost = true, sec: sec = eyeContactSec, bigText, showBubble: showBubble = true, showChat = true }) => {
  const { width: width, height: height } = eyeContactFraming[edition];
  const t = palette[tone];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, overflow: 'hidden' }}>
      <FilmPost grade={withPost ? t.grade : null}>
        <ToonCanvas width={width} height={height} cameraRig={eyeContactRig(edition)} {...canvasTone(tone)} tint={doorLightTint} glowRegions={reunionGlowRegions}>
          <EyeContactScene sec={sec} />
        </ToonCanvas>
        {showBubble && <EyeContactBubble 版={edition} />}
        {!showChat ? null : edition === '片' ? (
          <PixelChatBar
            lines={[{ text: 'Steve加入了游戏', color: yellow, startTick: 0 }]}
            刻={chatAgeTick}
            scale={movieChatScale}
            字体={pixelFont}
            width={width}
            height={height}
            chatWidth={movieChatWidth}
          />
        ) : (
          <CoverChatLine layout={bigText ?? coverBigText[edition]} verticalBar={false} />
        )}
      </FilmPost>
    </div>
  );
};
