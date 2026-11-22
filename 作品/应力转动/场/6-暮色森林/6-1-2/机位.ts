// 6-1-2 斩娜迦的机位、光向和地形视图：娜迦参考模型.tsx 的画面和加载计划（段的 地形视图.ts）读同一份。纯模块，不碰 React。
import type * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { sunDirFromAngles } from '@engine/light/光照配比.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { twilightLandmark } from '../../../地点/暮色新世界/摆放.ts';
import { twilightViewParts } from '../../../地点/暮色新世界/地形世界.ts';
import { placeFlightCamera } from '../../../地点/飞行机位.ts';
import * as choreo from './编排.ts';
import * as motion from './动作改进.ts';
import { onTick } from '../时刻.ts';

export const courtyardOrigin = twilightLandmark('娜迦庭院').origin;
export const courtyardToWorld = (p: number[]) => [p[0] + courtyardOrigin[0], p[1] + courtyardOrigin[1], p[2] + courtyardOrigin[2]];

// 庭院的光（用户 10-13 定）：东偏北 70°、仰角 28°、灯 0.75 倍（相当于光倍 1.5）。原来一镜到底的黄昏光（200°/14°）在庭院里太低，整片地面落在树影里，又平又蓝。
// 依据写实关键帧（正篇/…/2-斩娜迦/关键帧/0、60）；仰角再高或强度照旧时第 159 帧墙角整片受光、没了黄昏感。
// 只管 6-1-2：一镜到底往东飞那几程照旧用 200°（见 lib/光照配比.ts）。6-1-1 的暮色那半段也用这一道。
export const courtyardLightDir = sunDirFromAngles(70, 28);
export const courtyardLightGain = 0.75;
// 迷宫镜头（S3 起，九胡被传送进树篱迷宫）的光：70°/28° 时太阳在镜头背后，顺光把她晒成粉橙、脸发白。用 --props='{"mazeLight":"…"}' 切换，对比帧在 预览/1013-纯渲染光影材质与动作/收尾/：
// 庭院（70°/28°、0.75 倍）过曝；压暗（灯 0.5 倍）仍平、发粉；
// 侧光（东偏南 115°、仰角 28°，从左后方斜照）肤色本色、有暖光斑，和庭院收刀的 70° 只差 45°，硬切不跳；
// 侧逆光（南偏西 215°、仰角 18° 等多档）被两三层树篱挡住，整个迷宫又暗又蓝；100°/28° 被正面晒粉，130°/28° 暖光斑太少；
// 一镜（默认）：一镜到底的黄昏光（200°/14°、1 倍，同 6-1-3 起飞），也整片在阴影里。
// 用户 10-13 定：本镜头最后一帧就是 6-1-3 第一帧，光必须和 6-1-3 接上，按改动量最小统一成 6-1-3 的光；代价是迷宫这镜偏暗偏蓝，庭院收刀（70°）切过来光向会变。侧光那档留着备用
export type MazeLightPreset = '庭院' | '压暗' | '侧光' | '侧逆光' | '一镜';
const mazeLightPresets: Record<MazeLightPreset, { dir: V3; intensity: number; remap: boolean }> = {
  庭院: { dir: sunDirFromAngles(70, 28), intensity: 0.75, remap: true },
  压暗: { dir: sunDirFromAngles(70, 28), intensity: 0.5, remap: true },
  侧光: { dir: sunDirFromAngles(115, 28), intensity: 0.75, remap: true },
  侧逆光: { dir: sunDirFromAngles(215, 18), intensity: 0.75, remap: true },
  一镜: { dir: sunDirFromAngles(200, 14), intensity: 1, remap: false },
};
const defaultMazeLight: MazeLightPreset = '一镜';

// 动作改进的开关（见 动作改进.ts）。全不给就是原版（6-1-2-斩娜迦-旧动作）；正式的 6-1-2-斩娜迦 给 动作改进.ts 的 `official`。
// 动作改进：李樱换成错开起止、急停弹簧、呼吸微动的那一版；打击停顿：斩中时整个画面定格多久（秒；0 = 不停，总长跟着加这么久）；
// 新机位：迅冲、俯拍斩击拉近，收刀换成参考的近景低机位（动作改进.ts 的 `cameraV2`）；
// 收刀修前：不加收刀约束（修穿模以前的样子，核对用）；跟拍：机位跟着李樱（全身 / 腰间特写），只用来新旧对比、核对穿模
export type NagaShotProps = { mazeLight?: MazeLightPreset; motionImproved?: boolean; hitStopSec?: number; newCams?: boolean; preSheathFix?: boolean; followMode?: '全身' | '腰' };
export type CamPose = { lens: number; pos: number[]; tgt: number[] };
const followCamPose = (t: number, mode: '全身' | '腰'): CamPose => {
  const [x, y, z] = choreo.liyingLoc(t);
  return mode === '全身'
    ? { lens: 35, pos: [x + 3.6, y + 2.4, z + 0.5], tgt: [x, y, z + 0.95] }
    : { lens: 40, pos: [x + 3.3, y + 2.2, z + 1.0], tgt: [x, y, z + 0.8] };
};
// 段内秒 → 剧情时间和这一刻的机位。伤害数字层也调它，和画面同帧同机位。
// 编排里的时间轴是剧情时间（助跑中途跳过了一段，见 编排.ts 的 `story`）；打击停顿在剧情时间上再停住一会儿。
// 剧情时间落到刻上（../时刻.ts）：跳过、停顿都是整格，算出来本来就在刻上，只消掉加减带的浮点零头，切镜、断开这些正好落在帧上的判断才和旧的一致
export const nagaShotCam = ({ hitStopSec = 0, newCams = false, followMode: followMode }: NagaShotProps, sec: number) => {
  const storyTime = onTick(motion.hitStopTimes(hitStopSec)(choreo.storyOfSeg(sec)));
  const cam: CamPose = followMode ? followCamPose(storyTime, followMode) : newCams ? motion.cameraV2(storyTime) : choreo.camera(storyTime);
  return { t: storyTime, cam: cam };
};
// 光：庭院几个镜头 70°/28°；迷宫镜头（S3 起）按 迷宫光 换（见上面）
export const nagaLight = (props: NagaShotProps, storyTime: number) => {
  const mazePreset = storyTime >= choreo.S3 ? mazeLightPresets[props.mazeLight ?? defaultMazeLight] : null;
  return { mazePreset, dir: mazePreset ? mazePreset.dir : courtyardLightDir, gain: mazePreset ? mazePreset.intensity : courtyardLightGain };
};
// 焦距按 36mm 横向画幅换算（placeFlightCamera），近远裁面 0.1、1200 米
export const placeNagaCamera = (camera: THREE.PerspectiveCamera, k: CamPose, aspect: number) => {
  const pos = courtyardToWorld(k.pos);
  placeFlightCamera(camera, { lens: k.lens, pos, tgt: courtyardToWorld(k.tgt) }, aspect, 0.1, 1200);
  return pos;
};

/** 段内第 sec 秒的地形视图：庭院的暮色地形，不开超远景，投影光向同主光 */
export const nagaTerrainView = (props: NagaShotProps, sec: number): TerrainCanvasView[] => {
  const { t, cam } = nagaShotCam(props, sec);
  return [{ canvas: '6-1-2', place: (camera, aspect) => placeNagaCamera(camera, cam, aspect), ...twilightViewParts({ shadowLightDir: nagaLight(props, t).dir }) }];
};
