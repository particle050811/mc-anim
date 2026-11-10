// anim extract --粒子帧 生成，别手改：粒子 goety:burning 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/burning sha256 288e0fac59dbaa4e4481620f15cd0691e2073993446ac24e58e0c157dd4617fc
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/法术/minecraft/particle/lava';

const 帧: readonly Png[] = [图0].map(png);
export default 帧;
