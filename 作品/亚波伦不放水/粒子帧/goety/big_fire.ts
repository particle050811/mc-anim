// anim extract --粒子帧 生成，别手改：粒子 goety:big_fire 的贴图帧，照粒子定义 textures 的顺序（同一张贴图出现几次就排几次）。
// 定义 数据/法术/goety/particles/big_fire sha256 8dcb7d467086bb2a2ba487e31b82e395bab8a7a3a42bd2b0fe3c8541d1c1ade5
import { png, type Png } from '@engine/model/贴图.ts';
import bigFire1Png from 'asset:贴图/法术/goety/particle/big_fire_1';
import bigFire2Png from 'asset:贴图/法术/goety/particle/big_fire_2';
import bigFire3Png from 'asset:贴图/法术/goety/particle/big_fire_3';
import bigFire4Png from 'asset:贴图/法术/goety/particle/big_fire_4';
import bigFire5Png from 'asset:贴图/法术/goety/particle/big_fire_5';
import bigFire6Png from 'asset:贴图/法术/goety/particle/big_fire_6';
import bigFire7Png from 'asset:贴图/法术/goety/particle/big_fire_7';
import bigFire8Png from 'asset:贴图/法术/goety/particle/big_fire_8';

const animFrames: readonly Png[] = [bigFire1Png, bigFire2Png, bigFire3Png, bigFire4Png, bigFire5Png, bigFire6Png, bigFire7Png, bigFire8Png].map(png);
export default animFrames;
