// anim extract --粒子帧 生成，别手改：粒子 goety:fiery_pillar 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/fiery_pillar sha256 b52468f075b927c4f89b67ac7b3b81f38ed7ce4c3cafd49c0bd5288c8d7e5c8f
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/法术/goety/particle/big_fire_drop_1';
import 图1 from 'asset:贴图/法术/goety/particle/big_fire_drop_2';
import 图2 from 'asset:贴图/法术/goety/particle/big_fire_drop_3';
import 图3 from 'asset:贴图/法术/goety/particle/big_fire_drop_4';
import 图4 from 'asset:贴图/法术/goety/particle/big_fire_drop_5';
import 图5 from 'asset:贴图/法术/goety/particle/big_fire_drop_6';
import 图6 from 'asset:贴图/法术/goety/particle/big_fire_drop_7';
import 图7 from 'asset:贴图/法术/goety/particle/big_fire_drop_8';

const 帧: readonly Png[] = [图0, 图1, 图2, 图3, 图4, 图5, 图6, 图7].map(png);
export default 帧;
