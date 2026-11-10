// anim extract --粒子帧 生成，别手改：粒子 goety:big_fire 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/big_fire sha256 8dcb7d467086bb2a2ba487e31b82e395bab8a7a3a42bd2b0fe3c8541d1c1ade5
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/法术/goety/particle/big_fire_1';
import 图1 from 'asset:贴图/法术/goety/particle/big_fire_2';
import 图2 from 'asset:贴图/法术/goety/particle/big_fire_3';
import 图3 from 'asset:贴图/法术/goety/particle/big_fire_4';
import 图4 from 'asset:贴图/法术/goety/particle/big_fire_5';
import 图5 from 'asset:贴图/法术/goety/particle/big_fire_6';
import 图6 from 'asset:贴图/法术/goety/particle/big_fire_7';
import 图7 from 'asset:贴图/法术/goety/particle/big_fire_8';

const 帧: readonly Png[] = [图0, 图1, 图2, 图3, 图4, 图5, 图6, 图7].map(png);
export default 帧;
