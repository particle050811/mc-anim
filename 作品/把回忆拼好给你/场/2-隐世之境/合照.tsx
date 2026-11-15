// 15 尾（52.94–54.65）的画法，按歌曲帧画，一帧一个整页（1280×720）：
// - 靠肩（52.94 起）：从你的视角硬切到侧面——正交侧剖面（同门这个机位那套画法），朝东看主厅东墙那扇窗，你和她面朝镜头并排站；
//   她还是 2-重逢 末尾那个笑、头往你那边歪着，接着往你肩上靠，53.80 靠好，你的头往她那边偏一点；
// - 2-重逢 的台词气泡「您的手艺，一如既往呢」跟着硬切接过来、照游戏大小挂，她靠好那一帧收（用户 10-25 要气泡多留一会儿）；
// - 合照咔哒（54.65）那一帧切到片尾（2-拼回 第一帧闪白）。
// 截下来的新合照就是咔哒那一帧的靠肩（合照照片：不带歌词、不闪白），片尾原版「选择世界」界面里的新世界图标从它取；合照拍立得 是它套成第 11 句那样的拍立得（片里没露）。
// 用户 10-24 定「看得懂的速度」：原来 52.94 先同机位硬切一镜尾笑、53.80 再切侧面，删成一刀。
// 叠层（歌词）由段传进来，放在整片后期里面。参数见 合照参数.ts，靠到哪、机位见 合照动作.ts。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { makeRigCamera, type OrthoRigParams } from '@engine/三渲二/机位.tsx';
import type { ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { magicalWineFoxExBones, type MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { MaidBubble, bubbleAnchorHeight } from '@库/界面/女仆气泡.tsx';
import { projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片15尾.ts';
import { shadingBySeg } from '../../默认.ts';
import { canvasTone } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { Polaroid } from '../../特效/拍立得.tsx';
import { reunionGlowRegions, HiddenLandReunionBackdrop } from './布景.tsx';
import { eyeContactDoorLight, doorLightTint, backgroundFadeParams } from './对视参数.ts';
import { addRoll, LiYingHoldingFlower, holdNothing } from './对视.tsx';
import { shoulderRig, leanProgress } from './合照动作.ts';
import { groupPhotoShadingScene, groupPhotoStand, groupPhotoAngleDeg, groupPhotoShot, steveScale, youHead, lineBubbleHandedOver, windowView, line11PolaroidStyle, leanShoulder, leanBubble, leanShoulderStart } from './合照参数.ts';
import { lineBubble, laugh } from './重逢参数.ts';
import { NoFade, BackgroundFade } from './褪色.tsx';
import { use当前帧 } from '../../当前帧.ts';

const tone = '归隐之地' as const;
const events = mainCutEvents;

// ---------- 靠肩 ----------

/** 镜头那一边很远的一点：正交镜头朝东，花的正面朝西 */
const cameraDir: V3 = [groupPhotoShot.看[0] - 100, groupPhotoShot.看[1], groupPhotoShot.看[2]];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 她：面朝镜头站在你左边，从 靠肩起势（2-重逢 末尾那个笑、举着花）按 靠肩进度 靠到 靠肩（头、上身往你那边歪，花放下） */
const LiYingLeaning: React.FC<{ 帧: number }> = ({ 帧: frame }) => {
  const k = leanProgress(frame);
  const pose: FigurePose = { ...standPose(groupPhotoStand.liYingPos), yaw: groupPhotoAngleDeg };
  const gaze: [number, number] = [lerp(leanShoulderStart.看[0], leanShoulder.看[0], k), lerp(leanShoulderStart.看[1], leanShoulder.看[1], k)];
  const p: MagicalWineFoxExProps = { pose, stancePose: '站', expression: laugh.expression, 看: gaze, blink: laugh.blink, 秒: frame / fps, rightHand: holdNothing };
  const boneTable = magicalWineFoxExBones(p);
  const overlay = { Head: addRoll(boneTable.Head, lerp(leanShoulderStart.tilt, leanShoulder.tilt, k)), UpBody: addRoll(boneTable.UpBody, lerp(leanShoulderStart.upperBodyTilt, leanShoulder.upperBodyTilt, k)) };
  return <LiYingHoldingFlower p={p} raiseAmount={lerp(1, leanShoulder.flowerRaise, k)} overlaySkeleton={overlay} 眼={cameraDir} />;
};

/** 你：面朝镜头站在她右边，她靠过来时头往她那边偏（你的头） */
const ShoulderYou: React.FC<{ 帧: number }> = ({ 帧: frame }) => {
  // 不传 sec、两臂外摆清零（同 2-收集快乐：原版站着两臂的轻晃会让胳膊斜着）
  const k = leanProgress(frame);
  const pose = { ...stevePose(groupPhotoStand.你, groupPhotoAngleDeg, { headYaw: youHead.headYawOffset * k, headPitch: youHead.pitchDeg * k, scale: steveScale }), armRRoll: 0, armLRoll: 0 };
  return (
    <TexturePixelAlign 锚={pose.loc as V3}>
      <Steve pose={pose} />
    </TexturePixelAlign>
  );
};

const LeanScene: React.FC<{ 帧: number; fade: boolean; outsideView: boolean }> = ({ 帧: frame, fade, outsideView }) => {
  const personNode = (
    <>
      <ShoulderYou 帧={frame} />
      <TexturePixelAlign 锚={groupPhotoStand.liYingPos}>
        <LiYingLeaning 帧={frame} />
      </TexturePixelAlign>
    </>
  );
  const backdrop = (
    <HiddenLandReunionBackdrop 开={1} lighting={false} doorLightParams={eyeContactDoorLight} 秒={frame / fps} outsideView={outsideView}>
      {fade ? <NoFade>{personNode}</NoFade> : personNode}
    </HiddenLandReunionBackdrop>
  );
  return fade ? <BackgroundFade 参数={backgroundFadeParams}>{backdrop}</BackgroundFade> : backdrop;
};

/** 窗景（合照参数 的 窗景，小样）：从东窗外平视往东的一整张透视画，挪上下让地平线落在 地平线y，垫在正交画布底下，只从窗玻璃里透出来 */
const WindowViewLayer: React.FC = () => (
  <ToonCanvas
    宽={aspect.宽}
    高={aspect.高}
    cameraRig={{ 种: '透视', 眼: windowView.眼, 看: windowView.看, fov: windowView.fov }}
    {...canvasTone(tone)}
    tint={doorLightTint}
    style={{ position: 'absolute', left: 0, top: windowView.horizonY - aspect.高 / 2 }}
  >
    <HiddenLandReunionBackdrop 开={1} lighting={false} doorLight={false} />
  </ToonCanvas>
);

/** 她头顶气泡的锚点（页面坐标）：原版脚底 + 女仆气泡锚高 投到靠肩机位的画面上 */
export const leanBubbleAnchor = () => {
  const cam = makeRigCamera(shoulderRig, aspect.宽, aspect.高, canvasDpr(1));
  const p = projectToPage(cam, zUpToThree([groupPhotoStand.liYingPos[0], groupPhotoStand.liYingPos[1], groupPhotoStand.liYingPos[2] + bubbleAnchorHeight()]), aspect.宽, aspect.高);
  return { x: p.x, y: p.y };
};

/** 她头顶的气泡（正交）：「(✿◠‿◠)」倍数 = N（核对对比用），接过来的台词气泡照游戏大小（台词气泡接过来） */
const LeanBubbleLayer: React.FC<{ 字: string; 缩放: number }> = ({ 字: text, 缩放: scale }) => (
  <MaidBubble 锚={leanBubbleAnchor()} 缩放={scale} anchorAlign={scale} 文字={text} 字体={pixelFont} />
);

export type LeanPictureProps = {
  /** 歌曲帧（她靠到哪、她的呼吸、颗粒的种子） */
  帧: number;
  /** 叠在 3D 和气泡上面、整片后期里面的 2D（歌词） */
  叠层?: React.ReactNode;
  /** 她头顶的「(✿◠‿◠)」，不给 = 合照参数 的 靠肩气泡 */
  showBubble?: boolean;
  /** 她头顶挂接过来的台词气泡（片里 第15句台词收 以前），不给 = 不挂 */
  台词?: boolean;
  /** 背景褪色（同 2-重逢 那一镜），核对比较用；默认不褪 */
  fade?: boolean;
  /** 换一个机位（核对里看大环境用），不给 = 靠肩机位 */
  cameraRig?: OrthoRigParams;
  /** 窗里补樱花林（合照参数 的 窗景，小样），默认不补（窗里只有天，同片里） */
  windowView?: boolean;
  withPost?: boolean;
  /** 光影（默认.ts 的 光影段['2-合照']，照片跟着片里走）；null = 不开 */
  shading?: ShadingOptions | null;
};

/** 靠肩这一镜的一整帧（1280×720 页面），自己铺满 */
export const LeanPicture: React.FC<LeanPictureProps> = ({ 帧: frame, 叠层: overlay, showBubble = leanBubble, 台词: showLine = false, fade = false, cameraRig = shoulderRig, windowView: addWindowView = false, withPost = true, shading = shadingBySeg['2-合照'] ?? null }) => {
  const t = palette[tone];
  const sceneTone = canvasTone(tone);
  return (
    <FilmPost grade={withPost ? t.grade : null} 种子={frame}>
      {addWindowView && <WindowViewLayer />}
      <ToonCanvas
        宽={aspect.宽}
        高={aspect.高}
        cameraRig={cameraRig}
        {...sceneTone}
        天={addWindowView ? undefined : sceneTone.天}
        tint={doorLightTint}
        glowRegions={reunionGlowRegions}
        shading={shading}
        shadingScene={groupPhotoShadingScene}
      >
        <LeanScene 帧={frame} fade={fade} outsideView={!addWindowView} />
      </ToonCanvas>
      {showBubble && <LeanBubbleLayer 字={laugh.bubbleText} 缩放={groupPhotoShot.N} />}
      {showLine && <LeanBubbleLayer 字={lineBubble.字} 缩放={lineBubbleHandedOver.缩放} />}
      {overlay}
    </FilmPost>
  );
};

// ---------- 新合照 ----------

/** 截下来的新合照（干净帧）：咔哒那一帧（分镜 照片-合照）的靠肩，不带聊天、歌词，不闪白；气泡照片里的样子同片里。
 *  片尾原版「选择世界」界面里的新世界图标（64×64）取这一帧画面正中的正方形，两个人都在正方形里 */
export const GroupPhotoPrint: React.FC<{ withPost?: boolean; showBubble?: boolean }> = ({ withPost = true, showBubble }) => (
  <LeanPicture 帧={events.photoGroupShot.帧} withPost={withPost} showBubble={showBubble} />
);

/** 拍立得缩小、转斜、字淡入都走完的那一帧（相对定格帧，按秒算完取整到帧） */
const polaroidSettleFrame = Math.ceil(Math.max(line11PolaroidStyle.whiteFlashSec, line11PolaroidStyle.shrinkSec, line11PolaroidStyle.textDelaySec + line11PolaroidStyle.textFadeInSec) * fps);

/** 新合照套成第 11 句那样的拍立得：特效/拍立得.tsx 停稳以后的样子（斜放、三边窄白边下边宽、投影、纸纹底），样式 = 合照参数 的 第11句拍立得样式，整页。
 *  片里没露（见 合照参数 的 第11句拍立得样式）；核对、以后要露这张照片的地方用。字：下白边那一行，不给不写。
 *  定格帧取「这一帧往前 停稳帧」，拍立得 每一帧都画成停稳的样子；坑：不能用 remotion 的 Freeze 把它冻在停稳帧上，
 *  里面的 ThreeCanvas 在 renderStill 单出这一帧时一直等不到放行（anim still 超时），renderMedia 整段渲却没事 */
export const GroupPhotoPolaroid: React.FC<{ withPost?: boolean; 字?: string }> = ({ withPost = true, 字: text }) => {
  const f = use当前帧();
  return (
    <Polaroid freezeFrame={f - polaroidSettleFrame} 样式={line11PolaroidStyle} 字={text}>
      {() => <GroupPhotoPrint withPost={withPost} />}
    </Polaroid>
  );
};

// ---------- 整段 ----------

/** 15 尾一整帧：靠肩，第15句台词收 以前挂着接过来的台词气泡（叠层 放在整片后期里面） */
export const GroupPhotoPicture: React.FC<{ 帧: number; 叠层?: React.ReactNode }> = ({ 帧: frame, 叠层: overlay }) => (
  <LeanPicture 帧={frame} 叠层={overlay} 台词={frame < events.speechBubbleOut.帧} />
);
