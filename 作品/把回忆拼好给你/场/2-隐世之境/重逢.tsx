// 第 15 句隐世之境这一镜（49.54–52.94），你的视角一镜到底，按歌曲帧画，一帧一个整页（1280×720）：
// - 樱花风散开那一拍你已经站在西门门洞里（门在风里推开了，开门声落在这一拍），花瓣从她的背影那块先吹开（风散心），
//   她原来背对着门、拿着月铃兰看着窗外，门一响就转过来（风散开时已经在转），49.96 正好看着你：封面就是这一刻（对视.tsx 同一套机位、她、门光，封面另挂气泡和聊天行）；
// - 对视停一下，手里换上蛋糕从画面下沿升上来、右键、驯服（爱心、蛋糕被吃掉，手降下去），她笑了、往你那边歪头，头上「啵」地冒出台词气泡「您的手艺，一如既往呢」，留到段尾、接进 15 尾。
// - 整镜眼睛不动，视角慢慢收（对视以后越收越慢），看点从封面帧的缓缓挪到她脸上（推向她的脸），气泡一直在画里，段尾硬切进 15 尾。
// 用户 10-24 定「看得懂的速度」：删了进门、蹲下、左下聊天栏（聊天栏只在风散开那几帧跟着淡掉）。
// 台词气泡 10-24 按「文字一时只走一路」删过，用户 10-25 定放回：「你的手艺一如既往 为什么这里不放上去 虽然经典 但不过时啊」，
// 又说「唱到段尾插不进气泡 不能提前一点放吗？」：驯服提早到第 120 拍，气泡和底部歌词同时在（两路字是用户要的）。
// 三渲二透视（平涂、不抗锯齿、不描边）、归隐之地的调子、门光色调，外面整片后期；叠层（樱花风、歌词）由段传进来，放在整片后期里面。
// 手画在另一张三渲二画布上（原版手那一遍：竖直视角固定 70、不跟视角设置和推镜走），同样平涂。
import type React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import type { ShadingSceneParams } from '@engine/三渲二/光影/预设.ts';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { HAND_FOV, HAND_NEAR, FirstPersonHand, handTimeline, type HandScript } from '@库/角色/第一人称.tsx';
import { SteveFirstPersonArm } from '@库/角色/史蒂夫第一人称.tsx';
import { magicalWineFoxExBones, type MagicalWineFoxExProps } from '@库/角色/魔法酒狐新动作组件.tsx';
import { MaidBubble } from '@库/界面/女仆气泡.tsx';
import { makePerspectiveCamera, projectToPage, zUpToThree } from '@库/界面/投影.ts';
import { blockDisplay, CakeBlock } from '@库/物品/蛋糕方块.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { fps, aspect } from '../../分镜/时间.ts';
import { events as lyricEvents } from '../../分镜/歌词.ts';
import { events as mainCutLine15Events } from '../../分镜/正片第15句.ts';
import { canvasTone } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { pixelFont } from '../../界面/像素字.ts';
import { liYingLookAt, reunionGlowRegions, HiddenLandReunionBackdrop } from './布景.tsx';
import { liYing } from './参数.ts';
import { eyeContactBubble, eyeContactDoorLight, backgroundFadeParams, doorLightTint } from './对视参数.ts';
import { addRoll, LiYingHoldingFlower, holdNothing } from './对视.tsx';
import { lineBubble, backTurned, laugh, windScatterHeight, tameHeartSeed } from './重逢参数.ts';
import { linePop, turnBackProgress, hasLaughed, smileProgress, reunionRig } from './重逢动作.ts';
import { NoFade, BackgroundFade } from './褪色.tsx';

const mainCutEvents = { ...lyricEvents, ...mainCutLine15Events };

const tone = '归隐之地' as const;
const events = mainCutEvents;

/** 她：回头之前背对着门（背身），回头时头先转、身子跟着转，对视那一帧起同 对视.tsx 的 对视她（站、侧身、头转过来看你、认出你、举着月铃兰），
 *  头跟着你的眼睛走。花跟着身子转一起举起来。笑了以后换成微笑、闭眼，头在看着你的上面往你那边歪（笑） */
