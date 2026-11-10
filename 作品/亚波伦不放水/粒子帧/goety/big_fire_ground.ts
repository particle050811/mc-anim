// anim extract --粒子帧 生成，别手改：粒子 goety:big_fire_ground 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/big_fire_ground sha256 8a626b2f737f15498630bf23b5ae4767844514137c4281eb75cd0dd16ffcc86f
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/法术/goety/particle/big_fire_ground_1';
import 图1 from 'asset:贴图/法术/goety/particle/big_fire_ground_2';
import 图2 from 'asset:贴图/法术/goety/particle/big_fire_ground_3';
import 图3 from 'asset:贴图/法术/goety/particle/big_fire_ground_4';
import 图4 from 'asset:贴图/法术/goety/particle/big_fire_ground_5';
import 图5 from 'asset:贴图/法术/goety/particle/big_fire_ground_6';
import 图6 from 'asset:贴图/法术/goety/particle/big_fire_ground_7';
import 图7 from 'asset:贴图/法术/goety/particle/big_fire_ground_8';

const 帧: readonly Png[] = [图0, 图1, 图2, 图3, 图4, 图5, 图6, 图7].map(png);
export default 帧;
