// anim extract --particle-frames 生成，别手改：粒子 goety:big_fire 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/big_fire sha256 8dcb7d467086bb2a2ba487e31b82e395bab8a7a3a42bd2b0fe3c8541d1c1ade5
import { png, type Png } from '@engine/model/贴图.ts';
import frame0 from 'asset:贴图/法术/goety/particle/big_fire_1';
import frame1 from 'asset:贴图/法术/goety/particle/big_fire_2';
import frame2 from 'asset:贴图/法术/goety/particle/big_fire_3';
import frame3 from 'asset:贴图/法术/goety/particle/big_fire_4';
import frame4 from 'asset:贴图/法术/goety/particle/big_fire_5';
import frame5 from 'asset:贴图/法术/goety/particle/big_fire_6';
import frame6 from 'asset:贴图/法术/goety/particle/big_fire_7';
import frame7 from 'asset:贴图/法术/goety/particle/big_fire_8';

const animFrames: readonly Png[] = [frame0, frame1, frame2, frame3, frame4, frame5, frame6, frame7].map(png);
export default animFrames;
