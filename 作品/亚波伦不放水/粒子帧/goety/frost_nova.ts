// anim extract --particle-frames 生成，别手改：粒子 goety:frost_nova 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/frost_nova sha256 6739e741f212e798e60d706cf6f2c1b3bf620166ffad1fd111a9209a11ec5495
import { png, type Png } from '@engine/model/贴图.ts';
import frame0 from 'asset:贴图/法术/goety/particle/frost_1';
import frame1 from 'asset:贴图/法术/goety/particle/frost_2';
import frame2 from 'asset:贴图/法术/goety/particle/frost_3';
import frame3 from 'asset:贴图/法术/goety/particle/frost_4';
import frame4 from 'asset:贴图/法术/goety/particle/frost_5';
import frame5 from 'asset:贴图/法术/goety/particle/frost_6';

const animFrames: readonly Png[] = [frame0, frame1, frame2, frame3, frame4, frame5, frame4, frame3, frame2, frame1, frame0].map(png);
export default animFrames;
