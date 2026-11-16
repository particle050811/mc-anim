// 第 13 句「我们的爱总有时差」分屏的一帧（1280×720 整页）：左屏服务器（门这个机位的半屏，身后的坡上她种的樱花树一棵棵冒出来），右屏现实的课桌（用户 10-24「主角的画面放在右边更合适」），
// 中间一条分屏线，外面盖整片后期。两屏同一种画法（MC 方块和像素物件、三渲二平涂描边），像素一样大（分屏参数.ts 的 分屏N），网格连着。
// 按歌曲帧画（分屏参数.ts 的 分屏态）：右边一个不动的镜头，墙上整张课表（不亮格：用户 11-03 问「第一第二节课那个语数为什么要？ 特别标出来」，三稿 Agent 加的，去掉），一阵风把桌上的倒计时日历一页页吹走、越吹越快，停在 1；
// 左边身后的坡从光秃秃起，樱花树跟着日历一棵棵冒出来、越冒越快，停在 1 时长满，门口那棵树苗同一拍长成整棵（用户 10-25「应该是樱花树越来越多才对」，分屏参数.ts 的 林生长、门口长成帧）；
// 她只换一次姿势（坐在门口 → 蹲到树苗旁，规矩「看得懂的速度」一个动作至少 1 秒）。天上不转太阳月亮（用户 10-24「时差 日月生落很敷衍 别做了」）。
// 调色两屏各用自己的（右 现实 冷；左 夏日白天，只往 褪色 插一点：主会话 10-24 美术定稿「现实冷，服务器保持夏天的暖」）；颗粒、暗角整页只盖一层，接缝藏在这层里（05-画风 原则 1、4）。
// 用法：段里 <时差分屏 帧={歌曲帧} 接入 种子={歌曲帧} 叠层={歌词} />；核对时 描边、后期 可以关掉比。
// 接入（段 2-时差 开头）：两屏从右边滑进来停稳（分屏参数.ts 的 成形偏于），只在停稳以前换画法；停稳以后和不给 接入 时一模一样。
import type React from 'react';
import { useMemo } from 'react';
import type { BonePose } from '@engine/model/基岩模型.tsx';
import { BlockAssembly, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { DISPLAY } from '@engine/model/物品贴图.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { Outline as OutlineGroup } from '@engine/三渲二/描边.tsx';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { FilmPost } from '@engine/三渲二/整片后期.tsx';
import type { ShadingOptions } from '@engine/三渲二/光影/预设.ts';
import type { Grade } from '@engine/三渲二/调子.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import type { MagicalWineFoxExPose } from '@库/角色/魔法酒狐新动作.ts';
import { fps, aspect } from '../../分镜/时间.ts';
import { gridOrigin, entrance } from '../../地点/门口小木屋.tsx';
import { SignPixelText } from '../../地点/告示牌字.tsx';
import { cherryTreeBlocks } from '../../地点/樱花树.ts';
import { MoonBellLily } from '../../物品/月铃兰.tsx';
import { RealCanvas } from '../../现实/画布.tsx';
import { RealDesk } from '../../现实/课桌.tsx';
import { outline as defaultOutline, orthoTop } from '../../画风.ts';
import { palette } from '../../色板.ts';
import { signRows, biome } from './参数.ts';
import { splitScreenCount, SplitState, splitLayout, liYingScale, formShift, shapeOffsetAt, serverFraming, serverToneAt, realFraming, flowerScale } from './分屏参数.ts';
import { ForestDoorCanvas } from './林间门口.tsx';

/** 她这一页的样子：x 是脚底（人那排 y = 门口.站排y）；yaw 是身子朝哪（度，同 FigurePose：90 朝西、180 朝镜头、−90 朝东）；看 同 MagicalWineFoxEx；
 *  骨骼 盖在姿势表上（按骨骼整条替换），给拿花的胳膊另摆 */
export type HerPage = {
  stancePose: MagicalWineFoxExPose;
  x: number;
  yaw: number;
  看?: [number, number];
  skeleton?: Record<string, BonePose>;
  /** 手里的花在「正面朝镜头、立着」上再转（度）：偏 180 = 翻到背面（贴图左右镜像），倾 = 从镜头看逆时针歪 */
  花?: { yawOffset?: number; tilt?: number };
};

/** 花的正面朝镜头（镜头在南边）：手持物 朝向 的 偏 = 从她正前方往她左边转几度 */
const facingCameraOffset = (yaw: number) => ((((180 - yaw) % 360) + 540) % 360) - 180;

/** 蹲着把花往前下伸（右手，侧身朝东时是离镜头近的那只）：上臂往前抬 82°、往外撇 25°，前臂再抬 10°。手在胸口前下方、帽檐底下，
 *  花伸出她的轮廓、衬在树苗和草上（日历到一 那一拍树苗长成，以后衬在暗的树干上）（主会话 10-24 美术定稿「花举到剪影外」，手机上要认得出月铃兰）。
 *  试过往上举（上臂 100°～130°）：她蹲着时手就在脸边，花挡住脸、和帽檐粘成一团。Agent 暂定 */
export const crouchFlowerPose: Record<string, BonePose> = { RightArm: { rot: [-82, -25, 0] }, RightForeArm: { rot: [-10, 0, 0] } };

/** 两个姿势（分屏参数.ts 的 换姿帧们）：坐在门口望着路 → 蹲在树苗旁举着花（三稿原是五个，用户 10-24「画面转太快就删」后只留两个）。Agent 暂定。
 *  蹲：身子正侧面朝门（yaw −90，美术定稿「侧身朝门」，身上的贴图像素是正的），脚底在树干左边一格（身子不压在暗树干上）；
 *  头往镜头转 40°、抬 5°（正侧面时脸被头发挡住，五家看图评审都读成背对镜头的一团粉）；花翻到背面，贴图里在左边的那串白铃铛朝门（朝树苗），再歪 10°。
 *  望路朝西再往镜头转 30°（yaw 120），脸露出来：试过正侧面（yaw 90）加转头，脸露得少，头转到 45° 帽檐里面会翻出来。
 *  这两处不取 90° 整数倍是照主会话 10-24「角色朝向尽量取 90° 的整数倍，和手机上看清表情、动作冲突时看清优先」，Agent 提议、等主会话定 */
export const liYingPoses: readonly HerPage[] = [
  { stancePose: '坐', x: entrance.standPos.oneStepOutside, yaw: 120 },
  { stancePose: '蹲', x: entrance.saplingPos[0] - 1, yaw: -90, 看: [5, -40], skeleton: crouchFlowerPose, 花: { yawOffset: 180, tilt: 10 } },
];

/** 斜投影里往里一个贴图像素画面上升几个贴图像素（日历本排飞纸用） */
const oblique = orthoTop / splitScreenCount;
/** 一格几个页面像素 */
const cellsPerPage = (16 * splitScreenCount) / 2;

/** 接入那几帧服务器那块画布往左宽出 成形.横，门口的地（地点/门口小木屋.tsx 铺到 x −16）不够宽，第一帧左沿露出地的断面（核查 10-24）。
 *  往左照同样的铺法补几列：草 4 排，最前一排往下两层泥土、两层石头 */
const patchGround: readonly PlacedBlock[] = Array.from({ length: 4 }, (_, n) => -20 + n).flatMap((i) => [
  ...[0, 1, 2, 3].map((j): PlacedBlock => ({ state: 'minecraft:grass_block', 位: [i, j, -1] })),
  ...[-2, -3].map((k): PlacedBlock => ({ state: 'minecraft:dirt', 位: [i, 0, k] })),
  ...[-4, -5].map((k): PlacedBlock => ({ state: 'minecraft:stone', 位: [i, 0, k] })),
]);

/** 树苗那一格（树干那排，j = 1） */
const treeRoot = [entrance.saplingPos[0], 1, 0] as const;

const neutralGrade: Grade = { 饱和: 1, comparison: 1, multiply: '#ffffff', lift: '#000000', 暗角: 0, 颗粒: 0 };
const gradeOnly = (t: Grade): Grade => ({ ...t, 暗角: 0, 颗粒: 0 });

export type TimeLagSplitProps = {
  /** 歌曲帧（分镜 的时间轴） */
  frame: number;
  /** 描边开关（默认照 画风.ts），两屏一起管 */
  outline?: boolean;
  /** 整片后期开关（默认开） */
  withPost?: boolean;
  /** 核对的对照帧用：盖在她这一页的样子上（只给的字段换掉） */
  liYing?: Partial<HerPage>;
  /** 段 2-时差 用：开头两屏从右边滑进来（接第 12 句末的横移）。核对段不给，画面照旧 */
  joining?: boolean;
  /** 整页那层颗粒的种子（整片后期），段里给歌曲帧；不给 = 当前帧 */
  seed?: number;
  /** 盖在两屏和分屏线上面、整页质感里面的东西（符文歌词），页面坐标 1280×720 */
  overlay?: React.ReactNode;
  /** 光影的样式（段里传 默认.ts 的 光影段[段键]），只管服务器那半（门口，太阳照 参数.ts 的 白天光影场）；不给 = 不开 */
  shading?: ShadingOptions | null;
  /** 现实那半的光影；不给 = 不开 */
  realShading?: ShadingOptions | null;
};

export const TimeLagSplit: React.FC<TimeLagSplitProps> = ({ frame: frame, outline = defaultOutline.开, withPost = true, liYing: overrides, joining = false, seed: seed, overlay: overlay, shading, realShading }) => {
  const splitState = SplitState(frame);
  const offset = joining ? shapeOffsetAt(frame) : 0;
  const { serverWidth, realWidth, lineWidth, lineColor } = splitLayout;
  const height = aspect.height;
  const liYing = { ...liYingPoses[splitState.poseChangeCount]!, ...overrides };
  const pos: V3 = [liYing.x, entrance.standRowY, 0];
  const originalDisplay = DISPLAY.generated.thirdperson_righthand;
  const flowerInHand = {
    item: <MoonBellLily />,
    facing: { yawOffset: facingCameraOffset(liYing.yaw) + (liYing.花?.yawOffset ?? 0), tilt: liYing.花?.tilt ?? 0 },
    display: { ...originalDisplay, scale: (originalDisplay.scale ?? [1, 1, 1]).map((v) => v * flowerScale) },
  };
  const treeBlocks = useMemo(() => cherryTreeBlocks(splitState.doorGrown, treeRoot), [splitState.doorGrown]);
  // 放大 她倍 倍（绕脚底）；贴图像素对齐 只吸附脚底
  const wineFox = (
    <TexturePixelAlign 锚={pos}>
      <group position={pos} scale={liYingScale}>
        <group position={[-pos[0], -pos[1], -pos[2]]}>
          <MagicalWineFoxEx
            pose={{ ...standPose(pos), yaw: liYing.yaw }}
            stancePose={liYing.stancePose}
            看={liYing.看}
            blink={0}
            sec={frame / fps}
            rightHand={flowerInHand}
            skeleton={liYing.skeleton}
          />
        </group>
      </group>
    </TexturePixelAlign>
  );
  const serverTone = serverToneAt(frame);
  // 整页那层质感：两屏的暗角、颗粒取平均
  const finishGrade: Grade = {
    ...neutralGrade,
    暗角: (palette.现实.grade.暗角 + serverTone.grade.暗角) / 2,
    颗粒: (palette.现实.grade.颗粒 + serverTone.grade.颗粒) / 2,
  };
  const withGrade = (t: Grade, content: React.ReactNode) => (withPost ? <FilmPost grade={gradeOnly(t)}>{content}</FilmPost> : content);
  const serverCanvas = (width: number, framing: typeof serverFraming) =>
    withGrade(
      serverTone.grade,
      <ForestDoorCanvas
        width={width}
        height={height}
        framing={framing}
        outlineWidth={splitScreenCount}
        hasSign
        signText={<SignPixelText lines={signRows} />}
        arc={null}
        tone={serverTone}
        growth={splitState.growth}
        shading={shading}
      >
        <BlockAssembly blocks={treeBlocks} origin={gridOrigin} biome={biome} frontPlants />
        {offset ? <BlockAssembly blocks={patchGround} origin={gridOrigin} biome={biome} /> : null}
        {outline ? <OutlineGroup>{wineFox}</OutlineGroup> : wineFox}
      </ForestDoorCanvas>,
    );
  const pageView = (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      {offset ? (
        // 接入中：服务器那半画宽一截（多出来的在左边），整块跟着分屏线往右挪 偏；门的右边一直贴着分屏线
        <div style={{ position: 'absolute', left: 0, top: 0, width: serverWidth + offset, height: height, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: offset - formShift.horizontalPx, top: 0, width: serverWidth + formShift.horizontalPx, height: height }}>
            {serverCanvas(serverWidth + formShift.horizontalPx, { ...serverFraming, center: [serverFraming.center[0] - formShift.horizontalPx / cellsPerPage / 2, serverFraming.center[1]] })}
          </div>
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 0, top: 0, width: serverWidth, height: height, overflow: 'hidden' }}>
          {serverCanvas(serverWidth, serverFraming)}
        </div>
      )}
      <div style={{ position: 'absolute', left: serverWidth + offset, top: 0, width: realWidth, height: height, overflow: 'hidden' }}>
        {withGrade(
          palette.现实.grade,
          <RealCanvas width={realWidth} height={height} framing={realFraming} outline={outline} outlineWidth={splitScreenCount} shading={realShading}>
            <RealDesk calendar={splitState.calendar} flyPages={splitState.flyPages} oblique={oblique} />
          </RealCanvas>,
        )}
      </div>
      <div style={{ position: 'absolute', left: serverWidth + offset, top: 0, width: lineWidth, height: height, background: lineColor }} />
      {overlay}
    </div>
  );
  return withPost ? (
    <FilmPost grade={finishGrade} seed={seed}>
      {pageView}
    </FilmPost>
  ) : (
    pageView
  );
};
