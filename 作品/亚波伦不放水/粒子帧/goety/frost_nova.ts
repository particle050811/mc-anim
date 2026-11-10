// anim extract --粒子帧 生成，别手改：粒子 goety:frost_nova 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/frost_nova sha256 6739e741f212e798e60d706cf6f2c1b3bf620166ffad1fd111a9209a11ec5495
import { png, type Png } from '@engine/model/贴图.ts';
import 图0 from 'asset:贴图/法术/goety/particle/frost_1';
import 图1 from 'asset:贴图/法术/goety/particle/frost_2';
import 图2 from 'asset:贴图/法术/goety/particle/frost_3';
import 图3 from 'asset:贴图/法术/goety/particle/frost_4';
import 图4 from 'asset:贴图/法术/goety/particle/frost_5';
import 图5 from 'asset:贴图/法术/goety/particle/frost_6';

const 帧: readonly Png[] = [图0, 图1, 图2, 图3, 图4, 图5, 图4, 图3, 图2, 图1, 图0].map(png);
export default 帧;
