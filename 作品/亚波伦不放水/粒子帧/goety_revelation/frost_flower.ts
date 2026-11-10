// anim extract --粒子帧 生成，别手改：粒子 goety_revelation:frost_flower 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety_revelation/particles/frost_flower sha256 40da6e690115a66fab5e9aa0ace19f373fe32d213ea2e6dc7a82b9e9cd3ea4fe
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/特效/粒子/generic_7';
import 图1 from 'asset:贴图/特效/粒子/generic_6';
import 图2 from 'asset:贴图/特效/粒子/generic_5';
import 图3 from 'asset:贴图/特效/粒子/generic_4';
import 图4 from 'asset:贴图/特效/粒子/generic_3';
import 图5 from 'asset:贴图/特效/粒子/generic_2';
import 图6 from 'asset:贴图/特效/粒子/generic_1';
import 图7 from 'asset:贴图/特效/粒子/generic_0';

const 帧: readonly Png[] = [图0, 图1, 图2, 图3, 图4, 图5, 图6, 图7].map(png);
export default 帧;