const LiYingReunion: React.FC<{ sec: number; 眼: V3 }> = ({ sec: sec, 眼: eye }) => {
  const { bodyTurn: bodyProgress, 头: headProgress } = turnBackProgress(sec);
  const pose: FigurePose = { ...standPose(liYing.feet), yaw: bodyProgress >= 1 ? liYing.bodyFacing : backTurned.facing + (liYing.bodyFacing - backTurned.facing) * bodyProgress };
  const endLook = liYingLookAt(eye, pose);
  const smiling = hasLaughed(sec);
  const tiltProgress = smileProgress(sec);
  const p: MagicalWineFoxExProps = {
    pose,
    stancePose: '站',
    expression: smiling ? laugh.expression : bodyProgress >= 0.5 ? '认出你' : backTurned.expression,
    看: headProgress >= 1 ? [endLook[0] + laugh.lift * tiltProgress, endLook[1]] : [backTurned.看[0] + (endLook[0] - backTurned.看[0]) * headProgress, backTurned.看[1] + (endLook[1] - backTurned.看[1]) * headProgress],
    blink: smiling ? laugh.blink : 0,
    sec: sec,
    rightHand: holdNothing,
  };
  const overlay = tiltProgress > 0 ? { Head: addRoll(magicalWineFoxExBones(p).Head, laugh.tilt * tiltProgress) } : undefined;
  return <LiYingHoldingFlower p={p} raiseAmount={bodyProgress} start={backTurned.holdFlower} overlaySkeleton={overlay} />;
};

/** 驯服的 7 颗爱心（碰撞箱 0.6 × 1.5，同 1-一如既往） */
const hearts = tamingHearts(liYing.feet, 0.6, 1.5, 0, tameHeartSeed);
/** 段内帧那一套换成歌曲帧：从某个事件那一帧起数的原版刻 */
const elapsedTick = (frame: number, startFrame: number) => ((frame - startFrame) / fps) * 20;

/** 三渲二画布里的东西：布景、门、门光同封面帧（隐世之境重逢布景，西门开着、不放灯、门光不撒浮尘，背景褪色） */
const Scene: React.FC<{ frame: number; sec: number; 眼: V3 }> = ({ frame: frame, sec: sec, 眼: eye }) => (
  <BackgroundFade params={backgroundFadeParams}>
    <HiddenLandReunionBackdrop 眼={eye} sec={sec} lighting={false} doorLightParams={eyeContactDoorLight}>
      <NoFade>
        <LiYingReunion sec={sec} 眼={eye} />
        <HeartParticles spawns={hearts} 刻={elapsedTick(frame, events.tameAgain.frame)} />
      </NoFade>
    </HiddenLandReunionBackdrop>
  </BackgroundFade>
);

// 手：右键在第 0 刻；换上蛋糕在右键前 8 刻（分镜的 换上蛋糕）；第 1 刻蛋糕被吃掉，手降下去（同 1-一如既往）。
// 手里是立体的蛋糕方块（用户 11-02 要；1-一如既往 还是原版的平面图），拿法从拿方块的第一人称拿法往上抬半格：
// 原版拿法里半格高的蛋糕贴在方块格子底下，几乎全在画面下沿外（预览/1102-1722-立体蛋糕 02～04 的「中原版拿法」）；
// 抬半格露出顶面和侧面，像拿着草方块的上半截。成片候选先用这版，等用户在预览里选；选原版拿法就把 蛋糕拿法 换回 方块显示.firstperson_righthand。
// 只画拿着蛋糕的那一截：对视那一帧不画手（对视.tsx 文件头：空手的右臂会压在她身上），蛋糕吃掉以后空手的右臂也不升上来（不压她的笑脸，前后一致）
const cakeSwapTick = Math.round((events.switchToCake.sec - events.cakeRightClick.sec) * 20);
/** 显示变换的 translation 按 1/16 格、在缩放前：模型里抬 8 像素 × 缩放 0.4 = 3.2。
 *  转 46° 不是原版的 45°：正好 45° 时两个侧面的法线和世界轴夹角相等，平涂按法线最大分量挑面明暗（engine/三渲二/平涂.tsx）挑不定，
 *  片元里现算的法线有一点误差，一个面上逐像素在 0.8、0.6 两档间乱跳，成了满面竖条噪点；偏 1° 朝镜头的左面稳定取 0.8、右面 0.6 */
const cakeHoldDisplay = { ...blockDisplay.firstperson_righthand, rotation: [0, 46, 0], translation: [0, 3.2, 0] };
const handScript: HandScript = { start: null, swings: [0], changes: [{ tick: cakeSwapTick, to: '蛋糕' }, { tick: 1, to: null }] };

const Hand: React.FC<{ frame: number }> = ({ frame: frame }) => {
  const h = handTimeline(elapsedTick(frame, events.cakeRightClick.frame), handScript);
  if (h.item !== '蛋糕') return null;
  // 手那一遍的视图坐标（Y 朝上、−Z 朝前）放进三渲二画布 Z 朝上的场景里：画布的看点朝 +y（北）就是视图的 −Z，再把画布里那层 −90° 转回来
  return (
    <ToonCanvas
      width={aspect.width}
      height={aspect.height}
      cameraRig={{ kind: '透视', 眼: [0, 0, 0], 看: [0, 1, 0], fov: HAND_FOV, near: HAND_NEAR, farPlane: 16 }}
      tint={doorLightTint}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <group rotation={[Math.PI / 2, 0, 0]}>
        <FirstPersonHand held={<CakeBlock />} display={cakeHoldDisplay} arm={<SteveFirstPersonArm />} swing={h.swing} equip={h.equip} />
      </group>
    </ToonCanvas>
  );
};

