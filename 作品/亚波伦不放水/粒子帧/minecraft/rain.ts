// anim extract --粒子帧 生成，别手改：粒子 minecraft:rain 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/minecraft/particles/rain sha256 566be13cc85291327038a75b34764a0c36bf7530bbf754001feea3830bee7be8
import { png, type Png } from '@engine/model/贴图.ts';
import splash0Png from 'asset:贴图/特效/粒子/splash_0';
import splash1Png from 'asset:贴图/特效/粒子/splash_1';
import splash2Png from 'asset:贴图/特效/粒子/splash_2';
import splash3Png from 'asset:贴图/特效/粒子/splash_3';

const animFrames: readonly Png[] = [splash0Png, splash1Png, splash2Png, splash3Png].map(png);
export default animFrames;
