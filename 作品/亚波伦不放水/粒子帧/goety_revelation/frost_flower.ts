// anim extract --粒子帧 生成，别手改：粒子 goety_revelation:frost_flower 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety_revelation/particles/frost_flower sha256 40da6e690115a66fab5e9aa0ace19f373fe32d213ea2e6dc7a82b9e9cd3ea4fe
import { png, type Png } from '@engine/model/贴图.ts';
import frame0 from 'asset:贴图/特效/粒子/generic_7';
import frame1 from 'asset:贴图/特效/粒子/generic_6';
import frame2 from 'asset:贴图/特效/粒子/generic_5';
import frame3 from 'asset:贴图/特效/粒子/generic_4';
import frame4 from 'asset:贴图/特效/粒子/generic_3';
import frame5 from 'asset:贴图/特效/粒子/generic_2';
import frame6 from 'asset:贴图/特效/粒子/generic_1';
import frame7 from 'asset:贴图/特效/粒子/generic_0';

const animFrames: readonly Png[] = [frame0, frame1, frame2, frame3, frame4, frame5, frame6, frame7].map(png);
export default animFrames;