export type PerspectiveRig = { 眼: V3; 看: V3; fov: number };

/** 她头顶的气泡锚点（页面坐标）：这一刻的机位下，帽顶（对视气泡.锚高）投到画面上的位置 */
export const reunionBubbleAnchor = (rig: PerspectiveRig) => {
  const cam = makePerspectiveCamera({ 眼: zUpToThree(rig.眼), 看: zUpToThree(rig.看), fov: rig.fov, width: aspect.width, height: aspect.height });
  const p = projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + eyeContactBubble.anchorHeight]), aspect.width, aspect.height);
  return { x: p.x, y: p.y };
};

/** 她头顶的气泡：挂在帽顶。片里驯服起是台词气泡（重逢参数.ts 的 台词气泡，12 倍、啵地弹出）；
 *  核对出 B 站多封面那张给了别的字，倍数同封面「片」那一版（16） */
const ReunionBubble: React.FC<{ machine: PerspectiveRig; char: string; scale: number; anchorAlign: number; popProgress?: number }> = ({ machine: rig, char: text, scale: scale, anchorAlign, popProgress = 1 }) => (
  <MaidBubble 锚={reunionBubbleAnchor(rig)} scale={scale} anchorAlign={anchorAlign} 文字={text} 字体={pixelFont} popProgress={popProgress} />
);

/** 樱花风从这里散开（页面坐标）：风散开那一帧的机位下，她脚底以上 风散心高 那一点在画面上的位置。花瓣先从她的背影那块吹开 */
export const windScatterCenter = (() => {
  const rig = reunionRig(events.windClears.frame / fps);
  const cam = makePerspectiveCamera({ 眼: zUpToThree(rig.眼), 看: zUpToThree(rig.看), fov: rig.fov, width: aspect.width, height: aspect.height });
  const p = projectToPage(cam, zUpToThree([liYing.feet[0], liYing.feet[1], liYing.feet[2] + windScatterHeight]), aspect.width, aspect.height);
  return { x: p.x, y: p.y };
})();

export type ReunionPictureProps = {
  /** 歌曲帧 */
  frame: number;
  /** 她头顶换挂一个气泡、写这一句（核对出 B 站多封面用，封面的 16 倍）；不给 = 片里的样子：驯服起挂台词气泡 */
  bubbleText?: string;
  /** 换一个机位（核对出 B 站多封面第三张用封面帧的机位），不给 = 这一刻的 重逢机位 */
  cameraRig?: PerspectiveRig;
  /** 叠在 3D 和气泡上面、整片后期里面的 2D（樱花风、歌词） */
  overlay?: React.ReactNode;
  withPost?: boolean;
  /** 整片后期颗粒的种子，不给 = 当前帧号（核对一帧一个视图用）；段里给歌曲帧 */
  seed?: number;
  /** 开光影时交给屋里那张画布的事实（手那张不给：手的镜头不动，太阳本来就不转） */
  shadingScene?: ShadingSceneParams;
};

/** 一整帧（1280×720 页面），自己铺满 */
export const ReunionPicture: React.FC<ReunionPictureProps> = ({ frame: frame, bubbleText: bubbleText, cameraRig, overlay: overlay, withPost = true, seed: seed, shadingScene }) => {
  const sec = frame / fps;
  const t = palette[tone];
  const rig = cameraRig ? { kind: '透视' as const, ...cameraRig } : reunionRig(sec);
  return (
    <FilmPost grade={withPost ? t.grade : null} seed={seed}>
      <ToonCanvas width={aspect.width} height={aspect.height} cameraRig={rig} {...canvasTone(tone)} tint={doorLightTint} glowRegions={reunionGlowRegions} shadingScene={shadingScene}>
        <Scene frame={frame} sec={sec} 眼={rig.眼} />
      </ToonCanvas>
      <Hand frame={frame} />
      {bubbleText !== undefined ? (
        <ReunionBubble machine={rig} char={bubbleText} scale={eyeContactBubble.scale.片} anchorAlign={eyeContactBubble.scale.片} />
      ) : (
        linePop(frame) > 0 && <ReunionBubble machine={rig} char={lineBubble.char} scale={lineBubble.scale} anchorAlign={lineBubble.anchorAlign} popProgress={linePop(frame)} />
      )}
      {overlay}
    </FilmPost>
  );
};
